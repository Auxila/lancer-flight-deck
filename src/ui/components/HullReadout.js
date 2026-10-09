import { STATUS } from "../../constants.js";
import { conditionLine } from "../../core/ConditionInfo.js";
import { NPC_TIER_ATTACK, missChance } from "../../core/Odds.js";

/** Stunned (and Shut Down, which stuns) caps Evasion at 5. */
const STUNNED_EVASION = 5;

/**
 * The stat strip, in the book's order. `skill` is where the core rules add to the frame's number: a mech
 * skill (Speed takes half Agility, rounded down) or the pilot's Grit. `conditions` are the ones that
 * change what the stat means in play, shown on its card while they're on the mech.
 */
export const STATS = [
  { id: "evasion", label: "LFD.Stat.Evasion", skill: "agi", conditions: [STATUS.STUNNED, STATUS.SHUT_DOWN, STATUS.PRONE, STATUS.LOCK_ON, STATUS.INVISIBLE, STATUS.HIDDEN] },
  { id: "edef", label: "LFD.Stat.EDef", skill: "sys", conditions: [STATUS.SHUT_DOWN, STATUS.PRONE, STATUS.LOCK_ON, STATUS.INVISIBLE, STATUS.HIDDEN] },
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

/**
 * How often Evasion (or E-Defense, against tech attacks) turns away a typical NPC's attack at each tier (see
 * NPC_TIER_ATTACK): in the open, and for Evasion behind soft and hard cover (ranged attacks only). `now` is
 * what the conditions on the mech make of the open row: odds, a reason it can't be attacked at all, or null
 * when nothing on it changes them. `perPoint`: one more point turns away 5% more at every tier. `need`: what a
 * Tier 1 attack in the open must roll on the d20, the card's worked example. Null for the other stats.
 * @returns {{rows: {id: string, odds: number[]}[], now: {odds?: number[], blocked?: string}|null, perPoint: boolean, need: number}|null}
 */
export function defenseOdds(t, stat) {
  const evasion = stat.id === "evasion";
  if (!evasion && stat.id !== "edef") return null;
  const defense = Number(t.stats?.[stat.id]);
  if (!Number.isFinite(defense)) return null;
  const has = id => !!t.flags?.[id];
  const tiers = (d, mods) => NPC_TIER_ATTACK.map(bonus => missChance(d, bonus, mods));
  const rows = [{ id: evasion ? "open" : "tech", odds: tiers(defense) }];
  if (evasion) rows.push({ id: "soft", odds: tiers(defense, { accuracy: -1 }) }, { id: "hard", odds: tiers(defense, { accuracy: -2 }) });
  let now = null;
  if (has(STATUS.HIDDEN)) now = { blocked: "hidden" };
  else if (!evasion && has(STATUS.SHUT_DOWN)) now = { blocked: "shutdown" };
  else {
    // Prone gives every attack +1 Accuracy, Lock On the next one
    const accuracy = (has(STATUS.PRONE) ? 1 : 0) + (has(STATUS.LOCK_ON) ? 1 : 0);
    const invisible = has(STATUS.INVISIBLE);
    const stunned = evasion && (has(STATUS.STUNNED) || has(STATUS.SHUT_DOWN)) && defense > STUNNED_EVASION;
    if (accuracy || invisible || stunned) now = { odds: tiers(stunned ? STUNNED_EVASION : defense, { accuracy, invisible }) };
  }
  const perPoint = NPC_TIER_ATTACK.every(bonus => Math.abs(missChance(defense + 1, bonus) - missChance(defense, bonus) - 0.05) < 1e-9);
  return { rows, now, perPoint, need: defense - NPC_TIER_ATTACK[0] };
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
      return { id: stat.id, key: stat.label, value, tip: statCard(t, stat, value), aria: statAria(t, stat, value) };
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
  const allowance = t.actions?.allowance ?? t.stats.speed;
  if (stat.id === "speed" && t.actions && (t.actions.move < allowance || allowance > t.stats.speed)) {
    const key = allowance > t.stats.speed ? "LFD.StatInfo.MoveLeftBoost" : "LFD.StatInfo.MoveLeft";
    parts.push(`<p class="lfd-tip-note">${esc(i18n.format(key, { n: t.actions.move, allowance }))}</p>`);
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
  const odds = defenseOdds(t, stat);
  if (odds) parts.push(oddsTable(stat, odds));
  const active = stat.conditions.filter(id => t.flags?.[id]).map(conditionLine).filter(Boolean);
  if (active.length) parts.push(`<p class="lfd-tip-ends">${esc(i18n.localize("LFD.StatInfo.Now"))}</p>`, ...active);
  return `<div class="lfd-tip lfd-tip-stat">${parts.join("")}</div>`;
}

/** The odds as a table: tiers across, open ground (or tech attacks), cover and now down. */
function oddsTable(stat, { rows, now, perPoint, need }) {
  const i18n = game.i18n;
  const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
  const label = key => esc(i18n.localize(`LFD.StatInfo.Odds.${key}`));
  const cells = odds => odds.map(p => `<td>${pct(p)}</td>`).join("");
  const head = NPC_TIER_ATTACK.map((_, i) => `<th scope="col">${esc(i18n.format("LFD.StatInfo.Odds.Tier", { n: i + 1 }))}</th>`).join("");
  const body = rows.map(row => `<tr><th scope="row">${label(row.id)}</th>${cells(row.odds)}</tr>`);
  if (now?.odds) body.push(`<tr class="is-now"><th scope="row">${label("now")}</th>${cells(now.odds)}</tr>`);
  else if (now?.blocked) body.push(`<tr class="is-now"><th scope="row">${label("now")}</th><td colspan="${NPC_TIER_ATTACK.length}">${label(`blocked.${now.blocked}`)}</td></tr>`);
  // The worked example, in the dice players know: what a Tier 1 attack needs, and both sides of it
  const miss = rows[0].odds[0];
  const example = need <= 1 ? "always" : need > 20 ? "never" : "roll";
  const anchor = i18n.format(`LFD.StatInfo.Odds.Example.${example}`, {
    attack: i18n.localize(`LFD.StatInfo.Odds.Example.${stat.id}`),
    need,
    hit: pct(1 - miss),
    miss: pct(miss),
  });
  const notes = [i18n.format(`LFD.StatInfo.Odds.Note.${stat.id}`, { bonuses: NPC_TIER_ATTACK.map(b => `+${b}`).join(", ") })];
  if (perPoint) notes.push(i18n.format("LFD.StatInfo.Odds.PerPoint", { stat: i18n.localize(`LFD.StatInfo.${stat.id}.Name`) }));
  return (
    `<table class="lfd-tip-odds"><caption>${label(`Title.${stat.id}`)}</caption><thead><tr><td></td>${head}</tr></thead>` +
    `<tbody>${body.join("")}</tbody></table><p class="lfd-tip-odds-example">${esc(anchor)}</p><p class="lfd-tip-aside">${esc(notes.join(" "))}</p>`
  );
}

/** The same, in a sentence, for screen readers. */
function statAria(t, stat, value) {
  const i18n = game.i18n;
  const text = new DOMParser().parseFromString(i18n.localize(`LFD.StatInfo.${stat.id}.Text`), "text/html").body.textContent;
  const odds = defenseOdds(t, stat);
  const avoids = odds
    ? ` ${i18n.format("LFD.StatInfo.Odds.Aria", { title: i18n.localize(`LFD.StatInfo.Odds.Title.${stat.id}`), odds: odds.rows[0].odds.map((p, i) => `${i18n.format("LFD.StatInfo.Odds.Tier", { n: i + 1 })} ${pct(p)}`).join(", ") })}`
    : "";
  return `${i18n.localize(`LFD.StatInfo.${stat.id}.Name`)} ${value}. ${text}${avoids}`;
}

/**
 * A chance as a whole percentage, halves rounding up. One Accuracy or Difficulty die makes many exact halves
 * (57.5%), so the float noise is settled first: it would otherwise round them either way.
 */
export function pct(p) {
  return `${Math.round(Math.round(p * 1e6) / 1e4)}%`;
}

function clampPct(n) {
  return Math.round(Math.min(100, Math.max(0, n)) * 10) / 10;
}
