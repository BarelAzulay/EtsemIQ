/* End-to-end tests of the router with Whop mocked out. */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, _clearAccessCache } from '../src/index.js';
import { signToken, verifyToken, pkceChallenge } from '../src/token.js';

const SECRET = 'worker-test-secret-0123456789-abcdefghijklmnopqrstuv';
const ENV = {
  WHOP_CLIENT_ID: 'app_TESTCLIENT',
  WHOP_CLIENT_SECRET: 'client-secret-value',
  WHOP_API_KEY: 'api-key-value',
  WHOP_PRODUCT_ID: 'prod_TESTPRODUCT',
  SESSION_SECRET: SECRET,
  ADMIN_WHOP_USER_IDS: 'user_OWNER',
  PUBLIC_URL: 'https://api.etsemiq.com',
  WHOP_TEAM_IS_ADMIN: 'true',
  SESSION_TTL_SECONDS: '43200',
  REVERIFY_AFTER_SECONDS: '3600',
};

/* A fake Whop. `access[userId]` is what check-access returns; `down` makes every call fail. */
function fakeWhop({ user = 'user_CUST', access = {}, down = false } = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (down) throw new TypeError('network down');
    const u = new URL(url);
    if (u.pathname === '/oauth/token') {
      const b = JSON.parse(init.body);
      if (b.code !== 'GOODCODE' || !b.code_verifier || b.client_secret !== ENV.WHOP_CLIENT_SECRET) {
        return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
      }
      return Response.json({ access_token: 'at_123', refresh_token: 'rt_123', token_type: 'Bearer', expires_in: 3600 });
    }
    if (u.pathname === '/oauth/userinfo') {
      assert.equal(init.headers.Authorization, 'Bearer at_123');
      return Response.json({ sub: user, preferred_username: 'tester' });
    }
    if (u.pathname === '/oauth/revoke') return new Response('{}', { status: 200 });
    const m = /^\/api\/v1\/users\/([^/]+)\/access\/([^/]+)$/.exec(u.pathname);
    if (m) {
      assert.equal(init.headers.Authorization, 'Bearer ' + ENV.WHOP_API_KEY);
      assert.equal(m[2], ENV.WHOP_PRODUCT_ID);
      return Response.json(access[decodeURIComponent(m[1])] || { has_access: false, access_level: 'no_access' });
    }
    return new Response('nope', { status: 404 });
  };
  return { fetch, calls };
}

const ctx = { waitUntil: p => p };
beforeEach(() => _clearAccessCache());

async function startLogin(handle, ret = 'https://etsemiq.com/?x=1') {
  const res = await handle(new Request('https://api.etsemiq.com/auth/login?return=' + encodeURIComponent(ret)), ENV, ctx);
  assert.equal(res.status, 302);
  const loc = new URL(res.headers.get('Location'));
  const cookie = res.headers.get('Set-Cookie').split(';')[0];
  return { loc, cookie, setCookie: res.headers.get('Set-Cookie') };
}

test('/auth/login redirects to Whop with state, PKCE S256 and the registered redirect_uri', async () => {
  const handle = createHandler(fakeWhop());
  const { loc, cookie, setCookie } = await startLogin(handle);
  assert.equal(loc.origin + loc.pathname, 'https://api.whop.com/oauth/authorize');
  assert.equal(loc.searchParams.get('response_type'), 'code');
  assert.equal(loc.searchParams.get('client_id'), 'app_TESTCLIENT');
  assert.equal(loc.searchParams.get('redirect_uri'), 'https://api.etsemiq.com/auth/callback');
  assert.equal(loc.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(loc.searchParams.get('scope'), 'openid profile');
  assert.match(setCookie, /HttpOnly/); assert.match(setCookie, /Secure/); assert.match(setCookie, /SameSite=Lax/);
  /* The cookie holds the verifier whose hash is the challenge we sent. */
  const v = await verifyToken(cookie.split('=')[1], SECRET, { typ: 'oauth' });
  assert.equal(v.ok, true);
  assert.equal(v.payload.st, loc.searchParams.get('state'));
  assert.equal(await pkceChallenge(v.payload.v), loc.searchParams.get('code_challenge'));
  assert.equal(v.payload.r, 'https://etsemiq.com/?x=1');
});

test('/auth/login with a foreign return URL falls back to etsemiq.com', async () => {
  const handle = createHandler(fakeWhop());
  const { cookie } = await startLogin(handle, 'https://evil.example/steal');
  const v = await verifyToken(cookie.split('=')[1], SECRET, { typ: 'oauth' });
  assert.equal(v.payload.r, 'https://etsemiq.com/');
});

async function callback(handle, { cookie, state, code = 'GOODCODE' }) {
  const u = new URL('https://api.etsemiq.com/auth/callback');
  if (state !== undefined) u.searchParams.set('state', state);
  if (code) u.searchParams.set('code', code);
  const headers = cookie ? { Cookie: cookie } : {};
  return handle(new Request(u, { headers }), ENV, ctx);
}

test('callback: customer gets a plus session in the URL fragment', async () => {
  const w = fakeWhop({ user: 'user_CUST', access: { user_CUST: { has_access: true, access_level: 'customer' } } });
  const handle = createHandler(w);
  const { loc, cookie } = await startLogin(handle);
  const res = await callback(handle, { cookie, state: loc.searchParams.get('state') });
  assert.equal(res.status, 302);
  const to = res.headers.get('Location');
  assert.match(to, /^https:\/\/etsemiq\.com\/\?x=1#whop_session=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.match(res.headers.get('Set-Cookie'), /Max-Age=0/);
  assert.equal(res.headers.get('Referrer-Policy'), 'no-referrer');
  const v = await verifyToken(to.split('#whop_session=')[1], SECRET, { typ: 'sess' });
  assert.equal(v.ok, true);
  assert.equal(v.payload.sub, 'user_CUST');
  assert.equal(v.payload.plus, true);
  assert.equal(v.payload.admin, false);
  assert.ok(v.payload.exp - v.payload.iat === 43200);
  /* The token exchange sent the PKCE verifier and the client secret. */
  const tok = w.calls.find(c => c.url.endsWith('/oauth/token'));
  const body = JSON.parse(tok.init.body);
  assert.equal(body.grant_type, 'authorization_code');
  assert.equal(body.redirect_uri, 'https://api.etsemiq.com/auth/callback');
  assert.ok(body.code_verifier.length >= 43);
  /* and the refresh token was revoked because we never keep it */
  assert.ok(w.calls.some(c => c.url.endsWith('/oauth/revoke')));
});

test('callback: non-member gets a free session (plus false)', async () => {
  const handle = createHandler(fakeWhop({ user: 'user_FREE' }));
  const { loc, cookie } = await startLogin(handle);
  const res = await callback(handle, { cookie, state: loc.searchParams.get('state') });
  const v = await verifyToken(res.headers.get('Location').split('#whop_session=')[1], SECRET, { typ: 'sess' });
  assert.deepEqual([v.payload.plus, v.payload.admin], [false, false]);
});

test('callback: owner id from ADMIN_WHOP_USER_IDS is admin without paying', async () => {
  const handle = createHandler(fakeWhop({ user: 'user_OWNER' }));
  const { loc, cookie } = await startLogin(handle);
  const res = await callback(handle, { cookie, state: loc.searchParams.get('state') });
  const v = await verifyToken(res.headers.get('Location').split('#whop_session=')[1], SECRET, { typ: 'sess' });
  assert.deepEqual([v.payload.plus, v.payload.admin], [true, true]);
});

test('callback: Whop team member (access_level admin) is admin', async () => {
  const handle = createHandler(fakeWhop({ user: 'user_TEAM', access: { user_TEAM: { has_access: true, access_level: 'admin' } } }));
  const { loc, cookie } = await startLogin(handle);
  const res = await callback(handle, { cookie, state: loc.searchParams.get('state') });
  const v = await verifyToken(res.headers.get('Location').split('#whop_session=')[1], SECRET, { typ: 'sess' });
  assert.deepEqual([v.payload.plus, v.payload.admin], [true, true]);
});

test('callback: state mismatch, missing cookie, or forged cookie is refused (CSRF / code injection)', async () => {
  const handle = createHandler(fakeWhop({ user: 'user_OWNER' }));
  const { loc, cookie } = await startLogin(handle);
  let res = await callback(handle, { cookie, state: 'attacker-state' });
  assert.match(res.headers.get('Location'), /#whop_error=state$/);
  res = await callback(handle, { cookie: null, state: loc.searchParams.get('state') });
  assert.equal(res.headers.get('Location'), 'https://etsemiq.com/#whop_error=state');
  const forged = await signToken({ typ: 'oauth', st: 's', v: 'v', r: 'https://evil.example/', exp: 9e9 }, 'a-different-secret-0123456789-abcdefghijk');
  res = await callback(handle, { cookie: '__Host-etsem_oauth=' + forged, state: 's' });
  assert.equal(res.headers.get('Location'), 'https://etsemiq.com/#whop_error=state');
});

test('callback: a session token cannot stand in for the oauth cookie', async () => {
  const handle = createHandler(fakeWhop());
  const sess = await signToken({ typ: 'sess', st: 's', sub: 'user_X', exp: 9e9 }, SECRET);
  const res = await callback(handle, { cookie: '__Host-etsem_oauth=' + sess, state: 's' });
  assert.match(res.headers.get('Location'), /#whop_error=state$/);
});

test('callback: bad code and Whop outage produce errors, never a session', async () => {
  let handle = createHandler(fakeWhop());
  let { loc, cookie } = await startLogin(handle);
  let res = await callback(handle, { cookie, state: loc.searchParams.get('state'), code: 'BADCODE' });
  assert.match(res.headers.get('Location'), /#whop_error=oauth$/);
  handle = createHandler(fakeWhop({ down: true }));
  ({ loc, cookie } = await startLogin(handle));
  res = await callback(handle, { cookie, state: loc.searchParams.get('state') });
  assert.match(res.headers.get('Location'), /#whop_error=unavailable$/);
  assert.doesNotMatch(res.headers.get('Location'), /whop_session/);
});

test('callback: user denied consent', async () => {
  const handle = createHandler(fakeWhop());
  const { loc, cookie } = await startLogin(handle);
  const u = new URL('https://api.etsemiq.com/auth/callback');
  u.searchParams.set('state', loc.searchParams.get('state'));
  u.searchParams.set('error', 'access_denied');
  const res = await handle(new Request(u, { headers: { Cookie: cookie } }), ENV, ctx);
  assert.match(res.headers.get('Location'), /#whop_error=denied$/);
});

/* ---- /me ---- */

const NOW_MS = 1_800_000_000_000;
const nowSec = NOW_MS / 1000;
const mkSess = (over = {}) => signToken({ typ: 'sess', sub: 'user_CUST', u: 'tester', plus: true, admin: false, iat: nowSec - 60, vat: nowSec - 60, exp: nowSec + 3600, ...over }, SECRET);
const meReq = (tok, origin = 'https://etsemiq.com') =>
  new Request('https://api.etsemiq.com/me', { headers: { Authorization: 'Bearer ' + tok, Origin: origin } });

test('/me: fresh token answers from the token without calling Whop', async () => {
  const w = fakeWhop();
  const handle = createHandler({ ...w, now: () => NOW_MS });
  const res = await handle(meReq(await mkSess()), ENV, ctx);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://etsemiq.com');
  const body = await res.json();
  assert.deepEqual([body.plus, body.admin, body.user.id], [true, false, 'user_CUST']);
  assert.equal(body.token, undefined);
  assert.equal(w.calls.length, 0);
});

test('/me: token older than REVERIFY_AFTER is re-checked; a cancelled member loses plus', async () => {
  const w = fakeWhop({ access: { user_CUST: { has_access: false, access_level: 'no_access' } } });
  const handle = createHandler({ ...w, now: () => NOW_MS });
  const res = await handle(meReq(await mkSess({ vat: nowSec - 4000 })), ENV, ctx);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.plus, false);
  assert.ok(body.token);
  assert.equal(w.calls.length, 1);
  const v = await verifyToken(body.token, SECRET, { typ: 'sess', nowSec });
  assert.equal(v.payload.vat, nowSec);
});

test('/me: Whop outage during re-check is 503 (client fails closed at exp)', async () => {
  const handle = createHandler({ ...fakeWhop({ down: true }), now: () => NOW_MS });
  const res = await handle(meReq(await mkSess({ vat: nowSec - 4000 })), ENV, ctx);
  assert.equal(res.status, 503);
});

test('/me: expired, forged and missing tokens are 401', async () => {
  const handle = createHandler({ ...fakeWhop(), now: () => NOW_MS });
  let res = await handle(meReq(await mkSess({ exp: nowSec - 1 })), ENV, ctx);
  assert.equal(res.status, 401); assert.equal((await res.json()).error, 'expired');
  const forged = await signToken({ typ: 'sess', sub: 'user_CUST', plus: true, admin: true, iat: nowSec, vat: nowSec, exp: nowSec + 99 }, 'not-the-real-secret-0123456789-abcdefgh');
  res = await handle(meReq(forged), ENV, ctx);
  assert.equal(res.status, 401);
  res = await handle(new Request('https://api.etsemiq.com/me'), ENV, ctx);
  assert.equal(res.status, 401);
});

test('/me: renewal keeps the original sign-in time and stops 30 days after it', async () => {
  const w = fakeWhop({ access: { user_CUST: { has_access: true, access_level: 'customer' } } });
  const handle = createHandler({ ...w, now: () => NOW_MS });
  const at = nowSec - 20 * 86400;
  let res = await handle(meReq(await mkSess({ at, vat: nowSec - 4000 })), ENV, ctx);
  assert.equal(res.status, 200);
  const v = await verifyToken((await res.json()).token, SECRET, { typ: 'sess', nowSec });
  assert.equal(v.payload.at, at);
  assert.ok(v.payload.exp <= at + 30 * 86400);
  res = await handle(meReq(await mkSess({ at: nowSec - 30 * 86400, vat: nowSec - 4000 })), ENV, ctx);
  assert.equal(res.status, 401); assert.equal((await res.json()).error, 'expired');
});

test('optional rate limiter: a refused /me is 429 and makes no Whop call', async () => {
  const w = fakeWhop();
  const handle = createHandler({ ...w, now: () => NOW_MS });
  const env = { ...ENV, RATE_LIMITER: { limit: async () => ({ success: false }) } };
  const res = await handle(meReq(await mkSess({ vat: nowSec - 4000 })), env, ctx);
  assert.equal(res.status, 429);
  assert.equal(w.calls.length, 0);
});

test('/me from a foreign origin gets no CORS grant', async () => {
  const handle = createHandler({ ...fakeWhop(), now: () => NOW_MS });
  const res = await handle(meReq(await mkSess(), 'https://evil.example'), ENV, ctx);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), null);
});

test('preflight: allowed origin 204 with CORS, others 403 without', async () => {
  const handle = createHandler(fakeWhop());
  const pre = origin => new Request('https://api.etsemiq.com/me', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET' } });
  let res = await handle(pre('https://www.etsemiq.com'), ENV, ctx);
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://www.etsemiq.com');
  assert.match(res.headers.get('Access-Control-Allow-Headers'), /Authorization/);
  res = await handle(pre('https://evil.example'), ENV, ctx);
  assert.equal(res.status, 403);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), null);
});

test('logout is 204, health reports configuration without secrets, unknown routes 404', async () => {
  const handle = createHandler(fakeWhop());
  let res = await handle(new Request('https://api.etsemiq.com/auth/logout', { method: 'POST', headers: { Origin: 'https://etsemiq.com' } }), ENV, ctx);
  assert.equal(res.status, 204);
  res = await handle(new Request('https://api.etsemiq.com/health'), ENV, ctx);
  const h = await res.json();
  assert.deepEqual(h, { ok: true, configured: true });
  res = await handle(new Request('https://api.etsemiq.com/health'), { SESSION_SECRET: 'x' }, ctx);
  assert.deepEqual(await res.json(), { ok: true, configured: false });
  res = await handle(new Request('https://api.etsemiq.com/auth/login'), { SESSION_SECRET: 'x' }, ctx);
  assert.equal(res.status, 503);
  res = await handle(new Request('https://api.etsemiq.com/admin'), ENV, ctx);
  assert.equal(res.status, 404);
  res = await handle(new Request('https://api.etsemiq.com/me', { method: 'POST' }), ENV, ctx);
  assert.equal(res.status, 404);
});
