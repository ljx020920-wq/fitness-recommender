import { userProfile, workouts, profileOptions } from './data.js';
import { buildDashboard, buildWorkoutRecommendations, buildAnalysis } from './logic.js';
import { createPlanEntry, modifyPlan } from './plan-modifier.js?v=4';

const isStandaloneMode = Boolean(window.__FITNESS_STANDALONE__) || window.location.protocol === 'file:' || window.location.pathname.includes('fitness_recommender_standalone.html');

// API base URL：本地开发走 localhost:3001，Vercel 部署走相对路径
const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';

const initialProfile = loadProfile();
const initialTodaySession = loadTodaySession();
const initialProfileSetupComplete = loadProfileSetupComplete();

const state = {
  currentPage: initialProfileSetupComplete ? 'dashboard' : 'onboarding',
  profile: initialProfile,
  workoutLogs: loadWorkoutLogs(),
  trainingPlans: loadTrainingPlans(initialProfile),
  todayPreference: initialTodaySession.preference,
  todaySessionConfirmed: initialTodaySession.confirmed,
  todaySessionDate: initialTodaySession.date,
  profileSetupComplete: initialProfileSetupComplete,
  onboardingStep: 1,
  onboardingOriginalProfile: null,
  guideStep: loadGuideComplete() ? null : loadGuideStep(),
  analysisMuscleFilter: 'all',
  weekOffset: 0,
  selectedDayDate: null,
  syncLog: loadSyncLog(),
  chatOpen: false,
  chatLoading: false,
  chatInput: '',
  chatMessages: loadChatMessages(),
};

function defaultProfile() {
  return JSON.parse(JSON.stringify(userProfile));
}

function loadProfileSetupComplete() {
  try {
    const explicit = localStorage.getItem('fitness-profile-complete-v1');
    if (explicit != null) return explicit === 'true';
    return Boolean(localStorage.getItem('fitness-profile-demo'));
  } catch {
    return false;
  }
}

function loadGuideComplete() {
  try {
    return localStorage.getItem('fitness-guide-complete-v1') === 'true';
  } catch {
    return false;
  }
}

function loadGuideStep() {
  try {
    const saved = Number(localStorage.getItem('fitness-guide-step-v1'));
    return Number.isInteger(saved) && saved >= 0 && saved <= 2 ? saved : 0;
  } catch {
    return 0;
  }
}

function updateGuideStep(step) {
  state.guideStep = step;
  try { localStorage.setItem('fitness-guide-step-v1', String(step)); } catch {}
}

function completeGuide() {
  state.guideStep = null;
  try {
    localStorage.setItem('fitness-guide-complete-v1', 'true');
    localStorage.removeItem('fitness-guide-step-v1');
  } catch {}
}

function loadTodaySession() {
  const fallback = { date: localDateKey(), preference: 'standard', confirmed: false };
  try {
    const saved = JSON.parse(localStorage.getItem('fitness-today-session-v1') || 'null');
    if (!saved || saved.date !== fallback.date) return fallback;
    return {
      date: fallback.date,
      preference: saved.preference || 'standard',
      confirmed: Boolean(saved.confirmed),
    };
  } catch {
    return fallback;
  }
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

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(dateKey, amount) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return localDateKey(date);
}

function startOfWeek(dateKey = localDateKey()) {
  const date = new Date(`${dateKey}T12:00:00`);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return localDateKey(date);
}

function formatMonthDay(dateKey) {
  const date = new Date(`${dateKey}T12:00:00`);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function hasCompletedSets(workout) {
  return (workout.exercises ?? []).some((exercise) =>
    Array.isArray(exercise.sets)
      && exercise.sets.some((setItem) => Array.isArray(setItem) && Number(setItem[0]) > 0 && Number(setItem[1]) > 0),
  );
}

function loadWorkoutLogs() {
  try {
    const saved = localStorage.getItem('fitness-workout-logs-v1');
    if (saved) return normalizeWorkouts(JSON.parse(saved), 'completed');
    const legacy = localStorage.getItem('fitness-workouts-demo');
    const source = legacy ? JSON.parse(legacy) : JSON.parse(JSON.stringify(workouts));
    return normalizeWorkouts(source.filter(hasCompletedSets), 'completed');
  } catch {
    return normalizeWorkouts(JSON.parse(JSON.stringify(workouts)), 'completed');
  }
}

function normalizeWorkouts(sourceWorkouts, kind = 'completed') {
  return (sourceWorkouts ?? []).map((workout, workoutIndex) => ({
    ...workout,
    id: workout.id ?? `w${workoutIndex + 1}`,
    kind: kind === 'completed' ? 'log' : 'plan',
    status: kind === 'completed' ? 'completed' : (workout.status ?? 'planned'),
    completedAt: kind === 'completed' ? (workout.completedAt ?? `${workout.date}T20:00:00`) : null,
    exercises: (workout.exercises ?? []).map((exercise, exerciseIndex) => ({
      ...exercise,
      id: exercise.id ?? `e${workoutIndex + 1}-${exerciseIndex + 1}`,
      completedAt: kind === 'completed' ? (exercise.completedAt ?? workout.completedAt ?? `${workout.date}T20:00:00`) : null,
    })),
  }));
}

function createDefaultTrainingPlans(profile) {
  const today = localDateKey();
  const cycle = ['推训练日', '拉训练日', '腿训练日', '休息日'];
  const startType = profile.currentDayType && profile.currentDayType !== '休息日' ? profile.currentDayType : '推训练日';
  const startIndex = Math.max(0, cycle.indexOf(startType));
  return Array.from({ length: 7 }, (_, index) => createPlanEntry(addDays(today, index), cycle[(startIndex + index) % cycle.length]));
}

function loadTrainingPlans(profile) {
  try {
    const saved = localStorage.getItem('fitness-training-plans-v1');
    if (saved) return normalizeWorkouts(JSON.parse(saved), 'planned');
    const legacy = localStorage.getItem('fitness-workouts-demo');
    if (legacy) {
      const migrated = JSON.parse(legacy).filter((workout) => !hasCompletedSets(workout));
      if (migrated.length) return normalizeWorkouts(migrated, 'planned');
    }
    return createDefaultTrainingPlans(profile);
  } catch {
    return createDefaultTrainingPlans(profile);
  }
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
  const today = localDateKey();

  // 关键词映射到训练日类型
  const muscleMap = [
    { keywords: ['手臂', '二头', '三头', '肱二', '肱三'], dayType: '手臂训练日' },
    { keywords: ['臀', '翘臀', '屁股', 'glute'], dayType: '腿训练日' },
    { keywords: ['腿', '深蹲', '硬拉', '股四'], dayType: '腿训练日' },
    { keywords: ['胸', '卧推', '推胸', '胸肌'], dayType: '胸训练日' },
    { keywords: ['背', '引体', '划船', '背阔'], dayType: '背训练日' },
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
    localStorage.setItem('fitness-profile-complete-v1', String(state.profileSetupComplete));
    localStorage.setItem('fitness-today-session-v1', JSON.stringify({
      date: state.todaySessionDate,
      preference: state.todayPreference,
      confirmed: state.todaySessionConfirmed,
    }));
    localStorage.setItem('fitness-workout-logs-v1', JSON.stringify(state.workoutLogs));
    localStorage.setItem('fitness-training-plans-v1', JSON.stringify(state.trainingPlans));
    localStorage.setItem('fitness-workouts-demo', JSON.stringify(state.workoutLogs));
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
  const today = localDateKey();
  if (state.todaySessionDate !== today) {
    state.todaySessionDate = today;
    state.todayPreference = 'standard';
    state.todaySessionConfirmed = false;
  }
  const todayPlan = state.trainingPlans.find((plan) => plan.date === localDateKey())
    ?? state.trainingPlans.find((plan) => plan.status === 'planned')
    ?? null;
  if (todayPlan && state.profile.currentDayType !== todayPlan.dayType) {
    state.profile.currentDayType = todayPlan.dayType;
  }
  const allowedPreferences = todayPlan?.dayType === '腿训练日'
    ? ['standard', 'glute', 'quad', 'low_fatigue', 'quick']
    : ['standard', 'full', 'low_fatigue', 'quick', 'cardio'];
  if (!allowedPreferences.includes(state.todayPreference)) {
    state.todayPreference = 'standard';
    state.todaySessionConfirmed = false;
  }
  return {
    todayPlan,
    dashboard: buildDashboard(state.profile, state.workoutLogs, todayPlan, state.todayPreference),
    today: buildWorkoutRecommendations(state.profile, state.workoutLogs, todayPlan?.dayType ?? state.profile.currentDayType, state.todayPreference, todayPlan),
    analysis: buildAnalysis(state.profile, state.workoutLogs),
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
  { key: 'today', label: '今日建议' },
  { key: 'record', label: '记录训练' },
  { key: 'analysis', label: '训练分析' },
  { key: 'sync', label: '数据同步' },
  { key: 'settings', label: '个人资料与设置' },
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
  if (!state.profileSetupComplete) {
    nav.innerHTML = '<button class="nav-item active" type="button" disabled>完成首次建档</button>';
    return;
  }
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
      const nextPage = button.dataset.page;
      if (state.guideStep != null && nextPage === 'today' && state.guideStep < 1) updateGuideStep(1);
      if (state.guideStep != null && nextPage === 'record' && state.guideStep < 2) updateGuideStep(2);
      state.currentPage = nextPage;
      state.selectedDayDate = null;
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
  { match: /小腿/, regions: ['legs'] },
  { match: /腿后侧|腘绳/, regions: ['legs', 'glutes'] },
  { match: /臀/, regions: ['glutes'] },
  { match: /股四/, regions: ['legs'] },
  { match: /腿/, regions: ['legs'] },
  { match: /斜方/, regions: ['back'] },
  { match: /背阔|背/, regions: ['back'] },
  { match: /肱三/, regions: ['arms'] },
  { match: /肱二/, regions: ['arms'] },
  { match: /肩/, regions: ['shoulder'] },
  { match: /胸/, regions: ['chest'] },
  { match: /核心|腹/, regions: ['core'] },
];

function muscleRegions(muscleName) {
  const name = String(muscleName ?? '');
  for (const rule of MUSCLE_REGION_RULES) {
    if (rule.match.test(name)) return rule.regions;
  }
  return [];
}

function renderMuscleMap(muscles, key = 'default') {
  return `
    <div class="muscle-map-host" data-map-key="${key}" data-muscles="${encodeURIComponent(JSON.stringify(muscles))}">
      <div class="body-view"><span>FRONT · 正面</span><div class="body-chart" data-body-front></div></div>
      <div class="body-view"><span>BACK · 背面</span><div class="body-chart" data-body-back></div></div>
    </div>
  `;
}

let mountedMuscleCharts = [];

function muscleGroupFromSvgId(id) {
  if (id.includes('chest')) return 'chest';
  if (/(lats|traps|rhomboid|lower-back|spine)/.test(id)) return 'back';
  if (/(shoulder|deltoid)/.test(id)) return 'shoulder';
  if (/(biceps|triceps|forearm|brachialis)/.test(id)) return 'arms';
  if (/(abs|oblique|serratus)/.test(id)) return 'core';
  if (id.includes('glute')) return 'glutes';
  if (/(quad|adductor|hamstring|femoris|calf|gastro|soleus|tibialis|knee|hip-flexor)/.test(id)) return 'legs';
  return 'other';
}

function mountMuscleMaps() {
  mountedMuscleCharts.forEach((chart) => chart.destroy?.());
  mountedMuscleCharts = [];
  const library = window.BodyMuscles;
  if (!library) return;

  const palette = ['#26332e', '#314238', '#3c5541', '#486b47', '#58844c', '#69a550', '#7bc452', '#8edc50', '#a0ed4d', '#adf64b', '#b7ff4a'];
  if (library.INTENSITY_COLORS) palette.forEach((color, index) => { library.INTENSITY_COLORS[index] = color; });

  document.querySelectorAll('.muscle-map-host').forEach((host) => {
    const muscleNames = JSON.parse(decodeURIComponent(host.dataset.muscles || '%5B%5D'));
    const activeGroups = new Set(muscleNames.flatMap((name) => muscleRegions(name)));
    const definitions = [...library.FRONT_MUSCLES, ...library.BACK_MUSCLES];
    const bodyState = Object.fromEntries(definitions.map((definition) => {
      const group = muscleGroupFromSvgId(definition.id);
      return [definition.id, { intensity: activeGroups.has(group) ? 10 : 0, selected: false }];
    }));
    const selectMuscle = (id) => {
      const group = muscleGroupFromSvgId(id);
      const button = document.querySelector(`[data-analysis-filter="${group}"]`);
      if (button) button.click();
    };
    mountedMuscleCharts.push(
      new library.BodyChart(host.querySelector('[data-body-front]'), { view: library.ViewSide.FRONT, bodyState, ariaLabel: '人体正面训练肌群', onMuscleClick: selectMuscle }),
      new library.BodyChart(host.querySelector('[data-body-back]'), { view: library.ViewSide.BACK, bodyState, ariaLabel: '人体背面训练肌群', onMuscleClick: selectMuscle }),
    );
  });
}

function renderWeekStrip() {
  const today = localDateKey();
  const weekStart = addDays(startOfWeek(today), state.weekOffset * 7);
  const weekDates = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const weekEnd = weekDates[6];
  return `
    <div class="week-strip-header">
      <div>
        <div class="eyebrow">训练日历 · 最近 30 天可回看</div>
        <strong>${formatMonthDay(weekStart)} — ${formatMonthDay(weekEnd)}</strong>
      </div>
      <div class="week-nav-actions">
        <button type="button" class="calendar-button" data-week-shift="-1" ${state.weekOffset <= -4 ? 'disabled' : ''}>← 上一周</button>
        ${state.weekOffset !== 0 ? '<button type="button" class="calendar-button is-today-shortcut" data-week-reset>回到本周</button>' : ''}
        <button type="button" class="calendar-button" data-week-shift="1" ${state.weekOffset >= 2 ? 'disabled' : ''}>下一周 →</button>
      </div>
    </div>
    <section class="week-strip" aria-label="一周训练计划">
      ${weekDates.map((dateKey) => {
        const plan = state.trainingPlans.find((item) => item.date === dateKey);
        const log = state.workoutLogs.slice().sort((a, b) => new Date(b.completedAt ?? b.date) - new Date(a.completedAt ?? a.date)).find((item) => item.date === dateKey);
        const date = new Date(`${dateKey}T12:00:00`);
        const dayLabel = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()];
        const dayType = log?.dayType ?? plan?.dayType ?? '无安排';
        const isPast = dateKey < today;
        const status = log
          ? '已完成'
          : plan?.status === 'rest' ? '主动恢复'
            : isPast ? '未记录'
              : plan ? '计划中' : '无安排';
        return `<button type="button" class="week-day ${dateKey === today ? 'is-today' : ''} ${log ? 'is-completed' : ''} ${isPast ? 'is-past' : 'is-future'}" data-plan-date="${dateKey}">
          <span>${dateKey === today ? '今天' : dayLabel} · ${date.getDate()}日</span><strong>${dayType.replace('训练日', '')}</strong><small>${status}</small>
        </button>`;
      }).join('')}
    </section>
  `;
}

function renderDayDrawer() {
  if (!state.selectedDayDate) return '';
  const dateKey = state.selectedDayDate;
  const today = localDateKey();
  const date = new Date(`${dateKey}T12:00:00`);
  const dayLabel = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()];
  const plan = state.trainingPlans.find((item) => item.date === dateKey);
  const completedLogs = state.workoutLogs.filter((item) => item.date === dateKey);
  const log = completedLogs.slice().sort((a, b) => new Date(b.completedAt ?? b.date) - new Date(a.completedAt ?? a.date))[0];
  const exercises = log?.exercises ?? plan?.exercises ?? [];
  const status = log ? '已完成' : plan?.status === 'rest' ? '主动恢复' : dateKey < today ? '未记录' : '计划中';
  const totalVolume = (log?.exercises ?? []).reduce((total, exercise) => total + (exercise.sets ?? []).reduce((sum, setItem) => sum + Number(setItem[0] ?? 0) * Number(setItem[1] ?? 0), 0), 0);

  return `
    <div class="day-drawer-backdrop" data-close-day></div>
    <aside class="day-drawer" role="dialog" aria-modal="true" aria-label="${dateKey} 训练详情">
      <header class="day-drawer-header">
        <div>
          <div class="eyebrow">训练详情 · ${dayLabel}</div>
          <h3>${formatMonthDay(dateKey)} · ${log?.dayType ?? plan?.dayType ?? '无训练安排'}</h3>
        </div>
        <button type="button" class="drawer-close" data-close-day aria-label="关闭训练详情">×</button>
      </header>
      <div class="drawer-summary">
        <span class="status-pill ${log ? 'success' : status === '未记录' ? 'warning' : 'neutral'}">${status}</span>
        ${log ? `<span>实际动作 ${exercises.length} 个</span><span>总训练容量 ${Math.round(totalVolume).toLocaleString()} kg</span>` : '<span>不会改变今天的训练建议</span>'}
      </div>
      <div class="day-drawer-content">
        ${log ? `
          <div class="drawer-section-title">实际完成记录</div>
          ${exercises.map((exercise, index) => {
            const sets = exercise.sets ?? [];
            return `<article class="history-exercise">
              <div class="history-exercise-head"><div><span>动作 ${index + 1} · ${exercise.muscle ?? '未分类'}</span><strong>${exercise.name}</strong></div>${exercise.rpe != null ? `<b>RPE ${exercise.rpe}</b>` : ''}</div>
              <div class="history-set-list">${sets.map((setItem, setIndex) => `<span>${setIndex + 1}组 · ${setItem[0]}kg × ${setItem[1]}</span>`).join('')}</div>
            </article>`;
          }).join('')}
        ` : plan ? `
          <div class="drawer-section-title">${dateKey < today ? '当天计划（没有完成记录）' : '训练计划'}</div>
          ${exercises.map((exercise, index) => `<article class="history-exercise compact-history">
            <div class="history-exercise-head"><div><span>动作 ${index + 1} · ${exercise.muscle ?? '未分类'}</span><strong>${exercise.name}</strong></div><b>${exercise.target ?? '待安排'}</b></div>
          </article>`).join('') || '<div class="drawer-empty">休息日无需记录训练动作。</div>'}
        ` : '<div class="drawer-empty"><strong>这一天没有训练计划或完成记录</strong><p>历史查看不会修改今天的计划，你可以直接关闭返回首页。</p></div>'}
      </div>
      <footer class="day-drawer-footer">
        <span>仅查看历史，不影响今日建议</span>
        <button type="button" class="primary ghost" data-close-day>关闭</button>
      </footer>
    </aside>
  `;
}

function renderContextualGuide(page) {
  if (state.guideStep == null) return '';
  const guides = [
    {
      page: 'dashboard',
      title: '先确认今天的训练方案',
      text: '不要先浏览所有功能。第一步只需要确认今天练什么，以及是否要按时间和状态微调。',
      action: '<button type="button" class="primary" data-guide-page="today">去确认今日计划</button>',
    },
    {
      page: 'today',
      title: '根据真实状态选一个模式',
      text: '点击下方“标准推进、状态一般、45分钟快练”等选项，动作清单会立即变化；确认后再开始。',
      action: '<span class="guide-pointer">↓ 就在下方选择</span>',
    },
    {
      page: 'record',
      title: '训练后填写实际完成情况',
      text: '把真实重量、组数、次数和 RPE 填完并提交。保存成功后会直接进入训练复盘。',
      action: '<span class="guide-pointer">↓ 完成后点击“完成并保存训练”</span>',
    },
  ];
  const current = guides[state.guideStep];
  if (!current || current.page !== page) return '';
  return `
    <section class="guide-card contextual-guide">
      <span class="guide-step-number">${state.guideStep + 1}</span>
      <div class="guide-copy">
        <div class="eyebrow">跟着做 · 第 ${state.guideStep + 1}/3 步</div>
        <h3>${current.title}</h3>
        <p>${current.text}</p>
      </div>
      <div class="guide-actions">
        ${current.action}
        <button type="button" class="guide-skip" data-guide-skip>跳过引导</button>
      </div>
    </section>
  `;
}

function renderDashboard(derived) {
  const { recovery, todaySummary, improving, stalled, fatigue } = derived.dashboard;
  const muscles = [...new Set(todaySummary.exerciseRecommendations.map((item) => item.muscle))];
  const activeCustomization = buildTodayCustomization(todaySummary);
  const isCompleted = derived.todayPlan?.status === 'completed';
  const primaryAction = isCompleted
    ? { page: 'analysis', label: '查看今日复盘' }
    : state.todaySessionConfirmed
      ? { page: 'record', label: '开始训练' }
      : { page: 'today', label: '确认今日计划' };
  return `
    ${renderWeekStrip()}
    ${renderContextualGuide('dashboard')}
    <section class="grid cols-2 hero-grid">
      <article class="card hero-card gradient">
        <div class="card-header">
          <div>
            <div class="eyebrow">今日训练计划摘要</div>
            <h3>${todaySummary.dayType} · ${todaySummary.dayStatus}</h3>
          </div>
          <div class="actions inline compact-actions"><button type="button" class="primary ghost" data-jump="today">查看建议</button><button type="button" class="primary" data-jump="${primaryAction.page}">${primaryAction.label}</button></div>
        </div>
        <p>${todaySummary.daySummary}</p>
        <div class="chip-row dashboard-session-state">
          <span class="chip">本次模式：${activeCustomization.title}</span>
          <span class="status-pill ${state.todaySessionConfirmed ? 'success' : 'neutral'}">${state.todaySessionConfirmed ? '今日方案已确认' : '等待确认今日方案'}</span>
        </div>
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
            <h3>今天主要刺激区域</h3>
          </div>
        </div>
        ${renderMuscleMap(muscles, 'dashboard')}
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

function renderOnboarding() {
  const step = state.onboardingStep;
  const stepMeta = [
    { title: '先认识你的身体', subtitle: '这些基础信息用于估算训练负荷与恢复需求。' },
    { title: '明确训练方向', subtitle: '告诉系统你想取得什么结果，以及每周能投入多少时间。' },
    { title: '补充恢复状态', subtitle: '睡眠、压力和旧伤会直接影响每天的训练建议。' },
  ][step - 1];
  const fields = step === 1
    ? `
      ${selectField({ name: 'gender', label: '性别', value: state.profile.gender, options: profileOptions.genders })}
      ${numericField({ name: 'age', label: '年龄', value: state.profile.age, min: 16, max: 80 })}
      ${numericField({ name: 'height', label: '身高（cm）', value: state.profile.height, min: 130, max: 230 })}
      ${numericField({ name: 'weight', label: '体重（kg）', value: state.profile.weight, min: 30, max: 200, step: '0.1' })}
      ${numericField({ name: 'bodyFat', label: '体脂率（%）', value: state.profile.bodyFat, min: 3, max: 60, step: '0.1' })}
      ${numericField({ name: 'experienceMonths', label: '训练经验（月）', value: state.profile.experienceMonths, min: 0, max: 600 })}
    `
    : step === 2
      ? `
        ${selectField({ name: 'goal', label: '主目标', value: state.profile.goal, options: profileOptions.goals })}
        <label>重点强化部位<input name="focusArea" value="${state.profile.focusArea}" /></label>
        ${selectField({ name: 'split', label: '训练分化', value: state.profile.split, options: profileOptions.splits })}
        ${numericField({ name: 'daysPerWeek', label: '每周训练天数', value: state.profile.daysPerWeek, min: 1, max: 7 })}
      `
      : `
        ${numericField({ name: 'sleepHours', label: '平均睡眠（小时）', value: state.profile.sleepHours, min: 0, max: 24, step: '0.1' })}
        ${selectField({ name: 'stressLevel', label: '压力等级', value: state.profile.stressLevel, options: profileOptions.stressLevels })}
        ${selectField({ name: 'nutritionPhase', label: '饮食阶段', value: state.profile.nutritionPhase, options: profileOptions.nutritionPhases })}
        <label>疼痛或旧伤<input name="painStatus" value="${state.profile.painStatus ?? '无'}" /></label>
      `;

  return `
    <section class="onboarding-shell">
      <article class="card onboarding-card">
        <div class="onboarding-progress" aria-label="建档进度">
          ${[1, 2, 3].map((item) => `<span class="${item <= step ? 'active' : ''}"></span>`).join('')}
        </div>
        <div class="eyebrow">首次建档 · 第 ${step}/3 步</div>
        <h2>${stepMeta.title}</h2>
        <p class="muted">${stepMeta.subtitle}</p>
        <form id="onboardingForm" class="form-grid cols-2 onboarding-form">${fields}</form>
        <div class="onboarding-actions">
          <div>
            ${state.profileSetupComplete ? '<button type="button" class="primary ghost" data-onboarding-cancel>取消重新评估</button>' : ''}
          </div>
          <div class="actions inline">
            ${step > 1 ? '<button type="button" class="primary ghost" data-onboarding-back>上一步</button>' : ''}
            <button type="button" class="primary" ${step === 3 ? 'data-onboarding-finish' : 'data-onboarding-next'}>${step === 3 ? '完成并生成计划' : '下一步'}</button>
          </div>
        </div>
      </article>
      <aside class="onboarding-side card">
        <div class="eyebrow">完成后你会得到</div>
        <h3>一条清晰的训练路径</h3>
        <ol class="journey-list">
          <li><span>1</span><div><strong>确认今日计划</strong><small>根据时间和状态微调一次训练</small></div></li>
          <li><span>2</span><div><strong>开始并记录</strong><small>填写真实重量、次数和 RPE</small></div></li>
          <li><span>3</span><div><strong>查看复盘</strong><small>让下一次建议基于真实完成情况</small></div></li>
        </ol>
      </aside>
    </section>
  `;
}

function renderToday(derived) {
  const plan = derived.today;
  const todayPlan = derived.todayPlan;
  const customization = buildTodayCustomization(plan);
  const standardPlan = buildWorkoutRecommendations(
    state.profile,
    state.workoutLogs,
    todayPlan?.dayType ?? state.profile.currentDayType,
    'standard',
    todayPlan,
  );
  const standardNames = standardPlan.exerciseRecommendations.map((item) => item.name);
  const currentNames = plan.exerciseRecommendations.map((item) => item.name);
  const removedNames = standardNames.filter((name) => !currentNames.includes(name));
  const estimatedMinutes = {
    standard: '约 60 分钟',
    full: '约 75 分钟',
    low_fatigue: '约 45-55 分钟',
    quick: '约 45 分钟',
    cardio: '约 80-90 分钟',
    glute: '约 65 分钟',
    quad: '约 60 分钟',
  }[state.todayPreference] ?? '约 60 分钟';
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
      <div class="card-header align-start">
        <div><div class="eyebrow">今日训练建议 · ${todayPlan?.status === 'completed' ? '已完成' : '计划中'}</div><h3>${plan.dayType} · ${plan.dayStatus}</h3><p>${plan.daySummary}</p></div>
        ${plan.dayType !== '休息日' && state.todaySessionConfirmed ? '<button type="button" class="primary" data-jump="record">开始记录训练</button>' : ''}
      </div>
      <div class="chip-row">
        <span class="chip">最近训练：${plan.latestDate ?? '暂无'}</span>
        <span class="chip">恢复：${plan.recovery.label}</span>
        <span class="chip data-chip">建议只来自完成记录</span>
      </div>
    </section>

    ${renderContextualGuide('today')}

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
      <div class="session-plan-summary ${state.todaySessionConfirmed ? 'is-confirmed' : ''}">
        <div class="session-plan-main">
          <span class="status-pill ${state.todaySessionConfirmed ? 'success' : 'neutral'}">${state.todaySessionConfirmed ? '已应用到今天' : '待确认'}</span>
          <div>
            <div class="eyebrow">本次训练方案</div>
            <h4>${customization.title} · ${estimatedMinutes}</h4>
            <p>${standardNames.length} 个动作 → ${currentNames.length} 个动作${state.todayPreference === 'cardio' ? '，并追加训练后有氧' : ''}</p>
          </div>
        </div>
        <button type="button" class="primary" data-start-session>按此方案开始</button>
        ${removedNames.length ? `<div class="session-plan-note"><strong>本次省略：</strong>${removedNames.join('、')}</div>` : ''}
        ${state.todayPreference === 'cardio' ? '<div class="session-plan-note"><strong>新增安排：</strong>力量训练后完成 20-30 分钟中低强度有氧。</div>' : ''}
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

function suggestedReps(target) {
  const match = String(target ?? '').match(/×\s*(\d+)/);
  return match ? Number(match[1]) : 8;
}

function renderRecord(derived) {
  const plan = derived.today;
  const todayPlan = derived.todayPlan;
  const existingLog = state.workoutLogs.find((workout) => workout.date === localDateKey() && workout.dayType === plan.dayType);

  if (plan.dayType === '休息日') {
    return `
      <section class="card empty-state">
        <div class="eyebrow">今日计划 · 主动恢复</div>
        <h3>今天没有力量训练需要记录</h3>
        <p>如果临时决定训练，可以先在个人设置或 AI 对话中修改今天的计划。</p>
        <button type="button" class="primary ghost" data-jump="settings">修改今日计划</button>
      </section>
    `;
  }

  return `
    <section class="record-hero">
      <div>
        <div class="eyebrow">实际完成记录 · ${localDateKey()}</div>
        <h3>${plan.dayType}</h3>
        <p>当前采用“${buildTodayCustomization(plan).title}”。只有提交这里的数据，才会进入训练分析与下次推荐。</p>
      </div>
      <span class="status-pill ${existingLog ? 'success' : 'neutral'}">${existingLog ? '今天已有完成记录' : '尚未完成'}</span>
    </section>

    ${renderContextualGuide('record')}

    ${state.todayPreference === 'cardio' ? `
      <section class="card cardio-addon-card section-gap">
        <div><div class="eyebrow">本次附加安排</div><h3>力量训练后有氧</h3></div>
        <div><strong>20-30 分钟</strong><p class="muted">中低强度，保持可以短句交流的节奏；暂不计入力量训练分析。</p></div>
      </section>
    ` : ''}

    <form id="workoutRecordForm" class="record-stack" data-plan-id="${todayPlan?.id ?? ''}">
      ${plan.exerciseRecommendations.map((item, index) => {
        const weight = typeof item.targetWeight === 'number' ? item.targetWeight : '';
        return `
          <article class="card record-card">
            <div class="record-title-row">
              <div>
                <div class="eyebrow">动作 ${index + 1} · ${item.category} · ${item.muscle}</div>
                <h3>${item.name}</h3>
                <input type="hidden" name="exercise_${index}_id" value="${item.id ?? `record-${index}`}" />
                <input type="hidden" name="exercise_${index}_name" value="${item.name}" />
                <input type="hidden" name="exercise_${index}_category" value="${item.category}" />
                <input type="hidden" name="exercise_${index}_muscle" value="${item.muscle}" />
                <input type="hidden" name="exercise_${index}_target" value="${String(item.targetRepsRange).replace(/\s/g, '')}" />
              </div>
              <span class="record-target">建议 ${item.targetWeight}${typeof item.targetWeight === 'number' ? ' kg' : ''} · ${item.targetSets} 组 · ${item.targetRepsRange}</span>
            </div>
            <div class="record-fields">
              ${numericField({ name: `exercise_${index}_weight`, label: '实际重量（kg）', value: weight, min: 0, max: 500, step: '0.5' })}
              ${numericField({ name: `exercise_${index}_sets`, label: '完成组数', value: item.targetSets, min: 1, max: 12 })}
              ${numericField({ name: `exercise_${index}_reps`, label: '每组次数', value: suggestedReps(item.targetRepsRange), min: 1, max: 100 })}
              ${numericField({ name: `exercise_${index}_rpe`, label: 'RPE（1-10）', value: item.averageRpe == null ? 8 : Math.round(item.averageRpe * 2) / 2, min: 1, max: 10, step: '0.5' })}
            </div>
          </article>
        `;
      }).join('')}
      <input type="hidden" name="exerciseCount" value="${plan.exerciseRecommendations.length}" />
    </form>

    <section class="record-submit-bar">
      <div><strong>提交后才计入完成记录</strong><span>可重复提交；同一天同类型训练会以最新一次为准。</span></div>
      <button type="button" class="primary" data-complete-workout ${plan.exerciseRecommendations.length ? '' : 'disabled'}>完成并保存训练</button>
    </section>
  `;
}

const ANALYSIS_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'chest', label: '胸' },
  { key: 'back', label: '背' },
  { key: 'shoulder', label: '肩' },
  { key: 'arms', label: '手臂' },
  { key: 'core', label: '核心' },
  { key: 'glutes', label: '臀' },
  { key: 'legs', label: '腿' },
];

function exerciseMuscleGroup(muscle) {
  return muscleRegions(muscle)[0] ?? 'other';
}

function renderAnalysis(derived) {
  const analysis = derived.analysis;
  const session = analysis.latestSession;
  const filteredExercises = state.analysisMuscleFilter === 'all'
    ? analysis.exerciseItems
    : analysis.exerciseItems.filter((item) => exerciseMuscleGroup(item.muscle) === state.analysisMuscleFilter);
  return `
    <section class="card">
      <div class="card-header">
        <div>
          <div class="eyebrow">维度一 · 仅统计完成记录</div>
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
      ${renderMuscleMap(analysis.volumeSummary.map((row) => row.muscle), 'analysis')}
    </section>

    <section class="recommendation-stack section-gap">
      <div class="card-header plain-header">
        <div>
          <div class="eyebrow">维度三 · 按动作</div>
          <h3>动作趋势与标准说明</h3>
        </div>
      </div>
      <div class="analysis-filter-row" aria-label="按肌群筛选动作">
        ${ANALYSIS_FILTERS.map((filter) => `<button type="button" class="filter-button ${state.analysisMuscleFilter === filter.key ? 'active' : ''}" data-analysis-filter="${filter.key}">${filter.label}</button>`).join('')}
      </div>
      ${filteredExercises.map((item) => `
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
      `).join('') || '<article class="card"><p>这个部位目前还没有已完成的训练记录。</p></article>'}
    </section>
  `;
}

function renderSync() {
  const completedDays = new Set(state.workoutLogs.map((workout) => workout.date)).size;
  const exerciseCount = state.workoutLogs.reduce((sum, workout) => sum + (workout.exercises?.length ?? 0), 0);
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
          <div class="metric-row"><span>本地完成训练</span><strong>${completedDays} 天</strong></div>
          <div class="metric-row"><span>已记录动作</span><strong>${exerciseCount} 条</strong></div>
          <div class="metric-row"><span>当前数据来源</span><strong>${state.profile.xunjiConnected ? '训记同步 + 本地记录' : '本地记录'}</strong></div>
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
      <div class="card-header align-start">
        <div><div class="eyebrow">个人资料与训练设置</div><h3>统一维护长期资料</h3><p class="muted">“今天练什么”由今日计划控制，不再与长期设置混在一起。</p></div>
        <button type="button" class="primary ghost" data-reassess>重新评估</button>
      </div>
      <form id="settingsForm" class="settings-sections">
        <fieldset class="settings-section">
          <legend><span>01</span><div><strong>身体资料</strong><small>用于估算负荷与恢复需求</small></div></legend>
          <div class="form-grid cols-2">
            ${selectField({ name: 'gender', label: '性别', value: state.profile.gender, options: profileOptions.genders })}
            ${numericField({ name: 'age', label: '年龄', value: state.profile.age, min: 16, max: 80 })}
            ${numericField({ name: 'height', label: '身高（cm）', value: state.profile.height, min: 130, max: 230 })}
            ${numericField({ name: 'weight', label: '体重（kg）', value: state.profile.weight, min: 30, max: 200, step: '0.1' })}
            ${numericField({ name: 'bodyFat', label: '体脂率（%）', value: state.profile.bodyFat, min: 3, max: 60, step: '0.1' })}
            ${numericField({ name: 'experienceMonths', label: '训练经验（月）', value: state.profile.experienceMonths, min: 0, max: 600 })}
          </div>
        </fieldset>
        <fieldset class="settings-section">
          <legend><span>02</span><div><strong>训练目标与偏好</strong><small>长期方向，不直接覆盖今天的训练日</small></div></legend>
          <div class="form-grid cols-2">
            ${selectField({ name: 'goal', label: '目标模式', value: state.profile.goal, options: profileOptions.goals })}
            <label>强化方向<input name="focusArea" value="${state.profile.focusArea}" /></label>
            ${selectField({ name: 'split', label: '训练分化', value: state.profile.split, options: profileOptions.splits })}
            ${numericField({ name: 'daysPerWeek', label: '每周训练天数', value: state.profile.daysPerWeek, min: 1, max: 7 })}
            <label>疼痛或旧伤<input name="painStatus" value="${state.profile.painStatus ?? '无'}" /></label>
          </div>
        </fieldset>
        <fieldset class="settings-section">
          <legend><span>03</span><div><strong>恢复与营养</strong><small>影响每日建议的保守或推进程度</small></div></legend>
          <div class="form-grid cols-2">
            ${selectField({ name: 'nutritionPhase', label: '饮食阶段', value: state.profile.nutritionPhase, options: profileOptions.nutritionPhases })}
            ${selectField({ name: 'proteinCompliance', label: '蛋白质执行度', value: state.profile.proteinCompliance, options: profileOptions.proteinComplianceLevels })}
            ${numericField({ name: 'sleepHours', label: '平均睡眠（小时）', value: state.profile.sleepHours, min: 0, max: 24, step: '0.1' })}
            ${selectField({ name: 'stressLevel', label: '压力等级', value: state.profile.stressLevel, options: profileOptions.stressLevels })}
          </div>
        </fieldset>
      </form>
      <div class="actions inline">
        <button type="button" class="primary" data-save="settingsForm">保存全部设置</button>
        <button type="button" class="primary ghost" data-page-jump="today">查看今日计划</button>
        <button type="button" class="primary ghost" data-reset-profile>恢复示例数据</button>
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

  const latestAssistant = [...state.chatMessages].reverse().find((message) => message.role === 'assistant');
  const modeMeta = {
    live: { label: '大模型在线', className: 'success' },
    mock: { label: '本地规则回复', className: 'neutral' },
    'mock-fallback': { label: '大模型失败 · 本地兜底', className: 'warning' },
    fallback: { label: '本地计划兜底', className: 'warning' },
    error: { label: '服务暂时不可用', className: 'warning' },
  }[latestAssistant?.mode];

  chatRoot.innerHTML = `
    <section class="chat-panel">
      <header class="chat-header">
        <div>
          <div class="eyebrow">AI 健身教练</div>
          <h3>随时问我训练问题</h3>
          ${modeMeta ? `<span class="chat-mode-badge ${modeMeta.className}">${modeMeta.label}</span>` : ''}
        </div>
        <button type="button" class="chat-close" data-chat-toggle aria-label="收起聊天面板">−</button>
      </header>
      <div class="chat-messages">
        ${state.chatMessages.map((message, index) => `
          <div class="chat-row ${message.role === 'user' ? 'chat-row-user' : 'chat-row-assistant'}">
            <div class="chat-message-block">
              <div class="chat-bubble ${message.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-assistant'}">${message.content}</div>
              ${message.role === 'assistant' ? `
                <div class="chat-feedback">
                  ${message.feedback ? `
                    <span class="chat-feedback-done">${message.feedback === 'up' ? '👍 已点赞' : '已反馈，感谢'}</span>
                  ` : `
                    <button type="button" class="chat-thumb" data-chat-feedback="up" data-chat-index="${index}" title="回答有帮助">👍</button>
                    <button type="button" class="chat-thumb" data-chat-feedback="down" data-chat-index="${index}" title="回答没帮助">👎</button>
                  `}
                  <button type="button" class="chat-report" data-chat-report="${index}" title="问题没有解决，提交反馈">反馈问题</button>
                </div>
              ` : ''}
            </div>
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
  requestAnimationFrame(() => {
    const messages = chatRoot.querySelector('.chat-messages');
    if (messages) messages.scrollTop = messages.scrollHeight;
  });
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
        trainingPlans: state.trainingPlans,
        workoutLogs: state.workoutLogs,
        workouts: state.workoutLogs,
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
        const plansBackup = JSON.stringify(state.trainingPlans);
        localStorage.setItem('fitness-training-plans-backup-v1', plansBackup);

        const { result, nextPlans } = modifyPlan(state.trainingPlans, instruction, state.workoutLogs);

        if (result.success && Array.isArray(nextPlans)) {
          state.trainingPlans = nextPlans;
          if (instruction.targetDate === localDateKey() && result.newWorkout) {
            state.profile.currentDayType = result.newWorkout.dayType;
            state.todayPreference = 'standard';
            state.todaySessionConfirmed = false;
            state.todaySessionDate = localDateKey();
          }
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
        const plansBackup = JSON.stringify(state.trainingPlans);
        localStorage.setItem('fitness-training-plans-backup-v1', plansBackup);

        const { result, nextPlans } = modifyPlan(state.trainingPlans, fallbackInstruction, state.workoutLogs);

        if (result.success && Array.isArray(nextPlans)) {
          state.trainingPlans = nextPlans;
          if (fallbackInstruction.targetDate === localDateKey() && result.newWorkout) {
            state.profile.currentDayType = result.newWorkout.dayType;
            state.todayPreference = 'standard';
            state.todaySessionConfirmed = false;
            state.todaySessionDate = localDateKey();
          }
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
  if (state.currentPage === 'onboarding') return renderOnboarding();
  if (state.currentPage === 'dashboard') return renderDashboard(derived);
  if (state.currentPage === 'today') return renderToday(derived);
  if (state.currentPage === 'record') return renderRecord(derived);
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

function saveCompletedWorkout() {
  const form = document.getElementById('workoutRecordForm');
  if (!form) return;
  const values = collectForm(form);
  const exerciseCount = Number(values.exerciseCount ?? 0);
  const exercises = [];

  for (let index = 0; index < exerciseCount; index += 1) {
    const weight = Number(values[`exercise_${index}_weight`]);
    const setCount = Number(values[`exercise_${index}_sets`]);
    const reps = Number(values[`exercise_${index}_reps`]);
    const rpe = Number(values[`exercise_${index}_rpe`]);
    if (!(weight > 0) || !(setCount > 0) || !(reps > 0) || !(rpe >= 1 && rpe <= 10)) {
      renderToast(`请完整填写动作 ${index + 1} 的重量、组数、次数和 RPE。`);
      return;
    }
    exercises.push({
      id: `log_ex_${Date.now()}_${index}`,
      sourcePlanExerciseId: values[`exercise_${index}_id`],
      name: values[`exercise_${index}_name`],
      category: values[`exercise_${index}_category`],
      muscle: values[`exercise_${index}_muscle`],
      target: values[`exercise_${index}_target`],
      sets: Array.from({ length: setCount }, () => [weight, reps]),
      rpe,
      completedAt: new Date().toISOString(),
    });
  }

  const today = localDateKey();
  const completedAt = new Date().toISOString();
  const log = {
    id: `log_${Date.now()}`,
    kind: 'log',
    status: 'completed',
    sourcePlanId: form.dataset.planId || null,
    date: today,
    dayType: state.profile.currentDayType,
    completedAt,
    exercises,
  };
  state.workoutLogs = state.workoutLogs.filter((workout) => !(workout.date === today && workout.dayType === log.dayType));
  state.workoutLogs.push(log);
  state.workoutLogs.sort((a, b) => new Date(a.date) - new Date(b.date));
  state.trainingPlans = state.trainingPlans.map((plan) => plan.date === today
    ? { ...plan, status: 'completed', completedLogId: log.id }
    : plan);
  addSyncLog(`已保存 ${log.dayType}，共 ${exercises.length} 个动作`);
  if (state.guideStep != null) completeGuide();
  saveProfile();
  state.currentPage = 'analysis';
  renderToast('训练已保存，分析结果已更新。');
  render();
}

root.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;

  if ('onboardingNext' in button.dataset || 'onboardingFinish' in button.dataset) {
    const form = document.getElementById('onboardingForm');
    if (!form) return;
    state.profile = { ...state.profile, ...normalizeProfilePatch(collectForm(form)) };
    if ('onboardingFinish' in button.dataset) {
      state.profileSetupComplete = true;
      state.todaySessionConfirmed = false;
      state.todayPreference = 'standard';
      state.todaySessionDate = localDateKey();
      state.guideStep = 0;
      state.onboardingOriginalProfile = null;
      try {
        localStorage.removeItem('fitness-guide-complete-v1');
        localStorage.setItem('fitness-guide-step-v1', '0');
      } catch {}
      saveProfile();
      refreshHeader();
      state.currentPage = 'dashboard';
      renderToast('建档完成，今日训练计划已生成。');
    } else {
      state.onboardingStep = Math.min(3, state.onboardingStep + 1);
    }
    render();
    return;
  }

  if ('onboardingBack' in button.dataset) {
    state.onboardingStep = Math.max(1, state.onboardingStep - 1);
    render();
    return;
  }

  if ('onboardingCancel' in button.dataset) {
    if (state.onboardingOriginalProfile) state.profile = state.onboardingOriginalProfile;
    state.onboardingOriginalProfile = null;
    state.currentPage = 'settings';
    state.onboardingStep = 1;
    render();
    return;
  }

  if ('reassess' in button.dataset) {
    state.onboardingOriginalProfile = JSON.parse(JSON.stringify(state.profile));
    state.onboardingStep = 1;
    state.currentPage = 'onboarding';
    render();
    return;
  }

  if ('guideSkip' in button.dataset) {
    completeGuide();
    render();
    return;
  }

  if (button.dataset.guidePage) {
    if (button.dataset.guidePage === 'today') updateGuideStep(1);
    if (button.dataset.guidePage === 'record') updateGuideStep(2);
    state.currentPage = button.dataset.guidePage;
    render();
    return;
  }

  if ('startSession' in button.dataset) {
    state.todaySessionConfirmed = true;
    state.todaySessionDate = localDateKey();
    saveProfile();
    if (state.guideStep != null) updateGuideStep(2);
    state.currentPage = 'record';
    render();
    return;
  }

  if (button.dataset.jump || button.dataset.pageJump) {
    const nextPage = button.dataset.jump || button.dataset.pageJump;
    if (state.guideStep != null && nextPage === 'today' && state.guideStep < 1) updateGuideStep(1);
    if (state.guideStep != null && nextPage === 'record' && state.guideStep < 2) updateGuideStep(2);
    state.currentPage = nextPage;
    render();
    return;
  }

  if (button.dataset.save) {
    const form = document.getElementById(button.dataset.save);
    if (!form) return;
    const patch = normalizeProfilePatch(collectForm(form));
    state.profile = { ...state.profile, ...patch };
    state.todaySessionConfirmed = false;
    saveProfile();
    refreshHeader();
    renderToast('资料已保存，请重新确认今日训练计划。');
    render();
    return;
  }

  if ('resetProfile' in button.dataset) {
    state.profile = defaultProfile();
    state.trainingPlans = createDefaultTrainingPlans(state.profile);
    state.todayPreference = 'standard';
    state.todaySessionConfirmed = false;
    state.todaySessionDate = localDateKey();
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
    state.todaySessionConfirmed = true;
    state.todaySessionDate = localDateKey();
    saveProfile();
    renderToast('本次训练方案已更新，并同步到首页和训练记录。');
    render();
    return;
  }

  if (button.dataset.analysisFilter) {
    state.analysisMuscleFilter = button.dataset.analysisFilter;
    render();
    return;
  }

  if ('completeWorkout' in button.dataset) {
    saveCompletedWorkout();
    return;
  }

  if (button.dataset.planDate) {
    const plan = state.trainingPlans.find((item) => item.date === button.dataset.planDate);
    if (button.dataset.planDate === localDateKey()) {
      state.currentPage = plan?.status === 'completed' ? 'analysis' : 'today';
      render();
    } else {
      state.selectedDayDate = button.dataset.planDate;
      render();
    }
    return;
  }

  if (button.dataset.weekShift) {
    state.weekOffset = Math.max(-4, Math.min(2, state.weekOffset + Number(button.dataset.weekShift)));
    state.selectedDayDate = null;
    render();
    return;
  }

  if ('weekReset' in button.dataset) {
    state.weekOffset = 0;
    state.selectedDayDate = null;
    render();
    return;
  }

  if ('closeDay' in button.dataset) {
    state.selectedDayDate = null;
    render();
    return;
  }
});

root.addEventListener('click', (event) => {
  if (!event.target.closest('button') && event.target.closest('[data-close-day]')) {
    state.selectedDayDate = null;
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
        trainingPlans: state.trainingPlans,
        workoutLogs: state.workoutLogs,
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
        trainingPlans: state.trainingPlans,
        workoutLogs: state.workoutLogs,
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
    topbarTitle.textContent = state.currentPage === 'onboarding'
      ? '完成训练档案'
      : (navItems.find((item) => item.key === state.currentPage)?.label ?? '健身进阶推荐器');
    root.innerHTML = `${renderPage(derived)}${renderDayDrawer()}`;
    mountMuscleMaps();
  } catch (err) {
    console.error('[render] error:', err);
    root.innerHTML = `<section class="card"><p style="color:#f87171">渲染出错：${err.message}</p></section>`;
  }
  renderChat();
}

render();
