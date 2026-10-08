/**
 * Flight Deck: a docked cockpit HUD for the LANCER system on Foundry VTT v13.
 *
 * "Flight Deck" is not an official Lancer product; it is a third party work, and is not
 * affiliated with Massif Press. "Flight Deck" is published via the Lancer Third Party
 * License. Lancer is copyright Massif Press.
 */
import { MODULE_ID } from "./constants.js";
import { registerConditionQuery } from "./core/ConditionControl.js";
import { registerAutoDamage } from "./core/AutoDamage.js";
import { registerMovementTracker } from "./core/MovementTracker.js";
import { FlightDeckManager } from "./core/FlightDeckManager.js";
import { TokenEffects } from "./fx/TokenEffects.js";
import * as Odds from "./core/Odds.js";
import { getThemes, registerTheme } from "./themes/registry.js";
import { damageClock } from "./ui/damage/clock.js";
import { NpcDeck } from "./npc/NpcDeck.js";
import { registerMeltdownClock } from "./core/MeltdownClock.js";
import { removeFlightDeckData, runCleanup, scanWorld } from "./core/Cleanup.js";

/** Parts that failed to start this session, to tell the GM once the game is ready. */
const broken = [];
/** After the ready notice, a late failure (a part's promise) is told on its own. */
let announced = false;

/**
 * Start one part. If it throws (or its promise rejects), the console says which, and every other part
 * still starts: a failing NPC Deck never takes the cockpit with it, and the other way round.
 */
function tellGM(parts) {
  const names = [...new Set(parts)].map(p => game.i18n.localize(`LFD.Error.Part.${p}`)).join(", ");
  ui.notifications.error(game.i18n.format("LFD.Error.Startup", { parts: names }), { permanent: true });
}

function start(part, fn) {
  const fail = err => {
    broken.push(part);
    console.error(`Flight Deck | ${part} failed to start`, err);
    if (announced && game.user?.isGM) tellGM([part]);
  };
  try {
    const result = fn();
    if (result instanceof Promise) result.catch(fail);
  } catch (err) {
    fail(err);
  }
}

Hooks.once("init", () => {
  if (game.system.id !== "lancer") return;
  start("panel", () => FlightDeckManager.instance.init());
  start("lockOn", registerConditionQuery);
  start("autoDamage", registerAutoDamage);
  start("movement", registerMovementTracker);
  start("meltdown", registerMeltdownClock);
  start("tokenEffects", () => TokenEffects.instance.init());
  start("npcDeck", () => NpcDeck.init());
  const module = game.modules.get(MODULE_ID);
  module.api = {
    manager: FlightDeckManager.instance,
    tokenEffects: TokenEffects.instance,
    registerTheme,
    getThemes,
    Odds,
    damageClock,
    npcDeck: () => (game.user?.isGM ? NpcDeck.instance : null), // GM only
    // GM, before uninstalling: what Flight Deck saved in the world, and removing it
    cleanup: { scan: scanWorld, remove: removeFlightDeckData, run: runCleanup },
  };
});

Hooks.once("ready", () => {
  if (game.system.id !== "lancer") {
    console.warn(`Flight Deck | Requires the LANCER system; "${game.system.id}" is active, so the panel stays off.`);
    return;
  }
  start("panel", () => FlightDeckManager.instance.ready());
  start("npcDeck", () => NpcDeck.ready());
  // Say so once, to GMs: a part that's off shouldn't look like a bug in the rest
  if (broken.length && game.user.isGM) tellGM(broken);
  announced = true;
});
