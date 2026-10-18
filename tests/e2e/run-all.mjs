#!/usr/bin/env node
// Runs every e2e suite sequentially, prints a summary table, exits non-zero on any failure.
// Each suite signals failure differently, so every one has a `verify(out)` that returns a list of problems.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const only = process.argv.slice(2);   // optional name filters, e.g. `node run-all.mjs whop quiz`

// "N passed, M failed" suites (also exit non-zero on failure)
const passedFailed = out => {
  const m = out.match(/(\d+) passed, (\d+) failed/);
  if (!m) return ['no "N passed, M failed" summary line'];
  return +m[2] ? [`${m[2]} check(s) failed`] : (+m[1] ? [] : ['0 checks ran']);
};
// Game suites print "no errors" last when the page logged nothing; anything else is console/page errors.
const noErrors = out => {
  const lines = out.trim().split('\n').map(s => s.trimEnd());
  const bad = lines.filter(l => /^\[(console|pageerror)\]/.test(l) || /^(DUP NUMBERS|FAIL|SCRIPT FAIL)/.test(l));
  const p = [];
  if (lines[lines.length - 1] !== 'no errors') p.push('output does not end with "no errors"');
  if (bad.length) p.push(...bad.slice(0, 3));
  return p;
};
// "... (expect X): value" lines are assertions
const expects = out => out.split('\n').flatMap(l => {
  const m = l.match(/\(expect (\w+)\):\s*(\w+)\s*$/);
  return m && m[1] !== m[2] ? [`expected ${m[1]}, got ${m[2]}: ${l}`] : [];
});

const quiz = (args, label) => ({
  name: `quiz ${label}`, cmd: 'node', args: ['tests/e2e/games-quiz.js', ...args],
  verify: out => {
    const p = noErrors(out);
    const n = args[1].split(',').length;
    const lv = out.split('\n').filter(l => /^\w+ L\d+: \d+ items/.test(l));
    if (lv.length !== n) p.push(`expected ${n} level results, got ${lv.length}`);
    lv.filter(l => !/-> screen-levelresult /.test(l)).forEach(l => p.push('level did not reach result: ' + l));
    if (!/timer low class: timer low/.test(out)) p.push('timer-low class missing');
    return p;
  },
});

const suites = [
  { name: 'core-fixes', cmd: 'node', args: ['tests/e2e/core-fixes.js'], verify: passedFailed },
  { name: 'whop-auth', cmd: 'node', args: ['tests/e2e/whop-auth.js'], verify: passedFailed },
  { name: 'new-games', cmd: 'node', args: ['tests/e2e/new-games.js'],
    verify: out => {
      const rows = out.split('\n').filter(l => /^\w+-\d+ (ok|FAIL)/.test(l));
      const p = [];
      if (rows.length !== 10) p.push(`expected 10 configs, got ${rows.length}`);
      rows.filter(l => !/ ok/.test(l.slice(0, 20))).forEach(l => p.push(l));
      return p;
    } },
  quiz(['speed', '1,20,45', 'en', '1280'], 'speed'),
  quiz(['spatial', '1,30,50', 'he', '375'], 'spatial'),
  quiz(['wordrecall', '1,25,50', 'ar', '375'], 'wordrecall'),
  { name: 'hc_test', cmd: 'node', args: ['tests/e2e/games-hc.js', '390', 'en'],
    verify: out => {
      const p = noErrors(out);
      const runs = out.split('\n').filter(l => /^run \d:/.test(l));
      if (runs.length !== 3) p.push(`expected 3 runs, got ${runs.length}`);
      runs.filter(l => !/"scr":"screen-hcresult"/.test(l)).forEach(l => p.push('run did not reach result: ' + l));
      return p;
    } },
  { name: 'lq_test', cmd: 'node', args: ['tests/e2e/games-lq.js'],
    verify: out => {
      const p = [...noErrors(out), ...expects(out)];
      const lv = out.split('\n').filter(l => /^L\d+ /.test(l));
      if (lv.length !== 12) p.push(`expected 12 level rows, got ${lv.length}`);
      lv.filter(l => !/-> screen-levelresult LEVEL CLEARED/.test(l)).forEach(l => p.push('level not cleared: ' + l));
      if (!/out of moves ->[\s\S]*NOT YET/.test(out)) p.push('out-of-moves did not show NOT YET');
      return p;
    } },
  { name: 'selfcheck', cmd: 'node', args: ['tests/e2e/games-selfcheck.js'],
    verify: out => {
      const p = noErrors(out);
      const j = out.split('\n')[0];
      if (!j.startsWith('{')) p.push('no self-check JSON');
      else {
        const bads = [...j.matchAll(/"bad":(\[[^\]]*\])/g)];
        if (bads.length < 3) p.push('self-check JSON incomplete');
        bads.filter(m => m[1] !== '[]').forEach(m => p.push('self-check bad: ' + m[1]));
      }
      return p;
    } },
  { name: 'langswitch', cmd: 'node', args: ['tests/e2e/games-langswitch.js'],
    verify: out => {
      const p = noErrors(out);
      if (!/^LQ .* true$/m.test(out)) p.push('Logic Quest did not switch to Hebrew');
      const m = out.match(/^MEM (.+) => (.+)$/m);
      if (!m || m[1] === m[2]) p.push('memorize word did not change language');
      return p;
    } },
  { name: 'hcuniq', cmd: 'node', args: ['tests/e2e/games-hcuniq.js'],
    verify: out => {
      const p = noErrors(out);
      if (!/"bad":\[\]/.test(out)) p.push('duplicate options found: ' + out.split('\n')[0]);
      return p;
    } },
  { name: 'qa-free-test', cmd: 'node', args: ['docs/qa/qa-free-test.mjs'],
    verify: out => /PASSED: 0 failure\(s\)/.test(out) ? [] : ['no "PASSED: 0 failure(s)" line'] },
  { name: 'api tests', cmd: 'npm', args: ['--prefix', 'api', 'test'],
    verify: out => {
      const f = out.match(/^# fail (\d+)/m), t = out.match(/^# tests (\d+)/m);
      if (!f || !t) return ['no node:test summary'];
      return +f[1] ? [`${f[1]} test(s) failed`] : (+t[1] ? [] : ['0 tests ran']);
    } },
];

const results = [];
for (const s of suites) {
  if (only.length && !only.some(o => s.name.includes(o))) continue;
  process.stdout.write(`\n=== ${s.name}: ${s.cmd} ${s.args.join(' ')}\n`);
  const t0 = Date.now();
  const r = spawnSync(s.cmd, s.args, { cwd: repo, encoding: 'utf8', env: process.env, maxBuffer: 256 * 1024 * 1024, timeout: 15 * 60 * 1000 });
  const out = (r.stdout || '') + (r.stderr ? '\n' + r.stderr : '');
  const tail = out.trim().split('\n').slice(-12).join('\n');
  console.log(tail);
  const problems = [];
  if (r.error) problems.push('spawn: ' + r.error.message);
  else if (r.status !== 0) problems.push(`exit code ${r.status}${r.signal ? ' (' + r.signal + ')' : ''}`);
  problems.push(...s.verify(r.stdout || ''));
  results.push({ name: s.name, ok: !problems.length, secs: ((Date.now() - t0) / 1000).toFixed(1), why: problems.slice(0, 2).join('; ') });
}

const w = Math.max(5, ...results.map(r => r.name.length));
console.log('\n' + 'SUITE'.padEnd(w) + '  RESULT  TIME    NOTES');
for (const r of results) console.log(r.name.padEnd(w) + '  ' + (r.ok ? 'PASS  ' : 'FAIL  ') + '  ' + (r.secs + 's').padEnd(7) + ' ' + r.why);
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} suites passed`);
process.exit(failed || !results.length ? 1 : 0);
