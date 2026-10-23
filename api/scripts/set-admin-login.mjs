/* Sets the admin username + password for etsemiq-api.
 *
 *   cd api
 *   node scripts/set-admin-login.mjs
 *
 * Asks for the username and the password (typed twice, not shown), hashes the
 * password with PBKDF2 (src/adminpw.js) and uploads ADMIN_USERNAME and
 * ADMIN_PASSWORD_HASH as Worker secrets through wrangler. The password itself
 * is never written anywhere. Running it again with a new password signs every
 * existing admin session out.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../src/adminpw.js';

function ask(question, { hidden = false } = {}) {
  return new Promise(resolve => {
    const stdin = process.stdin;
    process.stdout.write(question);
    if (!hidden || !stdin.isTTY) {
      let buf = '';
      const onData = d => {
        buf += d.toString('utf8');
        const i = buf.search(/\r?\n/);
        if (i >= 0) { stdin.off('data', onData); stdin.pause(); resolve(buf.slice(0, i)); }
      };
      stdin.resume();
      stdin.on('data', onData);
      return;
    }
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    const onKey = d => {
      for (const ch of d.toString('utf8')) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false); stdin.off('data', onKey); stdin.pause();
          process.stdout.write('\n');
          return resolve(value);
        }
        if (ch === '\u0003') { process.stdout.write('\n'); process.exit(130); }
        if (ch === '\u007f' || ch === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        if (ch >= ' ') value += ch; /* nothing echoed, so the length is not shown either */
      }
    };
    stdin.on('data', onKey);
  });
}

/* Always run wrangler from api/, so the secrets land on etsemiq-api even when
   this script is started from the repo root (which has the Whop app's config). */
const API_DIR = fileURLToPath(new URL('..', import.meta.url));

function putSecret(name, value) {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const r = spawnSync(npx, ['wrangler', 'secret', 'put', name], {
    input: value, stdio: ['pipe', 'inherit', 'inherit'], shell: process.platform === 'win32', cwd: API_DIR,
  });
  if (r.status !== 0) { console.error(`\nUploading ${name} failed.`); process.exit(1); }
}

const username = (await ask('Admin username: ')).trim();
if (!username || username.length > 128) { console.error('A username of 1-128 characters is needed.'); process.exit(1); }
const pass1 = await ask('Admin password (hidden while you type): ', { hidden: true });
if (pass1.length < 10 || pass1.length > 256) { console.error('Use a password of 10-256 characters.'); process.exit(1); }
const pass2 = await ask('Repeat password (hidden): ', { hidden: true });
if (pass1 !== pass2) { console.error('The passwords do not match. Nothing was changed.'); process.exit(1); }

const hash = await hashPassword(pass1);
console.log('\nPassword hashed. Uploading to Cloudflare...');
putSecret('ADMIN_USERNAME', username);
putSecret('ADMIN_PASSWORD_HASH', hash);
console.log(`\nDone. Admin login: username "${username}" with the password you typed.`);
