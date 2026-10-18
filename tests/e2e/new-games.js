// Plays a full Brain Bites round, a Daily Bites set and a full Brain Twins game
// in every language at desktop and 375px. Reports console errors and overflow.
const { chromium, launchOpts, URL, OUT } = require('./lib.js');
const S = require('path').join(OUT, 'shots');
const LANGS = (process.env.LANGS || 'en,he,es,ru,ar').split(',');
const VIEWS = (process.env.VIEWS || '1280x860,375x740').split(',').map(v => v.split('x').map(Number));
const SHOTS = !!process.env.SHOTS;
require('fs').mkdirSync(S, { recursive: true });

(async () => {
  const browser = await chromium.launch(launchOpts());
  let fails = 0;
  for (const [w, h] of VIEWS) for (const L of LANGS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: process.env.REDUCED ? 'reduce' : 'no-preference', colorScheme: process.env.DARK ? 'dark' : 'light' });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', m => { if (/fonts\.(googleapis|gstatic)/.test((m.location()||{}).url||'')) return; if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
    page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));
    await page.goto(URL, { waitUntil: 'load' });
    await page.evaluate(l => { setLanguage(l); localStorage.setItem('etsem_seen_bob', 'true'); }, L);
    const tag = `${L}-${w}`;
    const ov = async (label) => {
      const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      if (r.sw > r.cw) { errors.push(`OVERFLOW ${label} ${r.sw}>${r.cw}`); }
    };
    const shot = async n => { if (SHOTS) await page.screenshot({ path: `${S}/${tag}-${n}.png`, fullPage: false }); };
    const active = () => page.evaluate(() => document.querySelector('.screen.active').id);
    const check = await page.evaluate(() => ngSelfCheck());
    if (check.length) errors.push('SELFCHECK ' + check.slice(0, 5).join(' | ') + (check.length > 5 ? ` (+${check.length - 5})` : ''));

    // ---- hub: twins free, bites locked for non-member ----
    await page.evaluate(() => openGamesHub());
    await ov('hub');
    await shot('hub');
    const hub = await page.evaluate(() => [...document.querySelectorAll('#games-grid .game-card')].map(c => c.querySelector('h3').textContent + '|' + (c.querySelector('.btn-locked') ? 'locked' : 'open')));
    if (!hub.some(x => x.endsWith('open')) ) errors.push('hub: nothing open');
    await page.evaluate(() => launchGame('bites'));
    await page.waitForTimeout(200);
    const gate = await page.evaluate(() => document.getElementById('dlg-scrim').classList.contains('open'));
    if (!gate) errors.push('bites not gated for guest');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);

    // ---- Brain Bites as member ----
    await page.evaluate(() => { waSet(WA_TOKEN,'eyJ0eXAiOiJzZXNzIn0.'+'A'.repeat(43)); waEnt={user:{id:'user_p',username:'p'},plus:true,admin:false,exp:Math.floor(Date.now()/1000)+3600}; });
    await page.evaluate(() => launchGame('bites'));
    await page.waitForTimeout(200);
    if (await active() !== 'screen-bites') errors.push('bites home not shown: ' + await active());
    await ov('bites-home'); await shot('bites-home');
    await page.click('#screen-bites .btn-primary.ng-big');
    await page.waitForTimeout(200);
    for (let i = 0; i < 10; i++) {
      if (await active() !== 'screen-bites-play') { errors.push('not on play at q' + i); break; }
      const k = 1 + Math.floor(Math.random() * 4);
      if (i % 2) await page.keyboard.press(String(k));
      else await page.click(`#bb-opts button:nth-child(${k})`);
      await page.waitForTimeout(80);
      const st = await page.evaluate(() => ({ ex: !document.getElementById('bb-explain').hidden, why: document.querySelector('#bb-explain .ng-why')?.textContent.length || 0, next: !document.getElementById('bb-next').hidden, foc: document.activeElement.id, live: document.getElementById('bb-live').textContent.length }));
      if (!st.ex || st.why < 20 || !st.next || st.foc !== 'bb-next' || st.live < 20) errors.push('explain state bad q' + i + ' ' + JSON.stringify(st));
      if (i === 3) { await ov('bites-play'); await shot('bites-play'); }
      if (i === 4) { // language refresh mid-question
        await page.evaluate(l => setLanguage(l === 'en' ? 'he' : 'en'), L); await page.waitForTimeout(50);
        await page.evaluate(l => setLanguage(l), L); await page.waitForTimeout(50);
      }
      await page.keyboard.press('Enter');
      await page.waitForTimeout(120);
    }
    if (await active() !== 'screen-bites-result') errors.push('no result screen: ' + await active());
    await page.waitForTimeout(1200);
    await ov('bites-result'); await shot('bites-result');
    const res = await page.evaluate(() => ({ score: document.getElementById('bbr-score').textContent, cats: document.querySelectorAll('#bbr-cats .ng-catrow').length, rev: document.querySelectorAll('#bbr-review li').length, act: activity, rounds: JSON.parse(localStorage.getItem('etsem_bb_v1')).rounds }));
    if (res.cats < 1 || res.rev !== 10 || res.act !== null) errors.push('result bad ' + JSON.stringify(res));
    // daily
    await page.evaluate(() => bbOpenHome());
    await page.click('#bbh-daily');
    for (let i = 0; i < 5; i++) { await page.keyboard.press('1'); await page.waitForTimeout(40); await page.click('#bb-next'); await page.waitForTimeout(60); }
    if (await active() !== 'screen-bites-result') errors.push('daily no result');
    const dd = await page.evaluate(() => bb.qs.map(x => x.q.id).join(','));
    // exit guard mid-round
    await page.evaluate(() => bbStart('round'));
    await page.evaluate(() => goHome());
    await page.waitForTimeout(200);
    const guard = await page.evaluate(() => ({ open: document.getElementById('dlg-scrim').classList.contains('open'), body: document.querySelector('#dlg-box p')?.textContent }));
    if (!guard.open) errors.push('exit guard did not fire');
    await page.keyboard.press('Escape'); await page.waitForTimeout(250);
    if (await active() !== 'screen-bites-play') errors.push('escape left the round');
    await page.evaluate(() => { disarmActivity(); });

    let fin = { pct: '-', title: '-' };
    if (!process.env.BITES_ONLY) {
    // ---- Brain Twins as guest (free) ----
    await page.evaluate(() => { waClear(); currentUser = null; });
    await page.evaluate(() => launchGame('twins'));
    await page.waitForTimeout(200);
    if (await active() !== 'screen-twins') errors.push('twins not open for guest: ' + await active());
    await ov('twins-setup'); await shot('twins-setup');
    await page.fill('#bt-name-a', '<img src=x onerror=alert(1)>');
    await page.fill('#bt-name-b', L === 'ar' ? 'سارة' : (L === 'he' ? 'נועה' : 'Sam $& Co'));
    await page.click('#bt-form button[type=submit]');
    await page.waitForTimeout(200);
    for (let p = 0; p < 2; p++) {
      if (p === 0) { await ov('twins-pass'); await shot('twins-pass'); }
      await page.click('#bt-ready');
      await page.waitForTimeout(100);
      for (let i = 0; i < 10; i++) {
        const n = await page.evaluate(() => document.getElementById('bt-choices').children.length);
        const k = 1 + Math.floor(Math.random() * n);
        if (i === 2 && p === 0) { await ov('twins-ask'); await shot('twins-ask'); }
        if (i % 2) await page.keyboard.press(String(k)); else await page.click(`#bt-choices button:nth-child(${k})`);
        await page.waitForTimeout(470);
      }
    }
    if (await active() !== 'screen-twins-result') errors.push('twins no result: ' + await active());
    await page.click('#btr-go');
    await page.waitForTimeout(150);
    for (let i = 0; i < 5; i++) { await page.click('#btr-next'); await page.waitForTimeout(120); }
    await ov('twins-reveal'); await shot('twins-reveal');
    await page.click('#btr-skip');
    await page.waitForTimeout(1400);
    await ov('twins-final'); await shot('twins-final');
    fin = await page.evaluate(() => ({ pct: document.getElementById('btf-pct').textContent, title: document.getElementById('btf-title').textContent, cards: document.querySelectorAll('#btr-cards .ng-rcard').length, imgs: document.querySelectorAll('#screen-twins-play img, #screen-twins-result img').length, act: activity, share: btShareText() }));
    if (fin.cards !== 10 || fin.imgs || fin.act !== null || !fin.title) errors.push('twins final bad ' + JSON.stringify(fin));
    if (!fin.share.includes('etsemiq.com') || !fin.share.includes(fin.pct + '%')) errors.push('share text bad ' + fin.share);
    if (L === 'en' && !fin.share.includes('Sam $& Co')) errors.push('name mangled in share ' + fin.share);
    await page.evaluate(() => btAgain(true));
    await page.waitForTimeout(150);
    const swapped = await page.evaluate(() => bt.names[0]);
    if (swapped.includes('<img') ) errors.push('swap failed');
    await page.evaluate(() => disarmActivity());
    }

    console.log(tag, errors.length ? 'FAIL' : 'ok', errors.length ? '\n  ' + errors.join('\n  ') : '', '| daily', dd, '| hub', hub.length, '| bites', res.score, '| twins', fin.pct + '%', fin.title);
    if (errors.length) fails++;
    await ctx.close();
  }
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
