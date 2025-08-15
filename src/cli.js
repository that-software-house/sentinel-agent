

// cli.js — run Sentinel Scout triage from the command line
// Usage:
//   node src/cli.js --text "Some tip text" --url "https://example.com" --image "./file.jpg"
//   node src/cli.js --file "./tip.json"

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import minimist from 'minimist';
import { runTriage } from './agents/sentinel.agent.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const argv = minimist(process.argv.slice(2));
  let tip_text = argv.text || '';
  let urls = [].concat(argv.url || []).filter(Boolean);
  let images = [].concat(argv.image || []).filter(Boolean);
  let geo_hint = argv.geo || '';
  let lang_hint = argv.lang || '';
  let sensitivity = argv.sensitivity || 'high';

  // If file flag provided, read JSON
  if (argv.file) {
    const filePath = path.resolve(__dirname, argv.file);
    if (!fs.existsSync(filePath)) {
      console.error(`Tip file not found: ${filePath}`);
      process.exit(1);
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    tip_text = data.tip_text || tip_text;
    urls = data.urls || urls;
    images = data.images || images;
    geo_hint = data.geo_hint || geo_hint;
    lang_hint = data.lang_hint || lang_hint;
    sensitivity = data.sensitivity || sensitivity;
  }

  if (!tip_text && urls.length === 0 && images.length === 0) {
    console.error('No input provided. Use --text, --url, --image, or --file.');
    process.exit(1);
  }

  try {
    const brief = await runTriage({ tip_text, urls, images, geo_hint, lang_hint, sensitivity });
    console.log(JSON.stringify(brief, null, 2));
  } catch (err) {
    console.error('Triage failed:', err);
    process.exit(1);
  }
}

main();
