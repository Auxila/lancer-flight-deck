import { damageLevels } from "./fracture.js";
import { DAMAGE_STYLES } from "./styles/index.js";

/**
 * Regenerate damage geometry only when the visible area changes size by this fraction. Losing
 * structure itself reflows the panel (the odds text, the "one structure left" box), and damage that's
 * forming must not jump; anything past a shrunken edge is simply clipped.
 */
const RESHAPE_FRACTION = 0.2;

/**
 * The panel's battle damage. This layer decides when: everything is driven by state, not events. It
 * compares what it last drew for this mech with what the mech has now, so reloads, mech switches and
 * theme switches draw quietly and only real changes animate. What it looks like is the manufacturer's
 * damage style (BaseTheme.damage → styles/*.js): GMS's cracked glass and steam, IPS-N's hull breaches
 * and battle lanterns, SSC's kintsugi and liquid cooling, HORUS's corruption and interference, HA's spalled
 * concrete and heat soak.
 *
 * The panel root carries the shared state for theme stylesheets: `lfd-cracked`, `lfd-stressed`,
 * `lfd-stress-1..3`, `lfd-dmg-<style>`, and the counts as --lfd-dmg-structure / --lfd-dmg-stress.
 */
export class DamageLayer {
  /** @param {import("../FlightDeckPanel.js").FlightDeckPanel} panel */
  constructor(panel) {
    this.panel = panel;
  }

  /** @type {HTMLElement|null} */
  element = null;
  /** @type {import("./styles/DamageStyle.js").DamageStyle|null} */
  #style = null;
  #observer = null;
  #seed = null;
  #levels = null;
  /** The size the geometry was generated for. */
  #geo = { W: 0, H: 0 };

  /** Make sure the layer is in the panel (part re-renders don't touch it). */
  attach(root) {
    if (!this.element) {
      const el = document.createElement("div");
      el.className = "lfd-damage";
      el.setAttribute("aria-hidden", "true");
      this.element = el;
    }
    if (this.element.parentElement !== root) {
      root.append(this.element);
      this.#observer?.disconnect();
      this.#observer = new ResizeObserver(() => this.layout());
      this.#observer.observe(root);
    }
  }

  /**
   * Bring the layer in line with the mech.
   * @param {object|null} t  Telemetry snapshot (null in standby)
   * @param {{reduceMotion?: boolean, enabled?: boolean}} [options]  reduceMotion: draw it still (the
   *   Battle damage setting's "still", or Reduce motion); enabled false: the player turned it off
   */
  update(t, { reduceMotion = false, enabled = true } = {}) {
    if (!this.element) return;
    if (!enabled) return this.#disable();
    this.element.hidden = false;
    const root = this.panel.element;
    const levels = t ? damageLevels(t) : { fractures: 0, stressLost: 0, stressLevel: 0, steam: 0 };
    const seed = t?.uuid ?? null;
    const swapped = this.#ensureStyle();
    const prev = !swapped && seed && seed === this.#seed ? this.#levels : null;
    this.#seed = seed;
    this.#levels = levels;
    const style = this.#style;

    for (let i = 0; i <= 3; i++) root?.classList.toggle(`lfd-stress-${i}`, levels.stressLevel === i && i > 0);
    root?.classList.toggle("lfd-stressed", levels.stressLevel > 0);
    root?.classList.toggle("lfd-cracked", levels.fractures > 0);
    root?.style.setProperty("--lfd-dmg-structure", String(levels.fractures));
    root?.style.setProperty("--lfd-dmg-stress", String(levels.stressLost));
    this.layout({ redraw: false });
    style.setState({ seed, levels, reduce: reduceMotion });

    if (!prev) {
      // First sight of this mech (or of this style): draw what's there, quietly
      style.reset?.();
      style.draw(levels.fractures);
    } else if (levels.fractures > prev.fractures) {
      style.strike(prev.fractures, levels.fractures);
    } else if (levels.fractures < prev.fractures) {
      style.mend(levels.fractures, prev.fractures);
    }
    if (prev && levels.stressLost > prev.stressLost && !reduceMotion) style.stressHit(levels, prev);
    style.sync(levels);
  }

  /** Track the panel's visible area (it scrolls; the damage doesn't). */
  layout({ redraw = true } = {}) {
    const root = this.panel.element;
    const el = this.element;
    if (!root || !el || !this.#style) return;
    const W = root.clientWidth;
    const H = root.clientHeight;
    el.style.top = `${root.scrollTop}px`;
    el.style.width = `${W}px`;
    el.style.height = `${H}px`;
    if (!W || !H) return;
    const geo = this.#geo;
    const reshape = Math.abs(W - geo.W) > 2 || !geo.H || Math.abs(H - geo.H) > geo.H * RESHAPE_FRACTION;
    if (reshape) this.#geo = { W, H };
    this.#style.resize(W, H, { reshape: reshape && redraw });
    // Shown again after being collapsed or hidden: continuous effects pick up where they left off
    if (redraw && this.#levels) this.#style.sync(this.#levels);
  }

  destroy() {
    this.#observer?.disconnect();
    this.#style?.destroy();
    this.#style = null;
    this.element?.remove();
    this.element = null;
  }

  /**
   * Battle damage turned off: no marks, no stress effects, none of the shared state on the root. Turned
   * on again, it's first sight of the mech, so the damage draws quietly.
   */
  #disable() {
    this.#style?.destroy();
    this.#style = null;
    this.#seed = null;
    this.#levels = null;
    this.#geo = { W: 0, H: 0 };
    const root = this.panel.element;
    if (root) {
      root.classList.remove("lfd-stressed", "lfd-cracked", "lfd-stress-1", "lfd-stress-2", "lfd-stress-3");
      for (const key of Object.keys(DAMAGE_STYLES)) root.classList.remove(`lfd-dmg-${key}`);
      root.style.removeProperty("--lfd-dmg-structure");
      root.style.removeProperty("--lfd-dmg-stress");
    }
    this.element.hidden = true;
    delete this.element.dataset.style;
  }

  /** The style follows the theme on screen (a picker preview included). @returns {boolean} swapped */
  #ensureStyle() {
    const id = this.panel.manager?.shownTheme?.damage ?? "glass";
    if (this.#style?.constructor.id === id) return false;
    const Style = DAMAGE_STYLES[id] ?? DAMAGE_STYLES.glass;
    this.#style?.destroy();
    const root = this.panel.element;
    for (const key of Object.keys(DAMAGE_STYLES)) root?.classList.toggle(`lfd-dmg-${key}`, key === Style.id);
    this.element.dataset.style = Style.id;
    this.#style = new Style(this);
    this.#geo = { W: 0, H: 0 };
    return true;
  }
}
