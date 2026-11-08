// Draws the Tabinator icon and writes icons/icon-{16,32,48,128}.png.
// No dependencies: shapes are rasterized with 4x4 supersampling and written
// as PNGs with Node's zlib. Run: node scripts/make-icons.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SIZES = [16, 32, 48, 128];
const INDIGO = [79, 70, 229];
const WHITE = [255, 255, 255];
const PINK = [236, 72, 153];

// Rounded rectangle in a 128x128 design space. `r` is [tl, tr, br, bl].
function roundRect(x0, y0, x1, y1, r) {
  const [tl, tr, br, bl] = Array.isArray(r) ? r : [r, r, r, r];
  return (x, y) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    const corner = (cx, cy, rad) => (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad;
    if (x < x0 + tl && y < y0 + tl) return corner(x0 + tl, y0 + tl, tl);
    if (x > x1 - tr && y < y0 + tr) return corner(x1 - tr, y0 + tr, tr);
    if (x > x1 - br && y > y1 - br) return corner(x1 - br, y1 - br, br);
    if (x < x0 + bl && y > y1 - bl) return corner(x0 + bl, y1 - bl, bl);
    return true;
  };
}

// Layers, painted in order.
const LAYERS = [
  { color: INDIGO, shape: roundRect(4, 4, 124, 124, 28) },
  // A browser tab: rounded top, sitting on a baseline.
  { color: WHITE, shape: roundRect(26, 34, 90, 100, [14, 14, 0, 0]) },
  { color: WHITE, shape: roundRect(16, 92, 112, 102, 3) },
  // A name being typed: a text bar and a cursor.
  { color: INDIGO, shape: roundRect(38, 60, 66, 70, 4) },
  { color: PINK, shape: roundRect(72, 50, 79, 80, 3) },
];

function render(size) {
  const SS = 4;
  const px = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let pxi = 0; pxi < size; pxi++) {
      let r = 0, g = 0, b = 0, a = 0; // premultiplied
      for (const { color, shape } of LAYERS) {
        let hits = 0;
        for (let sy = 0; sy < SS; sy++) {
          for (let sx = 0; sx < SS; sx++) {
            const x = ((pxi + (sx + 0.5) / SS) / size) * 128;
            const y = ((py + (sy + 0.5) / SS) / size) * 128;
            if (shape(x, y)) hits++;
          }
        }
        const cov = hits / (SS * SS);
        if (!cov) continue;
        r = color[0] * cov + r * (1 - cov);
        g = color[1] * cov + g * (1 - cov);
        b = color[2] * cov + b * (1 - cov);
        a = cov + a * (1 - cov);
      }
      const i = (py * size + pxi) * 4;
      px[i] = a ? Math.round(r / a) : 0;
      px[i + 1] = a ? Math.round(g / a) : 0;
      px[i + 2] = a ? Math.round(b / a) : 0;
      px[i + 3] = Math.round(a * 255);
    }
  }
  return encodePng(size, px);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // no filter
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "icons");
mkdirSync(outDir, { recursive: true });
for (const size of SIZES) {
  const file = join(outDir, `icon-${size}.png`);
  writeFileSync(file, render(size));
  console.log(file);
}
