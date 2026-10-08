import { MODULE_ID, MOVE_FLAG, SETTINGS } from "../constants.js";
import { combatOf, inActiveCombat } from "../actions/runner.js";

/** Movement methods that are the mech moving itself: a drag on the map, or the arrow keys. */
const OWN_MOVES = new Set(["dragging", "keyboard"]);

/**
 * Moving a mech's token on the map is movement: a drag (or the arrow keys) spends LANCER's movement
 * (`system.action_tracker.move`, the MOVE light's count) by what Foundry measured for the path, in grid
 * spaces, difficult terrain included. Being displaced (pushed, pulled, teleported by the GM), pasted,
 * moved by a script or from the token's config costs nothing. Undoing a move (Ctrl+Z) gives back what it
 * cost. It follows the world setting "HUD menus spend actions" (in combat / always / never).
 *
 * One client writes: the one whose user moved the token (the owner, or a GM moving it for them).
 */
export function registerMovementTracker() {
  // An undo rolls Foundry's recorded movement back: note what was recorded before, to refund the difference
  Hooks.on("preMoveToken", (doc, movement) => {
    if (movement.method !== "undo" || !isMech(doc)) return;
    undone.set(movement.id, recordedSpaces(doc));
  });
  Hooks.on("moveToken", (doc, movement, operation, user) => {
    if (!user?.isSelf || !isMech(doc)) return;
    const actor = doc.actor;
    if (!actor?.isOwner || !spends(actor)) return;
    if (movement.method === "undo") {
      const before = undone.get(movement.id);
      undone.delete(movement.id);
      if (before === undefined) return;
      const refund = before - recordedSpaces(doc);
      if (refund > 0) queueMove(actor, refund, doc);
      return;
    }
    if (!OWN_MOVES.has(movement.method)) return;
    const spaces = movementSpaces(movement.passed, gridDistance(doc));
    if (spaces > 0) queueMove(actor, -spaces, doc);
  });
}

/** Undo movement id -> spaces recorded before it. */
const undone = new Map();

/**
 * Spaces a stretch of movement costs: the sum of Foundry's per-step costs (terrain included) in grid
 * spaces, leaving out displacement, which is something done to the token, not its own move.
 * @param {{waypoints?: {action: string, cost: number}[]}} section
 * @param {number} gridDistance  scene units per grid space
 */
export function movementSpaces(section, gridDistance) {
  if (!(gridDistance > 0)) return 0;
  const cost = (section?.waypoints ?? []).reduce((sum, w) => (w.action === "displace" || !Number.isFinite(w.cost) ? sum : sum + w.cost), 0);
  return Math.round(cost / gridDistance);
}

/** What the token's recorded movement (this turn, in a started combat) has cost so far, in spaces. */
function recordedSpaces(doc) {
  return movementSpaces({ waypoints: doc.movementHistory ?? [] }, gridDistance(doc));
}

function gridDistance(doc) {
  return Number(doc.parent?.grid?.distance ?? canvas?.scene?.grid?.distance) || 1;
}

function isMech(doc) {
  return doc?.actor?.type === "mech";
}

/** The same rule as the HUD menus: spend in combat, always, or never. */
function spends(actor) {
  const mode = game.settings.get(MODULE_ID, SETTINGS.SPEND_ACTIONS);
  return mode === "always" || (mode === "combat" && inActiveCombat(actor));
}

/**
 * Movement changes for one actor, one after another: a drag across several checkpoints sends several
 * moves in quick succession, and each must see the count the last one left.
 */
const queues = new WeakMap();
function queueMove(actor, delta, doc) {
  const run = () => applyMove(actor, delta, doc);
  const next = (queues.get(actor) ?? Promise.resolve()).then(run, run);
  queues.set(actor, next.catch(err => console.error("Flight Deck | Could not track movement", err)));
  return next;
}

/** Spend (negative) or give back (positive) spaces; never below 0. Moving past what's left says so. */
async function applyMove(actor, delta, doc) {
  const left = Number(actor.system?.action_tracker?.move) || 0;
  const next = Math.max(0, left + delta);
  if (next !== left) await actor.update({ "system.action_tracker.move": next });
  if (delta < 0 && -delta > left) {
    const over = -delta - left;
    ui.notifications.info(game.i18n.format(over === 1 ? "LFD.Move.OverOne" : "LFD.Move.Over", { name: doc.name ?? actor.name, n: over }));
  }
}

/**
 * Which turn a mech's movement belongs to: the round of the started combat it's in (the one where it's
 * acting, if any), or "free" out of combat. A Boost's allowance only counts for that turn.
 */
export function moveTurnKey(actor) {
  const combat = combatOf(actor);
  return combat ? `${combat.id}:${combat.round}` : "free";
}

/**
 * The turn's movement allowance, for the MOVE light's "left / allowance": Speed, or what Boosts made it this
 * turn; never less than what's left (a hand-edited count reads 7/7, not 7/5).
 * @param {{speed: number, move: number, boost?: {key: string, value: number}|null, key: string}} state
 */
export function moveAllowance({ speed, move, boost = null, key }) {
  const granted = boost && boost.key === key && Number.isFinite(boost.value) ? boost.value : speed;
  return Math.max(granted, move, 0);
}

/**
 * Boost: move your Speed again. Adds Speed to what's left and to the turn's allowance, in one update.
 */
export async function boostMovement(actor) {
  const speed = Number(actor.system?.speed) || 0;
  const left = Number(actor.system?.action_tracker?.move) || 0;
  const key = moveTurnKey(actor);
  const prior = actor.flags?.[MODULE_ID]?.[MOVE_FLAG];
  const allowance = moveAllowance({ speed, move: left, boost: prior, key }) + speed;
  await actor.update({ "system.action_tracker.move": left + speed, [`flags.${MODULE_ID}.${MOVE_FLAG}`]: { key, value: allowance } });
}

/**
 * The Move menu's reset: LANCER's movement back to Speed (any Boost's allowance gone with it), and
 * Foundry's record of the turn's movement cleared too, so the ruler's distance moved starts over with it.
 */
export async function resetMovement(actor) {
  await actor.update({ "system.action_tracker.move": Number(actor.system?.speed) || 0, [`flags.${MODULE_ID}.-=${MOVE_FLAG}`]: null });
  for (const token of actor.getActiveTokens(false, true)) {
    if (token.isOwner && token.movementHistory?.length) await token.clearMovementHistory();
  }
}
