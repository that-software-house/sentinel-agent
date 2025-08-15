

// public/app.js — simple UI for Sentinel Scout
// Handles form submission, drag & drop, image -> dataURL conversion, and rendering results.

const form = document.getElementById('triage-form');
const statusEl = document.getElementById('status');
const resultSection = document.getElementById('result');
const rawEl = document.getElementById('raw');
const niceEl = document.getElementById('nice');
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('images');

// ---- Drag & Drop wiring (DataTransfer.files) ----
// prevent default browser behavior for the whole page
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
  window.addEventListener(evt, e => {
    e.preventDefault();
    e.stopPropagation();
  });
});

['dragenter', 'dragover'].forEach(ev => dropzone.addEventListener(ev, e => {
  e.preventDefault();
  dropzone.classList.add('drag');
}));
['dragleave', 'drop'].forEach(ev => dropzone.addEventListener(ev, e => {
  e.preventDefault();
  dropzone.classList.remove('drag');
}));

dropzone.addEventListener('drop', async (e) => {
  const files = [...(e.dataTransfer?.files || [])];
  if (files.length) await handleSubmit(files);
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  await handleSubmit([...(fileInput?.files || [])]);
});

function setStatus(msg) {
  statusEl.textContent = msg; // role="status" + aria-live="polite" in HTML
}

async function handleSubmit(files) {
  try {
    setStatus('Submitting…');
    const payload = await buildPayload(files);

    const res = await fetch('/api/triage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`API ${res.status}: ${text || res.statusText}`);
    }
    const json = await res.json();
    renderResult(json);
    setStatus('Done.');
  } catch (err) {
    console.error(err);
    setStatus('Error: ' + (err?.message || 'request failed'));
  }
}

async function buildPayload(files) {
  const tip_text = document.getElementById('tip_text').value.trim();
  const urlsText = document.getElementById('urls').value.trim();
  const geo_hint = document.getElementById('geo_hint').value.trim();
  const lang_hint = document.getElementById('lang_hint').value.trim() || 'en';
  const sensitivity = document.getElementById('sensitivity').value;

  const urls = urlsText
    .split(/\n|\r/)
    .map(s => s.trim())
    .filter(Boolean);

  const images = await filesToDataUrls(files || []);

  return { tip_text, urls, images, geo_hint, lang_hint, sensitivity };
}

// Convert File objects to base64 Data URLs
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('read failed'));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

async function filesToDataUrls(files) {
  const out = [];
  for (const f of files) {
    try {
      // lightweight size guard: 10 MB per image to avoid huge payloads
      if (typeof f.size === 'number' && f.size > 10 * 1024 * 1024) {
        setStatus(`Skipping ${f.name}: file too large (>10MB).`);
        continue;
      }
      const dataUrl = await fileToDataUrl(f);
      out.push(dataUrl);
    } catch (e) {
      console.warn('Failed to read image', f?.name, e);
    }
  }
  return out;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderResult(resp) {
  resultSection.hidden = false;
  rawEl.textContent = JSON.stringify(resp, null, 2);

  const brief = resp?.brief || {};
  const emails = (brief.entities?.emails || []).join(', ') || '—';
  const phones = (brief.entities?.phones || []).join(', ') || '—';
  const handles = (brief.entities?.handles || []).join(', ') || '—';
  const names = (brief.entities?.names || []).join(', ') || '—';

  const signals = (brief.signals || []).map(s => `<span class="pill">${escapeHtml(s)}</span>`).join(' ');
  const timeline = (brief.timeline || []).map(t => `<li>${escapeHtml(t.when)} — ${escapeHtml(t.event)}</li>`).join('');
  const locations = (brief.locations || []).map(l => `<li>${escapeHtml(l.place)} (${Math.round((l.confidence||0)*100)}%)</li>`).join('');
  const actions = (brief.recommended_actions || []).map(a => `<li>${escapeHtml(a)}</li>`).join('');

  niceEl.innerHTML = `
    <h3>Summary</h3>
    <p>${escapeHtml(brief.view_shareable?.summary || '')}</p>

    <h3>Risk</h3>
    <dl>
      <dt>Risk score</dt><dd>${brief.risk_score ?? '-'} / 100</dd>
      <dt>Confidence</dt><dd>${Math.round((brief.confidence ?? 0) * 100)}%</dd>
    </dl>

    <h3>Signals</h3>
    <p>${signals || '(none)'} </p>

    <h3>Entities</h3>
    <dl>
      <dt>Emails</dt><dd>${escapeHtml(emails)}</dd>
      <dt>Phones</dt><dd>${escapeHtml(phones)}</dd>
      <dt>Handles</dt><dd>${escapeHtml(handles)}</dd>
      <dt>Names</dt><dd>${escapeHtml(names)}</dd>
    </dl>

    <h3>Timeline</h3>
    <ol>${timeline}</ol>

    <h3>Locations</h3>
    <ul>${locations}</ul>

    <h3>Recommended actions</h3>
    <ul>${actions}</ul>
  `;
}
