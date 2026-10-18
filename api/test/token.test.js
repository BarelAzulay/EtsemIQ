import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signToken, verifyToken, b64urlEncode, b64urlDecode, pkceChallenge, randomToken } from '../src/token.js';

const SECRET = 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz';
const OTHER = 'another-secret-0123456789-abcdefghijklmnopqrstuvw';
const NOW = 1_800_000_000;

const sess = (over = {}) => ({ typ: 'sess', sub: 'user_abc123', plus: true, admin: false, iat: NOW, vat: NOW, exp: NOW + 3600, ...over });

test('sign then verify round-trips the payload', async () => {
  const tok = await signToken(sess(), SECRET);
  const v = await verifyToken(tok, SECRET, { typ: 'sess', nowSec: NOW });
  assert.equal(v.ok, true);
  assert.deepEqual(v.payload, sess());
});

test('expired token is rejected, exactly at exp too', async () => {
  const tok = await signToken(sess({ exp: NOW + 10 }), SECRET);
  assert.equal((await verifyToken(tok, SECRET, { typ: 'sess', nowSec: NOW + 9 })).ok, true);
  assert.deepEqual(await verifyToken(tok, SECRET, { typ: 'sess', nowSec: NOW + 10 }), { ok: false, reason: 'expired' });
  assert.deepEqual(await verifyToken(tok, SECRET, { typ: 'sess', nowSec: NOW + 99999 }), { ok: false, reason: 'expired' });
});

test('flipping plus/admin in the payload breaks the signature', async () => {
  const tok = await signToken(sess({ plus: false, admin: false }), SECRET);
  const [body, mac] = tok.split('.');
  const forged = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
  forged.plus = true; forged.admin = true;
  const forgedTok = b64urlEncode(new TextEncoder().encode(JSON.stringify(forged))) + '.' + mac;
  assert.deepEqual(await verifyToken(forgedTok, SECRET, { typ: 'sess', nowSec: NOW }), { ok: false, reason: 'signature' });
});

test('tampered MAC, wrong secret, and extended exp are rejected', async () => {
  const tok = await signToken(sess(), SECRET);
  const [body, mac] = tok.split('.');
  const flipped = mac.slice(0, -2) + (mac.at(-2) === 'A' ? 'B' : 'A') + mac.at(-1);
  assert.equal((await verifyToken(body + '.' + flipped, SECRET, { nowSec: NOW })).reason, 'signature');
  assert.equal((await verifyToken(tok, OTHER, { nowSec: NOW })).reason, 'signature');
  const longer = b64urlEncode(new TextEncoder().encode(JSON.stringify(sess({ exp: NOW + 10 ** 8 }))));
  assert.equal((await verifyToken(longer + '.' + mac, SECRET, { nowSec: NOW })).reason, 'signature');
});

test('a token of another type is rejected (oauth cookie cannot be a session)', async () => {
  const tok = await signToken({ typ: 'oauth', st: 'x', v: 'y', exp: NOW + 600 }, SECRET);
  assert.deepEqual(await verifyToken(tok, SECRET, { typ: 'sess', nowSec: NOW }), { ok: false, reason: 'type' });
});

test('malformed input never throws', async () => {
  for (const bad of [undefined, null, '', '.', 'abc', 'a.b.c', '***.***', 'x'.repeat(5000), 'eyJ.@@']) {
    const v = await verifyToken(bad, SECRET, { nowSec: NOW });
    assert.equal(v.ok, false, String(bad).slice(0, 20));
  }
});

test('alg-none style token (empty MAC) is rejected', async () => {
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(sess())));
  assert.equal((await verifyToken(body + '.', SECRET, { nowSec: NOW })).ok, false);
});

test('signing refuses a short secret and a payload without typ/exp', async () => {
  await assert.rejects(signToken(sess(), 'short'));
  await assert.rejects(signToken({ sub: 'user_x' }, SECRET));
});

test('PKCE S256 matches the RFC 7636 appendix B vector', async () => {
  assert.equal(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});

test('randomToken is url-safe and unique', () => {
  const a = randomToken(32), b = randomToken(32);
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, b);
});
