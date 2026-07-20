/* MedCalc Drill audit harness — run after ANY edit to the generators or drug pools:
       node audit.js
   Extracts the generator+grading code from index.html, then for every generated
   question RE-SOLVES it from the DISPLAYED prompt text and checks the graded
   answer matches. This catches display-rounding bugs (e.g. a pool value that
   fmt() can't show exactly), unit mistakes, and trap/grading inconsistencies.
   Exits non-zero on any failure. */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const file = process.argv[2] || path.join(__dirname, 'index.html');
const N_PER_CAT = 25000;
const N_MIXED = 100000;

const html = fs.readFileSync(file, 'utf8');
const start = html.indexOf('/* ============================== utils');
const end = html.indexOf('/* ============================== views');
if (start < 0 || end < 0) { console.error('markers not found'); process.exit(2); }
const code = html.slice(start, end);

const sandbox = {
  window: {},
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  document: { querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {} },
  console,
};
vm.createContext(sandbox);
vm.runInContext(code + '\n;__x={makeQ,grade,fmt,CATS};', sandbox);
const { makeQ, grade, fmt, CATS } = sandbox.__x;

const MASS = { g: 1000, mg: 1, micrograms: 0.001, milligrams: 1, grams: 1000 };
const VOL = { L: 1000, mL: 1, litres: 1000, millilitres: 1 };
const strip = s => s.replace(/<[^>]+>/g, '');

function resolve(q) {
  // returns the answer recomputed from the question AS DISPLAYED, or null
  const p = strip(q.prompt);
  let m;
  if (q.cat === 'conv') {
    m = p.match(/^Convert ([\d.]+) (g|mg|micrograms|L|mL) to (grams|milligrams|micrograms|litres|millilitres)\.$/);
    if (!m) return null;
    const T = MASS[m[2]] != null && MASS[m[3]] != null ? MASS : VOL;
    if (T[m[2]] == null || T[m[3]] == null) return null;
    return parseFloat(m[1]) * T[m[2]] / T[m[3]];
  }
  if (q.cat === 'tab') {
    m = p.match(/charted ([a-z][a-z ]*?) ([\d.]+) (g|mg|micrograms) orally\. Stock on hand: ([\d.]+) (mg|microgram) (tablet|capsule)s\./);
    if (!m) return null;
    const dose = parseFloat(m[2]) * MASS[m[3]];
    const stock = parseFloat(m[4]) * (m[5] === 'microgram' ? 0.001 : 1);
    return dose / stock;
  }
  if (q.cat === 'liq') {
    m = p.match(/charted ([a-z][a-z ]*?) ([\d.]+) mg orally\. Stock: ([\d.]+) mg in ([\d.]+) mL\./);
    if (!m) return null;
    return parseFloat(m[2]) / parseFloat(m[3]) * parseFloat(m[4]);
  }
  if (q.cat === 'inj') {
    m = p.match(/charted ([a-z][a-z ]*?) ([\d.]+) (mg|micrograms|units) (subcutaneously|IM|IV)\. Stock: ([\d.]+) (mg|micrograms|units) in ([\d.]+) mL\./);
    if (!m) return null;
    if (m[3] !== m[6]) return null; // dose and stock shown in different units
    return parseFloat(m[2]) / parseFloat(m[5]) * parseFloat(m[7]);
  }
  if (q.cat === 'rate') {
    m = p.match(/([\d.]+) mL of .+? to run over ([\d.]+) hours via infusion pump/);
    if (m) return Math.round(parseFloat(m[1]) / parseFloat(m[2]));
    m = p.match(/in ([\d.]+) mL to run over ([\d.]+) minutes via pump/);
    if (m) return Math.round(parseFloat(m[1]) / parseFloat(m[2]) * 60);
    return null;
  }
  if (q.cat === 'drip') {
    m = p.match(/([\d.]+) mL of .+? to run over (.+?) using .+?\((20|60) drops\/mL\)/);
    if (!m) return null;
    let mins;
    const t = m[2].match(/([\d.]+) (hour|minute)s?/);
    if (!t) return null;
    mins = t[2] === 'hour' ? parseFloat(t[1]) * 60 : parseFloat(t[1]);
    return Math.round(parseFloat(m[1]) * parseInt(m[3]) / mins);
  }
  if (q.cat === 'time') {
    m = p.match(/infusion of ([\d.]+) mL is running at ([\d.]+) mL\/hr\. How long .+ in (hours|minutes)\?/);
    if (!m) return null;
    const h = parseFloat(m[1]) / parseFloat(m[2]);
    return m[3] === 'hours' ? h : h * 60;
  }
  if (q.cat === 'wt') {
    const w = p.match(/weigh(?:ing|s) ([\d.]+) kg/);
    if (!w) return null;
    const W = parseFloat(w[1]);
    m = p.match(/([\d.]+) mg\/kg\/day in (\d+) divided doses/);
    if (m) return parseFloat(m[1]) * W / parseInt(m[2]);
    m = p.match(/([\d.]+) mg\/kg\. Stock .+?: ([\d.]+) mg in ([\d.]+) mL/);
    if (m) return parseFloat(m[1]) * W / parseFloat(m[2]) * parseFloat(m[3]);
    m = p.match(/([\d.]+) mg\/kg per dose/);
    if (m) return parseFloat(m[1]) * W;
    return null;
  }
  return null;
}

const fails = {};
let nUnparsed = 0, nFallback = 0, nBadGrade = 0, nBadRound = 0, nBadDisplay = 0,
    nMcg = 0, nNaN = 0, nTrapEqAns = 0;
const examples = {};
const distinct = new Set();
const NAME_RE = new RegExp('^(Aroha|Wiremu|Hemi|Mere|Tane|Nikau|Moana|Sione|Losa|Mei|Chen|Yuki|Raj|Priya|Anika|Fatima|Omar|Grace|Noah|Ella|Jack|Olivia|Sam|Ruby|Leo|Isla)\\b');

function note(kind, q, extra) {
  if (!examples[kind]) examples[kind] = [];
  if (examples[kind].length < 4) examples[kind].push(strip(q.prompt) + (extra ? '  [' + extra + ']' : ''));
}

function audit(q, requestedCat) {
  const all = strip(q.prompt) + ' | ' + q.steps.map(strip).join(' | ') + ' | ' + q.unit;
  distinct.add(strip(q.prompt).replace(NAME_RE, '#'));
  if (requestedCat && requestedCat !== 'all' && q.cat !== requestedCat) { nFallback++; note('fallback', q, 'wanted ' + requestedCat); }
  if (/NaN|undefined|Infinity/.test(all)) { nNaN++; note('nan', q); }
  if (/\bmcg\b|µg/.test(all)) { nMcg++; note('mcg', q); }
  if (!isFinite(q.answer) || q.answer <= 0) { nNaN++; note('badAnswer', q, String(q.answer)); }
  // grading self-consistency
  if (!grade(q, q.answer).ok) { nBadGrade++; note('gradeRejectsOwnAnswer', q, 'ans=' + q.answer); }
  if (q.exact != null && Math.abs(q.exact - q.answer) > 1e-6) {
    const g = grade(q, q.exact);
    if (g.ok || g.slip !== 'rounding') { nBadRound++; note('exactNotFlaggedAsRounding', q, 'exact=' + q.exact); }
  }
  for (const t of q.traps || []) {
    if (Math.abs(t.v - q.answer) < 1e-9) { nTrapEqAns++; note('trapEqualsAnswer', q); }
  }
  // the big one: re-solve from the displayed text
  const r = resolve(q);
  if (r == null) { nUnparsed++; note('unparsed_' + q.cat, q); return; }
  const tol = Math.max(Math.abs(q.answer) * 1e-9, 1e-9);
  if (Math.abs(r - q.answer) > tol) {
    nBadDisplay++;
    fails[q.cat] = (fails[q.cat] || 0) + 1;
    note('displayedMismatch_' + q.cat, q, 'displayed maths gives ' + r + ', graded answer is ' + q.answer);
  }
}

for (const cat of Object.keys(CATS)) for (let i = 0; i < N_PER_CAT; i++) audit(makeQ(cat), cat);
for (let i = 0; i < N_MIXED; i++) audit(makeQ('all'), 'all');

const total = Object.keys(CATS).length * N_PER_CAT + N_MIXED;
console.log('=== MedCalc fuzz audit:', file);
console.log('questions generated       :', total);
console.log('distinct question texts   :', distinct.size, '(names normalised)');
console.log('unparsable prompts        :', nUnparsed);
console.log('DISPLAYED-MATHS MISMATCH  :', nBadDisplay, Object.keys(fails).length ? fails : '');
console.log('grade rejects own answer  :', nBadGrade);
console.log('exact not flagged rounding:', nBadRound);
console.log('category fallbacks        :', nFallback);
console.log('NaN/undefined in text     :', nNaN);
console.log('"mcg"/µg abbreviation used:', nMcg);
console.log('trap equals answer        :', nTrapEqAns);
for (const [k, v] of Object.entries(examples)) {
  console.log('\n--- ' + k);
  v.forEach(x => console.log('  · ' + x));
}
process.exit(nBadDisplay + nBadGrade + nNaN + nTrapEqAns > 0 ? 1 : 0);
