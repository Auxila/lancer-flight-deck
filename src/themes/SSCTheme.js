import { BaseTheme } from "./BaseTheme.js";

/**
 * Smith-Shimano Corpro: bespoke luxury. Graphite, gold leaf, hairline precision.
 * A foundation: palette, badge, boot text and voice here; ornaments in styles/themes/ssc.css.
 */
export class SSCTheme extends BaseTheme {
  static id = "ssc";
  static label = "LFD.Theme.SSC";
  static manufacturers = ["SSC"];
  static badge = "SSC";

  static audio = {
    chime: [1047, 784],
    klaxon: [587, 880],
    boot: [784, 1175, 1568],
  };

  static bootLines(t) {
    const frame = (t.frame?.name ?? "UNREGISTERED FRAME").toUpperCase();
    const pilot = (t.callsign ?? t.pilotName ?? "NO PILOT LINKED").toUpperCase();
    const reactor = t.heat?.inDanger ? "THERMAL PROFILE ELEVATED // DANGER ZONE" : "THERMAL PROFILE OPTIMAL";
    return ["SMITH-SHIMANO CORPRO", "SSC BESPOKE FIRMWARE", `FRAME ${frame}`, `PILOT ${pilot}`, reactor, "CALIBRATION COMPLETE"];
  }
}
