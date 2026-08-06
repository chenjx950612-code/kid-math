// 卡密服务器（license-server）端到端单测
// 用法：node docs/test_license_server.cjs
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const LIC_PORT = 4591;
const ADMIN_PWD = 'testpwd123';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lic-test-'));

function req(method, pathname, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({ host: 'localhost', port: LIC_PORT, path: pathname, method, headers: { 'Content-Type': 'application/json' } }, (res) => {
      let s = '';
      res.on('data', (c) => (s += c));
      res.on('end', () => { try { resolve(JSON.parse(s)); } catch { resolve(s); } });
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

async function waitReady() {
  for (let i = 0; i < 40; i++) {
    try { await req('POST', '/api/admin/list', { password: 'x' }); return; }
    catch (e) { await new Promise((r) => setTimeout(r, 250)); }
  }
  throw new Error('license-server 未就绪');
}

(async () => {
  const proc = spawn(process.execPath, [path.join(__dirname, '..', 'license-server', 'server.js')], {
    env: { ...process.env, PORT: String(LIC_PORT), DATA_DIR: TMP, ADMIN_PASSWORD: ADMIN_PWD },
    stdio: 'ignore',
  });
  try {
    await waitReady();
    console.log('== license-server 单测 ==');

    // 管理端鉴权
    let r = await req('POST', '/api/admin/gen', { password: 'wrong', days: 365 });
    assert(r.ok === false, '错误管理密码生成卡密被拒');
    r = await req('POST', '/api/admin/gen', { password: ADMIN_PWD, days: 365 });
    assert(r.ok === true && /^MATH-/.test(r.key), '生成卡密 key=' + (r.key || '').slice(0, 12) + '…');
    const KEY1 = r.key;

    // 激活
    r = await req('POST', '/api/license/activate', { key: KEY1, pin: '', installationId: 'INST-A' });
    assert(r.ok === false, '空 PIN 激活被拒');
    r = await req('POST', '/api/license/activate', { key: KEY1, pin: '1234', installationId: 'INST-A' });
    assert(r.ok === true && r.exp > Date.now(), '正确卡密激活成功（exp=' + r.exp + '）');
    const EXP1 = r.exp;

    // 重复激活（任何 PIN / 任何机器）都拒绝
    r = await req('POST', '/api/license/activate', { key: KEY1, pin: '1234', installationId: 'INST-B' });
    assert(r.ok === false && /已激活/.test(r.error || ''), '同一卡密在别的机器激活被拒');
    r = await req('POST', '/api/license/activate', { key: KEY1, pin: '5678', installationId: 'INST-A' });
    assert(r.ok === false, '同一卡密改 PIN 再激活也被拒');

    // 校验
    r = await req('POST', '/api/license/verify', { key: KEY1, installationId: 'INST-A' });
    assert(r.valid === true, '绑定机器校验 valid');
    r = await req('POST', '/api/license/verify', { key: KEY1, installationId: 'INST-B' });
    assert(r.valid === false, '非绑定机器校验 invalid（bound-elsewhere）');
    r = await req('POST', '/api/license/verify', { key: 'MATH-XXXX-XXXX-XXXX', installationId: 'INST-A' });
    assert(r.valid === false, '不存在的卡密 invalid');

    // 改 PIN 绑定同步
    r = await req('POST', '/api/license/update-pin', { key: KEY1, installationId: 'INST-A', pin: '9999' });
    assert(r.ok === true, '改 PIN 绑定同步成功');
    r = await req('POST', '/api/license/update-pin', { key: KEY1, installationId: 'INST-B', pin: '0000' });
    assert(r.ok === false, '非绑定机器改 PIN 被拒');

    // 续费（新卡密）
    r = await req('POST', '/api/admin/gen', { password: ADMIN_PWD, days: 30 });
    const KEY2 = r.key;
    r = await req('POST', '/api/license/renew', { key: KEY2, pin: '1234', installationId: 'INST-A' });
    assert(r.ok === true && r.exp > Date.now(), '新卡密续费成功（exp 更新）');
    r = await req('POST', '/api/license/renew', { key: KEY1, pin: '1234', installationId: 'INST-A' });
    assert(r.ok === false, '已绑定卡密不能重复续费');

    // 吊销
    r = await req('POST', '/api/admin/revoke', { password: ADMIN_PWD, key: KEY2 });
    assert(r.ok === true, '吊销卡密成功');
    r = await req('POST', '/api/license/verify', { key: KEY2, installationId: 'INST-A' });
    assert(r.valid === false && r.reason === 'revoked', '吊销后校验 invalid（revoked）');

    // 管理端给原卡密延期
    r = await req('POST', '/api/admin/renew', { password: ADMIN_PWD, key: KEY1, days: 365 });
    assert(r.ok === true && r.exp > EXP1, '后台给原卡密延期成功');

    // 管理页
    const page = await new Promise((resolve, reject) => {
      http.get({ host: 'localhost', port: LIC_PORT, path: '/admin' }, (res) => {
        let s = ''; res.on('data', (c) => (s += c)); res.on('end', () => resolve(s));
      }).on('error', reject);
    });
    assert(typeof page === 'string' && page.includes('卡密管理后台'), '/admin 管理页可访问');

    // 列表
    r = await req('POST', '/api/admin/list', { password: ADMIN_PWD });
    assert(r.ok === true && Array.isArray(r.list) && r.list.length === 2, '卡密列表返回 2 条');

    console.log(`\n结果：通过 ${pass}，失败 ${fail}`);
    if (fail) process.exitCode = 1;
  } finally {
    proc.kill();
    fs.rmSync(TMP, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
