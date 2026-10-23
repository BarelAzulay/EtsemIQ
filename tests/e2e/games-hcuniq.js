const { open, OUT } = require('./games-harness.js');
(async () => {
  const { browser, page, errors } = await open({});
  const r = await page.evaluate(() => { const bad=[]; HARDCORE_BANK().forEach(q => { if (q.oddOut) return; const h=q.opts.map(o => o.val!==undefined?JSON.stringify(o.val):svgFor(o)); if (new Set(h).size!==h.length) bad.push(q.id); }); return {n:HARDCORE_BANK().length,bad}; });
  console.log(JSON.stringify(r)); console.log(errors.length?errors.join('\n'):'no errors'); await browser.close();
})();
