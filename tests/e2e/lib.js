'use strict';
// Shared config for the browser e2e suites.
//   E2E_PAGE       page under test (default: <repo>/index.html, resolved from this file)
//   CHROMIUM_PATH  Chromium binary (else /opt/pw-browsers/chromium if present, else Playwright's default)
//   E2E_OUT        where screenshots go (default: <os tmpdir>/etsemiq-e2e)
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');

const PAGE = path.resolve(process.env.E2E_PAGE || path.resolve(__dirname, '..', '..', 'index.html'));
const URL = pathToFileURL(PAGE).href;
const OUT = process.env.E2E_OUT || path.join(os.tmpdir(), 'etsemiq-e2e');
fs.mkdirSync(OUT, { recursive: true });

function launchOpts() {
  const p = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : '');
  return p ? { executablePath: p } : {};
}
module.exports = { PAGE, URL, OUT, launchOpts, chromium: require('playwright').chromium };
