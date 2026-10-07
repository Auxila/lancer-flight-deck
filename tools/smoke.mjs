// Live smoke test against a running Foundry world: a player seat and a GM seat drive every feature,
// collect console errors, and put back everything they change. Exit code 1 if any step fails.
//
//   FD_URL=http://localhost:30000 FD_GM="Gamemaster" FD_PLAYER="Player" FD_MECH="Everest" npm run smoke
//
// Needs playwright-core and a browser it can drive; it's a dev tool, not part of the module.
//   FD_BROWSER      chromium (default) | firefox
//   FD_EXECUTABLE   path to the browser, if playwright-core's own download isn't installed
//   PLAYWRIGHT_CORE path to a playwright-core install, if it isn't a project dependency
// Use a test world or a copy: it logs in as both users (no passwords), so close those seats first.

const env = process.env;
const URL = env.FD_URL ?? "http://localhost:30000";
const { chromium, firefox } = await import(env.PLAYWRIGHT_CORE ?? "playwright-core").then(m => m.default ?? m);
const engine = env.FD_BROWSER === "firefox" ? firefox : chromium;
const args = engine === chromium ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : [];

// Console noise that isn't Flight Deck's: headless rendering, Foundry/system deprecations, other modules.
const NOISE = [
  /hardware acceleration/i, /GL Driver Message|WebGL context|GPU stall/i, /V1 Application framework/,
  /Deprecated since Version|is now namespaced/i, /unreachable code after return/, /downloadable font/i,
  /browse the host file system|No packages detected/, /Detected \d+ packages?: (?!lancer-flight-deck)/,
];
const noise = text => NOISE.some(re => re.test(text));

/**
 * Whose error is it? The package of the topmost stack frame that belongs to a package: that's where
 * it was thrown. (Async stacks also list the callers further down, Flight Deck among them, when one of
 * its actions led another module's hook to throw.)
 */
function attribute(text) {
  const frame = text.match(/\/(?:modules|systems)\/([^/\s]+)\//);
  if (frame) return frame[1] === "lancer-flight-deck" ? "ours" : "foreign";
  if (/lancer-flight-deck|Flight Deck \|/.test(text)) return "ours";
  if (/Detected \d+ packages?:/.test(text)) return "foreign";
  return "unknown";
}

const results = [];
const errors = []; // Flight Deck's: these fail the step they happen in
const unknown = []; // no package named: listed for a human to look at
let foreign = 0;
function record(user, text) {
  if (noise(text)) return;
  const who = attribute(text);
  if (who === "ours") errors.push(`[${user}] ${text.slice(0, 400)}`);
  else if (who === "unknown") unknown.push(`[${user}] ${text.split(/\r?\n/)[0].slice(0, 200)}`);
  else foreign++;
}

async function seat(user) {
  const browser = await engine.launch({ headless: true, args, ...(env.FD_EXECUTABLE ? { executablePath: env.FD_EXECUTABLE } : {}) });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage();
  page.on("pageerror", e => record(user, `${e.message}
${e.stack ?? ""}`));
  page.on("console", async m => {
    if (m.type() !== "error") return;
    // Foundry logs hook errors as Error objects: their stack says which package threw
    const stack = await m.args()[0]?.evaluate(e => e?.stack ?? "").catch(() => "") ?? "";
    record(user, `${m.text()}
${m.location()?.url ?? ""}
${stack}`);
  });
  await page.goto(`${URL}/join`);
  await page.waitForSelector("select[name=userid] option", { state: "attached" });
  const value = await page.evaluate(u => [...document.querySelectorAll("select[name=userid] option")].find(o => o.value === u || o.textContent.trim() === u)?.value, user);
  if (!value) throw new Error(`No user "${user}" on the join page`);
  await page.selectOption("select[name=userid]", value);
  await page.click("button[name=join]");
  await page.waitForFunction(() => window.game?.ready, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  return { browser, page };
}

/**
 * Run one check in a page. It returns { ok, detail }, or { skip: "why" } when this world has nothing for it
 * to test (no NPC token, no systems...): a skip is reported apart, never as a pass, but a Flight Deck error
 * thrown while finding that out still fails it.
 */
async function step(page, name, fn, arg) {
  const before = errors.length;
  try {
    const out = await page.evaluate(fn, arg);
    const clean = errors.length === before;
    if (out?.skip && clean) {
      results.push({ ok: true, skipped: true, line: `skip ${name} -> ${out.skip}` });
      return await page.waitForTimeout(400);
    }
    const ok = out?.ok !== false && !out?.skip && clean;
    const detail = out?.detail ?? out?.skip;
    results.push({ ok, line: `${ok ? "ok  " : "FAIL"} ${name}${detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ""}` });
  } catch (err) {
    results.push({ ok: false, line: `FAIL ${name}: ${err.message.split("\n")[0]}` });
  }
  await page.waitForTimeout(400);
}

const wait = ms => new Promise(r => setTimeout(r, ms));

/* ------------------------------ Player seat ------------------------------ */

const player = await seat(env.FD_PLAYER ?? "Player");
const p = player.page;
const mechName = env.FD_MECH;

await step(p, "panel opens on the player's mech", async name => {
  const set = (k, v) => game.settings.set("lancer-flight-deck", k, v);
  for (const [k, v] of [["enabled", true], ["collapsed", false], ["bootSequence", false], ["mode", "docked"]]) await set(k, v);
  const token = canvas.tokens?.placeables.find(t => t.actor?.type === "mech" && t.actor.isOwner && (!name || t.name === name));
  token?.control({ releaseOthers: true });
  await new Promise(r => setTimeout(r, 1200));
  const actor = game.modules.get("lancer-flight-deck").api.manager.actor;
  return { ok: !!document.getElementById("lancer-flight-deck") && !!actor, detail: actor?.name ?? null };
}, mechName);

/* ------------------------- LANCER contract (player) ----------------------- */
// What Flight Deck assumes about LANCER. After a LANCER or Foundry update, a FAIL here names the
// assumption that broke, before a player meets it at the table.

await step(p, "LANCER contract: the flows Flight Deck runs and hooks exist", async () => {
  const L = game.lancer;
  const flows = ["ActivationFlow", "BasicAttackFlow", "TechAttackFlow", "WeaponAttackFlow", "SystemFlow", "SimpleTextFlow", "SimpleHTMLFlow", "DamageRollFlow", "StructureFlow", "OverheatFlow"];
  const missing = flows.filter(name => !L?.flows?.get?.(name));
  const helpers = ["fromLid", "fromLidSync", "beginItemChatFlow"].filter(name => typeof L?.[name] !== "function");
  // The basic-invade workaround slots a step in after this one, through LANCER's step registry
  const anchor = !!L?.flows?.get?.("TechAttackFlow")?.steps?.includes?.("initTechAttackData") && L?.flowSteps instanceof Map;
  return { ok: !missing.length && !helpers.length && anchor, detail: { missingFlows: missing, missingHelpers: helpers, techStepAnchor: anchor } };
});

await step(p, "LANCER contract: the mech's data is where the panel reads it", async () => {
  const actor = game.modules.get("lancer-flight-deck").api.manager.actor;
  const s = actor?.system ?? {};
  const num = v => Number.isFinite(Number(v));
  const checks = {
    actionTracker: ["protocol", "move", "full", "quick", "reaction"].every(k => k in (s.action_tracker ?? {})),
    loadout: !!s.loadout && "frame" in s.loadout && Array.isArray(s.loadout.systems) && Array.isArray(s.loadout.weapon_mounts),
    tracks: ["hp", "heat", "structure", "stress"].every(k => num(s[k]?.value) && num(s[k]?.max)),
    stats: ["evasion", "edef", "speed", "sensor_range", "save", "tech_attack", "hull", "agi", "sys", "eng"].every(k => num(s[k])),
    meltdownTimer: "meltdown_timer" in s,
    coreEnergy: "core_energy" in s,
    pilotRef: "pilot" in s,
  };
  const methods = ["beginStatFlow", "beginOverchargeFlow", "beginStabilizeFlow", "beginScanFlow", "toggleStatusEffect"].filter(m => typeof actor?.[m] !== "function");
  const frame = s.loadout?.frame?.value;
  if (frame && typeof frame.beginCoreActiveFlow !== "function") methods.push("frame.beginCoreActiveFlow");
  const failed = Object.keys(checks).filter(k => !checks[k]);
  return { ok: !!actor && !failed.length && !methods.length, detail: { failed, missingMethods: methods } };
});

await step(p, "LANCER contract: every condition the tiles toggle is registered", async () => {
  const ids = ["exposed", "shredded", "stunned", "lockon", "jammed", "impaired", "slow", "immobilized", "engaged", "prone", "hidden", "invisible", "shutdown", "dangerzone"];
  const missing = ids.filter(id => !CONFIG.statusEffects.some(s => s.id === id));
  return { ok: !missing.length, detail: missing.length ? { missing } : `${ids.length} statuses` };
});

await step(p, "LANCER workaround: Grapple's attack prompt carries its own title", async () => {
  const hud = game.modules.get("lancer-flight-deck").api.manager.hud;
  await hud.open("quick");
  await new Promise(r => setTimeout(r, 500));
  document.querySelector('#lancer-flight-deck-hud [data-entry="basic:grapple"]')?.click();
  let text = "";
  for (let i = 0; i < 40 && !/GRAPPLE/.test(text); i++) {
    await new Promise(r => setTimeout(r, 150));
    text = document.getElementById("hudzone")?.innerText ?? "";
  }
  const titled = /GRAPPLE/.test(text) && !/BASIC ATTACK/.test(text);
  const cancel = [...document.querySelectorAll("#hudzone button, #hudzone a")].find(b => /cancel/i.test(b.innerText ?? ""));
  cancel?.click();
  await new Promise(r => setTimeout(r, 800));
  hud.close();
  return { ok: titled && !!cancel, detail: { titled, cancelled: !!cancel } };
});

await step(p, "LANCER workaround: a basic invade is marked as a tech attack (vs E-Defense)", async () => {
  const target = canvas.tokens.placeables.find(t => t.actor?.type === "npc" && t.visible);
  if (!target) return { skip: "no NPC token on the scene to target" };
  const before = [...game.user.targets];
  target.setTarget(true, { releaseOthers: true });
  let marked = null;
  const id = Hooks.on("lancer.postFlow.TechAttackFlow", flow => {
    marked = { smart: !!flow.state.data?.is_smart, tech: !!flow.state.data?.acc_diff?.weapon?.tech };
  });
  const hud = game.modules.get("lancer-flight-deck").api.manager.hud;
  await hud.open("invade");
  await new Promise(r => setTimeout(r, 500));
  document.querySelector('#lancer-flight-deck-hud [data-entry="basic:fragment"]')?.click();
  let cancel = null;
  for (let i = 0; i < 40 && !cancel; i++) {
    await new Promise(r => setTimeout(r, 150));
    cancel = [...document.querySelectorAll("#hudzone button, #hudzone a")].find(b => /cancel/i.test(b.innerText ?? ""));
  }
  cancel?.click();
  for (let i = 0; i < 20 && !marked; i++) await new Promise(r => setTimeout(r, 100));
  Hooks.off("lancer.postFlow.TechAttackFlow", id);
  hud.close();
  target.setTarget(false, { releaseOthers: true });
  for (const t of before) t.setTarget(true, { releaseOthers: false });
  return { ok: !!marked?.tech && !!marked?.smart, detail: marked ?? "the invade flow never reported back" };
});

for (const menu of ["invade", "move", "quick", "full", "reaction", "core", "systems"]) {
  await step(p, `HUD menu: ${menu}`, async m => {
    const hud = game.modules.get("lancer-flight-deck").api.manager.hud;
    await hud.open(m);
    const n = document.querySelectorAll("#lancer-flight-deck-hud [data-entry]").length;
    // The HUD stays above the hotbar
    const hudBox = document.getElementById("lancer-flight-deck-hud")?.getBoundingClientRect();
    const bar = document.getElementById("hotbar")?.getBoundingClientRect();
    const covers = !!(hudBox && bar?.width && hudBox.left < bar.right && hudBox.right > bar.left && hudBox.bottom > bar.top + 1);
    return { ok: n > 0 && !covers, detail: { entries: n, coversHotbar: covers } };
  }, menu);
}
await step(p, "HUD closes", async () => {
  game.modules.get("lancer-flight-deck").api.manager.hud.close();
  await new Promise(r => setTimeout(r, 300));
  return { ok: !document.getElementById("lancer-flight-deck-hud") };
});

await step(p, "a system posts its full card to chat", async () => {
  const hud = game.modules.get("lancer-flight-deck").api.manager.hud;
  await hud.open("systems");
  const entry = document.querySelector('#lancer-flight-deck-hud [data-entry^="system:"]');
  if (!entry) { hud.close(); return { skip: "no systems on this mech" }; }
  const before = game.messages.size;
  entry.click();
  await new Promise(r => setTimeout(r, 1500));
  hud.close();
  const msg = game.messages.contents.at(-1);
  const ok = game.messages.size > before && msg?.content.includes("lfd-chat-card");
  return { ok, detail: ok };
});

await step(p, "mech check keys show the HASE bonuses", async () => {
  const actor = game.modules.get("lancer-flight-deck").api.manager.actor;
  const keys = [...document.querySelectorAll("#lancer-flight-deck .lfd-check")].map(b => [b.dataset.check, b.querySelector(".lfd-check-bonus")?.textContent]);
  const want = ["hull", "agi", "sys", "eng"].map(id => [id, `${actor.system[id] >= 0 ? "+" : ""}${actor.system[id]}`]);
  return { ok: JSON.stringify(keys) === JSON.stringify(want), detail: Object.fromEntries(keys) };
});

await step(p, "every condition tile describes its condition", async () => {
  const tiles = [...document.querySelectorAll("#lancer-flight-deck [data-tile]")];
  const bare = tiles.filter(b => !/<p>/.test(b.dataset.tooltipHtml ?? "")).map(b => b.dataset.tile);
  return { ok: tiles.length > 0 && bare.length === 0, detail: bare.length ? { missing: bare } : `${tiles.length} tiles` };
});

await step(p, "a condition tile toggles the player's own mech", async () => {
  const actor = game.modules.get("lancer-flight-deck").api.manager.actor;
  const had = actor.statuses.has("exposed");
  document.querySelector('#lancer-flight-deck [data-tile="exposed"]')?.click();
  await new Promise(r => setTimeout(r, 1000));
  const flipped = actor.statuses.has("exposed") !== had;
  await actor.toggleStatusEffect("exposed", { active: had });
  return { ok: flipped };
});

await step(p, "heat editor +1, then back", async () => {
  const mgr = game.modules.get("lancer-flight-deck").api.manager;
  const h0 = mgr.actor.system.heat.value;
  mgr.adjustResource("heat", 1);
  await new Promise(r => setTimeout(r, 900));
  const h1 = mgr.actor.system.heat.value;
  mgr.adjustResource("heat", -1);
  await new Promise(r => setTimeout(r, 900));
  return { ok: h1 === h0 + 1 && mgr.actor.system.heat.value === h0, detail: [h0, h1, mgr.actor.system.heat.value] };
});

await step(p, "theme picker: the badge opens it, hover previews a layout, Escape puts it back", async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const panel = () => document.getElementById("lancer-flight-deck");
  const themeOf = () => [...panel().classList].find(c => c.startsWith("lfd-theme-"));
  const setting = game.settings.get("lancer-flight-deck", "theme");
  const before = themeOf();
  panel().querySelector(".lfd-badge").click();
  await wait(500);
  const menu = document.getElementById("lancer-flight-deck-themes");
  const options = [...(menu?.querySelectorAll("[data-theme]") ?? [])].map(o => o.dataset.theme);
  // Preview the theme that isn't on screen; IPS-N brings its own templates, so the layout changes too
  const other = before === "lfd-theme-ipsn" ? "gms" : "ipsn";
  menu?.querySelector(`[data-theme="${other}"]`)?.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
  await wait(700);
  const previewed = themeOf();
  const ipsnLayout = !!panel().querySelector(".lfd-ipsn-rose");
  const focused = menu?.contains(document.activeElement) ? document.activeElement : menu;
  focused?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await wait(700);
  const closed = !document.getElementById("lancer-flight-deck-themes");
  const restored = themeOf() === before && game.settings.get("lancer-flight-deck", "theme") === setting;
  const ok = options[0] === "auto" && options.includes("gms") && options.includes("ipsn") &&
    previewed === `lfd-theme-${other}` && ipsnLayout === (other === "ipsn") && closed && restored;
  return { ok, detail: { options, previewed, ipsnLayout, closed, restored } };
});

await step(p, "theme picker: choosing sets the mech's own theme (an actor flag), not the player's default", async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const M = "lancer-flight-deck";
  const panel = () => document.getElementById("lancer-flight-deck");
  const themeOf = () => [...panel().classList].find(c => c.startsWith("lfd-theme-"));
  const actor = game.modules.get(M).api.manager.actor;
  const flag = actor.flags?.[M]?.theme;
  const setting = game.settings.get(M, "theme");
  const mechThemes = game.settings.get(M, "mechThemes");
  if (!mechThemes) await game.settings.set(M, "mechThemes", true);
  const pick = themeOf() === "lfd-theme-ha" ? "ssc" : "ha";
  panel().querySelector(".lfd-badge").click();
  await wait(500);
  const scope = document.querySelector("#lancer-flight-deck-themes .lfd-theme-menu-scope")?.textContent.trim();
  document.querySelector(`#lancer-flight-deck-themes [data-theme="${pick}"]`)?.click();
  await wait(1500);
  const chosen = { flag: actor.flags?.[M]?.theme, theme: themeOf(), setting: game.settings.get(M, "theme") };
  if (flag) await actor.setFlag(M, "theme", flag);
  else await actor.unsetFlag(M, "theme");
  if (!mechThemes) await game.settings.set(M, "mechThemes", false);
  await wait(1000);
  const ok = !!scope?.includes(actor.name) && chosen.flag === pick && chosen.theme === `lfd-theme-${pick}` && chosen.setting === setting &&
    (actor.flags?.[M]?.theme ?? undefined) === (flag ?? undefined);
  return { ok, detail: { scope, pick, chosen, restored: actor.flags?.[M]?.theme ?? null } };
});

await step(p, "hide button, then the toolbar toggle brings it back", async () => {
  document.querySelector('#lancer-flight-deck [data-action="hidePanel"]')?.click();
  await new Promise(r => setTimeout(r, 900));
  const hidden = !document.getElementById("lancer-flight-deck") && !game.settings.get("lancer-flight-deck", "enabled");
  if (ui.controls.control?.name !== "tokens") await ui.controls.activate({ control: "tokens" });
  await new Promise(r => setTimeout(r, 400));
  document.querySelector('[data-tool="lfd-flight-deck"]')?.click();
  await new Promise(r => setTimeout(r, 1200));
  const back = !!document.getElementById("lancer-flight-deck");
  return { ok: hidden && back, detail: { hidden, back } };
});

await step(p, "Token Action HUD steps aside while the panel is open", async () => {
  if (!game.modules.get("token-action-hud-core")?.active) return { skip: "Token Action HUD not active" };
  const hiddenOpen = document.body.classList.contains("lfd-hide-tah");
  await game.settings.set("lancer-flight-deck", "collapsed", true);
  await new Promise(r => setTimeout(r, 500));
  const shownCollapsed = !document.body.classList.contains("lfd-hide-tah");
  await game.settings.set("lancer-flight-deck", "collapsed", false);
  await new Promise(r => setTimeout(r, 900));
  return { ok: hiddenOpen && shownCollapsed && document.body.classList.contains("lfd-hide-tah"), detail: { hiddenOpen, shownCollapsed } };
});

await step(p, "players get no NPC Deck", async () => ({
  ok: !document.getElementById("lancer-flight-deck-npc") && !game.modules.get("lancer-flight-deck").api.npcDeck(),
}));

/* -------------------------------- GM seat -------------------------------- */

const gm = await seat(env.FD_GM ?? "Gamemaster");
const g = gm.page;

await step(g, "NPC Deck lists the scene's NPCs", async () => {
  await game.settings.set("lancer-flight-deck", "npcDeck", true);
  await new Promise(r => setTimeout(r, 900));
  const deck = document.getElementById("lancer-flight-deck-npc");
  const rows = deck?.querySelectorAll(".lfd-npc-row").length ?? 0;
  const npcs = canvas.scene?.tokens.filter(t => t.actor?.type === "npc").length ?? 0;
  if (deck && !npcs) return { skip: "no NPC tokens on the scene (the deck opened)" };
  return { ok: !!deck && rows > 0, detail: { rows, portraits: deck?.querySelectorAll(".lfd-init-unit").length ?? 0 } };
});

await step(g, "LANCER contract: NPC Deck's combat and feature calls exist", async () => {
  const proto = CONFIG.Combat.documentClass.prototype;
  const missing = ["activateCombatant", "deactivateCombatant"].filter(m => typeof proto[m] !== "function");
  const npc = canvas.scene?.tokens.find(t => t.actor?.type === "npc")?.actor;
  if (npc) {
    if (typeof npc.beginRechargeFlow !== "function") missing.push("npc.beginRechargeFlow");
    const feature = npc.items.find(i => i.type === "npc_feature");
    for (const m of ["beginWeaponAttackFlow", "beginTechAttackFlow", "beginSystemFlow"]) if (feature && typeof feature[m] !== "function") missing.push(`feature.${m}`);
  }
  const combatant = game.combat?.combatants.contents.find(c => c.actor?.type === "npc");
  const activations = combatant ? ["value", "max"].every(k => k in (combatant.activations ?? {})) : null;
  return { ok: !missing.length && activations !== false, detail: { missing, activations: activations ?? "no combat running" } };
});

await step(g, "cleanup: scanning the world for Flight Deck data works", async () => {
  const found = game.modules.get("lancer-flight-deck").api.cleanup.scan();
  return { ok: Array.isArray(found.tokens) && Array.isArray(found.actors), detail: { tokensWithFilters: found.tokens.length, actorsWithNotes: found.actors.length } };
});

const mechUuid = await p.evaluate(() => game.modules.get("lancer-flight-deck").api.manager.actor?.uuid);

/* ---------------- 0.8.1: a turn of our own (movement, Boost, whose turn it is) ---------------- */

// A short encounter of the mech's own, its turn running: movement is recorded and spent in a started combat,
// and players can't move while the game is paused. Everything is put back afterwards.
const turn = await g.evaluate(async uuid => {
  const actor = await fromUuid(uuid);
  const token = actor?.getActiveTokens(false, true)[0];
  if (!token) return { skip: "the mech has no token on this scene" };
  const before = {
    active: game.combats.find(c => c.active && (!c.scene || c.scene === canvas.scene))?.id ?? null,
    paused: game.paused,
    x: token.x,
    y: token.y,
    tracker: foundry.utils.deepClone(actor.system.action_tracker),
  };
  const combat = await Combat.create({ scene: canvas.scene.id, active: true });
  await combat.createEmbeddedDocuments("Combatant", [{ tokenId: token.id, sceneId: canvas.scene.id, actorId: token.actorId }]);
  await combat.startCombat();
  await combat.activateCombatant(combat.combatants.contents[0].id);
  if (game.paused) game.togglePause(false, { broadcast: true });
  await new Promise(r => setTimeout(r, 1500));
  return { combat: combat.id, ...before };
}, mechUuid);

await step(p, "the activation light follows the mech's own turn, whichever encounter the tracker shows", async turn => {
  if (turn.skip) return { skip: turn.skip };
  const other = game.combats.find(c => c.id !== turn.combat);
  if (other) ui.combat.viewed = other;
  await game.modules.get("lancer-flight-deck").api.manager.refresh({ force: true });
  await new Promise(r => setTimeout(r, 800));
  const lit = !!document.querySelector("#lancer-flight-deck .lfd-activation");
  ui.combat.viewed = game.combats.get(turn.combat);
  return { ok: lit, detail: { trackerShows: other ? "another encounter" : "this one", lit } };
}, turn);

await step(g, "NPC Deck runs the scene's active encounter, even when the tracker shows another", async turn => {
  if (turn.skip) return { skip: turn.skip };
  const combat = game.combats.get(turn.combat);
  const other = game.combats.find(c => c.id !== turn.combat && c.started);
  if (other) ui.combat.viewed = other;
  await game.settings.set("lancer-flight-deck", "npcDeck", true);
  await game.modules.get("lancer-flight-deck").api.npcDeck()?.render();
  await new Promise(r => setTimeout(r, 1200));
  const ids = [...document.querySelectorAll("#lancer-flight-deck-npc [data-combatant]")].map(e => e.dataset.combatant);
  const ours = ids.some(id => combat.combatants.has(id));
  const theirs = ids.some(id => !combat.combatants.has(id));
  ui.combat.viewed = combat;
  return { ok: ours && !theirs, detail: { units: ids.length, otherEncounter: !!other } };
}, turn);

await step(p, "dragging the mech spends movement, undo gives it back, Reset restores it and clears the ruler", async turn => {
  if (turn.skip) return { skip: turn.skip };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const mgr = game.modules.get("lancer-flight-deck").api.manager;
  const actor = mgr.actor;
  const token = actor.getActiveTokens(false, true)[0];
  const speed = Number(actor.system.speed) || 0;
  await actor.update({ "system.action_tracker.move": speed });
  await wait(500);
  const o = canvas.grid.getOffset(token.object.center);
  const dest = canvas.grid.getTopLeftPoint({ i: o.i, j: o.j + 2 });
  await token.move([{ x: dest.x, y: dest.y }], { method: "dragging" });
  await wait(1800);
  const afterDrag = actor.system.action_tracker.move;
  const recorded = token.movementHistory.length;
  await token.revertRecordedMovement();
  await wait(1800);
  const afterUndo = actor.system.action_tracker.move;
  await token.move([{ x: dest.x, y: dest.y }], { method: "dragging" });
  await wait(1800);
  document.querySelector('#lancer-flight-deck [data-action="menu"][data-menu="move"]')?.click();
  await wait(900);
  document.querySelector('#lancer-flight-deck-hud [data-entry="util:resetMove"]')?.click();
  await wait(1800);
  mgr.hud.close();
  const afterReset = actor.system.action_tracker.move;
  const history = token.movementHistory.length;
  const ok = afterDrag < speed && recorded > 0 && afterUndo === speed && afterReset === speed && history === 0;
  return { ok, detail: { speed, afterDrag, afterUndo, afterReset, historyAfterReset: history } };
}, turn);

await step(p, "Boost adds Speed, and the MOVE light reads what's left over the turn's allowance", async turn => {
  if (turn.skip) return { skip: turn.skip };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const mgr = game.modules.get("lancer-flight-deck").api.manager;
  const actor = mgr.actor;
  const speed = Number(actor.system.speed) || 0;
  const light = () => document.querySelector("#lancer-flight-deck .lfd-light-move .lfd-light-detail")?.textContent.trim();
  document.querySelector('#lancer-flight-deck [data-action="menu"][data-menu="quick"]')?.click();
  await wait(900);
  document.querySelector('#lancer-flight-deck-hud [data-entry="basic:boost"]')?.click();
  await wait(2500);
  mgr.hud.close();
  const boosted = { move: actor.system.action_tracker.move, light: light() };
  await mgr.toggleMenu("move");
  await wait(900);
  document.querySelector('#lancer-flight-deck-hud [data-entry="util:resetMove"]')?.click();
  await wait(1800);
  mgr.hud.close();
  const reset = light();
  const ok = boosted.move === 2 * speed && boosted.light === `${2 * speed}/${2 * speed}` && reset === `${speed}/${speed}`;
  return { ok, detail: { speed, boosted, reset } };
}, turn);

await step(g, "NPC Deck: ▶ on a row starts that NPC's turn, and End turn moves it to Done", async turn => {
  if (turn.skip) return { skip: turn.skip };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const combat = game.combats.get(turn.combat);
  const npc = canvas.tokens.placeables.find(t => t.actor?.type === "npc" && t.visible && !t.document.hidden && !t.actor.system?.destroyed && (t.actor.system?.structure?.value ?? 1) > 0);
  if (!npc) return { skip: "no NPC token standing on the scene" };
  await combat.createEmbeddedDocuments("Combatant", [{ tokenId: npc.id, sceneId: canvas.scene.id, actorId: npc.document.actorId }]);
  await wait(1500);
  const row = () => document.querySelector(`#lancer-flight-deck-npc .lfd-npc-row[data-token="${npc.id}"]`);
  const sectionOf = () => {
    let e = row();
    while (e && !e.classList.contains("lfd-npc-section")) e = e.previousElementSibling;
    return ["acting", "ready", "done", "fallen"].find(id => e?.classList.contains(`is-${id}`)) ?? null;
  };
  const before = sectionOf();
  row()?.querySelector('[data-action="activate"]')?.click();
  await wait(1800);
  const acting = sectionOf();
  const endTurn = !!row()?.querySelector('[data-action="endTurn"]');
  row()?.querySelector('[data-action="endTurn"]')?.click();
  await wait(1800);
  const after = sectionOf();
  return { ok: before === "ready" && acting === "acting" && endTurn && after === "done", detail: { npc: npc.name, before, acting, endTurn, after } };
}, turn);

await step(g, "NPC Deck: the open row's ACTIVATE takes the turn and END ACTIVATION finishes it; each is off when it doesn't apply", async turn => {
  if (turn.skip) return { skip: turn.skip };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const combat = game.combats.get(turn.combat);
  const inFight = new Set(combat.combatants.map(c => c.tokenId));
  const npc = canvas.tokens.placeables.find(t => t.actor?.type === "npc" && t.visible && !t.document.hidden && !inFight.has(t.id) && !t.actor.system?.destroyed && (t.actor.system?.structure?.value ?? 1) > 0);
  if (!npc) return { skip: "no second NPC token standing on the scene" };
  await combat.createEmbeddedDocuments("Combatant", [{ tokenId: npc.id, sceneId: canvas.scene.id, actorId: npc.document.actorId }]);
  npc.control({ releaseOthers: true }); // selecting an NPC opens its row
  await wait(1500);
  const btn = which => document.querySelector(`#lancer-flight-deck-npc .lfd-npc-row.is-open[data-token="${npc.id}"] .lfd-npc-turn-btn.is-${which}`);
  const state = () => ({ activate: btn("activate")?.getAttribute("aria-disabled") === "false", end: btn("end")?.getAttribute("aria-disabled") === "false" });
  const ready = state();
  btn("end")?.click(); // off: does nothing
  await wait(800);
  const stillReady = combat.combatant?.tokenId !== npc.id;
  btn("activate")?.click();
  await wait(1800);
  const acting = { ...state(), turn: combat.combatant?.tokenId === npc.id };
  btn("end")?.click();
  await wait(1800);
  const done = { ...state(), turn: combat.combatant?.tokenId === npc.id };
  canvas.tokens.releaseAll();
  const ok = ready.activate && !ready.end && stillReady && acting.turn && !acting.activate && acting.end && !done.turn && !done.activate && !done.end;
  return { ok, detail: { npc: npc.name, ready, stillReady, acting, done } };
}, turn);

await step(g, "NPC Deck: a click on a row's HP opens it, and another closes it", async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  canvas.tokens.releaseAll();
  await wait(800);
  const deck = () => document.getElementById("lancer-flight-deck-npc");
  const closed = deck()?.querySelector(".lfd-npc-row:not(.is-open) .lfd-npc-bars");
  const id = closed?.closest("[data-token]")?.dataset.token;
  if (!id) return { skip: "no closed row" };
  const row = () => deck().querySelector(`.lfd-npc-row[data-token="${id}"]`);
  closed.click();
  await wait(700);
  const opened = row()?.classList.contains("is-open");
  row()?.querySelector(".lfd-npc-bars")?.click();
  await wait(700);
  const shut = !row()?.classList.contains("is-open");
  return { ok: opened && shut, detail: { opened, shut } };
});

await step(g, "NPC Deck: Add to combat from a row and from the batch bar; a click on an NPC already selected opens its row", async turn => {
  if (turn.skip) return { skip: turn.skip };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const combat = game.combats.get(turn.combat);
  const deck = () => document.getElementById("lancer-flight-deck-npc");
  const outside = () => canvas.tokens.placeables.filter(t => t.actor?.type === "npc" && t.visible && !t.document.hidden && !combat.getCombatantsByToken(t.document).length);
  const one = outside()[0];
  if (!one) return { skip: "every NPC on the scene is already in the combat" };
  one.control({ releaseOthers: true });
  await wait(1500);
  const openRow = () => deck().querySelector(".lfd-npc-row.is-open");
  const offered = openRow()?.dataset.token === one.id && !!openRow()?.querySelector('[data-action="addToCombat"]');
  openRow()?.querySelector('[data-action="addToCombat"]')?.click();
  await wait(1500);
  const added = combat.getCombatantsByToken(one.document).length === 1 && !!openRow()?.querySelector(".lfd-npc-turn-btn.is-activate");
  // Several selected, some outside: one button adds them
  const two = outside().slice(0, 2);
  let batch = "skipped: fewer than two NPCs left outside";
  if (two.length === 2) {
    canvas.tokens.releaseAll();
    for (const t of [one, ...two]) t.control({ releaseOthers: false });
    await wait(1500);
    const button = deck().querySelector('[data-action="batchAddToCombat"]');
    const label = button?.textContent.trim();
    button?.click();
    await wait(1500);
    const inNow = two.every(t => combat.getCombatantsByToken(t.document).length === 1);
    batch = { label, inNow, gone: !deck().querySelector('[data-action="batchAddToCombat"]') };
  }
  // The turn opens another row; a click on the NPC still selected opens its row again
  canvas.tokens.releaseAll();
  one.control({ releaseOthers: true });
  await wait(1000);
  const otherRow = [...deck().querySelectorAll(".lfd-npc-row:not(.is-open) .lfd-npc-bars")].find(e => e.closest("[data-token]").dataset.token !== one.id);
  otherRow?.click();
  await wait(800);
  const movedAway = openRow()?.dataset.token !== one.id;
  await canvas.animatePan({ x: one.center.x, y: one.center.y, duration: 0 });
  await wait(400);
  const view = canvas.app.view;
  const box = view.getBoundingClientRect();
  const at = canvas.stage.worldTransform.apply(new PIXI.Point(one.center.x, one.center.y));
  const ptr = type => view.dispatchEvent(new PointerEvent(type, { clientX: box.x + at.x, clientY: box.y + at.y, button: 0, buttons: type === "pointerdown" ? 1 : 0, pointerId: 1, pointerType: "mouse", isPrimary: true, bubbles: true }));
  ptr("pointerdown");
  ptr("pointerup");
  await wait(1200);
  const reopened = openRow()?.dataset.token === one.id && one.controlled;
  canvas.tokens.releaseAll();
  const batchOk = typeof batch === "string" || (batch.label === "Add 2 to combat" && batch.inNow && batch.gone);
  return { ok: offered && added && batchOk && movedAway && reopened, detail: { npc: one.name, offered, added, batch, movedAway, reopened } };
}, turn);

await step(g, "NPC Deck: once everyone has acted, Next round starts the next round", async turn => {
  if (turn.skip) return { skip: turn.skip };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const combat = game.combats.get(turn.combat);
  if (combat.combatant) await combat.nextTurn();
  await combat.updateEmbeddedDocuments("Combatant", combat.combatants.map(c => ({ _id: c.id, "system.activations.value": 0 })));
  await wait(1500);
  const bar = () => document.querySelector("#lancer-flight-deck-npc .lfd-npc-roundend");
  const shown = !!bar();
  const round = combat.round;
  bar()?.querySelector('[data-action="nextRound"]')?.click();
  await wait(1500);
  const next = combat.round === round + 1;
  const refilled = combat.combatants.contents.every(c => (c.activations?.value ?? 0) >= 1 || c.isDefeated);
  return { ok: shown && next && refilled && !bar(), detail: { shown, from: round, to: combat.round, refilled, barGone: !bar() } };
}, turn);

await g.evaluate(async ([uuid, turn]) => {
  if (turn.skip) return;
  const actor = await fromUuid(uuid);
  const token = actor.getActiveTokens(false, true)[0];
  await game.combats.get(turn.combat)?.delete();
  if (turn.active) await game.combats.get(turn.active)?.activate();
  if (token) await token.update({ x: turn.x, y: turn.y }, { animate: false });
  await actor.update({ "system.action_tracker": turn.tracker, "flags.lancer-flight-deck.-=moveAllowance": null });
  if (turn.paused) game.togglePause(true, { broadcast: true });
}, [mechUuid, turn]);
await p.waitForTimeout(1500);

/* ---------------- 0.8.1: the rest of this round's features ---------------- */

await step(p, "Roll damage after a hit also opens on a miss with a Reliable weapon, and not without", async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const M = "lancer-flight-deck";
  const actor = game.modules.get(M).api.manager.actor;
  const isReliable = i => (i.system.active_profile?.all_tags ?? []).some(t => t.is_reliable);
  const reliable = actor.items.find(i => i.type === "mech_weapon" && isReliable(i));
  const plain = actor.items.find(i => i.type === "mech_weapon" && !isReliable(i));
  const target = canvas.tokens.placeables.find(t => t.actor && t.actor.uuid !== actor.uuid && t.visible);
  if (!reliable || !plain || !target) return { skip: "needs a Reliable and a plain weapon on the mech, and another token" };
  const was = game.settings.get(M, "autoDamage");
  await game.settings.set(M, "autoDamage", true);
  // An attack card of the player's own, as LANCER posts it: a miss on one target
  const miss = async item => {
    await ChatMessage.create({
      content: '<div class="lancer-damage-flow"></div>',
      whisper: [game.user.id],
      flags: { lancer: { attackData: { attackerUuid: actor.uuid, attackerItemUuid: item.uuid, invade: false, targets: [{ uuid: target.document.uuid, hit: false, crit: false, total: "1" }] } } },
    });
    let shown = null;
    for (let i = 0; i < 20 && !shown; i++) {
      await wait(150);
      shown = [...document.querySelectorAll("#hudzone .component")].find(e => / DAMAGE -- /.test(e.textContent));
    }
    document.querySelector('#hudzone [data-button="cancel"], #hudzone .dialog-button.cancel')?.click();
    await wait(1200);
    return !!shown;
  };
  const opened = await miss(reliable);
  const plainOpened = await miss(plain);
  for (const t of [...game.user.targets]) t.setTarget(false, { releaseOthers: false });
  await game.settings.set(M, "autoDamage", was);
  return { ok: opened && !plainOpened, detail: { reliable: reliable.name, opened, plain: plain.name, plainOpened } };
});

await step(p, "keyboard: a HUD menu opened from its shortcut takes focus; Escape puts it back on the button", async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const mgr = game.modules.get("lancer-flight-deck").api.manager;
  document.activeElement?.blur?.();
  await mgr.toggleMenu("quick", { focus: true });
  await wait(600);
  const inMenu = !!document.activeElement?.closest?.("#lancer-flight-deck-hud [data-entry]");
  document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await wait(900);
  const back = !!document.activeElement?.matches?.('#lancer-flight-deck [data-action="menu"][data-menu="quick"]');
  mgr.hud.close();
  return { ok: inMenu && back, detail: { inMenu, back } };
});

await step(p, "stat cards: every stat in the strip explains itself", async () => {
  const stats = [...document.querySelectorAll("#lancer-flight-deck .lfd-stat")];
  const cards = stats.map(el => el.dataset.tooltipHtml ?? "");
  const withMakeUp = cards.filter(c => c.includes("lfd-tip-calc")).length;
  const described = stats.length === 6 && cards.every(c => c.includes("lfd-tip-stat")) && stats.every(el => el.getAttribute("aria-label") && el.tabIndex === 0);
  game.tooltip.activate(stats[0]);
  await new Promise(r => setTimeout(r, 300));
  const shown = !!document.querySelector("#tooltip .lfd-tip-stat");
  game.tooltip.deactivate();
  return { ok: described && shown, detail: { stats: stats.length, withMakeUp, shown } };
});

await step(g, "NPC Deck: a right-click on the Hidden tile toggles Invisible", async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const npc = canvas.tokens.placeables.find(t => t.actor?.type === "npc" && t.visible && document.querySelector(`#lancer-flight-deck-npc .lfd-npc-row[data-token="${t.id}"]`));
  if (!npc) return { skip: "no NPC row in the deck" };
  const had = npc.actor.statuses.has("invisible");
  npc.control({ releaseOthers: true });
  await wait(1200);
  const tile = () => document.querySelector('#lancer-flight-deck-npc [data-action="condition"][data-cond="hidden"]');
  const right = () => tile()?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }));
  right();
  await wait(1200);
  const flipped = npc.actor.statuses.has("invisible") !== had;
  const legend = tile()?.textContent.trim();
  right();
  await wait(1200);
  const back = npc.actor.statuses.has("invisible") === had;
  npc.release();
  return { ok: flipped && back, detail: { npc: npc.name, legend } };
});

const saved = await g.evaluate(async uuid => {
  const a = await fromUuid(uuid);
  return { s: a.system.structure.value, st: a.system.stress.value };
}, mechUuid);
await g.evaluate(async uuid => {
  const a = await fromUuid(uuid);
  if (a.system.structure.value > 1) await a.update({ "system.structure.value": a.system.structure.value - 1 });
}, mechUuid);
await p.waitForTimeout(2500);
await step(p, "the player's panel takes damage when the GM deals structure damage", async () => {
  // Whatever the maker's damage looks like (glass, breach, kintsugi, corruption, concrete), each point is marked
  const n = document.querySelectorAll("#lancer-flight-deck .lfd-dmg-mark").length;
  const style = document.querySelector("#lancer-flight-deck .lfd-damage")?.dataset.style;
  return { ok: n > 0, detail: { marks: n, style } };
});
await step(p, "battle damage: still holds it, off takes it down, animated brings it back without replaying", async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const M = "lancer-flight-deck";
  const root = () => document.getElementById("lancer-flight-deck");
  const marks = () => root().querySelectorAll(".lfd-dmg-mark").length;
  const was = { mode: game.settings.get(M, "battleDamage"), reduce: game.settings.get(M, "reduceMotion") };
  await game.settings.set(M, "reduceMotion", "off");
  await game.settings.set(M, "battleDamage", "still");
  await wait(800);
  const still = { held: root().classList.contains("lfd-dmg-still"), marks: marks() };
  await game.settings.set(M, "battleDamage", "off");
  await wait(800);
  const off = { hidden: root().querySelector(".lfd-damage")?.hidden === true, cracked: root().classList.contains("lfd-cracked"), marks: marks() };
  await game.settings.set(M, "battleDamage", "animated");
  await wait(800);
  const on = { marks: marks(), replaying: root().querySelectorAll(".lfd-damage .is-forming").length, held: root().classList.contains("lfd-dmg-still") };
  await game.settings.set(M, "battleDamage", was.mode);
  await game.settings.set(M, "reduceMotion", was.reduce);
  const ok = still.held && still.marks > 0 && off.hidden && !off.cracked && off.marks === 0 && on.marks === still.marks && on.replaying === 0 && !on.held;
  return { ok, detail: { still, off, on } };
});
await g.evaluate(async ([uuid, s]) => (await fromUuid(uuid)).update({ "system.structure.value": s.s, "system.stress.value": s.st }), [mechUuid, saved]);
await p.waitForTimeout(1500);

await player.browser.close();
await gm.browser.close();

for (const r of results) console.log(r.line);
if (errors.length) {
  console.log(`\nFlight Deck errors (${errors.length}):`);
  for (const e of errors) console.log("  ", e);
}
if (unknown.length) {
  console.log(`\nErrors that name no package, worth a look (${unknown.length}):`);
  for (const e of new Set(unknown)) console.log("  ", e);
}
if (foreign) console.log(`\n${foreign} errors from other packages ignored.`);
const failed = results.filter(r => !r.ok).length;
const skipped = results.filter(r => r.skipped).length;
const ran = results.length - skipped;
console.log(`\n${ran - failed}/${ran} passed${skipped ? `, ${skipped} skipped (nothing to test in this world)` : ""}`);
process.exit(failed ? 1 : 0);
