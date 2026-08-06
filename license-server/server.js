// 卡密服务器 - 零依赖 Node 服务（部署在卖家飞牛，供买家主系统激活/续费/校验）
// 职责：管理卡密（生成/激活绑定/续期/吊销）+ 提供激活接口（activate/verify/renew/update-pin）
// 数据：data/licenses.json
// 环境变量：PORT(默认4444) HOST(默认0.0.0.0) ADMIN_PASSWORD(卖家管理密码,默认061204) DATA_DIR(可选,测试用)

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 4444;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'licenses.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '061204';

// 卡密字符集（去掉易混淆的 0/O 1/I）
const KEY_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function load() {
  if (!fs.existsSync(DATA_FILE)) {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const seed = { licenses: [] };
    fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2));
    return seed;
  }
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  if (!Array.isArray(data.licenses)) data.licenses = [];
  return data;
}

let DB = load();
function save() { fs.writeFileSync(DATA_FILE, JSON.stringify(DB, null, 2)); }

function genKey() {
  let s = '';
  for (let i = 0; i < 12; i++) s += KEY_CHARS[Math.floor(Math.random() * KEY_CHARS.length)];
  return 'MATH-' + s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8, 12);
}

function pinHash(pin, key) {
  return crypto.createHash('sha256').update(String(pin) + '::' + String(key)).digest('hex');
}

function findKey(k) {
  const s = String(k || '').trim().toUpperCase();
  return DB.licenses.find((x) => x.key === s) || null;
}

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { resolve({}); }
    });
  });
}

function maskId(id) {
  if (!id) return '-';
  return id.length > 8 ? id.slice(0, 8) + '…' : id;
}

// 管理端鉴权
function checkAdmin(b) {
  return String(b.password || '') === ADMIN_PASSWORD;
}

async function handleApi(req, res, pathname) {
  const method = req.method;
  const b = await readBody(req);

  // ---------- 管理端 ----------
  if (pathname === '/api/admin/gen' && method === 'POST') {
    if (!checkAdmin(b)) return send(res, 200, { ok: false, error: '密码错误' });
    const days = Math.max(1, parseInt(b.days, 10) || 365);
    const key = genKey();
    DB.licenses.push({
      key, plan: 'year',
      exp: Date.now() + days * 86400000,
      status: 'unused',
      pinHash: null, installationId: null, activatedAt: null,
      createdAt: new Date().toISOString(),
    });
    save();
    return send(res, 200, { ok: true, key, days });
  }
  if (pathname === '/api/admin/list' && method === 'POST') {
    if (!checkAdmin(b)) return send(res, 200, { ok: false, error: '密码错误' });
    const list = DB.licenses.map((x) => ({
      key: x.key,
      status: x.status,
      plan: x.plan,
      exp: x.exp,
      daysLeft: Math.max(0, Math.ceil((x.exp - Date.now()) / 86400000)),
      activatedAt: x.activatedAt,
      installationId: maskId(x.installationId),
      createdAt: x.createdAt,
    })).sort((a, b2) => (a.createdAt < b2.createdAt ? 1 : -1));
    return send(res, 200, { ok: true, list });
  }
  if (pathname === '/api/admin/revoke' && method === 'POST') {
    if (!checkAdmin(b)) return send(res, 200, { ok: false, error: '密码错误' });
    const lic = findKey(b.key);
    if (!lic) return send(res, 200, { ok: false, error: '卡密不存在' });
    lic.status = 'revoked';
    save();
    return send(res, 200, { ok: true });
  }
  if (pathname === '/api/admin/renew' && method === 'POST') {
    if (!checkAdmin(b)) return send(res, 200, { ok: false, error: '密码错误' });
    const lic = findKey(b.key);
    if (!lic) return send(res, 200, { ok: false, error: '卡密不存在' });
    const days = Math.max(1, parseInt(b.days, 10) || 365);
    // 在原到期时间上延长（已过期则从现在起算）
    lic.exp = Math.max(lic.exp, Date.now()) + days * 86400000;
    if (lic.status === 'revoked') lic.status = 'active';
    save();
    return send(res, 200, { ok: true, exp: lic.exp });
  }

  // ---------- 激活接口（买家主系统调用） ----------
  // 激活：key 未绑定则绑定（pin + installationId），已绑定一律拒绝创建
  if (pathname === '/api/license/activate' && method === 'POST') {
    const lic = findKey(b.key);
    if (!lic) return send(res, 200, { ok: false, error: '卡密不存在，请核对后重试' });
    if (lic.status === 'revoked') return send(res, 200, { ok: false, error: '该卡密已被吊销' });
    if (lic.exp <= Date.now()) return send(res, 200, { ok: false, error: '该卡密已过期，请联系卖家' });
    if (lic.status === 'active') return send(res, 200, { ok: false, error: '该卡密已激活使用，请输入对应家庭 PIN 加入' });
    const pin = String(b.pin || '').trim();
    if (!/^\d{4,8}$/.test(pin)) return send(res, 200, { ok: false, error: 'PIN 需为 4-8 位数字' });
    lic.status = 'active';
    lic.pinHash = pinHash(pin, lic.key);
    lic.installationId = String(b.installationId || '').slice(0, 64);
    lic.activatedAt = new Date().toISOString();
    save();
    return send(res, 200, { ok: true, exp: lic.exp });
  }

  // 校验：主系统定期调用；返回是否仍有效
  if (pathname === '/api/license/verify' && method === 'POST') {
    const lic = findKey(b.key);
    if (!lic) return send(res, 200, { valid: false, reason: 'invalid' });
    if (lic.status === 'revoked') return send(res, 200, { valid: false, reason: 'revoked' });
    if (lic.exp <= Date.now()) return send(res, 200, { valid: false, reason: 'expired', exp: lic.exp });
    if (lic.installationId && String(b.installationId) !== lic.installationId) {
      return send(res, 200, { valid: false, reason: 'bound-elsewhere' });
    }
    return send(res, 200, { valid: true, exp: lic.exp });
  }

  // 续费：用新卡密覆盖（绑定到当前实例）
  if (pathname === '/api/license/renew' && method === 'POST') {
    const lic = findKey(b.key);
    if (!lic) return send(res, 200, { ok: false, error: '卡密不存在，请核对后重试' });
    if (lic.status === 'revoked') return send(res, 200, { ok: false, error: '该卡密已被吊销' });
    if (lic.exp <= Date.now()) return send(res, 200, { ok: false, error: '该卡密已过期，无法续费' });
    if (lic.status === 'active') return send(res, 200, { ok: false, error: '该卡密已激活使用，不能重复使用' });
    const pin = String(b.pin || '').trim();
    if (!/^\d{4,8}$/.test(pin)) return send(res, 200, { ok: false, error: 'PIN 需为 4-8 位数字' });
    lic.status = 'active';
    lic.pinHash = pinHash(pin, lic.key);
    lic.installationId = String(b.installationId || '').slice(0, 64);
    lic.activatedAt = new Date().toISOString();
    save();
    return send(res, 200, { ok: true, exp: lic.exp });
  }

  // 改 PIN 同步：仅当卡密绑定到该实例时允许更新绑定 PIN
  if (pathname === '/api/license/update-pin' && method === 'POST') {
    const lic = findKey(b.key);
    if (!lic || lic.status !== 'active') return send(res, 200, { ok: false, error: '卡密未激活' });
    if (lic.installationId && String(b.installationId) !== lic.installationId) {
      return send(res, 200, { ok: false, error: '无权操作' });
    }
    const pin = String(b.pin || '').trim();
    if (!/^\d{4,8}$/.test(pin)) return send(res, 200, { ok: false, error: 'PIN 需为 4-8 位数字' });
    lic.pinHash = pinHash(pin, lic.key);
    save();
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { error: 'api not found' });
}

// 管理端网页
const ADMIN_HTML = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>卡密管理后台</title>
<style>
  body{font-family:system-ui,sans-serif;background:#f5f7fa;margin:0;padding:20px;color:#333}
  h1{font-size:22px;margin:0 0 16px}
  .card{background:#fff;border-radius:14px;box-shadow:0 2px 10px rgba(0,0,0,.06);padding:18px;margin-bottom:16px;max-width:860px}
  .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px}
  input,select,button{font-size:15px;padding:8px 12px;border-radius:8px;border:1px solid #ccc;font-family:inherit}
  button{background:#5b8def;color:#fff;border:none;cursor:pointer;font-weight:600}
  button.sec{background:#e8ecf3;color:#333}
  button.danger{background:#e05b5b}
  button.ok{background:#3aa76d}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{padding:8px 6px;text-align:left;border-bottom:1px solid #eee;white-space:nowrap}
  .tag{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600}
  .tag.unused{background:#e8f5e9;color:#2e7d32}.tag.active{background:#e3f2fd;color:#1565c0}.tag.revoked{background:#ffebee;color:#c62828}
  #msg{color:#c62828;font-size:14px;min-height:20px;margin:8px 0}
  .hidden{display:none}
  .mono{font-family:ui-monospace,monospace;letter-spacing:.5px}
</style></head><body>
<h1>🔑 卡密管理后台</h1>
<div class="card" id="loginCard">
  <div class="row"><label>管理密码</label><input id="pwd" type="password" placeholder="请输入管理密码"><button onclick="unlock()">登录</button></div>
  <div id="msg"></div>
</div>
<div id="main" class="hidden">
  <div class="card">
    <h3 style="margin:0 0 10px">生成卡密</h3>
    <div class="row"><label>有效期（天）</label><input id="days" type="number" value="365" style="width:100px">
    <button onclick="genKey()">生成卡密</button></div>
    <div id="genOut" class="mono" style="background:#f0f4ff;padding:10px 14px;border-radius:8px;display:none"></div>
  </div>
  <div class="card">
    <h3 style="margin:0 0 10px">卡密列表</h3>
    <button class="sec" onclick="refreshList()">刷新列表</button>
    <div style="overflow-x:auto;margin-top:10px" id="listWrap"></div>
  </div>
</div>
<script>
let PWD='';
const $=id=>document.getElementById(id);
function msg(t){$('msg').textContent=t||'';}
async function api(p,b){const r=await fetch(p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({password:PWD},b))});return r.json();}
async function unlock(){PWD=$('pwd').value.trim();const r=await api('/api/admin/list',{});if(r.ok){$('loginCard').classList.add('hidden');$('main').classList.remove('hidden');refreshList();}else msg(r.error||'密码错误');}
async function genKey(){const r=await api('/api/admin/gen',{days:parseInt($('days').value,10)||365});if(r.ok){$('genOut').style.display='block';$('genOut').textContent='新卡密：'+r.key+'（'+r.days+' 天）';refreshList();}else msg(r.error);}
async function revoke(k){if(!confirm('确定吊销 '+k+' ？'))return;const r=await api('/api/admin/revoke',{key:k});if(r.ok){msg('已吊销 '+k);refreshList();}else msg(r.error);}
async function renewK(k){const d=prompt('给 '+k+' 延长多少天？','365');if(!d)return;const r=await api('/api/admin/renew',{key:k,days:parseInt(d,10)});if(r.ok){msg('已延长 '+k);refreshList();}else msg(r.error);}
async function refreshList(){
  const r=await api('/api/admin/list',{});if(!r.ok){msg(r.error);return;}
  const rows=r.list.map(x=>'<tr><td class="mono">'+x.key+'</td><td><span class="tag '+x.status+'">'+(x.status==='unused'?'未使用':x.status==='active'?'已激活':'已吊销')+'</span></td><td>'+(x.daysLeft>=0?x.daysLeft+' 天':'-')+'</td><td>'+new Date(x.exp).toLocaleDateString('zh-CN')+'</td><td>'+x.installationId+'</td><td>'+(x.activatedAt?new Date(x.activatedAt).toLocaleDateString('zh-CN'):'-')+'</td>'+
    '<td><button class="ok" onclick="renewK(\''+x.key+'\')">续期</button> '+(x.status!=='revoked'?'<button class="danger" onclick="revoke(\''+x.key+'\')">吊销</button>':'')+'</td></tr>').join('');
  $('listWrap').innerHTML='<table><tr><th>卡密</th><th>状态</th><th>剩余</th><th>到期</th><th>绑定机器</th><th>激活日期</th><th>操作</th></tr>'+rows+'</table>';
}
$('pwd').addEventListener('keydown',e=>{if(e.key==='Enter')unlock();});
</script></body></html>`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const pathname = url.pathname;
  if (pathname === '/admin' || pathname === '/admin/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(ADMIN_HTML);
  }
  if (pathname.startsWith('/api/')) {
    try { await handleApi(req, res, pathname); }
    catch (e) { send(res, 500, { error: String(e) }); }
    return;
  }
  res.writeHead(404); res.end('not found');
});

server.listen(PORT, HOST, () => {
  console.log(`卡密服务器已启动: http://${HOST}:${PORT}  (管理后台 /admin)`);
});
