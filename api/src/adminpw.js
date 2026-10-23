/* Admin username + password login.
 *
 * The password is never stored. ADMIN_PASSWORD_HASH holds
 *   pbkdf2-sha256$<iterations>$<base64url salt>$<base64url 32-byte hash>
 * made by scripts/set-admin-login.mjs. ADMIN_USERNAME is the expected username.
 * Both are Worker secrets, so neither is in this public repo.
 *
 * Workers caps PBKDF2 at 100,000 iterations, so that is the most we use.
 */
import { b64urlEncode, b64urlDecode } from './token.js';

const enc = new TextEncoder();
export const PBKDF2_ITERATIONS = 100000;
const HASH_BYTES = 32;

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, HASH_BYTES * 8);
  return new Uint8Array(bits);
}

export async function hashPassword(password, { iterations = PBKDF2_ITERATIONS, salt } = {}) {
  const s = salt || crypto.getRandomValues(new Uint8Array(16));
  const h = await pbkdf2(password, s, iterations);
  return `pbkdf2-sha256$${iterations}$${b64urlEncode(s)}$${b64urlEncode(h)}`;
}

export function parseHash(stored) {
  const m = /^pbkdf2-sha256\$(\d{1,7})\$([A-Za-z0-9_-]{16,64})\$([A-Za-z0-9_-]{40,64})$/.exec(String(stored || '').trim());
  if (!m) return null;
  const iterations = parseInt(m[1], 10);
  if (iterations < 10000 || iterations > PBKDF2_ITERATIONS) return null;
  try {
    const salt = b64urlDecode(m[2]);
    const hash = b64urlDecode(m[3]);
    if (hash.length !== HASH_BYTES) return null;
    return { iterations, salt, hash };
  } catch {
    return null;
  }
}

function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/* Hash both usernames so the comparison takes the same time whatever they are. */
async function sameText(a, b) {
  const [x, y] = await Promise.all([a, b].map(v => crypto.subtle.digest('SHA-256', enc.encode(v))));
  return sameBytes(new Uint8Array(x), new Uint8Array(y));
}

export function adminLoginConfigured(env) {
  return typeof env.ADMIN_USERNAME === 'string' && !!env.ADMIN_USERNAME.trim() && !!parseHash(env.ADMIN_PASSWORD_HASH);
}

/* The PBKDF2 work is always done, even for a wrong username, so the response
   time does not reveal whether the username was right. */
export async function checkAdminLogin(env, username, password) {
  const p = parseHash(env.ADMIN_PASSWORD_HASH);
  if (!p || typeof env.ADMIN_USERNAME !== 'string') return false;
  const userOk = await sameText(String(username), env.ADMIN_USERNAME.trim());
  const h = await pbkdf2(String(password), p.salt, p.iterations);
  return sameBytes(h, p.hash) && userOk;
}

/* A short fingerprint of the current hash, carried in admin sessions. Setting a
   new password changes it, which ends every existing admin session. */
export async function passwordVersion(env) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode('etsem-admin-pv:' + String(env.ADMIN_PASSWORD_HASH || '').trim()));
  return b64urlEncode(new Uint8Array(d)).slice(0, 16);
}
