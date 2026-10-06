import { generateFractures, pathData } from "../fracture.js";
import { SteamField } from "../SteamField.js";
import { damageClock as clock } from "../clock.js";
import { DamageStyle, svg } from "./DamageStyle.js";

/** The glass's own stagger between several fractures in one hit. */
const STAGGER_MS = 220;
/** How long a mending crack takes to fade out. */
const MEND_MS = 1100;

/**
 * GMS: a cracked cockpit screen (the original Flight Deck damage).
 *
 * - Structure: each point lost is a fracture. A new one strikes with an impact flash, a shockwave ring,
 *   sparks and falling shards; the crack races across the glass, cools from white-hot, and stays until
 *   repaired. Repairs melt the cracks away.
 * - Stress: colour drains from the plates, amber warning LEDs blink along the bezel, and each hit
 *   browns the panel out for a moment. At the last point the lights go red and the power flickers.
 * - Cracked and low on stress: steam escapes through the cracks.
 *
 * Cracks are thin bright lines blended with `screen`: they can lighten what's under them but never
 * darken it, so text stays readable.
 */
export class GlassDamage extends DamageStyle {
  static id = "glass";

  constructor(layer) {
    super(layer);
    this.svg = svg("svg", { class: "lfd-cracks" });
    const canvas = document.createElement("canvas");
    canvas.className = "lfd-steam";
    this.dim = document.createElement("div");
    this.dim.className = "lfd-dim";
    this.fx = document.createElement("div");
    this.fx.className = "lfd-damage-fx";
    const leds = document.createElement("div");
    leds.className = "lfd-warn-leds";
    leds.innerHTML = '<i class="r1"></i><i class="r2"></i><i class="r3"></i><i class="l1"></i><i class="l2"></i>';
    this.host.append(this.svg, canvas, this.dim, this.fx, leds);
    this.steam = new SteamField(canvas);
    /** Geometry for the fractures currently drawn. */
    this.fractures = [];
    /** Fracture index -> clock time when it started forming (for seamless redraws). */
    this.forming = new Map();
    this.mendTimer = null;
    this.busy = false;
  }

  /** Fractures still forming (a resize mid-hit) carry on where they were. */
  draw(count) {
    this.#render(count);
  }

  strike(from, to) {
    const now = clock.now();
    if (!this.reduce) for (let i = from; i < to; i++) this.forming.set(i, now + (i - from) * STAGGER_MS);
    this.#render(to);
    if (this.reduce) return;
    for (let i = from; i < to; i++) this.after(() => this.#impact(this.fractures[i]), (i - from) * STAGGER_MS);
  }

  mend(keep, had) {
    clearTimeout(this.mendTimer);
    if (this.reduce) return this.#render(keep);
    for (let i = keep; i < had; i++) {
      this.forming.delete(i);
      this.svg.querySelector(`.lfd-fracture[data-index="${i}"]`)?.classList.add("is-mending");
    }
    this.busy = true;
    this.mendTimer = this.after(() => {
      this.busy = false;
      this.#render(this.levels?.fractures ?? keep);
      this.sync(this.levels);
    }, MEND_MS);
  }

  /** First sight of a mech: nothing is mid-formation. */
  reset() {
    clearTimeout(this.mendTimer);
    this.busy = false;
    this.forming.clear();
  }

  stressHit(levels) {
    this.#brownout();
    if (levels.fractures > 0) this.steam.burst(levels.stressLevel >= 3 ? 1.4 : 1);
  }

  sync(levels) {
    const level = this.reduce || !levels ? 0 : levels.steam;
    // Steam leaves from points along the cracks (main cracks first: they're the widest)
    this.steam.setVents(level ? this.fractures.flatMap(f => f.vents) : []);
    this.steam.setLevel(level);
  }

  resize(W, H, opts) {
    this.steam.resize(W, H);
    super.resize(W, H, opts);
  }

  destroy() {
    clearTimeout(this.mendTimer);
    this.steam.stop();
    super.destroy();
  }

  /* -------------------------------------------- */

  /** Rebuild the SVG for `count` fractures. Fractures still forming continue where they were. */
  #render(count) {
    const { W, H } = this;
    const root = this.svg;
    root.replaceChildren();
    if (!count || !W || !H || !this.seed) {
      this.fractures = [];
      return;
    }
    root.setAttribute("viewBox", `0 0 ${W} ${H}`);
    root.setAttribute("width", String(W));
    root.setAttribute("height", String(H));
    this.fractures = generateFractures(this.seed, count, W, H);
    const now = clock.now();
    const defs = svg("defs");
    root.append(defs);
    for (const f of this.fractures) {
      // Brightest at the impact, fading to hairlines at the tips
      const id = `lfd-fade-${f.index}`;
      const grad = svg("radialGradient", { id: `${id}-g`, gradientUnits: "userSpaceOnUse", cx: f.impact[0], cy: f.impact[1], r: f.reach });
      grad.append(
        svg("stop", { offset: 0, "stop-color": "#fff", "stop-opacity": 1 }),
        svg("stop", { offset: 0.5, "stop-color": "#fff", "stop-opacity": 0.78 }),
        svg("stop", { offset: 1, "stop-color": "#fff", "stop-opacity": 0.32 })
      );
      const mask = svg("mask", { id, maskUnits: "userSpaceOnUse", x: 0, y: 0, width: W, height: H });
      mask.append(svg("rect", { x: 0, y: 0, width: W, height: H, fill: `url(#${id}-g)` }));
      defs.append(grad, mask);

      const g = svg("g", { class: "lfd-fracture lfd-dmg-mark", "data-index": f.index, mask: `url(#${id})` });
      const startedAt = this.forming.get(f.index);
      if (startedAt !== undefined) {
        const elapsed = now - startedAt;
        if (elapsed < f.duration + 1600) {
          g.classList.add("is-forming");
          // Negative delays resume the animation where it was before the redraw
          g.style.setProperty("--t0", `${Math.round(-elapsed)}ms`);
        } else this.forming.delete(f.index);
      }

      const facets = svg("g", { class: "lfd-facets" });
      for (const facet of f.facets) {
        facets.append(svg("polygon", { points: facet.points.map(p => p.join(",")).join(" "), style: `--a:${facet.tint}` }));
      }
      g.append(facets);

      const web = svg("g", { class: "lfd-web" });
      for (const s of f.spokes) web.append(crackPath(s.points, { w: 0.7, delay: 0, dur: f.webDur * 0.6 }));
      f.rings.forEach((ring, i) => web.append(crackPath(ring, { w: 0.55, delay: f.webDur * (0.35 + i * 0.25), dur: f.webDur })));
      g.append(web);

      const pixels = svg("g", { class: "lfd-pixels" });
      for (const px of f.pixels) {
        pixels.append(svg("rect", { x: px.x, y: px.y, width: px.size, height: px.size, style: `--c:${px.color}` }));
      }
      g.append(pixels);

      const main = svg("g", { class: "lfd-main" });
      for (const c of f.cracks) {
        const opts = { w: c.width * (c.depth ? 0.75 : 1), delay: c.delay, dur: c.dur };
        main.append(crackPath(c.points, { ...opts, glow: true }), crackPath(c.points, opts));
      }
      g.append(main);
      root.append(g);
    }
    // Forming classes come off by themselves once the reveal is over
    for (const [i, startedAt] of this.forming) {
      const f = this.fractures[i];
      if (!f) continue;
      const left = startedAt + f.duration + 1600 - now;
      this.after(() => {
        if (this.forming.get(i) !== startedAt) return;
        this.forming.delete(i);
        this.svg.querySelector(`.lfd-fracture[data-index="${i}"]`)?.classList.remove("is-forming");
      }, Math.max(0, left));
    }
  }

  /** The hit itself: flash, shockwave, sparks and shards at the impact point. */
  #impact(f) {
    if (!f) return;
    const [x, y] = f.impact;
    const fx = this.fx;
    this.spot(fx, "lfd-impact-flash", x, y, {}, 1500);
    this.spot(fx, "lfd-impact-ring", x, y, {}, 1500);
    // The whole screen jolts: a faint white pop and a split-second RGB tear
    this.pulse(this.layer.element, "is-impact", 260);
    this.pulse(this.root, "is-impact", 260);
    // Sparks spit inward from the impact
    for (let i = 0; i < 6; i++) {
      const a = f.inward + (Math.random() - 0.5) * 2.2;
      const dist = 16 + Math.random() * 30;
      this.spot(fx, "lfd-spark", x, y, {
        "--rot": `${a}rad`,
        "--dx": `${Math.cos(a) * dist}px`,
        "--dy": `${Math.sin(a) * dist}px`,
        "--d": `${Math.round(Math.random() * 90)}ms`,
      }, 1500);
    }
    // Shards break off the web and fall
    for (let i = 0; i < 8; i++) {
      const a = f.inward + (Math.random() - 0.5) * 2.4;
      const shard = this.spot(fx, "lfd-shard", x, y, {
        "--dx": `${Math.cos(a) * (8 + Math.random() * 26)}px`,
        "--dy": `${40 + Math.random() * 90}px`,
        "--rot": `${(Math.random() - 0.5) * 720}deg`,
        "--s": `${3 + Math.random() * 5}px`,
        "--dur": `${650 + Math.random() * 450}ms`,
        "--d": `${40 + Math.round(Math.random() * 120)}ms`,
      }, 1500);
      shard.append(document.createElement("i"));
    }
  }

  /** Taking stress: the panel browns out for a moment. */
  #brownout() {
    this.pulse(this.layer.element, "is-brownout", 1300);
  }
}

/** A crack line (or its soft glow), normalised so the reveal animates by dash offset. */
function crackPath(points, { w, delay, dur, glow = false }) {
  return svg("path", {
    d: pathData(points),
    pathLength: 1,
    class: glow ? "lfd-crack-glow" : "lfd-crack",
    style: `--w:${w};--delay:${Math.round(delay)}ms;--dur:${Math.round(dur)}ms`,
  });
}
