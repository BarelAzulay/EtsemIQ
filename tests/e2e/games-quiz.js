// node games-quiz.js <gameKey> <levels comma> [lang] [width]
const { open, OUT } = require('./games-harness.js');
const S = OUT + require('path').sep;
(async () => {
  const [key, lv, lang, w] = process.argv.slice(2);
  const { browser, page, errors } = await open({ vp: { width: +(w || 390), height: 820 }, lang: lang || 'en' });
  const ev = (f, a) => page.evaluate(f, a);
  for (const lvl of lv.split(',').map(Number)) {
    await ev(([k, l]) => playLevel(k, l), [key, lvl]);
    const n = await ev(() => engine.qs.length);
    const t0 = Date.now();
    for (let i = 0; i < n; i++) {
      const q = await ev(() => ({ cur: engine.cur, ans: engine.qs[engine.cur].ans, k: engine.qs[engine.cur].opts.length }));
      const right = !(i === 1);              // miss the 2nd one on purpose
      if (i === 2 && lvl === +lv.split(',')[0]) await page.screenshot({ path: S + `${key}-${lvl}-q.png` });
      await page.click(`.option[data-i="${right ? q.ans : (q.ans + 1) % q.k}"]`);
      if (i === 1) { await page.waitForTimeout(150); await page.screenshot({ path: S + `${key}-${lvl}-wrong.png` }); }
      // wait for auto-advance (no Next tap)
      const want = i + 1;
      for (let w = 0; w < 40; w++) { const c = await ev(() => document.querySelector('.screen.active').id === 'screen-quiz' ? engine.cur : 99); if (c >= want) break; await page.waitForTimeout(80); }
    }
    await page.waitForTimeout(400);
    const res = await ev(() => ({ scr: document.querySelector('.screen.active').id, score: document.getElementById('lr-score').textContent, extra: document.getElementById('lr-extra').innerText.replace(/\n+/g, ' | ') }));
    console.log(`${key} L${lvl}: ${n} items in ${Date.now() - t0}ms -> ${res.scr} ${res.score} :: ${res.extra}`);
  }
  // timer-low pulse
  await ev(([k]) => playLevel(k, 1), [key]);
  await ev(() => { engine.left = 9; updateTimer(); });
  console.log('timer low class:', await ev(() => document.getElementById('timer-label').className));
  await page.screenshot({ path: S + `${key}-low.png` });
  console.log(errors.join('\n') || 'no errors');
  await browser.close();
})();
