// 小学 1~6 年级课标范围与出题引擎
// 原则：每个年级的运算范围严格按课标划定，绝不超纲。
// 特性：① 每个题型支持 易/中/难 三档难度；② 同一知识点多种问法（变体）；
//       ③ 新增应用题/比大小/填空/单位换算/图形周长/找规律/判断/统计 等题型；
//       ④ 含 = 或 □ 的题目自动标记 noEq，避免渲染时再追加 "= ?" 造成重复。

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
// 点阵可视化已关闭：低年级用户反馈不需要，保留函数名以便后续按需开启。
function withDots(q, a, b) {
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
  if (variant === 'std') return { text: `${a} × ${b}`, answer: a * b };
  if (variant === 'find1') return { text: `□ × ${b} = ${a * b}`, answer: a };
  return { text: `${a} × □ = ${a * b}`, answer: b };
}
function genDiv(m, diff) {
  const aMax = m.aMax || 9, bMax = m.bMax || 9;
  const aEff = diff === 'easy' ? Math.min(aMax, aMax <= 9 ? 5 : 20) : diff === 'hard' ? aMax : Math.min(aMax, aMax <= 9 ? 9 : Math.floor(aMax * 0.4));
  const bEff = diff === 'easy' ? Math.min(bMax, 4) : bMax;
  const variant = pick(['std', 'finddiv']);
  const b = rnd(2, bEff), a = rnd(2, aEff), p = a * b;
  if (variant === 'std') return { text: `${p} ÷ ${b}`, answer: a };
  return { text: `□ ÷ ${b} = ${a}`, answer: p };
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
  return { text: `${base} 的 ${p}% 是多少？`, answer: Math.round(base * p / 100), noEq: true };
}

// 应用题：生活情境，按年级与难度分级（低年级单步 → 中年级两步 → 高年级多步含小数/百分数/行程/比例），答案仍为单纯数字
function genWord(m, diff, grade) {
  const big = diff === 'easy' ? 20 : diff === 'hard' ? 80 : 40;
  const mid = diff === 'easy' ? 10 : diff === 'hard' ? 50 : 25;
  // 低年级（1-2）：单步加减乘
  if (!grade || grade <= 2) {
    const tpl = pick([
      () => { const a = rnd(1, big), b = rnd(1, big); return { text: `小明有 ${a} 个苹果，妈妈又买了 ${b} 个，现在一共有几个？`, answer: a + b }; },
      () => { let a = rnd(5, big), b = rnd(1, a); return { text: `书架上有 ${a} 本书，借走了 ${b} 本，还剩几本？`, answer: a - b }; },
      () => { const a = rnd(2, 9), b = rnd(2, 9); return { text: `一盒有 ${a} 个鸡蛋，${b} 盒一共有几个？`, answer: a * b }; },
      () => { const b = rnd(2, 9), q = rnd(2, 9), a = b * q; return { text: `把 ${a} 块饼干平均分给 ${b} 个小朋友，每人分几块？`, answer: q }; },
    ]);
    const q = tpl(); q.hint = '读题，写出数字答案'; q.noEq = true; return q;
  }
  // 中年级（3-4）：两步运算，含乘除、总价找零、余数、平均数逆向
  if (grade <= 4) {
    const tpl = pick([
      () => { const a = rnd(2, 9), b = rnd(2, 6), c = rnd(1, mid); return { text: `一箱有 ${a} 瓶水，买了 ${b} 箱，又单独买了 ${c} 瓶，一共有多少瓶？`, answer: a * b + c }; },
      () => { const p = rnd(3, 12), n = rnd(2, 6), pay = p * n, give = pay + rnd(5, 30); return { text: `每支笔 ${p} 元，买 ${n} 支，付了 ${give} 元，应找回多少元？`, answer: give - pay }; },
      () => { const a = rnd(10, big), b = rnd(2, 9); const q = Math.floor(a / b); return { text: `把 ${a} 颗糖平均分给 ${b} 个小朋友，每人分 ${q} 颗，还剩几颗？`, answer: a - q * b }; },
      () => { let a = rnd(10, big), b = rnd(2, 9), c = rnd(2, 9); const t = a - b * c; return { text: `停车场原来有 ${a} 辆车，开走了 ${b} 次、每次 ${c} 辆，还剩多少辆？`, answer: Math.max(0, t) }; },
      () => { const avg = rnd(85, 95), x = rnd(80, 95), y = rnd(80, 95), total = avg * 3; return { text: `小红三次数学测验平均分 ${avg} 分，前两次分别 ${x} 分和 ${y} 分，第三次应得多少分？`, answer: total - x - y }; },
    ]);
    const q = tpl(); q.hint = '先分步算，再写答案'; q.noEq = true; return q;
  }
  // 高年级（5-6）：多步，含小数购物、行程、折扣、分数、混合计价、比例
  const tpl = pick([
    () => { const p = rnd(2, 9) + (Math.random() < 0.5 ? 0.5 : 0); const n = rnd(2, 5); const cost = roundTo(p * n, 2); const give = Math.ceil(cost) + rnd(1, 10); return { text: `每千克苹果 ${fmt(p)} 元，买了 ${n} 千克，付了 ${give} 元，应找回多少元？`, answer: roundTo(give - cost, 2) }; },
    () => { const s = rnd(40, 90), t = rnd(2, 5); const d = s * t; const extra = rnd(10, 50); return { text: `一辆汽车每小时行驶 ${s} 千米，行了 ${t} 小时，实际比计划多走 ${extra} 千米，计划行驶多少千米？`, answer: d - extra }; },
    () => { const base = rnd(40, 200), p = pick([10, 20, 25, 50]); return { text: `一件衣服原价 ${base} 元，打 ${p} 折，现价多少元？`, answer: Math.round(base * p / 100) }; },
    () => { const total = rnd(30, 80), frac = pick([2, 3, 4]); return { text: `全班有 ${total} 人，其中男生占 ${1}/${frac}，男生大约有多少人？（取整数）`, answer: Math.floor(total / frac) }; },
    () => { const a = rnd(6, 12), b = rnd(3, 8); return { text: `铅笔每支 ${a} 元，橡皮每块 ${b} 元，买 3 支铅笔和 2 块橡皮，一共多少元？`, answer: a * 3 + b * 2 }; },
    () => { const k = rnd(2, 5), a = rnd(4, 12) * 10; const b = a * k; return { text: `甲车间生产 ${a} 个零件，乙车间产量是甲车间的 ${k} 倍，两个车间一共生产多少个零件？`, answer: a + b }; },
  ]);
  const q = tpl();
  if (typeof q.answer === 'number' && !Number.isInteger(q.answer)) q.decimal = true;
  q.hint = '分步列式，写出数字答案'; q.noEq = true;
  return q;
}

// 比大小：低年级直接比两个结果，高年级按课标升级（小数/分数/百分数/负数/比）
// 比大小：左右两侧为需要计算的算式（按年级升级），算出后再比
function genCompare(m, diff, grade) {
  const cmpAns = (L, R) => L > R ? '>' : L < R ? '<' : '=';
  const mk = (leftText, L, R) => {
    if (R < 0) R = L + rnd(1, 3);
    return { text: `${leftText} ○ ${fmt(R)}`, choices: ['>', '<', '='], answer: cmpAns(L, R), hint: '先算出左边，再比大小', noEq: true };
  };
  // 低年级（1-2）：两位数加减、表内乘法、两步混合
  if (!grade || grade <= 2) {
    const kind = pick(['add', 'sub', 'mul', 'mixed']);
    if (kind === 'add') { const a = rnd(10, 99), b = rnd(10, 99), L = a + b, R = L + pick([0, -5, -3, -2, -1, 1, 2, 3, 5]); return mk(`${a} + ${b}`, L, R); }
    if (kind === 'sub') { const a = rnd(30, 99), b = rnd(10, a - 10), L = a - b, R = L + pick([0, -5, -3, -2, -1, 1, 2, 3, 5]); return mk(`${a} - ${b}`, L, R); }
    if (kind === 'mul') { const a = rnd(2, 9), b = rnd(2, 9), L = a * b, R = L + pick([0, -3, -2, -1, 1, 2, 3]); return mk(`${a} × ${b}`, L, R); }
    const a = rnd(20, 80), b = rnd(2, 9), c = rnd(2, 9), L = a + b * c, R = L + pick([0, -5, -3, -2, -1, 1, 2, 3, 5]); return mk(`${a} + ${b} × ${c}`, L, R);
  }
  // 中年级（3-4）：三位数加减、两位数乘除、小数加减、带括号
  if (grade <= 4) {
    const kind = pick(['add3', 'mul', 'div', 'decAdd', 'paren']);
    if (kind === 'add3') { const a = rnd(100, 999), b = rnd(100, 999), L = a + b, R = L + pick([0, -15, -8, -5, 5, 8, 15]); return mk(`${a} + ${b}`, L, R); }
    if (kind === 'mul') { const a = rnd(11, 99), b = rnd(2, 12), L = a * b, R = L + pick([0, -10, -5, 5, 10]); return mk(`${a} × ${b}`, L, R); }
    if (kind === 'div') { const b = rnd(2, 12), q = rnd(2, 12), a = b * q, L = q, R = L + pick([0, -2, -1, 1, 2]); return mk(`${a} ÷ ${b}`, L, R); }
    if (kind === 'decAdd') { const a = roundTo(rnd(1, 9) + rnd(0, 9) / 10, 1), b = roundTo(rnd(1, 9) + rnd(0, 9) / 10, 1), L = roundTo(a + b, 1), R = roundTo(L + pick([-0.5, -0.2, -0.1, 0.1, 0.2, 0.5]), 1); return mk(`${fmt(a)} + ${fmt(b)}`, L, R); }
    const a = rnd(10, 50), b = rnd(2, 9), c = rnd(2, 9), L = (a + b) * c, R = L + pick([0, -10, -5, 5, 10]); return mk(`(${a} + ${b}) × ${c}`, L, R);
  }
  // 高年级（5-6）：小数乘除、分数加法、百分数、平方、比例（比值）
  const kind = pick(['decMul', 'decDiv', 'fracAdd', 'percent', 'square', 'ratio']);
  if (kind === 'decMul') { const a = roundTo(rnd(1, 9) + rnd(0, 99) / 100, 2), b = rnd(2, 9), L = roundTo(a * b, 2), R = roundTo(L + pick([-0.5, -0.2, -0.1, 0.1, 0.2, 0.5]), 2); return mk(`${fmt(a)} × ${b}`, L, R); }
  if (kind === 'decDiv') { const b = rnd(2, 9), res = roundTo(rnd(1, 9) + rnd(0, 9) / 10, 1), a = roundTo(res * b, 1), L = res, R = roundTo(L + pick([-0.4, -0.2, -0.1, 0.1, 0.2, 0.4]), 1); return mk(`${fmt(a)} ÷ ${b}`, L, R); }
  if (kind === 'fracAdd') { const b = rnd(2, 6), d = rnd(2, 6), a = rnd(1, b - 1 || 1), c = rnd(1, d - 1 || 1), L = roundTo(a / b + c / d, 2), R = roundTo(L + pick([-0.3, -0.1, 0.1, 0.3]), 2); return mk(`${a}/${b} + ${c}/${d}`, L, R); }
  if (kind === 'percent') { const p = pick([10, 20, 25, 50]), n = rnd(20, 200), L = Math.round(n * p / 100), R = L + pick([0, -5, -2, 2, 5]); return mk(`${p}% × ${n}`, L, R); }
  if (kind === 'square') { const a = rnd(2, 15), L = a * a, R = L + pick([0, -5, -3, -1, 1, 3, 5]); return mk(`${a}²`, L, R); }
  const a = rnd(2, 9), b = rnd(2, 9), c = rnd(2, 9); let d = Math.max(1, Math.round(b * c / a)); const wrong = Math.random() < 0.5; if (wrong) d += pick([-2, -1, 1, 2]); if (d < 1) d = 1; const Lf = a * d, Rf = b * c; return { text: `${a}:${b} ○ ${c}:${d}`, choices: ['>', '<', '='], answer: cmpAns(Lf, Rf), hint: '算比值，再比大小', noEq: true };
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
    return { text: `一个长方形，长 ${a} 厘米，宽 ${b} 厘米，它的周长是多少厘米？`, answer: 2 * (a + b), noEq: true };
  }
  const s = rnd(2, diff === 'easy' ? 10 : 20);
  return { text: `一个正方形，边长 ${s} 厘米，它的周长是多少厘米？`, answer: 4 * s, noEq: true };
}

// 找规律
function genPattern(m, diff) {
  if (Math.random() < 0.5) {
    const step = pick([2, 3, 5, 10]);
    const s = rnd(1, diff === 'easy' ? 5 : 10);
    const t = [s, s + step, s + 2 * step, s + 3 * step];
    return { text: `${t.join(', ')}, ?`, answer: s + 4 * step, hint: '找规律，填下一个数', noEq: true };
  }
  const f = pick([2, 3]), s = rnd(2, 5);
  const t = [s, s * f, s * f * f, s * f * f * f];
  return { text: `${t.join(', ')}, ?`, answer: s * f * f * f * f, hint: '找规律，填下一个数', noEq: true };
}

// 统计图表：按年级与难度分级，从条形/表格数据中多步提取并计算
function genStats(m, diff, grade) {
  const hi = diff === 'easy' ? 8 : diff === 'hard' ? 25 : 15;
  // 低年级（1-2）：两组比多少 / 求和（数字范围更大）
  if (!grade || grade <= 2) {
    const names = [['苹果', '橘子'], ['男生', '女生'], ['红球', '蓝球'], ['铅笔', '橡皮']];
    const [n1, n2] = pick(names);
    const a = rnd(3, hi), b = rnd(3, hi);
    let text, answer;
    if (Math.random() < 0.4) { text = `${n1}有 ${a} 个，${n2}有 ${b} 个，一共有几个？`; answer = a + b; }
    else if (a >= b) { text = `${n1}有 ${a} 个，${n2}有 ${b} 个，${n1}比${n2}多几个？`; answer = a - b; }
    else { text = `${n1}有 ${a} 个，${n2}有 ${b} 个，${n2}比${n1}多几个？`; answer = b - a; }
    return { text, answer, hint: '看图（数据），算一算', noEq: true };
  }
  // 中年级（3-4）：三类数据，求总数 / 最大最小差 / 平均
  if (grade <= 4) {
    const a = rnd(5, hi), b = rnd(5, hi); let c = rnd(5, hi);
    const kind = pick(['sum', 'diff', 'avg']);
    if (kind === 'sum') return { text: `三个小组收集废纸：一组 ${a} 千克，二组 ${b} 千克，三组 ${c} 千克，一共多少千克？`, answer: a + b + c, hint: '把三组加起来', noEq: true };
    if (kind === 'diff') { const mx = Math.max(a, b, c), mn = Math.min(a, b, c); return { text: `三个小组收集废品：一组 ${a} 个，二组 ${b} 个，三组 ${c} 个，最多的比最少的多几个？`, answer: mx - mn, hint: '先找最多和最少', noEq: true }; }
    let s = a + b + c; if (s % 3 !== 0) { c = c + (3 - (s % 3)); s = a + b + c; }
    return { text: `小明三次跳绳成绩：第1次 ${a} 下，第2次 ${b} 下，第3次 ${c} 下，平均每次跳多少下？`, answer: s / 3, hint: '总数 ÷ 3', noEq: true };
  }
  // 高年级（5-6）：读表多步，平均数（整除）、倍数、已知平均反推、极差
  const a = rnd(10, hi * 2), b = rnd(10, hi * 2); let c = rnd(10, hi * 2);
  const kind = pick(['avg', 'mult', 'back', 'range']);
  if (kind === 'avg') { let s = a + b + c; if (s % 3 !== 0) { c = c + (3 - (s % 3)); s = a + b + c; } return { text: `某小队三天植树：第一天 ${a} 棵，第二天 ${b} 棵，第三天 ${c} 棵，平均每天植树多少棵？`, answer: s / 3, hint: '总数 ÷ 3', noEq: true }; }
  if (kind === 'mult') { const k = rnd(2, 4); const bigger = b * k; return { text: `甲班有 ${b} 人，乙班人数是甲班的 ${k} 倍，甲乙两班一共多少人？`, answer: b + bigger, hint: '先算乙班，再加', noEq: true }; }
  if (kind === 'back') { const avg = rnd(20, 60), x = rnd(15, avg - 1), y = rnd(15, avg - 1), z = rnd(15, avg - 1), total = avg * 4; return { text: `四次数学测验平均分 ${avg} 分，前三次分别是 ${x} 分、${y} 分、${z} 分，第四次至少得多少分才能使平均分达到 ${avg} 分？`, answer: total - x - y - z, hint: '总数 = 平均×4，再减前三次', noEq: true }; }
  const mx = Math.max(a, b, c), mn = Math.min(a, b, c);
  return { text: `三个商场上月销售额（万元）：甲 ${a}，乙 ${b}，丙 ${c}。销售额最高的比最低的多多少万元？`, answer: mx - mn, hint: '找最大最小再相减', noEq: true };
}

// 判断题：均为含运算的等式，需先算再判断对/错（不再放纯概念题）
function genJudge(m, diff, grade) {
  const mkEq = (leftText, correctNum, shownNum) => ({ text: `${leftText} = ${fmt(shownNum)}`, choices: ['对', '错'], answer: (shownNum === correctNum) ? '对' : '错', hint: '先算一算，再判断', noEq: true });
  // 低年级（1-2）：两位数加减乘、两步混合
  if (!grade || grade <= 2) {
    const kind = pick(['add', 'sub', 'mul', 'mixed']);
    if (kind === 'add') { const a = rnd(10, 99), b = rnd(10, 99), c = a + b, shown = Math.random() < 0.5 ? c : c + pick([-3, 3, -2, 2, -1, 1]); return mkEq(`${a} + ${b}`, c, shown); }
    if (kind === 'sub') { const a = rnd(20, 99), b = rnd(10, a), c = a - b, shown = Math.random() < 0.5 ? c : c + pick([-3, 3, -2, 2, -1, 1]); return mkEq(`${a} - ${b}`, c, shown); }
    if (kind === 'mul') { const a = rnd(2, 9), b = rnd(2, 9), c = a * b, shown = Math.random() < 0.5 ? c : c + pick([-2, 2, -1, 1]); return mkEq(`${a} × ${b}`, c, shown); }
    const a = rnd(10, 50), b = rnd(2, 9), c = rnd(2, 9), val = a + b * c, shown = Math.random() < 0.5 ? val : val + pick([-3, 3, -2, 2, -1, 1]); return mkEq(`${a} + ${b} × ${c}`, val, shown);
  }
  // 中年级（3-4）：三位加减、两位数乘除、小数加减、带括号
  if (grade <= 4) {
    const kind = pick(['add3', 'mul', 'div', 'decAdd', 'paren']);
    if (kind === 'add3') { const a = rnd(100, 999), b = rnd(100, 999), c = a + b, shown = Math.random() < 0.5 ? c : c + pick([-15, 15, -8, 8, -5, 5]); return mkEq(`${a} + ${b}`, c, shown); }
    if (kind === 'mul') { const a = rnd(11, 99), b = rnd(2, 12), c = a * b, shown = Math.random() < 0.5 ? c : c + pick([-10, 10, -5, 5]); return mkEq(`${a} × ${b}`, c, shown); }
    if (kind === 'div') { const b = rnd(2, 12), q = rnd(2, 12), a = b * q, shown = Math.random() < 0.5 ? q : q + pick([-2, 2, -1, 1]); return mkEq(`${a} ÷ ${b}`, q, shown); }
    if (kind === 'decAdd') { const a = roundTo(rnd(1, 9) + rnd(0, 9) / 10, 1), b = roundTo(rnd(1, 9) + rnd(0, 9) / 10, 1), c = roundTo(a + b, 1), shown = roundTo(c + pick([-0.5, 0.5, -0.2, 0.2, -0.1, 0.1]), 1); return mkEq(`${fmt(a)} + ${fmt(b)}`, c, shown); }
    const a = rnd(10, 50), b = rnd(2, 9), c = rnd(2, 9), val = (a + b) * c, shown = Math.random() < 0.5 ? val : val + pick([-10, 10, -5, 5]); return mkEq(`(${a} + ${b}) × ${c}`, val, shown);
  }
  // 高年级（5-6）：小数乘除、分数加法、百分数、平方
  const kind = pick(['decMul', 'decDiv', 'fracAdd', 'percent', 'square']);
  if (kind === 'decMul') { const a = roundTo(rnd(1, 9) + rnd(0, 99) / 100, 2), b = rnd(2, 9), c = roundTo(a * b, 2), shown = roundTo(c + pick([-0.5, 0.5, -0.2, 0.2, -0.1, 0.1]), 2); return mkEq(`${fmt(a)} × ${b}`, c, shown); }
  if (kind === 'decDiv') { const b = rnd(2, 9), res = roundTo(rnd(1, 9) + rnd(0, 9) / 10, 1), a = roundTo(res * b, 1), shown = roundTo(res + pick([-0.4, 0.4, -0.2, 0.2, -0.1, 0.1]), 1); return mkEq(`${fmt(a)} ÷ ${b}`, res, shown); }
  if (kind === 'fracAdd') { const b = rnd(2, 6), d = rnd(2, 6), a = rnd(1, b - 1 || 1), c = rnd(1, d - 1 || 1), val = roundTo(a / b + c / d, 2), shown = roundTo(val + pick([-0.3, 0.3, -0.1, 0.1]), 2); return mkEq(`${a}/${b} + ${c}/${d}`, val, shown); }
  if (kind === 'percent') { const p = pick([10, 20, 25, 50]), n = rnd(20, 200), c = Math.round(n * p / 100), shown = Math.random() < 0.5 ? c : c + pick([-5, 5, -2, 2]); return mkEq(`${p}% × ${n}`, c, shown); }
  const a = rnd(2, 15), c = a * a, shown = Math.random() < 0.5 ? c : c + pick([-5, 5, -3, 3, -1, 1]); return mkEq(`${a}²`, c, shown);
}

function generateQuestion(module, opts) {
  const diff = (opts && opts.difficulty) || 'medium';
  let q;
  switch (module.type) {
    case 'add': q = genAdd(module, diff); break;
    case 'sub': q = genSub(module, diff); break;
    case 'addsub': q = genAddSub(module, diff); break;
    case 'mul': q = genMul(module, diff); break;
    case 'div': q = genDiv(module, diff); break;
    case 'mixed': q = genMixed(module.max, diff); break;
    case 'decadd': q = genDecAdd(module, diff); break;
    case 'decmul': q = genDecMul(module, diff); break;
    case 'decdiv': q = genDecDiv(module, diff); break;
    case 'decMix': q = genDecMix(module, diff); break;
    case 'fracadd': q = genFracAdd(module, diff); break;
    case 'fracmul': q = genFracMul(module, diff); break;
    case 'fracMix': q = genFracMix(module, diff); break;
    case 'word': q = genWord(module, diff, opts.grade); break;
    case 'compare': q = genCompare(module, diff, opts.grade); break;
    case 'fill': q = genFill(module, diff); break;
    case 'measure': q = genMeasure(module, diff); break;
    case 'shape': q = genShape(module, diff); break;
    case 'pattern': q = genPattern(module, diff); break;
    case 'stats': q = genStats(module, diff, opts.grade); break;
    case 'judge': q = genJudge(module, diff, opts.grade); break;
    default: q = genAdd({ max: 20 }, diff);
  }
  // 若题干本身已含 "=" 或 "□"，前端不要再自动追加 "= ?"，避免 "□ × 2 = 18 = ?"
  if (q && q.text && (q.text.includes('=') || q.text.includes('□'))) q.noEq = true;
  return q;
}

window.SYLLABUS = SYLLABUS;
window.GRADE_LABELS = GRADE_LABELS;
window.generateQuestion = generateQuestion;
