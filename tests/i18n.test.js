import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const raw = readFileSync(join(root, "lang/en.json"), "utf8");

/** Every leaf key, dotted ("LFD.Npc.Title"). */
function leaves(obj, prefix = "", out = new Set()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") leaves(v, key, out);
    else out.add(key);
  }
  return out;
}

/** The source files that name text keys. */
function sources(dir) {
  const out = [];
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sources(path));
    else if (/\.(js|mjs|hbs)$/.test(entry.name)) out.push(path);
  }
  return out;
}

const keys = leaves(JSON.parse(raw));
const files = [...sources("src"), ...sources("templates")].map(path => ({ path, text: readFileSync(join(root, path), "utf8") }));

test("every text key the code and templates name exists in en.json", () => {
  const missing = [];
  for (const { path, text } of files) {
    // A quoted key; one that ends in "." or runs into ${...} is a prefix completed at runtime (checked below)
    for (const m of text.matchAll(/["'`](LFD\.[A-Za-z0-9_.]+)(["'`]|\$\{)/g)) {
      const key = m[1];
      if (key.endsWith(".") || m[2] === "${") continue;
      if (!keys.has(key)) missing.push(`${key} (${path})`);
    }
  }
  assert.deepEqual(missing, [], "a key the UI would show raw");
});

test("every key prefix completed at runtime has keys under it", () => {
  const empty = [];
  for (const { path, text } of files) {
    for (const m of text.matchAll(/["'`](LFD\.[A-Za-z0-9_.]*\.)(?:["'`]|\$\{)/g)) {
      if (![...keys].some(k => k.startsWith(m[1]))) empty.push(`${m[1]} (${path})`);
    }
  }
  assert.deepEqual(empty, []);
});

test("en.json names no key twice in one object (JSON.parse keeps only the last)", () => {
  // A small scan of the raw text: strings, and object nesting, each object's keys in a set
  const dupes = [];
  const stack = [];
  let expectKey = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === "{") {
      stack.push({ keys: new Set(), path: stack.at(-1)?.last ?? "" });
      expectKey = true;
    } else if (ch === "}") {
      stack.pop();
      expectKey = false;
    } else if (ch === "[") stack.push(null);
    else if (ch === "]") stack.pop();
    else if (ch === ",") expectKey = !!stack.at(-1);
    else if (ch === '"') {
      let j = i + 1;
      let s = "";
      while (raw[j] !== '"') {
        if (raw[j] === "\\") {
          s += raw[j + 1];
          j += 2;
        } else s += raw[j++];
      }
      if (expectKey && stack.at(-1)) {
        const obj = stack.at(-1);
        const full = obj.path ? `${obj.path}.${s}` : s;
        if (obj.keys.has(s)) dupes.push(full);
        obj.keys.add(s);
        obj.last = full;
        expectKey = false;
      }
      i = j;
    }
  }
  assert.deepEqual(dupes, []);
});
