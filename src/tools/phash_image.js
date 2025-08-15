// src/tools/phash_image.js
// Perceptual hash (pHash) using DCT (32x32 → 8x8 low-frequency).
// Accepts: base64 data URI or http(s) URL. Returns { hash, algo, size }.
// NOTE: Requires `sharp` for image decoding. Install: npm i sharp

import fetch from 'node-fetch';
import sharp from 'sharp';

/**
 * Compute perceptual hash for an image (DCT-based pHash).
 * @param {{ image: string }} params - base64 data URI or http(s) URL
 * @returns {Promise<{ hash: string, algo: 'phash-dct-8x8', size: number }>} hex string (64 bits)
 */
export async function phashImage({ image }) {
  if (!image || typeof image !== 'string') throw new Error('phash_image: `image` must be a string');
  const buf = await loadImageBuffer(image);
  const pixels = await toGrayscaleMatrix(buf, 32, 32); // 32x32 luminance matrix
  const dct = dct2(pixels); // 32x32 DCT
  // Take top-left 8x8 block, skipping [0][0] (DC)
  const block = [];
  for (let y = 0; y < 8; y++) {
    const row = [];
    for (let x = 0; x < 8; x++) {
      row.push(dct[y][x]);
    }
    block.push(row);
  }
  // Compute median excluding the DC component at (0,0)
  const coeffs = block.flat();
  const values = coeffs.slice(1); // drop DC
  const median = medianOf(values);
  // Build 64-bit hash: bit = 1 if coeff > median else 0
  let bits = '';
  for (let i = 0; i < coeffs.length; i++) {
    const v = i === 0 ? coeffs[i] : coeffs[i];
    bits += (v > median ? '1' : '0');
  }
  // Convert binary string to hex (16 hex chars)
  const hex = binToHex(bits);
  return { hash: hex, algo: 'phash-dct-8x8', size: 64 };
}

// --- Helpers ---

function isDataUri(s) {
  return /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(s);
}

async function loadImageBuffer(src) {
  if (isDataUri(src)) {
    const b64 = src.split(',')[1] || '';
    return Buffer.from(b64, 'base64');
  }
  // http/https URL
  let url;
  try { url = new URL(src); } catch { throw new Error('phash_image: invalid image URL'); }
  if (!/^https?:$/.test(url.protocol)) throw new Error('phash_image: only http/https URLs supported');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`phash_image: failed to fetch (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

async function toGrayscaleMatrix(buf, width, height) {
  // sharp → grayscale → resize → raw pixels (1 channel)
  const raw = await sharp(buf)
    .grayscale()
    .resize(width, height, { fit: 'fill' })
    .raw()
    .toBuffer();
  // raw is Uint8, length = width*height
  const mat = [];
  for (let y = 0; y < height; y++) {
    const row = new Array(width);
    for (let x = 0; x < width; x++) {
      row[x] = raw[y * width + x];
    }
    mat.push(row);
  }
  return mat;
}

// 2D DCT (Type-II) for an N x N matrix
function dct2(matrix) {
  const N = matrix.length;
  // Precompute cosines
  const cos = Array.from({ length: N }, () => new Array(N));
  for (let u = 0; u < N; u++) {
    for (let x = 0; x < N; x++) {
      cos[u][x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N));
    }
  }
  const out = Array.from({ length: N }, () => new Array(N).fill(0));
  const c = (k) => (k === 0 ? Math.SQRT1_2 : 1); // normalization factor
  for (let v = 0; v < N; v++) {
    for (let u = 0; u < N; u++) {
      let sum = 0;
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          sum += matrix[y][x] * cos[u][x] * cos[v][y];
        }
      }
      out[v][u] = (2 / N) * c(u) * c(v) * sum;
    }
  }
  return out;
}

function medianOf(arr) {
  if (!arr.length) return 0;
  const a = arr.slice().sort((m, n) => m - n);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function binToHex(bits) {
  // Pad to multiple of 4
  const padded = bits.padEnd(Math.ceil(bits.length / 4) * 4, '0');
  let hex = '';
  for (let i = 0; i < padded.length; i += 4) {
    const nibble = parseInt(padded.slice(i, i + 4), 2);
    hex += nibble.toString(16);
  }
  // Ensure 16 hex chars for 64 bits
  return hex.slice(0, 16).padStart(16, '0');
}
