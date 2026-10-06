import { generateBreach } from "../geometry.js";
import { damageClock as clock } from "../clock.js";
import { DamageStyle, STAGGER_MS, rand, svg } from "./DamageStyle.js";

/** How long a breach takes to go from the hit to the patch bolted down. */
const FORM_MS = 1900;
const MEND_MS = 1200;

/**
 * IPS-N: damage on a ship's bridge.
 *
 * - Structure: each point lost holes the hull. The shell punches a jagged breach with metal petals torn
 *   outward and scorching around it, buckles the plating into dents and tears a seam open inboard; rivets pop out of the seam and spin away, sea spray bursts in, and
 *   the panel rolls like a ship taking a hit. A second later damage control slams a patch plate over it
 *   (hazard tape, four bolts welded down one after another). The patch stays, with the torn petals
 *   showing round it, popped rivet holes beside it, and water slowly dripping out from under it. Repairs
 *   weld the patch smooth and it fades.
 * - Stress: the bridge goes to battle lanterns. A red rotating beacon sweeps the panel, faster with each
 *   level, and red emergency lighting closes in from the edges. Each hit sends a pressure wave through
 *   the bulkheads: a bright band rolling down, the panel flexing, paint flakes shaken loose.
 */
export class HullDamage extends DamageStyle {
  static id = "hull";

  constructor(layer) {
    super(layer);
    this.lantern = div("lfd-hull-lantern");
    this.beacon = div("lfd-hull-beacon");
    this.svg = svg("svg", { class: "lfd-hull-svg" });
    this.drips = div("lfd-hull-drips");
    this.fx = div("lfd-hull-fx");
    this.surge = div("lfd-hull-surge");
    this.host.append(this.lantern, this.beacon, this.svg, this.drips, this.fx, this.surge);
    this.breaches = [];
    this.forming = new Map();
    this.busy = false;
    this.mendTimer = null;
  }

  reset() {
    clearTimeout(this.mendTimer);
    this.busy = false;
    this.forming.clear();
  }

  draw(count) {
    this.#render(count);
  }

  strike(from, to) {
    const now = clock.now();
    if (!this.reduce) for (let i = from; i < to; i++) this.forming.set(i, now + (i - from) * STAGGER_MS);
    this.#render(to);
    if (this.reduce) return;
    for (let i = from; i < to; i++) this.after(() => this.#impact(this.breaches[i]), (i - from) * STAGGER_MS);
  }

  mend(keep, had) {
    clearTimeout(this.mendTimer);
    if (this.reduce) return this.#render(keep);
    for (let i = keep; i < had; i++) {
      this.forming.delete(i);
      this.svg.querySelector(`.lfd-breach[data-index="${i}"]`)?.classList.add("is-mending");
      this.drips.querySelector(`[data-index="${i}"]`)?.remove();
    }
    this.busy = true;
    this.mendTimer = this.after(() => {
      this.busy = false;
      this.#render(this.levels?.fractures ?? keep);
    }, MEND_MS);
  }

  /** A pressure wave through the bulkheads, paint shaken loose. */
  stressHit() {
    this.pulse(this.host, "is-surge", 1300);
    this.pulse(this.root, "is-groan", 750);
    const { W, H } = this;
    for (let i = 0; i < 9; i++) {
      this.spot(this.fx, "lfd-hull-flake", rand(10, W - 10), rand(H * 0.04, H * 0.5), {
        "--dx": `${rand(-14, 14)}px`,
        "--dy": `${rand(50, 130)}px`,
        "--rot": `${rand(-400, 400)}deg`,
        "--d": `${Math.round(rand(80, 520))}ms`,
        "--dur": `${Math.round(rand(1100, 1700))}ms`,
      }, 2400).append(document.createElement("i"));
    }
  }

  destroy() {
    clearTimeout(this.mendTimer);
    super.destroy();
  }

  /* -------------------------------------------- */

  #render(count) {
    const { W, H } = this;
    this.svg.replaceChildren();
    this.drips.replaceChildren();
    if (!count || !W || !H || !this.seed) {
      this.breaches = [];
      return;
    }
    this.svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    this.svg.setAttribute("width", String(W));
    this.svg.setAttribute("height", String(H));
    this.breaches = [];
    for (let i = 0; i < count; i++) this.breaches.push(generateBreach(this.seed, i, W, H));
    const now = clock.now();
    this.svg.append(defs());
    for (const b of this.breaches) {
      const g = svg("g", { class: "lfd-breach lfd-dmg-mark", "data-index": b.index });
      const startedAt = this.forming.get(b.index);
      if (startedAt !== undefined) {
        const elapsed = now - startedAt;
        if (elapsed < FORM_MS) {
          g.classList.add("is-forming");
          g.style.setProperty("--t0", `${Math.round(-elapsed)}ms`);
          this.after(() => {
            if (this.forming.get(b.index) !== startedAt) return;
            this.forming.delete(b.index);
            this.svg.querySelector(`.lfd-breach[data-index="${b.index}"]`)?.classList.remove("is-forming");
          }, FORM_MS - elapsed);
        } else this.forming.delete(b.index);
      }
      const [x, y] = b.impact;
      // The burst grows out of the impact point
      g.style.setProperty("--ox", `${x}px`);
      g.style.setProperty("--oy", `${y}px`);
      g.append(svg("circle", { class: "lfd-breach-scorch", cx: x, cy: y, r: b.scorch, fill: "url(#lfd-hull-scorch)" }));
      // Buckled plating: each dent is a shadowed crease with a lit lip
      const dents = svg("g", { class: "lfd-breach-dents" });
      for (const d of b.dents) {
        const arc = arcPath(x, y, d.r, d.a0, d.a1);
        dents.append(svg("path", { class: "lfd-dent-shade", d: arc }), svg("path", { class: "lfd-dent-lip", d: arc, transform: "translate(0.9 0.9)" }));
      }
      // The torn seam running inboard
      const tear = pathOf(b.tear);
      g.append(
        dents,
        svg("path", { class: "lfd-breach-tear-lip", d: tear, transform: "translate(0.8 0.8)" }),
        svg("path", { class: "lfd-breach-tear", d: tear, pathLength: 1 }),
        svg("polygon", { class: "lfd-breach-hole", points: pts(b.hole) })
      );
      const petals = svg("g", { class: "lfd-breach-petals" });
      for (const p of b.petals) petals.append(svg("polygon", { points: pts(p) }));
      const rivets = svg("g", { class: "lfd-breach-rivets" });
      for (const [rx, ry] of b.rivets) rivets.append(svg("circle", { cx: rx, cy: ry, r: 1.5 }));
      const { w, h } = b.patch;
      const patch = svg("g", { class: "lfd-breach-patch", transform: `translate(${b.patch.x} ${b.patch.y}) rotate(${b.patch.angle})` });
      const plate = svg("g", { class: "lfd-patch-in" });
      plate.append(
        svg("rect", { class: "lfd-patch-plate", x: -w / 2, y: -h / 2, width: w, height: h, rx: 1.5, fill: "url(#lfd-hull-steel)" }),
        svg("rect", { class: "lfd-patch-tape", x: -w / 2 + 1, y: -2.6, width: w - 2, height: 5.2, fill: "url(#lfd-hull-hazard)" }),
        svg("rect", { class: "lfd-patch-weld", x: -w / 2 + 0.6, y: -h / 2 + 0.6, width: w - 1.2, height: h - 1.2, rx: 1.2 })
      );
      for (const [bx, by] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        plate.append(svg("circle", { class: "lfd-patch-bolt", cx: bx * (w / 2 - 2.6), cy: by * (h / 2 - 2.4), r: 1.15 }));
      }
      patch.append(plate);
      g.append(petals, rivets, patch);
      this.svg.append(g);
      // Water seeping out from under the patch
      if (b.drip) {
        const drip = div("lfd-hull-drip");
        drip.dataset.index = String(b.index);
        drip.style.left = `${b.drip.x}px`;
        drip.style.top = `${b.drip.y}px`;
        drip.style.height = `${b.drip.len}px`;
        drip.style.setProperty("--i", String(b.index));
        drip.append(document.createElement("i"));
        this.drips.append(drip);
      }
    }
  }

  /** The shell hits: flash, sparks, rivets popping out of the seam, and a burst of spray. */
  #impact(b) {
    if (!b) return;
    const [x, y] = b.impact;
    const fx = this.fx;
    this.spot(fx, "lfd-hull-flash", x, y, {}, 900);
    this.spot(fx, "lfd-hull-shock", x, y, {}, 900);
    for (let i = 0; i < 10; i++) {
      const a = b.inward + rand(-1.1, 1.1);
      const dist = rand(18, 44);
      this.spot(fx, "lfd-hull-spark", x, y, { "--rot": `${a}rad`, "--dx": `${Math.cos(a) * dist}px`, "--dy": `${Math.sin(a) * dist}px`, "--d": `${Math.round(rand(0, 80))}ms` }, 900);
    }
    for (const [rx, ry] of b.rivets) {
      const a = b.inward + rand(-1.4, 1.4);
      this.spot(fx, "lfd-hull-rivet", rx, ry, {
        "--dx": `${Math.cos(a) * rand(14, 40)}px`,
        "--dy": `${rand(40, 110)}px`,
        "--up": `${rand(-26, -10)}px`,
        "--rot": `${rand(-900, 900)}deg`,
        "--d": `${Math.round(rand(20, 160))}ms`,
        "--dur": `${Math.round(rand(700, 1000))}ms`,
      }, 1500).append(document.createElement("i"));
    }
    for (let i = 0; i < 22; i++) {
      const a = b.inward + rand(-0.9, 0.9);
      const dist = rand(18, 80);
      this.spot(fx, "lfd-hull-spray", x, y, { "--dx": `${Math.cos(a) * dist}px`, "--dy": `${Math.sin(a) * dist + rand(4, 16)}px`, "--d": `${Math.round(rand(30, 220))}ms`, "--s": `${rand(1.2, 2.6)}px` }, 1200);
    }
  }
}

function div(cls) {
  const d = document.createElement("div");
  d.className = cls;
  return d;
}

function pathOf(points) {
  return points.map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join(" ");
}

/** An arc of radius r round (x, y), from angle a0 to a1 (radians). */
function arcPath(x, y, r, a0, a1) {
  const p = a => `${Math.round((x + Math.cos(a) * r) * 10) / 10} ${Math.round((y + Math.sin(a) * r) * 10) / 10}`;
  return `M${p(a0)} A${r} ${r} 0 0 1 ${p(a1)}`;
}

function pts(list) {
  return list.map(p => p.join(",")).join(" ");
}

/** Scorch, the patch's steel, and hazard tape. */
function defs() {
  const d = svg("defs");
  const scorch = svg("radialGradient", { id: "lfd-hull-scorch" });
  scorch.append(
    svg("stop", { offset: 0, "stop-color": "#05070a", "stop-opacity": 0.75 }),
    svg("stop", { offset: 0.45, "stop-color": "#1a120c", "stop-opacity": 0.4 }),
    svg("stop", { offset: 0.75, "stop-color": "#4a2a14", "stop-opacity": 0.12 }),
    svg("stop", { offset: 1, "stop-color": "#4a2a14", "stop-opacity": 0 })
  );
  const steel = svg("linearGradient", { id: "lfd-hull-steel", x1: 0, y1: 0, x2: 0, y2: 1 });
  steel.append(svg("stop", { offset: 0, "stop-color": "#6f879e" }), svg("stop", { offset: 0.5, "stop-color": "#4a6077" }), svg("stop", { offset: 1, "stop-color": "#33475a" }));
  const hazard = svg("pattern", { id: "lfd-hull-hazard", width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" });
  hazard.append(svg("rect", { width: 6, height: 6, fill: "#14181d" }), svg("rect", { width: 3, height: 6, fill: "#e2b52a" }));
  d.append(scorch, steel, hazard);
  return d;
}
