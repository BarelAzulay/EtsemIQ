// Playwright checks for core fixes. Usage: node core-fixes.js [path-to-index.html]  (default: E2E_PAGE or <repo>/index.html)
const { chromium, launchOpts, URL: DEFAULT_URL } = require('./lib.js');
const URL = process.argv[2] ? 'file://' + require('path').resolve(process.argv[2]) : DEFAULT_URL;
let pass = 0, fail = 0;
const ok = (cond, label, extra) => { if (cond) { pass++; console.log('PASS', label); } else { fail++; console.log('FAIL', label, extra !== undefined ? JSON.stringify(extra) : ''); } };

(async () => {
  const browser = await chromium.launch(launchOpts());
  const errors = [];
  const mk = async (vp, mobile) => {
    const ctx = await browser.newContext(mobile ? { viewport: vp, isMobile: true, hasTouch: true } : { viewport: vp });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await ctx.addInitScript(() => {
      window.__ivLive = new Set();
      const si = window.setInterval, ci = window.clearInterval;
      window.setInterval = function (...a) { const id = si.apply(this, a); window.__ivLive.add(id); return id; };
      window.clearInterval = function (id) { window.__ivLive.delete(id); return ci.call(this, id); };
    });
    const page = await ctx.newPage();
    await page.route('https://api.etsemiq.com/**', r => { const n=Math.floor(Date.now()/1000); r.fulfill({status:200, contentType:'application/json', headers:{'access-control-allow-origin':'*'}, body: JSON.stringify({ user:{id:'user_plus222',username:'plususer'}, plus:true, admin:false, iat:n, verified_at:n, exp:n+3600 }) }); });
    page.on('console', m => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.location().url || '')) errors.push(`[${vp.width}] ${m.text()} @${m.location().url}`); });
    page.on('pageerror', e => errors.push(`[${vp.width} pageerror] ${e.message}`));
    await page.goto(URL, { waitUntil: 'load' });
    return { ctx, page };
  };
  const { page } = await mk({ width: 1280, height: 860 });
  const ev = (f, a) => page.evaluate(f, a);
  const active = () => ev(() => document.querySelector('.screen.active').id);

  // ---------- head ----------
  const head = await ev(() => ({
    desc: !!document.querySelector('meta[name=description]')?.content,
    icon: (document.querySelector('link[rel=icon]')?.href || '').startsWith('data:image/svg+xml'),
    pre: [...document.querySelectorAll('link[rel=preconnect]')].map(l => l.href).join(' '),
    swap: [...document.querySelectorAll('link[rel=stylesheet]')].some(l => l.href.includes('display=swap')),
  }));
  ok(head.desc && head.icon && head.pre.includes('fonts.gstatic.com') && head.pre.includes('fonts.googleapis.com') && head.swap, 'head: description, svg favicon, preconnects, display=swap', head);

  // ---------- percentile ----------
  const pc = await ev(() => [iqPercentile(100), iqPercentile(115), iqPercentile(130), iqPercentile(85), iqPercentile(70), iqPercentile(200), iqPercentile(10)]);
  ok(JSON.stringify(pc) === JSON.stringify([50, 84, 98, 16, 2, 99, 1]), 'iqPercentile 100→50, 115→84, 130→98, 85→16, 70→2, clamp 1..99', pc);
  ok(await ev(() => !/\(iq-70\)|\/78\)|148-70/.test(document.documentElement.innerHTML)), 'no linear percentile formula left');

  // ---------- static a11y ----------
  const a11y = await ev(() => ({
    aNoHref: document.querySelectorAll('a[onclick]:not([href])').length,
    divClick: [...document.querySelectorAll('div[onclick]')].filter(d => !d.classList.contains('dlg-scrim') && !d.classList.contains('msheet-scrim') && !d.classList.contains('plan-card')).map(d => d.className),
    unlabeled: ['gate-email', 'bob-input', 'cert-name'].filter(id => !document.getElementById(id).labels.length),
    noName: [...document.querySelectorAll('button')].filter(b => b.getClientRects().length && !b.textContent.trim() && !b.getAttribute('aria-label') && !b.title).map(b => b.id || b.className),
    live: document.getElementById('bob-thread').getAttribute('aria-live'),
    logoTag: document.querySelector('.logo').tagName,
  }));
  ok(a11y.aNoHref === 0 && a11y.divClick.length === 0 && a11y.logoTag === 'A', 'logo + nav links are real links; no clickable divs outside other areas', a11y);
  ok(a11y.unlabeled.length === 0, 'gate-email, bob-input, cert-name have <label for>', a11y.unlabeled);
  ok(a11y.noName.length === 0, 'every button has an accessible name', a11y.noName);
  ok(a11y.live === 'polite', 'bob-thread aria-live=polite');
  // keyboard: Tab from start reaches logo, Enter on "How it works" opens it
  await page.keyboard.press('Tab');
  const f2 = await ev(() => document.activeElement.className + '|' + document.activeElement.textContent.trim().slice(0, 20));
  ok(f2.startsWith('logo'), 'Tab reaches the logo', f2);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  ok(await active() === 'screen-how', 'Enter on nav "How it works" opens it', await active());
  const ring = await ev(() => getComputedStyle(document.activeElement).outlineStyle + ' ' + getComputedStyle(document.activeElement).outlineWidth);
  ok(ring.startsWith('solid 3px'), 'focus-visible ring is shown', ring);
  await ev(() => goHome());

  // ---------- free test: analyzing timer ----------
  await page.click('#screen-landing .btn-primary');
  await page.click('#screen-prequiz .gender-btn >> nth=2');
  await page.click('#screen-memorize .btn-primary');
  // mid-question language switch in the scored test keeps the selection
  await page.click('.option[data-i="2"]');
  await ev(() => setLanguage('ru'));
  const keep = await ev(() => ({ sel: engine.sel, cls: document.querySelector('.option[data-i="2"]').classList.contains('selected'), next: document.getElementById('btn-next').classList.contains('enabled'), label: document.getElementById('btn-next').textContent }));
  ok(keep.sel === 2 && keep.cls && keep.next, 'free test: language switch keeps the selected option and the Next button', keep);
  await ev(() => setLanguage('en'));
  const n = await ev(() => engine.qs.length);
  for (let i = 0; i < n; i++) {
    const [ans, no] = await ev(() => [engine.qs[engine.cur].ans, engine.qs[engine.cur].opts.length]);
    if (await ev(() => !!engine.qs[engine.cur].wm)) { await page.click('.ft-wm-go'); await page.waitForSelector('.ft-wm.done', { timeout: 12000 }); }
    await page.click(`.option[data-i="${i % 3 ? ans : (ans + 1) % no}"]`);
    await page.click('#btn-next');
  }
  ok(await active() === 'screen-analyzing', 'reached analyzing');
  await page.waitForTimeout(700);
  await ev(() => goHome());
  await page.waitForTimeout(3600);
  ok(await active() === 'screen-landing', 'leaving analyzing cancels its timeout (no jump to email gate)', await active());
  await ev(() => runAnalyzing());
  await page.waitForTimeout(3600);
  ok(await active() === 'screen-email-gate', 'analyzing completes normally when not left');
  const qs = await ev(() => document.getElementById('quick-stats-row').innerText.replace(/\n/g, ' | '));
  ok(/faster than average/.test(qs) && !/took the test/.test(qs), 'email-gate stat caption is "faster than average"', qs);
  await page.click('#screen-email-gate .btn-primary');
  ok(await active() === 'screen-results', 'results');
  await page.waitForTimeout(1100);
  const u1 = await ev(() => document.getElementById('urgency-timer').textContent);
  await ev(() => openHow());
  await page.waitForTimeout(2200);
  const u2 = await ev(() => document.getElementById('urgency-timer').textContent);
  ok(u1 === u2 && u1 !== '09:59', 'urgency countdown stops when results is left', [u1, u2]);
  await ev(() => showScreen('screen-results'));
  await page.waitForTimeout(1200);
  const u3 = await ev(() => document.getElementById('urgency-timer').textContent);
  ok(u3 !== u2, 'urgency countdown resumes on return to results', [u2, u3]);
  await ev(() => goHome());
  const free = await ev(() => document.querySelector('#category-list-teaser .unlocked-tag')?.textContent);
  ok(free === 'free', 'teaser "free" tag via i18n', free);

  // ---------- ticker + hidden tab ----------
  const hid = await ev(async () => {
    const real = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    const r = { cls: document.documentElement.classList.contains('doc-hidden'), ticker: tickerInt, play: getComputedStyle(document.querySelector('.glow-field .g1')).animationPlayState };
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
    r.after = { cls: document.documentElement.classList.contains('doc-hidden'), ticker: !!tickerInt };
    return r;
  });
  ok(hid.cls && hid.ticker === null && hid.play === 'paused' && !hid.after.cls && hid.after.ticker, 'hidden tab: html.doc-hidden, animations paused, ticker interval stopped and restarted', hid);
  await ev(() => setLanguage('es'));
  ok(/acaba de sacar/.test(await ev(() => document.getElementById('ticker-text').textContent)), 'ticker re-rendered on language switch');
  await ev(() => setLanguage('en'));

  // ---------- member with a hostile name, reload ----------
  await ev(() => {
    const nm = '<img src=x onerror="window.__xss2=1">Q';
    const a = { 'qa@x.com': { name: nm, email: 'qa@x.com', pw: hash('secret1'), plus: true, created: Date.now(), progress: { speed: { 1: 3 } }, lastReport: window._reportData, plan: 'monthly' } };
    localStorage.setItem('etsem_accounts', JSON.stringify(a));
    localStorage.setItem('etsem_session', JSON.stringify({ name: nm, email: 'qa@x.com', plus: true }));
    localStorage.setItem('etsem_best_qa@x.com', JSON.stringify({ speed: 88 }));
    localStorage.setItem('etsem_progress_guest', JSON.stringify({ memmatrix: { 1: 1 } }));
    const n = Math.floor(Date.now()/1000);
    localStorage.setItem('etsem_whop_token', 'eyJ0eXAiOiJzZXNzIn0.' + 'A'.repeat(43));
    localStorage.setItem('etsem_whop_ent', JSON.stringify({ user:{id:'user_plus222',username:'plususer'}, plus:true, admin:false, iat:n, verified_at:n, exp:n+3600 }));
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(300);
  await ev(() => renderMobileMenu());
  const x2 = await ev(() => ({ xss: window.__xss2 === 1, nav: !!document.querySelector('#auth-nav img'), sheet: !!document.querySelector('#msheet img'), chip: document.querySelector('.avatar-chip')?.tagName }));
  ok(!x2.xss && !x2.nav && !x2.sheet && x2.chip === 'A', 'user name is escaped in auth nav + mobile sheet; avatar chip is a link', x2);
  ok(await active() === 'screen-lobby', 'member boots to lobby');
  await page.click('#screen-lobby .lobby-actions .btn-secondary >> nth=0');
  const rep = await ev(() => ({ s: document.getElementById('exact-score').textContent, id: document.getElementById('cert-id').textContent, pct: document.getElementById('percentile-pill').textContent, want: iqPercentile(window._reportData.iq) + '%', cats: document.querySelectorAll('#category-list-full .full-cat-row').length, name: document.getElementById('cert-name').value }));
  ok(/^\d+$/.test(rep.s) && /^ETSM-/.test(rep.id) && rep.pct === rep.want && rep.cats === 5, 'reload → View report shows score, certificate id and normal-CDF percentile', rep);
  const cid1 = rep.id;
  await page.reload({ waitUntil: 'load' });
  await ev(() => showScreen('screen-report'));
  ok(await ev(() => document.getElementById('cert-id').textContent) === cid1, 'certificate id is stable across reloads');
  await ev(() => setLanguage('he'));
  const he = await ev(() => ({ cat: document.querySelector('#category-list-full .full-cat-name').textContent, mark: document.querySelector('#screen-report .cert-mark').textContent, ph: document.getElementById('cert-name').placeholder, dir: document.documentElement.dir }));
  ok(/[֐-׿]/.test(he.cat) && /תוצאה רשמית/.test(he.mark) && he.ph === 'השם שלכם', 'report re-renders in Hebrew incl. certificate strings', he);
  const rtl = await ev(() => ({ back: document.querySelector('#screen-how .back-link').textContent, dur: document.querySelector('.stat-strip .stat:nth-child(3) b').textContent }));
  ok(rtl.back.startsWith('→') && rtl.dur === 'כ־22 דק׳', 'RTL: back link arrow flipped, duration localised', rtl);
  await ev(() => setLanguage('en'));
  ok((await ev(() => document.querySelector('#screen-how .back-link').textContent)).startsWith('←'), 'LTR back arrow unchanged');

  // ---------- mid-question language switch in a game ----------
  const g = await ev(() => {
    playLevel('speed', 1);
    const a = engine.qs[0].ans;
    selectOption((a + 1) % 4);
    const c1 = engine.correct || 0;
    setLanguage('he');
    selectOption(a);                       // try to re-pick the right answer
    const r = { locked: engine.locked, sel: engine.sel, want: (a + 1) % 4, c1, c2: engine.correct || 0,
      wrongMark: document.querySelector(`.option[data-i="${(a + 1) % 4}"]`).classList.contains('is-wrong'),
      rightMark: document.querySelector(`.option[data-i="${a}"]`).classList.contains('is-correct') };
    setLanguage('en'); disarmActivity(); return r;
  });
  ok(g.locked && g.sel === g.want && g.c1 === g.c2 && g.wrongMark && g.rightMark, 'game: language switch keeps the lock and marks, no re-pick', g);
  await ev(() => goHome());

  // ---------- Bob XSS ----------
  await page.click('.bob-fab', { force: true });
  await page.waitForTimeout(300);
  ok(await ev(() => document.querySelector('.bob-fab').getAttribute('aria-expanded')) === 'true', 'bob-fab aria-expanded');
  const payload = '<img src=x onerror="window.__xss=1">';
  await page.fill('#bob-input', payload);
  await page.press('#bob-input', 'Enter');
  await page.waitForTimeout(1600);
  const bx = await ev(() => ({ xss: window.__xss === 1, img: !!document.querySelector('#bob-thread img'), txt: [...document.querySelectorAll('#bob-thread .bubble.user')].pop().textContent }));
  ok(!bx.xss && !bx.img && bx.txt === payload, 'Bob chat shows user text literally, no script runs', bx);
  await page.keyboard.press('Escape');
  ok(await ev(() => document.activeElement.classList.contains('bob-fab')), 'closing Bob returns focus to the button');

  // ---------- dialog focus trap ----------
  await ev(() => playLevel('speed', 1));
  await page.focus('.logo');
  await page.keyboard.press('Enter');
  ok(await ev(() => document.getElementById('dlg-scrim').classList.contains('open')), 'exit-guard dialog opens');
  await page.waitForTimeout(80);
  let inside = true;
  for (let i = 0; i < 7; i++) { await page.keyboard.press('Tab'); inside = inside && await ev(() => !!document.activeElement.closest('#dlg-box')); }
  for (let i = 0; i < 5; i++) { await page.keyboard.press('Shift+Tab'); inside = inside && await ev(() => !!document.activeElement.closest('#dlg-box')); }
  ok(inside, 'Tab / Shift+Tab stay inside the dialog');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  ok(await ev(() => document.activeElement.classList.contains('logo')), 'focus returns to the opener after the dialog closes', await ev(() => document.activeElement.className));
  await ev(() => disarmActivity());

  // ---------- logout clears ----------
  const lo = await ev(() => {
    doLogout();
    return { report: window._reportData, cert: lastCertId, prog: JSON.stringify(gameProgress), best: JSON.stringify(bestScores), thread: document.getElementById('bob-thread').children.length, score: document.getElementById('exact-score').textContent, certName: document.getElementById('cert-name').value, fact: bobFacts().iq, screen: document.querySelector('.screen.active').id };
  });
  ok(lo.report === null && lo.cert === null && lo.prog === '{"memmatrix":{"1":1}}' && lo.best === '{}' && lo.thread === 0 && lo.score === '—' && lo.certName === '' && lo.fact === undefined && lo.screen === 'screen-landing', 'logout clears report, cert id, progress (→ guest), bests, Bob thread, report DOM', lo);
  ok(await ev(() => !document.getElementById('bob-panel').classList.contains('open')), 'Bob panel closed after logout');
  await page.click('.bob-fab', { force: true }); await page.waitForTimeout(300);
  ok(await ev(() => document.getElementById('bob-thread').children.length) === 1, 'Bob greets the next person afresh');
  await page.keyboard.press('Escape');

  // ---------- language sweep: desktop + 375 ----------
  const sweep = async (pg, w) => {
    const screens = await pg.evaluate(() => [...document.querySelectorAll('.screen')].map(s => s.id));
    const probs = [];
    for (const l of ['en', 'he', 'es', 'ru', 'ar']) {
      await pg.evaluate(x => setLanguage(x), l);
      for (const id of screens) {
        await pg.evaluate(i => { disarmActivity(); showScreen(i, { force: true }); }, id);
        const r = await pg.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
        if (r.sw > r.cw) probs.push(`${w} ${l} ${id} overflow ${r.sw}>${r.cw}`);
      }
      const raw = await pg.evaluate(() => [...document.querySelectorAll('[data-i18n],[data-i18n-aria]')].filter(e => { const k = e.dataset.i18n || e.dataset.i18nAria; return (e.textContent === k) || e.getAttribute('aria-label') === k; }).map(e => e.dataset.i18n || e.dataset.i18nAria));
      if (raw.length) probs.push(`${w} ${l} raw keys: ${raw.join(',')}`);
    }
    await pg.evaluate(() => { setLanguage('en'); showScreen('screen-landing', { force: true }); });
    return probs;
  };
  const p1 = await sweep(page, 1280);
  ok(p1.length === 0, 'desktop: 5 languages × all screens, no overflow, no raw keys', p1);

  const { page: mp } = await mk({ width: 375, height: 812 }, true);
  const p2 = await sweep(mp, 375);
  ok(p2.length === 0, '375px: 5 languages × all screens, no overflow, no raw keys', p2);
  const blur = await mp.evaluate(() => ({ b: getComputedStyle(document.querySelector('.glow-field .g1')).filter, g5: getComputedStyle(document.querySelector('.glow-field .g5')).display }));
  ok(blur.b === 'blur(40px)' && blur.g5 === 'none', 'phone: lighter blur, fewer blobs', blur);
  // mobile sheet focus
  await mp.click('#mnav-toggle');
  await mp.waitForTimeout(350);
  ok(await mp.evaluate(() => !!document.activeElement.closest('#msheet')), 'mobile sheet: focus moves into the sheet', await mp.evaluate(() => document.activeElement.className));
  let ins = true;
  for (let i = 0; i < 25; i++) { await mp.keyboard.press('Tab'); ins = ins && await mp.evaluate(() => !!document.activeElement.closest('#msheet')); }
  await mp.keyboard.press('Shift+Tab'); ins = ins && await mp.evaluate(() => !!document.activeElement.closest('#msheet'));
  ok(ins, 'mobile sheet: Tab is trapped');
  await mp.keyboard.press('Escape');
  await mp.waitForTimeout(350);
  const ms = await mp.evaluate(() => ({ open: document.getElementById('msheet').classList.contains('open'), focus: document.activeElement.id }));
  ok(!ms.open && ms.focus === 'mnav-toggle', 'mobile sheet: Escape closes and focus returns to the toggle', ms);
  await mp.evaluate(() => setLanguage('ar'));
  ok(await mp.evaluate(() => document.getElementById('mnav-toggle').getAttribute('aria-label')) === 'القائمة والإعدادات', 'icon button names are translated (ar)');

  ok(errors.length === 0, 'zero console errors', errors);
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('SCRIPT FAIL', e); process.exit(2); });
