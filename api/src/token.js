/* Signed, short-lived tokens (HMAC-SHA256 via WebCrypto).
 *
 * Format:  base64url(JSON payload) "." base64url(HMAC-SHA256(secret, first part))
 *
 * The payload is readable by anyone who holds the token (it is signed, not
 * encrypted), so it never carries anything secret. Every token has a `typ`, so a
 * session token can never be replayed as an OAuth-state cookie or the other way
 * round, and an `exp` (seconds since the epoch) that verify() enforces.
 *
 * crypto.subtle.verify() compares the MAC in constant time.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64urlEncode(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(str) {
  if (typeof str !== 'string' || !/^[A-Za-z0-9_-]*$/.test(str)) throw new Error('bad base64url');
  const pad = str.length % 4 === 2 ? '==' : str.length % 4 === 3 ? '=' : str.length % 4 === 1 ? null : '';
  if (pad === null) throw new Error('bad base64url');
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomToken(nBytes = 32) {
  return b64urlEncode(crypto.getRandomValues(new Uint8Array(nBytes)));
}

/* RFC 7636 S256 code challenge for a PKCE verifier. */
export async function pkceChallenge(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(verifier));
  return b64urlEncode(new Uint8Array(digest));
}

const keyCache = new Map();
async function hmacKey(secret) {
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new Error('SESSION_SECRET is missing or shorter than 32 characters');
  }
  let k = keyCache.get(secret);
  if (!k) {
    k = crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    keyCache.set(secret, k);
  }
  return k;
}

/** Signs a payload object. The payload must already contain `typ` and `exp`. */
export async function signToken(payload, secret) {
  if (!payload || typeof payload.typ !== 'string' || !Number.isFinite(payload.exp)) {
    throw new Error('token payload needs typ and exp');
  }
  const body = b64urlEncode(enc.encode(JSON.stringify(payload)));
  const mac = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body));
  return body + '.' + b64urlEncode(new Uint8Array(mac));
}

/**
 * Verifies a token. Returns {ok:true, payload} or {ok:false, reason}.
 * reason is one of: malformed, signature, type, expired.
 * `nowSec` is injectable for tests.
 */
export async function verifyToken(token, secret, { typ, nowSec = Math.floor(Date.now() / 1000) } = {}) {
  if (typeof token !== 'string' || token.length > 4096) return { ok: false, reason: 'malformed' };
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'malformed' };
  let mac;
  try { mac = b64urlDecode(parts[1]); } catch { return { ok: false, reason: 'malformed' }; }
  const good = await crypto.subtle.verify('HMAC', await hmacKey(secret), mac, enc.encode(parts[0]));
  if (!good) return { ok: false, reason: 'signature' };
  let payload;
  try { payload = JSON.parse(dec.decode(b64urlDecode(parts[0]))); } catch { return { ok: false, reason: 'malformed' }; }
  if (!payload || typeof payload !== 'object') return { ok: false, reason: 'malformed' };
  if (typ && payload.typ !== typ) return { ok: false, reason: 'type' };
  if (!Number.isFinite(payload.exp) || payload.exp <= nowSec) return { ok: false, reason: 'expired' };
  return { ok: true, payload };
}
