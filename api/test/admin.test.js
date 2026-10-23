/* Admin username + password login (POST /auth/admin) and its sessions on /me. */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, _clearAdminFails } from '../src/index.js';
import { hashPassword, parseHash, checkAdminLogin } from '../src/adminpw.js';
import { signToken } from '../src/token.js';

const SECRET = 'admin-test-secret-0123456789-abcdefghijklmnopqrstuv';
const USER = 'TestAdmin';
const PASS = 'correct horse battery staple';
const HASH = await hashPassword(PASS, { iterations: 10000 });
/* Admin login must work even with no Whop settings at all. */
const ENV = { SESSION_SECRET: SECRET, ADMIN_USERNAME: USER, ADMIN_PASSWORD_HASH: HASH, PUBLIC_URL: 'https://api.etsemiq.com' };
const SITE = 'https://etsemiq.com';
const noFetch = async () => { throw new Error('admin login must not call out'); };

beforeEach(() => _clearAdminFails());

function post(body, { origin = SITE, ip = '203.0.113.7', type = 'application/json' } = {}) {
  const headers = { 'Content-Type': type, 'CF-Connecting-IP': ip };
  if (origin) headers.Origin = origin;
  return new Request('https://api.etsemiq.com/auth/admin', {
    method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}
const me = (token, origin = SITE) => new Request('https://api.etsemiq.com/me', { headers: { Authorization: 'Bearer ' + token, Origin: origin } });

test('hash format round-trips and rejects junk', async () => {
  assert.ok(parseHash(HASH));
  assert.equal(parseHash('plaintext-password'), null);
  assert.equal(parseHash('pbkdf2-sha256$999999999$aaaaaaaaaaaaaaaaaaaaaa$' + 'a'.repeat(43)), null);
  assert.equal(await checkAdminLogin(ENV, USER, PASS), true);
  assert.equal(await checkAdminLogin(ENV, USER, PASS + 'x'), false);
  assert.equal(await checkAdminLogin(ENV, 'someoneelse', PASS), false);
  assert.equal(await checkAdminLogin({ ...ENV, ADMIN_PASSWORD_HASH: 'nope' }, USER, PASS), false);
});

test('right username + password: admin + plus session that /me accepts', async () => {
  const handle = createHandler({ fetch: noFetch });
  const res = await handle(post({ username: USER, password: PASS }), ENV);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), SITE);
  const b = await res.json();
  assert.equal(b.admin, true);
  assert.equal(b.plus, true);
  assert.deepEqual(b.user, { id: 'admin', username: USER });
  assert.equal(typeof b.token, 'string');
  assert.ok(!JSON.stringify(b).includes(PASS));

  const r2 = await handle(me(b.token), ENV);
  assert.equal(r2.status, 200);
  const m = await r2.json();
  assert.equal(m.admin, true);
  assert.equal(m.plus, true);
});

test('username is trimmed but case-sensitive', async () => {
  const handle = createHandler({ fetch: noFetch });
  assert.equal((await handle(post({ username: '  ' + USER + ' ', password: PASS }), ENV)).status, 200);
  assert.equal((await handle(post({ username: USER.toLowerCase(), password: PASS }), ENV)).status, 401);
});

test('wrong password or username: 401 with no token', async () => {
  const handle = createHandler({ fetch: noFetch });
  for (const body of [{ username: USER, password: 'wrong' }, { username: 'nobody', password: PASS }]) {
    const res = await handle(post(body), ENV);
    assert.equal(res.status, 401);
    const b = await res.json();
    assert.equal(b.error, 'invalid_login');
    assert.equal(b.token, undefined);
  }
});

test('five failures from one IP lock it out, even for the right password; other IPs are unaffected', async () => {
  const handle = createHandler({ fetch: noFetch });
  for (let i = 0; i < 5; i++) assert.equal((await handle(post({ username: USER, password: 'bad' + i }), ENV)).status, 401);
  assert.equal((await handle(post({ username: USER, password: PASS }), ENV)).status, 429);
  assert.equal((await handle(post({ username: USER, password: PASS }, { ip: '198.51.100.9' }), ENV)).status, 200);
});

test('the lockout ends after the window', async () => {
  let now = 1_800_000_000_000;
  const handle = createHandler({ fetch: noFetch, now: () => now });
  for (let i = 0; i < 5; i++) await handle(post({ username: USER, password: 'bad' }), ENV);
  assert.equal((await handle(post({ username: USER, password: PASS }), ENV)).status, 429);
  now += 16 * 60_000;
  assert.equal((await handle(post({ username: USER, password: PASS }), ENV)).status, 200);
});

test('foreign or missing Origin is refused', async () => {
  const handle = createHandler({ fetch: noFetch });
  assert.equal((await handle(post({ username: USER, password: PASS }, { origin: 'https://evil.example' }), ENV)).status, 403);
  assert.equal((await handle(post({ username: USER, password: PASS }, { origin: null }), ENV)).status, 403);
});

test('malformed requests are 400', async () => {
  const handle = createHandler({ fetch: noFetch });
  assert.equal((await handle(post('username=a&password=b', { type: 'application/x-www-form-urlencoded' }), ENV)).status, 400);
  assert.equal((await handle(post('{not json'), ENV)).status, 400);
  assert.equal((await handle(post({ username: USER }), ENV)).status, 400);
  assert.equal((await handle(post({ username: USER, password: 'x'.repeat(300) }), ENV)).status, 400);
  assert.equal((await handle(post({ username: USER, password: 12345 }), ENV)).status, 400);
});

test('not configured: 503, and GET is not a route', async () => {
  const handle = createHandler({ fetch: noFetch });
  const { ADMIN_PASSWORD_HASH, ...noHash } = ENV;
  assert.equal((await handle(post({ username: USER, password: PASS }), noHash)).status, 503);
  assert.equal((await handle(post({ username: USER, password: PASS }), { ...ENV, SESSION_SECRET: 'short' })).status, 503);
  assert.equal((await handle(new Request('https://api.etsemiq.com/auth/admin', { headers: { Origin: SITE } }), ENV)).status, 404);
});

test('a new password ends existing admin sessions; removing the login does too', async () => {
  const handle = createHandler({ fetch: noFetch });
  const { token } = await (await handle(post({ username: USER, password: PASS }), ENV)).json();
  const env2 = { ...ENV, ADMIN_PASSWORD_HASH: await hashPassword('a brand new password', { iterations: 10000 }) };
  assert.equal((await handle(me(token), env2)).status, 401);
  const { ADMIN_USERNAME, ...gone } = ENV;
  assert.equal((await handle(me(token), gone)).status, 401);
  assert.equal((await handle(me(token), ENV)).status, 200);
});

test('a forged admin token (wrong key, or a Whop-style token claiming src=pw) is refused', async () => {
  const handle = createHandler({ fetch: noFetch });
  const nowSec = Math.floor(Date.now() / 1000);
  const base = { typ: 'sess', sub: 'admin', u: USER, plus: true, admin: true, at: nowSec, iat: nowSec, vat: nowSec, exp: nowSec + 3600, src: 'pw' };
  const wrongKey = await signToken({ ...base, pv: 'whatever' }, 'some-other-secret-0123456789-abcdefghijklmnop');
  assert.equal((await handle(me(wrongKey), ENV)).status, 401);
  /* Right key but no matching password version (e.g. minted before the hash existed). */
  const noPv = await signToken(base, SECRET);
  assert.equal((await handle(me(noPv), ENV)).status, 401);
  /* src=pw with a Whop user id instead of "admin". */
  const whopSub = await signToken({ ...base, sub: 'user_X', pv: 'x' }, SECRET);
  assert.equal((await handle(me(whopSub), ENV)).status, 401);
});

test('admin sessions expire like any other', async () => {
  let now = 1_800_000_000_000;
  const handle = createHandler({ fetch: noFetch, now: () => now });
  const { token, exp } = await (await handle(post({ username: USER, password: PASS }), ENV)).json();
  assert.equal(exp, Math.floor(now / 1000) + 43200);
  now = (exp + 1) * 1000;
  assert.equal((await handle(me(token), ENV)).status, 401);
});

test('IPv6 failures count per /64, so rotating addresses inside one /64 does not help', async () => {
  const { failKey } = await import('../src/index.js');
  assert.equal(failKey('203.0.113.7'), '203.0.113.7');
  assert.equal(failKey('2001:db8:aa:bb:1:2:3:4'), '2001:db8:aa:bb::/64');
  assert.equal(failKey('2001:0db8:00aa:00bb::5'), '2001:db8:aa:bb::/64');
  assert.equal(failKey('2001:db8::1'), '2001:db8:0:0::/64');
  const handle = createHandler({ fetch: noFetch });
  for (let i = 0; i < 5; i++) await handle(post({ username: USER, password: 'bad' }, { ip: `2001:db8:aa:bb::${i + 1}` }), ENV);
  assert.equal((await handle(post({ username: USER, password: PASS }, { ip: '2001:db8:aa:bb:ffff::9' }), ENV)).status, 429);
  assert.equal((await handle(post({ username: USER, password: PASS }, { ip: '2001:db8:aa:cc::1' }), ENV)).status, 200);
});

test('an oversized Content-Length is refused before the body is read', async () => {
  const handle = createHandler({ fetch: noFetch });
  const req = new Request('https://api.etsemiq.com/auth/admin', {
    method: 'POST', headers: { Origin: SITE, 'Content-Type': 'application/json', 'Content-Length': '999999' }, body: '{}',
  });
  assert.equal((await handle(req, ENV)).status, 400);
});

test('the Whop-hosted copy of the site may log in', async () => {
  const handle = createHandler({ fetch: noFetch });
  const res = await handle(post({ username: USER, password: PASS }, { origin: 'https://etsemiq-web.whop.site' }), ENV);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://etsemiq-web.whop.site');
});
