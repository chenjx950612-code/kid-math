// 小学算术练习系统 - 零依赖 Node 服务
// 负责：静态文件服务 + JSON API（家庭 / 孩子 / 礼品 / 积分 / 错题 / 兑换 / 闯关 / 计时 / 一键更新）
// 数据存储：data/data.json（单文件，挂载到 NAS 数据卷即可持久化、多设备同源同步）
// 多家庭隔离：每个家庭独立 PIN、独立数据；通过 X-Family-Id 请求头识别

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const PORT = process.env.PORT || 3333;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// 一键更新：超级管理员密码（点击更新按钮时要求输入；可用环境变量 SUPER_ADMIN_PASSWORD 覆盖）
const SUPER_ADMIN = process.env.SUPER_ADMIN_PASSWORD || '061204';

// 卡密服务器（卖家提供）：创建家庭/续费/改PIN同步/定期校验时调用；为空则禁用在线激活
const LICENSE_SERVER_URL = (process.env.LICENSE_SERVER_URL || '').trim().replace(/\/+$/, '');
const LICENSE_CHECK_INTERVAL = 6 * 3600 * 1000; // 每 6 小时在线校验一次

// 版本号：取当前 git 提交短哈希；非 git 环境回退为 local
let APP_VERSION = 'local';
try { APP_VERSION = execSync('git rev-parse --short HEAD').toString().trim(); } catch (e) { /* 非 git 仓库时忽略 */ }

const DEFAULT_REWARDS = [
  { name: '小贴纸', icon: '🌟', cost: 10 },
  { name: '糖果一颗', icon: '🍬', cost: 15 },
  { name: '多看一集动画', icon: '📺', cost: 30 },
  { name: '心爱绘本', icon: '📚', cost: 40 },
  { name: '户外玩耍', icon: '⚽', cost: 50 },
  { name: '神秘礼物', icon: '🎁', cost: 100 },
];

const AVATARS = ['🐱', '🐶', '🐰', '🦊', '🐼', '🦁', '🐯', '🐸', '🐵', '🐥'];

// 每日积分上限（防止一天刷太多）
const DAILY_CAP = 100;

// PIN 格式：4-8 位数字
const PIN_RE = /^\d{4,8}$/;

// 获取本地日期字符串 YYYY-MM-DD（用于每日重置）
function todayKey() {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

// 获取/初始化孩子的每日积分记录
function getDaily(child) {
  const t = todayKey();
  if (!child.dailyPoints || child.dailyPoints.date !== t) {
    child.dailyPoints = { date: t, earned: 0 };
  }
  return child.dailyPoints;
}

function rid() { return crypto.randomUUID(); }

function newFamily(parentPin) {
  return {
    id: rid(),
    parentPin,
    children: [],
    rewards: DEFAULT_REWARDS.map((r, i) => ({ id: rid(), ...r, active: true, sort: i })),
    sessions: [],
    attempts: [],
    redemptions: [],
    pointsLedger: [],
    corrections: {},
    createdAt: new Date().toISOString(),
  };
}

function load() {
  if (!fs.existsSync(DATA_FILE)) {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const seed = { families: [] };
    fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2));
    return seed;
  }
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  // 老版本数据迁移：把顶层 parentPin/children/rewards 等打包进一个默认家庭
  if (!Array.isArray(data.families) && (data.children || data.parentPin)) {
    const f = newFamily(data.parentPin || '1234');
    f.children = data.children || [];
    f.rewards = data.rewards && data.rewards.length ? data.rewards : f.rewards;
    f.sessions = data.sessions || [];
    f.attempts = data.attempts || [];
    f.redemptions = data.redemptions || [];
    f.pointsLedger = data.pointsLedger || [];
    f.corrections = data.corrections || {};
    data.families = [f];
    delete data.parentPin; delete data.children; delete data.rewards;
    delete data.sessions; delete data.attempts; delete data.redemptions;
    delete data.pointsLedger; delete data.corrections;
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  }
  if (!Array.isArray(data.families)) data.families = [];

  // 修复旧版本 bug：daily.earned 曾按「每题对的 +2」累加，错题 -1 只扣 child.points
  // 不扣 daily.earned，导致有错题时 daily.earned 已到 100 而孩子实际不到 100，被错误封顶。
  // 修复：今天未兑换过、且 daily.earned 超过孩子当前积分时，回退到孩子当前真实积分。
  const tk = todayKey();
  for (const f of data.families) {
    if (!Array.isArray(f.children)) continue;
    for (const c of f.children) {
      if (c.dailyPoints && c.dailyPoints.date === tk && typeof c.dailyPoints.earned === 'number') {
        const redeemedToday = (f.redemptions || []).some((r) => (r.redeemedAt || '').slice(0, 10) === tk);
        if (!redeemedToday && c.dailyPoints.earned > (c.points || 0)) {
          c.dailyPoints.earned = c.points || 0;
        }
      }
    }
  }

  // 卡密授权迁移：实例指纹（installationId）+ 旧家庭补默认 license（自家已有数据不被卡）
  let migrated = false;
  if (!data.installationId) { data.installationId = crypto.randomUUID(); migrated = true; }
  for (const f of data.families) {
    if (!f.license) {
      f.license = { key: 'legacy', exp: new Date('2099-12-31T23:59:59Z').getTime(), valid: true, lastCheckedAt: null };
      migrated = true;
    }
  }
  if (migrated) fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

  return data;
}

let DB = load();
function save() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(DB, null, 2));
}

// 从请求头获取当前家庭；缺失或无效返回 null
function getFamily(req) {
  const fid = (req.headers['x-family-id'] || '').toString();
  if (!fid) return null;
  return DB.families.find((f) => f.id === fid) || null;
}

// ---------- 卡密授权（license） ----------
function licenseValid(f) {
  return !!f.license && f.license.valid !== false && f.license.exp > Date.now();
}
function licenseDaysLeft(f) {
  return f.license ? Math.max(0, Math.ceil((f.license.exp - Date.now()) / 86400000)) : 0;
}

// 调用中心卡密服务器（离线/失败返回 {offline:true}）
function callLicense(apiPath, body) {
  return new Promise((resolve) => {
    if (!LICENSE_SERVER_URL) return resolve({ offline: true, error: 'LICENSE_SERVER_URL 未配置' });
    let url;
    try { url = new URL(apiPath, LICENSE_SERVER_URL + '/'); } catch (e) { return resolve({ offline: true, error: 'LICENSE_SERVER_URL 无效' }); }
    const mod = url.protocol === 'https:' ? require('https') : require('http');
    const payload = JSON.stringify(body || {});
    const req = mod.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 8000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({ offline: true, error: 'bad response' }); } });
    });
    req.on('timeout', () => { req.destroy(); resolve({ offline: true, error: 'timeout' }); });
    req.on('error', () => { req.destroy(); resolve({ offline: true, error: 'network' }); });
    req.end(payload);
  });
}

// 定期在线校验所有家庭（吊销/后台延期生效；网络失败时用本地 exp 兜底，宽容模式）
async function verifyLicenses() {
  if (!LICENSE_SERVER_URL) return;
  for (const f of DB.families) {
    if (!f.license || f.license.key === 'legacy') continue;
    const r = await callLicense('/api/license/verify', { key: f.license.key, installationId: DB.installationId });
    if (r && r.valid === false) {
      if (f.license.valid !== false || (r.exp && f.license.exp !== r.exp)) {
        f.license.valid = false;
        if (r.exp) f.license.exp = r.exp;
        f.license.lastCheckedAt = new Date().toISOString();
        save();
      }
    } else if (r && r.valid === true) {
      if (f.license.valid !== true || f.license.exp !== r.exp) {
        f.license.valid = true;
        f.license.exp = r.exp;
        f.license.lastCheckedAt = new Date().toISOString();
        save();
      }
    }
    // offline/网络失败：保持本地状态继续可用
  }
}

// ---------- 业务：积分（家庭作用域） ----------
// 积分规则（2026-08-05 更新）：
//   练习/闯关：每答对一题 +1，答错不扣分（0）
//   计时：≤3 秒答对 +2，>3 秒答对 +1，答错不扣分（0）
//   闯关：正确率 ≥80% 通关 +10；正确率 100% 额外 +5（即共 +15）
//   订正：不再加分（始终 0）
// 所有正积分均计入「每日上限 100 分」
function computeSession(family, body) {
  const { childId, moduleId, moduleName, mode, questions, durationSec } = body;
  const child = family.children.find((c) => c.id === childId);
  if (!child) return { error: 'child not found' };

  const daily = getDaily(child);
  let pointsDelta = 0; // 本次「原始」净增减（按新规则）
  const ledger = [];
  const sessionAttempts = [];
  let correctCount = 0;

  for (const q of questions) {
    const correct = !!q.correct;
    let delta = 0;
    if (correct) {
      if (mode === 'timed') {
        // 计时：≤3 秒 +2，>3 秒 +1
        delta = q.responseMs <= 3000 ? 2 : 1;
      } else {
        // 练习 / 闯关：每对一题 +1
        delta = 1;
      }
      correctCount++;
    } else {
      delta = 0; // 答错不扣分
    }
    ledger.push({ reason: correct ? 'correct' : 'wrong', delta });
    pointsDelta += delta;

    sessionAttempts.push({
      id: rid(), sessionId: null, childId,
      questionText: q.text, answer: String(q.given === null ? '' : q.given),
      correctAnswer: String(q.answer), choices: q.choices || null, correct, responseMs: q.responseMs || 0,
    });
  }

  let challengeBonus = 0;
  if (mode === 'challenge') {
    const acc = questions.length ? correctCount / questions.length : 0;
    if (acc >= 0.8) {
      challengeBonus = 10; // 通关奖励
      pointsDelta += 10;
      ledger.push({ reason: 'challenge_clear', delta: 10 });
      if (correctCount === questions.length && questions.length > 0) {
        challengeBonus += 5; // 100% 正确额外 +5
        pointsDelta += 5;
        ledger.push({ reason: 'challenge_full', delta: 5 });
      }
    }
  }

  // 每日上限：按「实际净增积分」封顶（均为正分，错题 0 不占额度）
  const room = DAILY_CAP - daily.earned;
  let granted = pointsDelta;
  let dailyCapped = false;
  if (granted > 0 && granted > room) { granted = room; dailyCapped = true; }
  if (granted > 0) daily.earned += granted; // 只累计真正加到孩子积分上的正分
  child.points += granted;

  const sessionId = rid();
  family.sessions.push({
    id: sessionId, childId, moduleId, moduleName, mode,
    startedAt: new Date().toISOString(), durationSec: durationSec || 0,
    total: questions.length, correct: correctCount,
  });
  for (const a of sessionAttempts) { a.sessionId = sessionId; family.attempts.push(a); }
  for (const l of ledger) {
    family.pointsLedger.push({ id: rid(), childId, delta: l.delta, reason: l.reason, refId: sessionId, createdAt: new Date().toISOString() });
  }
  save();
  return {
    earned: granted, total: questions.length, correct: correctCount,
    challengeBonus, points: child.points,
    dailyCapReached: dailyCapped, dailyEarned: daily.earned, dailyCap: DAILY_CAP,
  };
}

function doCorrection(family, body) {
  const { childId, questionText, correct } = body;
  const child = family.children.find((c) => c.id === childId);
  if (!child) return { error: 'child not found' };
  // 订正不再加分（无论对错），订正正确仍移出错题本
  if (correct) {
    family.corrections[childId + '|' + questionText] = true;
  }
  save();
  return { delta: 0, points: child.points, dailyCapped: false, dailyEarned: getDaily(child).earned, dailyCap: DAILY_CAP };
}

function doRedeem(family, body) {
  const { childId, rewardId } = body;
  const child = family.children.find((c) => c.id === childId);
  const reward = family.rewards.find((r) => r.id === rewardId);
  if (!child || !reward) return { error: 'not found' };
  if (!reward.active) return { error: 'inactive' };
  if (child.points < reward.cost) return { error: 'not enough', points: child.points };
  child.points -= reward.cost;
  family.redemptions.push({ id: rid(), childId, rewardId, redeemedAt: new Date().toISOString(), fulfilled: false });
  family.pointsLedger.push({ id: rid(), childId, delta: -reward.cost, reason: 'redeem', refId: rewardId, createdAt: new Date().toISOString() });
  save();
  return { ok: true, points: child.points };
}

function childSummary(family, childId) {
  const attempts = family.attempts.filter((a) => a.childId === childId);
  const sessions = family.sessions.filter((s) => s.childId === childId);
  const totalQ = attempts.length;
  const correctQ = attempts.filter((a) => a.correct).length;
  const accuracy = totalQ ? Math.round((correctQ / totalQ) * 100) : 0;

  const wrongMap = {};
  for (const a of attempts) {
    if (!a.correct) {
      const key = childId + '|' + a.questionText;
      if (!family.corrections[key]) {
        if (!wrongMap[a.questionText]) wrongMap[a.questionText] = { questionText: a.questionText, count: 0, correctAnswer: a.correctAnswer, choices: a.choices };
        wrongMap[a.questionText].count++;
      }
    }
  }
  const wrongBook = Object.values(wrongMap);
  const recentLedger = family.pointsLedger.filter((l) => l.childId === childId).slice(-30).reverse();
  recentLedger.forEach((l) => { l.rewardName = null; });
  const child = family.children.find((c) => c.id === childId);
  return { child, totalQ, correctQ, accuracy, wrongBook, recentLedger, points: child ? child.points : 0, sessionCount: sessions.length };
}

// ---------- HTTP 辅助 ----------
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

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('forbidden'); }
    fs.readFile(filePath, (err, buf) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      });
      res.end(buf);
    });
}

// ---------- API 路由 ----------
async function handleApi(req, res, pathname, segs) {
  const method = req.method;

  // 公开端点：家庭认证
  if (pathname === '/api/auth/state' && method === 'GET') {
    return send(res, 200, { hasFamilies: DB.families.length > 0, familyCount: DB.families.length });
  }
  if (pathname === '/api/auth' && method === 'POST') {
    const b = await readBody(req);
    const pin = String(b.pin || '').trim();
    if (!PIN_RE.test(pin)) return send(res, 200, { ok: false, error: 'PIN 需为 4-8 位数字' });
    let f = DB.families.find((x) => x.parentPin === pin);
    let isNew = false;
    if (!f) {
      if (b.create === false) return send(res, 200, { ok: false, error: 'PIN 不存在' });
      // 创建家庭：一卡密一家庭，需在线激活并绑定（installationId + PIN）
      const key = String(b.key || '').trim().toUpperCase();
      if (!key) return send(res, 200, { ok: false, error: '创建家庭需要激活卡密', licenseRequired: true });
      if (!LICENSE_SERVER_URL) return send(res, 200, { ok: false, error: '系统未配置卡密服务器，无法创建新家庭，请联系卖家' });
      const r = await callLicense('/api/license/activate', { key, pin, installationId: DB.installationId });
      if (r.offline) return send(res, 200, { ok: false, error: '无法连接卡密服务器，请检查网络后重试' });
      if (!r.ok) return send(res, 200, { ok: false, error: r.error || '卡密激活失败' });
      f = newFamily(pin);
      f.license = { key, exp: r.exp, valid: true, lastCheckedAt: new Date().toISOString() };
      DB.families.push(f);
      save();
      isNew = true;
    } else {
      // 加入已有家庭：只需 PIN；校验该家庭 license 有效
      if (!licenseValid(f)) return send(res, 200, { ok: false, error: '该家庭许可证已过期或失效，请联系卖家续费', licenseExpired: true });
    }
    return send(res, 200, { ok: true, familyId: f.id, isNew });
  }

  // 其余端点都需要 X-Family-Id
  const family = getFamily(req);
  if (!family) return send(res, 401, { error: 'no family' });

  // 许可证状态（不受过期拦截，前端展示/续费用）
  if (pathname === '/api/license/state' && method === 'GET') {
    const keyTail = family.license && family.license.key !== 'legacy' ? family.license.key.slice(-4) : (family.license ? 'legacy' : '');
    return send(res, 200, {
      valid: licenseValid(family),
      exp: family.license ? family.license.exp : 0,
      daysLeft: licenseDaysLeft(family),
      keyTail,
      installationId: DB.installationId,
      licenseServer: !!LICENSE_SERVER_URL,
    });
  }
  // 续费：换新卡密，覆盖绑定（不受过期拦截）
  if (pathname === '/api/license/renew' && method === 'POST') {
    const b = await readBody(req);
    const key = String(b.key || '').trim().toUpperCase();
    if (!key) return send(res, 200, { ok: false, error: '请输入新卡密' });
    if (!LICENSE_SERVER_URL) return send(res, 200, { ok: false, error: '系统未配置卡密服务器，请联系卖家' });
    const r = await callLicense('/api/license/renew', { key, pin: String(family.parentPin), installationId: DB.installationId });
    if (r.offline) return send(res, 200, { ok: false, error: '无法连接卡密服务器，请检查网络后重试' });
    if (!r.ok) return send(res, 200, { ok: false, error: r.error || '续费失败' });
    family.license = { key, exp: r.exp, valid: true, lastCheckedAt: new Date().toISOString() };
    save();
    return send(res, 200, { ok: true, exp: r.exp, daysLeft: Math.max(0, Math.ceil((r.exp - Date.now()) / 86400000)) });
  }

  // 版本号（前端轮询用，不受 license 拦截）
  if (pathname === '/api/version' && method === 'GET') {
    return send(res, 200, { version: APP_VERSION });
  }

  // 一键更新（管理员操作，不受 license 拦截）
  if (pathname === '/api/admin/update' && method === 'POST') {
    const b = await readBody(req);
    if (String(b.password) !== SUPER_ADMIN) return send(res, 200, { ok: false, error: '超级管理员密码错误' });
    try {
      try { execSync('git config --global --add safe.directory /app', { cwd: '/root' }); } catch (e2) { /* 已配置过则忽略 */ }
      execSync('git stash --include-untracked || true', { cwd: __dirname });
      const out = execSync('git pull --ff-only', { cwd: __dirname }).toString();
      try { APP_VERSION = execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim(); } catch (e) {}
      save();
      const noChange = /Already up to date\./.test(out);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, version: APP_VERSION, output: out, noChange }));
      if (!noChange) setTimeout(() => process.exit(0), 600);
      return;
    } catch (e) {
      return send(res, 200, { ok: false, error: '更新失败：' + String(e.message || e) });
    }
  }

  // 许可证过期/失效拦截（业务接口一律 403）
  if (!licenseValid(family)) {
    return send(res, 403, { error: 'license expired', licenseExpired: true });
  }

  if (pathname === '/api/children' && method === 'GET') {
    return send(res, 200, family.children);
  }
  if (pathname === '/api/children' && method === 'POST') {
    const b = await readBody(req);
    const child = { id: rid(), name: String(b.name || '小朋友').slice(0, 12), avatar: b.avatar || AVATARS[0], grade: b.grade || 1, points: 0, dailyPoints: { date: todayKey(), earned: 0 }, createdAt: new Date().toISOString() };
    family.children.push(child); save();
    return send(res, 200, child);
  }
  if (pathname.startsWith('/api/child/') && segs[2]) {
    const id = segs[2];
    if (method === 'GET') return send(res, 200, childSummary(family, id));
    if (method === 'DELETE') {
      family.children = family.children.filter((c) => c.id !== id);
      family.attempts = family.attempts.filter((a) => a.childId !== id);
      family.sessions = family.sessions.filter((s) => s.childId !== id);
      family.redemptions = family.redemptions.filter((r) => r.childId !== id);
      family.pointsLedger = family.pointsLedger.filter((l) => l.childId !== id);
      save(); return send(res, 200, { ok: true });
    }
    if (method === 'PUT') {
      const b = await readBody(req);
      const c = family.children.find((x) => x.id === id);
      if (!c) return send(res, 404, { error: 'child not found' });
      if (b.grade !== undefined && b.grade >= 1 && b.grade <= 6) c.grade = b.grade;
      if (b.name !== undefined) c.name = String(b.name).slice(0, 12);
      if (b.avatar !== undefined) c.avatar = b.avatar;
      save(); return send(res, 200, c);
    }
  }

  if (pathname === '/api/rewards' && method === 'GET') return send(res, 200, family.rewards);
  if (pathname === '/api/rewards' && method === 'POST') {
    const b = await readBody(req);
    const reward = { id: rid(), name: String(b.name || '礼品').slice(0, 20), icon: b.icon || '🎁', cost: Math.max(0, Number(b.cost) || 0), active: b.active !== false, sort: family.rewards.length };
    family.rewards.push(reward); save(); return send(res, 200, reward);
  }
  if (segs[1] === 'rewards' && segs[2] && (method === 'PUT' || method === 'DELETE')) {
    const id = segs[2];
    if (method === 'PUT') {
      const b = await readBody(req);
      const r = family.rewards.find((x) => x.id === id);
      if (!r) return send(res, 404, { error: 'not found' });
      if (b.name !== undefined) r.name = String(b.name).slice(0, 20);
      if (b.icon !== undefined) r.icon = b.icon;
      if (b.cost !== undefined) r.cost = Math.max(0, Number(b.cost) || 0);
      if (b.active !== undefined) r.active = !!b.active;
      if (b.sort !== undefined) r.sort = b.sort;
      save(); return send(res, 200, r);
    }
    family.rewards = family.rewards.filter((x) => x.id !== id); save(); return send(res, 200, { ok: true });
  }

  if (pathname === '/api/session' && method === 'POST') {
    const b = await readBody(req);
    return send(res, 200, computeSession(family, b));
  }
  if (pathname === '/api/correction' && method === 'POST') {
    const b = await readBody(req);
    return send(res, 200, doCorrection(family, b));
  }
  if (pathname === '/api/redeem' && method === 'POST') {
    const b = await readBody(req);
    return send(res, 200, doRedeem(family, b));
  }
  if (pathname === '/api/checkpin' && method === 'POST') {
    const b = await readBody(req);
    return send(res, 200, { ok: String(b.pin) === String(family.parentPin) });
  }
  if (pathname === '/api/pin' && method === 'PUT') {
    const b = await readBody(req);
    if (String(b.oldPin) !== String(family.parentPin)) return send(res, 200, { ok: false, error: 'old pin wrong' });
    const newPin = String(b.newPin || '').trim();
    if (!PIN_RE.test(newPin)) return send(res, 200, { ok: false, error: '新 PIN 需为 4-8 位数字' });
    if (DB.families.find((f) => f.parentPin === newPin && f.id !== family.id)) {
      return send(res, 200, { ok: false, error: '新 PIN 已被其他家庭使用' });
    }
    family.parentPin = newPin; save();
    // 同步卡密绑定（尽力而为：失败不阻断本地修改，下次联网校验自动补）
    let synced = true;
    if (family.license && family.license.key !== 'legacy' && LICENSE_SERVER_URL) {
      const r = await callLicense('/api/license/update-pin', { key: family.license.key, installationId: DB.installationId, pin: newPin });
      synced = !r.offline && r.ok !== false;
    }
    return send(res, 200, { ok: true, synced });
  }
  if (pathname.startsWith('/api/redemptions/') && segs[2]) {
    const id = segs[2];
    if (method === 'PUT') {
      const r = family.redemptions.find((x) => x.id === id);
      if (!r) return send(res, 404, { error: 'not found' });
      r.fulfilled = true; save(); return send(res, 200, r);
    }
  }
  if (pathname === '/api/redemptions' && method === 'GET') {
    const list = family.redemptions.map((r) => {
      const c = family.children.find((x) => x.id === r.childId) || {};
      const rw = family.rewards.find((x) => x.id === r.rewardId) || {};
      return { id: r.id, childName: c.name || '?', rewardName: rw.name || '?', icon: rw.icon || '🎁', cost: rw.cost || 0, redeemedAt: r.redeemedAt, fulfilled: r.fulfilled };
    });
    return send(res, 200, list);
  }

  return send(res, 404, { error: 'api not found' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  if (pathname.startsWith('/api/')) {
    const segs = pathname.split('/').filter(Boolean);
    try { await handleApi(req, res, pathname, segs); }
    catch (e) { send(res, 500, { error: String(e) }); }
  } else {
    serveStatic(req, res, pathname);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`小学算术练习系统已启动: http://${HOST}:${PORT}`);
});

// 卡密授权：启动 3 秒后异步在线校验一次（不阻塞启动），之后每 6 小时校验
setTimeout(verifyLicenses, 3000);
setInterval(verifyLicenses, LICENSE_CHECK_INTERVAL);