// 小学算术练习系统 - 零依赖 Node 服务
// 负责：静态文件服务 + JSON API（孩子 / 礼品 / 积分 / 错题 / 兑换 / 闯关 / 计时）
// 数据存储：data/data.json（单文件，挂载到 NAS 数据卷即可持久化、多设备同源同步）

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync, exec } = require('child_process');

const PORT = process.env.PORT || 3333;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// 一键更新：超级管理员密码（点击更新按钮时要求输入；可用环境变量 SUPER_ADMIN_PASSWORD 覆盖）
const SUPER_ADMIN = process.env.SUPER_ADMIN_PASSWORD || '061204';

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

function load() {
  if (!fs.existsSync(DATA_FILE)) {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const seed = {
      parentPin: '1234',
      children: [],
      rewards: DEFAULT_REWARDS.map((r, i) => ({ id: rid(), ...r, active: true, sort: i })),
      sessions: [],
      attempts: [],
      redemptions: [],
      pointsLedger: [],
      corrections: {}, // childId|questionText -> true（已订正正确）
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2));
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

let DB = load();
function save() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(DB, null, 2));
}

// ---------- 业务：积分 ----------
function computeSession(body) {
  const { childId, moduleId, moduleName, mode, questions, durationSec } = body;
  const child = DB.children.find((c) => c.id === childId);
  if (!child) return { error: 'child not found' };

  let pointsDelta = 0;       // 实际加到 child.points 的值
  const ledger = [];
  const sessionAttempts = [];
  let correctCount = 0;
  const daily = getDaily(child);
  let dailyCapped = false;

  for (const q of questions) {
    const correct = !!q.correct;
    let delta = correct ? 2 : -1; // 基础：对+2 错-1（允许负数）

    // 计时模式速度奖励
    if (mode === 'timed' && correct) {
      let bonus = 0;
      if (q.responseMs <= 3000) bonus = 2;
      else if (q.responseMs <= 6000) bonus = 1;
      if (bonus > 0) delta += bonus;
    }

    // 每日上限：只对正积分做限制
    if (delta > 0) {
      const room = DAILY_CAP - daily.earned;
      if (room <= 0) { delta = 0; dailyCapped = true; }
      else if (delta > room) { delta = room; dailyCapped = true; }
    }
    if (delta > 0) daily.earned += delta;

    const reason = correct ? 'correct' : 'wrong';
    ledger.push({ reason, delta });
    if (correct) correctCount++;
    pointsDelta += delta;

    sessionAttempts.push({
      id: rid(), sessionId: null, childId,
      questionText: q.text, answer: String(q.given === null ? '' : q.given),
      correctAnswer: String(q.answer), choices: q.choices || null, correct, responseMs: q.responseMs || 0,
    });
  }

  // 闯关达标奖励（也受每日上限约束）
  let challengeBonus = 0;
  if (mode === 'challenge') {
    const acc = questions.length ? correctCount / questions.length : 0;
    if (acc >= 0.8) {
      let bonus = 10;
      const room = DAILY_CAP - daily.earned;
      if (room <= 0) { bonus = 0; dailyCapped = true; }
      else if (bonus > room) { bonus = room; dailyCapped = true; }
      if (bonus > 0) { daily.earned += bonus; pointsDelta += bonus; ledger.push({ reason: 'challenge_clear', delta: bonus }); }
      challengeBonus = bonus;
    }
  }

  child.points += pointsDelta;
  const sessionId = rid();
  DB.sessions.push({
    id: sessionId, childId, moduleId, moduleName, mode,
    startedAt: new Date().toISOString(), durationSec: durationSec || 0,
    total: questions.length, correct: correctCount,
  });
  for (const a of sessionAttempts) { a.sessionId = sessionId; DB.attempts.push(a); }
  for (const l of ledger) {
    DB.pointsLedger.push({ id: rid(), childId, delta: l.delta, reason: l.reason, refId: sessionId, createdAt: new Date().toISOString() });
  }
  save();
  return {
    earned: pointsDelta, total: questions.length, correct: correctCount,
    challengeBonus, points: child.points,
    dailyCapReached: dailyCapped, dailyEarned: daily.earned, dailyCap: DAILY_CAP,
  };
}

function doCorrection(body) {
  const { childId, questionText, correct } = body;
  const child = DB.children.find((c) => c.id === childId);
  if (!child) return { error: 'child not found' };
  if (correct) {
    const daily = getDaily(child);
    const room = DAILY_CAP - daily.earned;
    let delta = 0;
    let capped = false;
    if (room > 0) {
      delta = 1; daily.earned += 1;
      if (room <= 1) capped = true;
    } else {
      capped = true;
    }
    child.points += delta;
    DB.pointsLedger.push({ id: rid(), childId, delta, reason: 'correct_correction', refId: questionText, createdAt: new Date().toISOString() });
    DB.corrections[childId + '|' + questionText] = true; // 订正正确后移出错题本
    save();
    return { delta, points: child.points, dailyCapped: capped, dailyEarned: daily.earned, dailyCap: DAILY_CAP };
  }
  return { delta: 0, points: child.points, dailyCapped: false, dailyEarned: getDaily(child).earned, dailyCap: DAILY_CAP };
}

function doRedeem(body) {
  const { childId, rewardId } = body;
  const child = DB.children.find((c) => c.id === childId);
  const reward = DB.rewards.find((r) => r.id === rewardId);
  if (!child || !reward) return { error: 'not found' };
  if (!reward.active) return { error: 'inactive' };
  if (child.points < reward.cost) return { error: 'not enough', points: child.points };
  child.points -= reward.cost;
  DB.redemptions.push({ id: rid(), childId, rewardId, redeemedAt: new Date().toISOString(), fulfilled: false });
  DB.pointsLedger.push({ id: rid(), childId, delta: -reward.cost, reason: 'redeem', refId: rewardId, createdAt: new Date().toISOString() });
  save();
  return { ok: true, points: child.points };
}

function childSummary(childId) {
  const attempts = DB.attempts.filter((a) => a.childId === childId);
  const sessions = DB.sessions.filter((s) => s.childId === childId);
  const totalQ = attempts.length;
  const correctQ = attempts.filter((a) => a.correct).length;
  const accuracy = totalQ ? Math.round((correctQ / totalQ) * 100) : 0;

  const wrongMap = {};
  for (const a of attempts) {
    if (!a.correct) {
      const key = childId + '|' + a.questionText;
      if (!DB.corrections[key]) {
        if (!wrongMap[a.questionText]) wrongMap[a.questionText] = { questionText: a.questionText, count: 0, correctAnswer: a.correctAnswer, choices: a.choices };
        wrongMap[a.questionText].count++;
      }
    }
  }
  const wrongBook = Object.values(wrongMap);
  const recentLedger = DB.pointsLedger.filter((l) => l.childId === childId).slice(-30).reverse();
  recentLedger.forEach((l) => { l.rewardName = null; });
  const child = DB.children.find((c) => c.id === childId);
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

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('forbidden'); }
    fs.readFile(filePath, (err, buf) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
        'Cache-Control': 'no-cache, no-store, must-revalidate', // 一键更新后保证浏览器拉到最新前端
        'Pragma': 'no-cache',
        'Expires': '0',
      });
      res.end(buf);
    });
}

// ---------- API 路由 ----------
async function handleApi(req, res, pathname, segs) {
  const method = req.method;

  if (pathname === '/api/children' && method === 'GET') {
    return send(res, 200, DB.children);
  }
  if (pathname === '/api/children' && method === 'POST') {
    const b = await readBody(req);
    const child = { id: rid(), name: String(b.name || '小朋友').slice(0, 12), avatar: b.avatar || AVATARS[0], grade: b.grade || 1, points: 0, dailyPoints: { date: todayKey(), earned: 0 }, createdAt: new Date().toISOString() };
    DB.children.push(child); save();
    return send(res, 200, child);
  }
  if (pathname.startsWith('/api/child/') && segs[2]) {
    const id = segs[2];
    if (method === 'GET') return send(res, 200, childSummary(id));
    if (method === 'DELETE') {
      DB.children = DB.children.filter((c) => c.id !== id);
      DB.attempts = DB.attempts.filter((a) => a.childId !== id);
      DB.sessions = DB.sessions.filter((s) => s.childId !== id);
      DB.redemptions = DB.redemptions.filter((r) => r.childId !== id);
      DB.pointsLedger = DB.pointsLedger.filter((l) => l.childId !== id);
      save(); return send(res, 200, { ok: true });
    }
    if (method === 'PUT') {
      const b = await readBody(req);
      const c = DB.children.find((x) => x.id === id);
      if (!c) return send(res, 404, { error: 'child not found' });
      if (b.grade !== undefined && b.grade >= 1 && b.grade <= 6) c.grade = b.grade;
      if (b.name !== undefined) c.name = String(b.name).slice(0, 12);
      if (b.avatar !== undefined) c.avatar = b.avatar;
      save(); return send(res, 200, c);
    }
  }

  if (pathname === '/api/rewards' && method === 'GET') return send(res, 200, DB.rewards);
  if (pathname === '/api/rewards' && method === 'POST') {
    const b = await readBody(req);
    const reward = { id: rid(), name: String(b.name || '礼品').slice(0, 20), icon: b.icon || '🎁', cost: Math.max(0, Number(b.cost) || 0), active: b.active !== false, sort: DB.rewards.length };
    DB.rewards.push(reward); save(); return send(res, 200, reward);
  }
  if (segs[1] === 'rewards' && segs[2] && (method === 'PUT' || method === 'DELETE')) {
    const id = segs[2];
    if (method === 'PUT') {
      const b = await readBody(req);
      const r = DB.rewards.find((x) => x.id === id);
      if (!r) return send(res, 404, { error: 'not found' });
      if (b.name !== undefined) r.name = String(b.name).slice(0, 20);
      if (b.icon !== undefined) r.icon = b.icon;
      if (b.cost !== undefined) r.cost = Math.max(0, Number(b.cost) || 0);
      if (b.active !== undefined) r.active = !!b.active;
      if (b.sort !== undefined) r.sort = b.sort;
      save(); return send(res, 200, r);
    }
    DB.rewards = DB.rewards.filter((x) => x.id !== id); save(); return send(res, 200, { ok: true });
  }

  if (pathname === '/api/session' && method === 'POST') {
    const b = await readBody(req);
    return send(res, 200, computeSession(b));
  }
  if (pathname === '/api/correction' && method === 'POST') {
    const b = await readBody(req);
    return send(res, 200, doCorrection(b));
  }
  if (pathname === '/api/redeem' && method === 'POST') {
    const b = await readBody(req);
    return send(res, 200, doRedeem(b));
  }
  if (pathname === '/api/checkpin' && method === 'POST') {
    const b = await readBody(req);
    return send(res, 200, { ok: String(b.pin) === String(DB.parentPin) });
  }
  if (pathname === '/api/pin' && method === 'PUT') {
    const b = await readBody(req);
    if (String(b.oldPin) !== String(DB.parentPin)) return send(res, 200, { ok: false, error: 'old pin wrong' });
    DB.parentPin = String(b.newPin || '').slice(0, 12) || DB.parentPin; save();
    return send(res, 200, { ok: true });
  }
  if (pathname.startsWith('/api/redemptions/') && segs[2]) {
    const id = segs[2];
    if (method === 'PUT') { // 家长标记已兑现
      const r = DB.redemptions.find((x) => x.id === id);
      if (!r) return send(res, 404, { error: 'not found' });
      r.fulfilled = true; save(); return send(res, 200, r);
    }
  }
  if (pathname === '/api/redemptions' && method === 'GET') {
    const list = DB.redemptions.map((r) => {
      const c = DB.children.find((x) => x.id === r.childId) || {};
      const rw = DB.rewards.find((x) => x.id === r.rewardId) || {};
      return { id: r.id, childName: c.name || '?', rewardName: rw.name || '?', icon: rw.icon || '🎁', cost: rw.cost || 0, redeemedAt: r.redeemedAt, fulfilled: r.fulfilled };
    });
    return send(res, 200, list);
  }

  // 版本号（前端轮询用，变化即刷新所有在线页面）
  if (pathname === '/api/version' && method === 'GET') {
    return send(res, 200, { version: APP_VERSION });
  }

  // 一键更新：超级管理员密码校验后拉取最新代码并重启服务
  if (pathname === '/api/admin/update' && method === 'POST') {
    const b = await readBody(req);
    if (String(b.password) !== SUPER_ADMIN) return send(res, 200, { ok: false, error: '超级管理员密码错误' });
    try {
      // 容器内 bind mount 可能触发 Git safe.directory 检查，先放行
      try { execSync('git config --global --add safe.directory /app', { cwd: __dirname }); } catch (e2) { /* 已配置过则忽略 */ }
      // 清理本地未提交改动（data 在卷里不会被 stash 影响），再拉取
      execSync('git stash --include-untracked || true', { cwd: __dirname });
      const out = execSync('git pull --ff-only', { cwd: __dirname }).toString();
      try { APP_VERSION = execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim(); } catch (e) {}
      save();
      // 先返回结果，再由 Docker（restart: unless-stopped）自动重启容器以加载新代码
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, version: APP_VERSION, output: out }));
      setTimeout(() => process.exit(0), 600);
      return;
    } catch (e) {
      return send(res, 200, { ok: false, error: '更新失败：' + String(e.message || e) });
    }
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
