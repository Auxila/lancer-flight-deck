import { generateSpall } from "../geometry.js";
import { pathData } from "../fracture.js";
import { damageClock as clock } from "../clock.js";
import { DamageStyle, STAGGER_MS, rand, svg } from "./DamageStyle.js";

const MEND_MS = 1100;

/**
 * HA: Armory concrete takes the hit, then the heat.
 *
 * - Structure: each point lost lands like a shell on poured concrete. A heavy thud (the panel drops and
 *   settles, it doesn't shake), a chunk bitten out of the slab's edge with the rebar showing, blocky
 *   cracks running out from it in hard steps, a cloud of dust and chunks of debris falling. The spall and
 *   the cracks stay. Repairs pour them full again in violet resin.
 * - Stress: heat soak, the Armory's own discipline. The slabs glow from the edges in, violet going
 *   orange, deeper with each level; heat haze rises from the second; at the last point the insignia burn
 *   (styles/themes/ha.css). Each hit vents: plasma jets from the bottom corners and a flare through the
 *   glow.
 */
export class ConcreteDamage extends DamageStyle {
  static id = "concrete";

  constructor(layer) {
    super(layer);
    this.soak = div("lfd-ha-soak");
    this.wisps = div("lfd-ha-wisps");
    this.wisps.innerHTML = "<i></i>".repeat(7);
    this.svg = svg("svg", { class: "lfd-ha-svg" });
    this.fx = div("lfd-ha-fx");
    this.host.append(this.soak, this.wisps, this.svg, this.fx);
    this.spalls = [];
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
    for (let i = from; i < to; i++) this.after(() => this.#impact(this.spalls[i]), (i - from) * STAGGER_MS);
  }

  mend(keep, had) {
    clearTimeout(this.mendTimer);
    if (this.reduce) return this.#render(keep);
    for (let i = keep; i < had; i++) {
      this.forming.delete(i);
      this.svg.querySelector(`.lfd-spall[data-index="${i}"]`)?.classList.add("is-mending");
    }
    this.busy = true;
    this.mendTimer = this.after(() => {
      this.busy = false;
      this.#render(this.levels?.fractures ?? keep);
    }, MEND_MS);
  }

  /** Heat vents: plasma jets from the bottom corners, a flare through the glow. */
  stressHit() {
    this.pulse(this.host, "is-venting", 1200);
    const { W, H } = this;
    for (const [x, flip] of [[10, 1], [W - 10, -1]]) {
      this.spot(this.fx, "lfd-ha-vent", x, H, { "--lean": `${flip * 9}deg` }, 1300);
      for (let i = 0; i < 7; i++) {
        this.spot(this.fx, "lfd-ha-ember", x + rand(-6, 6), H - rand(4, 14), {
          "--dx": `${flip * rand(4, 26)}px`,
          "--dy": `${-rand(60, 170)}px`,
          "--d": `${Math.round(rand(40, 380))}ms`,
        }, 1500);
      }
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
    if (!count || !W || !H || !this.seed) {
      this.spalls = [];
      return;
    }
    this.svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    this.svg.setAttribute("width", String(W));
    this.svg.setAttribute("height", String(H));
    this.spalls = [];
    for (let i = 0; i < count; i++) this.spalls.push(generateSpall(this.seed, i, W, H));
    const now = clock.now();
    const defs = svg("defs");
    const hole = svg("radialGradient", { id: "lfd-ha-hole" });
    hole.append(svg("stop", { offset: 0, "stop-color": "#050406" }), svg("stop", { offset: 0.7, "stop-color": "#0d0b0f" }), svg("stop", { offset: 1, "stop-color": "#2a2530" }));
    defs.append(hole);
    this.svg.append(defs);
    for (const s of this.spalls) {
      const g = svg("g", { class: "lfd-spall lfd-dmg-mark", "data-index": s.index });
      const startedAt = this.forming.get(s.index);
      const formMs = s.duration + 900;
      if (startedAt !== undefined) {
        const elapsed = now - startedAt;
        if (elapsed < formMs) {
          g.classList.add("is-forming");
          g.style.setProperty("--t0", `${Math.round(-elapsed)}ms`);
          this.after(() => {
            if (this.forming.get(s.index) !== startedAt) return;
            this.forming.delete(s.index);
            this.svg.querySelector(`.lfd-spall[data-index="${s.index}"]`)?.classList.remove("is-forming");
          }, formMs - elapsed);
        } else this.forming.delete(s.index);
      }
      for (const c of s.cracks) {
        const d = pathData(c.points);
        const vars = `--w:${c.width};--delay:${c.delay}ms;--dur:${c.dur}ms`;
        g.append(
          svg("path", { class: "lfd-spall-crack-hi", d, pathLength: 1, style: vars, transform: "translate(0.7 0.8)" }),
          svg("path", { class: "lfd-spall-crack", d, pathLength: 1, style: vars })
        );
      }
      const bite = s.bite.map(p => p.join(",")).join(" ");
      g.append(svg("polygon", { class: "lfd-spall-bite", points: bite, fill: "url(#lfd-ha-hole)" }));
      for (const [[x1, y1], [x2, y2]] of s.rebar) g.append(svg("line", { class: "lfd-spall-rebar", x1, y1, x2, y2 }));
      g.append(svg("polygon", { class: "lfd-spall-lip", points: bite }));
      this.svg.append(g);
    }
  }

  /** The shell lands: dust, a chunk of slab, debris falling. (The thud is the theme's is-shaken.) */
  #impact(s) {
    if (!s) return;
    const [x, y] = s.impact;
    this.spot(this.fx, "lfd-ha-strike", x, y, {}, 700);
    for (let i = 0; i < 7; i++) {
      const a = s.inward + rand(-1.1, 1.1);
      this.spot(this.fx, "lfd-ha-dust", x + Math.cos(a) * rand(2, 10), y + Math.sin(a) * rand(2, 10), {
        "--dx": `${Math.cos(a) * rand(14, 40)}px`,
        "--dy": `${Math.sin(a) * rand(8, 26) + rand(6, 22)}px`,
        "--s": `${rand(14, 30)}px`,
        "--d": `${Math.round(rand(0, 160))}ms`,
      }, 1900);
    }
    for (let i = 0; i < 8; i++) {
      const a = s.inward + rand(-1.3, 1.3);
      this.spot(this.fx, "lfd-ha-chunk", x, y, {
        "--dx": `${Math.cos(a) * rand(10, 34)}px`,
        "--dy": `${rand(70, 150)}px`,
        "--rot": `${rand(-300, 300)}deg`,
        "--s": `${rand(2.5, 5.5)}px`,
        "--d": `${Math.round(rand(20, 140))}ms`,
        "--dur": `${Math.round(rand(520, 760))}ms`,
      }, 1300).append(document.createElement("i"));
    }
  }
}

function div(cls) {
  const d = document.createElement("div");
  d.className = cls;
  return d;
}
