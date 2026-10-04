// Builds dist/module.json + dist/lancer-flight-deck.zip: the files Foundry needs, nothing else.
// No dependencies; writes a standard zip with forward-slash paths (PowerShell 5.1's Compress-Archive
// writes backslashes, which break installs on Linux hosts such as The Forge).
import { deflateRawSync } from "node:zlib";
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const INCLUDE = ["module.json", "README.md", "CHANGELOG.md", "LICENSE", "lang", "src", "styles", "templates"];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = buf => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function walk(path) {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).sort().flatMap(name => walk(join(path, name)));
}

function dosTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

function zip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  const { time, day } = dosTime(new Date());
  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, "utf8");
    const packed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // made by
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + packed.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

const manifest = JSON.parse(readFileSync(join(ROOT, "module.json"), "utf8"));
// GitHub releases: the zip lives under the version's tag, so a version bump moves the download URL with it
if (manifest.url?.startsWith("https://github.com/")) {
  const download = `${manifest.url}/releases/download/v${manifest.version}/${manifest.id}.zip`;
  if (manifest.download !== download) {
    manifest.download = download;
    writeFileSync(join(ROOT, "module.json"), JSON.stringify(manifest, null, 2) + "\n");
    console.log(`module.json: download -> ${download}`);
  }
}
const files = INCLUDE.flatMap(entry => walk(join(ROOT, entry))).map(path => ({
  name: relative(ROOT, path).split(sep).join("/"),
  data: readFileSync(path),
}));
const missing = ["LICENSE", "CHANGELOG.md"].filter(f => !files.some(x => x.name === f));
const unset = ["url", "manifest", "download"].filter(k => !manifest[k]);

const dist = join(ROOT, "dist");
mkdirSync(dist, { recursive: true });
const archive = zip(files);
writeFileSync(join(dist, `${manifest.id}.zip`), archive);
writeFileSync(join(dist, "module.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`${manifest.id} v${manifest.version}: ${files.length} files, ${(archive.length / 1024).toFixed(1)} KB -> dist/${manifest.id}.zip`);
if (missing.length) console.warn(`  missing: ${missing.join(", ")}`);
if (unset.length) console.warn(`  module.json has no ${unset.join(", ")} yet (needed for install by manifest URL)`);
