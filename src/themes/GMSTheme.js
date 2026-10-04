import { BaseTheme } from "./BaseTheme.js";

/**
 * General Massive Systems: Union standard issue. Rugged, legible, red on gunmetal.
 * This is the baseline layout every other manufacturer derives from, and the fallback
 * for frames whose manufacturer has no theme yet (including third-party LCPs).
 */
export class GMSTheme extends BaseTheme {
  static id = "gms";
  static label = "LFD.Theme.GMS";
  static manufacturers = ["GMS"];
  static badge = "GMS";

  static audio = {
    chime: [800, 600],
    klaxon: [520, 740],
    boot: [660, 880, 1320],
  };

  static bootLines(t) {
    const frame = (t.frame?.name ?? "UNREGISTERED FRAME").toUpperCase();
    const pilot = (t.callsign ?? t.pilotName ?? "NO PILOT LINKED").toUpperCase();
    const reactor = t.heat?.inDanger ? "REACTOR WARM // DANGER ZONE" : "REACTOR NOMINAL";
    return [
      "GENERAL MASSIVE SYSTEMS",
      "UNION-STANDARD FIELD FIRMWARE",
      `FRAME ${frame}`,
      `PILOT ${pilot}`,
      reactor,
      "HANDSHAKE COMPLETE",
    ];
  }
}
