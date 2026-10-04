/**
 * Vector overlays for conditions that read best as marks around the token: a web under its
 * base, chains to the ground, a targeting reticle, orbiting sparks...
 *
 * Each overlay is drawn once per token size and only its transforms change per frame, so a
 * scene full of conditions stays cheap. Everything is drawn in code: no image assets.
 *
 * build(geo, actor) returns { root, animate(t) } where t is seconds since the effect began.
 * geo: { w, h, cx, cy, rx, ry, r, u } in token-local pixels (u = one line unit for this grid).
 */

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

const COLORS = {
  lock: 0xff3b3b,
  stun: 0xffe14d,
  web: 0xe6dcff,
  chain: 0xc9d3dd,
  chainDark: 0x3a4048,
  engaged: 0xffb347,
  hidden: 0xcfd8e3,
  power: 0xff4545,
  meltdown: 0xff3b30,
};

/* -------------------------------------------- */
/*  Drawing helpers                             */
/* -------------------------------------------- */

function stroke(g, width, color, alpha = 1) {
  g.lineStyle({ width, color, alpha, cap: PIXI.LINE_CAP.ROUND, join: PIXI.LINE_JOIN.ROUND, alignment: 0.5 });
}

/** A path drawn as a soft additive halo plus a crisp core line. */
function glowPath(path, { width, color, alpha = 1, halo = 1 }) {
  const container = new PIXI.Container();
  if (halo > 0) {
    const h = new PIXI.Graphics();
    h.blendMode = PIXI.BLEND_MODES.ADD;
    stroke(h, width * 4.2, color, 0.1 * alpha * halo);
    path(h);
    stroke(h, width * 2.2, color, 0.2 * alpha * halo);
    path(h);
    container.addChild(h);
  }
  const core = new PIXI.Graphics();
  stroke(core, width, color, alpha);
  path(core);
  container.addChild(core);
  return container;
}

function starPoints(size, inner = 0.32) {
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const a = i * 45 * DEG - Math.PI / 2;
    const rad = i % 2 ? size * inner : size;
    pts.push(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  return pts;
}

/* -------------------------------------------- */
/*  Overlays                                    */
/* -------------------------------------------- */

/** Lock On: red targeting brackets that tighten when the lock is acquired, then breathe. */
function lockOn(geo) {
  const root = new PIXI.Container();
  root.position.set(geo.cx, geo.cy);
  const X = geo.rx * 1.14 + geo.u * 2;
  const Y = geo.ry * 1.14 + geo.u * 2;
  const L = Math.min(geo.rx, geo.ry) * 0.36;
  const brackets = glowPath(
    g => {
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        g.moveTo(sx * X, sy * Y - sy * L);
        g.lineTo(sx * X, sy * Y);
        g.lineTo(sx * X - sx * L, sy * Y);
      }
    },
    { width: geo.u * 1.7, color: COLORS.lock }
  );
  const tick = Math.min(geo.rx, geo.ry) * 0.13;
  const ticks = glowPath(
    g => {
      g.moveTo(0, -Y); g.lineTo(0, -Y + tick);
      g.moveTo(X, 0); g.lineTo(X - tick, 0);
      g.moveTo(0, Y); g.lineTo(0, Y - tick);
      g.moveTo(-X, 0); g.lineTo(-X + tick, 0);
    },
    { width: geo.u, color: COLORS.lock, alpha: 0.8, halo: 0.6 }
  );
  root.addChild(ticks, brackets);
  return {
    root,
    animate(t) {
      // Acquisition: brackets slam in from wide over 0.35 s, then a slow breathing pulse
      const acquire = Math.min(1, t / 0.35);
      const intro = 1 + (1 - easeOut(acquire)) * 0.45;
      brackets.scale.set(intro * (1 + 0.03 * Math.sin(t * 4)));
      root.alpha = 0.85 + 0.15 * Math.sin(t * 4);
    },
  };
}

/** Stunned: three sparks orbiting the crown of the frame, the near ones bright, the far ones dim. */
function stunned(geo) {
  const root = new PIXI.Container();
  root.position.set(geo.cx, geo.cy - geo.ry * 0.88);
  const ax = geo.rx * 0.62;
  const ay = geo.ry * 0.18;
  const size = Math.min(geo.rx, geo.ry) * 0.16;
  const sparks = [0, 1, 2, 3].map(() => {
    const spark = new PIXI.Container();
    const halo = new PIXI.Graphics();
    halo.blendMode = PIXI.BLEND_MODES.ADD;
    halo.beginFill(COLORS.stun, 0.3).drawCircle(0, 0, size * 1.7).endFill();
    const star = new PIXI.Graphics();
    stroke(star, Math.max(1, geo.u * 0.5), 0x5a4a00, 0.8);
    star.beginFill(COLORS.stun, 1).drawPolygon(starPoints(size)).endFill();
    spark.addChild(halo, star);
    root.addChild(spark);
    return spark;
  });
  return {
    root,
    animate(t) {
      sparks.forEach((spark, i) => {
        const a = t * 2.4 + (i * TAU) / sparks.length;
        const depth = (Math.sin(a) + 1) / 2; // 1 = in front
        spark.position.set(Math.cos(a) * ax, Math.sin(a) * ay);
        const twinkle = 0.85 + 0.15 * Math.sin(t * 9 + i * 2);
        spark.scale.set((0.7 + 0.4 * depth) * twinkle);
        spark.alpha = 0.45 + 0.55 * depth;
        spark.rotation = t * 1.5 + i;
      });
    },
  };
}

/**
 * Slowed: a web spun on the ground under the token's base, with two strands wrapping its
 * lower body that tighten and slacken.
 */
function slowed(geo) {
  const root = new PIXI.Container();
  const baseY = geo.cy + geo.ry * 0.82;
  const W = geo.rx * 0.95;
  const H = geo.ry * 0.36; // the ground plane is foreshortened
  const spokes = 12;
  const rings = [0.32, 0.6, 0.86, 1];

  const web = glowPath(
    g => {
      const point = (k, rad) => {
        const a = (k / spokes) * TAU;
        // Slight irregularity, like real silk
        const wob = 1 + 0.06 * Math.sin(k * 2.7 + rad * 5);
        return [geo.cx + Math.cos(a) * W * rad * wob, baseY + Math.sin(a) * H * rad * wob];
      };
      for (let k = 0; k < spokes; k++) {
        const [x, y] = point(k, 1);
        g.moveTo(geo.cx, baseY);
        g.lineTo(x, y);
      }
      for (const rad of rings) {
        for (let k = 0; k <= spokes; k++) {
          const [x, y] = point(k % spokes, rad);
          if (k === 0) g.moveTo(x, y);
          else {
            // Sagging thread between spokes
            const [px, py] = point((k - 1) % spokes, rad);
            const mx = (px + x) / 2 + (geo.cx - (px + x) / 2) * 0.08;
            const my = (py + y) / 2 + (baseY - (py + y) / 2) * 0.08;
            g.quadraticCurveTo(mx, my, x, y);
          }
        }
      }
    },
    { width: Math.max(1, geo.u * 0.7), color: COLORS.web, alpha: 0.75, halo: 0.5 }
  );

  const strands = new PIXI.Container();
  const strandY = [geo.cy + geo.ry * 0.38, geo.cy + geo.ry * 0.6];
  for (const y of strandY) {
    strands.addChild(
      glowPath(
        g => {
          g.moveTo(geo.cx - geo.rx * 0.78, y - geo.ry * 0.05);
          g.bezierCurveTo(geo.cx - geo.rx * 0.3, y + geo.ry * 0.14, geo.cx + geo.rx * 0.3, y - geo.ry * 0.12, geo.cx + geo.rx * 0.78, y + geo.ry * 0.05);
        },
        { width: Math.max(1, geo.u * 0.9), color: COLORS.web, alpha: 0.65, halo: 0.6 }
      )
    );
  }
  strands.pivot.set(geo.cx, geo.cy + geo.ry * 0.5);
  strands.position.set(geo.cx, geo.cy + geo.ry * 0.5);
  root.addChild(web, strands);
  return {
    root,
    animate(t) {
      const squeeze = (Math.sin(t * 1.6) + 1) / 2; // constriction
      strands.scale.set(1 - 0.06 * squeeze, 1);
      web.alpha = 0.8 + 0.2 * squeeze;
    },
  };
}

/**
 * Immobilized: chains from shackles clamped on the frame's flanks to stakes driven into the
 * ground. Each chain hangs in a sag that sways; every few seconds it yanks taut (reeling a
 * link toward the stake), rattles, then swings back with a damped bounce. The yank kicks dust
 * off the stake, sparks the shackle, and sends a glint down the links.
 *
 * All motion is an analytic function of time (no per-frame state), so it can't drift and
 * costs one Bezier sample pass per chain per frame.
 */
function immobilized(geo) {
  const root = new PIXI.Container();
  const linkLen = Math.max(7, geo.u * 6);
  const linkW = linkLen * 0.58;
  const spacing = linkLen * 0.82;
  const thick = Math.max(1.3, geo.u * 0.95);
  const PERIOD = 3.4;
  const sides = [
    { sx: -1, phase: 0 },
    { sx: 1, phase: PERIOD / 2 }, // the two chains yank alternately
  ];

  const makeLink = flat => {
    const link = new PIXI.Graphics();
    // Drawn light so `tint` can shade it (a moving glint, strain darkening)
    stroke(link, thick + 1.6, 0x2a2e34, 0.95);
    if (flat) link.drawRoundedRect(-linkLen / 2, -thick * 0.6, linkLen, thick * 1.2, thick * 0.6);
    else link.drawRoundedRect(-linkLen / 2, -linkW / 2, linkLen, linkW, linkW / 2);
    stroke(link, thick, 0xe9eef3, 1);
    if (flat) link.moveTo(-linkLen / 2 + thick, 0).lineTo(linkLen / 2 - thick, 0);
    else link.drawRoundedRect(-linkLen / 2, -linkW / 2, linkLen, linkW, linkW / 2);
    return link;
  };

  const chains = sides.map(({ sx, phase }) => {
    const from = [geo.cx + sx * geo.rx * 0.6, geo.cy + geo.ry * 0.02];
    const to = [geo.cx + sx * geo.rx * 1.32, geo.cy + geo.ry * 1.1];
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const count = Math.ceil((length * 1.15) / spacing) + 1;

    const container = new PIXI.Container();

    // Dust puff at the stake (drawn first, under everything)
    const dust = new PIXI.Graphics();
    dust.beginFill(0xcfc6b8, 0.5).drawEllipse(0, 0, linkLen * 1.6, linkLen * 0.55).endFill();
    dust.position.set(to[0], to[1] + linkLen * 0.4);
    container.addChild(dust);

    const links = [];
    for (let i = 0; i < count; i++) {
      const link = makeLink(i % 2 === 1);
      container.addChild(link);
      links.push(link);
    }

    // Stake: a steel spike with a ring the chain runs through
    const stake = new PIXI.Container();
    const spike = new PIXI.Graphics();
    const s = linkW * 0.75;
    stroke(spike, Math.max(1, geo.u * 0.6), 0x2a2e34, 1);
    spike.beginFill(0xb9c3cd, 1).drawPolygon([-s, -s * 0.2, s, -s * 0.2, s * 0.25, s * 1.6, -s * 0.25, s * 1.6]).endFill();
    stroke(spike, thick, 0xe9eef3, 1);
    spike.drawCircle(0, -s * 0.55, s * 0.45);
    stake.addChild(spike);
    stake.position.set(to[0], to[1]);
    container.addChild(stake);

    // Shackle clamped on the frame, with a bolt
    const shackle = new PIXI.Graphics();
    const r = linkW * 0.75;
    stroke(shackle, thick + 1.6, 0x2a2e34, 1);
    shackle.drawCircle(0, 0, r);
    stroke(shackle, thick * 1.3, 0xc9d3dd, 1);
    shackle.drawCircle(0, 0, r);
    shackle.beginFill(0x2a2e34, 1).drawCircle(0, -r, thick * 1.1).endFill();
    shackle.position.set(from[0], from[1]);
    container.addChild(shackle);

    // Spark at the shackle when the chain snaps taut
    const spark = new PIXI.Graphics();
    spark.blendMode = PIXI.BLEND_MODES.ADD;
    spark.beginFill(0xffd27a, 0.9).drawPolygon(starPoints(linkLen * 0.9, 0.22)).endFill();
    spark.beginFill(0xffffff, 0.9).drawCircle(0, 0, linkLen * 0.18).endFill();
    spark.position.set(from[0], from[1]);
    container.addChild(spark);

    root.addChild(container);
    return { sx, phase, from, to, links, dust, stake, spark, shackle };
  });

  // Quadratic Bezier helpers
  const bez = (p0, c, p1, t) => {
    const u = 1 - t;
    return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]];
  };
  const SAMPLES = 24;

  return {
    root,
    animate(t) {
      for (const c of chains) {
        const cycle = Math.floor((t + c.phase) / PERIOD);
        const tau = (t + c.phase) % PERIOD; // seconds since this chain's last yank

        // Sag: snaps taut at the yank, then swings back past rest and settles (damped spring)
        const rest = 0.2;
        const taut = 0.02;
        const sway = 0.025 * Math.sin(t * 1.15 + c.sx);
        const sag = rest + (taut - rest) * Math.exp(-3.2 * tau) * Math.cos(6.5 * tau) + sway;

        const dx = c.to[0] - c.from[0];
        const dy = c.to[1] - c.from[1];
        const len = Math.hypot(dx, dy);
        // Sag pulls the midpoint down and slightly outward, like a hanging chain
        const ctrl = [c.from[0] + dx / 2 + c.sx * len * sag * 0.25, c.from[1] + dy / 2 + len * sag];

        // Arc-length table along the curve
        const pts = [];
        const acc = [0];
        for (let i = 0; i <= SAMPLES; i++) {
          pts.push(bez(c.from, ctrl, c.to, i / SAMPLES));
          if (i) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
        }
        const total = acc[SAMPLES];
        const at = d => {
          let i = 1;
          while (i < SAMPLES && acc[i] < d) i++;
          const f = (d - acc[i - 1]) / Math.max(1e-6, acc[i] - acc[i - 1]);
          const x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f;
          const y = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f;
          return [x, y, Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0])];
        };

        // Each yank reels the chain about half a link toward the stake
        const reel = (cycle * 0.5 + 0.5 * (1 - Math.exp(-7 * tau))) * spacing;
        const offset = reel % spacing;
        const rattle = tau < 0.35 ? Math.exp(-tau * 10) * linkLen * 0.12 : 0;
        const glint = (tau / 0.8) * total; // a highlight runs down the chain after the yank

        c.links.forEach((link, i) => {
          const d = i * spacing + offset;
          if (d > total) {
            link.visible = false;
            return;
          }
          link.visible = true;
          const [x, y, a] = at(d);
          const jitter = rattle * Math.sin(t * 90 + i * 2.1);
          link.position.set(x - Math.sin(a) * jitter, y + Math.cos(a) * jitter);
          link.rotation = a;
          const g = tau < 0.8 ? Math.exp(-((d - glint) ** 2) / (spacing * spacing * 1.5)) : 0;
          const shade = Math.round(0x9a + (0xff - 0x9a) * g);
          link.tint = (shade << 16) | (shade << 8) | Math.min(0xff, shade + 0x08);
        });

        // Stake shudders, dust kicks up, the shackle sparks and tugs
        const kick = Math.exp(-tau * 14);
        c.stake.position.set(c.to[0] + Math.sin(tau * 70) * linkLen * 0.18 * kick, c.to[1]);
        const puff = Math.min(1, tau / 0.7);
        c.dust.scale.set(0.6 + puff * 1.1, 0.6 + puff * 0.7);
        c.dust.alpha = tau < 0.7 ? 0.55 * (1 - puff) : 0;
        c.spark.alpha = Math.exp(-tau * 9);
        c.spark.scale.set(0.6 + 0.6 * (1 - Math.exp(-tau * 12)));
        c.spark.rotation = tau * 3;
        c.shackle.position.set(c.from[0] + c.sx * kick * linkLen * 0.12, c.from[1] + kick * linkLen * 0.08);
      }
    },
  };
}

/** Engaged: clash chevrons on both flanks, pushing in. */
function engaged(geo) {
  const root = new PIXI.Container();
  root.position.set(geo.cx, geo.cy);
  const s = Math.min(geo.rx, geo.ry) * 0.16;
  const gap = s * 0.85;
  const left = glowPath(
    g => {
      for (const off of [0, gap]) {
        const x = -geo.rx * 1.2 + off;
        g.moveTo(x - s, -s); g.lineTo(x, 0); g.lineTo(x - s, s);
      }
    },
    { width: geo.u * 1.5, color: COLORS.engaged }
  );
  const right = glowPath(
    g => {
      for (const off of [0, gap]) {
        const x = geo.rx * 1.2 - off;
        g.moveTo(x + s, -s); g.lineTo(x, 0); g.lineTo(x + s, s);
      }
    },
    { width: geo.u * 1.5, color: COLORS.engaged }
  );
  root.addChild(left, right);
  return {
    root,
    animate(t) {
      const push = geo.u * 2 * ((Math.sin(t * 5) + 1) / 2);
      left.x = push;
      right.x = -push;
    },
  };
}

/** Hidden: a slow dotted perimeter, like a sensor shadow. */
function hidden(geo) {
  const root = new PIXI.Container();
  root.position.set(geo.cx, geo.cy);
  const dots = new PIXI.Graphics();
  const R = geo.r * 1.16;
  const n = 32;
  dots.beginFill(COLORS.hidden, 0.75);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    dots.drawCircle(Math.cos(a) * R, Math.sin(a) * R, Math.max(1, geo.u * 0.75));
  }
  dots.endFill();
  root.addChild(dots);
  return {
    root,
    animate(t) {
      dots.rotation = t * 0.12;
      root.alpha = 0.55 + 0.2 * Math.sin(t * 1.1);
    },
  };
}

/** Shut Down: the frame goes dark; a red standby light blinks on its shoulder. */
function shutdown(geo) {
  const root = new PIXI.Container();
  const dim = new PIXI.Graphics();
  for (let i = 0; i < 4; i++) {
    const k = 1 - i * 0.06;
    dim.beginFill(0x000000, 0.12).drawEllipse(geo.cx, geo.cy, geo.rx * 0.95 * k, geo.ry * 0.95 * k).endFill();
  }
  const s = Math.min(geo.rx, geo.ry) * 0.13;
  const icon = glowPath(
    g => {
      g.moveTo(Math.cos(-60 * DEG) * s, Math.sin(-60 * DEG) * s);
      g.arc(0, 0, s, -60 * DEG, 240 * DEG);
      g.moveTo(0, -s * 1.15);
      g.lineTo(0, -s * 0.15);
    },
    { width: Math.max(1.2, geo.u * 0.9), color: COLORS.power }
  );
  icon.position.set(geo.cx + geo.rx * 0.74, geo.cy - geo.ry * 0.74);
  root.addChild(dim, icon);
  return {
    root,
    animate(t) {
      icon.alpha = t % 1.6 < 0.8 ? 1 : 0.2; // standby blink
    },
  };
}

/** Reactor Meltdown: a radiation trefoil with the countdown beside it; faster near zero. */
function meltdown(geo, actor) {
  const root = new PIXI.Container();
  const s = Math.min(geo.rx, geo.ry) * 0.2;
  const badge = new PIXI.Container();
  badge.position.set(geo.cx - geo.rx * 0.8, geo.cy - geo.ry * 0.8);
  const disc = new PIXI.Graphics();
  disc.beginFill(0x000000, 0.65).drawCircle(0, 0, s * 1.2).endFill();
  stroke(disc, Math.max(1, geo.u * 0.7), COLORS.meltdown, 1);
  disc.drawCircle(0, 0, s * 1.2);
  const halo = new PIXI.Graphics();
  halo.blendMode = PIXI.BLEND_MODES.ADD;
  halo.beginFill(COLORS.meltdown, 0.25).drawCircle(0, 0, s * 1.8).endFill();
  const blades = new PIXI.Graphics();
  blades.beginFill(COLORS.meltdown, 1);
  for (let i = 0; i < 3; i++) {
    const mid = -90 * DEG + i * 120 * DEG;
    const a0 = mid - 30 * DEG;
    const a1 = mid + 30 * DEG;
    blades.moveTo(Math.cos(a0) * s * 0.32, Math.sin(a0) * s * 0.32);
    blades.arc(0, 0, s * 0.95, a0, a1);
    blades.arc(0, 0, s * 0.32, a1, a0, true);
    blades.closePath();
  }
  blades.drawCircle(0, 0, s * 0.18);
  blades.endFill();
  badge.addChild(halo, disc, blades);
  root.addChild(badge);

  const timer = Number.isInteger(actor?.system?.meltdown_timer) ? actor.system.meltdown_timer : null;
  if (timer !== null) {
    const Text = foundry.canvas.containers.PreciseText;
    const style = Text.getTextStyle({
      fontFamily: "Orbitron, Signika, sans-serif",
      fontSize: Math.round(s * 1.05),
      fill: 0xff6a6a,
      stroke: 0x000000,
      strokeThickness: Math.max(2, Math.round(s * 0.18)),
    });
    const label = new Text(`T-${timer}`, style);
    label.anchor.set(0, 0.5);
    label.position.set(badge.x + s * 1.45, badge.y);
    root.addChild(label);
  }
  const rate = timer !== null && timer <= 1 ? 16 : 7;
  return {
    root,
    animate(t) {
      const beat = (Math.sin(t * rate) + 1) / 2;
      badge.scale.set(1 + 0.08 * beat);
      halo.alpha = 0.4 + 0.6 * beat;
    },
  };
}

function easeOut(x) {
  return 1 - (1 - x) ** 3;
}

/* -------------------------------------------- */
/*  Registry                                    */
/* -------------------------------------------- */

const has = id => actor => !!actor?.statuses?.has(id);

/**
 * Overlay definitions, in paint order (earlier = underneath).
 * key(actor) changes force a rebuild (e.g. the meltdown countdown number).
 */
export const OVERLAYS = [
  { id: "shutdown", active: has("shutdown"), build: shutdown },
  { id: "slowed", active: has("slow"), build: slowed },
  { id: "immobilized", active: has("immobilized"), build: immobilized },
  { id: "hidden", active: has("hidden"), build: hidden },
  { id: "engaged", active: has("engaged"), build: engaged },
  { id: "lockon", active: has("lockon"), build: lockOn },
  { id: "stunned", active: has("stunned"), build: stunned },
  {
    id: "meltdown",
    active: actor => Number.isInteger(actor?.system?.meltdown_timer) || !!actor?.statuses?.has("reactor_meltdown"),
    key: actor => String(actor?.system?.meltdown_timer ?? ""),
    build: meltdown,
  },
];
