import { planWeapons } from "./weaponRules.js";
import { STATUS } from "../constants.js";
import { readSystems, systemTip } from "../ui/components/SystemsBay.js";
import { BASIC_ACTIONS, textId } from "./basic.js";
import { actionTip, basicTip, itemActions, itemState, mountedWeapons, textTip, usesOf, weaponLine, weaponTip } from "./catalog.js";
import { keyHints } from "../ui/keyHints.js";

/**
 * View models for the HUD menus. `buildMenu` returns a JSON-safe `vm` for the template (also
 * used for change detection) and an `entries` map of key -> what clicking that key does.
 */

/** Menu id -> header icon. The action bus lights open the first six; the SYSTEMS button opens the last. */
export const MENU_ICONS = {
  invade: "fa-solid fa-terminal",
  move: "fa-solid fa-shoe-prints",
  quick: "cci cci-activation-quick",
  full: "cci cci-activation-full",
  reaction: "cci cci-reaction",
  core: "cci cci-frame",
  systems: "cci cci-mech-system",
};

/** Weapon picker modes and the slot each costs. */
const WEAPON_MODES = { skirmish: "quick", barrage: "full", overwatch: "reaction" };

/** Movement modes that make no sense to pick from a cockpit. */
const HIDDEN_MOVES = new Set(["displace", "forced"]);
/** Most segments drawn on the movement gauge. */
const MOVE_SEGMENTS = 12;

const loc = key => game.i18n.localize(key);
const fmt = (key, data) => game.i18n.format(key, data);

/**
 * @param {{menu: string, sub?: {type: "weapons", mode: string, fired?: number}}} view
 * @param {{actor: Actor, t: object, token: TokenDocument|null, targets: Token[], inCombat: boolean, busy: Set<string>}} ctx
 */
export function buildMenu(view, ctx) {
  const entries = new Map();
  const { actor, t } = ctx;
  const frame = actor.system?.loadout?.frame?.value;
  const vm = {
    menu: view.menu,
    icon: MENU_ICONS[view.menu],
    kicker: [actor.name, frame?.name].filter(Boolean).join(" // "),
    title: loc(`LFD.Hud.Menu.${view.menu}`),
    back: false,
    economy: economy(view.menu, ctx),
    readouts: [],
    notice: null,
    sections: [],
    empty: loc("LFD.Hud.Empty"),
    footer: keyHints(loc(`LFD.Hud.Footer.${view.menu === "systems" ? "systems" : "actions"}`)),
  };

  if (view.sub?.type === "weapons") {
    weaponsView(vm, entries, view, ctx);
  } else {
    switch (view.menu) {
      case "systems":
        systemsView(vm, entries, ctx);
        break;
      case "move":
        moveView(vm, entries, ctx);
        break;
      case "core":
        coreView(vm, entries, ctx, frame);
        break;
      default:
        actionView(vm, entries, view.menu, ctx);
    }
  }

  // Combat-only nag: the slot this menu spends is gone
  if (ctx.inCombat && vm.economy?.spent && !view.sub && view.menu !== "systems" && view.menu !== "core") {
    vm.notice = loc(`LFD.Hud.Spent.${view.menu}`);
  }
  for (const section of vm.sections) {
    for (const [i, item] of section.items.entries()) {
      item.busy = ctx.busy.has(item.key);
      item.i = i;
    }
  }
  vm.sections = vm.sections.filter(s => s.items.length);
  if (t?.flags?.[STATUS.SHUT_DOWN] && view.menu !== "systems") vm.readouts.unshift({ label: loc("LFD.Hud.Readout.Status"), value: loc("LFD.Hud.ShutDown"), alert: true });
  return { vm, entries };
}

/* -------------------------------------------- */
/*  Economy                                     */
/* -------------------------------------------- */

function slots(n, max, key) {
  return {
    pips: Array.from({ length: max }, (_, i) => ({ on: i < n })),
    text: fmt(key, { n, max }),
    spent: n <= 0,
  };
}

function economy(menu, { t, actor }) {
  const a = t.actions;
  const quick = (a.full ? 1 : 0) + (a.quick ? 1 : 0);
  switch (menu) {
    case "quick":
    case "invade":
      return slots(quick, 2, "LFD.Hud.Econ.quick");
    case "full":
      return slots(a.full ? 1 : 0, 1, "LFD.Hud.Econ.full");
    case "reaction":
      return slots(a.reaction ? 1 : 0, 1, "LFD.Hud.Econ.reaction");
    case "core": {
      const energy = Math.max(0, Math.min(1, Number(actor.system?.core_energy) || 0));
      return slots(energy, 1, "LFD.Hud.Econ.core");
    }
    case "move": {
      const max = Math.max(0, a.speed);
      const segments = Math.min(MOVE_SEGMENTS, max);
      const scale = max > 0 ? segments / max : 0;
      return {
        pips: Array.from({ length: segments }, (_, i) => ({ on: i < Math.round(a.move * scale) })),
        text: fmt("LFD.Hud.Econ.move", { n: a.move, max }),
        spent: a.move <= 0,
        wide: true,
      };
    }
  }
  return null;
}

/* -------------------------------------------- */
/*  Builders                                    */
/* -------------------------------------------- */

/** A basic action as a tile. */
function basicTile(def, entries, extra = {}) {
  const key = `basic:${def.id}`;
  const text = textId(def);
  entries.set(key, { key, type: def.run, def, spend: def.spend, tip: () => basicTip(def, text) });
  return { key, icon: def.icon, label: loc(`LFD.Basic.${text}.Short`), state: "ready", ...extra };
}

/** A gear action as a row. */
function actionRow(entry, entries) {
  entries.set(entry.key, { ...entry, type: entry.run ?? (entry.tech ? "techAction" : "activation"), tip: () => actionTip(entry) });
  const uses = usesOf(entry.item);
  return {
    key: entry.key,
    icon: entry.icon,
    label: entry.label,
    // Don't repeat the name: say where it comes from instead
    sub: entry.source !== entry.label ? entry.source : loc(`LFD.Hud.Kind.${entry.kind}`),
    state: entry.state,
    heat: entry.heat ?? null,
    readout: entry.state !== "ready" ? loc(`LFD.Hud.State.${entry.state}`) : uses ? `${uses.value}/${uses.max}` : null,
    tech: entry.tech,
  };
}

function section(id, layout, items, extra = {}) {
  return { id, layout, title: loc(`LFD.Hud.Section.${id}`), items, ...extra };
}

/** Quick, Full, Reaction and Invade: basic actions as tiles, then gear actions as rows. Reaction opens with protocols. */
function actionView(vm, entries, menu, ctx) {
  const { actor, t } = ctx;
  const statuses = actor.statuses ?? new Set();
  const tiles = sectionId =>
    BASIC_ACTIONS.filter(d => d.menu === menu && d.section === sectionId).map(def =>
      basicTile(def, entries, {
        active: def.run === "selfStatus" && def.active && statuses.has(def.status),
        warn: (def.needsTarget && !ctx.targets.length) || (def.singleTarget && ctx.targets.length > 1),
        ...(ctx.usedReactions?.has(`basic:${def.id}`) ? { state: "used" } : {}),
      })
    );
  const gear = itemActions(actor).filter(e => e.menu === menu);
  const rows = sectionId =>
    gear
      .filter(e => e.section === sectionId)
      .map(e => actionRow(e.state === "ready" && ctx.usedReactions?.has(e.key) ? { ...e, state: "used" } : e, entries));

  if (menu === "invade") {
    vm.readouts.push(
      { label: loc("LFD.Hud.Readout.Tech"), value: signed(t.stats.tech) },
      { label: loc("LFD.Hud.Readout.Sensors"), value: String(t.stats.sensors) },
      targetReadout(ctx),
      defenseReadout(ctx, "edef")
    );
    vm.sections.push(section("invadeBasic", "tiles", tiles("basic")));
    vm.sections.push(section("invadeGear", "rows", rows("items")));
    return;
  }
  if (menu === "reaction") {
    // Protocols first (start of your turn, before anything else), then every reaction you have.
    // Two slots, so each section carries its own state and the header keeps room for the title.
    const a = t.actions;
    vm.economy = null;
    vm.sections.push(
      section("protocol", "rows", rows("protocol"), {
        note: loc(a.protocol ? "LFD.Hud.ProtocolReady" : "LFD.Hud.ProtocolSpent"),
        noteState: a.protocol ? "ready" : "spent",
      })
    );
    vm.sections.push(
      section("basic", "tiles", tiles("basic"), {
        title: loc("LFD.Hud.Section.basicReaction"),
        note: loc(a.reaction ? "LFD.Hud.ReactionReady" : "LFD.Hud.ReactionSpent"),
        noteState: a.reaction ? "ready" : "spent",
      })
    );
    vm.sections.push(section("gear", "rows", rows("items"), { title: loc("LFD.Hud.Section.gear.reaction") }));
    return;
  }
  vm.sections.push(section("basic", "tiles", tiles("basic")));
  if (menu === "quick" || menu === "full") {
    vm.sections.push(section(menu === "quick" ? "quickTech" : "fullTech", "tiles", tiles("tech")));
    vm.sections.push(section("techGear", "rows", rows("techItems"), { title: loc(`LFD.Hud.Section.techGear.${menu}`) }));
  }
  vm.sections.push(section("gear", "rows", rows("items"), { title: loc(`LFD.Hud.Section.gear.${menu}`) }));
}

/** Movement: modes for the token, Boost / Disengage, and a movement reset. */
function moveView(vm, entries, ctx) {
  const { t, token } = ctx;
  vm.readouts.push(
    { label: loc("LFD.Hud.Readout.Speed"), value: String(t.actions.speed) },
    { label: loc("LFD.Hud.Readout.Mode"), value: token ? moveLabel(token.movementAction) : loc("LFD.Hud.NoToken") }
  );
  const modes = [];
  if (token) {
    // Lancer Ruler Integration picks walk / fly / crawl / ignore-terrain from the token's conditions, but
    // only while no mode is pinned. Picking one here pins it, so Auto hands the choice back.
    const ruler = game.modules.get("lancer-speed-provider")?.active;
    const pinned = token._source?.movementAction ?? null;
    if (ruler) {
      const key = "mode:auto";
      const label = loc("LFD.Hud.MoveAuto");
      entries.set(key, { key, type: "moveMode", mode: null, spend: null, tip: () => textTip(label, loc("LFD.Hud.MoveMode"), `<p>${foundry.utils.escapeHTML(loc("LFD.Hud.MoveAutoText"))}</p>`, "LFD.Hud.Hint.moveMode") });
      modes.push({ key, icon: "fa-solid fa-wand-magic-sparkles", label, state: "ready", active: pinned === null });
    }
    for (const [id, cfg] of Object.entries(CONFIG.Token.movement?.actions ?? {})) {
      if (HIDDEN_MOVES.has(id)) continue;
      if (typeof cfg.canSelect === "function" && cfg.canSelect(token) === false) continue;
      const key = `mode:${id}`;
      const label = moveLabel(id);
      entries.set(key, { key, type: "moveMode", mode: id, spend: null, tip: () => textTip(label, loc("LFD.Hud.MoveMode"), moveText(id, cfg), "LFD.Hud.Hint.moveMode") });
      modes.push({ key, icon: cfg.icon || "fa-solid fa-person-walking", label, state: "ready", active: ruler ? pinned === id : token.movementAction === id });
    }
  }
  vm.sections.push(section("moveMode", "tiles", modes));
  vm.sections.push(
    section("moveActions", "tiles", BASIC_ACTIONS.filter(d => d.menu === "move").map(def => basicTile(def, entries)))
  );
  const key = "util:resetMove";
  entries.set(key, { key, type: "resetMove", spend: null, tip: () => textTip(loc("LFD.Hud.ResetMove"), loc("LFD.Hud.Tracker"), `<p>${foundry.utils.escapeHTML(loc("LFD.Hud.ResetMoveHint"))}</p>`, "LFD.Hud.Hint.tracker") });
  vm.sections.push(
    section("moveTracker", "tiles", [{ key, icon: "fa-solid fa-arrow-rotate-left", label: loc("LFD.Hud.ResetMoveShort"), state: "ready" }])
  );
}

/** Frame: core power and passive, traits, free actions. (Protocols open with the reactions.) */
function coreView(vm, entries, ctx, frame) {
  const { actor, t } = ctx;
  const gear = itemActions(actor);
  const core = frame?.system?.core_system;
  const coreTiles = [];
  if (core) {
    const ready = Number(actor.system?.core_energy) > 0;
    const activeKey = "core:active";
    entries.set(activeKey, {
      key: activeKey,
      type: "core",
      spend: ACTIVATION_TO_SPEND[core.activation] ?? null,
      tip: () => textTip(core.active_name || core.name, `${loc("LFD.Hud.CorePower")} · ${core.activation ?? ""}`, core.active_effect, "LFD.Hud.Hint.core"),
    });
    coreTiles.push({ key: activeKey, icon: "cci cci-corebonus", label: core.active_name || loc("LFD.Hud.CorePower"), state: ready ? "ready" : "spent", active: !!actor.system?.core_active });
    if (core.passive_name || core.passive_effect) {
      const passiveKey = "core:passive";
      entries.set(passiveKey, {
        key: passiveKey,
        type: "frameText",
        item: frame,
        title: core.passive_name,
        description: core.passive_effect,
        actions: core.passive_actions ?? [],
        spend: null,
        tip: () => textTip(core.passive_name, loc("LFD.Hud.CorePassive"), core.passive_effect, "LFD.Hud.Hint.chat", core.passive_actions),
      });
      coreTiles.push({ key: passiveKey, icon: "cci cci-frame", label: core.passive_name || loc("LFD.Hud.CorePassive"), state: "ready" });
    }
  }
  const oc = BASIC_ACTIONS.find(d => d.id === "overcharge");
  coreTiles.push(basicTile(oc, entries, { readout: t.overcharge.cost ?? null }));
  vm.sections.push(section("core", "tiles", coreTiles));

  const traits = (frame?.system?.traits ?? []).map((trait, i) => {
    const key = `trait:${i}`;
    entries.set(key, {
      key,
      type: "frameText",
      item: frame,
      title: trait.name,
      description: trait.description,
      actions: trait.actions ?? [],
      spend: null,
      tip: () => textTip(trait.name, loc("LFD.Hud.Trait"), trait.description, "LFD.Hud.Hint.chat", trait.actions),
    });
    return { key, icon: "cci cci-trait", label: trait.name, sub: frame.name, state: "ready" };
  });
  vm.sections.push(section("traits", "rows", traits));
  vm.sections.push(section("free", "rows", gear.filter(e => e.section === "free").map(e => actionRow(e, entries))));
}

const ACTIVATION_TO_SPEND = { Quick: "quick", Full: "full", Protocol: "protocol", Reaction: "reaction", Free: null };

/** SYSTEMS AVAILABLE: every installed system, hover for its text, click to post its card. */
function systemsView(vm, entries, { actor }) {
  const systems = readSystems(actor);
  const ready = systems.filter(s => s.ready).length;
  vm.economy = { pips: [], text: "", count: `${ready}/${systems.length}`, aria: fmt("LFD.Systems.CountLabel", { ready, total: systems.length }) };
  vm.empty = loc("LFD.Systems.None");
  const items = systems.map(s => {
    const key = `system:${s.id}`;
    const item = actor.items.get(s.id);
    entries.set(key, { key, type: "system", item, spend: null, tip: () => (item ? systemTip(item) : "") });
    return { key, icon: "cci cci-mech-system", label: s.name, state: s.state, readout: s.pips ? null : s.readout, pips: s.pips, lamp: true };
  });
  vm.sections.push(section("systems", "rows", items));
}

/** Weapon picker for Skirmish, Barrage and Overwatch. */
function weaponsView(vm, entries, view, ctx) {
  const mode = view.sub.mode;
  vm.back = true;
  vm.title = loc(`LFD.Basic.${mode}.Name`);
  vm.crumb = loc(`LFD.Hud.Menu.${view.menu}`);
  vm.footer = keyHints(loc("LFD.Hud.Footer.weapons"));
  vm.readouts.push(targetReadout(ctx), defenseReadout(ctx, "evasion"));
  const mounted = mountedWeapons(ctx.actor);
  const fired = view.sub.fired ?? [];
  const plan = planWeapons(mode, mounted.map(w => ({ id: w.weapon.uuid, mount: w.mountIndex, size: w.size, ready: itemState(w.weapon) === "ready" })), fired);
  const followUp = plan.phase === "aux";
  if (mode === "barrage") vm.readouts.push({ label: loc("LFD.Hud.Readout.Attacks"), value: `${plan.made}/${plan.needed}` });
  if (followUp) vm.title = loc("LFD.Hud.AuxTitle");
  vm.notice = loc(followUp ? "LFD.Hud.AuxNote" : `LFD.Hud.WeaponNote.${mode}`);
  // Follow-ups list only what may still fire; the main attacks show everything, the barred ones dimmed
  const shown = followUp ? mounted.filter(w => plan.options.get(w.weapon.uuid)?.allowed) : mounted;
  const rows = shown.map(w => {
    const key = `weapon:${w.weapon.uuid}`;
    const option = plan.options.get(w.weapon.uuid);
    const barred = option && !option.allowed ? option.reason : null;
    const shownBarred = barred === "notReady" ? null : barred; // its own state says why
    // Overwatch is one reaction whichever weapon fires it, so it's recorded under the basic tile
    const reactionKey = mode === "overwatch" ? "basic:overwatch" : undefined;
    entries.set(key, {
      key, type: "weapon", weapon: w.weapon, mode, mount: w.mountIndex, size: w.size, aux: followUp,
      // The first attack spends the action; every later attack in it is free
      spend: fired.length ? null : WEAPON_MODES[mode],
      reactionKey, blocked: barred, tip: () => weaponTip(w),
    });
    const state = shownBarred ? "used" : itemState(w.weapon);
    const uses = usesOf(w.weapon);
    return {
      key,
      icon: w.size === "Superheavy" ? "cci cci-large-beam" : (w.weapon.system?.profiles?.[0]?.type ?? "") === "Melee" ? "cci cci-melee" : "cci cci-mech-weapon",
      label: w.weapon.name,
      sub: [w.mount, weaponLine(w.weapon)].filter(Boolean).join(" · "),
      state,
      readout: shownBarred ? loc(`LFD.Hud.WeaponBlocked.${shownBarred}`) : state !== "ready" ? loc(`LFD.Hud.State.${state}`) : uses ? `${uses.value}/${uses.max}` : null,
    };
  });
  // Once anything has fired, the action can end here (skip a Barrage's second attack, or a follow-up)
  if (fired.length) {
    entries.set("weapons:done", { key: "weapons:done", type: "done", tip: () => `<div class="lfd-tip"><p>${foundry.utils.escapeHTML(loc("LFD.Hud.AuxDoneTip"))}</p></div>` });
    rows.push({ key: "weapons:done", icon: "fa-solid fa-check", label: loc("LFD.Hud.AuxDone"), sub: loc("LFD.Hud.AuxDoneSub"), state: "ready", readout: null });
  }
  vm.empty = loc("LFD.Hud.NoWeapons");
  vm.sections.push(section("weapons", "rows", rows));
}

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

function signed(n) {
  return n >= 0 ? `+${n}` : String(n);
}

/** What picking a movement mode does: how the ruler measures it, and its cost if LANCER changes it. */
function moveText(id, cfg) {
  const lines = [loc("LFD.Hud.MoveModeText")];
  const key = `LFD.Hud.MoveModes.${id}`;
  if (game.i18n.has(key)) lines.push(loc(key));
  return lines.map(l => `<p>${foundry.utils.escapeHTML(l)}</p>`).join("");
}

function moveLabel(id) {
  const label = CONFIG.Token.movement?.actions?.[id]?.label;
  return label ? loc(label) : id;
}

/** The targets' Evasion or E-Defense, in target order, so you know what you're rolling against. */
function defenseReadout({ targets }, stat) {
  const values = targets.map(t => Number(t.actor?.system?.[stat])).filter(Number.isFinite);
  const shown = values.slice(0, 4).join("/") + (values.length > 4 ? "…" : "");
  return { label: loc(`LFD.Hud.Readout.${stat}`), value: values.length ? shown : "—" };
}

function targetReadout({ targets }) {
  const names = targets.map(t => t.name);
  const value = !names.length ? loc("LFD.Hud.NoTarget") : names.length === 1 ? names[0] : fmt("LFD.Hud.Targets", { name: names[0], n: names.length - 1 });
  return { label: loc("LFD.Hud.Readout.Target"), value, alert: !names.length };
}
