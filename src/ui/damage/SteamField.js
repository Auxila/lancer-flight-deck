import { damageClock as clock } from "./clock.js";

/**
 * Steam venting through the panel's cracks: a small canvas particle system.
 *
 * Particles leave from vent points along the crack lines, so the steam visibly comes out of
 * the fractures, then rise, swell, drift and thin out. It vents in short hissing bursts with
 * quiet wisps in between; how often depends on the level (1-3). Puffs are a cached radial
 * sprite drawn at low alpha, so it stays cheap and never hides the readouts.
 *
 * The loop only runs while there's steam to draw, and stops while the panel is hidden.
 */

/** Per level: seconds between bursts, puffs per burst, ms between wisps (0 = none). */
const LEVELS = {
  1: { burst: [5, 9], count: [5, 8], wisp: 0 },
  2: { burst: [2.6, 5], count: [6, 10], wisp: 520 },
  3: { burst: [1.4, 3], count: [8, 12], wisp: 280 },
};
const MAX_PARTICLES = 180;
const TINT = "226, 234, 242";

const rand = (a, b) => a + Math.random() * (b - a);

export class SteamField {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.particles = [];
    this.vents = [];
    this.level = 0;
    this.W = 0;
    this.H = 0;
    this.running = false;
    this.nextBurst = 0;
    this.nextWisp = 0;
    this.sprite = SteamField.#makeSprite();
    this.tick = this.tick.bind(this);
  }

  static #makeSprite() {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, `rgba(${TINT}, 1)`);
    grad.addColorStop(0.35, `rgba(${TINT}, 0.72)`);
    grad.addColorStop(0.7, `rgba(${TINT}, 0.22)`);
    grad.addColorStop(1, `rgba(${TINT}, 0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return c;
  }

  resize(W, H) {
    if (Math.abs(W - this.W) < 1 && Math.abs(H - this.H) < 1) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = W;
    this.H = H;
    this.canvas.width = Math.max(1, Math.round(W * dpr));
    this.canvas.height = Math.max(1, Math.round(H * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** @param {Array<[number, number]>} points  where steam may escape (on the cracks) */
  setVents(points) {
    this.vents = points ?? [];
  }

  setLevel(level) {
    const was = this.level;
    this.level = this.vents.length ? level : 0;
    if (this.level && !was) {
      const now = clock.now();
      this.nextBurst = now + rand(300, 1200);
      this.nextWisp = now;
    }
    if (this.level) this.start();
  }

  /** A hard vent: several cracks blow at once (taking stress while cracked). */
  burst(strength = 1) {
    if (!this.vents.length) return;
    const n = Math.min(4, this.vents.length);
    for (let i = 0; i < n; i++) this.#emit(this.#vent(), Math.round(rand(7, 11) * strength), true);
    this.start();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = clock.now();
    requestAnimationFrame(this.tick);
  }

  stop() {
    this.running = false;
    this.particles.length = 0;
    this.ctx.clearRect(0, 0, this.W, this.H);
  }

  #vent() {
    return this.vents[Math.floor(Math.random() * this.vents.length)];
  }

  /**
   * A burst starts as a jet: fast, narrow puffs shoot out of the crack in one direction,
   * brake hard, then billow and rise. Wisps just seep up.
   */
  #emit([x, y], count, burst) {
    const jet = rand(-Math.PI, 0); // mostly sideways-to-upward
    for (let i = 0; i < count && this.particles.length < MAX_PARTICLES; i++) {
      const lead = burst && i < count * 0.6;
      const angle = lead ? jet + rand(-0.28, 0.28) : -Math.PI / 2 + rand(-0.9, 0.9);
      const speed = lead ? rand(0.09, 0.17) : burst ? rand(0.02, 0.05) : rand(0.008, 0.02);
      this.particles.push({
        x: x + rand(-1.5, 1.5),
        y: y + rand(-1.5, 1.5),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: lead ? rand(2, 3.5) : rand(3.5, 6.5),
        grow: lead ? rand(0.016, 0.028) : rand(0.01, 0.02),
        life: burst ? rand(1500, 2800) : rand(2200, 3400),
        drag: lead ? 260 : 1400,
        age: -(lead ? i * 12 : rand(0, 160)), // jets stream out over a few frames
        alpha: burst ? rand(0.2, 0.32) : rand(0.1, 0.16),
        phase: rand(0, Math.PI * 2),
      });
    }
  }

  tick() {
    if (!this.running) return;
    const now = clock.now();
    // Hidden or detached: stop; the damage layer restarts it on the next update
    if (!this.canvas.isConnected || !this.canvas.offsetParent) return this.stop();
    const dt = Math.min(50, now - this.last);
    this.last = now;

    const cfg = LEVELS[this.level];
    if (cfg) {
      if (now >= this.nextBurst) {
        this.#emit(this.#vent(), Math.round(rand(...cfg.count)), true);
        this.nextBurst = now + rand(...cfg.burst) * 1000;
      }
      if (cfg.wisp && now >= this.nextWisp) {
        this.#emit(this.#vent(), 1, false);
        if (this.level >= 3) this.#emit(this.#vent(), 1, false);
        this.nextWisp = now + cfg.wisp * rand(0.7, 1.3);
      }
    }

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);
    const alive = [];
    for (const p of this.particles) {
      p.age += dt;
      if (p.age < 0) {
        alive.push(p); // still queued in its jet
        continue;
      }
      if (p.age >= p.life) continue;
      // Time-based drag (frame-rate independent), buoyancy, and a little turbulence
      const k = Math.exp(-dt / p.drag);
      p.vx *= k;
      p.vy = p.vy * k - 0.000022 * dt;
      p.x += p.vx * dt + Math.sin(p.age * 0.0032 + p.phase) * 0.012 * dt;
      p.y += p.vy * dt;
      p.r += p.grow * dt;
      const t = p.age / p.life;
      // Quick in, long smooth tail
      const fade = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9;
      ctx.globalAlpha = p.alpha * fade * (0.6 + 0.4 * fade);
      const size = p.r * 2;
      ctx.drawImage(this.sprite, p.x - p.r, p.y - p.r, size, size);
      alive.push(p);
    }
    ctx.globalAlpha = 1;
    this.particles = alive;

    if (!this.level && !alive.length) {
      this.running = false;
      ctx.clearRect(0, 0, this.W, this.H);
      return;
    }
    requestAnimationFrame(this.tick);
  }
}
