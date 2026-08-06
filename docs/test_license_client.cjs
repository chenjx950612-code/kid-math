// 主系统（server.js）卡密授权端到端测试
// 用法：node docs/test_license_client.cjs
// 覆盖：无卡密创建失败 → 卡密创建成功 → 同卡密再创建拒绝 → PIN 加入成功 →
//       本地到期锁 403 → 在线校验恢复 → 吊销锁定 → 新卡密续费恢复 → 改 PIN 同步
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const LIC_PORT = 4593; // 卡密服务器
const APP_PORT = 4594; // 主系统
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lic-client-'));
const APP_DATA = path.join(TMP, 'appdata');
fs.mkdirSync(APP_DATA, { recursive: true });

const NODE = process.execPath;
const SERVER = path.join(__dirname, '..', 'server.js');
const LIC_SERVER = path.join(__dirname, '..', 'license-server', 'server.js');

let licProc, appProc;

function req(port, method, pathname, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({ host: 'localhost', port, path: pathname, method, headers: { 'Content-Type': 'application/json', ...headers } }, (res) => {
      let s = '';
      res.on('data', (c) => (s += c));
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(s) }); } catch { resolve({ status: res.statusCode, body: s }); } });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}
function licReq(method, pathname, body) { return req(LIC_PORT, method, pathname, body); }
function appReq(method, pathname, body, headers = {}) { return req(APP_PORT, method, pathname, body, headers); }

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✅ ' + msg); }
  else { fail++; console.log('  ❌ ' + msg); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitHttp(port, pathname) {
  for (let i = 0; i < 40; i++) {
    try { await req(port, 'GET', pathname); return; }
    catch (e) { await sleep(250); }
  }
  throw new Error('服务未就绪 port=' + port);
}

function startLic() {
  licProc = spawn(NODE, [LIC_SERVER], { env: { ...process.env, PORT: String(LIC_PORT), DATA_DIR: path.join(TMP, 'licdata'), ADMIN_PASSWORD: 'admin123' }, stdio: 'ignore' });
}
function startApp() {
  appProc = spawn(NODE, [SERVER], { env: { ...process.env, PORT: String(APP_PORT), DATA_DIR: APP_DATA, LICENSE_SERVER_URL: 'http://127.0.0.1:' + LIC_PORT }, stdio: 'ignore' });
}
function kill(p) { try { p.kill(); } catch (e) {} }

(async () => {
  startLic();
  await waitHttp(LIC_PORT, '/api/admin/list');
  const gen = await licReq('POST', '/api/admin/list', { password: 'admin123' });
  const mk = async () => (await licReq('POST', '/api/admin/gen', { password: 'admin123', days: 365 })).body.key;
  const KEY1 = await mk();
  const KEY2 = await mk();
  console.log('卡密服务器就绪：KEY1=' + KEY1 + '  KEY2=' + KEY2);

  startApp();
  await waitHttp(APP_PORT, '/api/version');
  console.log('== 主系统卡密授权端到端 ==');

  // 1. 无卡密创建家庭 → 拒绝
  let r = await appReq('POST', '/api/auth', { pin: '1111', create: true });
  assert(r.body.ok === false && r.body.licenseRequired === true, '1. 无卡密创建家庭被拒（提示需卡密）');

  // 2. 无效卡密创建 → 拒绝
  r = await appReq('POST', '/api/auth', { pin: '1111', create: true, key: 'MATH-XXXX-XXXX-XXXX' });
  assert(r.body.ok === false, '2. 无效卡密创建被拒');

  // 3. 有效卡密创建 → 成功
  r = await appReq('POST', '/api/auth', { pin: '1111', create: true, key: KEY1 });
  assert(r.body.ok === true && r.body.isNew === true, '3. 有效卡密创建家庭成功');
  const FID1 = r.body.familyId;
  const H = { 'X-Family-Id': FID1 };

  // 4. 同一卡密 + 不同 PIN 再创建 → 拒绝（核心防共享）
  r = await appReq('POST', '/api/auth', { pin: '2222', create: true, key: KEY1 });
  assert(r.body.ok === false && /已激活/.test(r.body.error || ''), '4. 同一卡密换 PIN 再创建被拒（防共享）');

  // 5. 同 PIN 加入（多设备）→ 成功
  r = await appReq('POST', '/api/auth', { pin: '1111', create: false });
  assert(r.body.ok === true && r.body.familyId === FID1 && r.body.isNew === false, '5. 同 PIN 加入成功（多设备共享）');

  // 6. 业务接口可用
  r = await appReq('GET', '/api/children', null, H);
  assert(r.status === 200 && Array.isArray(r.body), '6. 业务接口 /api/children 正常（200）');
  r = await appReq('GET', '/api/license/state', null, H);
  assert(r.body.valid === true && r.body.daysLeft > 350, '7. 许可证状态 valid，剩余 ' + r.body.daysLeft + ' 天');

  // 8. 本地到期 → 锁定（改 data 文件 exp 为过去 + 重启主系统）
  const dataFile = path.join(APP_DATA, 'data.json');
  const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  const fam = data.families.find((f) => f.id === FID1);
  fam.license.exp = Date.now() - 1000;
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
  kill(appProc);
  await sleep(400);
  startApp();
  await waitHttp(APP_PORT, '/api/version');
  r = await appReq('GET', '/api/children', null, H);
  assert(r.status === 403 && r.body.licenseExpired === true, '8. 本地到期后业务接口 403（licenseExpired）');

  // 9. 在线校验（启动 3s 后）会恢复：中心卡密仍有效 → valid 恢复
  await sleep(5000);
  r = await appReq('GET', '/api/children', null, H);
  assert(r.status === 200, '9. 在线校验恢复有效（宽容 + 自愈）');

  // 10. 吊销 → 锁定
  await licReq('POST', '/api/admin/revoke', { password: 'admin123', key: KEY1 });
  kill(appProc);
  await sleep(400);
  startApp();
  await waitHttp(APP_PORT, '/api/version');
  await sleep(5000); // 等启动校验
  r = await appReq('GET', '/api/children', null, H);
  assert(r.status === 403 && r.body.licenseExpired === true, '10. 吊销后在线校验锁定（403）');

  // 11. 续费（新卡密）→ 恢复
  r = await appReq('POST', '/api/license/renew', { key: KEY2 }, H);
  assert(r.body.ok === true, '11. 新卡密续费成功');
  r = await appReq('GET', '/api/children', null, H);
  assert(r.status === 200, '12. 续费后业务恢复（200）');

  // 13. 改 PIN → 同步卡密绑定
  r = await appReq('PUT', '/api/pin', { oldPin: '1111', newPin: '5555' }, H);
  assert(r.body.ok === true && r.body.synced === true, '13. 改 PIN 成功且绑定同步（synced=true）');
  r = await appReq('POST', '/api/auth', { pin: '1111', create: false });
  assert(r.body.ok === false, '14. 旧 PIN 无法再加入');
  r = await appReq('POST', '/api/auth', { pin: '5555', create: false });
  assert(r.body.ok === true, '15. 新 PIN 正常加入');

  // 16. 断网容错：停掉卡密服务器，业务仍可用（本地 exp 兜底）
  kill(licProc);
  await sleep(300);
  r = await appReq('GET', '/api/children', null, H);
  assert(r.status === 200, '16. 卡密服务器离线时已激活家庭仍可用（宽容模式）');

  console.log(`\n结果：通过 ${pass}，失败 ${fail}`);
  if (fail) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => {
    kill(appProc); kill(licProc);
    fs.rmSync(TMP, { recursive: true, force: true });
  });
