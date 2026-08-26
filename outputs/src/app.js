import { userProfile, workouts, profileOptions } from './data.js';
import { buildDashboard, buildWorkoutRecommendations, buildAnalysis } from './logic.js';

const state = {
  currentPage: 'dashboard',
  profile: loadProfile(),
  workouts: loadWorkouts(),
  todayPreference: 'standard',
  syncLog: loadSyncLog(),
  chatOpen: false,
  chatLoading: false,
  chatInput: '',
  chatMessages: loadChatMessages(),
};

const isStandaloneMode = Boolean(window.__FITNESS_STANDALONE__) || window.location.protocol === 'file:' || window.location.pathname.includes('fitness_recommender_standalone.html');

function defaultProfile() {
  return JSON.parse(JSON.stringify(userProfile));
}

function loadProfile() {
  try {
    const saved = localStorage.getItem('fitness-profile-demo');
    if (!saved) return defaultProfile();
    return { ...defaultProfile(), ...JSON.parse(saved) };
  } catch {
    return defaultProfile();
  }
}

function loadWorkouts() {
  try {
    const saved = localStorage.getItem('fitness-workouts-demo');
    if (!saved) return normalizeWorkouts(JSON.parse(JSON.stringify(workouts)));
    return normalizeWorkouts(JSON.parse(saved));
  } catch {
    return normalizeWorkouts(JSON.parse(JSON.stringify(workouts)));
  }
}

function normalizeWorkouts(sourceWorkouts) {
  return (sourceWorkouts ?? []).map((workout, workoutIndex) => ({
    ...workout,
    id: workout.id ?? `w${workoutIndex + 1}`,
    exercises: (workout.exercises ?? []).map((exercise, exerciseIndex) => ({
      ...exercise,
      id: exercise.id ?? `e${workoutIndex + 1}-${exerciseIndex + 1}`,
      completedAt: exercise.completedAt ?? null,
    })),
  }));
}

function defaultSyncLog() {
  return [
    { time: '2026/08/12 09:20:00', message: '同步成功，新增 1 次训练记录' },
    { time: '2026/08/11 21:16:00', message: '同步成功，新增 4 条动作记录' },
    { time: '2026/08/11 09:15:00', message: '同步成功，未发现新数据' },
  ];
}

function loadSyncLog() {
  try {
    const saved = localStorage.getItem('fitness-sync-log-demo');
    if (!saved) return defaultSyncLog();
    return JSON.parse(saved);
  } catch {
    return defaultSyncLog();
  }
}

function defaultChatMessages() {
  return [
    {
      role: 'assistant',
      content: isStandaloneMode
        ? '对话功能需要启动后端服务，请参考 README 使用 npm run dev 启动。'
        : '你好，我是你的 AI 健身教练。你可以直接问我今天怎么练、要不要加重，或者让我解释推荐结果。',
    },
  ];
}

function loadChatMessages() {
  try {
    const saved = localStorage.getItem('fitness-chat-demo');
    if (!saved) return defaultChatMessages();
    return JSON.parse(saved);
  } catch {
    return defaultChatMessages();
  }
}

function saveProfile() {
  try {
    localStorage.setItem('fitness-profile-demo', JSON.stringify(state.profile));
    localStorage.setItem('fitness-workouts-demo', JSON.stringify(state.workouts));
    localStorage.setItem('fitness-sync-log-demo', JSON.stringify(state.syncLog));
    localStorage.setItem('fitness-chat-demo', JSON.stringify(state.chatMessages));
  } catch {
    // 本地文件打开时，某些浏览器可能禁止 localStorage
  }
}

function addSyncLog(message) {
  state.syncLog.unshift({
    time: new Date().toLocaleString('zh-CN'),
    message,
  });
  state.syncLog = state.syncLog.slice(0, 10);
}

function computeState() {
  return {
    dashboard: buildDashboard(state.profile, state.workouts),
    today: buildWorkoutRecommendations(state.profile, state.workouts, state.profile.currentDayType, state.todayPreference),
    analysis: buildAnalysis(state.profile, state.workouts),
  };
}

function selectField({ name, label, value, options }) {
  return `
    <label>${label}
      <select name="${name}">
        ${options.map((option) => `<option value="${option}" ${option === value ? 'selected' : ''}>${option}</option>`).join('')}
      </select>
    </label>
  `;
}

function numericField({ name, label, value, min, max, step = '1' }) {
  return `<label>${label}<input name="${name}" type="number" value="${value}" min="${min}" max="${max}" step="${step}" /></label>`;
}

const navItems = [
  { key: 'dashboard', label: '首页' },
  { key: 'profile', label: '首次建档' },
  { key: 'connect', label: '训记连接' },
  { key: 'today', label: '今日建议' },
  { key: 'analysis', label: '训练分析' },
  { key: 'sync', label: '数据同步' },
  { key: 'settings', label: '个人设置' },
];

const nav = document.querySelector('#nav');
const root = document.querySelector('#page-root');
const topbarTitle = document.querySelector('#topbarTitle');
const syncStatusPill = document.querySelector('#syncStatusPill');
const goalModeBadge = document.querySelector('#goalModeBadge');
const syncNowBtn = document.querySelector('#syncNowBtn');

function refreshHeader() {
  goalModeBadge.textContent = state.profile.goal;
  syncStatusPill.textContent = `最近同步：${state.profile.lastSyncText}`;
}

refreshHeader();

syncNowBtn.addEventListener('click', () => {
  syncStatusPill.textContent = '同步中…';
  setTimeout(() => {
    state.profile.lastSyncText = '刚刚';
    addSyncLog('同步成功，已刷新当前训练建议');
    saveProfile();
    refreshHeader();
    renderToast('已完成一次模拟同步，推荐结果已刷新。');
    render();
  }, 900);
});

function renderNav() {
  nav.innerHTML = navItems
    .map(
      (item) => `
        <button class="nav-item ${state.currentPage === item.key ? 'active' : ''}" data-page="${item.key}">
          ${item.label}
        </button>
      `,
    )
    .join('');

  nav.querySelectorAll('[data-page]').forEach((button) => {
    button.addEventListener('click', () => {
      state.currentPage = button.dataset.page;
      render();
    });
  });
}

function badgeClass(action) {
  if (action === '加重') return 'success';
  if (action === '减量') return 'warning';
  return 'neutral';
}

function renderDashboard(derived) {
  const { recovery, todaySummary, improving, stalled, fatigue } = derived.dashboard;
  return `
    <section class="grid cols-3 hero-grid">
      <article class="card hero-card gradient">
        <div class="eyebrow">当前训练状态</div>
        <h3>${todaySummary.dayStatus}</h3>
        <p>${todaySummary.daySummary}</p>
        <div class="chip-row">
          <span class="chip">目标：${state.profile.goal}</span>
          <span class="chip">当前训练日：${state.profile.currentDayType}</span>
        </div>
      </article>

      <article class="card stat-card">
        <div class="eyebrow">恢复情况</div>
        <div class="big-number">${recovery.label}</div>
        <p>${recovery.tip}</p>
      </article>

      <article class="card stat-card">
        <div class="eyebrow">今日关键结论</div>
        <ul class="bullet-list compact">
          ${todaySummary.exerciseRecommendations.slice(0, 3).map((item) => `<li>${item.name}：${item.actionLabel}</li>`).join('')}
        </ul>
      </article>
    </section>

    <section class="grid cols-2 section-gap">
      <article class="card">
        <div class="card-header">
          <div>
            <div class="eyebrow">今日建议摘要</div>
            <h3>${todaySummary.dayType}</h3>
          </div>
          <button type="button" class="primary" data-jump="today">查看完整建议</button>
        </div>
        <div class="recommendation-list short">
          ${todaySummary.exerciseRecommendations.map((item) => `
            <div class="recommendation-row">
              <div>
                <div class="item-title">${item.name}</div>
                <div class="muted">建议 ${item.targetWeight}${typeof item.targetWeight === 'number' ? ' kg' : ''} · ${item.targetSets} 组 · ${item.targetRepsRange}</div>
              </div>
              <span class="status-pill ${badgeClass(item.actionLabel)}">${item.actionLabel}</span>
            </div>
          `).join('')}
        </div>
      </article>

      <article class="card">
        <div class="eyebrow">近期状态摘要</div>
        <div class="summary-grid">
          <div>
            <h4>适合推进</h4>
            <ul class="bullet-list">${(improving.length ? improving : ['暂无明显加重动作']).map((name) => `<li>${name}</li>`).join('')}</ul>
          </div>
          <div>
            <h4>建议巩固</h4>
            <ul class="bullet-list">${(stalled.length ? stalled : ['暂无']).map((name) => `<li>${name}</li>`).join('')}</ul>
          </div>
          <div>
            <h4>疲劳偏高</h4>
            <ul class="bullet-list">${(fatigue.length ? fatigue : ['暂无']).map((name) => `<li>${name}</li>`).join('')}</ul>
          </div>
        </div>
      </article>
    </section>

    <section class="grid cols-2 section-gap">
      <article class="card">
        <div class="eyebrow">恢复与饮食提醒</div>
        <ul class="bullet-list">
          <li>最近平均睡眠 ${state.profile.sleepHours} 小时，建议本周至少 2 天补足到 7 小时以上。</li>
          <li>当前饮食阶段：${state.profile.nutritionPhase}，保持蛋白质稳定即可。</li>
          <li>如果今晚睡眠不足，明天主项优先维持，不建议额外冲重量。</li>
        </ul>
      </article>

      <article class="card">
        <div class="eyebrow">周期建议</div>
        <ul class="bullet-list">
          <li>${todaySummary.weeklyAdvice}</li>
          <li>${state.profile.focusArea}是当前强化方向，本周可优先保证相关动作完整执行。</li>
          <li>若卧推下次完成 70kg 3×6，可再考虑加到 72.5kg。</li>
        </ul>
      </article>
    </section>
  `;
}

function renderProfile() {
  return `
    <section class="card form-card wide">
      <div class="card-header">
        <div>
          <div class="eyebrow">首次建档</div>
          <h3>你的当前训练画像</h3>
        </div>
        <span class="status-pill neutral">可直接修改</span>
      </div>
      <form id="profileForm" class="form-grid cols-2">
        ${selectField({ name: 'gender', label: '性别', value: state.profile.gender, options: profileOptions.genders })}
        ${numericField({ name: 'age', label: '年龄', value: state.profile.age, min: 16, max: 80 })}
        ${numericField({ name: 'height', label: '身高（cm）', value: state.profile.height, min: 130, max: 230 })}
        ${numericField({ name: 'weight', label: '体重（kg）', value: state.profile.weight, min: 30, max: 200, step: '0.1' })}
        ${numericField({ name: 'bodyFat', label: '体脂率（%）', value: state.profile.bodyFat, min: 3, max: 60, step: '0.1' })}
        ${numericField({ name: 'experienceMonths', label: '训练经验（月）', value: state.profile.experienceMonths, min: 0, max: 600 })}
        ${selectField({ name: 'split', label: '训练分化', value: state.profile.split, options: profileOptions.splits })}
        ${numericField({ name: 'daysPerWeek', label: '每周训练天数', value: state.profile.daysPerWeek, min: 1, max: 7 })}
        ${selectField({ name: 'goal', label: '主目标', value: state.profile.goal, options: profileOptions.goals })}
        <label>强化部位<input name="focusArea" value="${state.profile.focusArea}" /></label>
        ${numericField({ name: 'sleepHours', label: '平均睡眠（小时）', value: state.profile.sleepHours, min: 0, max: 24, step: '0.1' })}
        ${selectField({ name: 'stressLevel', label: '压力等级', value: state.profile.stressLevel, options: profileOptions.stressLevels })}
        ${selectField({ name: 'currentDayType', label: '当前训练日', value: state.profile.currentDayType, options: profileOptions.dayTypes })}
        <label>疼痛/旧伤<input name="painStatus" value="${state.profile.painStatus ?? '无'}" /></label>
      </form>
      <div class="actions inline">
        <button type="button" class="primary" data-save="profileForm">保存档案</button>
        <button type="button" class="primary ghost" data-reset-profile>恢复示例</button>
      </div>
    </section>
  `;
}

function renderConnect() {
  return `
    <section class="grid cols-2">
      <article class="card">
        <div class="eyebrow">训记连接</div>
        <h3>已连接训练记录</h3>
        <p>首版会通过训记 API Key 同步你的训练日期、动作、组数、重量、次数和部分主观强度信息。</p>
        <label>API Key
          <input id="apiKeyInput" value="${state.profile.apiKeyMasked}" />
        </label>
        <div class="actions inline">
          <button type="button" class="primary" data-update-key>保存 Key</button>
          <button type="button" class="primary ghost" data-mock-sync>测试同步</button>
        </div>
      </article>

      <article class="card">
        <div class="eyebrow">首次同步结果</div>
        <div class="metric-list">
          <div class="metric-row"><span>导入训练天数</span><strong>14 天</strong></div>
          <div class="metric-row"><span>导入动作条目</span><strong>46 条</strong></div>
          <div class="metric-row"><span>记录时间范围</span><strong>近 6 周</strong></div>
          <div class="metric-row"><span>最近同步</span><strong>${state.profile.lastSyncText}</strong></div>
        </div>
      </article>
    </section>
  `;
}

function renderToday(derived) {
  const plan = derived.today;
  const customization = buildTodayCustomization(plan);
  return `
    <section class="card hero-card">
      <div class="eyebrow">今日训练建议</div>
      <h3>${plan.dayType} · ${plan.dayStatus}</h3>
      <p>${plan.daySummary}</p>
      <div class="chip-row">
        <span class="chip">最近训练：${plan.latestDate ?? '暂无'}</span>
        <span class="chip">恢复：${plan.recovery.label}</span>
      </div>
    </section>

    <section class="card section-gap">
      <div class="card-header">
        <div>
          <div class="eyebrow">按今天目标微调</div>
          <h3>你今天想怎么练</h3>
        </div>
      </div>
      <div class="chip-row preference-row">
        <button type="button" class="chip chip-button ${state.todayPreference === 'standard' ? 'chip-active' : ''}" data-pref="standard">标准推进</button>
        <button type="button" class="chip chip-button ${state.todayPreference === 'glute' ? 'chip-active' : ''}" data-pref="glute">臀腿偏翘臀</button>
        <button type="button" class="chip chip-button ${state.todayPreference === 'quad' ? 'chip-active' : ''}" data-pref="quad">腿部偏股四</button>
        <button type="button" class="chip chip-button ${state.todayPreference === 'low_fatigue' ? 'chip-active' : ''}" data-pref="low_fatigue">今天状态一般</button>
        <button type="button" class="chip chip-button ${state.todayPreference === 'quick' ? 'chip-active' : ''}" data-pref="quick">45 分钟快练</button>
      </div>
      <div class="detail-box">
        <div><span class="detail-label">当前模式</span>${customization.title}</div>
        <div><span class="detail-label">微调说明</span>${customization.summary}</div>
        <div>
          <span class="detail-label">建议调整</span>
          <ul class="bullet-list compact">
            ${customization.items.map((item) => `<li>${item}</li>`).join('')}
          </ul>
        </div>
      </div>
    </section>

    <section class="recommendation-stack section-gap">
      ${plan.exerciseRecommendations.map((item) => `
        <article class="card recommendation-card">
          <div class="card-header align-start">
            <div>
              <div class="eyebrow">${item.category} · ${item.muscle}</div>
              <h3>${item.name}</h3>
            </div>
            <span class="status-pill ${badgeClass(item.actionLabel)}">${item.actionLabel}</span>
          </div>
          <div class="recommendation-grid">
            <div class="data-point"><span>建议重量</span><strong>${item.targetWeight}${typeof item.targetWeight === 'number' ? ' kg' : ''}</strong></div>
            <div class="data-point"><span>建议组数</span><strong>${item.targetSets} 组</strong></div>
            <div class="data-point"><span>建议次数</span><strong>${item.targetRepsRange}</strong></div>
            <div class="data-point"><span>强度提醒</span><strong>${item.intensity}</strong></div>
          </div>
          <div class="detail-box">
            <div><span class="detail-label">上次表现</span>${item.currentWeight} kg · ${item.currentReps}</div>
            <div><span class="detail-label">建议原因</span>${item.explanation}</div>
            ${item.deltaHint ? `<div><span class="detail-label">进阶提示</span>${item.deltaHint}</div>` : ''}
          </div>
        </article>
      `).join('') || '<article class="card"><p>当前训练日暂无足够数据。</p></article>'}
    </section>

    <section class="grid cols-2 section-gap">
      <article class="card">
        <div class="eyebrow">本次训练总提醒</div>
        <ul class="bullet-list">
          <li>主项优先保证动作质量，不建议最后一组盲目拼极限。</li>
          <li>如果热身时状态偏差，先维持重量，不强求加重。</li>
          <li>${plan.weeklyAdvice}</li>
        </ul>
      </article>
      <article class="card">
        <div class="eyebrow">恢复与饮食提醒</div>
        <ul class="bullet-list">
          <li>${plan.nutritionAdvice}</li>
          <li>今天训练后优先补充蛋白质和碳水，帮助恢复。</li>
          <li>若连续两天睡眠不足，下一次训练自动切换为保守推进更合适。</li>
        </ul>
      </article>
    </section>
  `;
}

function renderAnalysis(derived) {
  const analysis = derived.analysis;
  return `
    <section class="grid cols-2">
      <article class="card">
        <div class="eyebrow">关键诊断</div>
        <ul class="bullet-list">
          ${analysis.diagnosis.map((item) => `<li>${item}</li>`).join('')}
        </ul>
      </article>
      <article class="card">
        <div class="eyebrow">疑似平台动作</div>
        <div class="recommendation-list short">
          ${analysis.plateauCandidates.map((item) => `
            <div class="recommendation-row">
              <div>
                <div class="item-title">${item.name}</div>
                <div class="muted">${item.explanation}</div>
              </div>
              <span class="status-pill neutral">巩固</span>
            </div>
          `).join('')}
        </div>
      </article>
    </section>

    <section class="card section-gap">
      <div class="card-header">
        <div>
          <div class="eyebrow">肌群训练量概览</div>
          <h3>按最近训练记录统计</h3>
        </div>
      </div>
      <div class="volume-grid">
        ${analysis.volumeSummary.map((row) => `
          <div class="volume-card">
            <div class="item-title">${row.muscle}</div>
            <div class="big-number small">${row.volume}</div>
            <span class="status-pill ${row.level === '偏低' ? 'warning' : 'success'}">${row.level}</span>
            <div class="muted">有效组：${row.effectiveSets} · ${row.note}</div>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

function renderSync() {
  return `
    <section class="grid cols-2">
      <article class="card">
        <div class="eyebrow">连接状态</div>
        <div class="metric-list">
          <div class="metric-row"><span>训记状态</span><strong>${state.profile.xunjiConnected ? '已连接' : '未连接'}</strong></div>
          <div class="metric-row"><span>API Key</span><strong>${state.profile.apiKeyMasked}</strong></div>
          <div class="metric-row"><span>最近成功同步</span><strong>${state.profile.lastSyncText}</strong></div>
        </div>
        <div class="actions inline">
          <button type="button" class="primary" data-mock-sync>立即同步</button>
          <button type="button" class="primary ghost" data-page-jump="connect">更新 Key</button>
        </div>
      </article>
      <article class="card">
        <div class="eyebrow">同步记录</div>
        <ul class="bullet-list">
          ${state.syncLog.map((item) => `<li>${item.time}：${item.message}</li>`).join('')}
        </ul>
      </article>
    </section>
  `;
}

function renderSettings() {
  return `
    <section class="card form-card wide">
      <div class="eyebrow">个人设置</div>
      <form id="settingsForm" class="form-grid cols-2">
        ${selectField({ name: 'goal', label: '目标模式', value: state.profile.goal, options: profileOptions.goals })}
        <label>强化方向<input name="focusArea" value="${state.profile.focusArea}" /></label>
        ${selectField({ name: 'split', label: '训练分化', value: state.profile.split, options: profileOptions.splits })}
        ${numericField({ name: 'daysPerWeek', label: '每周训练天数', value: state.profile.daysPerWeek, min: 1, max: 7 })}
        ${selectField({ name: 'nutritionPhase', label: '饮食阶段', value: state.profile.nutritionPhase, options: profileOptions.nutritionPhases })}
        ${selectField({ name: 'proteinCompliance', label: '蛋白质执行度', value: state.profile.proteinCompliance, options: profileOptions.proteinComplianceLevels })}
        ${numericField({ name: 'sleepHours', label: '平均睡眠', value: state.profile.sleepHours, min: 0, max: 24, step: '0.1' })}
        ${selectField({ name: 'stressLevel', label: '压力等级', value: state.profile.stressLevel, options: profileOptions.stressLevels })}
        ${selectField({ name: 'currentDayType', label: '当前训练日', value: state.profile.currentDayType, options: profileOptions.dayTypes })}
        <label>疼痛/旧伤<input name="painStatus" value="${state.profile.painStatus ?? '无'}" /></label>
      </form>
      <div class="actions inline">
        <button type="button" class="primary" data-save="settingsForm">保存设置</button>
        <button type="button" class="primary ghost" data-page-jump="today">查看新建议</button>
      </div>
    </section>
  `;
}

function buildTodayCustomization(plan) {
  const pref = state.todayPreference;
  const isLegDay = plan.dayType === '腿训练日';

  if (pref === 'glute') {
    return {
      title: '臀腿偏翘臀',
      summary: isLegDay ? '今天优先把刺激更多分配到臀部和腿后侧。' : '当前不是腿训练日，建议下次腿日启用。',
      items: isLegDay
        ? [
            '深蹲维持推荐重量，先保住主项质量',
            '把罗马尼亚硬拉提前，优先刺激臀腿后侧',
            '腿举可替换为臀推 4×8-10 或保加利亚分腿蹲 3×10-12',
            '最后补 1 个臀部孤立动作，如臀外展或绳索后踢腿 3×12-15',
          ]
        : ['建议把“当前训练日”切到腿训练日后，再使用这套微调。'],
    };
  }

  if (pref === 'quad') {
    return {
      title: '腿部偏股四头',
      summary: isLegDay ? '今天更偏向股四头训练。' : '当前不是腿训练日，建议下次腿日启用。',
      items: isLegDay
        ? ['深蹲主项保留', '腿举脚位更低更窄', '收尾加腿屈伸 3×12-15']
        : ['当前训练日不建议强行套用股四头偏置。'],
    };
  }

  if (pref === 'low_fatigue') {
    return {
      title: '今天状态一般',
      summary: '本次更适合保守训练，优先练到位，而不是练到极限。',
      items: ['主项只求稳定完成', '辅助动作每个减少 1 组', '全程保留 2 次左右余力'],
    };
  }

  if (pref === 'quick') {
    return {
      title: '45 分钟快练',
      summary: '今天优先保留最有价值的动作，用更短时间完成有效训练。',
      items: ['保留 1 个主项 + 2 个关键辅助动作', '孤立动作缩减到 1 个或直接省略', '主项休息充足，辅助更紧凑'],
    };
  }

  return {
    title: '标准推进',
    summary: '按系统默认建议训练，优先保证主项质量和渐进进步。',
    items: ['主项按推荐重量执行', '辅助动作优先补次数', '最后一组不盲目冲极限'],
  };
}

function renderToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 20);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 250);
  }, 2200);
}

function renderChat() {
  let chatRoot = document.getElementById('chat-root');
  if (!chatRoot) {
    chatRoot = document.createElement('div');
    chatRoot.id = 'chat-root';
    document.body.appendChild(chatRoot);
  }

  if (!state.chatOpen) {
    chatRoot.innerHTML = `
      <button type="button" class="chat-fab" data-chat-toggle aria-label="打开 AI 健身教练">
        <span>💬</span>
      </button>
    `;
    return;
  }

  chatRoot.innerHTML = `
    <section class="chat-panel">
      <header class="chat-header">
        <div>
          <div class="eyebrow">AI 健身教练</div>
          <h3>随时问我训练问题</h3>
        </div>
        <button type="button" class="chat-close" data-chat-toggle aria-label="收起聊天面板">−</button>
      </header>
      <div class="chat-messages">
        ${state.chatMessages.map((message) => `
          <div class="chat-row ${message.role === 'user' ? 'chat-row-user' : 'chat-row-assistant'}">
            <div class="chat-bubble ${message.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-assistant'}">${message.content}</div>
          </div>
        `).join('')}
        ${state.chatLoading ? `
          <div class="chat-row chat-row-assistant">
            <div class="chat-bubble chat-bubble-assistant">教练正在思考...</div>
          </div>
        ` : ''}
      </div>
      <div class="chat-input-wrap">
        ${isStandaloneMode ? '<div class="chat-tip">对话功能需要启动后端服务，请参考 README 使用 npm run dev 启动。</div>' : ''}
        <textarea id="chatInput" class="chat-input" placeholder="比如：今天卧推该不该加重？" ${isStandaloneMode ? 'disabled' : ''}>${state.chatInput}</textarea>
        <button type="button" class="primary chat-send" data-chat-send ${isStandaloneMode ? 'disabled' : ''}>发送</button>
      </div>
    </section>
  `;
}

async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const content = (input?.value ?? state.chatInput ?? '').trim();
  if (!content || state.chatLoading || isStandaloneMode) return;

  state.chatMessages.push({ role: 'user', content });
  state.chatInput = '';
  state.chatLoading = true;
  saveProfile();
  render();

  try {
    const response = await fetch('http://localhost:3001/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: state.chatMessages.map(({ role, content: text }) => ({ role, content: text })),
        profile: state.profile,
        workouts: state.workouts,
      }),
    });

    if (!response.ok) {
      throw new Error(`chat_api_${response.status}`);
    }

    const data = await response.json();
    state.chatMessages.push({ role: 'assistant', content: data.reply || '我刚刚没组织好语言，你可以再问我一次。' });
  } catch {
    state.chatMessages.push({
      role: 'assistant',
      content: '当前暂时无法连接教练服务。请先确认后端是否已通过 npm run dev 启动，然后再试一次。',
    });
  } finally {
    state.chatLoading = false;
    saveProfile();
    render();
  }
}

function renderPage(derived) {
  if (state.currentPage === 'dashboard') return renderDashboard(derived);
  if (state.currentPage === 'profile') return renderProfile();
  if (state.currentPage === 'connect') return renderConnect();
  if (state.currentPage === 'today') return renderToday(derived);
  if (state.currentPage === 'analysis') return renderAnalysis(derived);
  if (state.currentPage === 'sync') return renderSync();
  if (state.currentPage === 'settings') return renderSettings();
  return '<section class="card"><p>页面建设中</p></section>';
}

function collectForm(form) {
  const formData = new FormData(form);
  return Object.fromEntries(formData.entries());
}

function normalizeProfilePatch(patch) {
  const next = { ...patch };
  ['age', 'height', 'weight', 'bodyFat', 'experienceMonths', 'daysPerWeek', 'sleepHours'].forEach((key) => {
    if (next[key] != null && next[key] !== '') next[key] = Number(next[key]);
  });
  return next;
}

root.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;

  if (button.dataset.jump || button.dataset.pageJump) {
    state.currentPage = button.dataset.jump || button.dataset.pageJump;
    render();
    return;
  }

  if (button.dataset.save) {
    const form = document.getElementById(button.dataset.save);
    if (!form) return;
    const patch = normalizeProfilePatch(collectForm(form));
    state.profile = { ...state.profile, ...patch };
    saveProfile();
    refreshHeader();
    renderToast('已保存，并根据新状态刷新建议。');
    render();
    return;
  }

  if ('resetProfile' in button.dataset) {
    state.profile = defaultProfile();
    saveProfile();
    refreshHeader();
    renderToast('已恢复为示例档案。');
    render();
    return;
  }

  if ('updateKey' in button.dataset) {
    const value = document.getElementById('apiKeyInput')?.value?.trim();
    if (value) {
      state.profile.apiKeyMasked = value;
      state.profile.xunjiConnected = true;
      saveProfile();
      renderToast('已保存训记 API Key。');
      render();
    }
    return;
  }

  if ('mockSync' in button.dataset) {
    state.profile.lastSyncText = '刚刚';
    addSyncLog('同步成功，已刷新当前训练建议');
    saveProfile();
    refreshHeader();
    renderToast('已模拟完成同步。');
    render();
    return;
  }

  if (button.dataset.pref) {
    state.todayPreference = button.dataset.pref;
    renderToast('已按你的今日目标微调建议。');
    render();
  }
});

document.body.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;

  if ('chatToggle' in button.dataset) {
    state.chatOpen = !state.chatOpen;
    render();
    return;
  }

  if ('chatSend' in button.dataset) {
    sendChatMessage();
  }
});

document.body.addEventListener('input', (event) => {
  if (event.target?.id === 'chatInput') {
    state.chatInput = event.target.value;
  }
});

document.body.addEventListener('keydown', (event) => {
  if (event.target?.id === 'chatInput' && event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendChatMessage();
  }
});

function render() {
  const derived = computeState();
  renderNav();
  topbarTitle.textContent = navItems.find((item) => item.key === state.currentPage)?.label ?? '健身进阶推荐器';
  root.innerHTML = renderPage(derived);
  renderChat();
}

render();
