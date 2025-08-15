// src/tools/fetch_url.js
// JS-rendered page fetcher for Sentinel Scout
// - Uses Puppeteer to load the page, return rendered HTML + readable text
// - Optionally captures screenshots (full page + mobile viewport)
// Notes:
// * No credentialed/logged-in scraping. Public pages only.
// * Keep timeouts small; analysts can re-run if needed.

import puppeteer from 'puppeteer';

/**
 * @typedef {Object} FetchResult
 * @property {string} finalUrl
 * @property {number} status
 * @property {Record<string,string>} headers
 * @property {string} html
 * @property {string} text
 * @property {{dataUri: string, type: string, label: string}[]} screenshots
 * @property {string[]} warnings
 */

/**
 * Fetch and render a page with Puppeteer.
 * @param {Object} opts
 * @param {string} opts.url - http(s) URL to fetch
 * @param {boolean} [opts.screenshot=true] - capture screenshots
 * @param {number} [opts.timeoutMs=20000] - overall navigation timeout
 * @param {number} [opts.maxScreenshots=2] - number of screenshots to capture (1..2)
 * @returns {Promise<FetchResult>}
 */
export async function fetchUrl({
                                 url,
                                 screenshot = true,
                                 timeoutMs = 20000,
                                 maxScreenshots = 2,
                               }) {
  validateUrl(url);

  /** @type {import('puppeteer').Browser | null} */
  let browser = null;
  /** @type {import('puppeteer').Page | null} */
  let page = null;

  const warnings = [];
  let status = 0;
  let headers = {};
  let finalUrl = url;
  let html = '';
  let text = '';
  /** @type {{dataUri:string,type:string,label:string}[]} */
  const screenshots = [];

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-features=site-per-process',
      ],
    });
    page = await browser.newPage();

    // Identify as research/triage tool.
    await page.setUserAgent(
      `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ` +
      `(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 ` +
      `SentinelScout/0.1`
    );

    // Lightly block beacons/analytics to reduce hangs.
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const rurl = req.url();
      const isBeacon =
        req.resourceType() === 'ping' ||
        /(?:doubleclick|googletagmanager|google-analytics|segment|mixpanel|facebook\.com\/tr|linkedin\.com\/insight)/i.test(
          rurl
        );
      if (isBeacon) return req.abort();
      return req.continue();
    });

    const resp = await page.goto(url, {
      waitUntil: ['domcontentloaded', 'networkidle2'],
      timeout: timeoutMs,
    });
    if (resp) {
      status = resp.status();
      headers = resp.headers();
      finalUrl = resp.url() || finalUrl;
    } else {
      warnings.push('No HTTP response (possible redirect to non-HTTP).');
    }

    // Allow dynamic content to settle briefly.
    await page.waitForTimeout(500);

    html = await page.content();
    // Human-visible text approximation
    text = await page.evaluate(() => document.body?.innerText ?? '');

    if (screenshot) {
      // Full page (desktop)
      const shot1 = await page.screenshot({ fullPage: true, type: 'png' });
      screenshots.push({
        dataUri: `data:image/png;base64,${shot1.toString('base64')}`,
        type: 'image/png',
        label: 'fullpage',
      });

      if (maxScreenshots > 1) {
        // Mobile above-the-fold
        await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
        await page.waitForTimeout(150);
        const shot2 = await page.screenshot({ fullPage: false, type: 'png' });
        screenshots.push({
          dataUri: `data:image/png;base64,${shot2.toString('base64')}`,
          type: 'image/png',
          label: 'mobile',
        });
      }
    }
  } catch (err) {
    warnings.push(`Fetch error: ${err?.message || String(err)}`);
  } finally {
    try { if (page) await page.close(); } catch {}
    try { if (browser) await browser.close(); } catch {}
  }

  return {
    finalUrl,
    status,
    headers,
    html,
    text,
    screenshots,
    warnings,
  };
}

/** Basic URL validation (http/https only) */
function validateUrl(u) {
  let parsed;
  try {
    parsed = new URL(u);
  } catch {
    throw new Error(`Invalid URL: ${u}`);
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error(`Unsupported protocol (${parsed.protocol}). Only http/https are allowed.`);
  }
}
