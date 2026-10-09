import { test } from "node:test";
import assert from "node:assert/strict";
import { reliableValue } from "../src/core/AutoDamage.js";
import { STATS, defenseOdds, pct, statBreakdown } from "../src/ui/components/HullReadout.js";

/* Reliable on a miss: read the way LANCER's damage flow reads it (setDamageTags) */

const tag = (lid, val, tiers) => ({ lid, val, is_reliable: lid === "tg_reliable", tierVal: tier => (tiers ? tiers[tier - 1] : val) });
const kinds = ["mech_weapon", "frame", "talent", "npc_feature", "pilot_weapon", "mech_system"];
const item = (kind, system) => Object.fromEntries([...kinds.map(k => [`is_${k}`, () => k === kind]), ["system", system]]);
const pilot = { is_npc: () => false, system: {} };
const npc = tier => ({ is_npc: () => true, system: { tier } });

test("a mech weapon is Reliable through its active profile's tags", () => {
  const rifle = item("mech_weapon", { active_profile: { all_tags: [tag("tg_accurate", null), tag("tg_reliable", "2")] }, tags: [] });
  assert.equal(reliableValue(rifle, pilot), 2);
  const plain = item("mech_weapon", { active_profile: { all_tags: [tag("tg_ap", null)] } });
  assert.equal(reliableValue(plain, pilot), 0);
});

test("an NPC weapon's Reliable follows the NPC's tier; a non-weapon feature never deals Reliable damage", () => {
  const claw = item("npc_feature", { type: "Weapon", tags: [tag("tg_reliable", "1/2/3", ["1", "2", "3"])] });
  assert.equal(reliableValue(claw, npc(1)), 1);
  assert.equal(reliableValue(claw, npc(3)), 3);
  const trait = item("npc_feature", { type: "Trait", tags: [tag("tg_reliable", "2")] });
  assert.equal(reliableValue(trait, npc(1)), 0);
});

test("no item, no Reliable tag or an unreadable value means no Reliable damage", () => {
  assert.equal(reliableValue(null, pilot), 0);
  assert.equal(reliableValue(item("mech_system", {}), pilot), 0);
  assert.equal(reliableValue(item("pilot_weapon", { tags: [tag("tg_reliable", "x")] }), pilot), 0);
  assert.equal(reliableValue(item("pilot_weapon", { tags: [{ lid: "tg_reliable", val: "1" }] }), pilot), 1, "a tag without LANCER's helpers still reads");
});

/* The stat cards: frame + rule + everything else, always adding up to LANCER's number */

const mech = (stats, statBase, checks = { hull: 0, agi: 0, sys: 0, eng: 0 }, grit = 0) => ({ stats, statBase, checks, grit });
const stat = id => STATS.find(s => s.id === id);

test("each stat breaks down into its frame number, the rule's skill and whatever else", () => {
  const t = mech(
    { evasion: 10, edef: 13, speed: 6, sensors: 10, save: 14, tech: 5 },
    { evasion: 8, edef: 8, speed: 5, sensors: 10, save: 11, tech: 1 },
    { hull: 2, agi: 2, sys: 4, eng: 2 },
    3,
  );
  assert.deepEqual(statBreakdown(t, stat("evasion")), { frame: 8, skill: { id: "agi", value: 2 }, other: 0 });
  assert.deepEqual(statBreakdown(t, stat("edef")), { frame: 8, skill: { id: "sys", value: 4 }, other: 1 }, "a talent or system's +1");
  assert.deepEqual(statBreakdown(t, stat("speed")), { frame: 5, skill: { id: "agi", value: 1 }, other: 0 }, "half Agility, rounded down");
  assert.deepEqual(statBreakdown(t, stat("sensors")), { frame: 10, skill: null, other: 0 });
  assert.deepEqual(statBreakdown(t, stat("save")), { frame: 11, skill: { id: "grit", value: 3 }, other: 0 });
  assert.deepEqual(statBreakdown(t, stat("tech")), { frame: 1, skill: { id: "sys", value: 4 }, other: 0 });
  for (const s of STATS) {
    const b = statBreakdown(t, s);
    assert.equal(b.frame + (b.skill?.value ?? 0) + b.other, t.stats[s.id], `${s.id} adds up`);
  }
});

test("odd Agility rounds Speed's share down; without frame data there's no breakdown", () => {
  const t = mech({ evasion: 11, edef: 8, speed: 6, sensors: 10, save: 10, tech: 0 }, { evasion: 8, edef: 8, speed: 5, sensors: 10, save: 10, tech: 0 }, { hull: 0, agi: 3, sys: 0, eng: 0 });
  assert.deepEqual(statBreakdown(t, stat("speed")), { frame: 5, skill: { id: "agi", value: 1 }, other: 0 });
  assert.equal(statBreakdown({ ...t, statBase: null }, stat("evasion")), null);
});

test("the strip keeps the book's order, and every condition a card names is one LANCER has", async () => {
  const { STATUS } = await import("../src/constants.js");
  assert.deepEqual(STATS.map(s => s.id), ["evasion", "edef", "speed", "sensors", "save", "tech"]);
  const known = new Set(Object.values(STATUS));
  for (const s of STATS) for (const c of s.conditions) assert.ok(known.has(c), `${s.id}: ${c}`);
});

/* Dragging a mech spends movement: Foundry's measured cost, in spaces */

test("a move costs the sum of its steps in spaces, difficult terrain included; displacement is free", async () => {
  const { movementSpaces } = await import("../src/core/MovementTracker.js");
  const step = (cost, action = "walk") => ({ action, cost });
  assert.equal(movementSpaces({ waypoints: [step(0), step(1), step(1)] }, 1), 2, "two clear spaces");
  assert.equal(movementSpaces({ waypoints: [step(0), step(1), step(2)] }, 1), 3, "one of them through difficult terrain");
  assert.equal(movementSpaces({ waypoints: [step(0), step(5), step(5)] }, 5), 2, "a grid of 5 units a space");
  assert.equal(movementSpaces({ waypoints: [step(0, "displace"), step(3, "displace")] }, 1), 0, "pushed, pulled or put there");
  assert.equal(movementSpaces({ waypoints: [step(1), step(Infinity)] }, 1), 1, "an impossible step counts nothing");
  assert.equal(movementSpaces({ waypoints: [] }, 1), 0);
  assert.equal(movementSpaces(null, 1), 0);
  assert.equal(movementSpaces({ waypoints: [step(1)] }, 0), 0, "no grid, no spaces");
});

test("the MOVE light reads left over the turn's allowance: Speed, or more after a Boost this turn", async () => {
  const { moveAllowance } = await import("../src/core/MovementTracker.js");
  assert.equal(moveAllowance({ speed: 5, move: 3, key: "c1:2" }), 5, "no Boost: Speed");
  assert.equal(moveAllowance({ speed: 5, move: 6, boost: { key: "c1:2", value: 10 }, key: "c1:2" }), 10, "after a Boost: 6/10");
  assert.equal(moveAllowance({ speed: 5, move: 4, boost: { key: "c1:1", value: 10 }, key: "c1:2" }), 5, "last round's Boost doesn't count");
  assert.equal(moveAllowance({ speed: 5, move: 7, key: "free" }), 7, "a hand-edited count never reads more than its allowance");
  assert.equal(moveAllowance({ speed: 5, move: 2, boost: { key: "free", value: "x" }, key: "free" }), 5, "a broken flag is ignored");
});

/* Evasion and E-Defense: how often they turn away a typical NPC attack */

const kitbash = (flags = {}) => ({ stats: { evasion: 10, edef: 12, speed: 5, sensors: 10, save: 11, tech: 1 }, flags });
const shown = odds => odds.map(pct);

test("Evasion's card: tiers 1-3 in the open and behind cover, exact halves rounding up", () => {
  const { rows, now, perPoint } = defenseOdds(kitbash(), stat("evasion"));
  assert.deepEqual(rows.map(r => r.id), ["open", "soft", "hard"]);
  assert.deepEqual(shown(rows[0].odds), ["40%", "35%", "30%"]);
  assert.deepEqual(shown(rows[1].odds), ["58%", "53%", "48%"], "57.5%, 52.5% and 47.5% exactly");
  assert.deepEqual(shown(rows[2].odds), ["62%", "57%", "52%"]);
  assert.equal(now, null, "nothing on it changes them");
  assert.equal(perPoint, true);
});

test("E-Defense's card: tech attacks, no cover rows (cover only counts against ranged attacks)", () => {
  const { rows } = defenseOdds(kitbash(), stat("edef"));
  assert.deepEqual(rows.map(r => r.id), ["tech"]);
  assert.deepEqual(shown(rows[0].odds), ["50%", "45%", "40%"]);
  for (const s of ["speed", "sensors", "save", "tech"]) assert.equal(defenseOdds(kitbash(), stat(s)), null, s);
});

test("the now row: Prone and Lock On add Accuracy, Invisible halves the hits, Stunned caps Evasion at 5", () => {
  const evasion = flags => defenseOdds(kitbash(flags), stat("evasion")).now;
  assert.deepEqual(shown(evasion({ prone: true }).odds), ["23%", "18%", "13%"], "+1 Accuracy: 22.5%, 17.5%, 12.5%");
  assert.ok(evasion({ prone: true, lockon: true }).odds[0] < evasion({ prone: true }).odds[0], "two Accuracy dice beat one");
  assert.deepEqual(shown(evasion({ invisible: true }).odds), ["70%", "68%", "65%"]);
  assert.deepEqual(shown(evasion({ stunned: true }).odds), ["15%", "10%", "5%"], "Evasion 5: a +1 attack hits on 4 or more");
  assert.deepEqual(evasion({ shutdown: true }), evasion({ stunned: true }), "Shut Down stuns");
  assert.deepEqual(evasion({ hidden: true }), { blocked: "hidden" });
  assert.equal(evasion({ exposed: true }), null, "Exposed changes damage, not the odds");
  const edef = flags => defenseOdds(kitbash(flags), stat("edef")).now;
  assert.deepEqual(edef({ shutdown: true }), { blocked: "shutdown" }, "immune to tech attacks");
  assert.deepEqual(shown(edef({ prone: true }).odds), ["33%", "28%", "23%"], "Prone's Accuracy counts for tech attacks too");
  assert.equal(edef({ stunned: true }), null, "Stunned caps Evasion, not E-Defense");
});
