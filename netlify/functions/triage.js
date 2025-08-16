// netlify/functions/triage.js (CommonJS wrapper + dynamic import of ESM)
const { Buffer } = require('node:buffer');

// Small helper so dynamic import works in CJS
async function loadAgent() {
  // Import the ESM module from your built dist/
  return await import('../../dist/src/agents/sentinel.agent.js');
}

module.exports.handler = async (event) => {
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

    // Dynamically import the ESM agent (works fine in Netlify functions)
    const { runTriage } = await loadAgent();
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
