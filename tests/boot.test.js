import { test } from "node:test";
import assert from "node:assert/strict";
import { WIDTH, bootStream, leader } from "../src/ui/boot/bootScript.js";

const MECH = {
  mech: "Kitbash", frame: "Goblin", manufacturer: "GMS", pilot: "Kit",
  weapons: [{ mount: "Main", name: "Assault Rifle" }, { mount: "Heavy", name: "Heavy Machine Gun" }],
  systems: ["Hunter Lock", "Smoke Grenade"],
  tracks: { hp: [6, 6], heat: [0, 4], structure: [4, 4], stress: [4, 4] },
  stats: { evasion: 10, edef: 12, sensors: 20, speed: 5 },
  danger: false,
  flavour: ["General Massive Systems"],
};

test("leader pads every line to the stream width, truncating long labels", () => {
  assert.equal(leader("POST  CORE BUS", "OK").length, WIDTH);
  const long = leader("WPN  M1 MAIN // A WEAPON WITH AN EXTREMELY LONG NAME INDEED", "ARMED");
  assert.equal(long.length, WIDTH);
  assert.ok(long.includes("…") && long.endsWith(" ARMED"));
});

test("the stream is about this mech: its weapons, systems, pilot and tracks", () => {
  const text = bootStream(MECH, 7).map(l => l.text).join("\n");
  for (const s of ["ASSAULT RIFLE", "HEAVY MACHINE GUN", "HUNTER LOCK", "PILOT KIT", "STRUCTURE 4/4", "CAP 4", "GMS GOBLIN // KITBASH"]) {
    assert.ok(text.includes(s), s);
  }
});

test("it's long enough to pour, mixes memory dumps in, and is reproducible from its seed", () => {
  const a = bootStream(MECH, 42);
  assert.ok(a.length >= 48);
  assert.ok(a.filter(l => l.kind === "hex").length >= 10);
  assert.deepEqual(bootStream(MECH, 42), a);
  assert.notDeepEqual(bootStream(MECH, 43), a);
});

test("damage and heat show up as warnings", () => {
  const hurt = bootStream({ ...MECH, danger: true, tracks: { ...MECH.tracks, structure: [1, 4] } }, 3);
  assert.ok(hurt.some(l => l.kind === "warn" && l.text.endsWith(" DANGER")));
  assert.ok(hurt.some(l => l.kind === "warn" && l.text.endsWith(" RED")));
});
