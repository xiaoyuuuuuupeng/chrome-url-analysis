/**
 * Pure Node.js PNG icon generator (no dependencies)
 * Creates simple bookmark-themed icons for the Chrome extension
 */
const fs = require('fs');
const zlib = require('zlib');

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c;
  }
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeB = Buffer.from(type);
  const crcVal = Buffer.alloc(4);
  crcVal.writeUInt32BE(crc32(Buffer.concat([typeB, data])), 0);
  return Buffer.concat([len, typeB, data, crcVal]);
}

function makePNG(size) {
  // Render an RGBA pixel grid
  const pixels = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size, ny = y / size;
      const r = Math.round(size * 0.1);
      // Rounded rect mask
      const inRect = x >= r && x < size - r && y >= r && y < size - r;
      const corners = [
        [r, r], [size - r - 1, r], [r, size - r - 1], [size - r - 1, size - r - 1]
      ];
      let inCorner = false;
      for (const [cx, cy] of corners) {
        if (Math.hypot(x - cx, y - cy) <= r) { inCorner = true; break; }
      }
      const inside = inRect || inCorner ||
        (x >= r && x < size - r) || (y >= r && y < size - r);

      // Background gradient: indigo #6366f1 → purple #8b5cf6
      const t = (nx + ny) / 2;
      const bgR = Math.round(99 + (139 - 99) * t);
      const bgG = Math.round(102 + (92 - 102) * t);
      const bgB = Math.round(241 + (246 - 241) * t);

      // Bookmark shape (white)
      const bx = size * 0.25, bw = size * 0.5;
      const by = size * 0.15, bh = size * 0.72;
      const midX = bx + bw / 2;
      const notchY = by + bh * 0.68;
      let inBookmark = false;
      if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) {
        if (y < notchY) {
          inBookmark = true;
        } else {
          // Triangle notch at bottom
          const progress = (y - notchY) / (by + bh - notchY);
          const edgeX = progress * bw / 2;
          if (x >= bx + edgeX && x <= bx + bw - edgeX) inBookmark = true;
        }
      }

      if (!inside) {
        pixels.push(0, 0, 0, 0);
      } else if (inBookmark) {
        pixels.push(255, 255, 255, 255);
      } else {
        pixels.push(bgR, bgG, bgB, 255);
      }
    }
  }

  // Build PNG scanlines (filter byte 0 = None per row)
  const rowBytes = size * 4;
  const raw = Buffer.alloc(size * (rowBytes + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (rowBytes + 1)] = 0; // filter type None
    for (let x = 0; x < size; x++) {
      const pi = (y * size + x) * 4;
      const ri = y * (rowBytes + 1) + 1 + x * 4;
      raw[ri] = pixels[pi];
      raw[ri + 1] = pixels[pi + 1];
      raw[ri + 2] = pixels[pi + 2];
      raw[ri + 3] = pixels[pi + 3];
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 6;  // color type RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdrData),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

[16, 48, 128].forEach(size => {
  const buf = makePNG(size);
  fs.writeFileSync(`${__dirname}/icon${size}.png`, buf);
  console.log(`Generated icon${size}.png (${buf.length} bytes)`);
});
