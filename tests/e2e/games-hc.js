const { open, OUT } = require('./games-harness.js');
const S = OUT + require('path').sep;
(async () => {
  const { browser, page, errors } = await open({ vp: { width: +(process.argv[2] || 390), height: 820 }, lang: process.argv[3] || 'en' });
  const ev = (f, a) => page.evaluate(f, a);
  const runs = [];
  for (let r = 0; r < 3; r++) {
    await ev(() => startHardcore());
    const ids = await ev(() => engine.qs.map(q => q.id));
    runs.push(ids);
    const n = ids.length;
    for (let i = 0; i < n; i++) {
      const q = await ev(() => ({ ans: engine.qs[engine.cur].ans, k: engine.qs[engine.cur].opts.length }));
      const right = r === 0 ? i < 7 : (r === 1 ? i < 7 : i < 8);   // 70%, 70% (faster), 80%
      await page.click(`.option[data-i="${right ? q.ans : (q.ans + 1) % q.k}"]`);
      for (let w = 0; w < 40; w++) { const c = await ev(() => document.querySelector('.screen.active').id === 'screen-quiz' ? engine.cur : 99); if (c > i) break; await page.waitForTimeout(80); }
    }
    if (r === 1) await ev(() => {});   // second run is naturally a bit faster or equal
    await page.waitForTimeout(600);
    console.log(`run ${r + 1}:`, JSON.stringify(await ev(() => ({ scr: document.querySelector('.screen.active').id, score: document.getElementById('hc-correct').textContent, time: document.getElementById('hc-time').textContent, best: document.getElementById('hc-bestval').textContent, newbest: document.getElementById('hc-newbest').style.display !== 'none', meta: gameProgress._meta.hc }))));
  }
  const overlap = (a, b) => a.filter(x => b.includes(x)).length;
  console.log('overlap run1/run2:', overlap(runs[0], runs[1]), ' run2/run3:', overlap(runs[1], runs[2]), ' run1/run3:', overlap(runs[0], runs[2]));
  await page.screenshot({ path: S + 'hc-result.png', fullPage: false });
  console.log('card best:', await ev(() => { openGamesHub(); return document.querySelector('.game-card.hardcore .game-meta b').textContent; }));
  console.log(errors.join('\n') || 'no errors');
  await browser.close();
})();
