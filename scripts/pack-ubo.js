// Packs the bundled uBlock Origin (extensions/ublock, ~640 small files) into one file,
// build/packed/ublock.pack. Installing and updating Drift then writes one file instead of
// hundreds (each one scanned by antivirus on Windows); Drift unpacks it into its data folder
// on first run, and again only when its contents change (see ensureUboDir in src/main.js).
// Format: 4-byte header length (UInt32LE), JSON header { hash, files: [[path, size], ...] },
// then the files' bytes back to back. Run by npm run dist / release.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const src = path.join(__dirname, '..', 'extensions', 'ublock');
const outDir = path.join(__dirname, '..', 'build', 'packed');
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.isFile()) files.push(p);
  }
})(src);

const hash = crypto.createHash('sha256');
const list = [], bodies = [];
for (const f of files) {
  const rel = path.relative(src, f).split(path.sep).join('/');
  const data = fs.readFileSync(f);
  hash.update(rel).update('\0').update(data);
  list.push([rel, data.length]); bodies.push(data);
}
const header = Buffer.from(JSON.stringify({ hash: hash.digest('hex').slice(0, 16), files: list }));
const len = Buffer.alloc(4); len.writeUInt32LE(header.length);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'ublock.pack'), Buffer.concat([len, header, ...bodies]));
console.log(`[pack-ubo] ${files.length} files → build/packed/ublock.pack`);
