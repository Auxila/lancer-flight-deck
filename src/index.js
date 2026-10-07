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

Hooks.once("init", () => {
  if (game.system.id !== "lancer") return;
  FlightDeckManager.instance.init();
  registerConditionQuery();
  registerAutoDamage();
  registerMovementTracker();
  registerMeltdownClock();
  TokenEffects.instance.init();
  NpcDeck.init();
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
  FlightDeckManager.instance.ready();
  NpcDeck.ready();
});
