

// healthcheck.js — basic sanity check for Sentinel Scout

import 'dotenv/config';
import os from 'node:os';
import process from 'node:process';

export default async function healthcheck() {
  const checks = [];

  // Check Node version
  const nodeOk = parseInt(process.versions.node.split('.')[0], 10) >= 22;
  checks.push({ name: 'node_version', ok: nodeOk, value: process.version });

  // Check API key presence
  const apiKeyOk = Boolean(process.env.OPENAI_API_KEY);
  checks.push({ name: 'openai_api_key', ok: apiKeyOk, value: apiKeyOk ? 'present' : 'missing' });

  // Host info
  checks.push({ name: 'hostname', ok: true, value: os.hostname() });
  checks.push({ name: 'platform', ok: true, value: `${os.type()} ${os.release()}` });

  const allOk = checks.every(c => c.ok);

  const summary = {
    ok: allOk,
    uptime_s: Math.round(process.uptime()),
    checks
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!allOk) {
    process.exitCode = 1;
  }
}

// If run directly via `node src/healthcheck.js`
if (import.meta.url === `file://${process.argv[1]}`) {
  healthcheck().catch(err => {
    console.error('Healthcheck failed:', err);
    process.exit(1);
  });
}
