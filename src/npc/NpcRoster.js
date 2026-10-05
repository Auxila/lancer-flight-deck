import { conditionCard } from "../core/ConditionInfo.js";
import { STATUS } from "../constants.js";

/**
 * The NPC Deck's data: which NPCs are in play, and a compact, JSON-safe view of each.
 *
 * Field paths come from the LANCER 3.1 models: models/actors/npc.ts (+ shared templates),
 * models/items/npc_feature.ts (tier-indexed accuracy / attack_bonus / damage), and the
 * combatant model (activations: LANCER's popcorn initiative).
 */

/** Feature groups, in the order a GM reaches for them. */
export const FEATURE_ORDER = ["Weapon", "Tech", "System", "Reaction", "Trait"];
export const FEATURE_ICONS = {
  Weapon: "cci cci-weapon",
  Tech: "cci cci-tech-quick",
  System: "cci cci-system",
  Reaction: "cci cci-reaction",
  Trait: "cci cci-trait",
};

/** Conditions a GM toggles on NPCs most, in annunciator order. */
export const QUICK_CONDITIONS = [
  STATUS.LOCK_ON,
  STATUS.JAMMED,
  STATUS.IMPAIRED,
  STATUS.SLOWED,
  STATUS.IMMOBILIZED,
  STATUS.STUNNED,
  STATUS.EXPOSED,
  STATUS.SHREDDED,
  STATUS.PRONE,
  STATUS.HIDDEN,
];

const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** Is this an NPC the deck should list? (LANCER "npc" actors; deployables are left out.) */
export const isNpc = actor => actor?.type === "npc";

/** The scene the GM is looking at; without a canvas ("Disable game canvas") it's still known. */
export const viewedScene = () => canvas?.scene ?? game.scenes?.viewed ?? null;

/**
 * NPC tokens in play: the started combat's NPC combatants in turn order, else every NPC token
 * on the scene (hostiles first, then by name).
 * @returns {{tokens: TokenDocument[], combat: Combat|null}}
 */
export function rosterTokens() {
  const combat = game.combat?.started && (!game.combat.scene || game.combat.scene === viewedScene()) ? game.combat : null;
  if (combat) {
    const seen = new Set();
    const tokens = [];
    for (const c of combat.turns) {
      const token = c.token;
      if (!token || !isNpc(c.actor) || seen.has(token.id)) continue;
      seen.add(token.id);
      tokens.push(token);
    }
    return { tokens, combat };
  }
  const tokens = (viewedScene()?.tokens?.contents ?? []).filter(t => isNpc(t.actor));
  tokens.sort((a, b) => (a.disposition === b.disposition ? a.name.localeCompare(b.name) : a.disposition - b.disposition));
  return { tokens, combat: null };
}

function track(bar) {
  const value = num(bar?.value);
  const max = num(bar?.max);
  return { value, max, pct: max > 0 ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0 };
}

function pips(bar) {
  const t = track(bar);
  return t.max > 1 ? Array.from({ length: t.max }, (_, i) => ({ on: i < t.value })) : null;
}

/** Status ids on the actor, with their names and icons from the world's status config. */
function conditions(actor) {
  const out = [];
  for (const id of actor.statuses ?? []) {
    const cfg = CONFIG.statusEffects.find(s => s.id === id);
    if (!cfg) continue;
    const label = game.i18n.localize(cfg.name ?? cfg.label ?? id);
    out.push({ id, label, img: cfg.img ?? cfg.icon ?? null, lockon: id === STATUS.LOCK_ON, tip: conditionCard(id, { title: label }) });
  }
  return out;
}

/**
 * One NPC as a row.
 * @param {TokenDocument} token
 * @param {{combat: Combat|null, expanded: string|null}} ctx
 */
export function readRow(token, { combat, expanded }) {
  const actor = token.actor;
  const s = actor.system ?? {};
  const combatant = combat?.combatants.find(c => c.tokenId === token.id) ?? null;
  const hp = track(s.hp);
  const heat = track(s.heat);
  const structure = track(s.structure);
  const destroyed = !!s.destroyed || (structure.max > 0 && structure.value <= 0) || !!combatant?.isDefeated;
  const placeable = token.object;
  const targetedBy = game.users
    .filter(u => u.active && placeable && u.targets.has(placeable))
    .map(u => ({ name: u.name, color: u.color?.css ?? String(u.color ?? "#fff") }));
  const templates = actor.items.filter(i => i.type === "npc_template").map(i => i.name);
  const npcClass = actor.items.find(i => i.type === "npc_class")?.name ?? null;
  const act = combatant?.activations;
  const conds = conditions(actor);
  return {
    id: token.id,
    name: token.name,
    img: token.texture?.src ?? actor.img,
    tier: num(s.tier) || 1,
    npcClass,
    templates,
    disposition: token.disposition,
    hp: { ...hp, level: hp.pct > 50 ? "ok" : hp.pct > 25 ? "caution" : "warning" },
    heat: heat.max > 0 ? { ...heat, danger: heat.value * 2 >= heat.max } : null,
    structure: pips(s.structure),
    stress: pips(s.stress),
    conditions: conds,
    burn: num(s.burn),
    overshield: num(s.overshield?.value),
    hasChips: conds.length > 0 || num(s.burn) > 0 || num(s.overshield?.value) > 0,
    destroyed,
    activations: act && num(act.max) > 0 ? Array.from({ length: num(act.max) }, (_, i) => ({ on: i < num(act.value) })) : null,
    canAct: !!combatant && num(act?.value) > 0 && !destroyed,
    // In a started combat, out of activations and not acting now: done for the round
    acted: !!combatant && !!combat?.started && num(act?.value) <= 0 && combat?.combatant?.id !== combatant.id,
    isTurn: !!combatant && combat?.combatant?.id === combatant.id,
    combatantId: combatant?.id ?? null,
    targetedBy,
    targetedNames: targetedBy.map(u => u.name).join(", "),
    controlled: !!placeable?.controlled,
    expanded: expanded === token.id,
  };
}

/* -------------------------------------------- */
/*  Portraits                                   */
/* -------------------------------------------- */

/** Placeholder art: Foundry's built-in icons and LANCER's default actor/token icons. */
const GENERIC_ART = /(^|\/)(icons\/svg\/|systems\/lancer\/assets\/icons\/)|mystery-man/i;
const VIDEO_EXT = /\.(webm|mp4|m4v|ogv|ogg)(\?.*)?$/i;

export const isGenericArt = src => !src || GENERIC_ART.test(src);
export const isVideoArt = src => !!src && VIDEO_EXT.test(src);

/**
 * The image that shows who a combatant is: the mech or NPC as it stands on the map.
 *
 * Same order as Foundry's own combat tracker, with three refinements:
 *  1. an image the GM set on the combatant wins;
 *  2. the token's art (its dynamic-ring subject if it has one), then the prototype token's,
 *     then the actor's portrait; wildcard paths (random token art) are skipped;
 *  3. placeholder icons lose to any real art further down the list (an imported mech often
 *     keeps LANCER's default token icon while its actor has the portrait).
 * Video art comes back flagged; the deck swaps in a still frame from it.
 * @param {Combatant} c
 * @returns {{src: string, video: boolean, generic: boolean}}
 */
export function portraitOf(c) {
  const custom = c._source?.img;
  if (custom) return { src: custom, video: isVideoArt(custom), generic: isGenericArt(custom) };
  const token = c.token;
  const candidates = [
    token?.ring?.enabled ? token.ring.subject?.texture : null,
    token?.texture?.src,
    c.actor?.prototypeToken?.texture?.src,
    c.actor?.img,
  ].filter(src => src && !src.includes("*"));
  const real = candidates.find(src => !isGenericArt(src));
  if (real) return { src: real, video: isVideoArt(real), generic: false };
  return { src: candidates[0] ?? "icons/svg/mystery-man.svg", video: false, generic: true };
}

/* -------------------------------------------- */
/*  Initiative                                  */
/* -------------------------------------------- */

/**
 * Everyone in the combat, players and NPCs, for the initiative strip: who's acting, who
 * still has activations this round (LANCER's popcorn initiative), and who's done. Within each
 * group, players come before NPCs and otherwise the combat's turn order holds.
 * @param {Combat|null} combat  A started combat
 */
export function readInitiative(combat) {
  if (!combat?.started) return null;
  const current = combat.combatant?.id ?? null;
  const entries = combat.turns.map((c, order) => {
    const act = c.activations ?? {};
    const max = Math.max(0, num(act.max));
    const value = Math.max(0, Math.min(max || 99, num(act.value)));
    const isPlayer = !!c.hasPlayerOwner || c.actor?.type === "mech" || c.actor?.type === "pilot";
    const state = c.id === current ? "acting" : c.isDefeated ? "defeated" : value > 0 ? "ready" : "done";
    const portrait = portraitOf(c);
    return {
      id: c.id,
      tokenId: c.tokenId ?? null,
      name: c.name,
      img: portrait.src,
      video: portrait.video,
      generic: portrait.generic,
      side: isPlayer ? "player" : c.token?.disposition === 1 ? "friendly" : c.token?.disposition === 0 ? "neutral" : "hostile",
      isPlayer,
      state,
      pips: max > 0 && max <= 6 ? Array.from({ length: max }, (_, i) => ({ on: i < value })) : null,
      left: value,
      max,
      order,
      hidden: !!c.hidden,
    };
  });
  const rank = { acting: 0, ready: 1, done: 2, defeated: 3 };
  entries.sort((a, b) => rank[a.state] - rank[b.state] || Number(b.isPlayer) - Number(a.isPlayer) || a.order - b.order);
  const count = s => entries.filter(e => e.state === s).length;
  const acting = entries.find(e => e.state === "acting") ?? null;
  return {
    round: combat.round,
    entries,
    acting: acting?.name ?? null,
    ready: count("ready"),
    done: count("done") + count("defeated"),
    // Where the "done" group starts, for a divider
    firstDone: entries.findIndex(e => e.state === "done" || e.state === "defeated"),
    // Big fights: smaller portraits, so the strip stays a strip
    crowded: entries.length > 12,
  };
}

/* -------------------------------------------- */
/*  Features                                    */
/* -------------------------------------------- */

/** The tier a feature reads its numbers at (its override, else the NPC's). */
export function featureTier(item, actor) {
  return Math.max(1, Math.min(3, num(item.system?.tier_override) || num(actor?.system?.tier) || 1));
}

function tagValue(item, lid) {
  return (item.system?.tags ?? []).find(t => t?.lid === lid) ?? null;
}

/** ready | destroyed | spent (no uses) | uncharged (waiting on a recharge roll) */
export function featureState(item) {
  const s = item.system ?? {};
  if (s.destroyed) return "destroyed";
  const limited = tagValue(item, "tg_limited");
  if (limited && num(s.uses?.value) <= 0) return "spent";
  if (tagValue(item, "tg_recharge") && s.charged === false) return "uncharged";
  return "ready";
}

/** An NPC's features, grouped and ordered. */
export function readFeatures(actor) {
  const groups = new Map(FEATURE_ORDER.map(t => [t, []]));
  for (const item of actor.items) {
    if (item.type !== "npc_feature") continue;
    const s = item.system ?? {};
    const type = groups.has(s.type) ? s.type : "Trait";
    const recharge = tagValue(item, "tg_recharge");
    const limited = tagValue(item, "tg_limited");
    groups.get(type).push({
      id: item.id,
      name: item.name,
      type,
      icon: FEATURE_ICONS[type],
      state: featureState(item),
      recharge: recharge ? `${recharge.val || "?"}+` : null,
      uses: limited ? `${num(s.uses?.value)}/${num(s.uses?.max) || num(limited.val)}` : null,
      // Traits are passive: shown, but not "used"
      passive: type === "Trait" && !(s.tags ?? []).some(t => /^tg_(quick|full)_action$|^tg_protocol$|^tg_free_action$/.test(t?.lid ?? "")),
    });
  }
  return FEATURE_ORDER.map(type => ({ type, icon: FEATURE_ICONS[type], label: game.i18n.localize(`LFD.Npc.Type.${type}`), items: groups.get(type) })).filter(g => g.items.length);
}

/** Hover card for a feature: its numbers at the NPC's tier, tags, and all its text. */
export function featureTip(item, actor) {
  const i18n = game.i18n;
  const s = item.system ?? {};
  const tier = featureTier(item, actor);
  const t = tier - 1;
  const kind = [s.type, s.weapon_type || (s.type === "Tech" ? s.tech_type : null), s.origin?.name].filter(Boolean).join(" · ");
  const out = [`<header><strong>${esc(item.name)}</strong><span>${esc(kind)}</span></header>`];
  const state = featureState(item);
  if (state !== "ready") out.push(`<p class="lfd-tip-state">${esc(i18n.localize(`LFD.Npc.State.${state}`))}</p>`);

  const numbers = [];
  if (s.type === "Weapon" || (s.type === "Tech" && s.tech_attack)) {
    const atk = num(s.attack_bonus?.[t]);
    numbers.push(`${i18n.localize("LFD.Npc.Attack")} ${atk >= 0 ? "+" : ""}${atk}`);
    const acc = num(s.accuracy?.[t]);
    if (acc) numbers.push(`${acc > 0 ? i18n.localize("LFD.Npc.Accuracy") : i18n.localize("LFD.Npc.Difficulty")} ${Math.abs(acc)}`);
  }
  for (const r of s.range ?? []) numbers.push(`${r.type} ${r.val}`);
  const dmg = (s.damage?.[t] ?? []).map(d => `${d.val} ${d.type}`).join(" + ");
  if (dmg) numbers.push(dmg);
  if (numbers.length) out.push(`<p class="lfd-tip-tags"><b>${numbers.map(esc).join(" · ")}</b> <span>(T${tier})</span></p>`);

  const tags = (s.tags ?? [])
    .filter(tag => tag && !tag.hidden && tag.name)
    .map(tag => esc(String(tag.name).replace("{VAL}", typeof tag.tierVal === "function" ? tag.tierVal(tier) : tag.val ?? "")));
  if (tags.length) out.push(`<p class="lfd-tip-tags">${tags.join(" · ")}</p>`);
  if (s.trigger) out.push(`<div class="lfd-tip-trigger"><em>${esc(i18n.localize("LFD.Systems.Trigger"))}</em> ${esc(s.trigger)}</div>`);
  if (s.effect) out.push(`<div class="lfd-tip-effect">${s.effect}</div>`);
  if (s.on_hit) out.push(`<div class="lfd-tip-effect"><em>${esc(i18n.localize("LFD.Hud.OnHit"))}</em> ${s.on_hit}</div>`);
  const hint = s.type === "Weapon" ? "LFD.Npc.Hint.attack" : s.type === "Tech" && s.tech_attack ? "LFD.Npc.Hint.tech" : "LFD.Npc.Hint.use";
  out.push(`<footer>${esc(i18n.localize(hint))}</footer>`);
  return `<div class="lfd-tip">${out.join("")}</div>`;
}

/** The NPC's combat stats, for the expanded row. */
export function readStats(actor) {
  const s = actor.system ?? {};
  return [
    ["EVA", s.evasion],
    ["E-DEF", s.edef],
    ["ARMOR", s.armor],
    ["SPD", s.speed],
    ["SENS", s.sensor_range],
    ["SAVE", s.save],
    ["HULL", s.hull],
    ["AGI", s.agi],
    ["SYS", s.sys],
    ["ENG", s.eng],
  ].map(([label, value]) => ({ label, value: num(value) }));
}
