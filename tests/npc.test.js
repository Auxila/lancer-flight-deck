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
