// 端到端验证新积分规则（自包含：自动起主系统，创建家庭需离线卡密）
const http = require('http');
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const NODE = process.execPath;
const ROOT = path.join(__dirname, '..');
const APP_PORT = 3470;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'scoring-'));
const SECRET = 'kid-math-license-v1-2026'; // 与 server.js 默认 LICENSE_SECRET 一致
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let appProc;
function boot() {
  appProc = spawn(NODE, [path.join(ROOT, 'server.js')], { env: { ...process.env, PORT: String(APP_PORT), DATA_DIR: path.join(TMP, 'app') }, stdio: 'ignore' });
}
async function waitReady() {
  for (let i = 0; i < 40; i++) {
    try { await req('GET', '/api/version'); return; }
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

function req(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({
      host: 'localhost', port: APP_PORT, path, method,
      headers: { 'Content-Type': 'application/json', ...headers },
    }, (res) => {
      let s = '';
      res.on('data', (c) => (s += c));
      res.on('end', () => { try { resolve(JSON.parse(s)); } catch { resolve(s); } });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function assert(cond, msg) {
  console.log((cond ? '✅' : '❌') + ' ' + msg);
  if (!cond) process.exitCode = 1;
}

(async () => {
  boot();
  await waitReady();
  // 生成一张离线卡密用于创建家庭
  const key = genKey(365);
  // 加入家庭（create，需卡密）
  const auth = await req('POST', '/api/auth', { pin: '1234', create: true, key });
  const FID = auth.familyId;
  const H = { 'X-Family-Id': FID };

  // 添加孩子
  const child = await req('POST', '/api/children', { name: '测测', avatar: '🐱', grade: 2 }, H);
  const CID = child.id;

  // 1. 练习模式：8对2错 → 应 +8（每对+1，错不扣）
  const r1 = await req('POST', '/api/session', {
    childId: CID, moduleId: 'add', moduleName: '加法', mode: 'practice',
    questions: [
      ...Array(8).fill(0).map((_, i) => ({ text: `${i}+1`, answer: String(i + 1), given: String(i + 1), correct: true })),
      ...Array(2).fill(0).map((_, i) => ({ text: `${i}+9`, answer: String(i + 9), given: '0', correct: false })),
    ],
  }, H);
  assert(r1.earned === 8, `练习 8对2错 应得 +8，实际 ${r1.earned}`);
  assert(r1.points === 8, `孩子总分应为 8，实际 ${r1.points}`);
  assert(r1.dailyEarned === 8, `今日累计应为 8，实际 ${r1.dailyEarned}`);

  // 2. 计时模式：≤3秒对+2，>3秒对+1
  const r2 = await req('POST', '/api/session', {
    childId: CID, moduleId: 'add', moduleName: '加法', mode: 'timed',
    questions: [
      { text: '1+1', answer: '2', given: '2', correct: true, responseMs: 2000 },
      { text: '2+2', answer: '4', given: '4', correct: true, responseMs: 5000 },
      { text: '3+3', answer: '6', given: '0', correct: false },
    ],
  }, H);
  // 期望 +2 +1 +0 = 3
  assert(r2.earned === 3, `计时 2对1错(2s,5s) 应得 +3，实际 ${r2.earned}`);
  assert(r2.points === 11, `孩子总分应为 11，实际 ${r2.points}`);

  // 3. 闯关：100% 正确 → 每题+1 (×5) + 全对+5 = 10
  const r3 = await req('POST', '/api/session', {
    childId: CID, moduleId: 'add', moduleName: '加法', mode: 'challenge',
    questions: Array(5).fill(0).map((_, i) => ({ text: `${i}+1`, answer: String(i + 1), given: String(i + 1), correct: true })),
  }, H);
  assert(r3.challengeBonus === 5, `闯关全对 每题+1×5 + 全对+5=10，实际 bonus ${r3.challengeBonus}`);
  assert(r3.earned === 10, `闯关全对 每题+1×5 + 5 = 10，实际 ${r3.earned}`);
  assert(r3.points === 21, `孩子总分应为 21，实际 ${r3.points}`);

  // 4. 闯关：80% 正确（4/5）→ 通过，仅按答对题数 ×4 = 4，无额外奖励
  const r4 = await req('POST', '/api/session', {
    childId: CID, moduleId: 'add', moduleName: '加法', mode: 'challenge',
    questions: [
      ...Array(4).fill(0).map((_, i) => ({ text: `${i}+1`, answer: String(i + 1), given: String(i + 1), correct: true })),
      { text: '9+9', answer: '18', given: '0', correct: false },
    ],
  }, H);
  assert(r4.challengeBonus === 0, `闯关 80% 无额外奖励，实际 ${r4.challengeBonus}`);
  assert(r4.earned === 4, `闯关 80% 仅每题+1×4 = 4，实际 ${r4.earned}`);

  // 5. 订正：不再加分
  const corr = await req('POST', '/api/correction', { childId: CID, questionText: '9+9', correct: true }, H);
  assert(corr.delta === 0, `订正正确 应得 0 分，实际 ${corr.delta}`);

  // 6. 闯关未达标（<80%）：不通过，本次积分 +0（答对也不加分）
  const r6 = await req('POST', '/api/session', {
    childId: CID, moduleId: 'add', moduleName: '加法', mode: 'challenge',
    questions: [
      ...Array(3).fill(0).map((_, i) => ({ text: `${i}+1`, answer: String(i + 1), given: String(i + 1), correct: true })),
      ...Array(2).fill(0).map((_, i) => ({ text: `${i}+9`, answer: String(i + 9), given: '0', correct: false })),
    ],
  }, H);
  assert(r6.challengeBonus === 0, `闯关 60% 无额外奖励，实际 ${r6.challengeBonus}`);
  assert(r6.earned === 0, `闯关 60% 不通过，本次 0 分，实际 ${r6.earned}`);

  console.log('\n测试完成。');
})().finally(() => {
  try { appProc && appProc.kill(); } catch (e) {}
  fs.rmSync(TMP, { recursive: true, force: true });
});
