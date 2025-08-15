

// server.js — Express API for Sentinel Scout (Agents SDK)
// Node >= 22, ESM (package.json: { "type": "module" })

import 'dotenv/config';
import express from 'express';
import os from 'node:os';
import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Agent runner (we'll create this file next)
// Exposes: runTriage(input) → returns the Lead Intelligence Brief JSON
import { runTriage } from './src/agents/sentinel.agent.js';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Basic middleware ---
app.use(express.json({ limit: '5mb' }));

// Serve demo UI from /public
app.use(express.static(path.join(__dirname, 'public')));

// Lightweight CORS for local dev (no extra dep)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allow = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ];
  if (origin && allow.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Trust proxy (useful behind ngrok/render)
app.set('trust proxy', true);

// --- Routes ---
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (_req, res) => {
  const ok = Boolean(process.env.OPENAI_API_KEY);
  res.json({
    ok,
    message: ok ? 'ok' : 'OPENAI_API_KEY missing',
    uptime_s: Math.round(process.uptime()),
    hostname: os.hostname(),
    node: process.version
  });
});

app.get('/version', (_req, res) => {
  res.json({
    name: 'sentinel-agent',
    version: process.env.npm_package_version || '0.1.0',
    model: process.env.OPENAI_MODEL || 'o4-mini'
  });
});

// Main endpoint: triage a tip into a Lead Intelligence Brief
app.post('/api/triage', async (req, res) => {
  const {
    tip_text = '',
    urls = [],
    images = [],
    geo_hint = '',
    lang_hint = '',
    sensitivity = 'high'
  } = req.body || {};

  try {
    const brief = await runTriage({ tip_text, urls, images, geo_hint, lang_hint, sensitivity });
    res.json({ ok: true, brief });
  } catch (err) {
    console.error('[triage:error]', err);
    res.status(500).json({ ok: false, error: 'triage_failed', message: err?.message || 'Unknown error' });
  }
});

// 404
app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'not_found', path: req.path });
});

// --- Startup / graceful shutdown ---
const PORT = Number(process.env.PORT || 8080);
const server = app.listen(PORT, () => {
  console.log(`\nSentinel Scout API listening on http://localhost:${PORT}`);
});

const shutdown = (sig) => () => {
  console.log(`\n${sig} received. Shutting down…`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
};
process.on('SIGINT', shutdown('SIGINT'));
process.on('SIGTERM', shutdown('SIGTERM'));
