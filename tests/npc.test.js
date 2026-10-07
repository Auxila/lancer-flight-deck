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
