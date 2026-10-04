import { test } from "node:test";
import assert from "node:assert/strict";
import { isGenericArt, isVideoArt, portraitOf } from "../src/npc/NpcRoster.js";

const MECH_ICON = "systems/lancer/assets/icons/mech.svg";
const NPC_ICON = "systems/lancer/assets/icons/npc_class.svg";
const MINI = "systems/lancer/assets/retrograde-minis/Retrograde-Minis-Horus-GOBLIN.png";
const PORTRAIT = "worlds/test/portraits/kitbash.webp";

const combatant = ({ custom = null, token = null, ring = null, proto = null, actorImg = null } = {}) => ({
  _source: { img: custom },
  token: token || ring ? { texture: { src: token }, ring: ring ? { enabled: true, subject: { texture: ring } } : { enabled: false } } : null,
  actor: { img: actorImg, prototypeToken: { texture: { src: proto } } },
});

test("the token's own art is the portrait", () => {
  assert.deepEqual(portraitOf(combatant({ token: MINI, actorImg: PORTRAIT })), { src: MINI, video: false, generic: false });
});

test("an image the GM set on the combatant wins", () => {
  assert.equal(portraitOf(combatant({ custom: PORTRAIT, token: MINI })).src, PORTRAIT);
});

test("a dynamic ring's subject art comes before the token texture", () => {
  assert.equal(portraitOf(combatant({ token: MINI, ring: "tokens/goblin-subject.webp" })).src, "tokens/goblin-subject.webp");
});

test("LANCER's placeholder token icon loses to the actor's real portrait", () => {
  assert.equal(portraitOf(combatant({ token: MECH_ICON, actorImg: PORTRAIT })).src, PORTRAIT);
});

test("with nothing but placeholders, the placeholder shows, flagged generic", () => {
  assert.deepEqual(portraitOf(combatant({ token: NPC_ICON, actorImg: NPC_ICON })), { src: NPC_ICON, video: false, generic: true });
});

test("wildcard (random) token paths are skipped", () => {
  assert.equal(portraitOf(combatant({ token: "tokens/goblin-*.webp", proto: "tokens/goblin-*.webp", actorImg: PORTRAIT })).src, PORTRAIT);
});

test("an off-scene combatant falls back to the prototype token, then the actor", () => {
  assert.equal(portraitOf(combatant({ proto: MINI, actorImg: PORTRAIT })).src, MINI);
  assert.equal(portraitOf(combatant({ actorImg: PORTRAIT })).src, PORTRAIT);
});

test("video token art is flagged for a still frame", () => {
  const p = portraitOf(combatant({ token: "tokens/goblin-idle.webm" }));
  assert.equal(p.video, true);
  assert.equal(isVideoArt("a/b.mp4?x=1"), true);
  assert.equal(isVideoArt("a/b.webp"), false);
  assert.equal(isGenericArt("icons/svg/mystery-man.svg"), true);
  assert.equal(isGenericArt(MINI), false);
});
