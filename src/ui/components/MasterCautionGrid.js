import { STATUS } from "../../constants.js";
import { conditionCard, conditionText } from "../../core/ConditionInfo.js";
import { qolManagesDangerZone } from "../../core/ConditionControl.js";

/**
 * Annunciator tiles. Positions are fixed, like a real panel: every legend is always
 * present (unlit), so pilots learn where to look. Kinds:
 *  - warning  (red, ▲)   immediate danger
 *  - caution  (amber, ◆) degraded capability
 *  - advisory (green, ●) good-to-know states
 * Shape glyphs and border styles repeat the meaning for colour-blind pilots.
 */
export const TILES = [
  { id: "exposed", kind: "warning", lit: t => t.flags[STATUS.EXPOSED] },
  { id: "shredded", kind: "warning", lit: t => t.flags[STATUS.SHREDDED] },
  { id: "stunned", kind: "warning", lit: t => t.flags[STATUS.STUNNED] },
  { id: "meltdown", kind: "warning", lit: t => t.meltdown.active, detail: t => (t.meltdown.timer !== null ? `T-${t.meltdown.timer}` : null) },
  { id: "lockon", kind: "caution", lit: t => t.flags[STATUS.LOCK_ON] },
  { id: "jammed", kind: "caution", lit: t => t.flags[STATUS.JAMMED] },
  { id: "impaired", kind: "caution", lit: t => t.flags[STATUS.IMPAIRED] },
  { id: "dangerzone", kind: "caution", lit: t => t.heat.inDanger },
  { id: "slowed", kind: "caution", lit: t => t.flags[STATUS.SLOWED] },
  { id: "immobilized", kind: "caution", lit: t => t.flags[STATUS.IMMOBILIZED] },
  { id: "engaged", kind: "caution", lit: t => t.flags[STATUS.ENGAGED] },
  { id: "prone", kind: "caution", lit: t => t.flags[STATUS.PRONE] },
  { id: "burn", kind: "caution", lit: t => t.burn > 0, detail: t => (t.burn > 0 ? String(t.burn) : null) },
  { id: "overshield", kind: "advisory", lit: t => t.overshield > 0, detail: t => (t.overshield > 0 ? String(t.overshield) : null) },
  { id: "hidden", kind: "advisory", lit: t => t.flags[STATUS.HIDDEN] || t.flags[STATUS.INVISIBLE], label: hiddenLabel },
  { id: "shutdown", kind: "warning", lit: t => t.flags[STATUS.SHUT_DOWN] },
];

const GLYPH = { warning: "▲", caution: "◆", advisory: "●" };

/** Status ids whose annunciator tile has another id. */
const TILE_OF = { slow: "slowed", invisible: "hidden", reactor_meltdown: "meltdown" };

/**
 * How a status reads outside the panel (the NPC Deck): its tile's kind (warning / caution / advisory)
 * and short legend ("Immobile", "Lock On"), else caution and the status's own name.
 * @param {string} id        Status id
 * @param {string} fallback  Localized status name
 */
export function conditionLook(id, fallback) {
  const tileId = TILE_OF[id] ?? id;
  const tile = TILES.find(t => t.id === tileId);
  const legend = { hidden: "LFD.Tile.Hidden", invisible: "LFD.Tile.Invisible" }[id] ?? `LFD.Tile.${tileId}`;
  return { kind: tile?.kind ?? "caution", short: game.i18n.has(legend) ? game.i18n.localize(legend) : fallback };
}

function hiddenLabel(t) {
  const hidden = t.flags[STATUS.HIDDEN];
  const invisible = t.flags[STATUS.INVISIBLE];
  if (hidden && invisible) return "LFD.Tile.HiddenInvisible";
  if (invisible) return "LFD.Tile.Invisible";
  return "LFD.Tile.Hidden";
}

/** Map of lit tile id -> kind, used by the manager to detect newly lit tiles. */
export function litTiles(t) {
  const lit = new Map();
  if (!t) return lit;
  for (const tile of TILES) if (tile.lit(t)) lit.set(tile.id, tile.kind);
  return lit;
}

/** Click hints per tile control type (see ConditionControl.TILE_ACTIONS). */
const HINT = {
  burn: "LFD.Apply.HintCounter",
  overshield: "LFD.Apply.HintCounter",
  hidden: "LFD.Apply.HintHidden",
  meltdown: "LFD.Apply.HintMeltdown",
};

/**
 * @param {object} t                 Telemetry snapshot
 * @param {{caution:Map<string,number>, warning:Map<string,number>}} pending  Still-flashing tile id -> time lit
 * @param {{conditions: {actors: Actor[], source: string|null}, lockOn: {actors: Actor[], source: string|null}}} targets
 *        Who clicks apply to: Lock On has its own (targeted) set
 * @param {(tileId: string, actor: Actor) => boolean} activeOn
 */
export function buildCaution(t, pending, targets, activeOn) {
  const i18n = game.i18n;
  const describe = set => {
    const actors = set.actors;
    return {
      actors,
      source: set.source,
      // Only mark tiles for the selection when it is something other than the mech on the panel
      differs: actors.length > 0 && !(actors.length === 1 && actors[0].uuid === t.uuid),
      name:
        actors.length === 1
          ? actors[0].name
          : actors.length > 1
            ? i18n.format("LFD.Apply.Many", { n: actors.length })
            : null,
    };
  };
  const conditions = describe(targets.conditions);
  const lockOn = describe(targets.lockOn);

  const tiles = TILES.map(tile => {
    const lit = !!tile.lit(t);
    const since = pending.warning.get(tile.id) ?? pending.caution.get(tile.id);
    const fresh = lit && since !== undefined;
    const label = tile.label ? tile.label(t) : `LFD.Tile.${tile.id}`;
    const set = tile.id === "lockon" ? lockOn : conditions;
    let sel = null;
    if (set.differs) {
      const count = set.actors.filter(a => activeOn(tile.id, a)).length;
      sel = count === 0 ? null : count === set.actors.length ? "all" : "some";
    }
    const action = tile.id === "dangerzone" && qolManagesDangerZone()
      ? i18n.localize("LFD.Apply.DangerZoneQol")
      : set.name
        ? i18n.format(HINT[tile.id] ?? "LFD.Apply.HintToggle", { condition: i18n.localize(label), target: set.name })
        : i18n.localize(tile.id === "lockon" ? "LFD.Apply.NoTarget" : "LFD.Apply.NoSelection");
    const detail = lit && tile.detail ? tile.detail(t) : null;
    // The hidden tile stands for Hidden, Invisible or both
    const hidden = t.flags[STATUS.HIDDEN];
    const invisible = t.flags[STATUS.INVISIBLE];
    const condition = tile.id === "hidden" && invisible && !hidden ? "invisible" : tile.id;
    const also = tile.id === "hidden" && invisible && hidden ? ["invisible"] : [];
    const name = i18n.localize(label);
    return {
      id: tile.id,
      kind: tile.kind,
      glyph: GLYPH[tile.kind],
      label,
      lit,
      fresh,
      // Negative delay resumes the 10 s fade where it is, even after a re-render
      alertDelay: fresh ? -(Date.now() - since) : 0,
      detail,
      sel,
      tooltip: conditionCard(condition, { title: name, detail, hint: action, also }),
      aria: [`${name}${detail ? ` ${detail}` : ""}: ${i18n.localize(lit ? "LFD.Caution.On" : "LFD.Caution.Off")}.`, conditionText(condition), action].filter(Boolean).join(" "),
    };
  });
  return {
    tiles,
    alertWarning: pending.warning.size > 0,
    alertCaution: pending.caution.size > 0,
    // The collapsed tab's alert glyph fades with the newest alert of its kind
    warningDelay: pending.warning.size ? -(Date.now() - Math.max(...pending.warning.values())) : 0,
    cautionDelay: pending.caution.size ? -(Date.now() - Math.max(...pending.caution.values())) : 0,
    applyTo: {
      name: conditions.name,
      differs: conditions.differs,
      panel: conditions.source === "panel",
      lockOnName: lockOn.name,
      lockOnDiffers: lockOn.differs,
      lockOnTargeted: lockOn.source === "targeted",
    },
  };
}
