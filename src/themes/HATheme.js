import { BaseTheme } from "./BaseTheme.js";

/**
 * Harrison Armory: imperial weight. Aubergine steel, Purview violet, brass trim.
 * A foundation: palette, badge, boot text and voice here; ornaments in styles/themes/ha.css.
 */
export class HATheme extends BaseTheme {
  static id = "ha";
  static label = "LFD.Theme.HA";
  static manufacturers = ["HA"];
  static badge = "HA";

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
}
