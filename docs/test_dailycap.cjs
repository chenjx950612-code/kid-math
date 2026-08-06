// 端到端验证每日上限修复：还原「有错题→卡94→订正不加分」场景（自包含，创建家庭需离线卡密）
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const NODE = process.execPath;
const ROOT = path.join(__dirname, '..');
const APP_PORT = 3460;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dailycap-'));
const SECRET = 'kid-math-license-v1-2026'; // 与 server.js 默认 LICENSE_SECRET 一致
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let appProc;
function boot() {
  appProc = spawn(NODE, [path.join(ROOT, 'server.js')], { env: { ...process.env, PORT: String(APP_PORT), DATA_DIR: path.join(TMP, 'app') }, stdio: 'ignore' });
}
async function waitReady() {
  for (let i = 0; i < 40; i++) {
    try { await fetch(`http://localhost:${APP_PORT}/api/version`); return; }
    catch (e) { await sleep(250); }
  }
  throw new Error('服务未就绪');
}
// 内联发卡（与 tools/genkey.cjs 一致）
function genKey(days = 365) {
  const buf = Buffer.alloc(9);
  buf.writeUInt8(1, 0); // v1
  buf.writeUInt32BE(days, 1);
  buf.writeUInt32BE(Date.now() % 0xffffffff, 5);
  const b = buf.toString('hex');
  const sig = crypto.createHmac('sha256', SECRET).update(b).digest('hex').slice(0, 32);
  return ('MATH-' + (b + '.' + sig).replace(/(.{4})/g, '$1-').replace(/-$/, '')).toUpperCase();
}

const BASE = `http://localhost:${APP_PORT}`;

(async () => {
boot();
await waitReady();
const key = genKey(365);
const fid = await (async () => {
  const r = await fetch(`${BASE}/api/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: '7777', create: true, key }) });
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

// 1) 8对2错：新规则 对+1×8、错0 → 净增 +8，dailyEarned 必须等于 points
let s = await session(8, 2);
console.log('S1:', JSON.stringify(s));
assert(s.earned === 8, `8对2错 净增=${s.earned}（应为8）`);
assert(s.dailyEarned === s.points, `dailyEarned(${s.dailyEarned}) == points(${s.points})（旧bug会虚高）`);
assert(s.points === 8, `points=${s.points}（应为8）`);

// 2) 连续练习攒到 94 分（新规则每题+1，含错题不扣）
for (let i = 0; i < 9; i++) { s = await session(8, 2); } // +8*9 = 72 → 80
s = await session(5, 5); // +5 → 85
s = await session(5, 5); // +5 → 90
s = await session(4, 6); // +4 → 94
console.log('累积后:', JSON.stringify(s));
assert(s.points === 94, `攒到 points=${s.points}（应为94）`);
assert(s.dailyEarned === 94, `dailyEarned=${s.dailyEarned}（应为94，旧bug会=100）`);

// 3) 订正不再加分（新规则），但每日额度不被订正占用
let c = await correct();
console.log('订正:', JSON.stringify(c));
assert(c.delta === 0, `订正 delta=${c.delta}（新规则订正不加分=0）`);
assert(c.points === 94, `订正后 points=${c.points}（应为94）`);

// 4) 继续练习直到真正封顶 100
s = await session(10, 0); // 房间=6 → 实际+6
console.log('封顶前最后一段:', JSON.stringify(s));
assert(s.points === 100, `封顶 points=${s.points}（应为100）`);
assert(s.dailyEarned === 100, `封顶 dailyEarned=${s.dailyEarned}（应为100）`);
assert(s.dailyCapReached === true, `dailyCapReached=${s.dailyCapReached}（应true）`);

// 5) 封顶后再订正：仍不加分
c = await correct();
console.log('封顶后订正:', JSON.stringify(c));
assert(c.delta === 0, `封顶后订正 delta=${c.delta}（应为0）`);

console.log('\n=== 测试结束 ===');
})().finally(() => {
  try { appProc && appProc.kill(); } catch (e) {}
  fs.rmSync(TMP, { recursive: true, force: true });
});
