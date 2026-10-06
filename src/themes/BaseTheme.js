/**
 * A Flight Deck theme describes one manufacturer's cockpit: its CSS class (palette and
 * ornaments live in styles/themes/<id>.css), its boot text, and its audio patch.
 *
 * Themes share the base layout unless they bring their own template for a part through `templates`
 * (IPS-N replaces four). A replacement keeps every action, field and hook of the base part; only the
 * arrangement and the hardware change (tests/themes.test.js checks).
 */
export class BaseTheme {
  /** Unique theme id, also the CSS file stem. */
  static id = "base";

  /** i18n key for the theme's display name. */
  static label = "LFD.Theme.Base";

  /** i18n key for a one-line description in the theme picker. */
  static tagline = "";

  /** Manufacturer codes (frame.system.manufacturer) this theme is the default for. */
  static manufacturers = [];

  /** Short code shown on the badge. */
  static badge = "UNK";

  /** Optional per-part template overrides, e.g. { heat: "modules/.../heat-ha.hbs" }. */
  static templates = {};

  /** i18n keys for the cold boot's finish card (caption over the title, and the stamp under it). */
  static boot = {
    caption: "LFD.Boot.Caption",
    title: "LFD.Boot.Title",
    stamp: "LFD.Boot.Stamp",
  };

  /** Synth parameters this theme's cues use. Frequencies in Hz. */
  static audio = {
    chime: [800, 600],
    klaxon: [520, 740],
    boot: [660, 880, 1320],
  };

  static get cssClass() {
    return `lfd-theme-${this.id}`;
  }

  /**
   * Lines shown during the cold-boot sequence.
   * @param {object} t  Telemetry snapshot
   * @returns {string[]}
   */
  static bootLines(t) {
    return [`${t.frame?.name ?? "UNKNOWN FRAME"}`, `PILOT ${t.callsign ?? "UNREGISTERED"}`, "SYSTEMS NOMINAL"];
  }

  /**
   * A maker's own serial or registry mark for this mech, for themes whose header shows one. Cosmetic,
   * and stable per actor.
   * @param {object} _t  Telemetry snapshot
   * @returns {string|null}
   */
  static registry(_t) {
    return null;
  }

  /**
   * A stable 32-bit hash of the mech (FNV-1a over its uuid), for cosmetic serials.
   * @param {object} t  Telemetry snapshot
   */
  static hash(t) {
    let h = 0x811c9dc5;
    for (const ch of String(t?.uuid ?? t?.name ?? "")) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
    return h;
  }
}
