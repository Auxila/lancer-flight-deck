import { TEMPLATE_ROOT } from "../constants.js";
import { BaseTheme } from "./BaseTheme.js";

/**
 * Smith-Shimano Corpro: bespoke luxury from the Constellar ateliers, frames named for moths and
 * butterflies. The cockpit is an atelier chronometer rather than a terminal: black lacquer engraved
 * with guilloché, gold hairlines, serif small caps. The header is a maker's label with the SSC seal
 * and a commission number; HP spans like a wing from the body outward; integrity reads on two watch
 * sub-dials; the Overcharge ladder is a row of set jewels. Its own templates (templates/panel/ssc/)
 * keep every action, field and state of the base layout.
 */
export class SSCTheme extends BaseTheme {
  static id = "ssc";
  static label = "LFD.Theme.SSC";
  static tagline = "LFD.Theme.Tagline.SSC";
  static manufacturers = ["SSC"];
  static badge = "SSC";

  static templates = {
    header: `${TEMPLATE_ROOT}/panel/ssc/header.hbs`,
    hull: `${TEMPLATE_ROOT}/panel/ssc/hull.hbs`,
    heat: `${TEMPLATE_ROOT}/panel/ssc/heat.hbs`,
    integrity: `${TEMPLATE_ROOT}/panel/ssc/integrity.hbs`,
  };

  static boot = {
    caption: "LFD.SSC.Boot.Caption",
    title: "LFD.SSC.Boot.Title",
    stamp: "LFD.SSC.Boot.Stamp",
  };

  static audio = {
    chime: [1047, 784],
    klaxon: [587, 880],
    boot: [784, 1175, 1568],
  };

  static bootLines(t) {
    const frame = (t.frame?.name ?? "UNREGISTERED FRAME").toUpperCase();
    const pilot = (t.callsign ?? t.pilotName ?? "NO PILOT LINKED").toUpperCase();
    const reactor = t.heat?.inDanger ? "THERMAL PROFILE ELEVATED // DANGER ZONE" : "THERMAL PROFILE OPTIMAL";
    return ["SMITH-SHIMANO CORPRO", "ATELIER BESPOKE FIRMWARE", `FRAME ${frame}`, `PILOT ${pilot}`, reactor, "CALIBRATION COMPLETE"];
  }

  /** A LUX-Iconic commission number: every SSC frame is made to order. Four digits, stable per mech. */
  static registry(t) {
    return String(1000 + (this.hash(t) % 9000));
  }
}
