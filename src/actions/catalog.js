import { installedSystems } from "../ui/components/SystemsBay.js";

/**
 * Everything a mech can actually do, gathered from what it has equipped:
 * frame traits and core, installed systems, mounted weapons and their mods, and the pilot's
 * talents (up to their current rank) and core bonuses.
 *
 * Field paths: LANCER 3.1 models (items/frame.ts, mech_system.ts, mech_weapon.ts,
 * weapon_mod.ts, talent.ts, core_bonus.ts, bits/action.ts). Action paths are the dot-paths
 * LANCER's own ActivationFlow resolves, so running one is identical to clicking it on the sheet.
 */

/** LANCER activation type -> [HUD menu, section]. Passive, None and Other actions aren't actions you take. */
export const ACTIVATION_MENU = {
  Quick: ["quick", "items"],
  "Quick Tech": ["quick", "techItems"],
  Full: ["full", "items"],
  "Full Tech": ["full", "techItems"],
  Reaction: ["reaction", "items"],
  Invade: ["invade", "items"],
  Protocol: ["core", "protocol"],
  Free: ["core", "free"],
};

/** Which action-economy slot an activation spends. */
export const ACTIVATION_SPEND = {
  Quick: "quick",
  "Quick Tech": "quick",
  Invade: "quick",
  Full: "full",
  "Full Tech": "full",
  Reaction: "reaction",
  Protocol: "protocol",
  Free: null,
};

const SOURCE_ICON = {
  system: "cci cci-mech-system",
  weapon: "cci cci-mech-weapon",
  mod: "cci cci-weapon-mod",
  trait: "cci cci-trait",
  core: "cci cci-frame",
  talent: "cci cci-talent",
  corebonus: "cci cci-corebonus",
};

const ROMAN = ["I", "II", "III"];
const LIMITED = "tg_limited";
const SELF_HEAT = "tg_heat_self";

const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
/** LCP data sometimes names an action just "Action"; show the gear's name for those. */
const GENERIC_NAME = /^\s*(action|activate|activation|use|quick action|full action)?\s*$/i;

/** The name to show for an action: its own, unless that's a placeholder. */
export function actionLabel(action, item) {
  return GENERIC_NAME.test(action?.name ?? "") ? item.name : action.name;
}
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** The pilot actor behind a mech, if linked. */
export function pilotOf(actor) {
  return actor?.system?.pilot?.value ?? null;
}

/** Mounted weapons, in mount order, with their mount and mod. */
export function mountedWeapons(actor) {
  const out = [];
  for (const mount of actor?.system?.loadout?.weapon_mounts ?? []) {
    for (const slot of mount?.slots ?? []) {
      const weapon = slot?.weapon?.value;
      if (weapon) out.push({ weapon, mod: slot.mod?.value ?? null, mount: mount.type, bracing: !!mount.bracing });
    }
  }
  return out;
}

/** Limited uses of an item, or null when unlimited. */
export function usesOf(item) {
  const s = item?.system ?? {};
  const tag = (s.tags ?? []).find(t => t?.lid === LIMITED);
  if (!tag) return null;
  return { value: num(s.uses?.value), max: num(s.uses?.max) || num(tag.val) };
}

/** ready | destroyed | spent (no uses left) | unloaded */
export function itemState(item) {
  const s = item?.system ?? {};
  if (s.destroyed) return "destroyed";
  const uses = usesOf(item);
  if (uses && uses.value <= 0) return "spent";
  if (item?.type === "mech_weapon" && (s.tags ?? []).some(t => t?.lid === "tg_loading") && s.loaded === false) return "unloaded";
  return "ready";
}

/** Heat the action costs: its own heat cost, else the item's Heat (Self) tag. */
function heatOf(item, action) {
  if (num(action?.heat_cost) > 0) return num(action.heat_cost);
  const tag = (item?.system?.tags ?? []).find(t => t?.lid === SELF_HEAT);
  return tag ? tag.val || "1" : null;
}

/**
 * Every activatable action from equipped gear.
 * @returns {Array<{key, item, path, action, source, kind, icon, menu, section, spend, heat, state}>}
 */
export function itemActions(actor) {
  const out = [];
  if (!actor) return out;
  // LANCER copies a weapon's own actions into a pseudo-profile when it has no profiles
  const seen = new Set();
  const add = (item, path, action, source, kind) => {
    const route = ACTIVATION_MENU[action?.activation];
    if (!route) return;
    const signature = `${item.uuid}|${action.name}|${action.activation}|${action.detail ?? ""}`;
    if (seen.has(signature)) return;
    seen.add(signature);
    const [menu, section] = route;
    out.push({
      key: `act:${item.uuid}:${path}`,
      item,
      path,
      action,
      label: actionLabel(action, item),
      source,
      kind,
      icon: SOURCE_ICON[kind],
      menu,
      section,
      spend: ACTIVATION_SPEND[action.activation] ?? null,
      heat: heatOf(item, action),
      state: itemState(item),
      tech: !!action.tech_attack || action.activation === "Invade",
    });
  };

  const frame = actor.system?.loadout?.frame?.value;
  if (frame) {
    const core = frame.system?.core_system ?? {};
    (frame.system?.traits ?? []).forEach((trait, i) =>
      (trait.actions ?? []).forEach((a, j) => add(frame, `system.traits.${i}.actions.${j}`, a, trait.name, "trait"))
    );
    (core.passive_actions ?? []).forEach((a, j) =>
      add(frame, `system.core_system.passive_actions.${j}`, a, core.passive_name || core.name, "core")
    );
    // Active core actions are only usable while the core power is running
    if (actor.system?.core_active) {
      (core.active_actions ?? []).forEach((a, j) =>
        add(frame, `system.core_system.active_actions.${j}`, a, core.active_name || core.name, "core")
      );
    }
  }
  for (const item of installedSystems(actor)) {
    (item.system?.actions ?? []).forEach((a, j) => add(item, `system.actions.${j}`, a, item.name, "system"));
  }
  for (const { weapon, mod } of mountedWeapons(actor)) {
    (weapon.system?.actions ?? []).forEach((a, j) => add(weapon, `system.actions.${j}`, a, weapon.name, "weapon"));
    (weapon.system?.profiles ?? []).forEach((profile, p) =>
      (profile.actions ?? []).forEach((a, j) =>
        add(weapon, `system.profiles.${p}.actions.${j}`, a, profile.name || weapon.name, "weapon")
      )
    );
    if (mod) (mod.system?.actions ?? []).forEach((a, j) => add(mod, `system.actions.${j}`, a, mod.name, "mod"));
  }
  const pilot = pilotOf(actor);
  for (const item of pilot?.items ?? []) {
    if (item.type === "talent") {
      const rank = Math.max(0, Math.min(3, num(item.system?.curr_rank)));
      (item.system?.ranks ?? []).slice(0, rank).forEach((r, i) =>
        (r.actions ?? []).forEach((a, j) =>
          add(item, `system.ranks.${i}.actions.${j}`, a, `${item.name} ${ROMAN[i] ?? i + 1}`, "talent")
        )
      );
    } else if (item.type === "core_bonus") {
      (item.system?.actions ?? []).forEach((a, j) => add(item, `system.actions.${j}`, a, item.name, "corebonus"));
    }
  }
  return out;
}

/* -------------------------------------------- */
/*  Hover cards                                 */
/* -------------------------------------------- */

/** Card for a gear action: name, activation, source, costs, trigger and effect. */
export function actionTip(entry) {
  const i18n = game.i18n;
  const { action, item, source, heat, state } = entry;
  const meta = [action.activation, action.frequency && String(action.frequency) !== "Unlimited" ? String(action.frequency) : null]
    .filter(Boolean)
    .map(esc)
    .join(" · ");
  const out = [`<header><strong>${esc(entry.label ?? actionLabel(action, item))}</strong><span>${meta}</span></header>`];
  out.push(`<p class="lfd-tip-source">${esc(source)}${source !== item.name ? ` <span>· ${esc(item.name)}</span>` : ""}</p>`);
  if (state !== "ready") {
    const text = state === "used" ? i18n.localize("LFD.Hud.UsedRound") : i18n.localize(`LFD.Hud.State.${state}`);
    out.push(`<p class="lfd-tip-state">${esc(text)}</p>`);
  }
  const costs = [];
  if (heat) costs.push(i18n.format("LFD.Systems.Heat", { n: heat }));
  const uses = usesOf(item);
  if (uses) costs.push(i18n.format("LFD.Systems.Uses", { uses: `${uses.value}/${uses.max}` }));
  if (entry.tech) costs.push(i18n.localize("LFD.Hud.TechAttack"));
  if (costs.length) out.push(`<p class="lfd-tip-tags"><b>${costs.map(esc).join(" · ")}</b></p>`);
  if (action.init) out.push(`<div><em>${esc(i18n.localize("LFD.Hud.Init"))}</em> ${action.init}</div>`);
  if (action.trigger) out.push(`<div class="lfd-tip-trigger"><em>${esc(i18n.localize("LFD.Systems.Trigger"))}</em> ${action.trigger}</div>`);
  if (action.detail) out.push(`<div class="lfd-tip-effect">${action.detail}</div>`);
  out.push(`<footer>${esc(i18n.localize(entry.tech ? "LFD.Hud.Hint.Tech" : "LFD.Hud.Hint.Activate"))}</footer>`);
  return `<div class="lfd-tip">${out.join("")}</div>`;
}

/** Card for a basic action: localized name and paraphrased rules. */
export function basicTip(def, textKey, { hint } = {}) {
  const i18n = game.i18n;
  const meta = i18n.localize(`LFD.Hud.Activation.${def.spend ?? "free"}`);
  const out = [
    `<header><strong>${esc(i18n.localize(`LFD.Basic.${textKey}.Name`))}</strong><span>${esc(meta)}</span></header>`,
    `<div class="lfd-tip-effect"><p>${esc(i18n.localize(`LFD.Basic.${textKey}.Text`))}</p></div>`,
  ];
  if (def.needsTarget) out.push(`<p class="lfd-tip-note">${esc(i18n.localize(def.singleTarget ? "LFD.Hud.OneTargetHint" : "LFD.Hud.NeedsTarget"))}</p>`);
  out.push(`<footer>${esc(i18n.localize(hint ?? `LFD.Hud.Hint.${def.run}`))}</footer>`);
  return `<div class="lfd-tip">${out.join("")}</div>`;
}

/** Hover-card blocks for a list of actions: name, activation, trigger, effect. */
export function tipActions(actions, fallbackName = "") {
  return (actions ?? [])
    .map(action => {
      const name = GENERIC_NAME.test(action.name ?? "") ? fallbackName : action.name;
      const meta = [action.activation, Number(action.heat_cost) > 0 ? game.i18n.format("LFD.Systems.Heat", { n: action.heat_cost }) : null]
        .filter(Boolean)
        .map(esc)
        .join(" · ");
      return (
        `<div class="lfd-tip-action"><p class="lfd-tip-action-head"><b>${esc(name)}</b><span>${meta}</span></p>` +
        (action.trigger ? `<div><em>${esc(game.i18n.localize("LFD.Systems.Trigger"))}</em> ${action.trigger}</div>` : "") +
        (action.detail ? `<div>${action.detail}</div>` : "") +
        `</div>`
      );
    })
    .join("");
}

/** Plain card: a title, a kind line, some (system-authored) HTML, and optionally its actions. */
export function textTip(title, kind, html, hint = "LFD.Hud.Hint.chat", actions = []) {
  const out = [`<header><strong>${esc(title)}</strong><span>${esc(kind)}</span></header>`];
  if (html) out.push(`<div class="lfd-tip-effect">${html}</div>`);
  if (actions?.length) out.push(tipActions(actions, title));
  out.push(`<footer>${esc(game.i18n.localize(hint))}</footer>`);
  return `<div class="lfd-tip">${out.join("")}</div>`;
}

/** Short weapon summary for a row: "Range 10 · 1d6+3 Kinetic". */
export function weaponLine(weapon) {
  const s = weapon.system ?? {};
  const profile = s.profiles?.[s.selected_profile_index ?? 0] ?? s.profiles?.[0] ?? {};
  const ranges = (profile.range ?? []).map(r => `${r.type} ${r.val}`).join(", ");
  const dmg = (profile.damage ?? []).map(d => `${d.val} ${d.type}`).join(" + ");
  return [ranges, dmg].filter(Boolean).join(" · ");
}

/** Card for a weapon in the attack picker. */
export function weaponTip({ weapon, mount, mod }) {
  const i18n = game.i18n;
  const s = weapon.system ?? {};
  const profile = s.profiles?.[s.selected_profile_index ?? 0] ?? s.profiles?.[0] ?? {};
  const kind = [s.size, profile.type].filter(Boolean).join(" ");
  const tags = (profile.tags ?? s.tags ?? [])
    .filter(t => t && !t.hidden && t.name)
    .map(t => esc(String(t.name).replace("{VAL}", t.val ?? "")));
  const out = [`<header><strong>${esc(weapon.name)}</strong><span>${esc(kind)}</span></header>`];
  out.push(`<p class="lfd-tip-source">${esc(i18n.format("LFD.Hud.Mount", { mount }))}${mod ? ` · ${esc(mod.name)}` : ""}</p>`);
  const state = itemState(weapon);
  if (state !== "ready") out.push(`<p class="lfd-tip-state">${esc(i18n.localize(`LFD.Hud.State.${state}`))}</p>`);
  const line = weaponLine(weapon);
  if (line) out.push(`<p class="lfd-tip-tags"><b>${esc(line)}</b></p>`);
  if (tags.length) out.push(`<p class="lfd-tip-tags">${tags.join(" · ")}</p>`);
  for (const [key, label] of [["on_attack", "OnAttack"], ["on_hit", "OnHit"], ["on_crit", "OnCrit"], ["effect", null]]) {
    const html = profile[key] || (key === "effect" ? s.effect : "");
    if (!html) continue;
    out.push(`<div class="lfd-tip-effect">${label ? `<em>${esc(i18n.localize(`LFD.Hud.${label}`))}</em> ` : ""}${html}</div>`);
  }
  out.push(`<footer>${esc(i18n.localize("LFD.Hud.Hint.attack"))}</footer>`);
  return `<div class="lfd-tip">${out.join("")}</div>`;
}
