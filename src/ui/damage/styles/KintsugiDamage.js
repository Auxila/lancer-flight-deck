import { SEAM_CRACK_SPEED, SEAM_GOLD_LAG, SEAM_GOLD_SPEED, VENEER_CELL, generateDropouts, generateSeam } from "../geometry.js";
import { damageClock as clock } from "../clock.js";
import { DamageStyle, STAGGER_MS, rand, svg } from "./DamageStyle.js";

const MEND_MS = 1300;

/**
 * SSC: kintsugi. A Smith-Shimano frame isn't scarred, it's mended in gold.
 *
 * - Structure: each point lost breaks the lacquer. A crystalline tink and a glint at the edge, a ripple
 *   through the lacquer, a white hairline racing inward; then molten gold flows in behind it and sets,
 *   filling the chips along the way, while flakes of gold leaf drift down. The movement stutters like a
 *   watch skipping a beat. The gold seams stay, a glint travelling along them now and then. Repairs
 *   polish them away.
 * - Stress: the glamour fails. The luxury finish is SSC's Visual Development projecting onto a bare
 *   chassis, and the pilot sees it through the nerveweave (Full Subjectivity Sync). Stress breaks the
 *   sync, so the projection loses its lock in two ways at once:
 *   - the veneer drops out in tiles: patches of the cockpit go to bare grey metal (primer, fasteners, a
 *     gold projection fringe round each hole), flickering at first, then staying out; at the last point
 *     the whole finish strobes off now and then;
 *   - the pilot sees double: a ghost of the whole cockpit, a moment behind (a frozen copy of the parts),
 *     drifts off-register, further with each level, and swims; a heartbeat pulses at the edges, faster
 *     as it goes.
 *   Each hit snaps the sync: the ghost jerks wide and springs back, a wave of dropout sweeps across the
 *   cockpit, and the heartbeat spikes. Every readout stays legible: a dropout only takes the gold out of
 *   what's under it, and the ghost only brightens.
 */
export class KintsugiDamage extends DamageStyle {
  static id = "kintsugi";

  constructor(layer) {
    super(layer);
    this.svg = svg("svg", { class: "lfd-kin-svg" });
    // Stress: the veneer's dropout tiles and the last-point strobe sit under the gold seams (the kintsugi
    // is real gold, not projection); the hit's sweep, the ghost and the heartbeat sit over them
    this.veneer = div("lfd-glam-veneer");
    this.strobe = div("lfd-glam-strobe");
    this.sweep = div("lfd-glam-sweep");
    this.ghost = div("lfd-glam-ghost");
    this.ghost.inert = true;
    this.heart = div("lfd-glam-heart");
    this.fx = div("lfd-kin-fx");
    this.host.append(this.veneer, this.strobe, this.svg, this.sweep, this.ghost, this.heart, this.fx);
    this.veneerKey = "";
    /** @type {Array<{src: HTMLElement, copy: HTMLElement}>} */
    this.copies = [];
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

  /** The sync snaps: the ghost jerks wide and springs back, a dropout wave sweeps across, the heart spikes. */
  stressHit() {
    this.pulse(this.ghost, "is-snap", 950);
    this.pulse(this.sweep, "is-sweeping", 800);
    this.pulse(this.heart, "is-spike", 900);
  }

  sync(levels) {
    const level = levels?.stressLevel ?? 0;
    this.#syncVeneer(level);
    this.#syncGhost(level);
  }

  /** The dropout tiles for this level (rebuilt when the level, the mech or the size changes). */
  #syncVeneer(level) {
    const { W, H } = this;
    const key = `${this.seed}|${level}|${Math.round(W / VENEER_CELL)}x${Math.round(H / VENEER_CELL)}`;
    if (key === this.veneerKey) return;
    this.veneerKey = key;
    this.veneer.replaceChildren();
    if (!level || !this.seed || !W || !H) return;
    for (const cluster of generateDropouts(this.seed, level, W, H)) {
      for (const cell of cluster.cells) {
        const tile = document.createElement("i");
        tile.className = `lfd-glam-tile is-${cluster.mode}${cell.bolt ? " has-bolt" : ""}`;
        for (const edge of cell.edges) tile.classList.add(`e-${edge}`);
        tile.style.left = `${cell.x}px`;
        tile.style.top = `${cell.y}px`;
        tile.style.setProperty("--dur", `${cluster.dur}ms`);
        tile.style.setProperty("--delay", `${cluster.delay}ms`);
        this.veneer.append(tile);
      }
    }
  }

  /**
   * The double image: a copy of each panel part, laid over its original (the copies are inert, frozen and
   * screen-blended, so they only ever brighten). Re-copied when a part re-renders, re-placed on scroll.
   */
  #syncGhost(level) {
    const root = this.root;
    if (!level || !root) {
      if (this.copies.length) this.ghost.replaceChildren();
      this.copies = [];
      return;
    }
    const parts = [...root.querySelectorAll(":scope > [data-application-part]")];
    const fresh = parts.length !== this.copies.length || parts.some((p, i) => p !== this.copies[i].src);
    if (fresh) {
      this.ghost.replaceChildren();
      this.copies = parts.map(src => {
        const copy = src.cloneNode(true);
        copy.removeAttribute("data-application-part");
        for (const node of copy.querySelectorAll("[id]")) node.removeAttribute("id");
        copy.classList.add("lfd-glam-copy");
        this.ghost.append(copy);
        return { src, copy };
      });
    }
    const base = this.layer.element.getBoundingClientRect();
    const z = base.width / (this.layer.element.offsetWidth || base.width) || 1;
    for (const { src, copy } of this.copies) {
      const r = src.getBoundingClientRect();
      copy.style.left = `${(r.left - base.left) / z}px`;
      copy.style.top = `${(r.top - base.top) / z}px`;
      copy.style.width = `${r.width / z}px`;
      copy.style.height = `${r.height / z}px`;
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
