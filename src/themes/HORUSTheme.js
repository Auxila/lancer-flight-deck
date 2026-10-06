import { TEMPLATE_ROOT } from "../constants.js";
import { BaseTheme } from "./BaseTheme.js";
import { HorusEyes } from "../ui/HorusEyes.js";

const eyes = new HorusEyes();

/**
 * HORUS: the collective nobody can map, printing mechs out of other people's printers. The cockpit is
 * a leaked black-box readout rather than a product: 1-bit black and bone, everything in monospace,
 * sections as shell prompts, selections in reverse video, plates printed slightly out of register in
 * HORUS green. The header carries the sigil, a hashed handle and the UIB's "pattern group" for the
 * frame; HP prints in dithered cells; heat is a memory dump in hex; integrity is watched by eyes that
 * follow your pointer and close as structure goes, and sigil rings that break as stress does. Its own templates
 * (templates/panel/horus/) keep every action, field and state of the base layout.
 */
export class HORUSTheme extends BaseTheme {
  static id = "horus";
  static label = "LFD.Theme.HORUS";
  static tagline = "LFD.Theme.Tagline.HORUS";
  static manufacturers = ["HORUS"];
  static badge = "HORUS";

  static templates = {
    header: `${TEMPLATE_ROOT}/panel/horus/header.hbs`,
    hull: `${TEMPLATE_ROOT}/panel/horus/hull.hbs`,
    integrity: `${TEMPLATE_ROOT}/panel/horus/integrity.hbs`,
  };

  static damage = "corruption";

  static boot = {
    caption: "LFD.HORUS.Boot.Caption",
    title: "LFD.HORUS.Boot.Title",
    stamp: "LFD.HORUS.Boot.Stamp",
  };

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

  /** The structure eyes follow the pointer. */
  static mount(root) {
    eyes.mount(root);
  }

  static unmount() {
    eyes.unmount();
  }

  /** A handle, not a name: eight hex digits hashed from the mech (7F3A:C91E), the same every session. */
  static registry(t) {
    const hex = this.hash(t).toString(16).toUpperCase().padStart(8, "0");
    return `${hex.slice(0, 4)}:${hex.slice(4)}`;
  }
}
