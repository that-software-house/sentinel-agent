// netlify/functions/triage.js
import { Buffer } from 'node:buffer';
import { runTriage } from '../../dist/src/agents/sentinel.agent.js';

export const handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') {
      return ok({ ok: true }, 204);
    }

    if (event.httpMethod !== 'POST') {
      return json({ ok: false, error: 'method_not_allowed' }, 405);
    }

    const body = event.body
      ? JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body)
      : {};

    const {
      tip_text = '',
      urls = [],
      images = [],
      geo_hint = '',
      lang_hint = '',
      sensitivity = 'high'
    } = body;

    const brief = await runTriage({ tip_text, urls, images, geo_hint, lang_hint, sensitivity });
    return json({ ok: true, brief });
  } catch (err) {
    console.error('[netlify:triage:error]', err);
    return json({ ok: false, error: 'triage_failed', message: err?.message || 'Unknown error' }, 500);
  }
};

// --- helpers (CORS + JSON) ---
function headers(extra = {}) {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    ...extra
  };
}
function json(payload, statusCode = 200) {
  return { statusCode, headers: headers(), body: JSON.stringify(payload) };
}
function ok(payload, statusCode = 200) {
  return { statusCode, headers: headers(), body: JSON.stringify(payload) };
}
