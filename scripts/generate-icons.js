import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createPNG(width, height, drawFn) {
  // RGBA buffer
  const buffer = Buffer.alloc(width * height * 4);

  // Set pixel helper
  function setPixel(x, y, r, g, b, a) {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const idx = (y * width + x) * 4;
    buffer[idx] = r;
    buffer[idx + 1] = g;
    buffer[idx + 2] = b;
    buffer[idx + 3] = a;
  }

  drawFn(setPixel, width, height);

  // Build raw uncompressed scanlines with filter type 0 (None)
  const rowSize = width * 4 + 1;
  const scanlines = Buffer.alloc(height * rowSize);
  for (let y = 0; y < height; y++) {
    scanlines[y * rowSize] = 0; // Filter 0
    buffer.copy(scanlines, y * rowSize + 1, y * width * 4, (y + 1) * width * 4);
  }

  const deflated = zlib.deflateSync(scanlines);

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // 8-bit depth
  ihdrData.writeUInt8(6, 9); // RGBA color type
  ihdrData.writeUInt8(0, 10); // Compression
  ihdrData.writeUInt8(0, 11); // Filter
  ihdrData.writeUInt8(0, 12); // Interlace

  const ihdr = makeChunk('IHDR', ihdrData);
  const idat = makeChunk('IDAT', deflated);
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function makeChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([length, typeBuf, data, crcBuf]);
}

// CRC32 table
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Generate icon graphic: modern indigo/violet rounded square with snipping crosshairs / "T" symbol
function drawIcon(setPixel, w, h) {
  const radius = Math.floor(w * 0.22);
  const primaryR = 79, primaryG = 70, primaryB = 229; // Modern Indigo (#4F46E5)
  const accentR = 255, accentG = 255, accentB = 255; // White

  // Draw rounded rect background
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let inside = true;
      if (x < radius && y < radius) {
        if ((x - radius) ** 2 + (y - radius) ** 2 > radius ** 2) inside = false;
      } else if (x >= w - radius && y < radius) {
        if ((x - (w - radius)) ** 2 + (y - radius) ** 2 > radius ** 2) inside = false;
      } else if (x < radius && y >= h - radius) {
        if ((x - radius) ** 2 + (y - (h - radius)) ** 2 > radius ** 2) inside = false;
      } else if (x >= w - radius && y >= h - radius) {
        if ((x - (w - radius)) ** 2 + (y - (h - radius)) ** 2 > radius ** 2) inside = false;
      }

      if (inside) {
        // Subtle vertical gradient
        const factor = 1 - (y / h) * 0.2;
        setPixel(x, y, Math.round(primaryR * factor), Math.round(primaryG * factor), Math.round(primaryB * factor), 255);
      }
    }
  }

  // Draw "T" letter or Snipping corners
  const pad = Math.floor(w * 0.25);
  const thick = Math.max(1, Math.floor(w * 0.1));

  // T top horizontal bar
  const tTop = Math.floor(h * 0.28);
  const tBot = Math.floor(h * 0.72);
  for (let y = tTop; y < tTop + thick; y++) {
    for (let x = pad; x < w - pad; x++) {
      setPixel(x, y, accentR, accentG, accentB, 255);
    }
  }
  // T vertical stem
  const stemLeft = Math.floor(w / 2 - thick / 2);
  for (let y = tTop; y < tBot; y++) {
    for (let x = stemLeft; x < stemLeft + thick; x++) {
      setPixel(x, y, accentR, accentG, accentB, 255);
    }
  }
}

const outDir = path.resolve('public', 'icons');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

[16, 32, 48, 128].forEach((size) => {
  const png = createPNG(size, size, drawIcon);
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), png);
  console.log(`Generated icon-${size}.png (${size}x${size})`);
});

