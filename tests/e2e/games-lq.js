const { open, OUT } = require('./games-harness.js');
const S = OUT + require('path').sep;
(async () => {
  const { browser, page, errors } = await open({ vp: { width: 375, height: 800 } });
  const ev = (f, a) => page.evaluate(f, a);
  const tap = i => page.click(`#pz-board .grid-tile[data-i="${i}"]`);
  for (const lvl of [1, 6, 10, 16, 18, 22, 27, 33, 40, 44, 48, 50]) {
    await ev(l => playLevel('puzzle', l), lvl);
    const st = await ev(() => ({ mode: pzState.mode, targets: pzState.targets.slice(), ordered: pzState.ordered, moves: pzState.movesLeft, n: pzState.tiles.length,
      nums: new Set(pzState.tiles.map(t => t.n)).size }));
    if (st.nums !== st.n) console.log('DUP NUMBERS at', lvl);
    // in ordered modes, tap a FUTURE target first (the old soft-lock), then play correctly
    if (st.ordered && st.targets.length > 2) await tap(st.targets[st.targets.length - 1]);
    else { const non = await ev(() => pzState.tiles.map((t, i) => i).find(i => !pzState.targets.includes(i))); if (non !== undefined) await tap(non); }
    await page.waitForTimeout(620);
    for (const i of st.targets) { await tap(i); }
    await page.waitForTimeout(700);
    const res = await ev(() => ({ scr: document.querySelector('.screen.active').id, tag: document.getElementById('lr-passtag').textContent,
      stars: document.querySelectorAll('#lr-stars span:not(.dim)').length, extra: document.getElementById('lr-extra').innerText.replace(/\n/g, ' | ') }));
    console.log(`L${lvl} ${st.mode} ordered=${st.ordered} targets=${st.targets.length} -> ${res.scr} ${res.tag} ★${res.stars} :: ${res.extra}`);
    if (lvl === 33) await page.screenshot({ path: S + 'lq-result.png' });
  }
  // out of moves: level 45 slack 1 -> two wrong taps make it impossible
  await ev(() => playLevel('puzzle', 45));
  await page.screenshot({ path: S + 'lq-45.png' });
  const t2 = await ev(() => pzState.targets.slice());
  await tap(t2[t2.length - 1]); await page.waitForTimeout(600);
  await tap(t2[t2.length - 2]); await page.waitForTimeout(1000);
  console.log('out of moves ->', await ev(() => [document.querySelector('.screen.active').id, document.getElementById('lr-passtag').textContent, document.getElementById('lr-blurb').textContent]));
  // stale timer: chain level hides at 3000ms; restart at 2000ms; board must still be visible 1500ms later
  await ev(() => playLevel('puzzle', 40));
  await page.waitForTimeout(2000);
  await ev(() => loadPuzzleLevel(currentLevel));
  await page.waitForTimeout(1500);
  console.log('after restart, hidden (expect false):', await ev(() => pzState.hidden));
  await page.waitForTimeout(1700);
  console.log('new run hides on its own schedule (expect true):', await ev(() => pzState.hidden));
  // leave mid-level: timers should not fire into another screen
  await ev(() => playLevel('puzzle', 40));
  await ev(() => openLevelMap('puzzle'));
  await page.waitForTimeout(300);
  await page.click('#dlg-box .k-primary'); // stay
  await page.waitForTimeout(3000);
  console.log('stayed, board hides (expect true):', await ev(() => pzState.hidden));
  await ev(() => playLevel('puzzle', 40));
  await ev(() => openLevelMap('puzzle'));
  await page.waitForTimeout(300);
  await page.click('#dlg-box .k-danger'); // leave
  await page.waitForTimeout(3000);
  console.log('left level, hidden flag (expect false):', await ev(() => pzState.hidden));
  // contrast check of tile labels
  await ev(() => playLevel('puzzle', 44));
  await page.screenshot({ path: S + 'lq-44.png' });
  console.log('ink', await ev(() => PZ_INK.join(',')));
  console.log(errors.join('\n') || 'no errors');
  await browser.close();
})();
