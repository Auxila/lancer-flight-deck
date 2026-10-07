import { STATUS } from "../../constants.js";

/**
 * Action economy lights (from the system's action tracker) and the quick-action buttons.
 * Every light opens its HUD menu; right-click marks the slot spent or available again.
 * INVADE sits where PROTOCOL used to: it lights while a quick action is left, since an
 * Invade is a quick tech action. Protocols share REACT: its menu lists them first, its lamp is
 * the reaction and its PROTO line the protocol (Shift+right-click marks that one).
 *
 * @param {object} t  Telemetry snapshot
 * @param {{systems: {total: number, ready: number}, open: string|null, owner: boolean}} hud
 */
export function buildActions(t, { systems, open, owner }) {
  const a = t.actions;
  const shutdown = t.flags[STATUS.SHUT_DOWN];
  const down = t.destroyed;
  const quickLeft = (a.full ? 1 : 0) + (a.quick ? 1 : 0);
  const light = (id, label, on, extra = {}) => ({
    id,
    label,
    on,
    open: open === id,
    toggle: owner && id !== "invade" && id !== "core",
    ...extra,
  });
  return {
    lights: [
      light("invade", "LFD.Action.Invade", quickLeft > 0, { invade: true }),
      light("move", "LFD.Action.Move", a.move > 0, { detail: `${a.move}/${a.allowance ?? a.speed}` }),
      light("quick", "LFD.Action.Quick", quickLeft > 0, { pips: [{ on: quickLeft > 0 }, { on: quickLeft > 1 }] }),
      light("full", "LFD.Action.Full", a.full),
      light("reaction", "LFD.Action.Reaction", a.reaction, {
        sub: { label: "LFD.Action.Protocol", on: !!a.protocol },
        hint: owner ? "LFD.Action.HintReaction" : null,
      }),
      light("core", "LFD.Action.Core", t.core.available && t.core.ready),
    ],
    overcharge: { cost: t.overcharge.cost ?? "—", disabled: shutdown || down },
    stabilize: { disabled: down },
    core: {
      name: t.frame?.coreActive || t.frame?.coreName || null,
      disabled: !t.core.available || !t.core.ready || shutdown || down,
      spent: t.core.available && !t.core.ready,
    },
    systems: { ...systems, open: open === "systems" },
  };
}
