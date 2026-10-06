import { generateCorruption } from "../geometry.js";
import { damageClock as clock } from "../clock.js";
import { DamageStyle, STAGGER_MS, rand } from "./DamageStyle.js";

const FORM_MS = 1400;
const MEND_MS = 900;

/**
 * HORUS: the readout corrupts.
 *
 * - Structure: each point lost is a fault. The plates tear sideways in a datamosh, the open eyes blink,
 *   and a FAULT stamp flashes where it hit; a block of noise prints in against the edge with pixel-sort
 *   smears dragging out of it, an error code and dead pixels around it, flickering now and then. And
 *   the print slips further out of register with every point lost (the green ghost of every edge moves
 *   further off; styles/themes/horus.css). Repairs defragment the blocks away.
 * - Stress: interference. Static over the readout, thicker with each level, a roll bar drifting down
 *   from the second, and at the last point the sigil's eye flickering in the noise. Each hit jams the
 *   feed: the plates stutter down a line at a time, the eyes blink, and hex garbage scrolls up the edge.
 */
export class CorruptionDamage extends DamageStyle {
  static id = "corruption";

  constructor(layer) {
    super(layer);
    this.static = div("lfd-cor-static");
    this.roll = div("lfd-cor-roll");
    this.eye = div("lfd-cor-eye");
    this.blocks = div("lfd-cor-blocks");
    this.fx = div("lfd-cor-fx");
    this.host.append(this.static, this.roll, this.eye, this.blocks, this.fx);
    this.faults = [];
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
    for (let i = from; i < to; i++) this.after(() => this.#impact(this.faults[i]), (i - from) * STAGGER_MS);
  }

  mend(keep, had) {
    clearTimeout(this.mendTimer);
    if (this.reduce) return this.#render(keep);
    for (let i = keep; i < had; i++) {
      this.forming.delete(i);
      for (const node of this.blocks.querySelectorAll(`[data-index="${i}"]`)) node.classList.add("is-mending");
    }
    this.busy = true;
    this.mendTimer = this.after(() => {
      this.busy = false;
      this.#render(this.levels?.fractures ?? keep);
    }, MEND_MS);
  }

  /** The feed jams: the plates stutter down, the eyes blink, garbage scrolls up the edge. */
  stressHit(levels) {
    this.pulse(this.root, "is-jam", 700);
    this.pulse(this.root, "is-blink", 360);
    this.pulse(this.host, "is-burst", 650);
    const lines = [];
    for (let i = 0; i < 16; i++) {
      lines.push(Array.from({ length: 4 }, () => Math.floor(Math.random() * 65536).toString(16).toUpperCase().padStart(4, "0")).join(" "));
    }
    const left = levels.stressLevel % 2 ? 3 : this.W - 3;
    const col = this.spot(this.fx, "lfd-cor-hex", left, this.H, { "--side": levels.stressLevel % 2 ? "0%" : "-100%" }, 1500);
    col.textContent = lines.join("\n");
  }

  destroy() {
    clearTimeout(this.mendTimer);
    super.destroy();
  }

  /* -------------------------------------------- */

  #render(count) {
    const { W, H } = this;
    this.blocks.replaceChildren();
    if (!count || !W || !H || !this.seed) {
      this.faults = [];
      return;
    }
    this.faults = [];
    for (let i = 0; i < count; i++) this.faults.push(generateCorruption(this.seed, i, W, H));
    const now = clock.now();
    for (const f of this.faults) {
      const block = div("lfd-corrupt lfd-dmg-mark");
      block.dataset.index = String(f.index);
      block.dataset.side = f.side;
      Object.assign(block.style, { left: `${f.x}px`, top: `${f.y}px`, width: `${f.w}px`, height: `${f.h}px` });
      block.style.setProperty("--i", String(f.index));
      const startedAt = this.forming.get(f.index);
      if (startedAt !== undefined) {
        const elapsed = now - startedAt;
        if (elapsed < FORM_MS) {
          block.classList.add("is-forming");
          block.style.setProperty("--t0", `${Math.round(-elapsed)}ms`);
          this.after(() => {
            if (this.forming.get(f.index) !== startedAt) return;
            this.forming.delete(f.index);
            this.blocks.querySelector(`.lfd-corrupt[data-index="${f.index}"]`)?.classList.remove("is-forming");
          }, FORM_MS - elapsed);
        } else this.forming.delete(f.index);
      }
      const noise = document.createElement("i");
      noise.className = "lfd-corrupt-noise";
      const code = document.createElement("b");
      code.className = "lfd-corrupt-code";
      code.textContent = `ERR 0x${f.code}`;
      block.append(noise, code);
      for (const s of f.smears) {
        const smear = document.createElement("i");
        smear.className = "lfd-corrupt-smear";
        smear.style.setProperty("--at", `${s.at}px`);
        smear.style.setProperty("--len", `${s.len}px`);
        smear.style.setProperty("--thick", `${s.thick}px`);
        block.append(smear);
      }
      this.blocks.append(block);
      for (const [px, py] of f.dead) {
        const dead = div("lfd-corrupt-dead");
        dead.dataset.index = String(f.index);
        dead.style.left = `${px}px`;
        dead.style.top = `${py}px`;
        this.blocks.append(dead);
      }
    }
  }

  /** The fault: the plates tear, the eyes blink, and the stamp flashes where it hit. */
  #impact(f) {
    if (!f) return;
    this.pulse(this.root, "is-tear", 460);
    this.pulse(this.root, "is-blink", 360);
    const x = Math.max(40, Math.min(this.W - 40, f.x + f.w / 2));
    const y = Math.max(12, Math.min(this.H - 12, f.y + f.h / 2));
    const stamp = this.spot(this.fx, "lfd-cor-fault", x, y, {}, 900);
    stamp.textContent = `∴ FAULT 0x${f.code}`;
    for (let i = 0; i < 10; i++) {
      this.spot(this.fx, "lfd-cor-bit", f.x + rand(0, f.w), f.y + rand(0, f.h), {
        "--dx": `${Math.cos(f.inward) * rand(10, 60)}px`,
        "--dy": `${rand(-8, 8)}px`,
        "--d": `${Math.round(rand(0, 200))}ms`,
      }, 900);
    }
  }
}

function div(cls) {
  const d = document.createElement("div");
  d.className = cls;
  return d;
}
