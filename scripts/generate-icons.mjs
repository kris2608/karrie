import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

function crc32(buffer) {
  let crc = ~0;
  for (const value of buffer) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(width, height, pixels) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function setPixel(pixels, size, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const offset = (y * size + x) * 4;
  pixels[offset] = color[0];
  pixels[offset + 1] = color[1];
  pixels[offset + 2] = color[2];
  pixels[offset + 3] = 255;
}

function fillCircle(pixels, size, cx, cy, radius, color) {
  const r2 = radius * radius;
  for (let y = Math.floor(cy - radius); y <= cy + radius; y += 1) {
    for (let x = Math.floor(cx - radius); x <= cx + radius; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) setPixel(pixels, size, x, y, color);
    }
  }
}

function fillRoundRect(pixels, size, x, y, width, height, radius, color) {
  for (let py = Math.floor(y); py < y + height; py += 1) {
    for (let px = Math.floor(x); px < x + width; px += 1) {
      const dx = px < x + radius ? x + radius - px : px > x + width - radius ? px - (x + width - radius) : 0;
      const dy = py < y + radius ? y + radius - py : py > y + height - radius ? py - (y + height - radius) : 0;
      if (dx * dx + dy * dy <= radius * radius) setPixel(pixels, size, px, py, color);
    }
  }
}

function drawIcon(size, inset = 0) {
  const pixels = Buffer.alloc(size * size * 4);
  const teal = [20, 196, 184];
  const orange = [255, 140, 26];
  const ink = [36, 48, 56];
  const white = [255, 255, 255];
  const wheel = [14, 120, 116];
  const scale = (size - inset * 2) / size;
  const map = (value) => inset + value * scale;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) setPixel(pixels, size, x, y, teal);
  }
  fillRoundRect(pixels, size, map(size * 0.18), map(size * 0.32), size * 0.64 * scale, size * 0.36 * scale, size * 0.08 * scale, orange);
  fillRoundRect(pixels, size, map(size * 0.18), map(size * 0.32), size * 0.64 * scale, size * 0.05 * scale, size * 0.02 * scale, ink);
  fillCircle(pixels, size, map(size * 0.38), map(size * 0.48), size * 0.055 * scale, white);
  fillCircle(pixels, size, map(size * 0.58), map(size * 0.48), size * 0.055 * scale, white);
  fillCircle(pixels, size, map(size * 0.4), map(size * 0.49), size * 0.025 * scale, ink);
  fillCircle(pixels, size, map(size * 0.6), map(size * 0.49), size * 0.025 * scale, ink);
  fillCircle(pixels, size, map(size * 0.34), map(size * 0.74), size * 0.07 * scale, wheel);
  fillCircle(pixels, size, map(size * 0.66), map(size * 0.74), size * 0.07 * scale, wheel);
  fillCircle(pixels, size, map(size * 0.34), map(size * 0.74), size * 0.045 * scale, ink);
  fillCircle(pixels, size, map(size * 0.66), map(size * 0.74), size * 0.045 * scale, ink);
  fillCircle(pixels, size, map(size * 0.34), map(size * 0.74), size * 0.02 * scale, white);
  fillCircle(pixels, size, map(size * 0.66), map(size * 0.74), size * 0.02 * scale, white);
  return png(size, size, pixels);
}

fs.mkdirSync(root, { recursive: true });
fs.writeFileSync(path.join(root, "pwa-192x192.png"), drawIcon(192));
fs.writeFileSync(path.join(root, "apple-touch-icon.png"), drawIcon(180));
fs.writeFileSync(path.join(root, "pwa-512x512.png"), drawIcon(512));
fs.writeFileSync(path.join(root, "pwa-512x512-maskable.png"), drawIcon(512, 48));
