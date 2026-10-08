import { MODULE_ID, SETTINGS } from "../constants.js";

/**
 * Reactor meltdown countdowns tick down at the end of the melting-down character's turn.
 *
 * The countdown is LANCER's own field (system.meltdown_timer), started from the panel's Meltdown tile
 * or Self-Destruct. LANCER only clears it on a Full Repair and nothing else advances it, so this does,
 * at the moment LANCER runs its own end-of-turn automation (Burn): a turn change in a combat, for the
 * combatant whose turn just ended. One client writes, the active GM's (LANCER's end-of-turn
 * automation runs on GM clients too); with no GM online nothing ticks and the tile's right-click
 * still works by hand. At T-0 a chat card tells the table. A world setting turns it off.
 */
export function registerMeltdownClock() {
  Hooks.on("updateCombat", (combat, changes, options) => {
    if (!("turn" in changes) || !game.users.activeGM?.isSelf) return;
    // A step back (LANCER's previous turn or round, the NPC Deck's Undo and Prev) ends no turn
    if (Number(options?.direction) < 0) return;
    if (!game.settings.get(MODULE_ID, SETTINGS.MELTDOWN_TICK)) return;
    const ended = combat.previous?.combatantId ? combat.combatants.get(combat.previous.combatantId) : null;
    const actor = ended?.actor;
    const timer = actor?.system?.meltdown_timer;
    if (!Number.isInteger(timer) || timer <= 0) return;
    ticks.set(tickKey(combat, ended.id, combat.previous.round), { actor: actor.uuid, from: timer });
    tick(actor, timer - 1).catch(err => console.error("Flight Deck | Meltdown countdown failed", err));
  });
}

/** Ticks made on this client, by combat, round and combatant: an undone turn gives its tick back. */
const ticks = new Map();
const tickKey = (combat, combatantId, round) => `${combat.id}:${round}:${combatantId}`;

/**
 * The turn that just ended is being undone (the NPC Deck's Undo): if its end ticked a meltdown countdown,
 * put the countdown back, unless something has changed it since. Only the client that ticked knows (the
 * active GM's); elsewhere this does nothing.
 */
export async function untickMeltdown(combat, combatantId) {
  const key = tickKey(combat, combatantId, combat.round);
  const record = ticks.get(key);
  if (!record) return;
  ticks.delete(key);
  const actor = await fromUuid(record.actor);
  if (actor?.system?.meltdown_timer === record.from - 1) await actor.update({ "system.meltdown_timer": record.from });
}

async function tick(actor, timer) {
  await actor.update({ "system.meltdown_timer": timer });
  if (timer > 0) return;
  const Flow = game.lancer?.flows?.get("SimpleTextFlow");
  if (!Flow) return;
  const i18n = game.i18n;
  await new Flow(actor, {
    title: i18n.localize("LFD.Meltdown.CardTitle"),
    description: `<p>${foundry.utils.escapeHTML(i18n.format("LFD.Meltdown.CardText", { name: actor.name }))}</p>`,
    tags: [],
  }).begin();
}
