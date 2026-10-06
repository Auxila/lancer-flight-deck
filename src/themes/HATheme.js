import { TEMPLATE_ROOT } from "../constants.js";
import { BaseTheme } from "./BaseTheme.js";

/** Purview worlds a battlegroup can be raised from, and the two long-term roles the Armory assigns. */
const WORLDS = ["Ras Shamra", "Arkady II", "Cruz's Landing", "Harrison's World", "Ulsincielo", "Capitol Peak"];
const ROLES = ["Planetwatch", "Force Projection"];
const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];

/**
 * Harrison Armory: the Purview's war machine, superior by design. The cockpit is imperial brutalism
 * rather than a terminal: poured-concrete slabs with a violet insignia in the corner, Roman numerals
 * on the sections, poster capitals. The header hangs the Armory's banner and the battlegroup the mech
 * was raised with; heat runs in hexagonal cells and the Overcharge ladder climbs as a stair (HA's own
 * discipline); integrity hangs as two banners of rank insignia, chevrons for structure and bars for
 * stress. Its own templates (templates/panel/ha/) keep every action, field and state of the base layout.
 */
export class HATheme extends BaseTheme {
  static id = "ha";
  static label = "LFD.Theme.HA";
  static tagline = "LFD.Theme.Tagline.HA";
  static manufacturers = ["HA"];
  static badge = "HA";

  static templates = {
    header: `${TEMPLATE_ROOT}/panel/ha/header.hbs`,
    integrity: `${TEMPLATE_ROOT}/panel/ha/integrity.hbs`,
  };

  static boot = {
    caption: "LFD.HA.Boot.Caption",
    title: "LFD.HA.Boot.Title",
    stamp: "LFD.HA.Boot.Stamp",
  };

  static audio = {
    chime: [587, 440],
    klaxon: [392, 587],
    boot: [440, 587, 880],
  };

  static bootLines(t) {
    const frame = (t.frame?.name ?? "UNREGISTERED FRAME").toUpperCase();
    const pilot = (t.callsign ?? t.pilotName ?? "NO PILOT LINKED").toUpperCase();
    const reactor = t.heat?.inDanger ? "REACTOR AT WAR FOOTING // DANGER ZONE" : "REACTOR NOMINAL";
    return ["HARRISON ARMORY", "ARMORY-PATTERN FIRMWARE", `FRAME ${frame}`, `PILOT ${pilot}`, reactor, "PURVIEW LINK SECURED"];
  }

  /**
   * The battlegroup, named the way the Armory names them: the order it was raised, its world, its role
   * ("3rd Ras Shamra, Planetwatch"). Cosmetic, and the same for a mech every session.
   */
  static registry(t) {
    const h = this.hash(t);
    return `${ORDINALS[h % ORDINALS.length]} ${WORLDS[(h >>> 4) % WORLDS.length]}, ${ROLES[(h >>> 8) % ROLES.length]}`;
  }
}
