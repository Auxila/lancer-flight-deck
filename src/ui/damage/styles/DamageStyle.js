import { damageClock as clock } from "../clock.js";

export const SVG_NS = "http://www.w3.org/2000/svg";

/** Several structure points lost in one update (a big hit) land one after another, not all at once. */
export const STAGGER_MS = 240;

/**
 * One manufacturer's battle damage: how lost structure and stress look on the panel, how a hit lands,
 * and how a repair undoes it. The DamageLayer decides *when* (it diffs the mech's tracks against what
 * it last drew, so reloads and mech switches draw quietly); a style decides *what*.
 *
 * A style draws inside its own host element over the panel's visible area, never takes pointer
 * events, and keeps clear of the readouts. Every piece of structure damage it draws carries the
 * `lfd-dmg-mark` class (and data-index), so tests can count it whatever it looks like. While a style is
 * on screen the panel root carries `lfd-dmg-<id>`; persistent stress looks hang off the root's
 * `lfd-stress-1..3` classes in the theme's stylesheet.
 */
export class DamageStyle {
  static id = "base";

  /** @param {{element: HTMLElement, panel: object}} layer */
  constructor(layer) {
    this.layer = layer;
    this.host = document.createElement("div");
    this.host.className = `lfd-dmg-host lfd-dmg-${this.constructor.id}`;
    layer.element.append(this.host);
    this.alive = true;
    this.seed = null;
    this.levels = null;
    this.reduce = false;
    this.W = 0;
    this.H = 0;
  }

  get root() {
    return this.layer.panel.element;
  }

  /** The layer hands over the latest state before each call. */
  setState({ seed, levels, reduce }) {
    this.seed = seed;
    this.levels = levels;
    this.reduce = reduce;
  }

  /** Persistent structure damage for `count` points lost, drawn as it stands. */
  draw(_count) {}

  /** Structure lost: points `from`..`to - 1` are new. The default draws them and strikes each in turn. */
  strike(from, to) {
    this.draw(to, { forming: this.reduce ? [] : range(from, to) });
    if (this.reduce) return;
    for (let i = from; i < to; i++) this.after(() => this.impact(i), (i - from) * STAGGER_MS);
  }

  /** The hit itself for point `index` (flashes, debris, the panel's reaction). */
  impact(_index) {}

  /** Structure repaired: points `keep`..`had - 1` go. The default just redraws. */
  mend(keep, _had) {
    this.draw(keep);
  }

  /** Stress taken (not called under reduced motion). */
  stressHit(_levels, _prev) {}

  /** Continuous effects for the current levels (after every update and layout). */
  sync(_levels) {}

  /** The visible area changed size. `reshape` is true when the change is big enough to regenerate geometry. */
  resize(W, H, { reshape = false } = {}) {
    this.W = W;
    this.H = H;
    if (reshape && this.levels && !this.busy) this.draw(this.levels.fractures);
  }

  destroy() {
    this.alive = false;
    this.host.remove();
  }

  /* -------------------------------------------- */
  /*  Helpers                                     */
  /* -------------------------------------------- */

  /** A timer on the effects clock that stands down once the style is gone. */
  after(fn, ms = 0) {
    return clock.after(() => this.alive && fn(), ms);
  }

  /** A transient effect node at (x, y), removed after `ttl` ms. */
  spot(parent, cls, x, y, vars = {}, ttl = 1600) {
    const d = document.createElement("div");
    d.className = cls;
    d.style.left = `${x}px`;
    d.style.top = `${y}px`;
    for (const [k, v] of Object.entries(vars)) d.style.setProperty(k, v);
    parent.append(d);
    this.after(() => d.remove(), ttl);
    return d;
  }

  /** Add a class for `ms`, restarting its animation if it was already on. */
  pulse(el, cls, ms) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    this.after(() => el.classList.remove(cls), ms);
  }

  /** Where a part of the panel sits inside the visible area (the layer's coordinates). */
  rectOf(selector) {
    const root = this.root;
    const node = root?.querySelector(selector);
    if (!root || !node) return null;
    const a = node.getBoundingClientRect();
    const b = this.layer.element.getBoundingClientRect();
    // Both rects are on screen (zoomed); the layer's own coordinates are CSS px
    const z = b.width / (this.layer.element.offsetWidth || b.width) || 1;
    return { x: (a.left - b.left) / z, y: (a.top - b.top) / z, w: a.width / z, h: a.height / z };
  }
}

export function range(from, to) {
  const out = [];
  for (let i = from; i < to; i++) out.push(i);
  return out;
}

export function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export const rand = (a, b) => a + Math.random() * (b - a);
