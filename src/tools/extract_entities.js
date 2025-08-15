

// src/tools/extract_entities.js
// Lightweight entity extraction for Sentinel Scout (dependency-free)
// Extracts emails, phones, social handles, and conservative person-name candidates.
// Returns normalized, de-duplicated arrays.

/**
 * @typedef {{ phones?: string[], emails?: string[], handles?: string[], names?: string[] }} Entities
 */

// EMAIL — permissive but safe for common cases
const EMAIL_RE = /\b([a-z0-9._%+\-]+)@([a-z0-9\-]+(?:\.[a-z0-9\-]+)+)\b/gi;

// PHONE — E.164 or common formats, keeps at least ~7 digits with optional country code
// Examples: +1 212-555-1234, (212) 555 1234, 0044 20 7946 0321, 212.555.1234
const PHONE_RE = /(?:(?:\+|00)\d{1,3}[\s\-\.]*)?(?:\(\d{2,4}\)[\s\-\.]*)?\d{2,4}(?:[\s\-\.]?\d){5,10}/g;

// HANDLE — @username (loose; avoid emails by ensuring a leading boundary or whitespace)
const HANDLE_RE = /(^|\s)@([A-Za-z0-9_\.\-]{3,30})\b/g;

// Simple word tokenizer to support name heuristics
const WORD_RE = /[\p{L}][\p{L}'\-]{0,}\.?/gu;

function uniq(arr) { return Array.from(new Set((arr || []).filter(Boolean))); }
function onlyDigits(s) { return (s || '').replace(/\D+/g, ''); }

function normalizeEmail(m) {
  const local = (m[1] || '').toLowerCase();
  const domain = (m[2] || '').toLowerCase();
  return `${local}@${domain}`;
}

function plausiblyPhone(raw) {
  const digits = onlyDigits(raw);
  // Reject if < 7 digits (too short) or > 16 (unlikely phone, may be ID)
  if (digits.length < 7 || digits.length > 16) return null;
  // Normalize to E.164-ish where possible; keep prefix '+' if present
  const hasPlus = /^\s*\+/.test(raw);
  return (hasPlus ? '+' : '') + digits;
}

function normalizeHandle(prefix, user) {
  // Avoid email local parts (already captured by EMAIL_RE)
  const u = String(user || '').replace(/\.+$/,'');
  if (u.length < 3) return null;
  return '@' + u;
}

/**
 * Conservative name candidate extraction
 * - Looks for sequences of 2-3 capitalized words (e.g., "Jane Doe", "John van Dam")
 * - Skips lines with emails/handles/URLs to reduce false positives
 * - Filters common stop-words and very short tokens
 */
function extractNameCandidates(text, max = 20) {
  const out = [];
  if (!text) return out;

  // Quick skip if the text is entirely uppercase or lowercase (names less likely)
  const lines = String(text).split(/\n|\r/).slice(0, 500);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Skip lines dominated by IDs/links/handles
    if (/https?:\/\//i.test(trimmed) || /@\w/.test(trimmed)) continue;

    // Tokenize to words and scan for capitalized sequences
    const words = trimmed.match(WORD_RE) || [];
    for (let i = 0; i < words.length; i++) {
      const w1 = words[i];
      const w2 = words[i + 1];
      const w3 = words[i + 2];

      const isCap = (w) => /^(\p{Lu}[\p{L}'\-]{1,})$/u.test(w);
      const isStop = (w) => /^(?:and|or|the|of|for|in|on|to|from|with|by|de|da|von|van|bin|al)$/i.test(w);

      if (w1 && w2 && isCap(w1) && isCap(w2) && !isStop(w1) && !isStop(w2)) {
        const candidate2 = `${w1} ${w2}`;
        out.push(candidate2);
        if (w3 && isCap(w3) && !isStop(w3)) {
          out.push(`${candidate2} ${w3}`);
        }
        i += 1; // advance to reduce overlaps
      }
    }
    if (out.length >= max) break;
  }
  // De-duplicate but preserve insertion order
  return uniq(out).slice(0, max);
}

/**
 * Extract entities from raw text.
 * @param {{ text: string }} input
 * @returns {Promise<Entities>} entities
 */
export async function extractEntities({ text }) {
  const raw = String(text || '');
  const emails = [];
  const phones = [];
  const handles = [];

  // Emails
  for (const m of raw.matchAll(EMAIL_RE)) {
    emails.push(normalizeEmail(m));
  }

  // Phones (validate plausibility)
  for (const m of raw.matchAll(PHONE_RE)) {
    const normalized = plausiblyPhone(m[0]);
    if (normalized) phones.push(normalized);
  }

  // Handles (avoid matching within emails)
  const redactedEmails = raw.replace(EMAIL_RE, ' ');
  for (const m of redactedEmails.matchAll(HANDLE_RE)) {
    const h = normalizeHandle(m[1], m[2]);
    if (h) handles.push(h);
  }

  // Name candidates (very conservative)
  const names = extractNameCandidates(raw);

  return {
    emails: uniq(emails),
    phones: uniq(phones),
    handles: uniq(handles),
    names: uniq(names)
  };
}
