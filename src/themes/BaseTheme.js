/**
 * A Flight Deck theme describes one manufacturer's cockpit: its CSS class (palette and
 * ornaments live in styles/themes/<id>.css), its boot text, and its audio patch.
 *
 * Every theme shares the base layout and templates. A later manufacturer can override
 * individual template parts through `templates` without forking the panel.
 */
export class BaseTheme {
  /** Unique theme id, also the CSS file stem. */
  static id = "base";

  /** i18n key for the theme's display name. */
  static label = "LFD.Theme.Base";

  /** Manufacturer codes (frame.system.manufacturer) this theme is the default for. */
  static manufacturers = [];

  /** Short code shown on the badge. */
  static badge = "UNK";

  /** Optional per-part template overrides, e.g. { heat: "modules/.../heat-ha.hbs" }. */
  static templates = {};

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
}
