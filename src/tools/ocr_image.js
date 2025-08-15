

// src/tools/ocr_image.js
// OCR for images/screenshots using tesseract.js with light preprocessing via sharp.
// - Accepts base64 data URIs or http/https URLs.
// - Returns { text, warnings, language }
// Note: install deps: `npm i tesseract.js sharp`

import fetch from 'node-fetch';
import sharp from 'sharp';
import Tesseract from 'tesseract.js';

/**
 * Run OCR on an image.
 * @param {{ image: string, lang?: string }} params
 *  - image: base64 data URI or http(s) URL
 *  - lang: tesseract language code (e.g., 'eng', 'spa'); defaults to 'eng'
 * @returns {Promise<{ text: string, warnings: string[], language: string }>}
 */
export async function ocrImage({ image, lang = 'eng' }) {
  if (!image || typeof image !== 'string') throw new Error('ocr_image: `image` must be a string');
  const warnings = [];

  const buf = await loadImageBuffer(image);
  // Preprocess: grayscale, normalize, gentle sharpening; cap size to keep OCR fast
  const pre = await preprocess(buf, { maxSide: 1600 }).catch((e) => {
    warnings.push(`preprocess_failed: ${e?.message || e}`);
    return buf; // fallback to original buffer
  });

  // Use built-in single-call recognize; avoids manual worker lifecycle for MVP
  let result;
  try {
    result = await Tesseract.recognize(pre, lang, {
      // quiet logger; customize if you want progress
      logger: () => {},
    });
  } catch (e) {
    warnings.push(`ocr_failed: ${e?.message || e}`);
    return { text: '', warnings, language: lang };
  }

  const text = (result?.data?.text || '').trim();
  return { text, warnings, language: lang };
}

// ----------------- helpers -----------------

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
  try { url = new URL(src); } catch { throw new Error('ocr_image: invalid image URL'); }
  if (!/^https?:$/.test(url.protocol)) throw new Error('ocr_image: only http/https URLs supported');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ocr_image: failed to fetch (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Basic preprocessing to improve OCR fidelity without bloating runtime.
 * - Convert to grayscale
 * - Resize so the longest side is `maxSide` (keep aspect)
 * - Normalize & mild sharpen
 */
async function preprocess(buf, { maxSide = 1600 } = {}) {
  const meta = await sharp(buf).metadata();
  let w = meta.width || 0;
  let h = meta.height || 0;
  if (!w || !h) {
    // decode minimal to determine dims
    const p = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    // raw input doesn't include width/height; fallback to default pipeline
    return sharp(buf)
      .grayscale()
      .normalize()
      .toBuffer();
  }
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const width = Math.max(1, Math.round(w * scale));
  const height = Math.max(1, Math.round(h * scale));

  return await sharp(buf)
    .resize(width, height, { fit: 'inside', withoutEnlargement: true })
    .grayscale()
    .normalize() // stretch contrast
    .sharpen(1)
    .toBuffer();
}
