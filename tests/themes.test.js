import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getThemes, resolveTheme, themeChoices } from "../src/themes/registry.js";
import { GMSTheme } from "../src/themes/GMSTheme.js";
import { IPSNTheme } from "../src/themes/IPSNTheme.js";
import { SSCTheme } from "../src/themes/SSCTheme.js";
import { HORUSTheme } from "../src/themes/HORUSTheme.js";
import { TEMPLATE_ROOT } from "../src/constants.js";
import { buildHeat } from "../src/ui/components/HeatReactorGauge.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = templatePath => readFileSync(`${ROOT}${templatePath.replace(`${TEMPLATE_ROOT}/`, "templates/")}`, "utf8");

test("frames pick their maker's theme; makers without one (and LCPs) fall back to GMS", () => {
  assert.equal(resolveTheme("GMS"), GMSTheme);
  assert.equal(resolveTheme("IPS-N"), IPSNTheme);
  assert.equal(resolveTheme(" ips-n "), IPSNTheme, "codes are trimmed and case-folded");
  assert.equal(resolveTheme("IPSN"), IPSNTheme);
  assert.equal(resolveTheme("SSC"), SSCTheme);
  assert.equal(resolveTheme("HORUS"), HORUSTheme);
  for (const code of ["BDF", "MPAL", "IRIDIA", "", null, undefined]) assert.equal(resolveTheme(code), GMSTheme, String(code));
});

test("a player's override wins over the frame, and an unknown one is ignored", () => {
  assert.equal(resolveTheme("GMS", "ipsn"), IPSNTheme);
  assert.equal(resolveTheme("IPS-N", "gms"), GMSTheme);
  assert.equal(resolveTheme("IPS-N", "auto"), IPSNTheme);
  assert.equal(resolveTheme("IPS-N", "no-such-theme"), IPSNTheme);
});

test("the setting offers Match frame plus every registered theme", () => {
  const choices = themeChoices();
  assert.deepEqual(Object.keys(choices), ["auto", ...getThemes().map(t => t.id)]);
  assert.ok(getThemes().includes(GMSTheme), "the fallback is always registered");
});

test("every theme has a badge, boot text keys and three cue patches", () => {
  for (const theme of getThemes()) {
    assert.ok(theme.badge && theme.label && theme.tagline, theme.id);
    assert.deepEqual(Object.keys(theme.boot).sort(), ["caption", "stamp", "title"], theme.id);
    for (const cue of ["chime", "klaxon", "boot"]) assert.ok(theme.audio[cue].length >= 2, `${theme.id} ${cue}`);
  }
});

test("IPS-N hull numbers look like Trunk Security's (9A-38) and never change for a mech", () => {
  const a = IPSNTheme.registry({ uuid: "Actor.abc123" });
  assert.match(a, /^[1-9][A-HJ-NP-Z]-\d{2}$/);
  assert.equal(IPSNTheme.registry({ uuid: "Actor.abc123" }), a);
  const many = new Set(Array.from({ length: 200 }, (_, i) => IPSNTheme.registry({ uuid: `Actor.${i}` })));
  assert.ok(many.size > 150, "spread across mechs");
  assert.equal(GMSTheme.registry({ uuid: "Actor.abc123" }), null);
});

test("SSC commission numbers are four digits, the same for a mech every session", () => {
  const n = SSCTheme.registry({ uuid: "Actor.abc123" });
  assert.match(n, /^[1-9]\d{3}$/);
  assert.equal(SSCTheme.registry({ uuid: "Actor.abc123" }), n);
});

test("HORUS handles are eight hex digits (7F3A:C91E), the same for a mech every session", () => {
  const h = HORUSTheme.registry({ uuid: "Actor.abc123" });
  assert.match(h, /^[0-9A-F]{4}:[0-9A-F]{4}$/);
  assert.equal(HORUSTheme.registry({ uuid: "Actor.abc123" }), h);
});

/**
 * A theme's own templates are a different layout of the same instrument: every action, editable field,
 * data hook and class the code looks for in the base part has to be there too.
 */
test("theme templates keep every hook of the base part they replace", () => {
  const hooks = html => {
    const found = new Set();
    for (const [, attr, value] of html.matchAll(/\b(data-(?:action|resource|delta|track|tile|menu|check|tooltip-html|tooltip-class))="([^"{]*)/g)) {
      found.add(attr === "data-action" || attr === "data-resource" ? `${attr}=${value}` : attr);
    }
    for (const cls of ["lfd-badge", "lfd-tab", "lfd-header-main", "lfd-mech-name", "lfd-datalink", "lfd-oc", "lfd-oc-cost",
      "lfd-oc-ladder", "lfd-track", "lfd-pip", "lfd-odds", "lfd-editor", "lfd-hp-fill", "lfd-os-fill", "lfd-seg", "lfd-dz-line",
      "lfd-plate", "lfd-body", "lfd-checks"]) {
      if (new RegExp(`class="[^"]*\\b${cls}\\b`).test(html)) found.add(`.${cls}`);
    }
    return found;
  };
  let checked = 0;
  for (const theme of getThemes()) {
    for (const [part, template] of Object.entries(theme.templates)) {
      const path = `${ROOT}${template.replace(`${TEMPLATE_ROOT}/`, "templates/")}`;
      assert.ok(existsSync(path), `${theme.id} ${part}: ${template}`);
      const base = hooks(readFileSync(`${ROOT}templates/panel/${part}.hbs`, "utf8"));
      const own = hooks(read(template));
      const missing = [...base].filter(h => !own.has(h));
      assert.deepEqual(missing, [], `${theme.id} ${part} is missing ${missing.join(", ")}`);
      checked++;
    }
  }
  assert.ok(checked >= 11, "IPS-N and SSC bring four templates each, HORUS three");
});

test("the Overcharge view says where the next cost sits on the ladder (dial themes point at it)", () => {
  const t = {
    heat: { value: 1, max: 4, dangerAt: 2, inDanger: false, over: false },
    overcharge: { rungs: ["+1", "+1d3", "+1d6", "+1d6+4"], index: 2, cost: "+1d6", odds: null },
  };
  const view = buildHeat(t);
  assert.equal(view.oc.index, 2);
  assert.equal(view.oc.count, 4);
  assert.deepEqual(view.oc.rungs.map(r => (r.current ? "C" : r.spent ? "s" : "-")).join(""), "ssC-");
});
