// 题型引擎自测：遍历所有年级×模块×难度，校验生成不崩溃且结构合法
const fs = require('fs');
const path = require('path');

const code = fs.readFileSync(path.join(__dirname, '../public/syllabus.js'), 'utf8');
const win = {};
const factory = new Function('window', code + '\nreturn { SYLLABUS, generateQuestion };');
const { SYLLABUS, generateQuestion } = factory(win);

const DIFFS = ['easy', 'medium', 'hard'];
let total = 0, fails = 0;
const failsList = [];

function check(cond, msg) { if (!cond) { fails++; failsList.push(msg); } }

for (const g of Object.keys(SYLLABUS)) {
  for (const m of SYLLABUS[g]) {
    for (const d of DIFFS) {
      for (let i = 0; i < 40; i++) {
        let q;
        try { q = generateQuestion(m, { difficulty: d, grade: Number(g) }); }
        catch (e) { fails++; failsList.push(`[${g}/${m.id}/${d}] 抛异常: ${e.message}`); continue; }
        total++;
        check(q && typeof q.text === 'string' && q.text.length > 0, `[${g}/${m.id}/${d}] text 为空`);
        const isChoice = Array.isArray(q.choices);
        if (isChoice) {
          check(q.choices.length >= 2, `[${g}/${m.id}/${d}] choices 过少`);
          check(q.choices.includes(q.answer), `[${g}/${m.id}/${d}] answer 不在 choices 内: answer=${q.answer}`);
        } else {
          const num = Number(q.answer);
          check(Number.isFinite(num), `[${g}/${m.id}/${d}] answer 非数字: ${q.answer}`);
        }
        check(q.answer !== undefined && q.answer !== null, `[${g}/${m.id}/${d}] answer 缺失`);
        if (!isChoice && String(q.answer).includes('.')) {
          check(q.decimal === true, `[${g}/${m.id}/${d}] 答案含小数点但 decimal 非 true，小键盘无法输入: ${q.answer}`);
        }
      }
    }
  }
}

console.log(`生成题目总数: ${total}`);
console.log(`失败项: ${fails}`);
if (fails) { console.log('--- 失败样例 ---'); failsList.slice(0, 20).forEach(x => console.log(x)); process.exit(1); }
else console.log('✅ 题型引擎自测全部通过');
