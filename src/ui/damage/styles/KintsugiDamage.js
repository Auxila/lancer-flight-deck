import { SEAM_CRACK_SPEED, SEAM_GOLD_LAG, SEAM_GOLD_SPEED, generateSeam } from "../geometry.js";
import { damageClock as clock } from "../clock.js";
import { DamageStyle, STAGGER_MS, rand, svg } from "./DamageStyle.js";

const MEND_MS = 1300;
/** Ferrules (the gold couplings) down each coolant channel, as a fraction of its height. */
const FERRULES = [0.12, 0.38, 0.64, 0.88];

/**
 * SSC: kintsugi. A Smith-Shimano frame isn't scarred, it's mended in gold.
 *
 * - Structure: each point lost breaks the lacquer. A crystalline tink and a glint at the edge, a ripple
 *   through the lacquer, a white hairline racing inward; then molten gold flows in behind it and sets,
 *   filling the chips along the way, while flakes of gold leaf drift down. The movement stutters like a
 *   watch skipping a beat. The gold seams stay, a glint travelling along them now and then. Repairs
 *   polish them away.
 * - Stress: the liquid cooling. Two gold-ringed glass channels run down the bezel, full of sapphire
 *   coolant, and they drain as stress mounts: three quarters, then half, then a few last fingers boiling
 *   hard. Condensation beads on the glass from the second level, and at the last point the near-dry
 *   channels vent cold vapour. Each hit purges the loop: a bright surge races up the coolant, it
 *   sloshes, vapour bursts from the couplings and droplets spray.
 */
export class KintsugiDamage extends DamageStyle {
  static id = "kintsugi";

  constructor(layer) {
    super(layer);
    this.svg = svg("svg", { class: "lfd-kin-svg" });
    this.coolant = div("lfd-kin-coolant");
    for (const side of ["is-left", "is-right"]) {
      const tube = div(`lfd-kin-tube ${side}`);
      const fluid = document.createElement("b");
      fluid.className = "lfd-kin-fluid";
      fluid.innerHTML = Array.from({ length: 9 }, (_, k) => `<s style="--k:${k};--x:${(18 + ((k * 37) % 64)).toFixed(0)}%"></s>`).join("");
      tube.append(fluid);
      for (const at of FERRULES) {
        const ferrule = document.createElement("em");
        ferrule.style.top = `${at * 100}%`;
        tube.append(ferrule);
      }
      this.coolant.append(tube);
    }
    this.beads = div("lfd-kin-beads");
    this.fx = div("lfd-kin-fx");
    this.host.append(this.svg, this.coolant, this.beads, this.fx);
    this.beadKey = "";
    this.seams = [];
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

  /** The loop purges: a surge races up the coolant, it sloshes, vapour bursts from the couplings. */
  stressHit() {
    this.pulse(this.coolant, "is-purge", 1300);
    const { W, H } = this;
    for (const x of [4, W - 4]) {
      const inward = x < W / 2 ? 1 : -1;
      for (const at of FERRULES) {
        this.spot(this.fx, "lfd-kin-vapour", x, H * (0.05 + at * 0.88), {
          "--dx": `${inward * rand(10, 26)}px`,
          "--dy": `${-rand(10, 30)}px`,
          "--s": `${rand(16, 30)}px`,
          "--d": `${Math.round(rand(0, 260))}ms`,
        }, 1800);
      }
      for (let i = 0; i < 8; i++) {
        this.spot(this.fx, "lfd-kin-spray", x, H * (0.05 + FERRULES[i % FERRULES.length] * 0.88), {
          "--dx": `${inward * rand(8, 38)}px`,
          "--dy": `${rand(-14, 26)}px`,
          "--s": `${rand(1.5, 3)}px`,
          "--d": `${Math.round(rand(40, 360))}ms`,
        }, 1400);
      }
    }
  }

  /** Condensation beads on the glass near the channels (placed once per size, the same each time). */
  sync() {
    const { W, H } = this;
    const key = `${Math.round(W)}x${Math.round(H)}`;
    if (!W || !H || key === this.beadKey) return;
    this.beadKey = key;
    this.beads.replaceChildren();
    let seed = 7;
    const next = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 16; k++) {
      const left = k % 2 === 0;
      const bead = document.createElement("i");
      bead.style.left = `${left ? 7 + next() * 10 : W - 9 - next() * 10}px`;
      bead.style.top = `${H * (0.08 + next() * 0.86)}px`;
      bead.style.setProperty("--s", `${(1.6 + next() * 2.2).toFixed(1)}px`);
      bead.style.setProperty("--k", String(k));
      if (k % 5 === 0) bead.classList.add("is-runner");
      this.beads.append(bead);
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
