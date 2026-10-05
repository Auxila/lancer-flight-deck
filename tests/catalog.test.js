import { test } from "node:test";
import assert from "node:assert/strict";
import { itemActions, loadDeployables } from "../src/actions/catalog.js";

globalThis.game = {
  actors: [],
  lancer: null,
  i18n: { format: (key, data) => `${key.split(".").pop()} ${data.name}`, localize: key => key },
};

const tag = lid => ({ lid, val: "" });
const action = (name, activation) => ({ name, activation, detail: `${name} detail` });
const item = (name, type, system = {}) => ({ uuid: `Item.${name}`, name, type, system: { tags: [], actions: [], deployables: [], ...system } });
const mech = ({ systems = [], weapons = [] } = {}) => ({
  uuid: "Actor.mech",
  name: "Kitbash",
  system: {
    loadout: {
      frame: { value: null },
      systems: systems.map(value => ({ value })),
      weapon_mounts: weapons.map(([weapon, mod]) => ({ type: "Main", slots: [{ weapon: { value: weapon }, mod: { value: mod ?? null } }] })),
    },
    pilot: { value: null },
  },
});
const deployable = (name, lid, system = {}, tokens = []) => ({
  type: "deployable",
  name: `${name} [Kitbash]`,
  system: { lid, owner: { id: "Actor.mech" }, activation: "Quick", type: "Mine", detail: `${name} detail`, ...system },
  getActiveTokens: () => tokens,
});
const labels = entries => entries.map(e => `${e.menu}/${e.section}: ${e.label}${e.run ? ` (${e.run})` : ""}`);

test("a weapon mod's own action (Shock Wreath) shows under QUICK", () => {
  game.actors = [];
  const wreath = item("Shock Wreath", "weapon_mod", { actions: [action("Activate Shock Wreath", "Quick")] });
  const blade = item("Blade", "mech_weapon");
  assert.deepEqual(labels(itemActions(mech({ weapons: [[blade, wreath]] }))), ["quick/items: Activate Shock Wreath"]);
});

test("a system only tagged Quick Action is used through LANCER's system flow", () => {
  game.actors = [];
  const lasso = item("Electrolasso", "mech_system", { tags: [tag("tg_quick_action"), tag("tg_limited")], effect: "Lasso rules" });
  const [entry] = itemActions(mech({ systems: [lasso] }));
  assert.equal(entry.run, "systemUse");
  assert.equal(entry.menu, "quick");
  assert.equal(entry.spend, "quick");
  assert.equal(entry.action.detail, "Lasso rules");
});

test("each tagged activation counts once, and not where an action of that kind exists", () => {
  game.actors = [];
  const both = item("Shield", "mech_system", { tags: [tag("tg_quick_action"), tag("tg_protocol")], actions: [action("Raise", "Quick")] });
  const fang = item("twin_fang_haunt.exe", "mech_system", { tags: [tag("tg_quick_tech")], actions: [action("Haunt", "Invade")] });
  assert.deepEqual(labels(itemActions(mech({ systems: [both, fang] }))), [
    "quick/items: Raise",
    "reaction/protocol: Shield (systemUse)",
    "invade/items: Haunt",
  ]);
});

test("a deployable becomes a Deploy entry right after its gear's own actions", () => {
  const charges = item("Smoke Charges", "mech_system", { actions: [action("Smoke Grenade", "Quick")], deployables: ["dep_smoke_mine"] });
  const lasso = item("Lasso", "mech_system", { tags: [tag("tg_quick_action")] });
  game.actors = [deployable("Smoke Mine", "dep_smoke_mine")];
  const entries = itemActions(mech({ systems: [charges, lasso] }));
  assert.deepEqual(labels(entries), ["quick/items: Smoke Grenade", "quick/items: Deploy Smoke Mine (deploy)", "quick/items: Lasso (systemUse)"]);
  const deploy = entries[1];
  assert.equal(deploy.deployable, "Smoke Mine");
  assert.equal(deploy.icon, "cci cci-mine");
  assert.equal(deploy.spend, "quick");
});

test("no Deploy entry where the gear's own action is the deployment, or the deploy isn't an action", () => {
  const turret = item("Turret Drones", "mech_system", { actions: [action("Deploy Turret", "Quick")], deployables: ["dep_turret"] });
  const lion = item("Lion Coast Missiles", "mech_system", { actions: [action("Release the Lion", "Full")], deployables: ["dep_lion"] });
  game.actors = [deployable("Turret", "dep_turret", { type: "Drone" }), deployable("Lion Coast Missile", "dep_lion", { activation: "Other" })];
  assert.deepEqual(labels(itemActions(mech({ systems: [turret, lion] }))), ["quick/items: Deploy Turret", "full/items: Release the Lion"]);
});

test("a tagged system whose deployment is that activation shows only the Deploy entry", () => {
  const drone = item("Tibicena Assault Drone", "mech_system", { tags: [tag("tg_quick_action")], deployables: ["dep_tibicena"] });
  game.actors = [deployable("Tibicena", "dep_tibicena", { type: "Drone" })];
  assert.deepEqual(labels(itemActions(mech({ systems: [drone] }))), ["quick/items: Deploy Tibicena (deploy)"]);
});

test("Recall and Redeploy appear only while the deployable is on the field", () => {
  const sentinel = item("Sentinel Drone", "mech_system", { deployables: ["dep_sentinel"] });
  const drone = (tokens) => deployable("Sentinel", "dep_sentinel", { type: "Drone", recall: "Quick", redeploy: "Quick" }, tokens);
  game.actors = [drone([])];
  assert.deepEqual(labels(itemActions(mech({ systems: [sentinel] }))), ["quick/items: Deploy Sentinel (deploy)"]);
  game.actors = [drone([{ id: "t1" }])];
  const fielded = itemActions(mech({ systems: [sentinel] }));
  assert.deepEqual(labels(fielded), ["quick/items: Deploy Sentinel (deploy)", "quick/items: Recall Sentinel (recall)", "quick/items: Redeploy Sentinel (redeploy)"]);
  assert.equal(fielded[1].heat, null);
  assert.equal(fielded[1].state, "ready");
});

test("a deployable the mech doesn't own a copy of shows once it's been looked up", async () => {
  const mines = item("Mesmer Charges", "mech_system", { deployables: ["dep_mesmer_mine"] });
  const m = mech({ systems: [mines] });
  game.actors = [];
  assert.deepEqual(itemActions(m), []);
  game.lancer = { fromLid: async lid => (lid === "dep_mesmer_mine" ? { ...deployable("Mesmer Mine", lid), name: "Mesmer Mine" } : null) };
  await loadDeployables(m);
  assert.deepEqual(labels(itemActions(m)), ["quick/items: Deploy Mesmer Mine (deploy)"]);
  game.lancer = null;
});
