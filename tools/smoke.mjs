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

async function step(page, name, fn, arg) {
  const before = errors.length;
  try {
    const out = await page.evaluate(fn, arg);
    const ok = out?.ok !== false && errors.length === before;
    results.push({ ok, line: `${ok ? "ok  " : "FAIL"} ${name}${out?.detail !== undefined ? ` -> ${JSON.stringify(out.detail)}` : ""}` });
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
  if (!entry) { hud.close(); return { ok: true, detail: "no systems on this mech" }; }
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
  return { ok: !!deck && (rows > 0 || npcs === 0), detail: { rows, portraits: deck?.querySelectorAll(".lfd-init-unit").length ?? 0 } };
});

const mechUuid = await p.evaluate(() => game.modules.get("lancer-flight-deck").api.manager.actor?.uuid);
const saved = await g.evaluate(async uuid => {
  const a = await fromUuid(uuid);
  return { s: a.system.structure.value, st: a.system.stress.value };
}, mechUuid);
await g.evaluate(async uuid => {
  const a = await fromUuid(uuid);
  if (a.system.structure.value > 1) await a.update({ "system.structure.value": a.system.structure.value - 1 });
}, mechUuid);
await p.waitForTimeout(2500);
await step(p, "the player's panel cracks when the GM deals structure damage", async () => {
  const n = document.querySelectorAll("#lancer-flight-deck .lfd-fracture").length;
  return { ok: n > 0, detail: n };
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
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
