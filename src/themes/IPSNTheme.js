import { TEMPLATE_ROOT } from "../constants.js";
import { BaseTheme } from "./BaseTheme.js";

/** Hull letters skip I, O and Q, which read as digits on a painted hull. */
const HULL_LETTERS = "ABCDEFGHJKLMNPRSTUVWXYZ";

/**
 * IPS-Northstar: the Union's shipwrights and the escorts of its shipping lanes. The cockpit is a ship's
 * bridge rather than a terminal: a hull nameboard with a registry number, riveted plating with
 * radiused hatch corners, a damage control board (structure as watertight compartments, stress as
 * valve wheels), a load line marking the Danger Zone, and an engine order telegraph for Overcharge.
 * Its own templates (templates/panel/ipsn/) keep every action, field and state of the base layout.
 */
export class IPSNTheme extends BaseTheme {
  static id = "ipsn";
  static label = "LFD.Theme.IPSN";
  static tagline = "LFD.Theme.Tagline.IPSN";
  static manufacturers = ["IPS-N", "IPSN"];
  static badge = "IPS-N";

  static templates = {
    header: `${TEMPLATE_ROOT}/panel/ipsn/header.hbs`,
    hull: `${TEMPLATE_ROOT}/panel/ipsn/hull.hbs`,
    heat: `${TEMPLATE_ROOT}/panel/ipsn/heat.hbs`,
    integrity: `${TEMPLATE_ROOT}/panel/ipsn/integrity.hbs`,
  };

  static damage = "hull";

  static boot = {
    caption: "LFD.IPSN.Boot.Caption",
    title: "LFD.IPSN.Boot.Title",
    stamp: "LFD.IPSN.Boot.Stamp",
  };

  static audio = {
    chime: [659, 494],
    klaxon: [440, 659],
    boot: [523, 659, 988],
  };

  static bootLines(t) {
    const frame = (t.frame?.name ?? "UNREGISTERED FRAME").toUpperCase();
    const pilot = (t.callsign ?? t.pilotName ?? "NO PILOT LINKED").toUpperCase();
    const reactor = t.heat?.inDanger ? "REACTOR RUNNING HOT // DANGER ZONE" : "REACTOR NOMINAL";
    return ["IPS-NORTHSTAR", "NORTHSTAR FIELD FIRMWARE", `FRAME ${frame}`, `PILOT ${pilot}`, reactor, "BULKHEADS SEALED"];
  }

  /** A hull number in the Trunk Security style (9A-38), hashed from the actor so it never changes. */
  static registry(t) {
    const h = this.hash(t);
    const letter = HULL_LETTERS[(h >>> 4) % HULL_LETTERS.length];
    return `${1 + (h % 9)}${letter}-${String((h >>> 9) % 100).padStart(2, "0")}`;
  }
}
