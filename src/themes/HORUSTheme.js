import { BaseTheme } from "./BaseTheme.js";

/**
 * HORUS: the collective. Black glass, terminal green, a signal that doesn't quite hold still.
 * A foundation: palette, badge, boot text and voice here; ornaments in styles/themes/horus.css.
 */
export class HORUSTheme extends BaseTheme {
  static id = "horus";
  static label = "LFD.Theme.HORUS";
  static manufacturers = ["HORUS"];
  static badge = "HORUS";

  static audio = {
    chime: [740, 523],
    klaxon: [466, 659],
    boot: [622, 880, 1245],
  };

  static bootLines(t) {
    const frame = (t.frame?.name ?? "UNREGISTERED FRAME").toUpperCase();
    const pilot = (t.callsign ?? t.pilotName ?? "NO PILOT LINKED").toUpperCase();
    const reactor = t.heat?.inDanger ? "REACTOR // DANGER ZONE // KEEP GOING" : "REACTOR // QUIET";
    return ["H0RUS // NULL-SIGNED BUILD", "FIRMWARE UNVERIFIED // RUN ANYWAY", `FRAME ${frame}`, `PILOT ${pilot}`, reactor, "// > HANDSHAKE ACCEPTED"];
  }
}
