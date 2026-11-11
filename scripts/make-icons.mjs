// Draws the app icons (a football on a green tile) with a tiny software
// rasteriser, so there are no image tools or npm packages to install.
//
//   npm run icons   -> icons/icon-192.png, icon-512.png, icon-maskable-512.png, favicon.svg
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const OUT = fileURLToPath(new URL('../icons/', import.meta.url));

const GREEN_TOP = [22, 163, 74];
const GREEN_BOTTOM = [10, 110, 60];
const WHITE = [255, 255, 255];
const INK = [17, 24, 39];
const hex = (c) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/* ------------------------------------------------------------- the artwork
   The ball lives in a unit circle (y pointing down): a pentagon in the middle,
   a seam from each of its corners, and five patches cut off by the edge. */
const rad = (d) => (d * Math.PI) / 180;
const polar = (r, a) => [r * Math.cos(rad(a)), r * Math.sin(rad(a))];
const ANGLES = [0, 1, 2, 3, 4].map((k) => -90 + 72 * k);

const POLYGONS = [
  ANGLES.map((a) => polar(0.34, a)),
  ...ANGLES.map((a) => [polar(0.64, a), polar(0.8, a - 20), polar(1.2, a - 15), polar(1.2, a + 15), polar(0.8, a + 20)]),
];
const SEAMS = [
  ...ANGLES.map((a) => [polar(0.34, a), polar(0.64, a)]),
  ...ANGLES.map((a) => [polar(0.8, a + 20), polar(0.8, a + 52)]),
];
const SEAM_HALF_WIDTH = 0.04;
const RIM = 0.94; // the outline starts here

function inPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distToSegment(x, y, [[ax, ay], [bx, by]]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

/** Colour of the ball at a point inside the unit circle. */
function ballColour(x, y) {
  if (Math.hypot(x, y) > RIM) return INK;
  if (POLYGONS.some((p) => inPolygon(x, y, p))) return INK;
  if (SEAMS.some((s) => distToSegment(x, y, s) < SEAM_HALF_WIDTH)) return INK;
  return WHITE;
}

/* --------------------------------------------------------------- rasterise */

/**
 * size:      pixels
 * ballScale: ball diameter as a fraction of the icon
 * corner:    corner radius as a fraction of the icon (0 = full-bleed square)
 */
function render(size, { ballScale, corner }) {
  const SS = 4; // 4x4 samples per pixel
  const rgba = Buffer.alloc(size * size * 4);
  const half = size / 2;
  const ballR = (size * ballScale) / 2;
  const cr = size * corner;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = px + (sx + 0.5) / SS;
          const y = py + (sy + 0.5) / SS;
          // rounded-square tile
          const ox = Math.max(Math.abs(x - half) - (half - cr), 0);
          const oy = Math.max(Math.abs(y - half) - (half - cr), 0);
          if (ox * ox + oy * oy > cr * cr) continue;
          const bx = (x - half) / ballR;
          const by = (y - half) / ballR;
          const t = y / size;
          const c =
            bx * bx + by * by <= 1
              ? ballColour(bx, by)
              : GREEN_TOP.map((top, i) => top + (GREEN_BOTTOM[i] - top) * t);
          r += c[0]; g += c[1]; b += c[2]; a += 1;
        }
      }
      const i = (py * size + px) * 4;
      if (a) {
        rgba[i] = Math.round(r / a);
        rgba[i + 1] = Math.round(g / a);
        rgba[i + 2] = Math.round(b / a);
        rgba[i + 3] = Math.round((a / (SS * SS)) * 255);
      }
    }
  }
  return encodePng(size, size, rgba);
}

/* --------------------------------------------------------------------- PNG */

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
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}
function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height); // each row is prefixed with filter type 0
  for (let y = 0; y < height; y++) rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* --------------------------------------------------------------------- SVG */

function favicon() {
  const c = 32;
  const R = 20;
  const pt = ([x, y]) => `${(c + x * R).toFixed(2)},${(c + y * R).toFixed(2)}`;
  const polygons = POLYGONS.map((p) => `<polygon points="${p.map(pt).join(' ')}"/>`).join('');
  const seams = SEAMS.map(([p, q]) => {
    const [x1, y1] = pt(p).split(',');
    const [x2, y2] = pt(q).split(',');
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hex(GREEN_TOP)}"/><stop offset="1" stop-color="${hex(GREEN_BOTTOM)}"/></linearGradient>
    <clipPath id="b"><circle cx="${c}" cy="${c}" r="${R}"/></clipPath>
  </defs>
  <rect width="64" height="64" rx="14" fill="url(#g)"/>
  <circle cx="${c}" cy="${c}" r="${R}" fill="${hex(WHITE)}"/>
  <g clip-path="url(#b)" fill="${hex(INK)}">${polygons}</g>
  <g clip-path="url(#b)" stroke="${hex(INK)}" stroke-width="${(2 * SEAM_HALF_WIDTH * R).toFixed(2)}" stroke-linecap="round">${seams}</g>
  <circle cx="${c}" cy="${c}" r="${(R * (1 + RIM)) / 2}" fill="none" stroke="${hex(INK)}" stroke-width="${(R * (1 - RIM)).toFixed(2)}"/>
</svg>
`;
}

/* -------------------------------------------------------------------- main */

mkdirSync(OUT, { recursive: true });
const files = {
  'icon-192.png': render(192, { ballScale: 0.64, corner: 0.22 }),
  'icon-512.png': render(512, { ballScale: 0.64, corner: 0.22 }),
  // Maskable: full-bleed, artwork inside the central "safe zone" Android may crop to.
  'icon-maskable-512.png': render(512, { ballScale: 0.5, corner: 0 }),
  'favicon.svg': favicon(),
};
for (const [name, data] of Object.entries(files)) {
  writeFileSync(OUT + name, data);
  console.log(`icons/${name}  ${(data.length / 1024).toFixed(1)} KB`);
}
