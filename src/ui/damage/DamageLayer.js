import { damageLevels, generateFractures, pathData } from "./fracture.js";
import { SteamField } from "./SteamField.js";
import { damageClock as clock } from "./clock.js";

const SVG_NS = "http://www.w3.org/2000/svg";
/** Several fractures in one update (a big hit) land one after another, not all at once. */
const STAGGER_MS = 220;
/**
 * Regenerate fracture geometry only when the glass changes size by this fraction. Losing
 * structure itself reflows the panel (the odds text, the "one structure left" box), and the
 * crack that's forming must not jump; cracks past a shrunken edge are simply clipped.
 */
const RESHAPE_FRACTION = 0.2;
/** How long a mending crack takes to fade out. */
const MEND_MS = 1100;

/**
 * The panel's battle damage, drawn over its plates like a cracked cockpit screen.
 *
 * - Structure: each point lost is a fracture. A new one strikes with an impact flash, a
 *   shockwave ring, sparks and falling shards; the crack races across the glass, cools from
 *   white-hot, and stays until repaired. Repairs melt the cracks away.
 * - Stress: colour drains from the plates, amber warning LEDs blink along the bezel, and each
 *   hit browns the panel out for a moment. At the last point the lights go red and the power
 *   flickers now and then.
 * - Cracked and low on stress: steam escapes through the cracks.
 *
 * Cracks are thin bright lines blended with `screen`: they can lighten what's under them but
 * never darken it, so text stays readable. Everything is driven by state, not events: the
 * layer compares what it last drew for this mech with what the mech has now, so reloads and
 * mech switches draw quietly and only real changes animate.
 */
export class DamageLayer {
  /** @param {import("../FlightDeckPanel.js").FlightDeckPanel} panel */
  constructor(panel) {
    this.panel = panel;
  }

  /** @type {HTMLElement|null} */
  element = null;
  #svg = null;
  #fx = null;
  #dim = null;
  #steam = null;
  #observer = null;
  #seed = null;
  #levels = null;
  #reduce = false;
  /** The size the fracture geometry was generated for. */
  #geo = { W: 0, H: 0 };
  /** Geometry for the fractures currently drawn. */
  #fractures = [];
  /** Fracture index -> clock time when it started forming (for seamless redraws). */
  #forming = new Map();
  #mendTimer = null;
  #mending = false;

  /** Make sure the layer is in the panel (part re-renders don't touch it). */
  attach(root) {
    if (!this.element) this.#build();
    if (this.element.parentElement !== root) {
      root.append(this.element);
      this.#observer?.disconnect();
      this.#observer = new ResizeObserver(() => this.layout());
      this.#observer.observe(root);
    }
  }

  #build() {
    const el = document.createElement("div");
    el.className = "lfd-damage";
    el.setAttribute("aria-hidden", "true");
    this.#svg = document.createElementNS(SVG_NS, "svg");
    this.#svg.classList.add("lfd-cracks");
    const canvas = document.createElement("canvas");
    canvas.className = "lfd-steam";
    this.#dim = document.createElement("div");
    this.#dim.className = "lfd-dim";
    this.#fx = document.createElement("div");
    this.#fx.className = "lfd-damage-fx";
    const leds = document.createElement("div");
    leds.className = "lfd-warn-leds";
    leds.innerHTML = '<i class="r1"></i><i class="r2"></i><i class="r3"></i><i class="l1"></i><i class="l2"></i>';
    el.append(this.#svg, canvas, this.#dim, this.#fx, leds);
    this.element = el;
    this.#steam = new SteamField(canvas);
  }

  /**
   * Bring the layer in line with the mech.
   * @param {object|null} t  Telemetry snapshot (null in standby)
   * @param {{reduceMotion?: boolean}} [options]
   */
  update(t, { reduceMotion = false } = {}) {
    if (!this.element) return;
    const root = this.panel.element;
    const levels = t ? damageLevels(t) : { fractures: 0, stressLost: 0, stressLevel: 0, steam: 0 };
    const seed = t?.uuid ?? null;
    const prev = seed && seed === this.#seed ? this.#levels : null;
    this.#seed = seed;
    this.#levels = levels;
    this.#reduce = reduceMotion;

    for (let i = 0; i <= 3; i++) root?.classList.toggle(`lfd-stress-${i}`, levels.stressLevel === i && i > 0);
    root?.classList.toggle("lfd-stressed", levels.stressLevel > 0);
    root?.classList.toggle("lfd-cracked", levels.fractures > 0);
    this.layout({ redraw: false });

    if (!prev) {
      // First sight of this mech: draw what's there, quietly
      clearTimeout(this.#mendTimer);
      this.#mending = false;
      this.#forming.clear();
      this.#draw(levels.fractures);
    } else if (levels.fractures > prev.fractures) {
      const now = clock.now();
      if (!reduceMotion) {
        for (let i = prev.fractures; i < levels.fractures; i++) this.#forming.set(i, now + (i - prev.fractures) * STAGGER_MS);
      }
      this.#draw(levels.fractures);
      if (!reduceMotion) {
        for (let i = prev.fractures; i < levels.fractures; i++) {
          clock.after(() => this.#impact(this.#fractures[i]), (i - prev.fractures) * STAGGER_MS);
        }
      }
    } else if (levels.fractures < prev.fractures) {
      this.#mend(levels.fractures, prev.fractures);
    }

    if (prev && levels.stressLost > prev.stressLost && !reduceMotion) {
      this.#brownout();
      if (levels.fractures > 0) this.#steam.burst(levels.stressLevel >= 3 ? 1.4 : 1);
    }
    this.#syncSteam();
  }

  /** Track the panel's visible area (it scrolls; the glass doesn't). */
  layout({ redraw = true } = {}) {
    const root = this.panel.element;
    const el = this.element;
    if (!root || !el) return;
    const W = root.clientWidth;
    const H = root.clientHeight;
    el.style.top = `${root.scrollTop}px`;
    el.style.width = `${W}px`;
    el.style.height = `${H}px`;
    if (!W || !H) return;
    this.#steam.resize(W, H);
    const geo = this.#geo;
    const reshape = Math.abs(W - geo.W) > 2 || !geo.H || Math.abs(H - geo.H) > geo.H * RESHAPE_FRACTION;
    if (reshape) {
      this.#geo = { W, H };
      // A mend in progress redraws when it's done
      if (redraw && this.#levels && !this.#mending) this.#draw(this.#levels.fractures);
    }
    // Shown again after being collapsed or hidden: the steam picks up where it left off
    if (redraw && this.#levels) this.#syncSteam();
  }

  destroy() {
    this.#observer?.disconnect();
    this.#steam?.stop();
    this.element?.remove();
    this.element = null;
  }

  /* -------------------------------------------- */
  /*  Fractures                                   */
  /* -------------------------------------------- */

  /** Rebuild the SVG for `count` fractures. Fractures still forming continue where they were. */
  #draw(count) {
    const { W, H } = this.#geo;
    const svg = this.#svg;
    svg.replaceChildren();
    if (!count || !W || !H || !this.#seed) {
      this.#fractures = [];
      return;
    }
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("width", String(W));
    svg.setAttribute("height", String(H));
    this.#fractures = generateFractures(this.#seed, count, W, H);
    const now = clock.now();
    const defs = el("defs");
    svg.append(defs);
    for (const f of this.#fractures) {
      // Brightest at the impact, fading to hairlines at the tips
      const id = `lfd-fade-${f.index}`;
      const grad = el("radialGradient", { id: `${id}-g`, gradientUnits: "userSpaceOnUse", cx: f.impact[0], cy: f.impact[1], r: f.reach });
      grad.append(
        el("stop", { offset: 0, "stop-color": "#fff", "stop-opacity": 1 }),
        el("stop", { offset: 0.5, "stop-color": "#fff", "stop-opacity": 0.78 }),
        el("stop", { offset: 1, "stop-color": "#fff", "stop-opacity": 0.32 })
      );
      const mask = el("mask", { id, maskUnits: "userSpaceOnUse", x: 0, y: 0, width: W, height: H });
      mask.append(el("rect", { x: 0, y: 0, width: W, height: H, fill: `url(#${id}-g)` }));
      defs.append(grad, mask);

      const g = el("g", { class: "lfd-fracture", "data-index": f.index, mask: `url(#${id})` });
      const startedAt = this.#forming.get(f.index);
      if (startedAt !== undefined) {
        const elapsed = now - startedAt;
        if (elapsed < f.duration + 1600) {
          g.classList.add("is-forming");
          // Negative delays resume the animation where it was before the redraw
          g.style.setProperty("--t0", `${Math.round(-elapsed)}ms`);
        } else this.#forming.delete(f.index);
      }

      const facets = el("g", { class: "lfd-facets" });
      for (const facet of f.facets) {
        facets.append(el("polygon", { points: facet.points.map(p => p.join(",")).join(" "), style: `--a:${facet.tint}` }));
      }
      g.append(facets);

      const web = el("g", { class: "lfd-web" });
      for (const s of f.spokes) web.append(crackPath(s.points, { w: 0.7, delay: 0, dur: f.webDur * 0.6 }));
      f.rings.forEach((ring, i) => web.append(crackPath(ring, { w: 0.55, delay: f.webDur * (0.35 + i * 0.25), dur: f.webDur })));
      g.append(web);

      const pixels = el("g", { class: "lfd-pixels" });
      for (const px of f.pixels) {
        pixels.append(el("rect", { x: px.x, y: px.y, width: px.size, height: px.size, style: `--c:${px.color}` }));
      }
      g.append(pixels);

      const main = el("g", { class: "lfd-main" });
      for (const c of f.cracks) {
        const opts = { w: c.width * (c.depth ? 0.75 : 1), delay: c.delay, dur: c.dur };
        main.append(crackPath(c.points, { ...opts, glow: true }), crackPath(c.points, opts));
      }
      g.append(main);
      svg.append(g);
    }
    // Forming classes come off by themselves once the reveal is over
    for (const [i, startedAt] of this.#forming) {
      const f = this.#fractures[i];
      if (!f) continue;
      const left = startedAt + f.duration + 1600 - now;
      clock.after(() => {
        if (this.#forming.get(i) !== startedAt) return;
        this.#forming.delete(i);
        this.#svg?.querySelector(`.lfd-fracture[data-index="${i}"]`)?.classList.remove("is-forming");
      }, Math.max(0, left));
    }
  }

  /** The hit itself: flash, shockwave, sparks and shards at the impact point. */
  #impact(f) {
    if (!f || !this.#fx) return;
    const [x, y] = f.impact;
    const spot = (cls, extra = {}) => {
      const d = document.createElement("div");
      d.className = cls;
      d.style.left = `${x}px`;
      d.style.top = `${y}px`;
      for (const [k, v] of Object.entries(extra)) d.style.setProperty(k, v);
      this.#fx.append(d);
      return d;
    };
    const nodes = [spot("lfd-impact-flash"), spot("lfd-impact-ring")];
    // The whole screen jolts: a faint white pop and a split-second RGB tear
    const root = this.panel.element;
    this.element.classList.remove("is-impact");
    root?.classList.remove("is-impact");
    void this.element.offsetWidth;
    this.element.classList.add("is-impact");
    root?.classList.add("is-impact");
    clock.after(() => {
      this.element?.classList.remove("is-impact");
      root?.classList.remove("is-impact");
    }, 260);
    // Sparks spit inward from the impact
    for (let i = 0; i < 6; i++) {
      const a = f.inward + (Math.random() - 0.5) * 2.2;
      const dist = 16 + Math.random() * 30;
      nodes.push(spot("lfd-spark", {
        "--rot": `${a}rad`,
        "--dx": `${Math.cos(a) * dist}px`,
        "--dy": `${Math.sin(a) * dist}px`,
        "--d": `${Math.round(Math.random() * 90)}ms`,
      }));
    }
    // Shards break off the web and fall
    for (let i = 0; i < 8; i++) {
      const a = f.inward + (Math.random() - 0.5) * 2.4;
      const shard = spot("lfd-shard", {
        "--dx": `${Math.cos(a) * (8 + Math.random() * 26)}px`,
        "--dy": `${40 + Math.random() * 90}px`,
        "--rot": `${(Math.random() - 0.5) * 720}deg`,
        "--s": `${3 + Math.random() * 5}px`,
        "--dur": `${650 + Math.random() * 450}ms`,
        "--d": `${40 + Math.round(Math.random() * 120)}ms`,
      });
      shard.append(document.createElement("i"));
      nodes.push(shard);
    }
    clock.after(() => nodes.forEach(n => n.remove()), 1500);
  }

  /** Repairs: the cracks that are going glow, then melt away. */
  #mend(keep, had) {
    clearTimeout(this.#mendTimer);
    const svg = this.#svg;
    if (this.#reduce || !svg) return this.#draw(keep);
    for (let i = keep; i < had; i++) {
      this.#forming.delete(i);
      svg.querySelector(`.lfd-fracture[data-index="${i}"]`)?.classList.add("is-mending");
    }
    this.#mending = true;
    this.#mendTimer = clock.after(() => {
      this.#mending = false;
      this.layout({ redraw: false });
      this.#draw(this.#levels?.fractures ?? keep);
      this.#syncSteam();
    }, MEND_MS);
  }

  /** Taking stress: the panel browns out for a moment. */
  #brownout() {
    const el = this.element;
    if (!el) return;
    el.classList.remove("is-brownout");
    void el.offsetWidth; // restart
    el.classList.add("is-brownout");
    clock.after(() => el.classList.remove("is-brownout"), 1300);
  }

  #syncSteam() {
    const levels = this.#levels;
    const level = this.#reduce || !levels ? 0 : levels.steam;
    // Steam leaves from points along the cracks (main cracks first: they're the widest)
    this.#steam.setVents(level ? this.#fractures.flatMap(f => f.vents) : []);
    this.#steam.setLevel(level);
  }
}

/* -------------------------------------------- */
/*  SVG helpers                                 */
/* -------------------------------------------- */

function el(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** A crack line (or its soft glow), normalised so the reveal animates by dash offset. */
function crackPath(points, { w, delay, dur, glow = false }) {
  return el("path", {
    d: pathData(points),
    pathLength: 1,
    class: glow ? "lfd-crack-glow" : "lfd-crack",
    style: `--w:${w};--delay:${Math.round(delay)}ms;--dur:${Math.round(dur)}ms`,
  });
}
