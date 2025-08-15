

// src/tools/redact.js
// PII redaction utility for Sentinel Scout.
// Redacts emails, phones, URLs, and social handles by default.
// If `mode === 'strict'`, also redacts provided personal names from entities.
// Returns { safe_text, safe_entities } without storing originals.

/**
 * @typedef {{ phones?: string[], emails?: string[], handles?: string[], names?: string[] }} Entities
 * @typedef {{ safe_text: string, safe_entities: Entities }} RedactResult
 */

const EMAIL_RE = /([a-z0-9._%+\-]+)@([a-z0-9.\-]+\.[a-z]{2,})/gi;
// E.164 or common formatted numbers: +1 212-555-1234, (212) 555 1234, 0044 20 7946 0321, 212.555.1234
const PHONE_RE = /(?:(?:\+|00)\d{1,3}[\s\-\.]*)?(?:\(\d{2,4}\)[\s\-\.]*)?\d{2,4}(?:[\s\-\.]?\d){5,10}/g;
const URL_RE = /https?:\/\/[\w.-]+(?:\/[\w\-._~:/?#\[\]@!$&'()*+,;=%]*)?/gi;
const HANDLE_RE = /(^|\s)@([A-Za-z0-9_\.\-]{3,30})\b/g;

function maskEmail(_, local, domain) {
  const keep = Math.min(2, local.length);
  const maskedLocal = local.slice(0, keep) + '*'.repeat(Math.max(0, local.length - keep));
  return `${maskedLocal}@${domain}`;
}

function onlyDigits(s) { return (s || '').replace(/\D+/g, ''); }
function formatMaskedPhone(raw) {
  const digits = onlyDigits(raw);
  if (!digits) return '[REDACTED_PHONE]';
  const tail = digits.slice(-2);
  return `[REDACTED_PHONE:••${tail}]`;
}

function maskHandle(match, prefix, user) {
  const keep = Math.min(1, user.length);
  const masked = user.slice(0, keep) + '*'.repeat(Math.max(0, user.length - keep));
  return `${prefix}@${masked}`;
}

function maskUrl() { return '[REDACTED_URL]'; }

function maskName(n) {
  const parts = String(n).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '[REDACTED_NAME]';
  const masked = parts.map(p => (p.length ? p[0] + '***' : '')).join(' ');
  return masked;
}

function redactText(text, { mode = 'strict', names = [] } = {}) {
  if (!text) return '';
  let out = String(text);
  // order matters to avoid creating new matches accidentally
  out = out.replace(URL_RE, maskUrl);
  out = out.replace(EMAIL_RE, maskEmail);
  out = out.replace(PHONE_RE, (m) => formatMaskedPhone(m));
  out = out.replace(HANDLE_RE, maskHandle);

  if (mode === 'strict' && Array.isArray(names) && names.length) {
    // Redact provided names exactly (escape regex), word-boundary where possible
    for (const n of names) {
      if (!n) continue;
      const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`\\b${esc}\\b`, 'gi');
      out = out.replace(re, maskName(n));
    }
  }
  return out;
}

function uniq(arr) { return Array.from(new Set((arr || []).filter(Boolean))); }

function redactEntities(entities = {}, mode = 'strict') {
  const safe = {};
  if (Array.isArray(entities.emails)) {
    safe.emails = uniq(entities.emails).map(e => String(e).replace(EMAIL_RE, maskEmail));
  }
  if (Array.isArray(entities.phones)) {
    safe.phones = uniq(entities.phones).map(formatMaskedPhone);
  }
  if (Array.isArray(entities.handles)) {
    safe.handles = uniq(entities.handles).map(h => {
      const m = /^@?([A-Za-z0-9_\.\-]{1,64})$/.exec(String(h).trim());
      if (!m) return '@***';
      const user = m[1];
      const keep = Math.min(1, user.length);
      return '@' + user.slice(0, keep) + '*'.repeat(Math.max(0, user.length - keep));
    });
  }
  if (mode === 'strict' && Array.isArray(entities.names)) {
    safe.names = uniq(entities.names).map(maskName);
  }
  return safe;
}

/**
 * Redact PII from free text and provided entities.
 * @param {{ text?: string, entities?: Entities, mode?: 'normal'|'strict' }} input
 * @returns {Promise<RedactResult>}
 */
export async function redactContent({ text = '', entities = {}, mode = 'strict' } = {}) {
  const safe_entities = redactEntities(entities, mode);
  const safe_text = redactText(text, { mode, names: entities?.names || [] });
  return { safe_text, safe_entities };
}
