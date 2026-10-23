/* etsemiq-api — "Sign in with Whop" and the PLUS / admin entitlement for etsemiq.com.
 *
 * Routes
 *   GET  /auth/login?return=<url>  start OAuth (state + PKCE), 302 to Whop
 *   GET  /auth/callback            finish OAuth, check access, 302 to <return>#whop_session=<token>
 *   GET  /me                       Authorization: Bearer <token> -> current entitlement
 *   POST /auth/logout              stateless; the client drops its token
 *   GET  /health                   liveness + "is it configured"
 *
 * Secrets (wrangler secret put): WHOP_CLIENT_ID, WHOP_CLIENT_SECRET, WHOP_API_KEY,
 *   WHOP_PRODUCT_ID, SESSION_SECRET, ADMIN_WHOP_USER_IDS (optional).
 * Vars (wrangler.jsonc): PUBLIC_URL, EXTRA_ORIGIN, WHOP_TEAM_IS_ADMIN,
 *   SESSION_TTL_SECONDS, REVERIFY_AFTER_SECONDS, WHOP_SCOPES.
 *
 * Setup guide: docs/WHOP-AUTH-SETUP.md
 */
import { signToken, verifyToken, randomToken, pkceChallenge } from './token.js';
import { corsHeaders, isAllowedOrigin, safeReturnUrl, decideEntitlement, isWhopUserId } from './policy.js';
import { WHOP, exchangeCode, getUserInfo, checkAccess, revokeToken, WhopError } from './whop.js';

const OAUTH_COOKIE = '__Host-etsem_oauth';
const OAUTH_TTL = 600; /* seconds the user has to finish the Whop consent screen */

const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};

function clampInt(v, dflt, min, max) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}

export function settings(env) {
  const ttl = clampInt(env.SESSION_TTL_SECONDS, 43200, 300, 7 * 86400);
  return {
    publicUrl: String(env.PUBLIC_URL || 'https://api.etsemiq.com').replace(/\/+$/, ''),
    ttl,
    reverifyAfter: clampInt(env.REVERIFY_AFTER_SECONDS, 3600, 0, ttl),
    scopes: String(env.WHOP_SCOPES || 'openid profile'),
  };
}

export function missingConfig(env) {
  const need = ['WHOP_CLIENT_ID', 'WHOP_CLIENT_SECRET', 'WHOP_API_KEY', 'WHOP_PRODUCT_ID', 'SESSION_SECRET'];
  const missing = need.filter(k => typeof env[k] !== 'string' || !env[k].trim());
  if (!missing.includes('SESSION_SECRET') && env.SESSION_SECRET.length < 32) missing.push('SESSION_SECRET(too short)');
  return missing;
}

function json(status, body, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...SECURITY_HEADERS, ...extra },
  });
}

function redirect(location, extra = {}) {
  return new Response(null, { status: 302, headers: { 'Location': location, ...SECURITY_HEADERS, ...extra } });
}

function readCookie(request, name) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i) === name) return part.slice(i + 1);
  }
  return null;
}

function oauthCookie(value, maxAge) {
  return `${OAUTH_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

/* A sliding check-access cache inside one isolate, so a burst of /me calls for
 * the same user (several tabs) costs one Whop request, not many. */
const accessCache = new Map();
const ACCESS_CACHE_MS = 60_000;

async function cachedCheckAccess(fetchImpl, env, userId, nowMs) {
  const hit = accessCache.get(userId);
  if (hit && nowMs - hit.at < ACCESS_CACHE_MS) return hit.access;
  const access = await checkAccess(fetchImpl, { userId, resourceId: env.WHOP_PRODUCT_ID.trim(), apiKey: env.WHOP_API_KEY.trim() });
  if (accessCache.size > 5000) accessCache.clear();
  accessCache.set(userId, { at: nowMs, access });
  return access;
}
export function _clearAccessCache() { accessCache.clear(); }

/* A session can be renewed by /me, but never past MAX_SESSION_SECONDS after the
   Whop sign-in that started it (`at`, copied forward, never reset). A leaked or
   shared token therefore dies within that window even while the membership lasts. */
const MAX_SESSION_SECONDS = 30 * 86400;

async function mintSession(env, { sub, username, ent, nowSec, authTime }) {
  const s = settings(env);
  const at = Number.isInteger(authTime) ? authTime : nowSec;
  const payload = {
    typ: 'sess',
    sub,
    u: typeof username === 'string' ? username.slice(0, 64) : '',
    plus: !!ent.plus,
    admin: !!ent.admin,
    at,
    iat: nowSec,
    vat: nowSec, /* when Whop last confirmed the entitlement */
    exp: Math.min(nowSec + s.ttl, at + MAX_SESSION_SECONDS),
  };
  return { token: await signToken(payload, env.SESSION_SECRET), payload };
}

function publicClaims(p) {
  return { user: { id: p.sub, username: p.u || '' }, plus: !!p.plus, admin: !!p.admin, iat: p.iat, verified_at: p.vat, exp: p.exp };
}

/* ---------------- routes ---------------- */

async function login(request, env) {
  const s = settings(env);
  const url = new URL(request.url);
  const ret = safeReturnUrl(url.searchParams.get('return'), env);
  const state = randomToken(32);
  const verifier = randomToken(48); /* 64 chars, within RFC 7636's 43..128 */
  const nowSec = Math.floor(Date.now() / 1000);
  const cookie = await signToken({ typ: 'oauth', st: state, v: verifier, r: ret, exp: nowSec + OAUTH_TTL }, env.SESSION_SECRET);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: env.WHOP_CLIENT_ID.trim(),
    redirect_uri: s.publicUrl + '/auth/callback',
    scope: s.scopes,
    state,
    nonce: randomToken(16),
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: 'S256',
  });
  return redirect(`${WHOP.authorize}?${params}`, { 'Set-Cookie': oauthCookie(cookie, OAUTH_TTL) });
}

async function callback(request, env, ctx, deps) {
  const s = settings(env);
  const url = new URL(request.url);
  const clear = { 'Set-Cookie': oauthCookie('', 0) };
  const fail = (ret, code) => redirect(`${ret}#whop_error=${code}`, clear);

  const raw = readCookie(request, OAUTH_COOKIE);
  const st = raw ? await verifyToken(raw, env.SESSION_SECRET, { typ: 'oauth' }) : { ok: false };
  if (!st.ok) return fail(safeReturnUrl(null, env), 'state');
  const ret = safeReturnUrl(st.payload.r, env); /* re-validated: never trust even our own cookie blindly */

  const qState = url.searchParams.get('state');
  if (typeof qState !== 'string' || qState !== st.payload.st) return fail(ret, 'state');
  if (url.searchParams.get('error')) return fail(ret, url.searchParams.get('error') === 'access_denied' ? 'denied' : 'oauth');
  const code = url.searchParams.get('code');
  if (typeof code !== 'string' || !code || code.length > 2048) return fail(ret, 'oauth');

  const clientId = env.WHOP_CLIENT_ID.trim();
  const clientSecret = env.WHOP_CLIENT_SECRET.trim();
  let tokens, info;
  try {
    tokens = await exchangeCode(deps.fetch, { code, verifier: st.payload.v, redirectUri: s.publicUrl + '/auth/callback', clientId, clientSecret });
    if (typeof tokens.access_token !== 'string') return fail(ret, 'oauth');
    info = await getUserInfo(deps.fetch, tokens.access_token);
  } catch (e) {
    return fail(ret, e instanceof WhopError && e.code === 'rejected' ? 'oauth' : 'unavailable');
  }
  if (tokens.refresh_token && ctx && ctx.waitUntil) {
    ctx.waitUntil(revokeToken(deps.fetch, { token: tokens.refresh_token, clientId, clientSecret }));
  }
  const sub = info && info.sub;
  if (!isWhopUserId(sub)) return fail(ret, 'oauth');

  const nowMs = deps.now();
  let access = null;
  try {
    access = await cachedCheckAccess(deps.fetch, env, sub, nowMs);
  } catch {
    access = null;
  }
  const ent = decideEntitlement({ userId: sub, access, env });
  /* If Whop could not answer and the id is not a configured admin, say so rather
     than minting a "free" session that would look like a lapsed membership. */
  if (access === null && !ent.admin) return fail(ret, 'unavailable');

  const { token } = await mintSession(env, { sub, username: info.preferred_username || info.name, ent, nowSec: Math.floor(nowMs / 1000) });
  return redirect(`${ret}#whop_session=${token}`, clear);
}

async function me(request, env, deps, cors) {
  const auth = request.headers.get('Authorization') || '';
  const m = /^Bearer\s+([A-Za-z0-9_.-]+)$/.exec(auth);
  if (!m) return json(401, { error: 'invalid' }, cors);
  const nowMs = deps.now();
  const nowSec = Math.floor(nowMs / 1000);
  const v = await verifyToken(m[1], env.SESSION_SECRET, { typ: 'sess', nowSec });
  if (!v.ok) return json(401, { error: v.reason === 'expired' ? 'expired' : 'invalid' }, cors);
  const p = v.payload;
  if (!isWhopUserId(p.sub)) return json(401, { error: 'invalid' }, cors);
  /* Tokens from before `at` existed count as signed in at their iat. */
  const authTime = Number.isInteger(p.at) ? p.at : p.iat;
  if (!Number.isInteger(authTime) || nowSec - authTime >= MAX_SESSION_SECONDS) return json(401, { error: 'expired' }, cors);

  const s = settings(env);
  if (nowSec - (p.vat || 0) < s.reverifyAfter) return json(200, publicClaims(p), cors);

  let access;
  try {
    access = await cachedCheckAccess(deps.fetch, env, p.sub, nowMs);
  } catch {
    /* Whop unreachable: say so. The client keeps its last signed answer only
       until that answer's own exp, then fails closed. */
    const ent = decideEntitlement({ userId: p.sub, access: null, env });
    if (ent.admin) {
      const { token, payload } = await mintSession(env, { sub: p.sub, username: p.u, ent, nowSec, authTime });
      return json(200, { ...publicClaims(payload), token }, cors);
    }
    return json(503, { error: 'unavailable' }, cors);
  }
  const ent = decideEntitlement({ userId: p.sub, access, env });
  const { token, payload } = await mintSession(env, { sub: p.sub, username: p.u, ent, nowSec, authTime });
  return json(200, { ...publicClaims(payload), token }, cors);
}

/* ---------------- entry ---------------- */

export function createHandler(deps = {}) {
  const d = {
    fetch: deps.fetch || ((...a) => fetch(...a)),
    now: deps.now || (() => Date.now()),
  };
  return async function handle(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin, env);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const method = request.method.toUpperCase();

    if (method === 'OPTIONS') {
      if (!isAllowedOrigin(origin, env)) return new Response(null, { status: 403, headers: { ...SECURITY_HEADERS, Vary: 'Origin' } });
      return new Response(null, { status: 204, headers: { ...SECURITY_HEADERS, ...cors } });
    }

    if (path === '/health' && method === 'GET') {
      return json(200, { ok: true, configured: missingConfig(env).length === 0 }, cors);
    }

    const routes = {
      'GET /auth/login': 1, 'GET /auth/callback': 1, 'GET /me': 1, 'POST /auth/logout': 1,
    };
    if (!routes[`${method} ${path}`]) return json(404, { error: 'not_found' }, cors);

    if (missingConfig(env).length) return json(503, { error: 'not_configured' }, cors);

    /* Optional Cloudflare rate-limiting binding (see docs/WHOP-AUTH-SETUP.md).
       Both routes can make the worker call Whop, which limits us per credential. */
    if (env.RATE_LIMITER && (path === '/auth/callback' || path === '/me')) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      try {
        const { success } = await env.RATE_LIMITER.limit({ key: `${path}:${ip}` });
        if (!success) return json(429, { error: 'rate_limited' }, cors);
      } catch { /* a limiter outage must not take sign-in down */ }
    }

    try {
      if (path === '/auth/login') return await login(request, env);
      if (path === '/auth/callback') return await callback(request, env, ctx, d);
      if (path === '/me') return await me(request, env, d, cors);
      if (path === '/auth/logout') {
        /* Sessions are stateless signed tokens; logging out means the client
           forgets its token. Rotating SESSION_SECRET ends every session. */
        return new Response(null, { status: 204, headers: { ...SECURITY_HEADERS, ...cors, 'Set-Cookie': oauthCookie('', 0) } });
      }
    } catch {
      return json(500, { error: 'internal' }, cors);
    }
    return json(404, { error: 'not_found' }, cors);
  };
}

const handle = createHandler();
export default { fetch: (request, env, ctx) => handle(request, env, ctx) };
