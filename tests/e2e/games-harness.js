// shared harness
const { chromium, launchOpts, URL, OUT } = require('./lib.js');
async function open(opts = {}) {
  const browser = await chromium.launch(launchOpts());
  const ctx = await browser.newContext({ viewport: opts.vp || { width: 1280, height: 860 }, reducedMotion: opts.reduced ? 'reduce' : 'no-preference' });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.route('https://etsemiq-api.etsemiq.workers.dev/**', r => { const n=Math.floor(Date.now()/1000); r.fulfill({status:200, contentType:'application/json', headers:{'access-control-allow-origin':'*'}, body: JSON.stringify({ user:{id:'user_plus222',username:'plususer'}, plus:true, admin:false, iat:n, verified_at:n, exp:n+3600 }) }); });
  await ctx.addInitScript(() => { const n=Math.floor(Date.now()/1000); try{ localStorage.setItem('etsem_whop_token','eyJ0eXAiOiJzZXNzIn0.'+'A'.repeat(43)); localStorage.setItem('etsem_whop_ent', JSON.stringify({ user:{id:'user_plus222',username:'plususer'}, plus:true, admin:false, iat:n, verified_at:n, exp:n+3600 })); }catch(e){} });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED/.test(m.text())) errors.push(`[console] ${m.text()}`); });
  page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));
  await page.goto(URL, { waitUntil: 'load' });
  await page.evaluate(() => { currentUser = { name: 'Tess Tester', email: 'tess@example.com', plus: true }; });
  if (opts.lang) await page.evaluate(l => setLanguage(l), opts.lang);
  return { browser, ctx, page, errors };
}
module.exports = { open, URL, OUT };
