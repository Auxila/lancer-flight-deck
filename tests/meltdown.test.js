import { test } from "node:test";
import assert from "node:assert/strict";

/** Just enough Foundry for the countdown: its hook, the active GM, the setting, a melting-down actor. */
function world(timer) {
  const handlers = {};
  const actor = {
    uuid: "Actor.melting",
    system: { meltdown_timer: timer },
    update: async changes => {
      actor.system.meltdown_timer = changes["system.meltdown_timer"];
    },
  };
  globalThis.Hooks = { on: (name, fn) => (handlers[name] = fn) };
  globalThis.fromUuid = async () => actor;
  globalThis.game = { users: { activeGM: { isSelf: true } }, settings: { get: () => true }, lancer: null };
  const ended = { id: "c1", actor };
  const combat = { id: "fight", round: 2, previous: { round: 2, turn: 0, combatantId: "c1" }, combatants: { get: id => (id === "c1" ? ended : null) } };
  return { handlers, actor, combat };
}

const settle = () => new Promise(r => setTimeout(r, 0));

test("the meltdown countdown ticks when a turn ends, never on a step back, and an undone turn gives its tick back once", async () => {
  const { registerMeltdownClock, untickMeltdown } = await import("../src/core/MeltdownClock.js");
  const { handlers, actor, combat } = world(3);
  registerMeltdownClock();

  // LANCER's previous turn / round (and the NPC Deck's Undo and Prev) step back: no turn ended
  handlers.updateCombat(combat, { turn: null }, { direction: -1 });
  await settle();
  assert.equal(actor.system.meltdown_timer, 3, "a step back doesn't tick");

  // A turn ends: one tick
  handlers.updateCombat(combat, { turn: null }, { direction: 1 });
  await settle();
  assert.equal(actor.system.meltdown_timer, 2);

  // That ended turn is undone: the tick comes back, and only once
  await untickMeltdown(combat, "c1");
  assert.equal(actor.system.meltdown_timer, 3);
  await untickMeltdown(combat, "c1");
  assert.equal(actor.system.meltdown_timer, 3, "a second undo gives nothing more back");

  // Something else changed the countdown since the tick: Undo leaves it alone
  handlers.updateCombat(combat, { turn: null }, {});
  await settle();
  actor.system.meltdown_timer = 1;
  await untickMeltdown(combat, "c1");
  assert.equal(actor.system.meltdown_timer, 1);
});
