// 小学 1~6 年级课标范围与出题引擎
// 原则：每个年级的运算范围严格按课标划定，绝不超纲。
// 生成器只在该范围内出题；乘法/除法附带点阵可视化数据（dots）。

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

// 各年级模块：type 决定生成方式，其余为参数（运算范围）
const SYLLABUS = {
  1: [
    { id: 'g1-add20', name: '20以内加法', type: 'add', max: 20 },
    { id: 'g1-sub20', name: '20以内减法', type: 'sub', max: 20 },
    { id: 'g1-add100', name: '100以内加法', type: 'add', max: 100 },
    { id: 'g1-sub100', name: '100以内减法', type: 'sub', max: 100 },
  ],
  2: [
    { id: 'g2-mix100', name: '100以内加减混合', type: 'addsub', max: 100 },
    { id: 'g2-mul26', name: '乘法口诀 2~6', type: 'mul', bMax: 6 },
    { id: 'g2-mul79', name: '乘法口诀 7~9', type: 'mul', bMax: 9 },
    { id: 'g2-div', name: '表内除法', type: 'div', bMax: 9 },
  ],
  3: [
    { id: 'g3-addw', name: '万以内加减', type: 'addsub', max: 10000 },
    { id: 'g3-mul', name: '多位数×一位数', type: 'mul', aMax: 999, bMax: 9 },
    { id: 'g3-div', name: '除数是一位数', type: 'div', aMax: 99, bMax: 9 },
    { id: 'g3-mixed', name: '混合运算', type: 'mixed', max: 9 },
  ],
  4: [
    { id: 'g4-mul', name: '三位数×两位数', type: 'mul', aMax: 999, bMax: 99 },
    { id: 'g4-div', name: '除数是两位数', type: 'div', aMax: 999, bMax: 99 },
    { id: 'g4-decadd', name: '小数加减', type: 'decadd', dp: 1 },
  ],
  5: [
    { id: 'g5-decmul', name: '小数乘法', type: 'decmul', dp: 1 },
    { id: 'g5-decdiv', name: '小数除法', type: 'decdiv', dp: 1 },
    { id: 'g5-fracadd', name: '分数加减(同分母)', type: 'fracadd' },
  ],
  6: [
    { id: 'g6-fracmul', name: '分数乘法', type: 'fracmul' },
    { id: 'g6-percent', name: '百分数', type: 'percent' },
    { id: 'g6-mixed', name: '四则混合', type: 'mixed', max: 20 },
  ],
};

const GRADE_LABELS = { 1: '一年级', 2: '二年级', 3: '三年级', 4: '四年级', 5: '五年级', 6: '六年级' };

// ---- 各题型生成 ----
function genAdd(max) { const a = rnd(1, max), b = rnd(1, max); return { text: `${a} + ${b}`, answer: a + b }; }
function genSub(max) { let a = rnd(1, max), b = rnd(1, max); if (b > a) [a, b] = [b, a]; return { text: `${a} - ${b}`, answer: a - b }; }
function genAddSub(max) { return Math.random() < 0.5 ? genAdd(max) : genSub(max); }
function genMul(m) {
  const a = rnd(2, m.aMax || 9), b = rnd(2, m.bMax || 9);
  return { text: `${a} × ${b}`, answer: a * b };
}
function genDiv(m) {
  const b = rnd(2, m.bMax || 9), a = rnd(2, m.aMax || 9), p = a * b;
  return { text: `${p} ÷ ${b}`, answer: a };
}
function genMixed(max) {
  const a = rnd(2, max), b = rnd(2, max), c = rnd(1, max);
  if (Math.random() < 0.5) return { text: `${a} × ${b} + ${c}`, answer: a * b + c };
  let s = a + b - c; if (s < 0) s = a + b + c;
  return { text: `${a} + ${b} - ${c}`, answer: s };
}
function genDecAdd() {
  const a = rnd(1, 9) + rnd(1, 9) / 10, b = rnd(1, 9) + rnd(1, 9) / 10;
  return { text: `${fmt(a)} + ${fmt(b)}`, answer: Math.round((a + b) * 10) / 10, decimal: true };
}
function genDecMul() {
  const a = rnd(1, 9) + rnd(1, 9) / 10, b = rnd(2, 9);
  return { text: `${fmt(a)} × ${b}`, answer: Math.round(a * b * 10) / 10, decimal: true };
}
function genDecDiv() {
  const q = rnd(2, 9), d = rnd(1, 9) / 10, p = Math.round(d * q * 10) / 10;
  return { text: `${fmt(p)} ÷ ${fmt(d)}`, answer: q };
}
function genFracAdd() {
  const den = rnd(2, 6), a = rnd(1, den - 1), b = rnd(1, den - 1);
  const correct = `${a + b}/${den}`;
  const choices = shuffle([correct, `${Math.max(0, a + b - 1)}/${den}`, `${a + b + 1}/${den}`, `${a + b}/${den + 1}`]);
  return { text: `${a}/${den} + ${b}/${den}`, answer: correct, choices };
}
function genFracMul() {
  const den = rnd(2, 5), a = rnd(1, den - 1), b = rnd(1, den - 1);
  const correct = `${a * b}/${den * den}`;
  const choices = shuffle([correct, `${a * b + 1}/${den * den}`, `${a + b}/${den}`, `${a}/${den * den}`]);
  return { text: `${a}/${den} × ${b}/${den}`, answer: correct, choices };
}
function genPercent() {
  const p = pick([10, 20, 25, 50, 75]), base = pick([20, 40, 60, 80, 100]);
  return { text: `${p}% of ${base} = ?`, answer: Math.round(base * p / 100) };
}

function generateQuestion(module) {
  switch (module.type) {
    case 'add': return genAdd(module.max);
    case 'sub': return genSub(module.max);
    case 'addsub': return genAddSub(module.max);
    case 'mul': return genMul(module);
    case 'div': return genDiv(module);
    case 'mixed': return genMixed(module.max);
    case 'decadd': return genDecAdd();
    case 'decmul': return genDecMul();
    case 'decdiv': return genDecDiv();
    case 'fracadd': return genFracAdd();
    case 'fracmul': return genFracMul();
    case 'percent': return genPercent();
    default: return genAdd(20);
  }
}

window.SYLLABUS = SYLLABUS;
window.GRADE_LABELS = GRADE_LABELS;
window.generateQuestion = generateQuestion;
