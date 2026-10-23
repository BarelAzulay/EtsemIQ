#!/usr/bin/env node
/* =====================================================================
   Etsem.IQ — Free Test QA
   =====================================================================
   Loads index.html in Chromium and checks every item, in every language,
   in every parallel form. It exits non-zero if anything fails.

     node docs/qa/qa-free-test.mjs              structural + machine checks,
                                                shuffle and scoring simulation
     node docs/qa/qa-free-test.mjs --e2e        + a full run through the UI in
                                                all five languages at 375px
     node docs/qa/qa-free-test.mjs --e2e --shots <dir>   + screenshots

   Playwright is resolved from PLAYWRIGHT_PATH, then NODE_PATH, then the
   normal module path. Chromium comes from CHROMIUM_PATH, else
   /opt/pw-browsers/chromium if present, else Playwright's own build.

   What is checked (docs/QUESTION-AUDIT.md §5 and §8 explain each one):
   1  structure     30 slots, ≥2 parallel forms each, forms parallel (same
                    category, band, option count), key in range, prompts and
                    every localized option present in all five languages,
                    matrices 3×3 with exactly one blank (the last cell)
   2  distinctness  no two options share a signature, render to the same
                    markup, or rasterise to (nearly) the same pixels
   3  machine keys  series, matrices, balances, puzzles, digit spans and
                    truth-teller items are solved in code, and the solver
                    looks for a SECOND rule that would justify a distractor
   4  rotation      mirror/rotation items: the key matches a turned copy of
                    the target, pixel for pixel; no distractor does
   5  answer-set    the key must not be the unique "most common attribute
      bias          values" option (I-RAVEN's context-blind shortcut)
   6  shuffle       options are a permutation, the key travels with its
                    option, and key positions are uniform over sittings
   7  scoring       always-A…F, random guessing (10 000 sittings),
                    all-correct and all-wrong mapped to IQ
   8  e2e (--e2e)   the whole test in en/he/es/ru/ar at 375px: no console
                    errors, no horizontal overflow, RTL rows run right-to-left,
                    timed digits hide the options until withdrawn, results
   ===================================================================== */
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);
let pw;
try { pw = require(process.env.PLAYWRIGHT_PATH || 'playwright'); }
catch (e) { console.error('Playwright not found. Set NODE_PATH or PLAYWRIGHT_PATH.'); process.exit(2); }
const { chromium } = pw;

const HERE = path.dirname(fileURLToPath(import.meta.url));
/* QA_PAGE points the run at another copy of the page (used to mutation-test this script) */
const PAGE = pathToFileURL(path.resolve(process.env.QA_PAGE || path.resolve(HERE, '../../index.html'))).href;
const ARGS = process.argv.slice(2);
const E2E = ARGS.includes('--e2e');
const SHOTS = ARGS.includes('--shots') ? ARGS[ARGS.indexOf('--shots') + 1] : null;
const LANGS = ['en', 'he', 'es', 'ru', 'ar'];
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

let failures = 0, warnings = 0;
const fail = (m) => { failures++; console.log('  FAIL  ' + m); };
const warn = (m) => { warnings++; console.log('  warn  ' + m); };
const ok = (m) => console.log('  ok    ' + m);
const head = (m) => console.log('\n== ' + m);

/* ------------------------------------------------------------------ */
/* page helpers                                                        */
/* ------------------------------------------------------------------ */
async function openPage(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 900 } });
  /* fonts are external; answer them locally so the run is offline and quiet */
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  await page.goto(PAGE, { waitUntil: 'load' });
  await page.waitForTimeout(300);
  return { ctx, page, errors };
}

/* ------------------------------------------------------------------ */
/* solvers (run in Node on serialized item data)                        */
/* ------------------------------------------------------------------ */
const mod = (x, m) => ((x % m) + m) % m;

/* number series: every simple family that fits the given terms, and what it predicts */
function seriesFamilies(s) {
  const out = [];
  const n = s.length;
  const d = s.slice(1).map((x, i) => x - s[i]);
  const allEq = a => a.length > 0 && a.every(x => x === a[0]);
  if (allEq(d)) out.push(['constant difference', s[n - 1] + d[0]]);
  if (s.every(x => x !== 0)) {
    const r = s.slice(1).map((x, i) => x / s[i]);
    if (allEq(r) && Number.isInteger(r[0]) && r[0] !== 1) out.push(['constant ratio', s[n - 1] * r[0]]);
  }
  const d2 = d.slice(1).map((x, i) => x - d[i]);
  if (n >= 4 && allEq(d2)) out.push(['constant second difference', s[n - 1] + d[d.length - 1] + d2[0]]);
  const d3 = d2.slice(1).map((x, i) => x - d2[i]);
  if (n >= 5 && allEq(d3) && d3[0] !== 0) out.push(['constant third difference', s[n - 1] + d[d.length - 1] + d2[d2.length - 1] + d3[0]]);
  if (d.every(x => x !== 0) && n >= 4) {
    const rr = d.slice(1).map((x, i) => x / d[i]);
    if (allEq(rr) && Number.isInteger(rr[0]) && rr[0] !== 1) out.push(['differences in constant ratio', s[n - 1] + d[d.length - 1] * rr[0]]);
  }
  if (n >= 4) {
    const c = s.slice(2).map((x, i) => x - s[i] - s[i + 1]);
    if (allEq(c)) out.push([c[0] === 0 ? 'sum of the previous two' : `sum of the previous two ${c[0] > 0 ? '+' : ''}${c[0]}`, s[n - 1] + s[n - 2] + c[0]]);
  }
  for (let p = -5; p <= 5; p++) {
    if (p === 0 || p === 1) continue;
    const q = s[1] - p * s[0];
    if (Math.abs(q) > 60) continue;
    if (s.slice(1).every((x, i) => x === p * s[i] + q) && q !== 0) out.push([`×${p} ${q >= 0 ? '+' : ''}${q}`, p * s[n - 1] + q]);
  }
  /* two alternating operations, each +k or ×k */
  if (n >= 5) {
    const opsFor = (a, b) => { const o = [['+', b - a]]; if (a !== 0 && Number.isInteger(b / a) && b / a !== 1) o.push(['×', b / a]); return o; };
    const apply = (o, x) => o[0] === '+' ? x + o[1] : x * o[1];
    for (const o0 of opsFor(s[0], s[1])) for (const o1 of opsFor(s[1], s[2])) {
      if (o0[0] === o1[0] && o0[1] === o1[1]) continue;
      let good = true;
      for (let i = 1; i < n; i++) if (apply(i % 2 ? o0 : o1, s[i - 1]) !== s[i]) { good = false; break; }
      if (good) out.push([`alternating ${o0.join('')} / ${o1.join('')}`, apply(n % 2 ? o0 : o1, s[n - 1])]);
    }
  }
  /* two interleaved strands, each arithmetic or geometric, each with ≥3 known terms */
  if (n >= 6) {
    const strand = k => s.filter((_, i) => i % 2 === k);
    const next = n % 2;
    const t = strand(next);
    const fits = [];
    if (t.length >= 3) {
      const td = t.slice(1).map((x, i) => x - t[i]);
      if (allEq(td)) fits.push(['interleaved, arithmetic strand', t[t.length - 1] + td[0]]);
      if (t.every(x => x !== 0)) {
        const tr = t.slice(1).map((x, i) => x / t[i]);
        if (allEq(tr) && Number.isInteger(tr[0])) fits.push(['interleaved, geometric strand', t[t.length - 1] * tr[0]]);
      }
      const o = strand(1 - next);
      const od = o.slice(1).map((x, i) => x - o[i]), orr = o.slice(1).map((x, i) => x / o[i]);
      if (o.length >= 3 && (allEq(od) || allEq(orr))) fits.forEach(f => out.push(f));
    }
  }
  return out;
}

/* matrix / series attribute rules */
function cellAttrs(c) {
  if (c.fig) return { shape: c.fig.shape, inner: c.fig.inner || '-', n: c.fig.n || 0, line: c.fig.line || 'solid', rot: mod(c.fig.rot || 0, 360) };
  if (c.dots !== undefined) return { n: c.dots };
  if (c.glyph) return { glyph: c.glyph, rot: mod(c.rot || 0, 360), mir: !!c.mir };
  if (c.val !== undefined) return { v: Number(c.val) };
  return {};
}
/* the other way people read a mirrored glyph's angle: mirror first, then turn */
const altRot = a => (a.mir ? Object.assign({}, a, { rot: mod(360 - a.rot, 360) }) : a);
const NUMERIC = new Set(['n', 'rot', 'v']);
function gridRules(g, attr) {           /* g: 9 values, row-major */
  const m = attr === 'rot' ? 360 : 0;
  const sub = (a, b) => m ? mod(a - b, m) : a - b;
  const eq = (a, b) => m ? mod(a - b, m) === 0 : a === b;
  const R = [0, 1, 2].map(r => g.slice(r * 3, r * 3 + 3));
  const C = [0, 1, 2].map(c => [g[c], g[c + 3], g[c + 6]]);
  const same = a => a.every(x => eq(x, a[0]));
  const setKey = a => a.map(String).sort().join('|');
  const out = [];
  if (same(g)) out.push('constant');
  else {
    if (R.every(same)) out.push('constant in each row');
    if (C.every(same)) out.push('constant in each column');
  }
  const perm = L => L.every(x => new Set(x.map(String)).size === 3) && L.every(x => setKey(x) === setKey(L[0]));
  if (perm(R)) out.push('distribution of three across rows');
  if (perm(C)) out.push('distribution of three down columns');
  if (NUMERIC.has(attr)) {
    const a = g[0], kc = sub(g[1], g[0]), kr = sub(g[3], g[0]);
    if ((kc || kr) && g.every((x, i) => eq(x, a + kc * (i % 3) + kr * Math.floor(i / 3)))) out.push(`linear (+${kc} across, +${kr} down)`);
    const arith = L => L.every(x => sub(x[1], x[0]) !== 0 && eq(sub(x[2], x[1]), sub(x[1], x[0])));
    if (arith(R) && !out.some(s => s.startsWith('linear'))) out.push('each row arithmetic');
    if (arith(C) && !out.some(s => s.startsWith('linear'))) out.push('each column arithmetic');
    /* offset rules a solver might find instead: third = first + k, third = second + k */
    const off = (L, i, j) => { const k = sub(L[0][j], L[0][i]); return k !== 0 && L.every(x => eq(sub(x[j], x[i]), k)) ? k : null; };
    for (const [L, nm] of [[R, 'rows'], [C, 'columns']]) {
      const k02 = off(L, 0, 2), k12 = off(L, 1, 2);
      if (k02 !== null && !out.some(s => s.startsWith('linear'))) out.push(`third = first ${k02 > 0 ? '+' : ''}${k02} (${nm})`);
      if (k12 !== null && !out.some(s => s.startsWith('linear'))) out.push(`third = second ${k12 > 0 ? '+' : ''}${k12} (${nm})`);
    }
    if (!m) {
      if (R.every(x => x[2] === x[0] + x[1])) out.push('third = first + second (rows)');
      if (C.every(x => x[2] === x[0] + x[1])) out.push('third = first + second (columns)');
      if (R.every(x => x[2] === x[0] - x[1])) out.push('third = first − second (rows)');
      if (R.every(x => x[2] === Math.abs(x[0] - x[1])) && !R.every(x => x[2] === x[0] - x[1])) out.push('third = |first − second| (rows)');
      if (R.every(x => x[2] === x[0] * x[1]) ) out.push('third = first × second (rows)');
    }
  }
  /* wrapped diagonals (a Latin-square reading) */
  const diag = f => { const v = {}; return g.every((x, i) => { const k = f(Math.floor(i / 3), i % 3); if (!(k in v)) v[k] = x; return eq(v[k], x); }) && new Set(Object.values(v).map(String)).size === 3; };
  if (diag((r, c) => mod(c - r, 3))) out.push('constant along diagonals');
  if (diag((r, c) => mod(c + r, 3))) out.push('constant along anti-diagonals');
  return out;
}
function seqRules(s, attr) {
  const m = attr === 'rot' ? 360 : 0;
  const sub = (a, b) => m ? mod(a - b, m) : a - b;
  const eq = (a, b) => m ? mod(a - b, m) === 0 : a === b;
  const out = [];
  if (s.every(x => eq(x, s[0]))) out.push('constant');
  if (NUMERIC.has(attr)) {
    const k = sub(s[1], s[0]);
    if (k !== 0 && s.every((x, i) => i === 0 || eq(sub(x, s[i - 1]), k))) out.push(`step ${k}`);
  }
  if (s.length >= 4 && !eq(s[0], s[1]) && s.every((x, i) => i < 2 || eq(x, s[i - 2]))) out.push('alternates (period 2)');
  if (s.length >= 5 && s.every((x, i) => i < 3 || eq(x, s[i - 3])) && new Set(s.slice(0, 3).map(String)).size === 3) out.push('cycle of three');
  if (attr === 'mir' && s.length >= 4 && s.every((x, i) => i === 0 || x !== s[i - 1])) { if (!out.includes('alternates (period 2)')) out.push('alternates (period 2)'); }
  return out;
}

/* explain a completed matrix/series on every attribute; returns {explained, why} */
function explain(cells, kind, alt) {
  const A = cells.map(c => { const a = cellAttrs(c); return alt ? altRot(a) : a; });
  const attrs = Object.keys(A[0]);
  const why = {};
  let all = true;
  for (const at of attrs) {
    const vals = A.map(a => a[at]);
    const rules = kind === 'grid' ? gridRules(vals, at) : seqRules(vals, at);
    why[at] = rules;
    if (!rules.length) all = false;
  }
  return { explained: all, why };
}

/* balance: integer weights 1..12 that satisfy every scale, unique up to scale */
function solveBalance(bal) {
  const parse = s => s.split(' ');
  const scales = bal.scales.map(([l, r]) => [parse(l), parse(r)]);
  const shapes = [...new Set([...scales.flat(2), ...parse(bal.q)])];
  const sols = [];
  const w = {};
  const gcd = (a, b) => b ? gcd(b, a % b) : a;
  (function rec(i) {
    if (i === shapes.length) {
      const sum = l => l.reduce((t, k) => t + w[k], 0);
      if (scales.every(([l, r]) => sum(l) === sum(r))) {
        const g = shapes.reduce((t, k) => gcd(t, w[k]), 0);
        const key = shapes.map(k => w[k] / g).join(',');
        if (!sols.includes(key)) sols.push(key);
      }
      return;
    }
    for (let v = 1; v <= 12; v++) { w[shapes[i]] = v; rec(i + 1); }
  })(0);
  return { shapes, sols };
}
const weigh = (list, shapes, sol) => { const w = Object.fromEntries(shapes.map((k, i) => [k, +sol.split(',')[i]])); return list.reduce((t, k) => t + (w[k] ?? NaN), 0); };

/* polyominoes */
const pNorm = cs => { const r0 = Math.min(...cs.map(c => c[0])), c0 = Math.min(...cs.map(c => c[1])); return cs.map(([r, c]) => [r - r0, c - c0]).sort((a, b) => a[0] - b[0] || a[1] - b[1]); };
const pKey = cs => pNorm(cs).map(c => c.join('.')).join(',');
const pRot = cs => pNorm(cs.map(([r, c]) => [c, -r]));
const pMir = cs => pNorm(cs.map(([r, c]) => [r, -c]));
const pRots = cs => { const o = []; let x = pNorm(cs); for (let i = 0; i < 4; i++) { o.push(x); x = pRot(x); } return o; };
const pParse = s => { const o = []; s.split('/').forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') o.push([r, c]); })); return o; };
function tilings(target, pieces, flip) {
  const T = new Set(target.map(c => c.join(','))); const used = new Set(); let count = 0;
  const orients = pieces.map(p => { const s = new Map(); (flip ? [...pRots(p), ...pRots(pMir(p))] : pRots(p)).forEach(x => s.set(pKey(x), x)); return [...s.values()]; });
  if (pieces.reduce((a, p) => a + p.length, 0) !== target.length) return 0;
  const placed = [];
  (function rec() {
    if (placed.length === pieces.length) { count++; return; }
    const free = [...T].filter(k => !used.has(k)).map(k => k.split(',').map(Number)).sort((a, b) => a[0] - b[0] || a[1] - b[1])[0];
    for (let pi = 0; pi < pieces.length; pi++) {
      if (placed.includes(pi)) continue;
      for (const o of orients[pi]) for (const [fr, fc] of o) {
        const cells = o.map(([r, c]) => (r + free[0] - fr) + ',' + (c + free[1] - fc));
        if (cells.every(k => T.has(k) && !used.has(k))) { cells.forEach(k => used.add(k)); placed.push(pi); rec(); placed.pop(); cells.forEach(k => used.delete(k)); }
      }
    }
  })();
  return count;
}

/* truth-teller: who can be the single truthful speaker */
function solveTruth(tt) {
  const sols = [];
  for (let t = 0; t < 3; t++) {
    const T = [0, 1, 2].map(i => i === t);
    const val = ([kind, a, b]) => kind === 'lies' ? !T[a] : kind === 'truthful' ? T[a] : (!T[a] && !T[b]);
    if (tt.says.every((st, i) => val(st) === T[i])) sols.push(t);
  }
  return sols;
}

/* the I-RAVEN context-blind shortcut: score each option by how common its
   attribute values are among the options; flag a unique winner that is the key.
   Handedness is left out: reading it off a turned figure IS the mental
   rotation the item measures, so it is not a free surface cue. */
function contextBlind(opts) {
  const A = opts.map(cellAttrs).map(a => { const b = Object.assign({}, a); delete b.mir; return b; });
  const keys = Object.keys(A[0] || {});
  if (!keys.length) return null;
  const freq = {};
  keys.forEach(k => { freq[k] = {}; A.forEach(a => { freq[k][a[k]] = (freq[k][a[k]] || 0) + 1; }); });
  const score = A.map(a => keys.reduce((t, k) => t + freq[k][a[k]], 0));
  const top = Math.max(...score);
  return { score, top, uniqueKey: score[0] === top && score.filter(x => x === top).length === 1 };
}

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */
const browser = await chromium.launch({ executablePath: exe });
const { page, errors: bootErrors } = await openPage(browser);

head('1 · structure, in every language');
const S = await page.evaluate((LANGS) => {
  const res = { problems: [], forms: 0, perLang: {} };
  const bank0 = FT_BANK();
  res.slots = bank0.length;
  res.formCounts = bank0.map(f => f.length);
  bank0.forEach((forms, si) => {
    if (forms.length < 2) res.problems.push(`slot ${si + 1}: only ${forms.length} form`);
    forms.forEach(q => {
      if (q.cat !== forms[0].cat || q.d !== forms[0].d || q.opts.length !== forms[0].opts.length) res.problems.push(`${q.id}: not parallel to ${forms[0].id}`);
    });
  });
  for (const L of LANGS) {
    setLanguage(L);
    const bank = FT_BANK();
    let n = 0;
    bank.forEach((forms, si) => forms.forEach(q => {
      n++;
      const id = q.id;
      if (!(q.ans >= 0 && q.ans < q.opts.length)) res.problems.push(`${id}: key out of range`);
      if (q.opts.length < 3 || q.opts.length > 8) res.problems.push(`${id}: ${q.opts.length} options`);
      if (!CAT_KEYS.includes(q.cat)) res.problems.push(`${id}: unknown category ${q.cat}`);
      if (!(q.d in DIFF_WEIGHT)) res.problems.push(`${id}: unknown band ${q.d}`);
      if (typeof q.prompt !== 'object' || !q.prompt[L] || !String(q.prompt[L]).trim()) res.problems.push(`${id}: prompt missing in ${L}`);
      if (q.sub !== undefined && typeof q.sub === 'object' && !q.sub[L]) res.problems.push(`${id}: sub missing in ${L}`);
      if (q.sub !== undefined && !loc(q.sub)) res.problems.push(`${id}: empty sub in ${L}`);
      q.opts.forEach((o, i) => {
        if (o.val !== undefined && typeof o.val === 'object' && !(o.val[L] && String(o.val[L]).trim())) res.problems.push(`${id}: option ${i} missing in ${L}`);
        if (o.val === undefined && !svgFor(o)) res.problems.push(`${id}: option ${i} renders nothing`);
      });
      if (q.matrix) {
        if (q.matrix.length !== 9) res.problems.push(`${id}: matrix has ${q.matrix.length} cells`);
        const nulls = q.matrix.filter(c => c === null).length;
        if (nulls !== 1 || q.matrix[8] !== null) res.problems.push(`${id}: matrix must have exactly one blank, last`);
      }
      if (q.num && !(Array.isArray(q.seq) && q.seq.length >= 4)) res.problems.push(`${id}: number series too short`);
      /* distinctness: signature and exact markup */
      const sig = q.opts.map(optSig);
      if (new Set(sig).size !== sig.length) res.problems.push(`${id} [${L}]: duplicate option signatures`);
      const html = q.opts.map(o => o.val !== undefined ? loc(o.val) : svgFor(o));
      if (new Set(html).size !== html.length) res.problems.push(`${id} [${L}]: two options render identically`);
      if (q.opts.some(o => o.val !== undefined && /undefined|NaN/.test(loc(o.val)))) res.problems.push(`${id} [${L}]: option text contains undefined/NaN`);
    }));
    res.perLang[L] = n;
  }
  setLanguage('en');
  return res;
}, LANGS);
if (S.slots === 30) ok('30 slots'); else fail(`${S.slots} slots`);
ok(`forms per slot: ${S.formCounts.join(' ')}  (total ${S.formCounts.reduce((a, b) => a + b, 0)})`);
LANGS.forEach(L => ok(`${L}: ${S.perLang[L]} forms checked`));
if (S.problems.length) S.problems.forEach(fail); else ok('every key in range, every prompt and option present in all five languages, matrices well-formed, no duplicate or identically-rendering options');

/* serialize the bank for the Node-side solvers */
const BANK = await page.evaluate(() => {
  setLanguage('en');
  return FT_BANK().map(forms => forms.map(q => JSON.parse(JSON.stringify({
    id: q.id, cat: q.cat, d: q.d, num: !!q.num, seq: q.seq, matrix: q.matrix, opts: q.opts, ans: q.ans,
    bal: q.bal, pzq: q.pzq, asm: q.asm, wm: q.wm, tt: q.tt, recall: !!q.recall, noQ: !!q.noQ,
    prompt: q.prompt, optText: q.opts.map(o => o.val !== undefined ? (typeof o.val === 'object' ? o.val.en : o.val) : null)
  }))));
});
const ALL = BANK.flat();

head('2 · pixel distinctness of figural options');
const RAST = await page.evaluate(async () => {
  const toMask = (svg) => new Promise(res => {
    const s = svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
      .replace(/var\(--[a-z0-9-]+\)/g, '#000').replace(/currentColor/g, '#000')
      .replace(/style="width:[^"]*"/, '');
    const img = new Image();
    img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 96; const x = c.getContext('2d');
      x.drawImage(img, 0, 0, 96, 96); const d = x.getImageData(0, 0, 96, 96).data; const m = new Uint8Array(96 * 96);
      for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] > 60 ? 1 : 0; res(m); };
    img.onerror = () => res(null);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
  });
  const iou = (a, b) => { let i = 0, u = 0; for (let k = 0; k < a.length; k++) { if (a[k] || b[k]) u++; if (a[k] && b[k]) i++; } return u ? i / u : 1; };
  const out = {};
  for (const q of FT_BANK().flat()) {
    const figs = q.opts.filter(o => o.val === undefined);
    if (!figs.length) continue;
    const masks = []; for (const o of q.opts) masks.push(await toMask(svgFor(o)));
    let worst = 0, pair = null;
    for (let i = 0; i < masks.length; i++) for (let j = i + 1; j < masks.length; j++) { const v = iou(masks[i], masks[j]); if (v > worst) { worst = v; pair = [i, j]; } }
    const rec = { worst, pair };
    /* mirror/rotation items: compare each option with the target turned in 15° steps */
    if (q.noQ && q.seq && q.seq[0].glyph) {
      const t = q.seq[0]; const best = [];
      for (let k = 0; k < q.opts.length; k++) {
        let b = 0;
        for (let a = 0; a < 360; a += 15) { const tm = await toMask(svgFor({ glyph: t.glyph, rot: (t.rot || 0) + a, mir: !!t.mir })); b = Math.max(b, iou(masks[k], tm)); }
        best.push(+b.toFixed(3));
      }
      rec.vsTarget = best;
    }
    out[q.id] = rec;
  }
  return out;
});
let pixWorst = 0;
for (const [id, r] of Object.entries(RAST)) {
  pixWorst = Math.max(pixWorst, r.worst);
  if (r.worst > 0.97) fail(`${id}: options ${r.pair} rasterise almost identically (IoU ${r.worst.toFixed(3)})`);
  if (r.vsTarget) {
    const q = ALL.find(x => x.id === id);
    const keyBest = r.vsTarget[q.ans], rest = r.vsTarget.filter((_, i) => i !== q.ans);
    if (keyBest < 0.97) fail(`${id}: the key does not match any turned copy of the target (best IoU ${keyBest})`);
    if (Math.max(...rest) > 0.9) fail(`${id}: a distractor matches a turned copy of the target (IoU ${Math.max(...rest)})`);
    else ok(`${id}: key matches a turned target (IoU ${keyBest}); best mirror-image distractor IoU ${Math.max(...rest)}`);
  }
}
ok(`${Object.keys(RAST).length} figural forms rasterised; highest pairwise option overlap ${pixWorst.toFixed(3)} (identical = 1)`);

head('3 · machine-checked keys, and the hunt for a second defensible answer');
const verdict = {};
for (const q of ALL) {
  const key = q.opts[q.ans];
  let kind = 'manual', note = '';
  try {
    if (q.num) {
      kind = 'series';
      const fam = seriesFamilies(q.seq);
      const vals = q.opts.map(o => Number(o.val));
      const keyV = vals[q.ans];
      const hit = fam.filter(f => f[1] === keyV), other = fam.filter(f => f[1] !== keyV && vals.includes(f[1]));
      if (!hit.length) fail(`${q.id}: no simple rule predicts the key ${keyV} (fits: ${fam.map(f => f[0] + '→' + f[1]).join('; ') || 'none'})`);
      if (other.length) fail(`${q.id}: a second rule lands on a distractor: ${other.map(f => f[0] + '→' + f[1]).join('; ')}`);
      note = hit.map(f => f[0]).join(' = ') + ` → ${keyV}`;
      const sorted = [...vals].sort((a, b) => a - b);
      if (sorted.indexOf(keyV) === Math.floor(vals.length / 2) && vals.length % 2) note += ' (key is the median option)';
    } else if (q.matrix) {
      kind = 'matrix';
      for (const alt of [false, true]) {
        const res = q.opts.map(o => explain(q.matrix.slice(0, 8).concat([o]), 'grid', alt));
        const fully = res.map((r, i) => r.explained ? i : -1).filter(i => i >= 0);
        if (!alt) {
          if (!res[q.ans].explained) fail(`${q.id}: the key is not explained by the rule library: ${JSON.stringify(res[q.ans].why)}`);
          note = Object.entries(res[q.ans].why).map(([k, v]) => `${k}: ${v[0]}`).join('; ');
        }
        const bad = fully.filter(i => i !== q.ans);
        if (bad.length) fail(`${q.id}${alt ? ' (mirror-first reading)' : ''}: distractor ${bad} is also fully explained: ${bad.map(i => JSON.stringify(res[i].why)).join(' ')}`);
      }
    } else if (q.seq && !q.num && !q.noQ) {
      kind = 'figure series';
      for (const alt of [false, true]) {
        const res = q.opts.map(o => explain(q.seq.concat([o]), 'seq', alt));
        if (!alt) {
          if (!res[q.ans].explained) fail(`${q.id}: key not explained: ${JSON.stringify(res[q.ans].why)}`);
          note = Object.entries(res[q.ans].why).map(([k, v]) => `${k}: ${v[0]}`).join('; ');
        }
        const bad = res.map((r, i) => r.explained && i !== q.ans ? i : -1).filter(i => i >= 0);
        if (bad.length) fail(`${q.id}${alt ? ' (mirror-first reading)' : ''}: distractor ${bad} also fits: ${bad.map(i => JSON.stringify(res[i].why)).join(' ')}`);
      }
    } else if (q.noQ && q.seq) {
      kind = 'rotation vs reflection';
      const t = q.seq[0];
      const plain = q.opts.map((o, i) => o.glyph === t.glyph && !!o.mir === !!t.mir ? i : -1).filter(i => i >= 0);
      if (plain.length !== 1 || plain[0] !== q.ans) fail(`${q.id}: expected exactly the key to share the target's handedness, got ${plain}`);
      note = `key = target turned ${mod((key.rot || 0) - (t.rot || 0), 360)}°; ${q.opts.length - 1} mirror images`;
    } else if (q.bal) {
      kind = 'balance';
      const { shapes, sols } = solveBalance(q.bal);
      if (sols.length !== 1) fail(`${q.id}: weights not unique (${sols.join(' | ')})`);
      const target = weigh(q.bal.q.split(' '), shapes, sols[0]);
      const ws = q.opts.map(o => weigh(o.wt, shapes, sols[0]));
      const eqIdx = ws.map((w, i) => w === target ? i : -1).filter(i => i >= 0);
      if (eqIdx.length !== 1 || eqIdx[0] !== q.ans) fail(`${q.id}: options balancing the scale: ${eqIdx} (weights ${ws.join(',')}, target ${target})`);
      note = `weights ${shapes.map((s, i) => s + '=' + sols[0].split(',')[i]).join(' ')}; target ${target}; options ${ws.join('/')}`;
    } else if (q.pzq) {
      kind = 'piece completion';
      const gap = q.pzq.gap;
      const fitRot = q.opts.map((o, i) => pRots(o.pz).some(x => pKey(x) === pKey(gap)) ? i : -1).filter(i => i >= 0);
      const fitFlip = q.opts.map((o, i) => [...pRots(o.pz), ...pRots(pMir(o.pz))].some(x => pKey(x) === pKey(gap)) ? i : -1).filter(i => i >= 0);
      if (fitRot.length !== 1 || fitRot[0] !== q.ans) fail(`${q.id}: pieces that fit by turning: ${fitRot}`);
      if (pKey(key.pz) === pKey(gap)) warn(`${q.id}: the key is drawn in the gap's own orientation (no turning needed)`);
      note = `fits turned: ${fitRot}; would also fit if flipped: ${fitFlip.filter(i => i !== q.ans)}`;
    } else if (q.asm) {
      kind = 'assembly';
      const T = pParse(q.asm.target);
      const nRot = q.opts.map(o => tilings(T, o.pzs, false)), nFlip = q.opts.map(o => tilings(T, o.pzs, true));
      const fit = nRot.map((n, i) => n > 0 ? i : -1).filter(i => i >= 0);
      if (fit.length !== 1 || fit[0] !== q.ans) fail(`${q.id}: sets that tile the shape by turning: ${fit}`);
      note = `tilings (turn only) ${nRot.join('/')}; with flipping ${nFlip.join('/')}`;
    } else if (q.wm) {
      kind = 'digit span';
      const rev = [...q.wm.digits].reverse().join('');
      const strs = q.opts.map(o => (o.val.match(/<i>(\d)<\/i>/g) || []).map(x => x[3]).join(''));
      if (strs[q.ans] !== rev) fail(`${q.id}: key ${strs[q.ans]} is not the reverse of ${q.wm.digits}`);
      if (strs.filter(s => s === rev).length !== 1) fail(`${q.id}: reverse order appears more than once`);
      if (!strs.includes(q.wm.digits)) warn(`${q.id}: no forward-order distractor`);
      if (strs.some(s => s.length !== q.wm.digits.length)) fail(`${q.id}: an option has the wrong length`);
      note = `reverse of ${q.wm.digits} = ${rev}; shown ${q.wm.ms / 1000}s`;
    } else if (q.tt) {
      kind = 'truth-teller';
      const sols = solveTruth(q.tt);
      if (sols.length !== 1) fail(`${q.id}: ${sols.length} consistent assignments`);
      else if (q.optText[q.ans] !== q.tt.names[sols[0]]) fail(`${q.id}: solver says ${q.tt.names[sols[0]]}, key is ${q.optText[q.ans]}`);
      note = `only consistent truth-teller: ${q.tt.names[sols[0]]}`;
    } else if (q.recall) {
      kind = 'delayed recall';
      note = `target ${q.optText[q.ans]}`;
    }
  } catch (e) { fail(`${q.id}: checker crashed: ${e.message}`); }
  /* context-blind shortcut on figural options */
  if (q.opts[0].fig || q.opts[0].glyph) {
    const cb = contextBlind(q.opts);
    if (cb && cb.uniqueKey) fail(`${q.id}: the key is the unique most-common-attributes option (scores ${cb.score.join(',')})`);
  }
  verdict[q.id] = { kind, note };
}
/* word problems, verbal and syllogisms are checked by recomputation / hand (see the audit) */
const WORD = { S07A: 6 * 4 + 2, S07B: 5 * 7 + 3, S21A: 1 / (1 / 6 + 1 / 3), S21B: 1 / (1 / 12 + 1 / 6) };
for (const [id, v] of Object.entries(WORD)) {
  const q = ALL.find(x => x.id === id);
  const num = t => Number(String(t).replace(/[\u2066-\u2069]/g, '').replace('½', '.5'));
  const keyV = num(q.optText[q.ans]);
  if (Math.abs(keyV - v) > 1e-9) fail(`${id}: computed ${v}, key ${keyV}`);
  if (q.optText.filter(t => Math.abs(num(t) - v) < 1e-9).length !== 1) fail(`${id}: more than one option equals ${v}`);
  verdict[id] = { kind: 'word problem', note: `recomputed ${v}` };
}
/* recall words: no word may appear in two forms, so a retake cannot be answered from the last one */
{
  const words = await page.evaluate(() => FT_RECALL.map(r => [r.w, ...r.d].map(w => JSON.stringify(w))));
  const flat = words.flat();
  if (new Set(flat).size !== flat.length) fail('recall forms share a word'); else ok(`recall: ${words.length} forms, ${flat.length} words, all distinct in every language`);
}
const byKind = {};
ALL.forEach(q => { const k = verdict[q.id]?.kind || 'manual'; (byKind[k] = byKind[k] || []).push(q.id); });
Object.entries(byKind).forEach(([k, ids]) => ok(`${k.padEnd(22)} ${ids.length.toString().padStart(2)}  ${ids.join(' ')}`));
console.log('\n  per-form solver notes:');
ALL.forEach(q => console.log(`    ${q.id}  ${(verdict[q.id]?.kind || 'manual').padEnd(22)} ${verdict[q.id]?.note || '(checked by hand: see audit)'}`));

head('6 · shuffle: permutation, key travels with its option, uniform positions');
const SH = await page.evaluate(() => {
  const N = 4000;
  const src = {}; FT_BANK().flat().forEach(q => src[q.id] = q);
  const pos = {}; const lumps = []; let broken = 0, sameForm = 0, comparisons = 0; let prev = null;
  const overall = [0, 0, 0, 0, 0, 0];
  for (let s = 0; s < N; s++) {
    ftNewPlan();
    const items = ftBuildTest();
    if (items.length !== 30) broken++;
    const ids = items.map(q => q.id);
    if (prev) ids.forEach((id, i) => { if (FT_BANK()[i].length > 1) { comparisons++; if (id === prev[i]) sameForm++; } });
    prev = ids;
    const c = [0, 0, 0, 0, 0, 0];
    items.forEach(q => {
      const o = src[q.id];
      const a = q.opts.map(optSig).sort().join('#'), b = o.opts.map(optSig).sort().join('#');
      if (a !== b) broken++;
      if (optSig(q.opts[q.ans]) !== optSig(o.opts[o.ans])) broken++;
      const k = q.opts.length; pos[k] = pos[k] || new Array(k).fill(0); pos[k][q.ans]++;
      c[q.ans]++; overall[q.ans]++;
    });
    lumps.push(Math.max(...c.slice(0, 4)));
  }
  lumps.sort((a, b) => a - b);
  return { N, pos, broken, sameForm, comparisons, overall, maxLetterP50: lumps[N / 2], maxLetterMax: lumps[N - 1] };
});
if (SH.broken) fail(`${SH.broken} shuffled items lost their key or an option`); else ok(`${SH.N} sittings × 30 items: every shuffle is a permutation and the key travels with its option`);
if (SH.sameForm) fail(`${SH.sameForm}/${SH.comparisons} slots repeated the previous sitting's form`); else ok(`retakes: no slot ever repeats the previous sitting's form (${SH.comparisons} comparisons)`);
for (const [k, arr] of Object.entries(SH.pos)) {
  const tot = arr.reduce((a, b) => a + b, 0), e = tot / k;
  const chi = arr.reduce((t, x) => t + (x - e) ** 2 / e, 0);
  /* chi-square critical values at p = .001 for df = k−1 */
  const crit = { 3: 13.82, 4: 16.27, 5: 18.47, 6: 20.52, 7: 22.46, 8: 24.32 }[k];
  const line = `${k} options: key at ${arr.map((x, i) => String.fromCharCode(65 + i) + ' ' + (100 * x / tot).toFixed(1) + '%').join(', ')}  (χ² ${chi.toFixed(1)}, df ${k - 1})`;
  if (chi > crit) fail(line); else ok(line);
}
ok(`all items: key position counts A–F = ${SH.overall.join(' / ')}`);
ok(`most keys on any one letter A–D in a sitting: median ${SH.maxLetterP50}, worst ${SH.maxLetterMax} of 30`);

head('7 · scoring: strategies mapped to IQ');
const SC = await page.evaluate(() => {
  const saved = window._reportData;
  const score = (items, pickFn) => { engine = { mode: 'main', qs: items, answers: items.map((q, i) => pickFn(q, i) === q.ans) }; return buildResults().iq; };
  const stats = a => { const s = [...a].sort((x, y) => x - y), n = s.length, m = s.reduce((t, x) => t + x, 0) / n;
    const sd = Math.sqrt(s.reduce((t, x) => t + (x - m) ** 2, 0) / n); return { mean: +m.toFixed(1), sd: +sd.toFixed(1), p5: s[Math.floor(n * .05)], p50: s[Math.floor(n * .5)], p95: s[Math.floor(n * .95)], min: s[0], max: s[n - 1] }; };
  const out = {};
  const N = 10000, sittings = [];
  for (let i = 0; i < N; i++) { ftNewPlan(); sittings.push(ftBuildTest()); }
  out.random = stats(sittings.map(it => score(it, q => Math.floor(Math.random() * q.opts.length))));
  for (let j = 0; j < 6; j++) out['always-' + String.fromCharCode(65 + j)] = stats(sittings.slice(0, 4000).map(it => score(it, q => Math.min(j, q.opts.length - 1))));
  out.allCorrect = score(sittings[0], q => q.ans);
  out.allWrong = score(sittings[0], q => (q.ans + 1) % q.opts.length);
  out.easyMediumOnly = stats(sittings.slice(0, 4000).map(it => score(it, q => (q.d === 'easy' || q.d === 'medium') ? q.ans : Math.floor(Math.random() * q.opts.length))));
  /* expected guessing ratio, analytically */
  const it = sittings[0]; let e = 0, t = 0; it.forEach(q => { const w = DIFF_WEIGHT[q.d]; t += w; e += w / q.opts.length; });
  out.expectedChanceRatio = +(e / t).toFixed(4);
  out.totalWeight = +t.toFixed(1);
  window._reportData = saved;
  return out;
});
const iqLine = (name, s) => typeof s === 'number' ? `${name.padEnd(16)} IQ ${s}` : `${name.padEnd(16)} mean ${s.mean}  sd ${s.sd}  5th ${s.p5}  median ${s.p50}  95th ${s.p95}  (range ${s.min}–${s.max})`;
ok(iqLine('random guessing', SC.random) + `   [10 000 sittings]`);
['A', 'B', 'C', 'D', 'E', 'F'].forEach(L => ok(iqLine('always-' + L, SC['always-' + L])));
ok(iqLine('all correct', SC.allCorrect));
ok(iqLine('all wrong', SC.allWrong));
ok(iqLine('easy+medium only', SC.easyMediumOnly) + '  (rest guessed)');
ok(`expected chance ratio ${SC.expectedChanceRatio} of total weight ${SC.totalWeight} → IQ ≈ ${(68 + 80 * SC.expectedChanceRatio).toFixed(1)}`);
if (SC.random.mean < 80 || SC.random.mean > 90) fail('random guessing should land at IQ 80–90');
['A', 'B', 'C', 'D', 'E', 'F'].forEach(L => { if (SC['always-' + L].mean > 90) fail(`always-${L} beats chance`); });
if (SC.allCorrect !== 148) fail('all-correct should reach the top of the scale (148)');
if (bootErrors.filter(e => !/Failed to load resource/.test(e)).length) bootErrors.forEach(e => fail('console at boot: ' + e)); else ok('no console errors or warnings at boot (auditSelfCheck is silent)');

/* ------------------------------------------------------------------ */
/* 8 · end to end                                                       */
/* ------------------------------------------------------------------ */
if (E2E) {
  head('8 · end to end, 375px, all five languages');
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  for (const L of LANGS) {
    const { ctx, page: pg, errors } = await openPage(browser, { viewport: { width: 375, height: 812 } });
    await pg.evaluate(l => setLanguage(l), L);
    await pg.click('#screen-landing .btn-primary');
    await pg.click('#screen-prequiz .gender-btn >> nth=2');
    const word = (await pg.textContent('#memorize-word')).trim();
    await pg.click('#screen-memorize .btn-primary');
    let overflow = 0, rtlBad = 0, wmChecked = 0, recallOK = null; const kinds = new Set();
    for (let i = 0; i < 30; i++) {
      const info = await pg.evaluate(() => { const q = engine.qs[engine.cur]; return { id: q.id, ans: q.ans, k: q.opts.length, wm: !!q.wm, recall: !!q.recall, num: !!q.num,
        kind: q.matrix ? 'matrix' : q.bal ? 'balance' : q.wm ? 'wm' : q.asm ? 'assembly' : q.pzq ? 'piece' : q.num ? 'series' : q.seq ? 'figseq' : 'text',
        texts: q.opts.map(o => o.val !== undefined ? loc(o.val) : '') }; });
      if (info.wm) {
        const hiddenBefore = await pg.evaluate(() => getComputedStyle(document.querySelector('.options-grid')).visibility === 'hidden');
        await pg.click('.ft-wm-go');
        await pg.waitForTimeout(300);
        const shown = await pg.evaluate(() => document.querySelectorAll('.ft-wm-digits i').length);
        const hiddenDuring = await pg.evaluate(() => getComputedStyle(document.querySelector('.options-grid')).visibility === 'hidden');
        if (SHOTS && !kinds.has('wm-show')) { kinds.add('wm-show'); await pg.screenshot({ path: `${SHOTS}/${L}-wm-show.png`, fullPage: true }); }
        await pg.waitForSelector('.ft-wm.done', { timeout: 9000 });
        const visibleAfter = await pg.evaluate(() => getComputedStyle(document.querySelector('.options-grid')).visibility !== 'hidden');
        const masked = await pg.evaluate(() => [...document.querySelectorAll('.ft-wm-digits i')].every(x => x.textContent === '•'));
        /* a re-render must not grant a second look */
        await pg.evaluate(l => setLanguage(l), L);
        const stillDone = await pg.evaluate(() => !!document.querySelector('.ft-wm.done') && getComputedStyle(document.querySelector('.options-grid')).visibility !== 'hidden');
        if (!(hiddenBefore && shown && hiddenDuring && visibleAfter && masked && stillDone)) fail(`${L} ${info.id}: timed digits flow broke (before ${hiddenBefore}, shown ${shown}, during ${hiddenDuring}, after ${visibleAfter}, masked ${masked}, after re-render ${stillDone})`);
        else wmChecked++;
      }
      if (info.recall) recallOK = info.texts[info.ans] === word;
      if (L === 'he' || L === 'ar') {
        /* reading order: right to left within a line; a wrapped line starts lower */
        const order = await pg.evaluate(() => { const row = document.querySelector('.seq-row,.visual-row,.ft-wm-digits'); if (!row || row.children.length < 2) return null;
          const r = [...row.children].map(c => c.getBoundingClientRect());
          return r.every((b, i) => i === 0 || (Math.abs(b.top - r[i - 1].top) < 4 ? b.left < r[i - 1].left : b.top > r[i - 1].top)); });
        if (order === false) rtlBad++;
      }
      const ov = await pg.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      if (ov) { overflow++; if (SHOTS) await pg.screenshot({ path: `${SHOTS}/${L}-overflow-${info.id}.png`, fullPage: true }); }
      if (SHOTS && !kinds.has(info.kind)) { kinds.add(info.kind); await pg.screenshot({ path: `${SHOTS}/${L}-${info.kind}-${info.id}.png`, fullPage: true }); }
      const pick = i % 3 === 0 ? (info.ans + 1) % info.k : info.ans;
      await pg.click(`.option[data-i="${pick}"]`);
      await pg.click('#btn-next');
    }
    await pg.waitForSelector('#screen-email-gate.active', { timeout: 12000 }).catch(() => {});
    const end = await pg.evaluate(() => ({ screen: document.querySelector('.screen.active')?.id, r: window._reportData }));
    const errs = errors.filter(e => !/Failed to load resource/.test(e));
    const line = `${L}: reached ${end.screen}, IQ ${end.r && end.r.iq}, ${end.r && end.r.correct}/30 correct, timed-digit items ok ${wmChecked}/2, recall word matched ${recallOK}, overflow on ${overflow} items, RTL order problems ${rtlBad}, console errors ${errs.length}`;
    if (end.screen !== 'screen-email-gate' || errs.length || overflow || rtlBad || wmChecked !== 2 || recallOK !== true) { fail(line); errs.forEach(e => console.log('        ' + e)); }
    else ok(line);
    await ctx.close();
  }
}

await browser.close();
console.log(`\n${failures ? 'FAILED' : 'PASSED'}: ${failures} failure(s), ${warnings} warning(s)`);
process.exit(failures ? 1 : 0);
