import { MODULE_ID, QUERY_APPLY, SETTINGS, STATUS } from "../constants.js";

/**
 * Annunciator tiles as controls.
 *
 * Who a click applies to:
 *  - Lock On goes to the tokens you have TARGETED (it is something you put on an enemy);
 *    with no target it falls back to your selection, then to the mech on the panel.
 *  - Every other condition goes to the tokens you have SELECTED, falling back to the mech on
 *    the panel. Players can only select tokens they own, so they can only condition their own.
 *
 *  - Status tiles toggle. Across several tokens: if every one has it, remove it from all;
 *    otherwise add it to the ones missing it.
 *  - Burn and Overshield are numbers: click +1, right-click −1, Shift+click clears.
 *  - Hidden: click toggles Hidden, right-click toggles Invisible.
 *  - Meltdown: click starts a countdown (asks for turns) or clears it; right-click ticks it down.
 *
 * Lock On on a token the player doesn't own is applied by the active GM through a v13 user
 * query, if the world allows it. Nothing else is ever applied to tokens the user doesn't own.
 */

/** Tile id -> how clicking it changes an actor. */
export const TILE_ACTIONS = Object.freeze({
  exposed: { kind: "status", status: STATUS.EXPOSED },
  shredded: { kind: "status", status: STATUS.SHREDDED },
  stunned: { kind: "status", status: STATUS.STUNNED },
  meltdown: { kind: "meltdown" },
  lockon: { kind: "status", status: STATUS.LOCK_ON },
  jammed: { kind: "status", status: STATUS.JAMMED },
  impaired: { kind: "status", status: STATUS.IMPAIRED },
  dangerzone: { kind: "status", status: STATUS.DANGER_ZONE },
  slowed: { kind: "status", status: STATUS.SLOWED },
  immobilized: { kind: "status", status: STATUS.IMMOBILIZED },
  engaged: { kind: "status", status: STATUS.ENGAGED },
  prone: { kind: "status", status: STATUS.PRONE },
  burn: { kind: "counter", path: "system.burn" },
  overshield: { kind: "counter", path: "system.overshield.value" },
  hidden: { kind: "hidden" },
  shutdown: { kind: "status", status: STATUS.SHUT_DOWN },
});

/** The only tile whose condition may be put on a token the user doesn't own. */
export const LOCK_ON_TILE = "lockon";

const statusRegistered = id => CONFIG.statusEffects.some(s => s.id === id);

function uniqueActors(tokens) {
  const seen = new Map();
  for (const token of tokens) {
    const actor = token.actor;
    if (actor && !seen.has(actor.uuid)) seen.set(actor.uuid, actor);
  }
  return [...seen.values()];
}

/**
 * The actors a click on this tile applies to.
 * @param {string} tileId
 * @param {Actor|null} panelActor  The mech on the panel, the fallback when nothing is selected
 * @returns {{actors: Actor[], source: "targeted"|"selected"|"panel"|null}}
 */
export function targetsFor(tileId, panelActor = null) {
  if (tileId === LOCK_ON_TILE) {
    const targeted = uniqueActors(game.user.targets);
    if (targeted.length) return { actors: targeted, source: "targeted" };
  }
  const selected = canvas?.ready ? uniqueActors(canvas.tokens.controlled) : [];
  if (selected.length) return { actors: selected, source: "selected" };
  if (panelActor?.isOwner) return { actors: [panelActor], source: "panel" };
  return { actors: [], source: null };
}

/** Whether a tile's condition is present on an actor (for selection feedback). */
export function tileActiveOn(tileId, actor) {
  const action = TILE_ACTIONS[tileId];
  if (!action || !actor) return false;
  const has = id => actor.statuses?.has(id);
  switch (action.kind) {
    case "status":
      return has(action.status);
    case "counter":
      return Number(foundry.utils.getProperty(actor, action.path)) > 0;
    case "hidden":
      return has(STATUS.HIDDEN) || has(STATUS.INVISIBLE);
    case "meltdown":
      return Number.isInteger(actor.system?.meltdown_timer) || has(STATUS.MELTDOWN);
  }
  return false;
}

/**
 * Work out the concrete operation for a click, once, across the whole selection.
 * @param {string} tileId
 * @param {Actor[]} actors
 * @param {{secondary?: boolean, clear?: boolean}} input  secondary = right-click, clear = Shift
 * @returns {Promise<object|null>}
 */
async function planOperation(tileId, actors, { secondary = false, clear = false }) {
  const action = TILE_ACTIONS[tileId];
  if (!action) return null;
  const all = predicate => actors.every(predicate);
  switch (action.kind) {
    case "status": {
      const active = !all(a => a.statuses?.has(action.status));
      return { type: "status", status: action.status, active };
    }
    case "hidden": {
      const status = secondary ? STATUS.INVISIBLE : STATUS.HIDDEN;
      return { type: "status", status, active: !all(a => a.statuses?.has(status)) };
    }
    case "counter":
      if (clear) return { type: "counter", path: action.path, set: 0 };
      return { type: "counter", path: action.path, delta: secondary ? -1 : 1 };
    case "meltdown": {
      if (secondary) return { type: "meltdownTick" };
      if (actors.some(a => tileActiveOn("meltdown", a))) return { type: "meltdown", timer: null };
      const turns = await promptMeltdownTurns();
      return turns === null ? null : { type: "meltdown", timer: turns };
    }
  }
  return null;
}

async function promptMeltdownTurns() {
  const label = game.i18n.localize("LFD.Meltdown.Turns");
  try {
    const value = await foundry.applications.api.DialogV2.prompt({
      window: { title: "LFD.Meltdown.Title", icon: "fa-solid fa-radiation" },
      content:
        `<p>${game.i18n.localize("LFD.Meltdown.Body")}</p>` +
        `<div class="form-group"><label>${label}</label>` +
        `<input type="number" name="turns" value="1" min="0" max="20" step="1" autofocus></div>`,
      ok: {
        label: "LFD.Meltdown.Start",
        callback: (_event, button) => button.form.elements.turns.valueAsNumber,
      },
      rejectClose: false,
    });
    if (!Number.isFinite(value)) return null;
    return Math.max(0, Math.min(20, Math.round(value)));
  } catch {
    return null;
  }
}

/** Apply an operation to one actor this client may modify. */
async function execute(actor, op) {
  switch (op.type) {
    case "status":
      if (!statusRegistered(op.status)) throw new Error(`status "${op.status}" is not registered`);
      return actor.toggleStatusEffect(op.status, { active: op.active });
    case "counter": {
      const current = Number(foundry.utils.getProperty(actor, op.path)) || 0;
      const next = op.set ?? Math.max(0, current + op.delta);
      if (next === current) return;
      return actor.update({ [op.path]: next });
    }
    case "meltdown":
    case "meltdownTick": {
      if (!("meltdown_timer" in (actor.system ?? {}))) return; // only mechs and NPCs melt down
      const current = actor.system.meltdown_timer;
      const timer = op.type === "meltdown" ? op.timer : Number.isInteger(current) ? Math.max(0, current - 1) : null;
      if (op.type === "meltdownTick" && timer === null) return;
      await actor.update({ "system.meltdown_timer": timer });
      // Mirror on the token if the world's icon set includes the Reactor Meltdown status
      if (statusRegistered(STATUS.MELTDOWN)) await actor.toggleStatusEffect(STATUS.MELTDOWN, { active: timer !== null });
      return;
    }
  }
  throw new Error(`unknown operation ${op?.type}`);
}

/** The one operation a player may request on a token they don't own: Lock On, on or off. */
function isRemoteLockOn(op) {
  return op?.type === "status" && op.status === STATUS.LOCK_ON && typeof op.active === "boolean";
}

/**
 * Apply a tile click to the current selection.
 * @returns {Promise<{applied: number, failed: number}>}
 */
export async function applyTile(tileId, input = {}, panelActor = null) {
  const { actors } = targetsFor(tileId, panelActor);
  if (!actors.length) {
    ui.notifications.warn(game.i18n.localize(tileId === LOCK_ON_TILE ? "LFD.Apply.NoTarget" : "LFD.Apply.NoSelection"));
    return { applied: 0, failed: 0 };
  }
  const op = await planOperation(tileId, actors, input);
  if (!op) return { applied: 0, failed: 0 };
  return applyOperation(op, actors, tileId);
}

/**
 * Apply one operation to several actors: owned ones directly, unowned ones (Lock On only)
 * through the active GM.
 * @returns {Promise<{applied: number, failed: number}>}
 */
async function applyOperation(op, actors, label) {
  let applied = 0;
  let failed = 0;
  const allowLockOn = game.settings.get(MODULE_ID, SETTINGS.PLAYER_LOCK_ON);
  for (const actor of actors) {
    try {
      if (actor.isOwner) await execute(actor, op);
      else if (!isRemoteLockOn(op)) throw new Error(game.i18n.localize("LFD.Apply.NotOwned"));
      else {
        const gm = game.users.activeGM;
        if (!allowLockOn) throw new Error(game.i18n.localize("LFD.Apply.NotAllowed"));
        if (!gm) throw new Error(game.i18n.localize("LFD.Apply.NoGM"));
        await gm.query(QUERY_APPLY, { actorUuid: actor.uuid, op, requester: game.user.id }, { timeout: 8000 });
      }
      applied++;
    } catch (err) {
      failed++;
      console.warn(`Flight Deck | Could not apply ${label} to ${actor.name}`, err);
      ui.notifications.warn(game.i18n.format("LFD.Apply.Failed", { name: actor.name, reason: err.message }));
    }
  }
  return { applied, failed };
}

/**
 * Set a status on specific actors (HUD actions: Lock On on targets, Hide / Shut Down on self).
 * Same ownership rules as the tiles: only Lock On may reach tokens the user doesn't own.
 */
export async function setStatus(actors, status, active) {
  return applyOperation({ type: "status", status, active }, actors, status);
}

/** Start a Reactor Meltdown countdown on an actor (asks how many turns). Self-Destruct uses it. */
export async function startMeltdown(actor) {
  const turns = await promptMeltdownTurns();
  if (turns === null) return false;
  const { applied } = await applyOperation({ type: "meltdown", timer: turns }, [actor], "meltdown");
  return applied > 0;
}

/** Register the GM-side handler. Runs on every client; only an active GM ever receives queries. */
export function registerConditionQuery() {
  CONFIG.queries[QUERY_APPLY] = async ({ actorUuid, op, requester } = {}) => {
    if (!game.user.isGM) throw new Error("Only a GM applies remote conditions");
    if (!game.settings.get(MODULE_ID, SETTINGS.PLAYER_LOCK_ON)) throw new Error("Disabled by the GM");
    // Players may only Lock On tokens they don't own; every other request is refused
    if (!isRemoteLockOn(op)) throw new Error("Rejected: only Lock On can be applied to tokens you don't own");
    const actor = await fromUuid(actorUuid);
    if (!(actor instanceof Actor)) throw new Error("No such actor");
    // Only a token in play that players can see: never the sidebar base of unlinked tokens, never a hidden token
    // (a world actor counts through its linked tokens; a placed token can be linked whatever the prototype says)
    const tokens = actor.isToken ? [actor.token] : (actor.getDependentTokens?.({ linked: true }) ?? []);
    if (!tokens.some(t => t && !t.hidden)) throw new Error("Rejected: not a visible token in play");
    console.info(`Flight Deck | ${game.users.get(requester)?.name ?? "A player"} applied`, op, "to", actor.name);
    await execute(actor, op);
    return true;
  };
}
