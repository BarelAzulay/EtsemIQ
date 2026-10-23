# Browser e2e suites

Playwright/Chromium suites that load `index.html` from disk (`file://`), mock the Whop API where needed,
and drive the real UI. `run-all.mjs` also runs the free-test QA script and the API unit tests.

## Run

```
npm i -D playwright          # or: export NODE_PATH=/path/to/node_modules   (a dir containing playwright)
npm run test:e2e             # = node tests/e2e/run-all.mjs
node tests/e2e/run-all.mjs whop quiz   # only suites whose name contains one of the args
```

Prints a summary table and exits non-zero if any suite fails. Each suite signals failure differently
(`N passed, M failed`, a trailing `no errors`, `"bad":[]`, exit codes, node:test counts); `run-all.mjs` checks all of them.

Environment:

| Variable | Meaning | Default |
|---|---|---|
| `E2E_PAGE` | page under test | `<repo>/index.html` |
| `CHROMIUM_PATH` | Chromium binary | `/opt/pw-browsers/chromium` if present, else Playwright's own build (`npx playwright install chromium`) |
| `E2E_OUT` | screenshots | `<tmpdir>/etsemiq-e2e` |

`npm --prefix api test` needs no installs. Every suite can also be run alone, e.g. `node tests/e2e/games-quiz.js speed 1,20,45 en 1280`.

## Suites

| File | Covers |
|---|---|
| `core-fixes.js` | 46 checks on core fixes: timers/intervals cleanup, mobile menu sheet and focus, translated icon-button names, zero console errors (`node core-fixes.js [index.html]`) |
| `whop-auth.js` | 91 checks on the Whop auth client with a mocked `api.etsemiq.com`: free/plus/admin, bad/expired session, API down, nav badges, five languages at desktop and 375px |
| `new-games.js` | Brain Bites round, Daily Bites and a full Brain Twins game, 10 configs (5 languages x 2 viewports): self-check, overflow, share text, console errors. Env: `LANGS`, `VIEWS`, `SHOTS`, `REDUCED`, `DARK` |
| `games-quiz.js` | `<game> <levels> [lang] [width]`: plays levels of speed / spatial / wordrecall (one deliberate miss), result screen, timer-low state |
| `games-hc.js` | `[width] [lang]`: Hardcore mode, 3 runs, result and best score, question rotation |
| `games-lq.js` | Logic Quest: 12 levels across modes, no soft-lock on early taps, out-of-moves, stale timers on restart/leave |
| `games-selfcheck.js` | `gamesSelfCheck(3000)` generator sanity for speed, spatial, word, then hub in he/es/ru/ar |
| `games-langswitch.js` | Language change mid-level (Logic Quest, memorize word), IQ range clamp |
| `games-hcuniq.js` | No duplicate options in the Hardcore bank |
| `games-harness.js`, `lib.js` | Shared helpers (Plus session mocks, launch options, paths); not suites |
| `../../docs/qa/qa-free-test.mjs` | Free-test structure, distinctness, machine-solved keys, scoring simulation |
| `../../api/test` | Worker API unit tests (`node --test`) |
