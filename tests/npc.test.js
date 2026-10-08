import { test } from "node:test";
import assert from "node:assert/strict";
import { featureState, featureTier } from "../src/npc/NpcRoster.js";

const feature = (system = {}) => ({ system: { tags: [], ...system } });
const tag = (lid, val = "") => ({ lid, val });

test("a plain feature is ready", () => {
  assert.equal(featureState(feature()), "ready");
});

test("destroyed beats everything", () => {
  assert.equal(featureState(feature({ destroyed: true, tags: [tag("tg_recharge", "5")], charged: false })), "destroyed");
});

test("Limited with no uses left is spent", () => {
  assert.equal(featureState(feature({ tags: [tag("tg_limited", "2")], uses: { value: 0, max: 2 } })), "spent");
  assert.equal(featureState(feature({ tags: [tag("tg_limited", "2")], uses: { value: 1, max: 2 } })), "ready");
});

test("Recharge waits on a roll until charged", () => {
  assert.equal(featureState(feature({ tags: [tag("tg_recharge", "5")], charged: false })), "uncharged");
  assert.equal(featureState(feature({ tags: [tag("tg_recharge", "5")], charged: true })), "ready");
});

test("a feature reads its numbers at its override tier, else the NPC's", () => {
  const npc = tier => ({ system: { tier } });
  assert.equal(featureTier(feature(), npc(2)), 2);
  assert.equal(featureTier(feature({ tier_override: 3 }), npc(1)), 3);
  assert.equal(featureTier(feature({ tier_override: 0 }), npc(3)), 3);
  assert.equal(featureTier(feature(), null), 1);
});

test("the deck runs the scene's active encounter, else the tracker's, else the latest started", async () => {
  const { pickCombat } = await import("../src/npc/NpcRoster.js");
  const here = { id: "here" }, there = { id: "there" };
  const c = (id, { started = true, active = false, scene = here } = {}) => ({ id, started, active, scene });
  const old = c("old");
  const fresh = c("new", { active: true });
  assert.equal(pickCombat([old, fresh], old, here), fresh, "a new active encounter wins over a stale view");
  assert.equal(pickCombat([old, c("idle", { started: false, active: true })], old, here), old, "an active encounter that hasn't started doesn't count");
  assert.equal(pickCombat([old, c("b")], null, here)?.id, "b", "with nothing active or viewed, the latest started");
  assert.equal(pickCombat([c("away", { active: true, scene: there })], null, here), null, "never another scene's");
  assert.equal(pickCombat([c("global", { scene: null })], null, here)?.id, "global", "an encounter not tied to a scene counts everywhere");
  assert.equal(pickCombat([], null, here), null);
});

/* The deck's roster, 0.8.2 */

test("twins get numbers in the scene's order; names of their own get none", async () => {
  const { duplicateNumbers } = await import("../src/npc/NpcRoster.js");
  const d = duplicateNumbers([{ id: "a", name: "Test Hostile" }, { id: "b", name: "Gladiator" }, { id: "c", name: "test hostile " }, { id: "d", name: "Gladiator A" }]);
  assert.deepEqual([...d.entries()], [["a", 1], ["c", 2]]);
});

test("strip labels keep what tells units apart", async () => {
  const { shortLabel } = await import("../src/npc/NpcRoster.js");
  assert.equal(shortLabel("Squad 3"), "Squad 3");
  assert.equal(shortLabel("Gladiator A"), "Gladi… A");
  assert.equal(shortLabel("Gladiator"), "Gladiat…");
  assert.equal(shortLabel("Interceptor"), "Interce…");
  assert.equal(shortLabel("Assault Hound IV"), "Assa… IV");
  assert.equal(shortLabel(""), "");
});

test("the roster runs in turn order: acting, to act, done, then the destroyed (folded unless shown or open)", async () => {
  const { rosterSections } = await import("../src/npc/NpcRoster.js");
  const r = (id, o = {}) => ({ id, isTurn: false, canAct: false, destroyed: false, outside: false, expanded: false, ...o });
  const rows = [r("done1"), r("ready1", { canAct: true }), r("acting", { isTurn: true }), r("dead", { destroyed: true }), r("ready2", { canAct: true }), r("out", { outside: true })];
  const ids = list => list.map(e => (e.section ? `[${e.section.id}${e.section.open === false ? "+" : ""}]` : e.id));
  assert.deepEqual(ids(rosterSections(rows, { combat: true, showFallen: false })), ["out", "[acting]", "acting", "[ready]", "ready1", "ready2", "[done]", "done1", "[fallen+]"]);
  assert.deepEqual(ids(rosterSections(rows, { combat: true, showFallen: true })).slice(-2), ["[fallen]", "dead"]);
  const openDead = rows.map(x => (x.id === "dead" ? { ...x, expanded: true } : x));
  assert.deepEqual(ids(rosterSections(openDead, { combat: true, showFallen: false })).slice(-2), ["[fallen]", "dead"], "an open row always shows");
  assert.deepEqual(ids(rosterSections(rows, { combat: false, showFallen: false })), ["out", "done1", "ready1", "acting", "ready2", "[fallen+]"], "out of combat: one list");
});

test("an attack's numbers fit on its button", async () => {
  const { featureLine } = await import("../src/npc/NpcRoster.js");
  const npc = { system: { tier: 2 } };
  const weapon = { system: { type: "Weapon", tags: [], attack_bonus: [1, 2, 3], accuracy: [0, 1, 0], range: [{ type: "Threat", val: 1 }], damage: [[{ type: "Kinetic", val: 4 }], [{ type: "Kinetic", val: 5 }, { type: "Burn", val: 2 }], []] } };
  assert.equal(featureLine(weapon, npc), "+2 · +1 acc · Thr 1 · 5 Kin + 2 Burn");
  const tech = { system: { type: "Tech", tech_attack: true, tags: [], attack_bonus: [2, 2, 2], range: [{ type: "Range", val: 10 }], damage: [[], [], []] } };
  assert.equal(featureLine(tech, npc), "+2 tech · Rng 10");
  assert.equal(featureLine({ system: { type: "Trait", tags: [] } }, npc), null);
});

test("the open row's turn buttons: Activate takes its turn, End activation finishes it, and each says why when off", async () => {
  const { turnCommands } = await import("../src/npc/NpcRoster.js");
  const row = over => ({ inCombat: true, combatantId: "c1", isTurn: false, canAct: true, destroyed: false, activationsLeft: 1, ...over });
  const why = cmds => [cmds.activate.on, cmds.activate.why, cmds.end.on, cmds.end.why];
  assert.equal(turnCommands(row(), { started: false }), null, "no started combat: no buttons");
  assert.deepEqual(why(turnCommands(row(), { started: true })), [true, "ready", false, "notActing"]);
  const cut = turnCommands(row(), { started: true, acting: { id: "p1", name: "Kitbash" } });
  assert.deepEqual([cut.activate.why, cut.activate.name], ["interrupts", "Kitbash"], "says whose turn it would end");
  assert.deepEqual(why(turnCommands(row({ isTurn: true, activationsLeft: 0 }), { started: true, acting: { id: "c1", name: "x" } })), [false, "acting", true, "end"]);
  const elite = turnCommands(row({ isTurn: true, activationsLeft: 1 }), { started: true, acting: { id: "c1", name: "x" } });
  assert.deepEqual([elite.end.why, elite.end.more], ["more", 1], "an Elite hears it has another activation");
  assert.deepEqual(why(turnCommands(row({ canAct: false, activationsLeft: 0 }), { started: true })), [false, "spent", false, "notActing"]);
  assert.deepEqual(why(turnCommands(row({ canAct: false, destroyed: true }), { started: true })), [false, "destroyed", false, "notActing"]);
  assert.deepEqual(turnCommands(row({ inCombat: false, canAct: false, combatantId: null }), { started: true }), { add: true }, "outside the combat: Add to combat instead");
  assert.equal(turnCommands(row({ inCombat: false, canAct: false, combatantId: null, destroyed: true }), { started: true }), null, "a destroyed NPC outside isn't offered back in");
});

test("the round is complete once nobody is acting and nobody standing has an activation left", async () => {
  const { roundComplete } = await import("../src/npc/NpcRoster.js");
  const c = (left, isDefeated = false) => ({ activations: { value: left }, isDefeated });
  const combat = (combatants, over = {}) => ({ started: true, combatant: undefined, combatants, ...over });
  assert.equal(roundComplete(null), false);
  assert.equal(roundComplete(combat([c(0), c(0)])), true);
  assert.equal(roundComplete(combat([c(0), c(1)])), false, "someone still to act");
  assert.equal(roundComplete(combat([c(0), c(1, true)])), true, "the defeated don't hold it up");
  assert.equal(roundComplete(combat([c(0)], { combatant: c(0) })), false, "someone is acting (their last activation)");
  assert.equal(roundComplete(combat([c(0)], { started: false })), false, "not started");
  assert.equal(roundComplete(combat([])), false, "nobody in it");
  assert.equal(roundComplete(combat([c(0, true)])), false, "only the defeated");
});

test("Undo takes back the turn in progress, or gives back the activation that just ended (once)", async () => {
  const { undoTarget } = await import("../src/npc/NpcRoster.js");
  const unit = (id, value, max = 1) => ({ id, name: id.toUpperCase(), activations: { value, max } });
  const combat = (list, over = {}) => {
    const byId = new Map(list.map(c => [c.id, c]));
    return { started: true, round: 2, combatant: undefined, previous: null, combatants: { get: id => byId.get(id), [Symbol.iterator]: () => byId.values() }, ...over };
  };
  assert.equal(undoTarget(null), null);
  assert.equal(undoTarget(combat([unit("a", 0)], { started: false })), null, "not started");
  const a = unit("a", 0);
  assert.deepEqual(undoTarget(combat([a], { combatant: a })), { kind: "acting", id: "a", name: "A" }, "someone acting: LANCER's previous turn");
  const ended = combat([unit("a", 0)], { previous: { round: 2, turn: 0, combatantId: "a" } });
  assert.deepEqual(undoTarget(ended), { kind: "ended", id: "a", name: "A" }, "the turn that just ended");
  assert.equal(undoTarget(combat([unit("a", 1)], { previous: { round: 2, turn: 0, combatantId: "a" } })), null, "already given back: once only");
  assert.equal(undoTarget(combat([unit("a", 0)], { previous: { round: 1, turn: 0, combatantId: "a" } })), null, "last round's turn");
  assert.equal(undoTarget(combat([unit("a", 0)], { previous: { round: 2, turn: null, combatantId: undefined } })), null, "nothing ended");
  assert.deepEqual(undoTarget(combat([unit("e", 1, 2)], { previous: { round: 2, turn: 0, combatantId: "e" } }))?.kind, "ended", "an Elite with one of two left");
});

test("Undo can't give an Elite back an activation it never spent", async () => {
  const { undoTarget } = await import("../src/npc/NpcRoster.js");
  const elite = { id: "e", name: "Elite", activations: { value: 0, max: 2 } };
  const combat = { id: "fight", started: true, round: 3, combatant: undefined, previous: { round: 3, turn: 0, combatantId: "e" }, combatants: { get: id => (id === "e" ? elite : null) } };
  // Its second turn just ended: Undo gives that one back
  assert.equal(undoTarget(combat)?.kind, "ended");
  elite.activations.value = 1;
  const undone = { combat: "fight", round: 3, combatantId: "e", value: 1 };
  assert.equal(undoTarget(combat, { undone }), null, "not a second time");
  // It acts again and ends that turn: that one can be undone
  elite.activations.value = 0;
  assert.equal(undoTarget(combat, { undone })?.kind, "ended");
  // Undo while acting (LANCER's previous turn) leaves it with one: no "ended" Undo on top of it
  elite.activations.value = 1;
  assert.equal(undoTarget(combat, { undone: { combat: "fight", round: 3, combatantId: "e", value: 1 } }), null);
  // Another unit's record, or last round's, doesn't block this one
  elite.activations.value = 0;
  assert.equal(undoTarget(combat, { undone: { combat: "fight", round: 3, combatantId: "other", value: 1 } })?.kind, "ended");
  assert.equal(undoTarget(combat, { undone: { combat: "fight", round: 2, combatantId: "e", value: 1 } })?.kind, "ended");
});

test("still to act: anyone with an activation left, or acting; never the defeated", async () => {
  const { stillToAct } = await import("../src/npc/NpcRoster.js");
  const c = (id, value, isDefeated = false) => ({ id, activations: { value }, isDefeated });
  const acting = c("b", 0);
  const list = [c("a", 1), acting, c("x", 0), c("d", 1, true)];
  assert.deepEqual(stillToAct({ started: true, combatant: acting, combatants: list }).map(u => u.id), ["a", "b"]);
  assert.deepEqual(stillToAct({ started: false, combatants: list }), []);
});

test("a destroyed NPC has no turns: it isn't still to act and doesn't hold up the round, defeated or not", async () => {
  const { outOfFight, roundComplete, stillToAct } = await import("../src/npc/NpcRoster.js");
  const npc = (structure, extra = {}) => ({ type: "npc", system: { structure: { value: structure, max: 2 }, ...extra } });
  const wreck = { id: "w", activations: { value: 1, max: 1 }, isDefeated: false, actor: npc(0) };
  const flagged = { id: "f", activations: { value: 2, max: 2 }, isDefeated: false, actor: npc(2, { destroyed: true }) };
  const done = { id: "d", activations: { value: 0, max: 1 }, isDefeated: false, actor: npc(2) };
  const mech = { id: "m", activations: { value: 1, max: 1 }, isDefeated: false, actor: { type: "mech", system: { structure: { value: 0, max: 4 } } } };
  assert.equal(outOfFight(wreck), true, "out of structure");
  assert.equal(outOfFight(flagged), true, "flagged destroyed");
  assert.equal(outOfFight(done), false);
  assert.equal(outOfFight(mech), false, "a mech isn't an NPC: its pilot may still act");
  const combat = list => ({ started: true, combatant: undefined, combatants: list });
  assert.deepEqual(stillToAct(combat([wreck, flagged, done])), []);
  assert.equal(roundComplete(combat([wreck, flagged, done])), true);
  assert.equal(roundComplete(combat([wreck, done, mech])), false, "the mech still has a turn");
});

test("reserves: hidden, standing NPC tokens not in the fight; a folded section after the turn order, before the destroyed", async () => {
  const { reserveTokens, rosterSections, turnCommands } = await import("../src/npc/NpcRoster.js");
  const npc = (structure = 1) => ({ type: "npc", system: { structure: { value: structure, max: 1 } } });
  const tok = (id, over = {}) => ({ id, hidden: false, actor: npc(), ...over });
  const inFight = new Set(["fighting"]);
  const combat = { started: true, getCombatantsByToken: t => (inFight.has(t.id) ? [{}] : []) };
  const tokens = [tok("visible"), tok("waiting", { hidden: true }), tok("fighting", { hidden: true }), tok("wreck", { hidden: true, actor: npc(0) }), tok("pc", { hidden: true, actor: { type: "mech", system: {} } })];
  assert.deepEqual(reserveTokens(tokens, combat).map(t => t.id), ["waiting"], "hidden, standing, an NPC, not in the fight");
  assert.deepEqual(reserveTokens(tokens, { started: false }), [], "no fight, no reserves");

  const row = (id, over = {}) => ({ id, outside: false, destroyed: false, isTurn: false, canAct: true, expanded: false, ...over });
  const rows = [row("ready"), row("res", { reserve: true }), row("dead", { destroyed: true })];
  const ids = list => list.map(e => (e.section ? `[${e.section.id}${e.section.open === false ? "+" : ""}]` : e.id));
  assert.deepEqual(ids(rosterSections(rows, { combat: true, showFallen: false })), ["[ready]", "ready", "[reserves+]", "[fallen+]"]);
  assert.deepEqual(ids(rosterSections(rows, { combat: true, showFallen: false, showReserves: true })), ["[ready]", "ready", "[reserves]", "res", "[fallen+]"]);
  const openRes = [row("ready"), row("res", { reserve: true, expanded: true })];
  assert.deepEqual(ids(rosterSections(openRes, { combat: true, showFallen: false })).slice(-2), ["[reserves]", "res"], "an open reserve always shows");

  const out = over => ({ inCombat: false, combatantId: null, isTurn: false, canAct: false, destroyed: false, hidden: false, activationsLeft: 0, ...over });
  assert.deepEqual(turnCommands(out({ hidden: true }), { started: true }), { deploy: true }, "a hidden NPC outside: Deploy");
  assert.deepEqual(turnCommands(out(), { started: true }), { add: true });
  assert.equal(turnCommands(out({ hidden: true, destroyed: true }), { started: true }), null);
});
