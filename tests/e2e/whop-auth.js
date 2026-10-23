/* Playwright checks for the Whop auth client (script#whop-auth) with a mocked API. */
const { chromium, launchOpts, URL, OUT } = require('./lib.js');
const S = OUT;
const CHECKOUT = 'https://whop.com/checkout/plan_gov3K39kXZUmB?promoCode=FIRSTMONTH199';
const API = 'https://etsemiq-api.etsemiq.workers.dev';

let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) { passes++; console.log('  ok  ', msg); } else { fails++; console.log('  FAIL', msg); } };

const nowSec = () => Math.floor(Date.now() / 1000);
const FIX = {
  free:  () => ({ user: { id: 'user_free111', username: 'freeuser' }, plus: false, admin: false, iat: nowSec(), verified_at: nowSec(), exp: nowSec() + 3600 }),
  plus:  () => ({ user: { id: 'user_plus222', username: 'plususer' }, plus: true, admin: false, iat: nowSec(), verified_at: nowSec(), exp: nowSec() + 3600 }),
  admin: () => ({ user: { id: 'user_admin333', username: 'owner' }, plus: true, admin: true, iat: nowSec(), verified_at: nowSec(), exp: nowSec() + 3600 }),
};
const TOKEN = 'eyJ0eXAiOiJzZXNzIn0.' + 'A'.repeat(43);

async function setup(browser, { me = null, meStatus = 200, apiDown = false, viewport = { width: 1280, height: 860 }, init = null } = {}) {
  const ctx = await browser.newContext({ viewport });
  const errors = [], meCalls = [], navs = [];
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.route(API + '/**', async r => {
    const u = r.request().url();
    if (apiDown) return r.abort('connectionrefused');
    if (u.startsWith(API + '/me')) {
      meCalls.push(r.request().headers()['authorization'] || '');
      if (meStatus !== 200) return r.fulfill({ status: meStatus, contentType: 'application/json', body: JSON.stringify({ error: 'x' }), headers: { 'Access-Control-Allow-Origin': '*' } });
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(me()), headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    if (u.startsWith(API + '/health')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    if (u.startsWith(API + '/auth/login')) { navs.push(u); return r.fulfill({ status: 200, contentType: 'text/html', body: '<p>login</p>' }); }
    return r.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await ctx.route('https://whop.com/**', r => { navs.push(r.request().url()); r.fulfill({ status: 200, contentType: 'text/html', body: '<p>whop</p>' }); });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') { const t = m.text(); if (!/ERR_FAILED|fonts\./.test(t)) errors.push(t); } });
  page.on('pageerror', e => errors.push('pageerror ' + e.message));
  return { ctx, page, errors, meCalls, navs };
}
const active = page => page.evaluate(() => document.querySelector('.screen.active')?.id);
const dlgOpen = page => page.evaluate(() => { const s = document.getElementById('dlg-scrim'); return s && s.classList.contains('open') ? document.getElementById('dlg-title').textContent : null; });

(async () => {
  const browser = await chromium.launch(launchOpts());

  console.log('# 1. anonymous visitor: free state, exact checkout URL');
  {
    const { ctx, page, errors, meCalls, navs } = await setup(browser);
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForTimeout(300);
    ok(await page.evaluate(() => isMember() === false && isAdmin() === false && whopEntitled() === false), 'isMember/isAdmin false');
    ok(meCalls.length === 0, 'no /me call without a token');
    ok(await page.evaluate(() => isLocked(CATALOG.find(c => !c.free).key)), 'non-free game locked');
    ok(await page.evaluate(() => document.getElementById('btn-unlock').getAttribute('href')) === CHECKOUT, 'results CTA href exact');
    await page.evaluate(() => openPricing());
    ok(await page.evaluate(() => document.querySelector('#screen-pricing a.wa-cta').getAttribute('href')) === CHECKOUT, 'pricing CTA href exact');
    ok(await page.evaluate(() => document.querySelectorAll('#screen-pricing .price-card').length) === 1, 'pricing shows exactly one plan');
    ok(await page.evaluate(() => document.querySelectorAll('.plan-card').length) === 1, 'results shows exactly one plan card');
    ok(await page.evaluate(() => !document.getElementById('screen-checkout') && !document.getElementById('co-number')), 'simulated card form is gone');
    const priceTxt = await page.evaluate(() => document.querySelector('#screen-pricing .price-card').innerText);
    ok(/\$1\.99/.test(priceTxt) && /\$1\.99 for the first month, then \$19\.99\/month\. Cancel anytime on Whop\./.test(priceTxt), 'honest price copy on pricing card');
    ok(/\$1\.99/.test(await page.evaluate(() => document.getElementById('btn-unlock').textContent)), 'headline today amount is $1.99');
    ok(/Already a member\?\s*Sign in with Whop/.test(priceTxt), 'Already a member? Sign in with Whop under CTA');
    await page.click('#screen-pricing a.wa-cta');
    await page.waitForTimeout(500);
    ok(navs.includes(CHECKOUT), 'clicking pricing CTA navigates to exact Whop URL: ' + navs.join(' | '));
    ok(errors.length === 0, 'no console errors ' + errors.join(' | '));
    await ctx.close();
  }

  console.log('# 2. signup and old local plus flags never unlock');
  {
    const { ctx, page, errors } = await setup(browser, {
      init: () => {
        if (!sessionStorage.getItem('seeded')) {
          sessionStorage.setItem('seeded', '1');
          localStorage.setItem('etsem_accounts', JSON.stringify({ 'old@x.io': { name: 'Old', email: 'old@x.io', pw: 'h1', plus: true, plan: 'annual' } }));
          localStorage.setItem('etsem_session', JSON.stringify({ name: 'Old', email: 'old@x.io', plus: true }));
        }
      }
    });
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForTimeout(200);
    ok(await page.evaluate(() => isMember()) === false, 'legacy plus:true session is ignored');
    ok(await active(page) !== 'screen-lobby', 'legacy plus user not sent to lobby: ' + await active(page));
    await page.evaluate(() => { doLogout(); showScreen('screen-signup'); });
    await page.click('#screen-signup .btn-pay');
    ok(await page.evaluate(() => document.getElementById('err-su-name').textContent) === 'Please add your name', 'validation message (en)');
    await page.evaluate(() => setLanguage('he'));
    await page.click('#screen-signup .btn-pay');
    ok(await page.evaluate(() => document.getElementById('err-su-name').textContent) === 'הוסיפו את השם שלכם', 'validation message translated (he)');
    await page.evaluate(() => setLanguage('en'));
    await page.fill('#su-name', 'New Person'); await page.fill('#su-email', 'new@x.io'); await page.fill('#su-pass', 'secret12');
    await page.click('#screen-signup .btn-pay');
    await page.waitForTimeout(200);
    ok(await page.evaluate(() => isMember()) === false, 'signup does NOT unlock PLUS');
    ok(await active(page) !== 'screen-report', 'signup does not open the report');
    ok(await page.evaluate(() => JSON.parse(localStorage.getItem('etsem_accounts'))['new@x.io'].plus === undefined), 'new account stores no plus flag');
    ok(await page.evaluate(() => bestKey()) === 'etsem_best_new@x.io', 'bests are per account after signup');
    ok(await page.evaluate(() => document.querySelector('label[for="su-email"]') && document.querySelector('label[for="li-pass"]')) !== null, 'for= labels on su-/li- inputs');
    ok(errors.length === 0, 'no console errors ' + errors.join(' | '));
    await ctx.close();
  }

  {
    console.log('# 3a. a fragment token this tab did not ask for is ignored');
    const { ctx, page, errors } = await setup(browser, { me: FIX.plus });
    await page.goto(URL + '#whop_session=' + TOKEN, { waitUntil: 'load' });
    await page.waitForTimeout(400);
    ok(await page.evaluate(() => localStorage.getItem('etsem_whop_token')) === null && !/whop_session/.test(await page.evaluate(() => location.href)), 'unsolicited token not stored, URL still stripped');
    ok(await page.evaluate(() => isMember()) === false, 'unsolicited token grants nothing');
    ok(errors.length === 0, 'no console errors ' + errors.join(' | '));
    await ctx.close();
  }

  for (const kind of ['plus', 'admin', 'free']) {
    console.log(`# 3. returning from sign-in with a fragment token (${kind})`);
    const { ctx, page, errors, meCalls } = await setup(browser, { me: FIX[kind], init: `try{ if(!sessionStorage.getItem('__seeded')){ sessionStorage.setItem('etsem_whop_pending', String(Date.now())); sessionStorage.setItem('__seeded','1'); } }catch(e){}` });
    await page.goto(URL + '?lang=x#whop_session=' + TOKEN, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    const href = await page.evaluate(() => location.href);
    ok(!/whop_session/.test(href) && href.endsWith('index.html?lang=x'), 'token stripped from URL: ' + href);
    ok(await page.evaluate(() => localStorage.getItem('etsem_whop_token')) === TOKEN, 'token stored');
    ok(meCalls[0] === 'Bearer ' + TOKEN, '/me called with Bearer token');
    const st = await page.evaluate(() => ({ m: isMember(), a: isAdmin(), e: whopEntitled() }));
    if (kind === 'free') {
      ok(st.m === false && st.a === false, 'free Whop user is not a member');
      ok(await dlgOpen(page) === 'No PLUS membership found', 'no-membership dialog shown');
      ok(await page.evaluate(() => isLocked(CATALOG.find(c => !c.free).key)), 'games still locked');
    } else {
      ok(st.m === true, 'isMember true');
      ok(st.a === (kind === 'admin'), 'isAdmin ' + (kind === 'admin'));
      ok(await active(page) === 'screen-lobby', 'unlocked into lobby: ' + await active(page));
      ok(await page.evaluate(() => !isLocked(CATALOG.find(c => !c.free).key)), 'paid games unlocked');
      const badge = await page.evaluate(() => document.getElementById('whop-nav').textContent.trim());
      ok(badge === (kind === 'admin' ? 'Admin' : 'PLUS'), 'nav badge: ' + badge);
      await page.evaluate(() => openSettings());
      ok(await active(page) === 'screen-settings', 'settings reachable without a local account');
      const card = await page.evaluate(() => document.getElementById('membership-body').innerText);
      ok(card.includes(kind === 'admin' ? 'Admin' : 'PLUS'), 'settings shows ' + kind);
      ok(card.includes('user_' + (kind === 'admin' ? 'admin333' : 'plus222')), 'settings shows Whop user id');
      ok(await page.evaluate(() => document.querySelector('#membership-body a.wa-manage').href) === 'https://whop.com/@me/settings/orders/', 'manage link goes to Whop orders');
      ok(/Canceling happens on Whop/.test(card) && !/No further charges will be made/.test(card), 'honest cancel copy');
      await page.evaluate(() => signOutWhop());
      ok(await page.evaluate(() => isMember() === false && !localStorage.getItem('etsem_whop_token')), 'sign out of Whop clears entitlement');
    }
    ok(errors.length === 0, 'no console errors ' + errors.join(' | '));
    await ctx.close();
  }

  console.log('# 4. cached entitlement, re-check, 401 and outage');
  {
    const seed = (ent) => `localStorage.setItem('etsem_whop_token', ${JSON.stringify(TOKEN)}); localStorage.setItem('etsem_whop_ent', ${JSON.stringify(JSON.stringify(ent))});`;
    // cached plus, /me says the membership lapsed
    let r = await setup(browser, { me: FIX.free, init: seed(FIX.plus()) });
    await r.page.goto(URL, { waitUntil: 'load' }); await r.page.waitForTimeout(400);
    ok(await r.page.evaluate(() => isMember()) === false, 'lapsed membership is picked up from /me');
    await r.ctx.close();
    // /me 401 clears everything
    r = await setup(browser, { meStatus: 401, init: seed(FIX.plus()) });
    await r.page.goto(URL, { waitUntil: 'load' }); await r.page.waitForTimeout(400);
    ok(await r.page.evaluate(() => isMember() === false && localStorage.getItem('etsem_whop_token') === null), '401 signs out');
    await r.ctx.close();
    // API down, cache still valid: keep until exp
    r = await setup(browser, { apiDown: true, init: seed(FIX.plus()) });
    await r.page.goto(URL, { waitUntil: 'load' }); await r.page.waitForTimeout(400);
    ok(await r.page.evaluate(() => isMember()) === true, 'API down: valid cached entitlement holds until exp');
    ok(r.errors.filter(e => !/ERR_CONNECTION_REFUSED/.test(e)).length === 0, 'no unexpected console errors ' + r.errors.join(' | '));
    await r.ctx.close();
    // API down, cache expired: fail closed
    const expired = { ...FIX.plus(), exp: nowSec() - 5 };
    r = await setup(browser, { apiDown: true, init: seed(expired) });
    await r.page.goto(URL, { waitUntil: 'load' }); await r.page.waitForTimeout(400);
    ok(await r.page.evaluate(() => isMember()) === false, 'API down + expired cache: fails closed');
    await r.ctx.close();
    // forged localStorage entitlement without a token does nothing
    r = await setup(browser, { init: `localStorage.setItem('etsem_whop_ent', ${JSON.stringify(JSON.stringify(FIX.admin()))});` });
    await r.page.goto(URL, { waitUntil: 'load' }); await r.page.waitForTimeout(300);
    ok(await r.page.evaluate(() => isMember() === false && isAdmin() === false), 'entitlement without token is ignored');
    await r.ctx.close();
    // fresh login while API is down: friendly retry, no access
    r = await setup(browser, { apiDown: true, init: `try{ if(!sessionStorage.getItem('__seeded')){ sessionStorage.setItem('etsem_whop_pending', String(Date.now())); sessionStorage.setItem('__seeded','1'); } }catch(e){}` });
    await r.page.goto(URL + '#whop_session=' + TOKEN, { waitUntil: 'load' }); await r.page.waitForTimeout(600);
    ok(await r.page.evaluate(() => isMember()) === false, 'fresh login + API down: no PLUS');
    ok(await dlgOpen(r.page) === 'Can’t reach the sign-in service', 'friendly retry dialog: ' + await dlgOpen(r.page));
    await r.page.evaluate(() => { closeDialog(true); });
    await r.page.waitForTimeout(250);
    await r.page.evaluate(() => signInWithWhop());
    await r.page.waitForTimeout(400);
    ok(await dlgOpen(r.page) === 'Can’t reach the sign-in service', 'Sign in with API down shows retry, not a broken page');
    await r.page.evaluate(() => showScreen('screen-prequiz'));
    ok(await active(r.page) === 'screen-prequiz', 'free test still reachable');
    await r.ctx.close();
  }

  console.log('# 5. sign-in navigation, errors, return prompt, local API override');
  {
    let r = await setup(browser);
    await r.page.goto(URL, { waitUntil: 'load' });
    await r.page.evaluate(() => showScreen('screen-login'));
    await r.page.click('#screen-login .wa-whop-btn');
    await r.page.waitForTimeout(600);
    ok(r.navs.some(u => u.startsWith(API + '/auth/login?return=')), 'Sign in goes to the worker: ' + r.navs.join(' | '));
    await r.ctx.close();

    r = await setup(browser);
    await r.page.goto(URL + '#whop_error=denied', { waitUntil: 'load' }); await r.page.waitForTimeout(300);
    ok(await dlgOpen(r.page) === 'Sign-in didn’t finish', 'error fragment shows a message');
    ok(!/whop_error/.test(await r.page.evaluate(() => location.href)), 'error fragment stripped');
    await r.ctx.close();

    r = await setup(browser);
    await r.page.goto(URL + '?whop=return', { waitUntil: 'load' }); await r.page.waitForTimeout(300);
    ok(await dlgOpen(r.page) === 'Sign in with Whop to unlock PLUS', 'post-checkout return prompt');
    ok(!/whop=return/.test(await r.page.evaluate(() => location.href)), 'return marker stripped');
    await r.ctx.close();

    r = await setup(browser, { init: () => localStorage.setItem('etsem_api', 'http://localhost:8787') });
    await r.page.goto(URL, { waitUntil: 'load' });
    ok(await r.page.evaluate(() => whopApiBase()) === 'http://localhost:8787', 'etsem_api override works on file://');
    await r.ctx.close();
  }

  console.log('# 6. five languages at 375px and 320px: console errors and overflow');
  for (const w of [375, 320]) {
    const r = await setup(browser, { me: FIX.admin, viewport: { width: w, height: 780 },
      init: `localStorage.setItem('etsem_whop_token', ${JSON.stringify(TOKEN)}); localStorage.setItem('etsem_whop_ent', ${JSON.stringify(JSON.stringify(FIX.admin()))});` });
    await r.page.goto(URL, { waitUntil: 'load' }); await r.page.waitForTimeout(400);
    for (const l of ['en', 'he', 'es', 'ru', 'ar']) {
      await r.page.evaluate(l => setLanguage(l), l);
      for (const scr of ['pricing', 'login', 'signup', 'settings', 'results']) {
        await r.page.evaluate(scr => {
          if (scr === 'pricing') openPricing();
          else if (scr === 'settings') openSettings();
          else if (scr === 'results') {
            window._reportData = window._reportData || { iq: 112, ratio: .6, cats: Object.fromEntries(CAT_KEYS.map(k => [k, 60])) };
            renderTeaser(); showScreen('screen-results', { force: true });
          }
          else showScreen('screen-' + scr);
        }, scr);
        await r.page.waitForTimeout(60);
        const o = await r.page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
        /* es at 320px overflows by 3px on the original page too (nav row); not ours */
        if (o.sw > o.cw && !(w === 320 && l === 'es' && o.sw - o.cw <= 3)) ok(false, `overflow ${w}px ${l} ${scr} ${o.sw}>${o.cw}`);
        const missing = await r.page.evaluate(() => [...document.querySelectorAll('.screen.active [data-i18n]')].filter(e => e.textContent === e.dataset.i18n).map(e => e.dataset.i18n));
        if (missing.length) ok(false, `missing i18n ${l} ${scr}: ${missing.join(',')}`);
        if (w === 375 && scr === 'settings') await r.page.screenshot({ path: `${S}/wa-settings-${l}.png`, fullPage: true });
        if (w === 375 && scr === 'pricing') await r.page.screenshot({ path: `${S}/wa-pricing-${l}.png`, fullPage: true });
        if (w === 375 && scr === 'login') await r.page.screenshot({ path: `${S}/wa-login-${l}.png`, fullPage: true });
      }
      const mb = await r.page.evaluate(() => document.getElementById('whop-nav-m').textContent.trim());
      ok(mb.length > 0, `mobile nav admin badge (${w}px, ${l}): ${mb}`);
    }
    ok(r.errors.length === 0, `no console errors across 5 languages at ${w}px ` + r.errors.join(' | '));
    await r.ctx.close();
  }

  await browser.close();
  console.log(`\n${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})();
