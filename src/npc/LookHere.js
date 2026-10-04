/**
 * "Look here": a big, animated red marker over a token on the battle map, while the GM hovers
 * that combatant in the NPC Deck's initiative strip.
 *
 * Drawn on this client only (a PIXI overlay in the canvas controls layer; nothing is saved
 * or broadcast): a solid ring with a soft glow, a dashed ring turning against it, four
 * chevrons bobbing in toward the token, and sonar rings rippling out. Line weights are
 * divided by the canvas zoom so it reads the same zoomed in or out. If the token is off
 * screen, a red arrow on the screen edge points to it instead.
 */
import { damageClock as clock } from "../ui/damage/clock.js";

const COLOR = 0xff2a2a;
const PERIOD = 1300; // ms per sonar ripple
const RIPPLES = 3;

export class LookHere {
  static #mark = null;

  /** Mark this token (a Token placeable). Replaces any mark already up. */
  static show(token) {
    LookHere.hide();
    if (!token || !canvas?.ready || token.scene !== canvas.scene) return;
    const container = new PIXI.Container();
    container.eventMode = "none";
    const glow = new PIXI.Graphics();
    glow.blendMode = PIXI.BLEND_MODES.ADD;
    const lines = new PIXI.Graphics();
    container.addChild(glow, lines);
    (canvas.controls ?? canvas.interface ?? canvas.stage).addChild(container);
    const arrow = LookHere.#arrowElement(token);
    // The effects clock (normally real time) lets the marker be slowed down for inspection
    const started = clock.now();
    const tick = () => LookHere.#draw({ token, container, glow, lines, arrow, t: clock.now() - started });
    canvas.app.ticker.add(tick);
    LookHere.#mark = { token, container, tick, arrow };
    tick();
  }

  static hide() {
    const mark = LookHere.#mark;
    if (!mark) return;
    LookHere.#mark = null;
    canvas?.app?.ticker?.remove(mark.tick);
    mark.container.destroy({ children: true });
    mark.arrow?.remove();
  }

  /** Is this token the one marked? */
  static isOn(token) {
    return LookHere.#mark?.token === token;
  }

  static #draw({ token, container, glow, lines, arrow, t }) {
    if (token.destroyed || !token.scene) return LookHere.hide();
    const { x, y } = token.center;
    container.position.set(x, y);
    const zoom = canvas.stage.scale.x || 1;
    const px = n => n / zoom; // screen pixels -> canvas units
    const R = Math.max(token.w, token.h) * 0.62 + px(10);
    const phase = (t % PERIOD) / PERIOD;
    const breathe = 0.5 + 0.5 * Math.sin((t / PERIOD) * Math.PI * 2);

    glow.clear();
    lines.clear();

    // Sonar ripples rolling outward
    for (let i = 0; i < RIPPLES; i++) {
      const p = (phase + i / RIPPLES) % 1;
      const r = R * (1 + p * 0.9);
      const alpha = (1 - p) * 0.55;
      lines.lineStyle({ width: px(2.5 * (1 - p) + 0.5), color: COLOR, alpha });
      lines.drawCircle(0, 0, r);
    }

    // Glow under the main ring
    glow.lineStyle({ width: px(14), color: COLOR, alpha: 0.18 + 0.12 * breathe });
    glow.drawCircle(0, 0, R);
    glow.lineStyle({ width: px(6), color: COLOR, alpha: 0.25 + 0.15 * breathe });
    glow.drawCircle(0, 0, R);

    // The ring itself
    lines.lineStyle({ width: px(4), color: COLOR, alpha: 0.95 });
    lines.drawCircle(0, 0, R);

    // A dashed ring turning the other way
    const dashes = 16;
    const spin = -(t / 2600) * Math.PI * 2;
    const rd = R + px(9);
    lines.lineStyle({ width: px(2.5), color: COLOR, alpha: 0.85 });
    for (let i = 0; i < dashes; i++) {
      const a0 = spin + (i / dashes) * Math.PI * 2;
      const a1 = a0 + (Math.PI * 2) / dashes / 2;
      lines.moveTo(Math.cos(a0) * rd, Math.sin(a0) * rd);
      lines.arc(0, 0, rd, a0, a1);
    }

    // Four chevrons bobbing in toward the token
    const bob = px(6) * breathe;
    const size = px(11);
    lines.lineStyle({ width: px(3.5), color: COLOR, alpha: 1, join: "round", cap: "round" });
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2 - Math.PI / 4;
      const dist = R + px(26) + bob;
      const cx = Math.cos(a) * dist;
      const cy = Math.sin(a) * dist;
      // The chevron points at the token
      const ix = -Math.cos(a);
      const iy = -Math.sin(a);
      const nx = -iy;
      const ny = ix;
      lines.moveTo(cx - ix * size + nx * size, cy - iy * size + ny * size);
      lines.lineTo(cx, cy);
      lines.lineTo(cx - ix * size - nx * size, cy - iy * size - ny * size);
    }

    LookHere.#placeArrow(arrow, token);
  }

  /** A DOM arrow on the screen edge, shown only while the token is off screen. */
  static #arrowElement(token) {
    const el = document.createElement("div");
    el.className = "lfd-look-arrow";
    el.innerHTML = `<i class="fa-solid fa-location-arrow" aria-hidden="true"></i><span></span>`;
    el.querySelector("span").textContent = token.name ?? "";
    el.hidden = true;
    document.body.append(el);
    return el;
  }

  static #placeArrow(arrow, token) {
    if (!arrow) return;
    const canvasBox = document.getElementById("board")?.getBoundingClientRect() ?? { left: 0, top: 0 };
    // The open part of the map, between Foundry's UI columns (falls back to the whole window)
    const middle = document.getElementById("ui-middle")?.getBoundingClientRect();
    const board = middle?.width > 100 && middle.height > 100 ? middle : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    const p = canvas.stage.worldTransform.apply({ x: token.center.x, y: token.center.y });
    const sx = canvasBox.left + p.x;
    const sy = canvasBox.top + p.y;
    const margin = 46;
    const inside = sx > board.left + margin && sx < board.left + board.width - margin && sy > board.top + margin && sy < board.top + board.height - margin;
    arrow.hidden = inside;
    if (inside) return;
    const cx = board.left + board.width / 2;
    const cy = board.top + board.height / 2;
    const angle = Math.atan2(sy - cy, sx - cx);
    // Where the ray from the centre leaves the screen (inset by the margin)
    const hw = board.width / 2 - margin;
    const hh = board.height / 2 - margin;
    const k = Math.min(hw / Math.abs(Math.cos(angle) || 1e-6), hh / Math.abs(Math.sin(angle) || 1e-6));
    arrow.style.left = `${cx + Math.cos(angle) * k}px`;
    arrow.style.top = `${cy + Math.sin(angle) * k}px`;
    // fa-location-arrow points up-right (-45deg)
    arrow.style.setProperty("--rot", `${angle + Math.PI / 4}rad`);
  }
}
