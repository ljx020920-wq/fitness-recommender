import { userProfile, workouts, profileOptions } from './data.js';
import { buildDashboard, buildWorkoutRecommendations, buildAnalysis } from './logic.js';
import { modifyPlan, summarizeWeekPlan } from './plan-modifier.js?v=3';

const isStandaloneMode = Boolean(window.__FITNESS_STANDALONE__) || window.location.protocol === 'file:' || window.location.pathname.includes('fitness_recommender_standalone.html');

// API base URL：本地开发走 localhost:3001，Vercel 部署走相对路径
const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';

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

// ── 前端兜底：检测用户是否想修改计划 ──
function detectPlanChangeIntent(userText) {
  const text = userText.toLowerCase();

  // 获取今天的日期（YYYY-MM-DD）
  const today = new Date().toISOString().slice(0, 10);

  // 关键词映射到训练日类型
  const muscleMap = [
    { keywords: ['手臂', '二头', '三头', '肱二', '肱三'], dayType: '手臂训练日' },
    { keywords: ['臀', '翘臀', '屁股', 'glute'], dayType: '腿训练日' },
    { keywords: ['腿', '深蹲', '硬拉', '股四'], dayType: '腿训练日' },
    { keywords: ['胸', '卧推', '推胸', '胸肌'], dayType: '推训练日' },
    { keywords: ['背', '引体', '划船', '背阔'], dayType: '拉训练日' },
    { keywords: ['肩', '推举', '侧平举', '三角肌'], dayType: '肩训练日' },
  ];

  // 检测修改意图关键词
  const changeIntentKeywords = ['想练', '要练', '改成', '换成', '改为', '调整', '换', '改'];
  const hasChangeIntent = changeIntentKeywords.some((kw) => text.includes(kw));

  if (!hasChangeIntent) return null;

  // 匹配具体部位
  for (const mapping of muscleMap) {
    if (mapping.keywords.some((kw) => text.includes(kw))) {
      return {
        action: 'change_day_type',
        targetDate: today,
        targetDayType: mapping.dayType,
        reason: `用户想练${mapping.keywords[0]}`,
      };
    }
  }

  return null;
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
    const msgs = JSON.parse(saved);
    return msgs.map((m) => ({
      ...m,
      feedback: m.feedback ?? null,
      mode: m.mode ?? 'unknown',
    }));
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

const MUSCLE_REGION_RULES = [
  { match: /小腿/, regions: ['calves'] },
  { match: /腿后侧|腘绳/, regions: ['hamstrings', 'glutes'] },
  { match: /臀/, regions: ['glutes'] },
  { match: /股四/, regions: ['quads'] },
  { match: /腿/, regions: ['quads', 'hamstrings'] },
  { match: /斜方/, regions: ['traps'] },
  { match: /背阔|背/, regions: ['lats'] },
  { match: /肱三/, regions: ['triceps'] },
  { match: /肱二/, regions: ['biceps'] },
  { match: /肩/, regions: ['shoulder'] },
  { match: /胸/, regions: ['chest'] },
  { match: /核心|腹/, regions: ['abs'] },
];

function muscleRegions(muscleName) {
  const name = String(muscleName ?? '');
  for (const rule of MUSCLE_REGION_RULES) {
    if (rule.match.test(name)) return rule.regions;
  }
  return [];
}

function renderMuscleMap(muscles) {
  const active = new Set(muscles.flatMap((name) => muscleRegions(name)));
  const ellipse = (region, cx, cy, rx, ry) => `<ellipse class="shape${active.has(region) ? ' is-active' : ''}" data-region="${region}" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`;
  const rect = (region, x, y, w, h, r) => `<rect class="shape${active.has(region) ? ' is-active' : ''}" data-region="${region}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/>`;

  const front = [
    ellipse('shoulder', 58, 44, 7, 5),
    ellipse('shoulder', 86, 44, 7, 5),
    ellipse('chest', 63, 56, 9, 7),
    ellipse('chest', 81, 56, 9, 7),
    rect('abs', 65, 68, 14, 26, 4),
    ellipse('biceps', 45, 64, 4.5, 10),
    ellipse('biceps', 99, 64, 4.5, 10),
    ellipse('quads', 64, 138, 7, 24),
    ellipse('quads', 80, 138, 7, 24),
    ellipse('calves', 64, 192, 5.5, 15),
    ellipse('calves', 80, 192, 5.5, 15),
  ].join('');

  const back = [
    ellipse('traps', 208, 42, 9, 5),
    ellipse('lats', 199, 58, 8, 12),
    ellipse('lats', 217, 58, 8, 12),
    ellipse('triceps', 181, 64, 4.5, 10),
    ellipse('triceps', 235, 64, 4.5, 10),
    ellipse('glutes', 199, 108, 7, 7),
    ellipse('glutes', 217, 108, 7, 7),
    ellipse('hamstrings', 199, 140, 6.5, 22),
    ellipse('hamstrings', 217, 140, 6.5, 22),
    ellipse('calves', 199, 192, 5.5, 15),
    ellipse('calves', 217, 192, 5.5, 15),
  ].join('');

  const silhouette = (ox) => `
    <circle class="outline" cx="${72 + ox}" cy="20" r="12"/>
    <rect class="outline" x="${52 + ox}" y="34" width="40" height="72" rx="14"/>
    <rect class="outline" x="${56 + ox}" y="100" width="32" height="18" rx="6"/>
    <rect class="outline" x="${58 + ox}" y="114" width="12" height="96" rx="6"/>
    <rect class="outline" x="${74 + ox}" y="114" width="12" height="96" rx="6"/>
    <rect class="outline" x="${40 + ox}" y="42" width="10" height="62" rx="5"/>
    <rect class="outline" x="${94 + ox}" y="42" width="10" height="62" rx="5"/>
  `;

  return `
    <svg class="muscle-map" viewBox="0 0 280 240" role="img" aria-label="今日训练肌群示意图">
      <g>${silhouette(0)}${front}</g>
      <g>${silhouette(136)}${back}</g>
      <text x="72" y="232">正面</text>
      <text x="208" y="232">背面</text>
    </svg>
  `;
}

function renderDashboard(derived) {
  const { recovery, todaySummary, improving, stalled, fatigue } = derived.dashboard;
  const muscles = [...new Set(todaySummary.exerciseRecommendations.map((item) => item.muscle))];
  return `
    <section class="grid cols-2 hero-grid">
      <article class="card hero-card gradient">
        <div class="card-header">
          <div>
            <div class="eyebrow">今日训练计划摘要</div>
            <h3>${todaySummary.dayType} · ${todaySummary.dayStatus}</h3>
          </div>
          <button type="button" class="primary" data-jump="today">完整建议</button>
        </div>
        <p>${todaySummary.daySummary}</p>
        <div class="recommendation-list short">
          ${todaySummary.exerciseRecommendations.map((item) => `
            <div class="recommendation-row">
              <div>
                <div class="item-title">${item.name}</div>
                <div class="muted">建议 ${item.targetWeight}${typeof item.targetWeight === 'number' ? ' kg' : ''} · ${item.targetSets} 组 · ${item.targetRepsRange}</div>
              </div>
              ${item.progressHint
                ? `<span class="hint-bubble">${item.progressHint}</span>`
                : `<span class="status-pill ${badgeClass(item.actionLabel)}">${item.actionLabel}</span>`}
            </div>
          `).join('') || '<div class="muted">当前训练日暂无足够数据。</div>'}
        </div>
      </article>

      <article class="card muscle-card">
        <div class="card-header">
          <div>
            <div class="eyebrow">今日训练肌群</div>
            <h3>高亮部位为今天主要刺激</h3>
          </div>
        </div>
        ${renderMuscleMap(muscles)}
        <div class="chip-row">
          ${muscles.map((m) => `<span class="chip">${m}</span>`).join('') || '<span class="chip">暂无数据</span>'}
        </div>
      </article>
    </section>

    <section class="grid cols-3 section-gap">
      <article class="card stat-card">
        <div class="eyebrow">训练状态</div>
        <div class="big-number">${todaySummary.dayStatus}</div>
        <p>${todaySummary.daySummary}</p>
      </article>

      <article class="card stat-card">
        <div class="eyebrow">恢复情况</div>
        <div class="big-number">${recovery.label}</div>
        <p>${recovery.tip}</p>
      </article>

      <article class="card stat-card">
        <div class="eyebrow">今日关键结论</div>
        <ul class="bullet-list compact">
          ${todaySummary.exerciseRecommendations.slice(0, 3).map((item) => `<li>${item.name}：${item.actionLabel}</li>`).join('') || '<li>暂无建议</li>'}
        </ul>
      </article>
    </section>

    <section class="grid cols-2 section-gap">
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

      <article class="card">
        <div class="eyebrow">周期与饮食建议</div>
        <ul class="bullet-list">
          <li>${todaySummary.weeklyAdvice}</li>
          <li>当前饮食阶段：${state.profile.nutritionPhase}，保持蛋白质稳定即可。</li>
          <li>${state.profile.focusArea}是当前强化方向，本周可优先保证相关动作完整执行。</li>
          <li>最近平均睡眠 ${state.profile.sleepHours} 小时，建议本周至少 2 天补足到 7 小时以上。</li>
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

function renderToday(derived) {
  const plan = derived.today;
  const customization = buildTodayCustomization(plan);
  const isLegDay = plan.dayType === '腿训练日';
  const preferenceChips = isLegDay
    ? [
        { key: 'standard', label: '标准推进' },
        { key: 'glute', label: '臀腿偏翘臀' },
        { key: 'quad', label: '腿部偏股四' },
        { key: 'low_fatigue', label: '今天状态一般' },
        { key: 'quick', label: '45 分钟快练' },
      ]
    : [
        { key: 'standard', label: '标准推进' },
        { key: 'full', label: '时间充分' },
        { key: 'low_fatigue', label: '今天状态一般' },
        { key: 'quick', label: '45 分钟快练' },
        { key: 'cardio', label: '➕ 有氧' },
      ];
  const activePref = preferenceChips.some((chip) => chip.key === state.todayPreference)
    ? state.todayPreference
    : 'standard';
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
        ${preferenceChips.map((chip) => `
          <button type="button" class="chip chip-button ${activePref === chip.key ? 'chip-active' : ''}" data-pref="${chip.key}">${chip.label}</button>
        `).join('')}
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
  const session = analysis.latestSession;
  return `
    <section class="card">
      <div class="card-header">
        <div>
          <div class="eyebrow">维度一 · 按训练</div>
          <h3>${session ? `${session.dayType} · ${session.date} 执行情况` : '暂无训练记录'}</h3>
        </div>
      </div>
      <div class="recommendation-list short">
        ${(session?.items ?? []).map((item) => `
          <div class="recommendation-row">
            <div>
              <div class="item-title">${item.name}</div>
              <div class="muted">${item.category} · ${item.muscle} · ${item.weight} kg · ${item.setsText} · 目标 ${item.target}${item.rpe != null ? ` · RPE ${item.rpe}` : ''}</div>
            </div>
            <span class="status-pill ${item.hit === true ? 'success' : item.hit === false ? 'warning' : 'neutral'}">${item.hitLabel}</span>
          </div>
        `).join('') || '<div class="muted">暂无数据。</div>'}
      </div>
      <ul class="bullet-list compact section-gap-sm">
        ${analysis.diagnosis.map((item) => `<li>${item}</li>`).join('')}
      </ul>
    </section>

    <section class="card section-gap">
      <div class="card-header">
        <div>
          <div class="eyebrow">维度二 · 按肌肉</div>
          <h3>各肌群锻炼程度与达标进度</h3>
        </div>
      </div>
      <div class="volume-grid">
        ${analysis.volumeSummary.map((row) => `
          <div class="volume-card">
            <div class="item-title">${row.muscle}</div>
            <div class="big-number small">${row.volume}</div>
            <span class="status-pill ${row.level === '偏低' ? 'warning' : row.level === '偏高' ? 'neutral' : 'success'}">${row.level}</span>
            <div class="progress-track"><div class="progress-fill" style="width: ${row.progress}%"></div></div>
            <div class="muted">有效组：${row.effectiveSets} / 20 · ${row.note}</div>
          </div>
        `).join('')}
      </div>
    </section>

    <section class="recommendation-stack section-gap">
      <div class="card-header plain-header">
        <div>
          <div class="eyebrow">维度三 · 按动作</div>
          <h3>动作趋势与标准说明</h3>
        </div>
      </div>
      ${analysis.exerciseItems.map((item) => `
        <article class="card recommendation-card">
          <div class="card-header align-start">
            <div>
              <div class="eyebrow">${item.muscle} · 当前 ${item.latestWeight} kg</div>
              <h3>${item.name}</h3>
            </div>
            <div class="chip-row">
              <span class="chip">${item.trendLabel}</span>
              <span class="status-pill ${badgeClass(item.actionLabel)}">${item.actionLabel}</span>
            </div>
          </div>
          ${item.progressHint ? `<div class="hint-bubble wide">${item.progressHint}</div>` : ''}
          <div class="detail-box">
            <div>
              <span class="detail-label">动作要领</span>
              <ul class="bullet-list compact">
                ${item.standard.keyPoints.map((point) => `<li>${point}</li>`).join('')}
              </ul>
            </div>
            <div>
              <span class="detail-label">常见问题</span>
              <ul class="bullet-list compact">
                ${item.standard.commonIssues.map((issue) => `<li>${issue}</li>`).join('')}
              </ul>
            </div>
          </div>
          <div class="actions inline">
            <a class="primary ghost" href="${item.standard.tutorial}" target="_blank" rel="noreferrer">查看动作讲解</a>
          </div>
        </article>
      `).join('') || '<article class="card"><p>暂无动作分析数据。</p></article>'}
    </section>
  `;
}

function renderSync() {
  return `
    <section class="grid cols-2">
      <article class="card">
        <div class="card-header">
          <div>
            <div class="eyebrow">数据同步</div>
            <h3>训记连接与同步</h3>
          </div>
          <span class="status-pill ${state.profile.xunjiConnected ? 'success' : 'neutral'}">${state.profile.xunjiConnected ? '已连接' : '未连接'}</span>
        </div>
        <p>通过训记 API Key 同步你的训练日期、动作、组数、重量、次数和部分主观强度信息。</p>
        <label>API Key
          <input id="apiKeyInput" value="${state.profile.apiKeyMasked}" />
        </label>
        <div class="metric-list mt-12">
          <div class="metric-row"><span>导入训练天数</span><strong>14 天</strong></div>
          <div class="metric-row"><span>导入动作条目</span><strong>46 条</strong></div>
          <div class="metric-row"><span>记录时间范围</span><strong>近 6 周</strong></div>
          <div class="metric-row"><span>最近同步</span><strong>${state.profile.lastSyncText}</strong></div>
        </div>
        <div class="actions inline">
          <button type="button" class="primary" data-update-key>保存 Key</button>
          <button type="button" class="primary" data-mock-sync>立即同步</button>
        </div>
      </article>

      <article class="card">
        <div class="card-header">
          <div>
            <div class="eyebrow">同步记录</div>
            <h3>最近同步历史</h3>
          </div>
        </div>
        <ul class="bullet-list">
          ${state.syncLog.map((item) => `<li><strong>${item.time}</strong>：${item.message}</li>`).join('')}
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

  if (pref === 'full') {
    return {
      title: '时间充分',
      summary: '今天时间充足，可以在保证质量的前提下增加训练容量。',
      items: ['主项按推荐重量正常执行', '辅助动作每个增加 1 组容量', '收尾可增加核心训练 3 组'],
    };
  }

  if (pref === 'cardio') {
    return {
      title: '➕ 有氧',
      summary: '力量训练照常执行，训练后追加中低强度有氧。',
      items: ['力量部分控制在 60 分钟内完成', '训练后追加 20-30 分钟中低强度有氧', '有氧放在力量训练之后，避免影响主项表现'],
    };
  }

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
        ${state.chatMessages.map((message, index) => `
          <div class="chat-row ${message.role === 'user' ? 'chat-row-user' : 'chat-row-assistant'}">
            <div class="chat-bubble ${message.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-assistant'}">${message.content}</div>
            ${message.role === 'assistant' ? `
              <div class="chat-feedback">
                ${message.feedback ? `
                  <span class="chat-feedback-done">${message.feedback === 'up' ? '👍 已点赞' : '已反馈，感谢'}</span>
                ` : `
                  <button type="button" class="chat-thumb" data-chat-feedback="up" data-chat-index="${index}" title="回答有帮助">👍</button>
                  <button type="button" class="chat-thumb" data-chat-feedback="down" data-chat-index="${index}" title="回答没帮助">👎</button>
                `}
                <button type="button" class="chat-report" data-chat-report="${index}" title="问题没有解决，上报给开发团队">上报问题</button>
              </div>
            ` : ''}
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
    const response = await fetch(`${API_BASE}/api/chat`, {
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

    // ── 处理 Function Call（AI 要求修改计划）──
    if (data.functionCall) {
      let instruction;
      try {
        instruction = JSON.parse(data.functionCall.arguments);
      } catch {
        instruction = null;
      }

      if (instruction && instruction.action) {
        // 备份当前 workouts 用于 undo
        const workoutsBackup = JSON.stringify(state.workouts);
        localStorage.setItem('fitness-workouts-backup', workoutsBackup);

        const { result, nextWorkouts } = modifyPlan(state.workouts, instruction);

        if (result.success && Array.isArray(nextWorkouts)) {
          state.workouts = nextWorkouts;
          saveProfile();

          // 生成修改说明回复
          let replyText = `✅ 已帮你调整计划：\n\n${result.changes.join('\n')}`;
          if (result.warnings.length > 0) {
            replyText += `\n\n⚠️ 注意：${result.warnings.join('\n')}`;
          }
          if (result.newWorkout && result.newWorkout.exercises.length > 0) {
            replyText += `\n\n📋 新的训练安排：\n${result.newWorkout.exercises.map((e) => `• ${e.name}：${e.target}`).join('\n')}`;
          }
          replyText += `\n\n（如果不满意，可以在设置中恢复之前的计划）`;

          state.chatMessages.push({
            role: 'assistant',
            content: replyText,
            mode: data.mode || 'live',
            feedback: null,
          });
        } else {
          state.chatMessages.push({
            role: 'assistant',
            content: `❌ 计划调整失败：${result.warnings.join('\n') || '未知错误'}`,
            mode: data.mode || 'live',
            feedback: null,
          });
        }
      } else {
        state.chatMessages.push({
          role: 'assistant',
          content: '我理解了你的需求，但暂时无法执行这个计划调整。请用更明确的方式描述，比如"把今天的训练改成手臂"。',
          mode: data.mode || 'live',
          feedback: null,
        });
      }
    } else {
      // ── 前端兜底：LLM 没调用 function，但用户明显想改计划 ──
      const fallbackInstruction = detectPlanChangeIntent(content);
      if (fallbackInstruction) {
        const workoutsBackup = JSON.stringify(state.workouts);
        localStorage.setItem('fitness-workouts-backup', workoutsBackup);

        const { result, nextWorkouts } = modifyPlan(state.workouts, fallbackInstruction);

        if (result.success && Array.isArray(nextWorkouts)) {
          state.workouts = nextWorkouts;
          saveProfile();
          let replyText = `✅ 已帮你调整计划：\n\n${result.changes.join('\n')}`;
          if (result.warnings.length > 0) {
            replyText += `\n\n⚠️ 注意：${result.warnings.join('\n')}`;
          }
          if (result.newWorkout && result.newWorkout.exercises.length > 0) {
            replyText += `\n\n📋 新的训练安排：\n${result.newWorkout.exercises.map((e) => `• ${e.name}：${e.target}`).join('\n')}`;
          }
          replyText += `\n\n（AI 没有自动识别到修改指令，前端已兜底处理）`;

          state.chatMessages.push({
            role: 'assistant',
            content: replyText,
            mode: 'fallback',
            feedback: null,
          });
        } else {
          state.chatMessages.push({
            role: 'assistant',
            content: `❌ 计划调整失败：${result.warnings.join('\n') || '未知错误'}`,
            mode: 'fallback',
            feedback: null,
          });
        }
      } else {
        // 普通文本回复
        state.chatMessages.push({
          role: 'assistant',
          content: data.reply || '我刚刚没组织好语言，你可以再问我一次。',
          mode: data.mode || 'unknown',
          feedback: null,
        });
      }
    }
  } catch {
    state.chatMessages.push({
      role: 'assistant',
      content: '当前暂时无法连接教练服务。请先确认后端是否已通过 npm run dev 启动，然后再试一次。',
      mode: 'error',
      feedback: null,
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
    return;
  }

  if (button.dataset.chatFeedback) {
    const index = Number(button.dataset.chatIndex);
    const msg = state.chatMessages[index];
    if (!msg || msg.role !== 'assistant') return;

    const rating = button.dataset.chatFeedback;
    msg.feedback = rating;
    saveProfile();
    render();

    const userMsg = state.chatMessages[index - 1];
    fetch(`${API_BASE}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userMessage: userMsg?.content || '',
        aiReply: msg.content,
        rating,
        profile: state.profile,
        workouts: state.workouts,
        mode: msg.mode || 'unknown',
      }),
    }).catch(() => {});

    return;
  }

  if (button.dataset.chatReport != null) {
    const index = Number(button.dataset.chatReport);
    const msg = state.chatMessages[index];
    const userMsg = state.chatMessages[index - 1];
    if (!msg || msg.role !== 'assistant') return;

    fetch(`${API_BASE}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userMessage: userMsg?.content || '',
        aiReply: msg.content,
        rating: 'report',
        reason: '用户主动上报：问题未解决',
        profile: state.profile,
        workouts: state.workouts,
        mode: msg.mode || 'unknown',
      }),
    })
      .then(() => renderToast('问题已上报，我们会持续优化'))
      .catch(() => renderToast('上报失败，请稍后重试'));

    return;
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
  let derived;
  try {
    derived = computeState();
    renderNav();
    topbarTitle.textContent = navItems.find((item) => item.key === state.currentPage)?.label ?? '健身进阶推荐器';
    root.innerHTML = renderPage(derived);
  } catch (err) {
    console.error('[render] error:', err);
    root.innerHTML = `<section class="card"><p style="color:#f87171">渲染出错：${err.message}</p></section>`;
  }
  renderChat();
}

render();
