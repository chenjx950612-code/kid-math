// 小学 1~6 年级课标范围与出题引擎
// 原则：每个年级的运算范围严格按课标划定，绝不超纲。
// 特性：① 每个题型支持 易/中/难 三档难度；② 同一知识点多种问法（变体）；
//       ③ 新增应用题/比大小/填空/单位换算/图形周长/找规律/判断/统计 等题型；
//       ④ 乘除法附带点阵可视化数据（dots），帮助低年级直观理解。

function rnd(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function pick(arr) { return arr[rnd(0, arr.length - 1)]; }
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = rnd(0, i); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function fmt(n) {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? String(r) : String(r);
}
function roundTo(n, dp) { const f = Math.pow(10, dp); return Math.round(n * f) / f; }
// 根据难度返回该题型数字上限（易偏小、中适中、难到顶）
function hiBound(max, diff) {
  if (diff === 'easy') return Math.max(9, Math.floor(max * 0.1));
  if (diff === 'hard') return max;
  return Math.min(max, Math.max(10, Math.floor(max * 0.5)));
}
// 给乘除法题附带点阵（乘积 ≤ 60 才显示，避免过多）
function withDots(q, a, b) {
  if (a * b <= 60) { const x = Math.min(a, b), y = Math.max(a, b); q.dots = { a: x, b: y }; }
  return q;
}

// 各年级模块：type 决定生成方式，其余为参数（运算范围）
// 新增题型 type：word(应用题) compare(比大小) fill(等式填空) measure(单位换算)
//               shape(图形周长) pattern(找规律) stats(统计图表) judge(判断题)
//               decMix(小数混合) fracMix(分数混合)
const SYLLABUS = {
  1: [
    { id: 'g1-add20', name: '20以内加法', type: 'add', max: 20 },
    { id: 'g1-sub20', name: '20以内减法', type: 'sub', max: 20 },
    { id: 'g1-add100', name: '100以内加法', type: 'add', max: 100 },
    { id: 'g1-sub100', name: '100以内减法', type: 'sub', max: 100 },
    { id: 'g1-word', name: '应用题(加减)', type: 'word' },
    { id: 'g1-compare', name: '比大小', type: 'compare', max: 20 },
    { id: 'g1-fill', name: '填空(求未知数)', type: 'fill', max: 20 },
    { id: 'g1-measure', name: '元角分换算', type: 'measure' },
    { id: 'g1-pattern', name: '找规律', type: 'pattern' },
    { id: 'g1-judge', name: '判断题', type: 'judge', max: 20 },
  ],
  2: [
    { id: 'g2-mix100', name: '100以内加减混合', type: 'addsub', max: 100 },
    { id: 'g2-mul26', name: '乘法口诀 2~6', type: 'mul', bMax: 6 },
    { id: 'g2-mul79', name: '乘法口诀 7~9', type: 'mul', bMax: 9 },
    { id: 'g2-div', name: '表内除法', type: 'div', bMax: 9 },
    { id: 'g2-word', name: '应用题(乘除)', type: 'word' },
    { id: 'g2-compare', name: '比大小', type: 'compare', max: 50 },
    { id: 'g2-fill', name: '填空(求未知数)', type: 'fill', max: 50 },
    { id: 'g2-measure', name: '元角分·时分', type: 'measure' },
    { id: 'g2-stats', name: '统计图表', type: 'stats' },
    { id: 'g2-judge', name: '判断题', type: 'judge', max: 50 },
  ],
  3: [
    { id: 'g3-addw', name: '万以内加减', type: 'addsub', max: 10000 },
    { id: 'g3-mul', name: '多位数×一位数', type: 'mul', aMax: 999, bMax: 9 },
    { id: 'g3-div', name: '除数是一位数', type: 'div', aMax: 99, bMax: 9 },
    { id: 'g3-mixed', name: '混合运算', type: 'mixed', max: 9 },
    { id: 'g3-word', name: '应用题', type: 'word' },
    { id: 'g3-compare', name: '比大小', type: 'compare', max: 100 },
    { id: 'g3-fill', name: '填空(求未知数)', type: 'fill', max: 100 },
    { id: 'g3-shape', name: '图形周长', type: 'shape' },
    { id: 'g3-measure', name: '长度·重量换算', type: 'measure' },
    { id: 'g3-stats', name: '统计图表', type: 'stats' },
    { id: 'g3-judge', name: '判断题', type: 'judge', max: 100 },
  ],
  4: [
    { id: 'g4-mul', name: '三位数×两位数', type: 'mul', aMax: 999, bMax: 99 },
    { id: 'g4-div', name: '除数是两位数', type: 'div', aMax: 999, bMax: 99 },
    { id: 'g4-decadd', name: '小数加减', type: 'decadd', dp: 1 },
    { id: 'g4-decmix', name: '小数(加减乘除)', type: 'decMix', dp: 1 },
    { id: 'g4-word', name: '应用题', type: 'word' },
    { id: 'g4-compare', name: '比大小', type: 'compare', max: 200 },
    { id: 'g4-shape', name: '图形周长', type: 'shape' },
    { id: 'g4-measure', name: '长度·重量换算', type: 'measure' },
    { id: 'g4-stats', name: '统计图表', type: 'stats' },
    { id: 'g4-judge', name: '判断题', type: 'judge', max: 200 },
  ],
  5: [
    { id: 'g5-decmul', name: '小数乘法', type: 'decmul', dp: 1 },
    { id: 'g5-decdiv', name: '小数除法', type: 'decdiv', dp: 1 },
    { id: 'g5-fracadd', name: '分数加减(同分母)', type: 'fracadd' },
    { id: 'g5-fracmix', name: '分数(加减乘)', type: 'fracMix' },
    { id: 'g5-word', name: '应用题', type: 'word' },
    { id: 'g5-compare', name: '比大小', type: 'compare', max: 500 },
    { id: 'g5-shape', name: '图形周长', type: 'shape' },
    { id: 'g5-stats', name: '统计图表', type: 'stats' },
    { id: 'g5-judge', name: '判断题', type: 'judge', max: 500 },
  ],
  6: [
    { id: 'g6-fracmul', name: '分数乘法', type: 'fracmul' },
    { id: 'g6-percent', name: '百分数', type: 'percent' },
    { id: 'g6-mixed', name: '四则混合', type: 'mixed', max: 20 },
    { id: 'g6-word', name: '应用题', type: 'word' },
    { id: 'g6-fracmix', name: '分数(加减乘)', type: 'fracMix' },
    { id: 'g6-compare', name: '比大小', type: 'compare', max: 1000 },
    { id: 'g6-shape', name: '图形周长', type: 'shape' },
    { id: 'g6-stats', name: '统计图表', type: 'stats' },
    { id: 'g6-judge', name: '判断题', type: 'judge', max: 1000 },
  ],
};

const GRADE_LABELS = { 1: '一年级', 2: '二年级', 3: '三年级', 4: '四年级', 5: '五年级', 6: '六年级' };

// ---- 各题型生成（均支持难度 diff：easy/medium/hard）----

function genAdd(m, diff) {
  const hi = hiBound(m.max || 20, diff);
  const variant = pick(['std', 'find1', 'find2']);
  const a = rnd(1, hi), b = rnd(1, hi);
  if (variant === 'std') return { text: `${a} + ${b}`, answer: a + b };
  if (variant === 'find1') { const s = a + b; return { text: `□ + ${b} = ${s}`, answer: a, hint: '算出方框里的数' }; }
  const s = a + b; return { text: `${a} + □ = ${s}`, answer: b, hint: '算出方框里的数' };
}
function genSub(m, diff) {
  const hi = hiBound(m.max || 20, diff);
  const variant = pick(['std', 'find']);
  let a = rnd(1, hi), b = rnd(1, hi); if (b > a) [a, b] = [b, a];
  if (variant === 'std') return { text: `${a} - ${b}`, answer: a - b };
  return { text: `${a} - □ = ${a - b}`, answer: b, hint: '算出方框里的数' };
}
function genAddSub(m, diff) { return Math.random() < 0.5 ? genAdd(m, diff) : genSub(m, diff); }
function genMul(m, diff) {
  const aMax = m.aMax || 9, bMax = m.bMax || 9;
  const aEff = diff === 'easy' ? Math.min(aMax, aMax <= 9 ? 5 : 20) : diff === 'hard' ? aMax : Math.min(aMax, aMax <= 9 ? 9 : Math.floor(aMax * 0.4));
  const bEff = diff === 'easy' ? Math.min(bMax, 4) : bMax;
  const a = rnd(2, aEff), b = rnd(2, bEff);
  const variant = pick(['std', 'find1', 'find2']);
  if (variant === 'std') return withDots({ text: `${a} × ${b}`, answer: a * b }, a, b);
  if (variant === 'find1') return withDots({ text: `□ × ${b} = ${a * b}`, answer: a }, a, b);
  return withDots({ text: `${a} × □ = ${a * b}`, answer: b }, a, b);
}
function genDiv(m, diff) {
  const aMax = m.aMax || 9, bMax = m.bMax || 9;
  const aEff = diff === 'easy' ? Math.min(aMax, aMax <= 9 ? 5 : 20) : diff === 'hard' ? aMax : Math.min(aMax, aMax <= 9 ? 9 : Math.floor(aMax * 0.4));
  const bEff = diff === 'easy' ? Math.min(bMax, 4) : bMax;
  const variant = pick(['std', 'finddiv']);
  const b = rnd(2, bEff), a = rnd(2, aEff), p = a * b;
  if (variant === 'std') return withDots({ text: `${p} ÷ ${b}`, answer: a }, a, b);
  return withDots({ text: `□ ÷ ${b} = ${a}`, answer: p }, a, b);
}
function genMixed(max, diff) {
  const hi = hiBound(max, diff);
  const a = rnd(2, hi), b = rnd(2, hi), c = rnd(1, hi);
  if (Math.random() < 0.5) return { text: `${a} × ${b} + ${c}`, answer: a * b + c };
  let s = a + b - c; if (s < 0) s = a + b + c;
  return { text: `${a} + ${b} - ${c}`, answer: s };
}
function genDecAdd(m, diff) {
  const dp = diff === 'hard' ? Math.min(2, (m.dp || 1) + 1) : (m.dp || 1);
  const hi = diff === 'easy' ? 5 : 9;
  const a = roundTo(rnd(1, hi) + rnd(0, 9) / 10, 1);
  const b = roundTo(rnd(1, hi) + rnd(0, 9) / 10, 1);
  const ans = fmt(roundTo(a + b, dp));
  return { text: `${fmt(a)} + ${fmt(b)}`, answer: ans, decimal: String(ans).includes('.') };
}
function genDecMul(m, diff) {
  const dp = diff === 'hard' ? 2 : (m.dp || 1);
  const a = roundTo(rnd(1, diff === 'easy' ? 5 : 9) + rnd(0, 9) / 10, 1);
  const b = rnd(2, 9);
  const ans = fmt(roundTo(a * b, dp));
  return { text: `${fmt(a)} × ${b}`, answer: ans, decimal: String(ans).includes('.') };
}
function genDecDiv(m, diff) {
  const q = rnd(2, diff === 'easy' ? 5 : 9);
  const d = roundTo(rnd(1, 9) / 10, 1);
  const p = roundTo(d * q, 1);
  return { text: `${fmt(p)} ÷ ${fmt(d)}`, answer: q };
}
function genDecMix(m, diff) { return pick([genDecAdd, genDecMul, genDecDiv])(m, diff); }
function genFracAdd(m, diff) {
  const den = rnd(2, 6), a = rnd(1, den - 1), b = rnd(1, den - 1);
  const correct = `${a + b}/${den}`;
  const choices = shuffle([correct, `${Math.max(0, a + b - 1)}/${den}`, `${a + b + 1}/${den}`, `${a + b}/${den + 1}`]);
  return { text: `${a}/${den} + ${b}/${den}`, answer: correct, choices };
}
function genFracMul(m, diff) {
  const den = rnd(2, 5), a = rnd(1, den - 1), b = rnd(1, den - 1);
  const correct = `${a * b}/${den * den}`;
  const choices = shuffle([correct, `${a * b + 1}/${den * den}`, `${a + b}/${den}`, `${a}/${den * den}`]);
  return { text: `${a}/${den} × ${b}/${den}`, answer: correct, choices };
}
function genFracMix(m, diff) { return pick([genFracAdd, genFracMul])(m, diff); }
function genPercent(m, diff) {
  const p = pick([10, 20, 25, 50, 75]), base = pick([20, 40, 60, 80, 100]);
  return { text: `${p}% of ${base} = ?`, answer: Math.round(base * p / 100) };
}

// 应用题：生活情境，随机选一种运算模板（数字按难度缩放），答案仍为单纯数字
function genWord(m, diff) {
  const big = diff === 'easy' ? 15 : diff === 'hard' ? 60 : 30;
  const small = diff === 'easy' ? 5 : 9;
  const tpl = pick([
    () => { const a = rnd(1, big), b = rnd(1, big); return { text: `🍎 小明有 ${a} 个苹果，妈妈又买了 ${b} 个，现在一共有几个？`, answer: a + b }; },
    () => { const a = rnd(1, big), b = rnd(1, big); return { text: `🚌 停车场原来有 ${a} 辆车，又开来 ${b} 辆，现在一共有几辆？`, answer: a + b }; },
    () => { let a = rnd(5, big), b = rnd(1, a); return { text: `📚 书架上有 ${a} 本书，借走了 ${b} 本，还剩几本？`, answer: a - b }; },
    () => { let a = rnd(5, big), b = rnd(1, a); return { text: `🍬 小红有 ${a} 颗糖，吃掉 ${b} 颗，还剩几颗？`, answer: a - b }; },
    () => { const a = rnd(2, small), b = rnd(2, small); return { text: `🥚 一盒有 ${a} 个鸡蛋，${b} 盒一共有几个？`, answer: a * b }; },
    () => { const b = rnd(2, small), q = rnd(2, small), a = b * q; return { text: `🍪 把 ${a} 块饼干平均分给 ${b} 个小朋友，每人分几块？`, answer: q }; },
    () => { let a = rnd(5, big), b = rnd(1, a), c = rnd(1, a + b); return { text: `🏃 小明原来有 ${a} 元，妈妈给了 ${b} 元，买笔花了 ${c} 元，现在还剩几元？`, answer: a + b - c }; },
  ]);
  const q = tpl();
  q.hint = '读题，写出数字答案'; q.noEq = true;
  return q;
}

// 比大小：算出左右两边，选出 > < =
function genCompare(m, diff) {
  const hi = hiBound(m.max || 50, diff);
  const op = pick(['+', '-']);
  let a = rnd(1, hi), b = rnd(1, hi);
  const L = op === '+' ? a + b : (a >= b ? a - b : b - a);
  let R = L + pick([-3, -2, -1, 1, 2, 3]);
  if (R < 0) R = L + 3;
  const ans = L > R ? '>' : L < R ? '<' : '=';
  return { text: `${L} ○ ${R}`, choices: ['>', '<', '='], answer: ans, hint: '比一比，选一个符号', noEq: true };
}

// 等式填空：求方框里的数（加/减两种）
function genFill(m, diff) {
  const hi = hiBound(m.max || 50, diff);
  const kind = pick(['add1', 'add2', 'sub1', 'sub2']);
  let text, ans;
  if (kind === 'add1') { const b = rnd(1, hi), c = rnd(b, hi + b), a = c - b; ans = a; text = `□ + ${b} = ${c}`; }
  else if (kind === 'add2') { const a = rnd(1, hi), c = rnd(a, a + hi), b = c - a; ans = b; text = `${a} + □ = ${c}`; }
  else if (kind === 'sub1') { const a = rnd(1, hi), b = rnd(1, a), c = a - b; ans = b; text = `${a} - □ = ${c}`; }
  else { const b = rnd(1, hi), c = rnd(1, hi), a = b + c; ans = a; text = `□ - ${b} = ${c}`; }
  return { text, answer: ans, hint: '算出方框里的数' };
}

// 单位换算：元角分 / 时分 / 长度 / 重量
const MEASURE_UNITS = {
  yuan: [['元', '角', 10], ['角', '分', 10]],
  time: [['时', '分', 60]],
  len: [['米', '厘米', 100], ['分米', '厘米', 10]],
  weight: [['千克', '克', 1000]],
};
function genMeasure(m, diff) {
  const fam = pick(Object.values(MEASURE_UNITS));
  const [big, small, rate] = pick(fam);
  let text, answer;
  if (diff === 'hard' && Math.random() < 0.5) {
    const n = rate * rnd(1, 9);
    text = `${n}${small} = ? ${big}`; answer = n / rate;
  } else {
    const n = rnd(1, 9);
    text = `${n}${big} = ? ${small}`; answer = n * rate;
  }
  return { text, answer, hint: '想想进率，写出数字', noEq: true };
}

// 图形周长
function genShape(m, diff) {
  if (Math.random() < 0.5) {
    const a = rnd(2, diff === 'easy' ? 10 : 20), b = rnd(2, diff === 'easy' ? 8 : 15);
    return { text: `🔷 一个长方形，长 ${a} 厘米，宽 ${b} 厘米，它的周长是多少厘米？`, answer: 2 * (a + b), hint: '周长 = (长 + 宽) × 2', noEq: true };
  }
  const s = rnd(2, diff === 'easy' ? 10 : 20);
  return { text: `🔷 一个正方形，边长 ${s} 厘米，它的周长是多少厘米？`, answer: 4 * s, hint: '正方形周长 = 边长 × 4', noEq: true };
}

// 找规律
function genPattern(m, diff) {
  if (Math.random() < 0.5) {
    const step = pick([2, 3, 5, 10]);
    const s = rnd(1, diff === 'easy' ? 5 : 10);
    const t = [s, s + step, s + 2 * step, s + 3 * step];
    return { text: `🔢 ${t.join(', ')}, ?`, answer: s + 4 * step, hint: '找规律，填下一个数', noEq: true };
  }
  const f = pick([2, 3]), s = rnd(2, 5);
  const t = [s, s * f, s * f * f, s * f * f * f];
  return { text: `🔢 ${t.join(', ')}, ?`, answer: s * f * f * f * f, hint: '找规律，填下一个数', noEq: true };
}

// 统计图表：看 emoji 数量作答
function genStats(m, diff) {
  const sets = [['🍎', '🍊'], ['⭐', '🌟'], ['🐱', '🐶'], ['🚗', '🚌']];
  const [e1, e2] = pick(sets);
  const hi = diff === 'easy' ? 4 : 7;
  const a = rnd(2, hi), b = rnd(2, hi);
  let text, answer;
  if (Math.random() < 0.4) { text = `📊 ${e1.repeat(a)} ${e2.repeat(b)}　一共几个？`; answer = a + b; }
  else if (a >= b) { text = `📊 ${e1.repeat(a)} ${e2.repeat(b)}　${e1}比${e2}多几个？`; answer = a - b; }
  else { text = `📊 ${e1.repeat(a)} ${e2.repeat(b)}　${e2}比${e1}多几个？`; answer = b - a; }
  return { text, answer, hint: '数一数，算一算', noEq: true };
}

// 判断题：陈述句对错（约一半故意错）
function genJudge(m, diff) {
  const hi = hiBound(m.max || 50, diff);
  const kind = pick(['add', 'sub', 'mul', 'compare', 'measure']);
  let text, answer;
  if (kind === 'add') { const a = rnd(1, hi), b = rnd(1, hi); const wrong = Math.random() < 0.5; text = `✅ ${a} + ${b} = ${a + b + (wrong ? pick([1, -1]) : 0)}`; answer = wrong ? '错' : '对'; }
  else if (kind === 'sub') { let a = rnd(5, hi), b = rnd(1, a); const wrong = Math.random() < 0.5; text = `✅ ${a} - ${b} = ${a - b + (wrong ? 1 : 0)}`; answer = wrong ? '错' : '对'; }
  else if (kind === 'mul') { const a = rnd(2, 9), b = rnd(2, 9); const wrong = Math.random() < 0.5; text = `✅ ${a} × ${b} = ${a * b + (wrong ? 1 : 0)}`; answer = wrong ? '错' : '对'; }
  else if (kind === 'compare') { const a = rnd(1, hi), b = rnd(1, hi); const wrong = Math.random() < 0.5; const op = a > b ? '＞' : a < b ? '＜' : '＝'; const shown = wrong ? (op === '＞' ? '＜' : op === '＜' ? '＞' : '＜') : op; text = `✅ ${a} ${shown} ${b}`; answer = wrong ? '错' : '对'; }
  else { const n = rnd(1, 9); const wrong = Math.random() < 0.5; text = `✅ ${n}元 = ${n * 10 + (wrong ? 1 : 0)}角`; answer = wrong ? '错' : '对'; }
  return { text, choices: ['对', '错'], answer, hint: '判断对错', noEq: true };
}

function generateQuestion(module, opts) {
  const diff = (opts && opts.difficulty) || 'medium';
  switch (module.type) {
    case 'add': return genAdd(module, diff);
    case 'sub': return genSub(module, diff);
    case 'addsub': return genAddSub(module, diff);
    case 'mul': return genMul(module, diff);
    case 'div': return genDiv(module, diff);
    case 'mixed': return genMixed(module.max, diff);
    case 'decadd': return genDecAdd(module, diff);
    case 'decmul': return genDecMul(module, diff);
    case 'decdiv': return genDecDiv(module, diff);
    case 'decMix': return genDecMix(module, diff);
    case 'fracadd': return genFracAdd(module, diff);
    case 'fracmul': return genFracMul(module, diff);
    case 'fracMix': return genFracMix(module, diff);
    case 'word': return genWord(module, diff);
    case 'compare': return genCompare(module, diff);
    case 'fill': return genFill(module, diff);
    case 'measure': return genMeasure(module, diff);
    case 'shape': return genShape(module, diff);
    case 'pattern': return genPattern(module, diff);
    case 'stats': return genStats(module, diff);
    case 'judge': return genJudge(module, diff);
    default: return genAdd({ max: 20 }, diff);
  }
}

window.SYLLABUS = SYLLABUS;
window.GRADE_LABELS = GRADE_LABELS;
window.generateQuestion = generateQuestion;
