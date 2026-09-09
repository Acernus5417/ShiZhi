import fs from 'node:fs';
import path from 'node:path';

const root = path.join(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1'), '..');
const dir = path.join(root, 'build', 'icons');
const out = path.join(root, 'build', 'icon.ico');
const sizes = [16, 24, 32, 48, 64, 128, 256];

const images = sizes.map((size) => ({
  size,
  data: fs.readFileSync(path.join(dir, `icon${size}.png`))
}));

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);

let offset = 6 + 16 * images.length;
const entries = images.map((img) => {
  const entry = Buffer.alloc(16);
  entry[0] = img.size >= 256 ? 0 : img.size;
  entry[1] = img.size >= 256 ? 0 : img.size;
  entry[2] = 0;
  entry[3] = 0;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(img.data.length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += img.data.length;
  return entry;
});

fs.writeFileSync(out, Buffer.concat([header, ...entries, ...images.map((i) => i.data)]));

// 扩展用同款图标
const extIcons = path.join(root, 'extension', 'icons');
fs.mkdirSync(extIcons, { recursive: true });
for (const size of [48, 128]) {
  fs.copyFileSync(path.join(dir, `icon${size}.png`), path.join(extIcons, `icon${size}.png`));
}

console.log('ico ->', out, fs.statSync(out).size, 'bytes');
