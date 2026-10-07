import { STATUS } from "../../constants.js";
import { conditionLine } from "../../core/ConditionInfo.js";

/**
 * The stat strip, in the book's order. `skill` is where the core rules add to the frame's number: a mech
 * skill (Speed takes half Agility, rounded down) or the pilot's Grit. `conditions` are the ones that
 * change what the stat means in play, shown on its card while they're on the mech.
 */
export const STATS = [
  { id: "evasion", label: "LFD.Stat.Evasion", skill: "agi", conditions: [STATUS.STUNNED, STATUS.SHUT_DOWN, STATUS.PRONE, STATUS.LOCK_ON, STATUS.INVISIBLE, STATUS.HIDDEN] },
  { id: "edef", label: "LFD.Stat.EDef", skill: "sys", conditions: [STATUS.SHUT_DOWN, STATUS.LOCK_ON] },
  { id: "speed", label: "LFD.Stat.Speed", skill: "agi", half: true, conditions: [STATUS.IMMOBILIZED, STATUS.SLOWED, STATUS.PRONE, STATUS.ENGAGED, STATUS.STUNNED, STATUS.SHUT_DOWN] },
  { id: "sensors", label: "LFD.Stat.Sensors", skill: null, conditions: [] },
  { id: "save", label: "LFD.Stat.Save", skill: "grit", conditions: [STATUS.IMPAIRED, STATUS.STUNNED, STATUS.SHUT_DOWN] },
  { id: "tech", label: "LFD.Stat.Tech", skill: "sys", signed: true, conditions: [STATUS.JAMMED, STATUS.IMPAIRED] },
];

/**
 * Where a stat's number comes from: the frame, the rule's skill, and whatever else is left (talents,
 * systems, core bonuses, effects), so the parts always add up to what LANCER shows. Null without frame data.
 * @returns {{frame: number, skill: {id: string, value: number}|null, other: number}|null}
 */
export function statBreakdown(t, stat) {
  const frame = t.statBase?.[stat.id];
  if (frame === undefined || frame === null) return null;
  let skill = null;
  if (stat.skill) {
    const raw = stat.skill === "grit" ? (t.grit ?? 0) : (t.checks?.[stat.skill] ?? 0);
    skill = { id: stat.skill, value: stat.half ? Math.floor(raw / 2) : raw };
  }
  const other = t.stats[stat.id] - frame - (skill?.value ?? 0);
  return { frame, skill, other };
}

/** HP, overshield, armor and the defensive stat strip. */
export function buildHull(t, { editable = false } = {}) {
  const { value, max } = t.hp;
  const pct = max > 0 ? clampPct((value / max) * 100) : 0;
  const osPct = max > 0 ? clampPct((t.overshield / max) * 100) : 0;
  const signed = n => (n >= 0 ? `+${n}` : `${n}`);
  return {
    hp: { value, max, pct, low: max > 0 && value * 4 <= max, negative: value < 0 },
    editable,
    overshield: t.overshield,
    osPct,
    armor: t.armor,
    burn: t.burn,
    stats: STATS.map(stat => {
      const value = stat.signed ? signed(t.stats[stat.id]) : t.stats[stat.id];
      return { id: stat.id, key: stat.label, value, tip: statCard(t, stat, value), aria: statAria(stat, value) };
    }),
    checks: CHECKS.map(({ id, key }) => {
      const bonus = t.checks?.[id] ?? 0;
      return { id, key, bonus: signed(bonus), formula: `1d20${bonus ? signed(bonus) : ""}` };
    }),
  };
}

/** LANCER's four mech checks, in the book's HASE order. `id` is the system field (system.hull...). */
export const CHECKS = [
  { id: "hull", key: "Hull" },
  { id: "agi", key: "Agility" },
  { id: "sys", key: "Systems" },
  { id: "eng", key: "Engineering" },
];

/**
 * A stat's hover card: what it is, what it does in play, how its number is made up, and anything on the mech
 * right now that changes it.
 */
function statCard(t, stat, value) {
  const i18n = game.i18n;
  const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
  const base = `LFD.StatInfo.${stat.id}`;
  const parts = [`<header><strong>${esc(i18n.localize(`${base}.Name`))}</strong><span>${esc(value)}</span></header>`];
  parts.push(`<p>${i18n.localize(`${base}.Text`)}</p>`);
  // Speed in a turn: what's left of the standard move
  if (stat.id === "speed" && t.actions && t.actions.move < t.stats.speed) {
    parts.push(`<p class="lfd-tip-note">${esc(i18n.format("LFD.StatInfo.MoveLeft", { n: t.actions.move, speed: t.stats.speed }))}</p>`);
  }
  const b = statBreakdown(t, stat);
  if (b) {
    const signed = n => (n >= 0 ? `+${n}` : `${n}`);
    const terms = [i18n.format("LFD.StatInfo.Frame", { n: b.frame })];
    if (b.skill?.value) terms.push(`${esc(i18n.localize(`LFD.StatInfo.From.${b.skill.id}${stat.half ? "Half" : ""}`))} ${signed(b.skill.value)}`);
    if (b.other) terms.push(`${esc(i18n.localize("LFD.StatInfo.From.other"))} ${signed(b.other)}`);
    // Nothing added to the frame's number: say so rather than leave a lone "Frame 10"
    const calc = terms.length > 1 ? terms.join(" · ") : esc(i18n.localize("LFD.StatInfo.FrameOnly"));
    parts.push(`<p class="lfd-tip-calc">${calc}</p>`);
  }
  const active = stat.conditions.filter(id => t.flags?.[id]).map(conditionLine).filter(Boolean);
  if (active.length) parts.push(`<p class="lfd-tip-ends">${esc(i18n.localize("LFD.StatInfo.Now"))}</p>`, ...active);
  return `<div class="lfd-tip lfd-tip-stat">${parts.join("")}</div>`;
}

/** The same, in a sentence, for screen readers. */
function statAria(stat, value) {
  const i18n = game.i18n;
  const text = new DOMParser().parseFromString(i18n.localize(`LFD.StatInfo.${stat.id}.Text`), "text/html").body.textContent;
  return `${i18n.localize(`LFD.StatInfo.${stat.id}.Name`)} ${value}. ${text}`;
}

function clampPct(n) {
  return Math.round(Math.min(100, Math.max(0, n)) * 10) / 10;
}
