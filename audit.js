/* MedCalc audit harness — run after ANY edit to the engine, generators or pools:
       node audit.js
   1. Parses every inline <script> in index.html (a stray apostrophe kills a
      single-file app silently).
   2. Extracts the engine (utils → views) and, for every generator variant the
      app uses (drill topics, lesson questions, Joan's-test blueprint):
        · RE-SOLVES each question from the numbers it DISPLAYS (the question's
          own chip texts, parsed here independently) and checks the graded answer;
        · re-checks every line of the working from its DISPLAYED numbers
          (a × 1000 = b, want/got × volume = answer, top ÷ bottom → rounded …);
        · checks the "fill the working" boxes accept their own model answer;
        · simulates the guided "with me" build and checks it ends with every
          box on the paper revealed;
        · checks the multiple-choice options (4 distinct, exactly one right);
        · checks generator contracts (conv:true really converts, L:true is litres).
   3. Rebuilds Joan's own worked examples and practice-test questions and checks
      the engine reproduces her published answers.
   Exits non-zero on any failure. */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const file = process.argv[2] || path.join(__dirname, 'index.html');
const N = +(process.argv[3] || 4000);          // per generator variant
const html = fs.readFileSync(file, 'utf8');

let failures = 0;
const examples = {};
function fail(kind, q, extra) {
  failures++;
  examples[kind] = examples[kind] || [];
  if (examples[kind].length < 4) examples[kind].push((q ? strip(q.prompt) : '') + (extra ? '  [' + extra + ']' : ''));
}
const strip = s => String(s).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&quot;/g, '"');

/* ---------- 1. every inline script must parse ---------- */
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
scripts.forEach((code, i) => { try { new vm.Script(code, { filename: 'inline-script-' + i }); } catch (e) { fail('scriptSyntax', null, 'script ' + i + ': ' + e.message); } });

/* ---------- 2. load the engine ---------- */
const start = html.indexOf('/* ============================== utils');
const end = html.indexOf('/* ============================== views');
if (start < 0 || end < 0) { console.error('markers not found'); process.exit(2); }
const sandbox = {
  window: {},
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  document: { querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {} },
  console,
};
vm.createContext(sandbox);
vm.runInContext(html.slice(start, end) + '\n;__x={makeQ,grade,gradeSlot,fmt,qs,tr2,mcqOpts,CATS,MOCK,genTab,genLiq,genInj,genWt,genRatio,genDrip,genPowder,genDil,genConv,gRate,gTime,buildWG,buildWT,buildDrip,buildDil,buildRate,buildTime,roundHalfUp};', sandbox);
const X = sandbox.__x;

/* ---------- independent number/unit reader (deliberately NOT the app's parseQty) ---------- */
const MASS = { g: 1e6, mg: 1e3, mcg: 1, units: 1 };
function readQty(t) {
  const m = String(t).trim().match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (!m) return null;
  let u = m[2].trim();
  if (/^tablets?$/.test(u)) u = 'tablet';
  else if (/^capsules?$/.test(u)) u = 'capsule';
  else if (/^hours?$/.test(u)) u = 'hr';
  else if (/^minutes?$/.test(u)) u = 'mins';
  else if (/^drops?(\/mL| per mL)$/.test(u)) u = 'drops/mL';
  else if (/^doses?$/.test(u) || /^divided doses$/.test(u)) u = 'doses';
  return { v: parseFloat(m[1]), u };
}
const near = (a, b, rel) => Math.abs(a - b) <= Math.max(Math.abs(b) * (rel || 1e-9), 1e-9);

/* ---------- re-solve a question from what it shows ---------- */
function resolve(q) {
  const ch = {};
  for (const c of q.chips) ch[c.r] = c.t;
  const R = k => (ch[k] != null ? readQty(ch[k]) : null);
  if (['tab', 'liq', 'inj', 'ratio', 'powder'].includes(q.cat)) {
    const w = R('w'), g = R('g'), v = R('v');
    if (!w || !g) return null;
    if (MASS[w.u] == null || MASS[g.u] == null) return null;
    return (w.v * MASS[w.u]) / (g.v * MASS[g.u]) * (v ? v.v : 1);
  }
  if (q.cat === 'wt') {
    const pk = R('pk'), kg = R('kg'), n = R('n'), g = R('g'), v = R('v');
    if (!pk || !kg) return null;
    let dose = pk.v * kg.v;
    if (n) dose = dose / n.v;
    return g ? dose / g.v * (v ? v.v : 1) : dose;
  }
  if (q.cat === 'drip') {
    const iv = R('iv'), df = R('df'), t = R('t');
    if (!iv || !df || !t) return null;
    const mL = iv.u === 'L' ? iv.v * 1000 : iv.v;
    return X.roundHalfUp(Math.round(mL * df.v * 1e6) / 1e6, t.v * 60);
  }
  if (q.cat === 'dil') {
    const w = R('w'), g = R('g'), av = R('av'), dv = R('dv');
    if (!w || !g || !av || !dv || w.u !== g.u) return null;
    return w.v / g.v * (av.v + dv.v);
  }
  if (q.cat === 'conv') {
    const c = R('c0'), to = strip(q.prompt).match(/ to (\w+)\.$/);
    if (!c || !to) return null;
    const T = { g: 1e6, mg: 1e3, mcg: 1, L: 1000, mL: 1 };
    return c.v * T[c.u] / T[to[1]];
  }
  if (q.cat === 'rate') {
    const iv = R('iv'), t = R('t');
    if (!iv || !t || iv.u !== 'mL') return null;
    const hrs = t.u === 'hr' ? t.v : t.u === 'mins' ? t.v / 60 : null;
    return hrs == null ? null : Math.round(iv.v / hrs);
  }
  if (q.cat === 'time') {
    const iv = R('iv'), r = R('r'), unit = strip(q.prompt).match(/ in (hours|minutes)\?$/);
    if (!iv || !r || !unit || iv.u !== 'mL' || r.u !== 'mL/hr') return null;
    return unit[1] === 'hours' ? iv.v / r.v : iv.v / r.v * 60;
  }
  return null;
}

/* ---------- re-check every line of working from DISPLAYED numbers ---------- */
function disp(t) { return t.approx ? X.tr2(t.v) + ' ' + t.u : X.qs(t.v, t.u); }
function tokVal(t, q, ctx) {
  if (t.t === 'q') {
    const r = readQty(disp(t));
    if (!r) { fail('tokenUnreadable', q, disp(t)); return NaN; }
    if (!t.approx && !near(r.v, t.v)) fail('tokenDisplayPrecision', q, disp(t) + ' vs ' + t.v);
    if (t.approx) ctx.approx = true;
    if (t.k === 'a') ctx.isA = true;
    return r.v;
  }
  if (t.t === 'x') { const n = parseFloat(t.s); return /^\d+(\.\d+)?$/.test(t.s) ? n : NaN; }
  if (t.t === 'f') return chain(t.top, q, ctx) / chain(t.bot, q, ctx);
  return NaN;
}
function chain(toks, q, ctx) {
  let acc = null, op = null;
  for (const t of toks) {
    if (t.t === 'o') { op = t.s; continue; }
    const v = tokVal(t, q, ctx);
    if (acc == null) acc = v;
    else if (op === '×') acc *= v; else if (op === '÷') acc /= v; else if (op === '+') acc += v; else acc = NaN;
    op = null;
  }
  return acc;
}
function checkLines(q) {
  let prevLast = null;
  for (const line of q.lines) {
    const segs = [[]], seps = [];
    for (const t of line.toks) { if (t.t === 'o' && (t.s === '=' || t.s === '→')) { seps.push(t.s); segs.push([]); } else segs[segs.length - 1].push(t); }
    const vals = segs.map(s => { const ctx = {}; const v = s.length ? chain(s, q, ctx) : prevLast; return { v, ctx }; });
    for (let i = 0; i < seps.length; i++) {
      const a = vals[i], b = vals[i + 1];
      if (a.v == null || !isFinite(a.v) || !isFinite(b.v)) { fail('lineUnevaluable', q, line.lab); continue; }
      if (seps[i] === '→' && a.ctx.approx && b.ctx.isA) {
        if (Math.round(a.v) !== b.v) fail('lineRounding', q, line.lab + ': ' + a.v + ' → ' + b.v);
      } else {
        const tol = (a.ctx.approx || b.ctx.approx) ? 0.0101 : null;
        if (tol ? Math.abs(a.v - b.v) > tol : !near(a.v, b.v, 1e-9)) fail('lineArithmetic', q, line.lab + ': ' + a.v + ' ≠ ' + b.v);
      }
    }
    prevLast = vals[vals.length - 1].v;
    // units must match top and bottom of a single-quantity fraction
    // (drops ÷ mins, mL ÷ hr, mL ÷ mL/hr are rates/times, so only the want/got fraction is held to this)
    const RATE_BOT = new Set(['mins', 'hr', 'mL/hr']);
    for (const t of line.toks) if (t.t === 'f' && t.top.length === 1 && t.bot.length === 1 && t.top[0].u !== 'drops' && !RATE_BOT.has(t.bot[0].u) && t.top[0].u !== t.bot[0].u) fail('fractionUnitsDiffer', q, t.top[0].u + '/' + t.bot[0].u);
  }
  const ans = [];
  const walk = toks => toks.forEach(t => { if (t.t === 'f') { walk(t.top); walk(t.bot); } else if (t.t === 'q' && t.k === 'a') ans.push(t); });
  q.lines.forEach(l => walk(l.toks));
  if (ans.length !== 1) fail('answerTokenCount', q, String(ans.length));
  else { if (!near(ans[0].v, q.answer)) fail('answerTokenMismatch', q, ans[0].v + ' vs ' + q.answer); if (ans[0].u !== q.aU) fail('answerUnitMismatch', q, ans[0].u + ' vs ' + q.aU); }
}

/* ---------- the guided build must finish with the whole paper revealed ---------- */
function checkGuided(q) {
  const rev = new Set();
  for (const st of q.steps) {
    if (st.k === 'pick') { if (!q.chips.some(c => c.r === st.r)) fail('pickTargetMissing', q, st.r); }
    if (st.k === 'choice') { const ok = st.opts.filter(o => o.ok === true); if (ok.length !== 1) fail('choiceNotOneRight', q, st.ask); }
    if (st.k === 'num' && !(isFinite(st.v) && st.v > 0)) fail('numStepBadValue', q, st.ask);
    const r = st.k === 'choice' ? ((st.opts.find(o => o.ok === true) || {}).reveal || st.reveal) : st.reveal;
    (r || []).forEach(k => rev.add(k));
    if (st.k === 'num' && (st.reveal || []).includes('a') && !(st.tol ? Math.abs(st.v - q.answer) <= st.tol : near(st.v, q.answer))) fail('finalStepNotAnswer', q, st.v + ' vs ' + q.answer);
  }
  const walk = toks => toks.forEach(t => { if (t.t === 'f') { walk(t.top); walk(t.bot); } else if (t.t === 'q' && !rev.has(t.k)) fail('guidedLeavesBlank', q, t.k); });
  q.lines.forEach(l => { if (l.when && !rev.has(l.when)) fail('guidedLineNeverShown', q, l.lab); walk(l.toks); });
}

/* ---------- each "fill the working" box must accept its own model answer ---------- */
function checkTemplate(q) {
  const slots = [];
  const walk = toks => toks.forEach(t => { if (t.t === 'f') { walk(t.top); walk(t.bot); } else if (t.t === 'q') slots.push(t); });
  q.lines.forEach(l => walk(l.toks));
  for (const s of slots) {
    const txt = s.approx ? X.tr2(s.v) + ' ' + s.u : X.qs(s.v, s.u);
    const g = X.gradeSlot(s, txt);
    if (g.st !== 'ok') fail('templateRejectsModel', q, s.k + ' "' + txt + '" → ' + g.st);
    if (!s.uopt && !s.approx) { const bare = X.gradeSlot(s, X.fmt(s.v)); if (bare.st !== 'bad') fail('templateAcceptsBareNumber', q, s.k); }
  }
}

/* ---------- one question, all checks ---------- */
const distinct = new Set();
function audit(q, label, contract) {
  distinct.add(strip(q.prompt).replace(/^(Mr|Mrs|Baby)? ?\w+/, '#'));
  const all = strip(q.prompt) + ' | ' + q.chips.map(c => c.t).join(' | ') + ' | ' + (q.sense || '');
  if (/NaN|undefined|Infinity|null|\[object/.test(all)) fail('nanInText', q, label);
  if (!isFinite(q.answer) || q.answer <= 0) fail('badAnswer', q, String(q.answer));
  // exactness: Joan's rule — never round a medication volume
  if (q.aU === 'mL' && Math.abs(q.answer * 100 - Math.round(q.answer * 100)) > 1e-6) fail('volumeNot2dp', q, String(q.answer));
  if ((q.aU === 'tablet' || q.aU === 'capsule') && Math.abs(q.answer * 2 - Math.round(q.answer * 2)) > 1e-9) fail('tabletNotHalves', q, String(q.answer));
  if (q.aU === 'capsule' && q.answer % 1) fail('halfCapsule', q, String(q.answer));
  if (q.aU === 'drops/min' && q.answer % 1) fail('dripNotWhole', q, String(q.answer));
  // every number the student can pick must be in the text, readable, and exactly displayed
  const p = strip(q.prompt);
  for (const c of q.chips) {
    if (!p.includes(c.t)) fail('chipNotInText', q, c.t);
    const r = readQty(c.t);
    if (r && String(r.v) !== String(parseFloat(c.t.match(/^[\d.]+/)[0]))) fail('chipDisplay', q, c.t);
  }
  // the big one: re-solve from the displayed numbers
  const r = resolve(q);
  if (r == null) fail('unresolvable_' + q.cat, q, label);
  else if (!near(r, q.answer, 1e-9)) fail('displayedMathsMismatch_' + q.cat, q, 'displayed maths gives ' + r + ', graded answer is ' + q.answer);
  // grading self-consistency
  if (!X.grade(q, q.answer).ok) fail('gradeRejectsOwnAnswer', q, String(q.answer));
  if (q.exact != null && Math.abs(q.exact - q.answer) > 1e-6) { const g = X.grade(q, q.exact); if (g.ok || g.slip !== 'rounding') fail('exactNotFlaggedAsRounding', q, String(q.exact)); }
  for (const t of q.traps) if (Math.abs(t.v - q.answer) < 1e-9) fail('trapEqualsAnswer', q, t.slip);
  checkLines(q); checkGuided(q); checkTemplate(q);
  // Joan's-test options
  const o = X.mcqOpts(q);
  if (o.length !== 4) fail('mcqNotFour', q, String(o.length));
  if (o.filter(x => x.ok).length !== 1) fail('mcqRightCount', q);
  const keys = o.map(x => X.qs(x.v, q.aU));
  if (new Set(keys).size !== keys.length) fail('mcqDuplicate', q, keys.join(' / '));
  if (o.some(x => !(x.v > 0))) fail('mcqNonPositive', q, keys.join(' / '));
  if (!near(o.find(x => x.ok).v, q.answer)) fail('mcqRightIsWrong', q);
  // generator contracts
  if (contract) {
    const hasConv = q.lines.some(l => l.lab === 'convert');
    if (contract.conv === true && !hasConv) fail('contractConvMissing', q, label);
    if (contract.conv === false && hasConv) fail('contractConvUnwanted', q, label);
    if (contract.L && !/\dL\b/.test(q.chips.map(c => c.t).join(' '))) fail('contractNotLitres', q, label);
    if (contract.cat && q.cat !== contract.cat) fail('contractWrongCat', q, label + ' → ' + q.cat);
  }
}

const VARIANTS = [
  ['tab default', () => X.genTab(), { cat: 'tab' }], ['tab conv', () => X.genTab({ conv: true }), { cat: 'tab', conv: true }], ['tab plain', () => X.genTab({ conv: false }), { cat: 'tab', conv: false }],
  ['liq default', () => X.genLiq(), { cat: 'liq' }], ['liq conv', () => X.genLiq({ conv: true }), { cat: 'liq', conv: true }], ['liq plain', () => X.genLiq({ conv: false }), { cat: 'liq', conv: false }],
  ['inj default', () => X.genInj(), { cat: 'inj' }], ['inj conv', () => X.genInj({ conv: true }), { cat: 'inj', conv: true }], ['inj plain', () => X.genInj({ conv: false }), { cat: 'inj', conv: false }],
  ['inj clexane', () => X.genInj({ clexane: true }), { cat: 'inj', conv: false }],
  ['wt mg', () => X.genWt('mg'), { cat: 'wt' }], ['wt mL', () => X.genWt('mL'), { cat: 'wt' }], ['wt day', () => X.genWt('day'), { cat: 'wt' }], ['wt any', () => X.genWt(), { cat: 'wt' }],
  ['ratio', () => X.genRatio(), { cat: 'ratio', conv: false }],
  ['drip any', () => X.genDrip(), { cat: 'drip' }], ['drip df20', () => X.genDrip({ df: 20 }), { cat: 'drip' }], ['drip L60', () => X.genDrip({ df: 60, L: true }), { cat: 'drip', L: true }],
  ['powder any', () => X.genPowder(), { cat: 'powder' }], ['powder oral', () => X.genPowder('oral'), { cat: 'powder' }], ['powder inj', () => X.genPowder('inj'), { cat: 'powder' }],
  ['dil', () => X.genDil(), { cat: 'dil' }], ['conv', () => X.genConv(), { cat: 'conv' }],
  ['rate', () => X.gRate(), { cat: 'rate' }], ['time', () => X.gTime(), { cat: 'time' }],
];
for (const [label, gen, contract] of VARIANTS) for (let i = 0; i < N; i++) audit(gen(), label, contract);
for (let i = 0; i < N; i++) X.MOCK.forEach((f, k) => audit(f(), 'mock Q' + (k + 1)));
for (const cat of Object.keys(X.CATS)) for (let i = 0; i < N; i++) audit(X.makeQ(cat), 'drill ' + cat);

/* ---------- 3. Joan's published answers ---------- */
const W = (w, g, v) => X.buildWG({ want: w, got: g, vol: v });
const mg = v => ({ v, u: 'mg' }), mcg = v => ({ v, u: 'mcg' }), g_ = v => ({ v, u: 'g' }), mL = v => ({ v, u: 'mL' }), tab = { v: 1, u: 'tablet' }, cap = { v: 1, u: 'capsule' };
const JOAN = [
  ['Deck Ex1 gliclazide', W(mg(160), mg(80), tab), 2], ['Deck Ex2 digoxin', W(mg(0.25), mcg(62.5), tab), 4], ['Deck Ex3 paracetamol', W(g_(1), mg(500), cap), 2],
  ['Deck Ex4 paracetamol liq', W(mg(250), mg(200), mL(5)), 6.25], ['Deck Ex5 flucloxacillin', W(mg(375), mg(125), mL(5)), 15], ['Deck Ex6 pethidine', W(mg(75), mg(100), mL(2)), 1.5],
  ['Deck Ex7 gentamicin', W(mg(60), mg(80), mL(2)), 1.5], ['Deck Ex8 furosemide 0.1g', W(g_(0.1), mg(20), mL(2)), 10],
  ['Deck Ex9 ampicillin', X.buildWT({ mode: 'mg', pk: 10, kg: 30 }), 300], ['Deck Ex10 paracetamol', X.buildWT({ mode: 'mg', pk: 15, kg: 9.5 }), 142.5],
  ['Deck Ex11 penicillin', X.buildWT({ mode: 'mL', pk: 30, kg: 15, got: mg(250), vol: mL(5) }), 9], ['Deck daily prednisone', X.buildWT({ mode: 'day', pk: 1, kg: 40, n: 2, got: mg(5), vol: tab }), 4],
  ['Deck Ex12 adrenaline', W(mg(0.5), mg(1), mL(1)), 0.5], ['Deck Ex13 adrenaline', W(mg(0.7), mg(1), mL(1)), 0.7],
  ['Deck Ex14 drip', X.buildDrip({ vol: mL(1000), df: 60, hr: 12 }), 83], ['Deck Ex15 drip', X.buildDrip({ vol: mL(500), df: 20, hr: 6 }), 28],
  ['Deck Ex16 drip 1L', X.buildDrip({ vol: { v: 1, u: 'L' }, df: 20, hr: 5 }), 67], ['Deck Ex17 drip', X.buildDrip({ vol: mL(500), df: 20, hr: 3 }), 56],
  ['Deck Ex18 amoxicillin powder', W(mg(400), mg(250), mL(5)), 8], ['Deck Ex20 ceftriaxone', W(g_(2), mg(200), mL(1)), 10],
  ['Deck Ex21 XD', X.buildDil({ want: mg(3), amp: mg(10), av: 1, dv: 9 }), 3], ['Deck Ex23 morphine', X.buildDil({ want: mg(1), amp: mg(5), av: 1, dv: 9 }), 2],
  ['Deck Ex24 morphine', X.buildDil({ want: mg(4), amp: mg(5), av: 1, dv: 9 }), 8],
  ['PT4 Q1 prazosin', W(mg(0.8), mcg(200), tab), 4], ['PT4 Q2 metoprolol', W(mg(25), mg(12.5), tab), 2], ['PT4 Q3 penicillin 1g/5mL', W(mg(400), g_(1), mL(5)), 2],
  ['PT4 Q4 amoxicillin', W(mg(125), mg(250), mL(5)), 2.5], ['PT4 Q5 penicillin 5mg/kg', X.buildWT({ mode: 'mL', pk: 5, kg: 8, got: mg(100), vol: mL(5) }), 2],
  ['PT4 Q6 digoxin', W(mcg(250), mg(0.5), mL(2)), 1], ['PT4 Q7 risperidone', W(mg(2.5), mg(1), mL(1)), 2.5], ['PT4 Q8 Clexane', W(mg(40), mg(60), mL(0.6)), 0.4],
  ['PT4 Q9 morphine dilution', X.buildDil({ want: mg(3), amp: mg(10), av: 1, dv: 9 }), 3], ['PT4 Q10 Augmentin', X.buildWT({ mode: 'mg', pk: 20, kg: 27 }), 540],
  ['PT4 Q11 adrenaline', W(mg(1), mg(1), mL(1)), 1], ['PT4 Q12 RBC', X.buildDrip({ vol: mL(400), df: 20, hr: 3 }), 44], ['PT4 Q13 dextrose 1L', X.buildDrip({ vol: { v: 1, u: 'L' }, df: 60, hr: 8 }), 125],
  ['PT4 Q14 penicillin', X.buildWT({ mode: 'mL', pk: 5, kg: 10, got: mg(100), vol: mL(5) }), 2.5],
  ['PT3 Q1 sulphadiazine', W(mg(700), mg(500), mL(5)), 7], ['PT3 Q3 penicillin 125/3', W(mg(350), mg(125), mL(3)), 8.4], ['PT3 Q5 dextrose', X.buildDrip({ vol: mL(750), df: 20, hr: 8 }), 31],
  ['PT3 Q6 digoxin syrup', W(mg(0.125), mcg(5), mL(1)), 25], ['PT3 Q7 amoxycillin', X.buildWT({ mode: 'mL', pk: 25, kg: 24, got: mg(250), vol: mL(5) }), 12],
  ['PT3 Q8 NaCl', X.buildDrip({ vol: mL(600), df: 60, hr: 4 }), 150], ['PT3 Q9 cortisone', W(mg(65), mg(125), mL(5)), 2.6], ['PT3 Q10 phenobarbitone', W(mg(140), mg(200), mL(2)), 1.4],
  ['PT3 Q12 morphine', X.buildDil({ want: mg(6), amp: mg(10), av: 1, dv: 9 }), 6],
  ['PT5 Q2 cortisone dilution', X.buildDil({ want: mg(80), amp: mg(125), av: 3, dv: 7 }), 6.4], ['PT5 Q6 paracetamol qid', X.buildWT({ mode: 'mL', pk: 10, kg: 12, got: mg(250), vol: mL(5) }), 2.4],
  ['PT5 Q8 penicillin 1g/10mL', W(mg(200), g_(1), mL(10)), 2], ['PT5 Q9 NaCl 0.6L', X.buildDrip({ vol: { v: 0.6, u: 'L' }, df: 60, hr: 4 }), 150],
  ['PT5 Q10 midazolam', X.buildDil({ want: mg(1.5), amp: mg(5), av: 5, dv: 5 }), 3],
];
/* the two extras aren't Joan's, so they're checked against hand-worked answers instead */
const EXTRA = [
  ['rate 1000mL/8hr', X.buildRate({ vol: 1000, hr: 8 }), 125], ['rate 1000mL/6hr', X.buildRate({ vol: 1000, hr: 6 }), 167],
  ['rate 500mL/8hr', X.buildRate({ vol: 500, hr: 8 }), 63], ['rate 1000mL/12hr', X.buildRate({ vol: 1000, hr: 12 }), 83],
  ['rate 100mL/30min', X.buildRate({ vol: 100, mins: 30 }), 200], ['rate 100mL/20min', X.buildRate({ vol: 100, mins: 20 }), 300],
  ['time 1000mL@125', X.buildTime({ vol: 1000, rate: 125, unit: 'hours' }), 8], ['time 250mL@100 min', X.buildTime({ vol: 250, rate: 100, unit: 'minutes' }), 150],
  ['time 100mL@300 min', X.buildTime({ vol: 100, rate: 300, unit: 'minutes' }), 20],
];
for (const [name, q, want] of EXTRA) {
  if (!near(q.answer, want)) fail('extraAnswerMismatch', null, name + ': engine ' + q.answer + ', by hand ' + want);
  q.prompt = name; checkLines(q); checkTemplate(q);
}

let joanOk = 0;
for (const [name, q, want] of JOAN) {
  if (!near(q.answer, want)) fail('joanAnswerMismatch', null, name + ': engine ' + q.answer + ', Joan ' + want);
  else joanOk++;
  q.prompt = name; q.chips = q.chips || [];
  checkLines(q); checkTemplate(q);
}

const total = (VARIANTS.length + X.MOCK.length + Object.keys(X.CATS).length) * N;
console.log('=== MedCalc audit:', file);
console.log('inline scripts parsed     :', scripts.length);
console.log('questions generated       :', total);
console.log('distinct question texts   :', distinct.size, '(names normalised)');
console.log('Joan’s answers reproduced :', joanOk + '/' + JOAN.length);
console.log('FAILURES                  :', failures);
for (const [k, v] of Object.entries(examples)) { console.log('\n--- ' + k); v.forEach(x => console.log('  · ' + x)); }
process.exit(failures > 0 ? 1 : 0);
