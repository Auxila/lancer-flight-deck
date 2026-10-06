import { SEAM_CRACK_SPEED, SEAM_GOLD_LAG, SEAM_GOLD_SPEED, generateSeam, smoothPath } from "../geometry.js";
import { damageClock as clock } from "../clock.js";
import { DamageStyle, STAGGER_MS, rand, svg } from "./DamageStyle.js";

const MEND_MS = 1300;
/** Moths drawn to the reactor, per stress level. */
const MOTHS = [0, 1, 2, 4];

/**
 * SSC: kintsugi. A Smith-Shimano frame isn't scarred, it's mended in gold.
 *
 * - Structure: each point lost breaks the lacquer. A crystalline tink and a glint at the edge, a ripple
 *   through the lacquer, a white hairline racing inward; then molten gold flows in behind it and sets,
 *   filling the chips along the way, while flakes of gold leaf drift down. The movement stutters like a
 *   watch skipping a beat. The gold seams stay, a glint travelling along them now and then. Repairs
 *   polish them away.
 * - Stress: moths to the flame. Gold-dust moths circle the reactor, more of them as stress mounts, and
 *   the gold leaf everywhere tarnishes. Each hit flares the reactor and startles the moths.
 */
export class KintsugiDamage extends DamageStyle {
  static id = "kintsugi";

  constructor(layer) {
    super(layer);
    this.svg = svg("svg", { class: "lfd-kin-svg" });
    this.moths = div("lfd-kin-moths");
    this.fx = div("lfd-kin-fx");
    this.flare = div("lfd-kin-flare");
    this.host.append(this.svg, this.moths, this.flare, this.fx);
    this.seams = [];
    this.forming = new Map();
    this.busy = false;
    this.mendTimer = null;
    this.flightKey = "";
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
    for (let i = from; i < to; i++) this.after(() => this.#impact(this.seams[i]), (i - from) * STAGGER_MS);
  }

  mend(keep, had) {
    clearTimeout(this.mendTimer);
    if (this.reduce) return this.#render(keep);
    for (let i = keep; i < had; i++) {
      this.forming.delete(i);
      this.svg.querySelector(`.lfd-seam[data-index="${i}"]`)?.classList.add("is-mending");
    }
    this.busy = true;
    this.mendTimer = this.after(() => {
      this.busy = false;
      this.#render(this.levels?.fractures ?? keep);
    }, MEND_MS);
  }

  /** The reactor flares; gold dust rises off it and the moths scatter. */
  stressHit() {
    const r = this.rectOf(".lfd-heat");
    if (r) {
      Object.assign(this.flare.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
      this.pulse(this.flare, "is-flaring", 1100);
      for (let i = 0; i < 14; i++) {
        this.spot(this.fx, "lfd-kin-dust", r.x + rand(0.08, 0.92) * r.w, r.y + rand(0.2, 0.9) * r.h, {
          "--dx": `${rand(-18, 18)}px`,
          "--dy": `${rand(-70, -26)}px`,
          "--d": `${Math.round(rand(0, 380))}ms`,
          "--s": `${rand(1.2, 2.4)}px`,
        }, 1800);
      }
    }
    this.pulse(this.moths, "is-startled", 2200);
    this.pulse(this.root, "is-tick", 520);
  }

  sync(levels) {
    const want = this.reduce ? 0 : MOTHS[levels?.stressLevel ?? 0] ?? 0;
    const r = want ? this.rectOf(".lfd-heat") : null;
    const count = r ? want : 0;
    while (this.moths.children.length > count) this.moths.lastElementChild.remove();
    while (this.moths.children.length < count) {
      const moth = div("lfd-kin-moth");
      const k = this.moths.children.length;
      moth.style.setProperty("--dur", `${(6.5 + k * 1.7 + Math.random() * 1.5).toFixed(2)}s`);
      moth.style.setProperty("--d", `${(-Math.random() * 8).toFixed(2)}s`);
      moth.style.setProperty("--flap", `${(105 + Math.random() * 40).toFixed(0)}ms`);
      moth.innerHTML = "<i><b></b><b></b></i>";
      this.moths.append(moth);
      this.flightKey = "";
    }
    if (!count) return;
    // Each moth loops round the reactor plate on its own wobbly orbit
    const key = `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.w)},${Math.round(r.h)},${count}`;
    if (key === this.flightKey) return;
    this.flightKey = key;
    [...this.moths.children].forEach((moth, k) => moth.style.setProperty("offset-path", `path("${orbit(r, k)}")`));
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
      this.seams = [];
      return;
    }
    this.svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    this.svg.setAttribute("width", String(W));
    this.svg.setAttribute("height", String(H));
    this.seams = [];
    for (let i = 0; i < count; i++) this.seams.push(generateSeam(this.seed, i, W, H));
    const now = clock.now();
    for (const s of this.seams) {
      const g = svg("g", { class: "lfd-seam lfd-dmg-mark", "data-index": s.index, style: `--i:${s.index}` });
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
            this.svg.querySelector(`.lfd-seam[data-index="${s.index}"]`)?.classList.remove("is-forming");
          }, formMs - elapsed);
        } else this.forming.delete(s.index);
      }
      for (const seam of s.seams) {
        const crack = { "--w": seam.width, "--delay": `${seam.delay}ms`, "--dur": `${Math.round(seam.length / SEAM_CRACK_SPEED)}ms` };
        const gold = { "--w": seam.width, "--delay": `${SEAM_GOLD_LAG + seam.delay}ms`, "--dur": `${Math.round(seam.length / SEAM_GOLD_SPEED)}ms` };
        g.append(
          path("lfd-seam-crack", seam.d, crack),
          path("lfd-seam-glow", seam.d, gold),
          path("lfd-seam-gold", seam.d, gold),
          path("lfd-seam-glint", seam.d, { "--w": seam.width, "--g": `${(s.index * 2.3 + seam.depth * 1.1).toFixed(1)}s` })
        );
      }
      const main = s.seams.find(x => x.depth === 0);
      const chipDelay = main ? SEAM_GOLD_LAG + main.delay + (main.length / SEAM_GOLD_SPEED) * 0.5 : 400;
      for (const chip of s.chips) {
        g.append(svg("polygon", { class: "lfd-seam-chip", points: chip.map(p => p.join(",")).join(" "), style: `--delay:${Math.round(chipDelay)}ms` }));
      }
      this.svg.append(g);
    }
  }

  /** The tink: a glint, a ripple through the lacquer, gold leaf drifting down. */
  #impact(s) {
    if (!s) return;
    const [x, y] = s.impact;
    this.spot(this.fx, "lfd-kin-glint", x, y, {}, 900);
    this.spot(this.fx, "lfd-kin-ripple", x, y, {}, 900);
    for (let i = 0; i < 9; i++) {
      const a = s.inward + rand(-1, 1);
      this.spot(this.fx, "lfd-kin-leaf", x + Math.cos(a) * rand(4, 26), y + Math.sin(a) * rand(4, 20), {
        "--sx": `${rand(6, 16)}px`,
        "--dx": `${Math.cos(a) * rand(6, 24)}px`,
        "--dy": `${rand(60, 140)}px`,
        "--s": `${rand(2.4, 4.6)}px`,
        "--rot": `${rand(-260, 260)}deg`,
        "--d": `${Math.round(rand(60, 520))}ms`,
        "--dur": `${Math.round(rand(1700, 2600))}ms`,
      }, 3400).append(document.createElement("i"));
    }
  }
}

function div(cls) {
  const d = document.createElement("div");
  d.className = cls;
  return d;
}

function path(cls, d, vars) {
  const p = svg("path", { class: cls, d, pathLength: 1 });
  for (const [k, v] of Object.entries(vars)) p.style.setProperty(k, String(v));
  return p;
}

/** A closed, wobbly loop round a rect: the moth's flight. */
function orbit(r, k) {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const rx = r.w * (0.42 + (k % 3) * 0.06) + 8;
  const ry = r.h * (0.42 + ((k + 1) % 3) * 0.07) + 6;
  const n = 9;
  const phase = Math.random() * Math.PI * 2;
  const dir = k % 2 ? -1 : 1;
  const pts = [];
  for (let i = 0; i <= n + 1; i++) {
    const a = phase + dir * (i / n) * Math.PI * 2;
    const j = 0.82 + Math.random() * 0.36;
    pts.push([Math.round((cx + Math.cos(a) * rx * j) * 10) / 10, Math.round((cy + Math.sin(a) * ry * j) * 10) / 10]);
  }
  // Close the loop on itself
  pts[n] = pts[0];
  pts[n + 1] = pts[1];
  return smoothPath(pts) + " Z";
}
