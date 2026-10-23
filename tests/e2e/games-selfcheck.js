const { open, OUT } = require('./games-harness.js');
(async () => {
  const { browser, page, errors } = await open({});
  const r = await page.evaluate(() => gamesSelfCheck(3000));
  console.log(JSON.stringify(r).slice(0, 600));
  for (const l of ['he','es','ru','ar']) { await page.evaluate(x => setLanguage(x), l); await page.evaluate(() => openGamesHub()); }
  console.log(errors.length ? errors.join('\n') : 'no errors');
  await browser.close();
})();
