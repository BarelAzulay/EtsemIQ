const { open, OUT } = require('./games-harness.js');
(async () => {
  const { browser, page, errors } = await open({});
  // Logic Quest
  await page.evaluate(() => { currentGameKey='puzzle'; loadPuzzleLevel(3); });
  const a = await page.evaluate(() => document.getElementById('pz-target').textContent);
  await page.evaluate(() => setLanguage('he'));
  const b = await page.evaluate(() => document.getElementById('pz-target').textContent);
  console.log('LQ', a.slice(0,40), '=>', b.slice(0,40), /[֐-׿]/.test(b));
  await page.evaluate(() => { setLanguage('en'); showScreen('screen-landing', true); });
  // memorize
  await page.evaluate(() => { disarmActivity && disarmActivity(); beginTest(); });
  const w1 = await page.evaluate(() => document.getElementById('memorize-word').textContent);
  await page.evaluate(() => setLanguage('ru'));
  const w2 = await page.evaluate(() => document.getElementById('memorize-word').textContent);
  console.log('MEM', w1, '=>', w2);
  // range clamp
  const r = await page.evaluate(() => { const fn = (iq)=>`${Math.max(68,iq-6)}–${Math.min(148,iq+6)}`; return fn(148); });
  console.log('range', r);
  console.log(errors.length ? errors.join('\n') : 'no errors');
  await browser.close();
})();
