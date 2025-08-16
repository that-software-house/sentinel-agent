// src/agents/sentinel.agent.js
// Sentinel Scout — Counter‑Trafficking Lead Triage Agent (OpenAI Agents SDK)
// Node >= 22, ESM

import { Agent, Runner, run, tool } from '@openai/agents';
import { z as zod } from 'zod';

// --- Provider config ---
if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is required');
}

const MODEL = process.env.OPENAI_MODEL || 'o4-mini';

// --- Local tool implementations (to be created in src/tools/) ---
import { fetchUrl } from '../tools/fetch_url.js';
import { ocrImage } from '../tools/ocr_image.js';
import { extractEntities } from '../tools/extract_entities.js';
import { phashImage } from '../tools/phash_image.js';
import { redactContent } from '../tools/redact.js';

// ---------- Zod Schemas ----------
const TriageInput = zod.object({
  tip_text: zod.string().default(''),
  // Avoid JSON Schema string format (e.g., 'uri') which Structured Outputs does not support
  urls: zod.array(zod.string()).default([]),
  images: zod.array(zod.string()).default([]), // base64 data URLs or external URLs
  geo_hint: zod.string().default(''),
  lang_hint: zod.string().default(''),
  sensitivity: zod.enum(['normal', 'high']).default('high')
});

const ChainItem = zod.object({
  artifact_id: zod.string(),
  sha256: zod.string(),
  stored_at: zod.string()
});

const LeadBrief = zod.object({
  risk_score: zod.number().min(0).max(100),
  rationale: zod.string(),
  confidence: zod.number().min(0).max(1).default(0.5),
  signals: zod.array(zod.string()).default([]),
  entities: zod.object({
    phones: zod.array(zod.string()).default([]),
    emails: zod.array(zod.string()).default([]),
    handles: zod.array(zod.string()).default([]),
    names: zod.array(zod.string()).default([])
  }).default({ phones: [], emails: [], handles: [], names: [] }),
  timeline: zod.array(zod.object({ when: zod.string(), event: zod.string() })).default([]),
  locations: zod.array(zod.object({ place: zod.string(), confidence: zod.number().min(0).max(1).default(0.5) })).default([]),
  duplicates: zod.array(zod.string()).default([]),
  recommended_actions: zod.array(zod.string()).default([]),
  chain_of_custody: zod.array(ChainItem).default([]),
  view_shareable: zod.object({
    summary: zod.string(),
    redactions: zod.array(zod.string()).default([])
  })
});

// ---------- Tool wrappers (Agents SDK) ----------
const tFetchUrl = tool({
  name: 'fetch_url',
  description: 'Fetch and render a web page (JS-enabled). Returns { html, text, screenshots[] }.',
  // Use plain string (no .url()) to avoid `format: uri` in JSON Schema
  parameters: zod.object({ url: zod.string() }),
  async execute({ url }) {
    return await fetchUrl({ url });
  }
});

const tOcrImage = tool({
  name: 'ocr_image',
  description: 'OCR for screenshots or images. Input: base64 data URL or external URL. Returns { text }.',
  parameters: zod.object({ image: zod.string() }),
  async execute({ image }) {
    return await ocrImage({ image });
  }
});

const tExtractEntities = tool({
  name: 'extract_entities',
  description: 'Extract phones, emails, handles, potential names from text.',
  parameters: zod.object({ text: zod.string() }),
  async execute({ text }) {
    return await extractEntities({ text });
  }
});

const tPhashImage = tool({
  name: 'phash_image',
  description: 'Compute perceptual hash for an image to help detect duplicates.',
  parameters: zod.object({ image: zod.string() }),
  async execute({ image }) {
    return await phashImage({ image });
  }
});

const tRedact = tool({
  name: 'redact',
  description: 'Redact PII from text/entities. Returns { safe_text, safe_entities }.',
  parameters: zod.object({
    text: zod.string().default(''),
    entities: zod.object({
      phones: zod.array(zod.string()).default([]),
      emails: zod.array(zod.string()).default([]),
      handles: zod.array(zod.string()).default([]),
      names: zod.array(zod.string()).default([])
    }).default({ phones: [], emails: [], handles: [], names: [] }),
    mode: zod.enum(['normal', 'strict']).default('strict')
  }),
  async execute({ text, entities, mode }) {
    return await redactContent({ text, entities, mode });
  }
});

// ---------- Agent Definition ----------
export const sentinelAgent = new Agent({
  name: 'Sentinel Scout',
  model: MODEL,
  instructions: [
    'You triage potential child exploitation leads for Sentinel Foundation.',
    'Be evidence-driven and cautious. Avoid false positives and speculation.',
    'Never suggest vigilantism or direct contact. Defer to law enforcement.',
    'Always include: risk_score (0-100), rationale, confidence (0-1), signals, entities, timeline, locations, duplicates, recommended_actions, chain_of_custody.',
    'Produce two views: ANALYST (full) and SHAREABLE (PII-redacted) as view_shareable.',
    'Redact PII by default for shareable output. Use the redact tool for masking.',
    'If the input language is not English, summarize in English but preserve key original phrases in quotes.'
  ].join('\n'),
  tools: [tFetchUrl, tOcrImage, tExtractEntities, tPhashImage, tRedact],
  outputType: LeadBrief
});

export const runner = new Runner();

// ---------- Public API ----------
/**
 * runTriage — orchestrates a full triage run from raw input.
 * @param {object} rawInput { tip_text, urls[], images[], geo_hint, lang_hint, sensitivity }
 * @returns {Promise<LeadBrief>}
 */
export async function runTriage(rawInput) {
  const input = TriageInput.parse(rawInput || {});

  const systemPrimer = [
    'INPUT:',
    `tip_text: ${input.tip_text}`,
    `urls: ${JSON.stringify(input.urls)}`,
    `images: ${Array.isArray(input.images) ? input.images.map((_, i) => `image_${i+1}`).join(', ') : ''}`,
    `geo_hint: ${input.geo_hint}`,
    `lang_hint: ${input.lang_hint}`,
    `sensitivity: ${input.sensitivity}`,
    '',
    'TASK:',
    'Use tools to fetch/ocr/extract and build a Lead Intelligence Brief that fits the schema.',
    'If images are provided, consider pHash to detect duplicates. Build a concise timeline and locations list.'
  ].join('\n');

  const result = await run(sentinelAgent, systemPrimer, {
    context: {},
    maxTurns: 10
  });

  return result.finalOutput;
}
