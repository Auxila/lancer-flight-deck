import { test } from "node:test";
import assert from "node:assert/strict";
import { planWeapons } from "../src/actions/weaponRules.js";

// A loadout with every case: Main/Aux mount, a lone Auxiliary, a Heavy, a Superheavy
const RIFLE = { id: "rifle", mount: 0, size: "Main" };
const PISTOL = { id: "pistol", mount: 0, size: "Auxiliary" };
const KNIFE = { id: "knife", mount: 1, size: "Auxiliary" };
const NEXUS = { id: "nexus", mount: 1, size: "Auxiliary" };
const HMG = { id: "hmg", mount: 2, size: "Heavy" };
const CANNON = { id: "cannon", mount: 3, size: "Superheavy" };
const ALL = [RIFLE, PISTOL, KNIFE, NEXUS, HMG, CANNON];
const shot = (w, aux = false) => ({ ...w, aux });
const allowed = plan => [...plan.options].filter(([, o]) => o.allowed).map(([id]) => id);

test("skirmish: any weapon but a Superheavy", () => {
  const plan = planWeapons("skirmish", ALL);
  assert.equal(plan.phase, "primary");
  assert.deepEqual(allowed(plan), ["rifle", "pistol", "knife", "nexus", "hmg"]);
  assert.equal(plan.options.get("cannon").reason, "superheavyBarrage");
});

test("skirmish: then a different Auxiliary on the same mount, once", () => {
  let plan = planWeapons("skirmish", ALL, [shot(RIFLE)]);
  assert.equal(plan.phase, "aux");
  assert.deepEqual(allowed(plan), ["pistol"]);
  plan = planWeapons("skirmish", ALL, [shot(KNIFE)]);
  assert.deepEqual(allowed(plan), ["nexus"]); // different weapon, same mount
  plan = planWeapons("skirmish", ALL, [shot(RIFLE), shot(PISTOL, true)]);
  assert.equal(plan.phase, "done");
  plan = planWeapons("skirmish", ALL, [shot(HMG)]);
  assert.equal(plan.phase, "done"); // no Auxiliary on the Heavy mount
});

test("overwatch follows the skirmish rules", () => {
  assert.equal(planWeapons("overwatch", ALL).options.get("cannon").reason, "superheavyBarrage");
  assert.deepEqual(allowed(planWeapons("overwatch", ALL, [shot(RIFLE)])), ["pistol"]);
});

test("barrage: two weapons, or one Superheavy", () => {
  let plan = planWeapons("barrage", ALL);
  assert.deepEqual(allowed(plan), ["rifle", "pistol", "knife", "nexus", "hmg", "cannon"]);
  plan = planWeapons("barrage", ALL, [shot(RIFLE)]);
  assert.equal(plan.phase, "primary");
  assert.equal(plan.made, 1);
  assert.equal(plan.options.get("cannon").reason, "superheavyWhole");
  assert.equal(plan.options.get("rifle").reason, "fired");
  plan = planWeapons("barrage", ALL, [shot(CANNON)]);
  assert.equal(plan.needed, 1);
  assert.equal(plan.phase, "done"); // nothing Auxiliary on the Superheavy's mount
});

test("barrage: one Auxiliary follow-up per mount fired, never one already fired", () => {
  let plan = planWeapons("barrage", ALL, [shot(RIFLE), shot(KNIFE)]);
  assert.equal(plan.phase, "aux");
  assert.deepEqual(allowed(plan), ["pistol", "nexus"]);
  plan = planWeapons("barrage", ALL, [shot(RIFLE), shot(KNIFE), shot(PISTOL, true)]);
  assert.deepEqual(allowed(plan), ["nexus"]);
  plan = planWeapons("barrage", ALL, [shot(RIFLE), shot(KNIFE), shot(PISTOL, true), shot(NEXUS, true)]);
  assert.equal(plan.phase, "done");
  plan = planWeapons("barrage", ALL, [shot(RIFLE), shot(PISTOL)]); // both primaries on mount 0
  assert.equal(plan.phase, "done"); // the only Auxiliary there has already fired
});
