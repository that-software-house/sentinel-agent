// netlify/functions/triage.js  (CJS wrapper that loads ESM agent via file URL)
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadAgent() {
  // In Netlify, included_files are copied under the function bundle root (/__dirname)
  // When we include "src/**", it appears at `${__dirname}/src/...`
  const modPath = path.resolve(__dirname, 'src/agents/sentinel.agent.mjs');
  const fileUrl = pathToFileURL(modPath);
  return await import(fileUrl.href);
}

export default async (req, context) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response(JSON.stringify({ ok: true }), { status: 204 });
    }
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), { status: 405 });
    }

    const body = await req.json().catch(() => ({}));

    const {
      tip_text = '',
      urls = [],
      images = [],
      geo_hint = '',
      lang_hint = '',
      sensitivity = 'high'
    } = body;

    const { runTriage } = await loadAgent();
    const brief = await runTriage({ tip_text, urls, images, geo_hint, lang_hint, sensitivity });
    return new Response(JSON.stringify({ ok: true, brief }), { status: 200 });
  } catch (err) {
    console.error('[netlify:triage:error]', err);
    return new Response(JSON.stringify({ ok: false, error: 'triage_failed', message: err?.message || 'Unknown error' }), { status: 500 });
  }
};

