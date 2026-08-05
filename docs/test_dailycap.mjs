// 端到端验证每日上限修复：还原「有错题→卡94→订正不加分」场景
const BASE = 'http://localhost:3460';
const fid = await (async () => {
  const r = await fetch(`${BASE}/api/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: '7777', create: true }) });
  const j = await r.json();
  console.log('auth:', JSON.stringify(j));
  return j.familyId;
})();
const H = { 'Content-Type': 'application/json', 'X-Family-Id': fid };

const child = await (await fetch(`${BASE}/api/children`, { method: 'POST', headers: H, body: JSON.stringify({ name: '测试娃', avatar: '🐱', grade: 1 }) })).json();
const C = child.id;
console.log('child:', C, 'points=', child.points);

function buildQ(correct, wrong, mode) {
  const arr = [];
  let n = 1;
  for (let i = 0; i < correct; i++) { arr.push({ text: `${n}+${n}`, answer: String(n + n), given: String(n + n), correct: true, responseMs: 2000, choices: null }); n++; }
  for (let i = 0; i < wrong; i++) { arr.push({ text: `${n}*1`, answer: String(n), given: String(n + 1), correct: false, responseMs: 2000, choices: null }); n++; }
  return arr;
}
async function session(correct, wrong, mode = 'practice') {
  const r = await fetch(`${BASE}/api/session`, { method: 'POST', headers: H, body: JSON.stringify({ childId: C, moduleId: 'm', moduleName: '测试', mode, questions: buildQ(correct, wrong, mode), durationSec: 0 }) });
  return r.json();
}
async function correct() {
  const r = await fetch(`${BASE}/api/correction`, { method: 'POST', headers: H, body: JSON.stringify({ childId: C, questionText: '1+1', correct: true }) });
  return r.json();
}

function assert(cond, msg) { console.log((cond ? '✅' : '❌') + ' ' + msg); if (!cond) process.exitCode = 1; }

// 1) 8对2错：净增应为 +14，dailyEarned 必须等于 points（不能虚高成16）
let s = await session(8, 2);
console.log('S1:', JSON.stringify(s));
assert(s.earned === 14, `8对2错 净增=${s.earned}（应为14）`);
assert(s.dailyEarned === s.points, `dailyEarned(${s.dailyEarned}) == points(${s.points})（旧bug会虚高）`);
assert(s.points === 14, `points=${s.points}（应为14）`);

// 2) 连续练习攒到 94 分（含错题，净增法）
for (let i = 0; i < 5; i++) { s = await session(8, 2); } // +14*5 = 70 → 84
s = await session(5, 5); // +5 → 89
s = await session(5, 5); // +5 → 94
console.log('累积后:', JSON.stringify(s));
assert(s.points === 94, `攒到 points=${s.points}（应为94）`);
assert(s.dailyEarned === 94, `dailyEarned=${s.dailyEarned}（应为94，旧bug会=100）`);

// 3) 关键：此时订正 +1 应当生效（旧bug会判定已满100而给0）
let c = await correct();
console.log('订正:', JSON.stringify(c));
assert(c.delta === 1, `订正 delta=${c.delta}（应为1，旧bug给0）`);
assert(c.points === 95, `订正后 points=${c.points}（应为95）`);
assert(c.dailyEarned === 95, `订正后 dailyEarned=${c.dailyEarned}（应为95）`);

// 4) 继续练习直到真正封顶 100
s = await session(10, 0); // 房间=5 → 实际+5
console.log('封顶前最后一段:', JSON.stringify(s));
assert(s.points === 100, `封顶 points=${s.points}（应为100）`);
assert(s.dailyEarned === 100, `封顶 dailyEarned=${s.dailyEarned}（应为100）`);
assert(s.dailyCapReached === true, `dailyCapReached=${s.dailyCapReached}（应true）`);

// 5) 封顶后再订正不再加分
c = await correct();
console.log('封顶后订正:', JSON.stringify(c));
assert(c.delta === 0, `封顶后订正 delta=${c.delta}（应为0）`);
assert(c.dailyCapped === true, `封顶后 dailyCapped=${c.dailyCapped}（应true）`);

console.log('\n=== 测试结束 ===');
