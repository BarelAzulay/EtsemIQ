import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedOrigins, isAllowedOrigin, corsHeaders, safeReturnUrl, parseAdminIds, decideEntitlement } from '../src/policy.js';

test('CORS allow-list: production origins only by default', () => {
  assert.deepEqual(allowedOrigins({}), ['https://etsemiq.com', 'https://www.etsemiq.com', 'https://etsemiq-web.whop.site']);
  assert.equal(isAllowedOrigin('https://etsemiq.com', {}), true);
  assert.equal(isAllowedOrigin('https://www.etsemiq.com', {}), true);
  assert.equal(isAllowedOrigin('https://etsemiq-web.whop.site', {}), true);
  for (const bad of ['http://etsemiq.com', 'https://etsemiq.com.evil.example', 'https://evil-etsemiq.com',
    'https://other.whop.site', 'https://etsemiq-web.whop.site.evil.example', 'http://etsemiq-web.whop.site',
    'https://api.etsemiq.com', 'null', '', null, undefined, 'https://etsemiq.com/', 'https://ETSEMIQ.com:443x']) {
    assert.equal(isAllowedOrigin(bad, {}), false, String(bad));
  }
});

test('CORS: extra dev origin from env, bare origins only', () => {
  assert.equal(isAllowedOrigin('http://localhost:8080', { EXTRA_ORIGIN: 'http://localhost:8080' }), true);
  assert.equal(isAllowedOrigin('http://localhost:8080', { EXTRA_ORIGIN: 'http://localhost:8080/' }), true);
  assert.equal(isAllowedOrigin('http://localhost:8081', { EXTRA_ORIGIN: 'http://localhost:8080' }), false);
  /* junk in EXTRA_ORIGIN never widens the list */
  assert.deepEqual(allowedOrigins({ EXTRA_ORIGIN: '*' }).length, 3);
  assert.deepEqual(allowedOrigins({ EXTRA_ORIGIN: 'https://x.example/path' }).length, 3);
  assert.deepEqual(allowedOrigins({ EXTRA_ORIGIN: 'javascript:alert(1)' }).length, 3);
});

test('CORS headers: never reflect a disallowed origin, never "*"', () => {
  const ok = corsHeaders('https://etsemiq.com', {});
  assert.equal(ok['Access-Control-Allow-Origin'], 'https://etsemiq.com');
  assert.equal(ok.Vary, 'Origin');
  assert.equal(ok['Access-Control-Allow-Credentials'], undefined);
  const bad = corsHeaders('https://evil.example', {});
  assert.equal(bad['Access-Control-Allow-Origin'], undefined);
  assert.equal(bad.Vary, 'Origin');
  assert.equal(corsHeaders(null, {})['Access-Control-Allow-Origin'], undefined);
});

test('return URL is validated against the allow-list and loses its fragment', () => {
  assert.equal(safeReturnUrl('https://etsemiq.com/?lang=he#old', {}), 'https://etsemiq.com/?lang=he');
  assert.equal(safeReturnUrl('https://www.etsemiq.com/x', {}), 'https://www.etsemiq.com/x');
  for (const bad of ['https://evil.example/', '//evil.example', '/relative', 'javascript:alert(1)',
    'https://etsemiq.com@evil.example/', 'https://user:pw@etsemiq.com/', 'http://etsemiq.com/', '', null, 'x'.repeat(3000)]) {
    assert.equal(safeReturnUrl(bad, {}), 'https://etsemiq.com/', String(bad).slice(0, 40));
  }
  assert.equal(safeReturnUrl('http://localhost:8080/index.html', { EXTRA_ORIGIN: 'http://localhost:8080' }), 'http://localhost:8080/index.html');
});

test('admin ids parse from a comma/space list and ignore junk', () => {
  assert.deepEqual(parseAdminIds('user_A1, user_B2 ,,user_C3\nuser_D4'), ['user_A1', 'user_B2', 'user_C3', 'user_D4']);
  assert.deepEqual(parseAdminIds(['someone', 'example.com'].join('@') + ', *, user_, biz_x'), []);
  assert.deepEqual(parseAdminIds(undefined), []);
});

const env = { ADMIN_WHOP_USER_IDS: 'user_OWNER1' };
const A = (has_access, access_level) => ({ has_access, access_level });

test('admin decision: listed id is admin even with no Whop answer', () => {
  assert.deepEqual(decideEntitlement({ userId: 'user_OWNER1', access: null, env }), { plus: true, admin: true });
  assert.deepEqual(decideEntitlement({ userId: 'user_OWNER1', access: A(false, 'no_access'), env }), { plus: true, admin: true });
});

test('admin decision: Whop access_level "admin" is admin only when WHOP_TEAM_IS_ADMIN is exactly "true"', () => {
  const on = { ...env, WHOP_TEAM_IS_ADMIN: 'true' };
  assert.deepEqual(decideEntitlement({ userId: 'user_TEAM', access: A(true, 'admin'), env: on }), { plus: true, admin: true });
  /* off by default, and any other value (typos included) stays off */
  for (const v of [undefined, '', 'false', '0', 'no', 'off', ' false', 'FALSE ', 'yes', '1']) {
    assert.deepEqual(decideEntitlement({ userId: 'user_TEAM', access: A(true, 'admin'), env: { ...env, WHOP_TEAM_IS_ADMIN: v } }), { plus: true, admin: false }, String(v));
  }
  /* admin level without has_access is not trusted */
  assert.deepEqual(decideEntitlement({ userId: 'user_TEAM', access: A(false, 'admin'), env: on }), { plus: false, admin: false });
});

test('admin decision: customers get plus, not admin; everyone else gets nothing', () => {
  assert.deepEqual(decideEntitlement({ userId: 'user_C', access: A(true, 'customer'), env }), { plus: true, admin: false });
  assert.deepEqual(decideEntitlement({ userId: 'user_C', access: A(false, 'no_access'), env }), { plus: false, admin: false });
  assert.deepEqual(decideEntitlement({ userId: 'user_C', access: null, env }), { plus: false, admin: false });
  assert.deepEqual(decideEntitlement({ userId: 'user_C', access: A(true, 'weird'), env }), { plus: false, admin: false });
});

test('admin decision: an email or malformed id never qualifies', () => {
  const email = ['owner', 'example.com'].join('@'); /* built at runtime: no address in the repo */
  const e = { ADMIN_WHOP_USER_IDS: email + ', user_OWNER1' };
  assert.deepEqual(decideEntitlement({ userId: email, access: A(true, 'admin'), env: e }), { plus: false, admin: false });
  assert.deepEqual(decideEntitlement({ userId: 'user_OWNER1 ', access: null, env: e }), { plus: false, admin: false });
  assert.deepEqual(decideEntitlement({ userId: undefined, access: A(true, 'customer'), env: e }), { plus: false, admin: false });
});
