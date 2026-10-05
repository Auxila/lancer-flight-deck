import { ownedDeployable } from "./catalog.js";

/**
 * Deployables on the map, after LANCER's flow has paid for them. LANCER has no deploy action of its
 * own (its sheet shows the cost as a label; players drag the deployable's actor onto the canvas), so
 * this only does the placing, and only for users the world lets create and delete tokens: Foundry's
 * defaults give that to Assistant GMs and up. Nobody's permissions are worked around.
 */

const notify = (key, data, level = "info") => ui.notifications[level](game.i18n.format(key, data));

/** Put the mech's own copy of the deployable in the nearest free space beside it. */
export async function placeDeployable(mech, mechToken, entry) {
  const dep = ownedDeployable(mech, entry.lid);
  if (!dep) return notify("LFD.Deploy.NotImported", { name: entry.deployable, mech: mech.name }, "warn");
  const origin = mechToken?.object ?? mech.getActiveTokens?.()[0] ?? null;
  if (!canvas?.ready || !canvas.scene || !origin) return notify("LFD.Deploy.NoToken", { name: entry.deployable });
  if (!game.user.can("TOKEN_CREATE")) return notify("LFD.Deploy.GmPlaces", { name: entry.deployable });
  const probe = await dep.getTokenDocument({}, { parent: canvas.scene });
  const at = freeSpaceBeside(origin, probe);
  const data = (await dep.getTokenDocument(at, { parent: canvas.scene })).toObject();
  const [created] = (await canvas.scene.createEmbeddedDocuments("Token", [data])) ?? [];
  if (!created) return;
  canvas.ping?.({ x: at.x + at.w / 2, y: at.y + at.h / 2 });
  notify("LFD.Deploy.Placed", { name: entry.deployable, mech: origin.name });
}

/** The fielded token a Recall or Redeploy means: the selected one, else the one nearest the mech. */
function fieldedToken(mech, mechToken, entry) {
  const tokens = ownedDeployable(mech, entry.lid)?.getActiveTokens?.(false, true) ?? [];
  if (tokens.length < 2) return tokens[0] ?? null;
  const selected = tokens.find(t => t.object?.controlled);
  if (selected) return selected;
  const from = mechToken?.object?.center;
  if (!from) return tokens[0];
  const dist = t => Math.hypot((t.object?.center.x ?? 0) - from.x, (t.object?.center.y ?? 0) - from.y);
  return tokens.reduce((a, b) => (dist(b) < dist(a) ? b : a));
}

/**
 * Recall: post it, then take the token off the field. Redeploy: post it, then point at the token so
 * the player can drag it to its new space.
 * @param {() => Promise<boolean>} card  Posts the chat card; resolves false if that was cancelled
 */
export async function recallOrRedeploy(mech, mechToken, entry, card) {
  const token = fieldedToken(mech, mechToken, entry);
  if (!token) {
    notify("LFD.Deploy.NotOnField", { name: entry.deployable });
    return false;
  }
  if (!(await card())) return false;
  const center = token.object?.center;
  if (entry.run === "recall") {
    if (token.canUserModify(game.user, "delete")) await token.delete();
    else notify("LFD.Deploy.GmRecalls", { name: entry.deployable });
  } else {
    if (center) {
      canvas.ping?.(center);
      canvas.animatePan?.({ x: center.x, y: center.y, duration: 400 });
    }
    notify("LFD.Deploy.DragIt", { name: entry.deployable });
  }
  return true;
}

/** Top-left (and size) for a token of this size centred in the first free grid space around the origin token. */
function freeSpaceBeside(origin, probe) {
  const grid = canvas.grid;
  const w = (probe.width ?? 1) * grid.sizeX;
  const h = (probe.height ?? 1) * grid.sizeY;
  const place = c => ({ x: Math.round(c.x - w / 2), y: Math.round(c.y - h / 2), w, h });
  const fallback = place({ x: origin.center.x + origin.w / 2 + w / 2 + 4, y: origin.center.y });
  if (grid.isGridless) return fallback;
  const key = o => `${o.i},${o.j}`;
  const spacesOf = t => t.document?.getOccupiedGridSpaceOffsets?.() ?? [grid.getOffset(t.center)];
  const taken = new Set(canvas.tokens.placeables.flatMap(t => spacesOf(t).map(key)));
  const rect = canvas.dimensions?.sceneRect;
  const inScene = c => !rect || (c.x >= rect.x && c.y >= rect.y && c.x <= rect.right && c.y <= rect.bottom);
  // Rings outward from the mech's own spaces
  let ring = spacesOf(origin);
  const seen = new Set(ring.map(key));
  for (let r = 0; r < 4 && ring.length; r++) {
    const next = [];
    for (const o of ring) {
      for (const n of grid.getAdjacentOffsets(o)) {
        const k = key(n);
        if (seen.has(k)) continue;
        seen.add(k);
        const c = grid.getCenterPoint(n);
        if (!taken.has(k) && inScene(c)) return place(c);
        next.push(n);
      }
    }
    ring = next;
  }
  return fallback;
}
