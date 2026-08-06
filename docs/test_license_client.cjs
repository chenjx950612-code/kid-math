// 主系统（server.js）离线卡密授权端到端测试（零依赖、无需任何服务器）
// 用法：node docs/test_license_client.cjs
// 覆盖：无卡密创建拒绝 → 卡密创建成功 → 同卡密换 PIN 再创建拒绝（防重绑定）→ PIN 加入 →
//       本地到期锁 403 → 新卡密续费恢复 → 改 PIN 后加入
const { spawn } = require('child_process');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const APP_PORT = 4594;
const NODE = process.execPath;
const SERVER = path.join(__dirname, '..', 'server.js');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lic-offline-'));
const APP_DATA = path.join(TMP, 'appdata');
fs.mkdirSync(APP_DATA, { recursive: true });
const SECRET = 'kid-math-license-v1-2026'; // 与 server.js 默认 LICENSE_SECRET 一致

let appProc;

// 内联发卡逻辑（与 tools/genkey.cjs 一致）
function genKey(days = 365) {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(Date.now() / 1000) + days * 86400, 0);
  buf.writeUInt32BE(Date.now() % 0xffffffff, 4);
  const b = buf.toString('hex');
  const sig = crypto.createHmac('sha256', SECRET).update(b).digest('hex').slice(0, 32);
  return ('MATH-' + (b + '.' + sig).replace(/(.{4})/g, '$1-').replace(/-$/, '')).toUpperCase();
}

function req(method, pathname, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({ host: 'localhost', port: APP_PORT, path: pathname, method, headers: { 'Content-Type': 'application/json', ...headers } }, (res) => {
      let s = '';
      res.on('data', (c) => (s += c));
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(s) }); } catch { resolve({ status: res.statusCode, body: s }); } });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✅ ' + msg); }
  else { fail++; console.log('  ❌ ' + msg); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitReady() {
  for (let i = 0; i < 40; i++) {
    try { await req('GET', '/api/version'); return; }
    catch (e) { await sleep(250); }
  }
  throw new Error('主系统未就绪');
}
function startApp() {
  appProc = spawn(NODE, [SERVER], { env: { ...process.env, PORT: String(APP_PORT), DATA_DIR: APP_DATA }, stdio: 'ignore' });
}
function killApp() { try { appProc && appProc.kill(); } catch (e) {} }

(async () => {
  const KEY1 = genKey(365);
  const KEY2 = genKey(365);
  startApp();
  await waitReady();
  console.log('== 离线卡密授权端到端 ==');

  // 1. 无卡密创建家庭 → 拒绝
  let r = await req('POST', '/api/auth', { pin: '1111', create: true });
  assert(r.body.ok === false && r.body.licenseRequired === true, '1. 无卡密创建家庭被拒（提示需卡密）');

  // 2. 无效卡密创建 → 拒绝
  r = await req('POST', '/api/auth', { pin: '1111', create: true, key: 'MATH-XXXX-XXXX-XXXX' });
  assert(r.body.ok === false, '2. 无效卡密创建被拒');

  // 3. 有效卡密创建 → 成功
  r = await req('POST', '/api/auth', { pin: '1111', create: true, key: KEY1 });
  assert(r.body.ok === true && r.body.isNew === true, '3. 有效卡密创建家庭成功');
  const FID1 = r.body.familyId;
  const H = { 'X-Family-Id': FID1 };

  // 4. 同一卡密 + 不同 PIN 再创建 → 拒绝（一卡密一家庭）
  r = await req('POST', '/api/auth', { pin: '2222', create: true, key: KEY1 });
  assert(r.body.ok === false && /绑定/.test(r.body.error || ''), '4. 同一卡密换 PIN 再创建被拒（一卡密一家庭）');

  // 5. 同 PIN 加入（多设备）→ 成功
  r = await req('POST', '/api/auth', { pin: '1111', create: false });
  assert(r.body.ok === true && r.body.familyId === FID1 && r.body.isNew === false, '5. 同 PIN 加入成功（多设备共享）');

  // 6. 业务接口可用 + 许可证状态
  r = await req('GET', '/api/children', null, H);
  assert(r.status === 200 && Array.isArray(r.body), '6. 业务接口 /api/children 正常（200）');
  r = await req('GET', '/api/license/state', null, H);
  assert(r.body.valid === true && r.body.daysLeft > 350, '7. 许可证状态 valid，剩余 ' + r.body.daysLeft + ' 天');

  // 8. 本地到期 → 锁定（改 data 文件 exp 为过去 + 重启）
  const dataFile = path.join(APP_DATA, 'data.json');
  const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  const fam = data.families.find((f) => f.id === FID1);
  fam.license.exp = Date.now() - 1000;
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
  killApp();
  await sleep(400);
  startApp();
  await waitReady();
  r = await req('GET', '/api/children', null, H);
  assert(r.status === 403 && r.body.licenseExpired === true, '8. 到期后业务接口 403（licenseExpired）');

  // 9. 续费（新卡密）→ 恢复
  r = await req('POST', '/api/license/renew', { key: KEY2 }, H);
  assert(r.body.ok === true, '9. 新卡密续费成功');
  r = await req('GET', '/api/children', null, H);
  assert(r.status === 200, '10. 续费后业务恢复（200）');

  // 11. 改 PIN：离线方案绑定自动跟随（license 与 PIN 同存家庭对象）
  r = await req('PUT', '/api/pin', { oldPin: '1111', newPin: '5555' }, H);
  assert(r.body.ok === true, '11. 改 PIN 成功');
  r = await req('POST', '/api/auth', { pin: '1111', create: false });
  assert(r.body.ok === false, '12. 旧 PIN 无法再加入');
  r = await req('POST', '/api/auth', { pin: '5555', create: false });
  assert(r.body.ok === true, '13. 新 PIN 正常加入');

  console.log(`\n结果：通过 ${pass}，失败 ${fail}`);
  if (fail) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => { killApp(); fs.rmSync(TMP, { recursive: true, force: true }); });
