// 前端单页应用：路由 / 状态 / 接口调用 / 渲染
(function () {
  const $app = document.getElementById('app');
  const $overlay = document.getElementById('overlay');

  const S = {
    screen: 'home', child: null, grade: null, module: null, mode: null, difficulty: 'hard',
    questions: [], idx: 0, results: [], cur: null, startTime: 0, timer: null, timedLeft: 0,
    locked: false, input: '', inCorrection: false, correctionEntry: null, correctionGiven: '',
    parentTab: 'children', pinOk: false, _children: [], _rewards: [], _wrongBook: [], _newAvatar: '🐱', _editReward: null,
  };

  let CHILDREN = [];
  let REWARDS = [];

  // ---------- 基础 ----------
  // 当前家庭 ID（保存在 localStorage；多设备同家庭共享）
  function getFamilyId() { return localStorage.getItem('math_family_id') || ''; }
  function setFamilyId(id) {
    if (id) localStorage.setItem('math_family_id', id);
    else localStorage.removeItem('math_family_id');
  }
  async function api(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const fid = getFamilyId();
    if (fid) headers['X-Family-Id'] = fid;
    const r = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 401) {
      // 家庭失效（被删/数据迁移/换设备），清除并回到家庭登录页
      setFamilyId('');
      if (typeof renderFamilyAuth === 'function') renderFamilyAuth();
      throw new Error('家庭身份失效，请重新加入家庭');
    }
    if (r.status === 403) {
      const d = await r.json().catch(() => ({}));
      if (d.licenseExpired && typeof renderRenew === 'function') {
        renderRenew();
        throw new Error('许可证已过期，请续费');
      }
      throw new Error(d.error || '权限不足');
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }
  function toast(m) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = m;
    document.body.appendChild(t); setTimeout(() => t.remove(), 1800);
  }
  function confetti(n = 24) {
    const colors = ['#ff9aa2', '#ffd86b', '#7ed957', '#5ec6f2', '#b388ff'];
    for (let i = 0; i < n; i++) {
      const c = document.createElement('div'); c.className = 'confetti';
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = (1.6 + Math.random() * 1.4) + 's';
      document.body.appendChild(c); setTimeout(() => c.remove(), 3200);
    }
  }
  function showFeedback(correct) {
    $overlay.innerHTML = `<div class="feedback">${correct ? '✅' : '❌'}</div>`;
    setTimeout(() => { $overlay.innerHTML = ''; }, 720);
  }

  function moduleEmoji(t) {
    return ({ add: '➕', sub: '➖', addsub: '🔁', mul: '✖️', div: '➗', mixed: '🧮', decadd: '💧', decmul: '💧', decdiv: '💧', decMix: '💧', fracadd: '🍕', fracmul: '🍕', fracMix: '🍕', percent: '％', word: '📖', compare: '⚖️', fill: '✍️', measure: '📏', shape: '🔷', pattern: '🔢', stats: '📊', judge: '❓' })[t] || '📘';
  }
  function moduleSub(m) {
    if (m.type === 'add' || m.type === 'sub') return `1~${m.max} 以内`;
    if (m.type === 'addsub') return `${m.max} 以内混合`;
    if (m.type === 'mul') return `乘法表（×${m.bMax}）`;
    if (m.type === 'div') return `表内除法`;
    if (m.type === 'mixed') return `先乘除后加减`;
    if (m.type.startsWith('dec')) return `小数运算`;
    if (m.type.startsWith('frac')) return `分数`;
    if (m.type === 'percent') return `百分数`;
    if (m.type === 'word') return `生活情境题`;
    if (m.type === 'compare') return `比大小`;
    if (m.type === 'fill') return `求未知数`;
    if (m.type === 'measure') return `单位换算`;
    if (m.type === 'shape') return `图形周长`;
    if (m.type === 'pattern') return `找规律`;
    if (m.type === 'stats') return `统计图表`;
    if (m.type === 'judge') return `判断对错`;
    return '';
  }
  function badgeFor(mode) {
    return ({ practice: '😊 练习', timed: '⏱️ 计时', challenge: '🏆 闯关' })[mode] || '';
  }

  // ---------- 首页（孩子入口） ----------
  function renderHome() {
    S.screen = 'home'; S.child = null;
    const cards = CHILDREN.map(c => `
      <div class="card child-card" onclick="selectChild('${c.id}')">
        <div class="avatar">${c.avatar}</div>
        <div class="name">${c.name}</div>
        <div class="meta">${GRADE_LABELS[c.grade] || ''} · ⭐${c.points}</div>
      </div>`).join('');
    $app.innerHTML = `
      <h1 class="title">算术小乐园</h1>
      <p class="subtitle">选一个小朋友开始吧！</p>
      <div class="grid grid-3">${cards || '<div class="empty-state"><span class="big-ico">👶</span>还没有小朋友<br>点下面“添加小朋友”创建一个吧～</div>'}</div>
      <div class="spacer"></div>
      <button class="btn btn-block" onclick="openAddChild()">➕ 添加小朋友</button>
      <button class="btn btn-ghost btn-block" onclick="switchToParent()">👤 切换到家长</button>`;
  }

  // ---------- 角色选择（首次进入 / 手动切换） ----------
  function renderRoleSelect() {
    S.screen = 'role';
    $app.innerHTML = `
      <div class="role-select">
        <h1 class="title">算术小乐园</h1>
        <p class="subtitle">请选择入口</p>
        <div class="role-cards">
          <div class="card role-card" onclick="enterAsChild()">
            <div class="role-icon">👦👧</div>
            <div class="role-name">我是小朋友</div>
            <div class="role-desc">做题、赚积分、换礼物</div>
          </div>
          <div class="card role-card" onclick="enterAsParent()">
            <div class="role-icon">👨‍👩‍👧</div>
            <div class="role-name">我是家长</div>
            <div class="role-desc">管理孩子、看统计、发礼品</div>
          </div>
        </div>
      </div>`;
  }
  function enterAsChild() {
    localStorage.setItem('math_role', 'child');
    // 只有一个孩子直接进菜单，多个孩子才显示选择
    if (CHILDREN.length === 1) {
      S.child = CHILDREN[0];
      renderChildMenu();
    } else {
      renderHome();
    }
  }
  function enterAsParent() {
    localStorage.setItem('math_role', 'parent');
    openParent();
  }
  function switchToParent() {
    localStorage.setItem('math_role', 'parent');
    // 从孩子界面切家长，必须验证 PIN（不走记住登录的快捷通道）
    S.forcePin = true;
    openParent();
  }
  function switchToChild() {
    localStorage.setItem('math_role', 'child');
    renderHome();
  }

  function renderChildMenu() {
    S.screen = 'menu'; S.inCorrection = false;
    const c = S.child;
    $app.innerHTML = `
      <div class="child-topbar">
        <div class="child-topbar-wrap">
          <button class="switch-btn" onclick="switchToParent()">👤 切换家长</button>
          <div class="name-center">${c.avatar} ${c.name}</div>
          <div class="points-pill">⭐ ${c.points}</div>
        </div>
      </div>
      <div class="grid">
        <button class="btn btn-primary btn-block" onclick="gotoGrade()">📚 开始练习</button>
        <button class="btn btn-blue btn-block" onclick="gotoWrong()">📕 错题本</button>
        <button class="btn btn-coral btn-block" onclick="gotoStore()">🎁 礼品店</button>
      </div>`;
  }

  function gotoGrade() {
    S.screen = 'grade'; S.inCorrection = false;
    const myG = S.child.grade || 1;
    $app.innerHTML = `
      <div class="topbar"><button class="btn btn-ghost" onclick="renderChildMenu()">←</button><div class="who">${S.child.avatar} ${S.child.name}</div><div></div></div>
      <h1 class="title">选年级</h1>
      <p class="subtitle">只做这个年级的题，不超纲～</p>
      <div class="grid grid-3">
        ${[1, 2, 3, 4, 5, 6].map(g => `
          <div class="card grade-card ${g === myG ? 'grade-sel' : ''}" onclick="selectGrade(${g})">
            <div class="g-num">${g}</div>
            <div class="g-name">${GRADE_LABELS[g]}</div>
            ${g === myG ? '<div class="my-grade-tag">我的年级</div>' : ''}
          </div>`).join('')}
      </div>`;
  }

  function selectGrade(g) {
    S.grade = g; S.screen = 'module';
    renderModules(g);
  }
  function renderModules(g) {
    const mods = SYLLABUS[g];
    $app.innerHTML = `
      <div class="topbar"><button class="btn btn-ghost" onclick="gotoGrade()">←</button><div class="who">${GRADE_LABELS[g]}</div><div></div></div>
      <h1 class="title">选题型</h1>
      <div class="list">
        ${mods.map(m => `
          <div class="card module-card" onclick="selectModule('${m.id}')">
            <div class="emoji">${moduleEmoji(m.type)}</div>
            <div><div class="m-name">${m.name}</div><div class="m-sub">${moduleSub(m)}</div></div>
          </div>`).join('')}
      </div>`;
  }
  function selectModule(id) {
    S.module = SYLLABUS[S.grade].find(m => m.id === id); S.screen = 'mode';
    $app.innerHTML = `
      <div class="topbar"><button class="btn btn-ghost" onclick="selectGrade(${S.grade})">←</button><div class="who">${S.module.name}</div><div></div></div>
      <h1 class="title">选玩法</h1>
      <div class="grid">
        <div class="card module-card" onclick="selectMode('practice')"><div class="emoji">😊</div><div><div class="m-name">练习模式</div><div class="m-sub">对+1 错不扣</div></div></div>
        <div class="card module-card" onclick="selectMode('timed')"><div class="emoji">⏱️</div><div><div class="m-name">计时模式</div><div class="m-sub">对+1~2 越快越多</div></div></div>
        <div class="card module-card" onclick="selectMode('challenge')"><div class="emoji">🏆</div><div><div class="m-name">闯关模式</div><div class="m-sub">达标按答对给分，全对 +5</div></div></div>
      </div>`;
  }

  function selectMode(m) {
    S.mode = m; S.screen = 'practice';
    startPractice();
  }

  // ---------- 练习 ----------
  function startPractice() {
    const n = 10;
    S.questions = []; S.idx = 0; S.results = [];
    for (let i = 0; i < n; i++) S.questions.push(generateQuestion(S.module, { difficulty: S.difficulty, grade: S.grade }));
    renderQuestion();
  }

  function renderDots(d) {
    let rows = '';
    for (let i = 0; i < d.a; i++) {
      let r = '<div class="row">';
      for (let j = 0; j < d.b; j++) r += '<div class="d"></div>';
      rows += r + '</div>';
    }
    return `<div class="dots">${rows}</div>`;
  }
  function keypadHtml(decimal) {
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
    let html = '<div class="keypad">';
    for (const k of keys) html += `<div class="key" onclick="keyTap('${k}')">${k}</div>`;
    html += decimal ? `<div class="key" onclick="keyTap('.')">.</div>` : `<div class="key" style="visibility:hidden">.</div>`;
    html += `<div class="key" onclick="keyTap('0')">0</div>`;
    html += `<div class="key del" onclick="keyTap('del')">⌫</div>`;
    html += `</div><button class="btn btn-primary btn-block" onclick="keyTap('ok')" style="max-width:360px;margin:14px auto 0">确定 ✓</button>`;
    return html;
  }
  function choicesHtml(choices) {
    return `<div class="choices">${choices.map(c => `<div class="choice" onclick="choiceTap('${c}')">${c}</div>`).join('')}</div>`;
  }

  function renderQuestion() {
    S.locked = false; S.input = ''; S.inCorrection = false;
    const q = S.questions[S.idx]; S.cur = q; S.startTime = Date.now();
    const timed = S.mode === 'timed';
    const inputArea = q.choices ? choicesHtml(q.choices) : keypadHtml(!!q.decimal);
    $app.innerHTML = `
      <div class="practice">
        <div class="qhead">
          <span class="badge">${badgeFor(S.mode)}</span>
          <span>${S.idx + 1} / ${S.questions.length}</span>
          <span class="badge" style="background:var(--yellow);color:#7a5b00">⭐ ${S.child.points}</span>
        </div>
        ${timed ? `<div class="timerbar"><i id="timerbar"></i></div>` : ''}
        <div class="qtext ${q.text.length > 16 ? 'long' : ''}">${q.text}${q.choices || q.noEq ? '' : ' = ?'}</div>
        <div class="qhint">${q.hint || (q.choices ? '点一个答案' : '用小键盘写出答案')}</div>
        ${q.dots ? renderDots(q.dots) : ''}
        ${q.choices ? '' : `<div class="answer-box" id="ansbox"></div>`}
        ${inputArea}
      </div>`;
    if (timed) startTimer();
  }

  function startTimer() {
    const TOTAL = 15; S.timedLeft = TOTAL;
    const bar = document.getElementById('timerbar');
    if (bar) bar.style.width = '100%';
    S.timer = setInterval(() => {
      S.timedLeft--;
      if (bar) bar.style.width = (S.timedLeft / TOTAL * 100) + '%';
      if (S.timedLeft <= 0) {
        clearInterval(S.timer); S.timer = null;
        if (!S.locked) submitAnswer(null);
      }
    }, 1000);
  }

  function keyTap(v) {
    if (S.inCorrection) {
      if (v === 'del') S.correctionGiven = S.correctionGiven.slice(0, -1);
      else if (v === 'ok') submitCorrection(S.correctionGiven);
      else if (v === '.') { if (!S.correctionGiven.includes('.')) S.correctionGiven += '.'; }
      else S.correctionGiven += v;
      updateAns();
    } else {
      if (S.locked) return;
      if (v === 'del') S.input = S.input.slice(0, -1);
      else if (v === 'ok') submitAnswer(S.input);
      else if (v === '.') { if (!S.input.includes('.')) S.input += '.'; }
      else S.input += v;
      updateAns();
    }
  }
  function updateAns() {
    const b = document.getElementById('ansbox');
    if (b) b.textContent = S.inCorrection ? S.correctionGiven : S.input;
  }
  function choiceTap(val) {
    if (S.inCorrection) submitCorrection(val);
    else submitAnswer(val);
  }

  function submitAnswer(givenStr) {
    if (S.locked) return;
    S.locked = true;
    const q = S.cur;
    let correct;
    if (q.choices) correct = String(givenStr) === String(q.answer);
    else {
      const g = (givenStr === null || givenStr === '') ? null : Number(givenStr);
      correct = g !== null && Math.abs(g - Number(q.answer)) < 1e-6;
    }
    const responseMs = Date.now() - S.startTime;
    if (S.timer) { clearInterval(S.timer); S.timer = null; }
    S.results.push({ text: q.text, answer: q.answer, choices: q.choices || null, given: (givenStr === null ? null : givenStr), correct, responseMs });
    showFeedback(correct);
    if (!correct) { const p = document.querySelector('.practice'); if (p) p.classList.add('shake'); }
    setTimeout(nextQuestion, 820);
  }

  function nextQuestion() {
    S.idx++;
    if (S.idx >= S.questions.length) finishPractice();
    else renderQuestion();
  }

  async function finishPractice() {
    try {
      const res = await api('POST', '/api/session', {
        childId: S.child.id, moduleId: S.module.id, moduleName: S.module.name,
        mode: S.mode, questions: S.results, durationSec: 0,
      });
      if (res.error) { toast(res.error); renderChildMenu(); return; }
      S.child.points = res.points ?? S.child.points;
      renderResult(res);
    } catch(e) {
      console.error('finishPractice error:', e);
      toast('提交结果失败，请重试');
      renderChildMenu();
    }
  }

  function renderResult(res) {
    const total = res.total ?? 0;
    const correct = res.correct ?? 0;
    const earned = res.earned ?? 0;
    const points = res.points ?? (S.child ? S.child.points : 0);
    const acc = total ? Math.round(correct / total * 100) : 0;
    let great;
    if (S.mode === 'challenge' && acc < 80) great = '😢 没通关，本次 0 分';
    else if (S.mode === 'challenge' && res.challengeBonus) great = `🌟 全对！+${res.challengeBonus}`;
    else if (S.mode === 'challenge') great = '🏆 通关啦！';
    else if (acc === 100) great = '🌟 全对！';
    else if (acc >= 80) great = '👍 很棒！';
    else great = '💪 继续加油！';
    $app.innerHTML = `
      <div class="practice">
        <div class="qhead"><span></span><span class="badge">${badgeFor(S.mode)}</span><span></span></div>
        <div class="qtext">${great}</div>
        <div class="card" style="max-width:360px;margin:14px auto">
          <div class="stat"><span>答对</span><span>${correct} / ${total}</span></div>
          <div class="stat"><span>正确率</span><span>${acc}%</span></div>
          <div class="stat"><span>本次获得</span><span>⭐ ${earned > 0 ? '+' + earned : earned}</span></div>
          <div class="stat"><span>今日累计</span><span>⭐ ${(res.dailyEarned ?? 0)} / ${(res.dailyCap ?? 100)}</span></div>
          <div class="stat"><span>我的积分</span><span>⭐ ${points}</span></div>
        </div>
        ${res.dailyCapReached ? `<div class="card" style="max-width:360px;margin:14px auto;background:linear-gradient(135deg,#fff3e0,#ffe0b2);border:2px dashed #ff9800"><p style="text-align:center;color:#e65100;font-weight:bold;margin:0;padding:10px 0">⚠️ 今日积分已封顶（100分），明天再来吧～</p></div>` : ''}
        <button class="btn btn-primary btn-block" style="max-width:360px;margin:12px auto" onclick="selectMode('${S.mode}')">再练一次</button>
        <button class="btn btn-blue btn-block" style="max-width:360px;margin:8px auto" onclick="selectModule('${S.module.id}')">换一关</button>
        <button class="btn btn-coral btn-block" style="max-width:360px;margin:8px auto" onclick="gotoStore()">去礼品店</button>
        <button class="btn btn-ghost btn-block" style="max-width:360px;margin:8px auto" onclick="renderChildMenu()">返回</button>
      </div>`;
    if (res.earned > 0) confetti(30);
  }

  // ---------- 错题本 ----------
  async function gotoWrong() {
    S.inCorrection = false;
    const sum = await api('GET', '/api/child/' + S.child.id);
    const wb = sum.wrongBook || [];
    S._wrongBook = wb;
    $app.innerHTML = `
      <div class="topbar"><button class="btn btn-ghost" onclick="renderChildMenu()">←</button><div class="who">${S.child.avatar} ${S.child.name}</div><div class="points-pill">⭐ ${sum.points}</div></div>
      <h1 class="title">错题本</h1>
      <p class="subtitle">订正后会移出错题本</p>
      <div class="list">
        ${wb.length ? wb.map((e, i) => `<div class="row-item"><div><div class="q">${e.questionText} = ?</div><div class="tag">答错 ${e.count} 次</div></div><button class="btn btn-yellow" onclick="startCorrection(${i})">订正</button></div>`).join('') : '<p class="center muted">太棒了，暂时没有错题！🎉</p>'}
      </div>`;
  }
  function startCorrection(i) {
    S.inCorrection = true; S.correctionEntry = S._wrongBook[i]; S.correctionGiven = '';
    const e = S.correctionEntry;
    const inputArea = e.choices ? choicesHtml(e.choices) : keypadHtml(String(e.correctAnswer).includes('.'));
    $app.innerHTML = `
      <div class="practice">
        <div class="qhead"><button class="btn btn-ghost" onclick="gotoWrong()">←</button><div class="who">订正</div><div></div></div>
        <div class="qtext">${e.questionText}${e.choices ? '' : ' = ?'}</div>
        <div class="qhint">${e.choices ? '点一个答案' : '写出正确答案'}</div>
        ${e.choices ? '' : `<div class="answer-box" id="ansbox"></div>`}
        ${inputArea}
      </div>`;
  }
  function submitCorrection(givenStr) {
    const e = S.correctionEntry;
    let correct;
    if (e.choices) correct = String(givenStr) === String(e.correctAnswer);
    else {
      const g = (givenStr === null || givenStr === '') ? null : Number(givenStr);
      correct = g !== null && Math.abs(g - Number(e.correctAnswer)) < 1e-6;
    }
    if (correct) {
      api('POST', '/api/correction', { childId: S.child.id, questionText: e.questionText, correct: true }).then(r => {
        S.child.points = r.points;
        if (r.dailyCapped) toast('⚠️ 今日积分已封顶（100分），明天再来吧～');
        else toast('订正正确 +1 ⭐');
        gotoWrong();
      });
    } else {
      toast('再想想哦~'); S.correctionGiven = ''; updateAns();
    }
  }

  // ---------- 礼品店 ----------
  async function gotoStore() {
    const c = S.child;
    const rewards = REWARDS.filter(r => r.active).sort((a, b) => a.cost - b.cost);
    $app.innerHTML = `
      <div class="topbar"><button class="btn btn-ghost" onclick="renderChildMenu()">←</button><div class="who">${c.avatar} ${c.name}</div><div class="points-pill">⭐ ${c.points}</div></div>
      <h1 class="title">礼品店</h1>
      <p class="subtitle">用积分换喜欢的礼物吧！</p>
      <div class="grid grid-3">
        ${rewards.length ? rewards.map(r => `
          <div class="reward">
            <div class="ico">${r.icon}</div>
            <div class="rn">${r.name}</div>
            <div class="cost">⭐ ${r.cost}</div>
            <button class="btn ${c.points >= r.cost ? 'btn-primary' : 'btn-ghost'}" ${c.points >= r.cost ? '' : 'disabled'} onclick="redeem('${r.id}')">${c.points >= r.cost ? '兑换' : '积分不够'}</button>
          </div>`).join('') : '<div class="empty-state"><span class="big-ico">🎁</span>还没有礼品<br>让家长去“家长面板”里添加吧～</div>'}
      </div>`;
  }
  async function redeem(id) {
    const r = await api('POST', '/api/redeem', { childId: S.child.id, rewardId: id });
    if (r.error === 'not enough') { toast('积分不够啦~'); return; }
    if (r.ok) { S.child.points = r.points; confetti(30); toast('兑换成功！去找家长领奖吧 🎉'); gotoStore(); }
  }

  // ---------- 添加孩子 ----------
  function openAddChild() {
    const AV = ['🐱', '🐶', '🐰', '🦊', '🐼', '🦁', '🐯', '🐸', '🐵', '🐥'];
    S._newAvatar = AV[0];
    const mask = document.createElement('div'); mask.className = 'modal-mask'; mask.id = 'addmask';
    mask.innerHTML = `<div class="modal"><h3>添加小朋友</h3>
      <div class="field"><label>名字</label><input id="cname" maxlength="12" placeholder="例如：小明"/></div>
      <div class="field"><label>头像</label><div class="avatar-pick" id="avpick">${AV.map(a => `<span class="${a === AV[0] ? 'sel' : ''}" onclick="pickAvatar('${a}')">${a}</span>`).join('')}</div></div>
      <div class="field"><label>年级</label><select id="cgrade">${[1, 2, 3, 4, 5, 6].map(g => `<option value="${g}">${GRADE_LABELS[g]}</option>`).join('')}</select></div>
      <button class="btn btn-primary btn-block" onclick="saveChild()">保存</button>
      <button class="btn btn-ghost btn-block" onclick="closeAdd()">取消</button></div>`;
    document.body.appendChild(mask);
  }
  function pickAvatar(a) {
    S._newAvatar = a;
    document.querySelectorAll('#avpick span').forEach(s => s.classList.toggle('sel', s.textContent === a));
  }
  async function saveChild() {
    const name = document.getElementById('cname').value.trim();
    if (!name) { toast('请输入名字'); return; }
    const grade = Number(document.getElementById('cgrade').value);
    await api('POST', '/api/children', { name, avatar: S._newAvatar, grade });
    CHILDREN = await api('GET', '/api/children');
    closeAdd();
    if (S.screen === 'home') renderHome();
    else if (S.pinOk) renderParent();
  }
  function closeAdd() { const m = document.getElementById('addmask'); if (m) m.remove(); }

  // ---------- 编辑孩子年级 ----------
  let _editGradeChildId = null;
  function openEditGrade(childId, currentGrade) {
    _editGradeChildId = childId;
    const mask = document.createElement('div'); mask.className = 'modal-mask'; mask.id = 'grademask';
    mask.innerHTML = `<div class="modal"><h3>修改年级</h3>
      <p class="muted center" style="margin-bottom:12px">选择新的年级</p>
      <div class="grid grid-3" style="gap:8px">
        ${[1,2,3,4,5,6].map(g => `<div class="card grade-card ${g === currentGrade ? 'grade-sel' : ''}" onclick="pickNewGrade(${g})">
          <div class="g-num">${g}</div>
          <div class="g-name">${GRADE_LABELS[g]}</div>
        </div>`).join('')}
      </div>
      <button class="btn btn-ghost btn-block" onclick="closeGradeMask()">取消</button></div>`;
    document.body.appendChild(mask);
  }
  function pickNewGrade(g) {
    // 高亮选中
    document.querySelectorAll('#grademask .grade-card').forEach(el => el.classList.remove('grade-sel'));
    event.currentTarget.classList.add('grade-sel');
    _editGradeNew = g;
    // 直接保存
    saveGrade(g);
  }
  let _editGradeNew = null;
  async function saveGrade(g) {
    if (!_editGradeChildId) return;
    await api('PUT', '/api/child/' + _editGradeChildId, { grade: g });
    CHILDREN = await api('GET', '/api/children');
    // 同步更新当前选中孩子的年级
    if (S.child && S.child.id === _editGradeChildId) S.child.grade = g;
    closeGradeMask();
    toast('年级已修改');
    if (S.screen === 'home') renderHome();
    else if (S.pinOk) renderParent();
    else renderChildMenu();
  }
  function closeGradeMask() { const m = document.getElementById('grademask'); if (m) m.remove(); }

  // ---------- 家长面板 ----------
  // 本机是否已记住家长登录（绑定当前家庭 ID，换家庭自动失效）
  function isParentAuthed() { return localStorage.getItem('math_parent_auth') === getFamilyId(); }
  function openParent() {
    // 从孩子界面切换时（forcePin=true），强制验证 PIN，不走记住登录
    if (!S.forcePin && isParentAuthed()) { S.pinOk = true; renderParent(); return; }
    S.forcePin = false; // 重置标记，下次 openParent 恢复正常逻辑
    S.pinOk = false; renderPinModal();
  }
  function renderPinModal() {
    const mask = document.createElement('div'); mask.className = 'modal-mask'; mask.id = 'pinmask';
    mask.innerHTML = `<div class="modal"><h3>家长验证</h3>
      <div class="field"><label>请输入家庭 PIN</label><input id="pininput" type="password" inputmode="numeric" maxlength="8" placeholder="请输入 PIN" autocomplete="off"/></div>
      <button class="btn btn-primary btn-block" onclick="submitPin()">进入</button>
      <button class="btn btn-ghost btn-block" onclick="closeModal()">取消</button>
</div>`;
    document.body.appendChild(mask);
  }
  async function submitPin() {
    const v = document.getElementById('pininput').value;
    const r = await api('POST', '/api/checkpin', { pin: v });
    if (r.ok) { S.pinOk = true; localStorage.setItem('math_parent_auth', getFamilyId()); closeModal(); renderParent(); }
    else toast('PIN 不对');
  }
  function closeModal() { const m = document.getElementById('pinmask'); if (m) m.remove(); }

  async function renderParent() {
    if (!S.pinOk) { openParent(); return; }
    CHILDREN = await api('GET', '/api/children');
    REWARDS = await api('GET', '/api/rewards');
    S._children = CHILDREN; S._rewards = REWARDS;
    const tabs = [['children', '👧 孩子'], ['stats', '📊 统计'], ['rewards', '🎁 礼品'], ['redeem', '📋 兑换'], ['settings', '⚙️ 设置']];
    $app.innerHTML = `
      <div class="topbar"><button class="btn btn-ghost" onclick="switchToChild()">←</button><div class="who">👤 家长面板</div></div>
      <div class="tabs">${tabs.map(t => `<div class="tab ${S.parentTab === t[0] ? 'active' : ''}" onclick="parentTab('${t[0]}')">${t[1]}</div>`).join('')}</div>
      <div id="parentBody"></div>`;
    await parentBody();
  }
  function parentTab(t) { S.parentTab = t; renderParent(); }
  async function parentBody() {
    const b = document.getElementById('parentBody'); if (!b) return;
    if (S.parentTab === 'children') childrenTab(b);
    else if (S.parentTab === 'stats') await statsTab(b);
    else if (S.parentTab === 'rewards') rewardsTab(b);
    else if (S.parentTab === 'redeem') await redeemTab(b);
    else if (S.parentTab === 'settings') await settingsTab(b);
  }
  function childrenTab(b) {
    const kids = S._children;
    let html = `<button class="btn btn-primary btn-block" onclick="openAddChild()">➕ 添加小朋友</button><div class="spacer"></div><div class="list">`;
    for (const c of kids) {
      html += `<div class="row-item"><div><div class="q">${c.avatar} ${c.name}</div><div class="tag">${GRADE_LABELS[c.grade] || ''} · ⭐ ${c.points}</div></div>
        <button class="btn btn-blue btn-sm" onclick="openEditGrade('${c.id}',${c.grade})">改年级</button>
        <button class="btn btn-coral btn-sm" onclick="delChild('${c.id}')">删除</button></div>`;
    }
    html += '</div>';
    b.innerHTML = html;
  }
  async function delChild(id) {
    if (!confirm('确定删除这个小朋友？进度会清空。')) return;
    try {
      const r = await api('DELETE', '/api/child/' + id);
      if (r.error) { toast(r.error); return; }
      CHILDREN = await api('GET', '/api/children');
      // 如果删的是当前选中孩子，清除
      if (S.child && S.child.id === id) S.child = null;
      renderParent();
      toast('已删除');
    } catch(e) {
      console.error('delete child error:', e);
      toast('删除失败，请重试');
    }
  }
  async function statsTab(b) {
    const kids = S._children;
    if (!kids.length) { b.innerHTML = '<p class="center muted">还没有孩子数据</p>'; return; }
    let html = '';
    for (const c of kids) {
      const s = await api('GET', '/api/child/' + c.id);
      html += `<div class="panel" style="margin-bottom:14px">
        <h3 style="color:var(--purple);margin:0 0 8px">${c.avatar} ${c.name}（${GRADE_LABELS[c.grade] || ''}）</h3>
        <div class="stat"><span>积分</span><span>⭐ ${s.points}</span></div>
        <div class="stat"><span>练习次数</span><span>${s.sessionCount}</span></div>
        <div class="stat"><span>累计做题</span><span>${s.totalQ}</span></div>
        <div class="stat"><span>正确率</span><span>${s.accuracy}%</span></div>
        <div class="bar"><i style="width:${s.accuracy}%"></i></div>
        <div class="stat"><span>错题数</span><span>${s.wrongBook.length}</span></div>
      </div>`;
    }
    b.innerHTML = html;
  }
  function rewardsTab(b) {
    const rs = S._rewards.slice().sort((a, b) => a.cost - b.cost);
    let html = `<button class="btn btn-primary btn-block" onclick="openRewardModal('')">➕ 添加礼品</button><div class="spacer"></div><div class="list">`;
    for (const r of rs) {
      html += `<div class="row-item"><div><div class="q">${r.icon} ${r.name}</div><div class="tag">⭐ ${r.cost} · ${r.active ? '已上架' : '未上架'}</div></div><button class="btn btn-blue" onclick="openRewardModal('${r.id}')">编辑</button></div>`;
    }
    html += '</div>';
    b.innerHTML = html;
  }
  async function redeemTab(b) {
    const list = await api('GET', '/api/redemptions');
    if (!list.length) { b.innerHTML = '<p class="center muted">还没有兑换记录</p>'; return; }
    let html = '<div class="list">';
    for (const x of list) {
      html += `<div class="row-item"><div><div class="q">${x.icon} ${x.rewardName}</div><div class="tag">${x.childName} · ⭐${x.cost} · ${x.fulfilled ? '已兑现' : '待兑现'}</div></div>${x.fulfilled ? '<span class="badge" style="background:var(--green)">已给</span>' : `<button class="btn btn-primary" onclick="fulfill('${x.id}')">已给</button>`}</div>`;
    }
    html += '</div>';
    b.innerHTML = html;
  }
  async function fulfill(id) { await api('PUT', '/api/redemptions/' + id); redeemTab(document.getElementById('parentBody')); }
  async function settingsTab(b) {
    let lic = null;
    try { lic = await api('GET', '/api/license/state'); } catch (e) { /* 忽略 */ }
    let licHtml = '';
    if (lic) {
      const expStr = lic.exp ? new Date(lic.exp).toLocaleDateString('zh-CN') : '-';
      const daysLeft = lic.daysLeft ?? 0;
      const low = lic.valid && daysLeft < 14;
      licHtml = `<div class="panel" style="margin-top:14px"><h3 style="text-align:center;color:var(--purple)">许可证</h3>
        <p class="muted center">状态：${lic.valid ? '✅ 有效' : '⏳ 已过期/失效'}</p>
        <p class="muted center">有效期至：${expStr}（剩余 ${daysLeft} 天）</p>
        ${lic.keyTail && lic.keyTail !== 'legacy' ? `<p class="muted center">卡密尾号：<code>${lic.keyTail}</code></p>` : ''}
        ${!lic.valid ? '<button class="btn btn-coral btn-block" onclick="renderRenew()">去续费</button>' : (low ? '<button class="btn btn-coral btn-block" onclick="renderRenew()">即将到期，去续费</button>' : '')}</div>`;
    }
    b.innerHTML = `<div class="panel"><h3 style="text-align:center;color:var(--purple)">修改家长 PIN</h3>
      <div class="field"><label>旧 PIN</label><input id="oldpin" type="password" inputmode="numeric"/></div>
      <div class="field"><label>新 PIN</label><input id="newpin" type="password" inputmode="numeric"/></div>
      <button class="btn btn-primary btn-block" onclick="doChangePin()">保存</button>
      <p class="muted center">PIN 需为 4-8 位数字。</p></div>
      <div class="panel" style="margin-top:14px"><h3 style="text-align:center;color:var(--purple)">家庭</h3>
      <p class="muted center">当前家庭 ID：<code style="font-size:11px;color:#666">${getFamilyId() ? getFamilyId().slice(0, 8) + '…' : '无'}</code></p>
      <button class="btn btn-blue btn-block" onclick="switchFamily()">切换/退出家庭</button></div>
      <div class="panel" style="margin-top:14px"><h3 style="text-align:center;color:var(--purple)">系统更新</h3>
      <button class="btn btn-coral btn-block" onclick="openUpdate()">🔄 一键更新系统</button></div>
      ${licHtml}`;
  }

  // ---------- 一键更新 ----------
  let _updating = false;
  function openUpdate() {
    if (_updating) return;
    const mask = document.createElement('div'); mask.className = 'modal-mask'; mask.id = 'updatemask';
    mask.innerHTML = `<div class="modal"><h3>🔄 一键更新</h3>
      <p class="muted center" style="margin-bottom:12px">输入超级管理员密码才能更新</p>
      <div class="field"><label>超级管理员密码</label><input id="supwd" type="password" inputmode="numeric" placeholder="请输入密码"/></div>
      <button class="btn btn-coral btn-block" onclick="doUpdate()">开始更新</button>
      <button class="btn btn-ghost btn-block" onclick="closeUpdate()">取消</button>
      <p class="muted center" id="updmsg" style="min-height:20px"></p></div>`;
    document.body.appendChild(mask);
  }
  function closeUpdate() { const m = document.getElementById('updatemask'); if (m) m.remove(); }
  async function doUpdate() {
    if (_updating) return;
    const pwd = document.getElementById('supwd').value;
    const msg = document.getElementById('updmsg');
    _updating = true;
    msg.textContent = '正在拉取最新代码…';
    try {
      const r = await api('POST', '/api/admin/update', { password: pwd });
      if (!r.ok) { _updating = false; msg.textContent = r.error || '更新失败'; return; }
      if (r.noChange) { _updating = false; msg.textContent = '✅ 已经是最新版本，无需更新'; return; }
      msg.textContent = '更新成功，正在重启…';
      // 服务器会重启，前端轮询到版本变化或连接恢复后自动刷新
      toast('更新成功，页面即将刷新');
    } catch (e) {
      _updating = false;
      msg.textContent = '更新失败，请检查网络或稍后重试';
    }
  }

  // 版本轮询：版本变化时（一键更新后）自动刷新所有在线页面
  let _knownVersion = null;
  async function pollVersion() {
    try {
      const r = await api('GET', '/api/version');
      if (r && r.version) {
        if (_knownVersion === null) _knownVersion = r.version;
        else if (r.version !== _knownVersion) {
          // 版本已更新，刷新所有打开的页面
          location.reload(true);
          return;
        }
      }
    } catch (e) { /* 服务重启中，忽略 */ }
    setTimeout(pollVersion, 15000);
  }
  async function doChangePin() {
    const o = document.getElementById('oldpin').value, n = document.getElementById('newpin').value;
    const r = await api('PUT', '/api/pin', { oldPin: o, newPin: n });
    if (r.ok) toast('PIN 已修改'); else toast('旧 PIN 错误');
  }

  // 礼品编辑（增 / 改 / 删，图标直接从图标库选）
  function openRewardModal(id) {
    const r = id ? S._rewards.find(x => x.id === id) : { name: '', icon: '🌟', cost: 10, active: true };
    S._editReward = r;
    const ICONS = ['🌟', '🍬', '📺', '📚', '⚽', '🎁', '🧸', '🍎', '🍦', '🚀', '🦄', '🐱', '🐶', '🎨', '🎮', '🏀', '🍔', '🍕', '🎯', '💡', '🌈', '🪁', '🧩', '🎲', '📱', '💎', '🐠', '🌸', '🍇', '🥇', '🚂', '🪀', '🎹', '📔', '🍭', '🛹', '🏖️', '🎠'];
    const mask = document.createElement('div'); mask.className = 'modal-mask'; mask.id = 'rewardmask';
    mask.innerHTML = `<div class="modal">
      <h3>${id ? '编辑礼品' : '添加礼品'}</h3>
      <div class="field"><label>图标（点一个换图标）</label><div class="icon-pick" id="iconpick">${ICONS.map(i => `<span class="${i === r.icon ? 'sel' : ''}" onclick="pickIcon('${i}')">${i}</span>`).join('')}</div></div>
      <div class="field"><label>名称</label><input id="rwname" value="${r.name || ''}" maxlength="20"/></div>
      <div class="field"><label>积分价格</label><input id="rwcost" type="number" value="${r.cost || 0}"/></div>
      <div class="field"><label><input type="checkbox" id="rwactive" ${r.active !== false ? 'checked' : ''}/> 上架到礼品店</label></div>
      <button class="btn btn-primary btn-block" onclick="saveReward('${id || ''}')">保存</button>
      ${id ? `<button class="btn btn-coral btn-block" onclick="deleteReward('${id}')">删除</button>` : ''}
      <button class="btn btn-ghost btn-block" onclick="closeReward()">取消</button>
    </div>`;
    document.body.appendChild(mask);
  }
  function pickIcon(i) {
    S._editReward.icon = i;
    document.querySelectorAll('#iconpick span').forEach(s => s.classList.toggle('sel', s.textContent === i));
  }
  async function saveReward(id) {
    const name = document.getElementById('rwname').value.trim();
    const cost = Number(document.getElementById('rwcost').value) || 0;
    const active = document.getElementById('rwactive').checked;
    const icon = S._editReward.icon;
    if (id) await api('PUT', '/api/rewards/' + id, { name, icon, cost, active });
    else await api('POST', '/api/rewards', { name, icon, cost, active });
    closeReward(); renderParent();
  }
  async function deleteReward(id) { await api('DELETE', '/api/rewards/' + id); closeReward(); renderParent(); }
  function closeReward() { const m = document.getElementById('rewardmask'); if (m) m.remove(); }

  // ---------- 导航 ----------
  function selectChild(id) { S.child = CHILDREN.find(c => c.id === id); renderChildMenu(); }
  function backHome() { renderHome(); }

  // ---------- 启动 ----------
  // 家庭认证页：加入（仅 PIN）/ 创建（PIN + 激活卡密，一卡密一家庭）
  let _authTab = 'join';
  function setAuthTab(t) { _authTab = t; renderFamilyAuth(); }
  async function renderFamilyAuth() {
    let state = { hasFamilies: false };
    try { state = await fetch('/api/auth/state').then((r) => r.json()); } catch (e) { state = { hasFamilies: false }; }
    document.body.style.background = '';
    const createMode = _authTab === 'create';
    $app.innerHTML = `
      <div class="welcome">
        <div class="welcome-emoji">🏠</div>
        <h1 class="title">算术小乐园</h1>
        <p class="subtitle">加入已有家庭，或用激活卡密创建新家庭</p>
        <div class="tabs" style="max-width:380px;margin:0 auto 14px">
          <div class="tab ${!createMode ? 'active' : ''}" onclick="setAuthTab('join')">加入家庭</div>
          <div class="tab ${createMode ? 'active' : ''}" onclick="setAuthTab('create')">创建家庭</div>
        </div>
        <div class="panel" style="max-width:380px;margin:0 auto">
          <div class="field"><label>家庭 PIN（4-8 位数字）</label>
            <input id="fampin" type="password" inputmode="numeric" maxlength="8" placeholder="例如 1234" autocomplete="off"/></div>
          <div class="field" id="keyfield" style="${createMode ? '' : 'display:none'}"><label>激活卡密</label>
            <input id="famkey" type="text" placeholder="MATH-XXXX-XXXX-XXXX" autocomplete="off"/></div>
          <button class="btn btn-primary btn-block" onclick="submitFamilyPin()">${createMode ? '创建家庭' : '加入家庭'}</button>
          <p class="muted center" id="famauthmsg" style="min-height:18px;margin-top:8px"></p>
        </div>
        <p class="muted center" style="margin-top:8px">同一家庭多台设备（手机/Pad）用 PIN 登录即可共享；创建新家庭需要激活卡密</p>
      </div>`;
    const pinInput = document.getElementById('fampin');
    if (pinInput) pinInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitFamilyPin();
    });
    setTimeout(() => pinInput && pinInput.focus(), 100);
  }
  async function submitFamilyPin() {
    const pin = document.getElementById('fampin').value.trim();
    const createMode = _authTab === 'create';
    const key = createMode ? (document.getElementById('famkey').value || '').trim() : '';
    const msg = document.getElementById('famauthmsg');
    if (!/^\d{4,8}$/.test(pin)) { msg.textContent = 'PIN 需为 4-8 位数字'; return; }
    if (createMode && !key) { msg.textContent = '创建家庭需要激活卡密'; return; }
    msg.textContent = '正在处理…';
    try {
      const r = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin, key, create: createMode }) });
      const data = await r.json();
      if (!data.ok) { msg.textContent = data.error || '失败'; return; }
      setFamilyId(data.familyId);
      msg.textContent = data.isNew ? '✅ 家庭已创建' : '✅ 已加入家庭';
      setTimeout(() => init(), 400);
    } catch (e) {
      msg.textContent = '网络错误，请重试';
    }
  }
  function switchFamily() {
    if (!confirm('确定要切换到其他家庭吗？当前家庭的数据保留，再次输入 PIN 即可回来。')) return;
    setFamilyId('');
    localStorage.removeItem('math_role');
    localStorage.removeItem('math_parent_auth');
    document.querySelectorAll('.modal-mask').forEach((m) => m.remove());
    _authTab = 'join';
    renderFamilyAuth();
  }

  // 续费页：许可证过期/失效时展示
  function renderRenew() {
    document.body.style.background = '';
    $app.innerHTML = `
      <div class="welcome">
        <div class="welcome-emoji">⏳</div>
        <h1 class="title">许可证已到期</h1>
        <p class="subtitle">请联系卖家购买新卡密续费</p>
        <div class="panel" style="max-width:380px;margin:16px auto">
          <div class="field"><label>新激活卡密</label>
            <input id="renewkey" type="text" placeholder="MATH-XXXX-XXXX-XXXX" autocomplete="off"/></div>
          <button class="btn btn-primary btn-block" onclick="doRenew()">续费</button>
          <p class="muted center" id="renewmsg" style="min-height:18px;margin-top:8px"></p>
        </div>
        <p class="muted center" style="margin-top:8px"><a href="#" onclick="switchFamily()">退出当前家庭</a></p>
      </div>`;
    setTimeout(() => { const el = document.getElementById('renewkey'); if (el) el.focus(); }, 100);
  }
  async function doRenew() {
    const key = (document.getElementById('renewkey').value || '').trim();
    const msg = document.getElementById('renewmsg');
    if (!key) { msg.textContent = '请输入卡密'; return; }
    msg.textContent = '正在处理…';
    try {
      const r = await api('POST', '/api/license/renew', { key });
      if (!r.ok) { msg.textContent = r.error || '续费失败'; return; }
      msg.textContent = '✅ 续费成功';
      setTimeout(() => init(), 500);
    } catch (e) {
      msg.textContent = '网络错误，请重试';
    }
  }

  async function init() {
    const fid = getFamilyId();
    if (!fid) {
      // 没家庭身份 → 显示家庭登录/创建
      renderFamilyAuth();
      return;
    }
    // 验证 familyId 是否有效：尝试拉一次数据，401 时退回登录页
    try {
      CHILDREN = await api('GET', '/api/children');
    } catch (e) {
      // api() 内部已经处理过 401，这里兜底
      if (!getFamilyId()) return; // 已经在 renderFamilyAuth 了
      setFamilyId('');
      renderFamilyAuth();
      return;
    }
    REWARDS = await api('GET', '/api/rewards');
    // 检查许可证状态：失效则进续费页
    try {
      const lic = await api('GET', '/api/license/state');
      if (lic && !lic.valid) { renderRenew(); return; }
    } catch (e) { /* 网络异常忽略，业务接口会兜底 */ }
    const savedRole = localStorage.getItem('math_role');
    if (savedRole === 'parent') { openParent(); }
    else if (savedRole === 'child') {
      if (CHILDREN.length === 1) { S.child = CHILDREN[0]; renderChildMenu(); }
      else { renderHome(); }
    }
    else { renderRoleSelect(); }
    pollVersion();
  }

  Object.assign(window, {
    selectChild, openAddChild, pickAvatar, saveChild, closeAdd, backHome,
    renderChildMenu, gotoGrade, selectGrade, selectModule, selectMode,
    keyTap, choiceTap, gotoWrong, startCorrection, gotoStore, redeem,
    openParent, submitPin, closeModal, parentTab, renderParent,
    openRewardModal, pickIcon, saveReward, deleteReward, closeReward,
    doChangePin, delChild, fulfill,
    openEditGrade, pickNewGrade, saveGrade, closeGradeMask,
    enterAsChild, enterAsParent, switchToParent, switchToChild,
    openUpdate, closeUpdate, doUpdate,
    renderFamilyAuth, setAuthTab, submitFamilyPin, switchFamily,
    renderRenew, doRenew,
  });

  init();
})();
