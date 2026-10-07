import { MOVE_FLAG, MODULE_ID, DEFAULT_OVERCHARGE_SEQUENCE, STATUS } from "../constants.js";
import { moveAllowance, moveTurnKey } from "./MovementTracker.js";
import { nextOverchargeCost, nextOverheatCheck, nextStructureCheck, overchargeOdds } from "./Odds.js";

/** Which structure/overheat tables are in play: LANCER Alternative Structure replaces the core ones. */
const checkRules = () => (game.modules.get("lancer-alt-structure")?.active ? "alt" : "core");

/**
 * Reads LANCER mech actors into plain telemetry snapshots, diffs snapshots into
 * cockpit events, and tells the manager when anything relevant changes.
 *
 * Field paths come from the LANCER 3.1 data models (src/module/models/actors/mech.ts
 * and shared.ts) and derived data (src/module/actor/lancer-actor.ts).
 */
export class TelemetryAdapter {
  /** @type {(signal: {reason: string, combat?: Combat}) => void} */
  #signal;
  #hooks = [];
  /** @type {Actor|null} */
  #tracked = null;
  /** Uuids of other actors whose changes matter (the tokens tile clicks apply to). */
  #watched = new Set();

  constructor(signal) {
    this.#signal = signal;
  }

  /** Watch this actor (and its pilot) for changes. */
  track(actor) {
    this.#tracked = actor ?? null;
  }

  /** Also watch these actors (selection feedback on the annunciator). */
  watch(actors) {
    this.#watched = new Set(actors.map(a => a.uuid));
  }

  attach() {
    const on = (hook, fn) => this.#hooks.push([hook, Hooks.on(hook, fn)]);
    on("updateActor", actor => this.#onDocument(actor));
    for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
      on(hook, effect => this.#onDocument(ownerActor(effect)));
    }
    for (const hook of ["createItem", "updateItem", "deleteItem"]) {
      on(hook, item => this.#onDocument(item.parent));
    }
    on("controlToken", () => this.#signal({ reason: "control" }));
    on("targetToken", user => {
      if (user.isSelf) this.#signal({ reason: "target" });
    });
    on("canvasReady", () => this.#signal({ reason: "canvas" }));
    on("updateUser", (user, changes) => {
      if (user.isSelf && "character" in changes) this.#signal({ reason: "character" });
    });
    on("combatStart", combat => this.#signal({ reason: "combatStart", combat }));
    on("updateCombat", (combat, changes) => {
      if ("turn" in changes || "round" in changes || "combatants" in changes) this.#signal({ reason: "turn", combat });
    });
    on("deleteCombat", combat => this.#signal({ reason: "turn", combat }));
  }

  detach() {
    for (const [hook, id] of this.#hooks) Hooks.off(hook, id);
    this.#hooks = [];
  }

  #onDocument(actor) {
    if (!actor) return;
    if (this.#watched.has(actor.uuid)) this.#signal({ reason: "selection" });
    const tracked = this.#tracked;
    if (!tracked) return;
    if (actor === tracked || actor.uuid === tracked.uuid) return this.#signal({ reason: "data" });
    // The pilot's callsign lives on the pilot actor
    const pilot = tracked.system?.pilot?.value;
    if (pilot && actor.uuid === pilot.uuid) this.#signal({ reason: "data" });
  }

  /**
   * Which mech this client's panel should show:
   * the last controlled token that is an owned mech, else the user's character
   * (or the character pilot's active mech).
   * @returns {Actor|null}
   */
  static resolveActor() {
    const usable = a => a?.type === "mech" && a.isOwner;
    const controlled = canvas?.ready ? canvas.tokens.controlled : [];
    for (let i = controlled.length - 1; i >= 0; i--) {
      const actor = controlled[i].actor;
      if (usable(actor)) return actor;
    }
    const character = game.user.character;
    if (usable(character)) return character;
    if (character?.type === "pilot") {
      const mech = character.system?.active_mech?.value;
      if (usable(mech)) return mech;
    }
    return null;
  }

  /**
   * Snapshot everything the panel shows.
   * @param {Actor} actor  A LANCER mech actor
   */
  static read(actor) {
    const sys = actor.system ?? {};
    const statuses = actor.statuses ?? new Set();
    const has = id => statuses.has(id);
    const flags = Object.fromEntries(Object.values(STATUS).map(id => [id, has(id)]));

    const frame = sys.loadout?.frame?.value ?? null;
    const pilot = sys.pilot?.value ?? null;

    const heatMax = num(sys.heat?.max);
    const heatValue = num(sys.heat?.value);
    const heat = {
      value: heatValue,
      max: heatMax,
      dangerAt: heatMax > 0 ? Math.ceil(heatMax / 2) : null,
      // Danger Zone: heat at half the Heat Cap or more. Also honour a manually applied status.
      inDanger: (heatMax > 0 && heatValue * 2 >= heatMax) || flags[STATUS.DANGER_ZONE],
      over: heatMax > 0 && heatValue > heatMax,
    };

    const sequence = sys.overcharge_sequence || DEFAULT_OVERCHARGE_SEQUENCE;
    const oc = nextOverchargeCost(sequence, sys.overcharge);
    const ocOdds = oc.cost ? overchargeOdds({ heat: heatValue, cap: heatMax, formula: oc.cost }) : null;

    const structure = { value: num(sys.structure?.value), max: num(sys.structure?.max) };
    structure.next = nextStructureCheck(structure, { rules: checkRules() });
    const stress = { value: num(sys.stress?.value), max: num(sys.stress?.max) };
    stress.next = nextOverheatCheck(stress, { rules: checkRules() });

    const tracker = sys.action_tracker ?? {};
    const meltdownTimer = Number.isInteger(sys.meltdown_timer) ? sys.meltdown_timer : null;

    return {
      uuid: actor.uuid,
      name: actor.name,
      img: actor.img,
      callsign: pilot?.system?.callsign || null,
      pilotName: pilot?.name ?? null,
      frame: frame
        ? {
            name: frame.name,
            manufacturer: frame.system?.manufacturer ?? null,
            coreName: frame.system?.core_system?.name ?? null,
            coreActive: frame.system?.core_system?.active_name ?? null,
          }
        : null,
      manufacturer: frame?.system?.manufacturer ?? null,
      hp: { value: num(sys.hp?.value), max: num(sys.hp?.max) },
      overshield: num(sys.overshield?.value),
      armor: num(sys.armor),
      burn: num(sys.burn),
      stats: {
        evasion: num(sys.evasion),
        edef: num(sys.edef),
        speed: num(sys.speed),
        sensors: num(sys.sensor_range),
        save: num(sys.save),
        tech: num(sys.tech_attack),
      },
      // What the stats are built from (hover cards): the frame's own numbers and the pilot's Grit
      statBase: frame?.system?.stats
        ? {
            evasion: num(frame.system.stats.evasion),
            edef: num(frame.system.stats.edef),
            speed: num(frame.system.stats.speed),
            sensors: num(frame.system.stats.sensor_range),
            save: num(frame.system.stats.save),
            tech: num(frame.system.stats.tech_attack),
          }
        : null,
      grit: num(pilot?.system?.grit),
      // HASE check bonuses (a mech's Hull / Agility / Systems / Engineering)
      checks: { hull: num(sys.hull), agi: num(sys.agi), sys: num(sys.sys), eng: num(sys.eng) },
      heat,
      overcharge: { level: num(sys.overcharge), rungs: oc.rungs, index: oc.index, cost: oc.cost, odds: ocOdds },
      structure,
      stress,
      actions: {
        protocol: !!tracker.protocol,
        move: num(tracker.move),
        quick: !!tracker.quick,
        full: !!tracker.full,
        reaction: !!tracker.reaction,
        speed: num(sys.speed),
        // Speed, or more after a Boost this turn (MovementTracker.moveAllowance)
        allowance: moveAllowance({ speed: num(sys.speed), move: num(tracker.move), boost: actor.flags?.[MODULE_ID]?.[MOVE_FLAG] ?? null, key: moveTurnKey(actor) }),
      },
      core: { ready: num(sys.core_energy) > 0, active: !!sys.core_active, available: !!frame },
      meltdown: { timer: meltdownTimer, active: meltdownTimer !== null || flags[STATUS.MELTDOWN] },
      flags,
      destroyed: (structure.max > 0 && structure.value <= 0) || flags[STATUS.DESTROYED],
    };
  }

  /**
   * Cockpit events between two snapshots of the same mech. Switching mechs yields none,
   * so selecting a damaged mech never sets off alarms.
   */
  static diff(prev, next) {
    if (!prev || !next || prev.uuid !== next.uuid) return [];
    const events = new Set();
    const gained = id => !prev.flags[id] && next.flags[id];

    if (!prev.heat.inDanger && next.heat.inDanger) events.add("dangerEnter");
    if (next.stress.value < prev.stress.value) events.add("stressHit");
    if (next.structure.value < prev.structure.value) events.add("structureHit");
    if (gained(STATUS.LOCK_ON)) events.add("lockOn");
    if (gained(STATUS.EXPOSED)) events.add("exposed");
    if (gained(STATUS.STUNNED) || gained(STATUS.SHREDDED)) events.add("warning");
    if (!prev.meltdown.active && next.meltdown.active) events.add("meltdown");
    if (prev.meltdown.timer > 0 && next.meltdown.timer === 0) events.add("meltdownZero");
    if (gained(STATUS.SHUT_DOWN)) events.add("shutdown");
    if (prev.flags[STATUS.SHUT_DOWN] && !next.flags[STATUS.SHUT_DOWN]) events.add("bootUp");
    if (prev.core.ready && !next.core.ready) events.add("coreSpent");
    if (next.overcharge.level > prev.overcharge.level) events.add("overcharge");
    if (!prev.destroyed && next.destroyed) events.add("destroyed");
    return [...events];
  }
}

/** The actor an ActiveEffect ultimately belongs to (directly, or through an item). */
function ownerActor(effect) {
  const parent = effect?.parent;
  if (!parent) return null;
  if (parent.documentName === "Actor") return parent;
  return parent.parent?.documentName === "Actor" ? parent.parent : null;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
