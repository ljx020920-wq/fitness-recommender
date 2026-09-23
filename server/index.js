const express = require('express');
const fs = require('fs');
const path = require('path');
const { callOpenAICompatible } = require('./llm-client');

const app = express();
const PORT = 3001;

app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.static(path.join(__dirname, '..')));

function summarizeProfile(profile = {}) {
  const safe = {
    gender: profile.gender,
    age: profile.age,
    height: profile.height,
    weight: profile.weight,
    bodyFat: profile.bodyFat,
    goal: profile.goal,
    split: profile.split,
    daysPerWeek: profile.daysPerWeek,
    sleepHours: profile.sleepHours,
    stressLevel: profile.stressLevel,
    nutritionPhase: profile.nutritionPhase,
    proteinCompliance: profile.proteinCompliance,
    focusArea: profile.focusArea,
    currentDayType: profile.currentDayType,
    painStatus: profile.painStatus,
  };
  return JSON.stringify(safe, null, 2);
}

function summarizeWorkouts(workouts = []) {
  const brief = workouts.slice(0, 12).map((workout) => ({
    id: workout.id,
    date: workout.date,
    dayType: workout.dayType,
    exercises: (workout.exercises || []).map((exercise) => ({
      id: exercise.id,
      name: exercise.name,
      category: exercise.category,
      muscle: exercise.muscle,
      target: exercise.target,
      rpe: exercise.rpe,
      completedAt: exercise.completedAt,
      sets: exercise.sets,
    })),
  }));
  return JSON.stringify(brief, null, 2);
}

function computeMetrics(workouts = []) {
  if (!workouts.length) return {};

  const recentWorkouts = workouts.slice(0, 12);
  const allExercises = recentWorkouts.flatMap((w) => w.exercises || []);
  const completedExercises = allExercises.filter((e) => e.completedAt);

  // 平均 RPE
  const rpes = completedExercises.map((e) => e.rpe).filter((r) => r != null);
  const avgRpe = rpes.length ? (rpes.reduce((a, b) => a + b, 0) / rpes.length).toFixed(1) : null;

  // 完成率
  const completionRate = allExercises.length
    ? Math.round((completedExercises.length / allExercises.length) * 100)
    : 0;

  // 主项动作趋势（按名称分组，取最近3次）
  const mainLifts = {};
  completedExercises.forEach((ex) => {
    if (ex.category === 'compound' || ex.target === 'main') {
      if (!mainLifts[ex.name]) mainLifts[ex.name] = [];
      mainLifts[ex.name].push(ex);
    }
  });

  const liftTrends = Object.entries(mainLifts).map(([name, list]) => {
    const recent = list.slice(0, 3);
    const recentRpes = recent.filter((e) => e.rpe != null).map((e) => e.rpe);
    return {
      name,
      recentSessions: recent.length,
      avgRpe: recentRpes.length ? (recentRpes.reduce((a, b) => a + b, 0) / recentRpes.length).toFixed(1) : null,
    };
  });

  // 本周 vs 上周训练次数
  const now = new Date();
  const thisWeekStart = new Date(now);
  thisWeekStart.setDate(now.getDate() - now.getDay());
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(thisWeekStart.getDate() - 7);

  const thisWeekCount = recentWorkouts.filter((w) => new Date(w.date) >= thisWeekStart).length;
  const lastWeekCount = recentWorkouts.filter((w) => {
    const d = new Date(w.date);
    return d >= lastWeekStart && d < thisWeekStart;
  }).length;

  return {
    recentWorkoutCount: recentWorkouts.length,
    totalExercises: allExercises.length,
    completedExercises: completedExercises.length,
    completionRate,
    avgRpe,
    liftTrends,
    thisWeekCount,
    lastWeekCount,
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'fitness-llm-server' });
});

// ── 本周计划摘要 ──
function summarizeWeekPlan(workouts = []) {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const weekWorkouts = workouts.filter((w) => {
    const d = new Date(w.date);
    return d >= weekStart && d <= weekEnd;
  }).sort((a, b) => new Date(a.date) - new Date(b.date));

  if (!weekWorkouts.length) return '本周暂无训练计划';

  return weekWorkouts.map((w) => {
    const muscles = [...new Set((w.exercises || []).map((e) => e.muscle))].join('、');
    return `${w.date}: ${w.dayType}（${muscles || '无动作'}）`;
  }).join('\n');
}

// ── Function Calling 工具定义 ──
const PLAN_TOOLS = [
  {
    name: 'modify_plan',
    description: '修改用户的训练计划。当用户要求改变某天的训练内容、增加训练日、删除训练日或交换两天时调用。调用后系统会自动执行修改并返回结果。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['change_day_type', 'swap_days', 'add_day', 'remove_day'],
          description: '修改类型',
        },
        targetDate: {
          type: 'string',
          description: '目标日期，格式 YYYY-MM-DD',
        },
        targetDayType: {
          type: 'string',
          enum: ['推训练日', '拉训练日', '腿训练日', '手臂训练日', '胸训练日', '背训练日', '肩训练日', '休息日'],
          description: '目标训练日类型',
        },
        swapDate: {
          type: 'string',
          description: '交换目标日期（仅 swap_days 时），格式 YYYY-MM-DD',
        },
        reason: {
          type: 'string',
          description: '修改原因，用于向用户解释',
        },
      },
      required: ['action', 'targetDate', 'reason'],
    },
  },
];

app.post('/api/chat', async (req, res) => {
  try {
    const { messages = [], profile = {}, trainingPlans = [], workoutLogs = [], workouts = [], clientDate = '' } = req.body || {};
    const completedLogs = workoutLogs.length ? workoutLogs : workouts;
    const today = /^\d{4}-\d{2}-\d{2}$/.test(clientDate)
      ? clientDate
      : new Date().toLocaleDateString('en-CA');

    const systemPrompt = [
      '你是一个专业的健身训练教练 AI 助手。你正在帮助一位用户进行训练决策。以下是用户的档案信息、预计算指标、本周计划和训练记录数据，请基于这些数据回答用户的问题。回答风格要专业但亲切，像一位有经验的私人教练。',
      '数据边界：trainingPlans 只表示未来或今日计划，不能当作用户已经完成；workoutLogs 才是实际完成记录。重量、RPE、达标率和加重判断只能依据 workoutLogs。',
      `今天的用户本地日期是 ${today}，用户说“今天”时，modify_plan 的 targetDate 必须使用这个日期。`,
      '',
      '【核心能力 - 你可以调用工具修改计划】',
      '你具备修改用户训练计划的能力。你配备了 modify_plan 工具，当用户要求调整计划时，**必须调用该工具执行修改，绝不能只口头回复**。',
      '',
      '【何时必须调用 modify_plan 工具 - 示例】',
      '• 用户说"今天我想练手臂" → 调用 modify_plan(action="change_day_type", targetDate="今天的日期", targetDayType="手臂训练日", reason="用户今天想练手臂")',
      '• 用户说"把周三改成休息日" → 调用 modify_plan(action="change_day_type", targetDate="周三的日期", targetDayType="休息日", reason="用户周三想休息")',
      '• 用户说"这周加一次背训练" → 调用 modify_plan(action="add_day", targetDate="本周空的一天", targetDayType="背训练日", reason="用户要求增加背训练")',
      '• 用户说"把周五和周六交换" → 调用 modify_plan(action="swap_days", targetDate="周五日期", swapDate="周六日期", reason="用户想交换两天")',
      '• 用户说"删掉周日的训练" → 调用 modify_plan(action="remove_day", targetDate="周日日期", reason="用户删除周日训练")',
      '重要：调用工具后，系统会自动执行修改并返回结果。你不需要自己编修改内容，只需调用工具。',
      '',
      '【回答规则 - 严格遵守，按优先级从高到低】',
      '1. 身份确认：当用户问"你是谁"或"你能做什么"时，介绍自己是专业健身教练AI，列出帮助范围（训练安排、加重建议、饮食指导、状态评估、动作纠正、疼痛处理、计划调整、平台期突破等）。',
      '2. 计划修改（绝对最高优先级）：当用户话中包含"练手臂"、"练臀"、"练胸"、"练背"、"练肩"、"改..."、"换成..."、"加一次..."、"删掉..."、"交换..."等修改意图时，**必须立即调用 modify_plan 工具**。不要先解释，不要只回复文字，先调用工具。',
      '3. 部位指定优先：当用户指定想练的部位（如"今天想练臀"、"我想练手臂"等），**必须**根据该部位给出针对性训练建议，**完全忽略**原定计划。给出具体动作名称、组数、次数、RPE建议。',
      '4. 今日训练安排：当用户问"今天练什么"且没有指定具体部位时，按照 currentDayType 给出当天的完整训练安排。',
      '5. 加重策略：当用户问"该不该加重"时，检查预计算指标中 liftTrends。最近3次都达标且平均RPE≤7，建议加2.5%（上肢）或5%（下肢）；平均RPE≥8，维持重量先补齐次数。',
      '6. 饮食营养：根据 nutritionPhase 给出阶段化建议。减脂期：热量缺口300-500大卡，蛋白质1.8-2.2g/kg；增肌期：盈余200-400大卡，蛋白质1.6-2.0g/kg；维持期：热量平衡，蛋白质1.6-1.8g/kg。给出具体食物搭配。',
      '7. 休息恢复：结合 sleepHours、stressLevel、avgRpe、completionRate 判断。睡眠不足7小时、压力高、或完成率<70%时，建议减量20-30%或安排恢复日。',
      '8. 疼痛受伤：用户报告疼痛时，**立即**建议停止该动作，给出无痛替代方案。持续1周以上建议就医。',
      '9. 动作技术：用户描述动作问题（"深蹲膝盖内扣"、"卧推肩膀痛"等），给出具体纠正方法和替代动作。',
      '10. 计划调整建议：用户想改变分化、频率或目标时，给出基于数据的建议。不要同意明显不合理的方案。',
      '11. 减脂有氧：力量训练优先，有氧作为补充。每周3-4次低强度有氧（30-40分钟，心率60-70%最大心率），HIIT每周不超过2次。',
      '12. 状态评估：结合 completionRate、avgRpe、sleepHours、stressLevel 判断今天是否适合训练。',
      '13. 平台期突破：用户说"没进步"，分析 liftTrends。最近4周无渐进超负荷，建议调整训练变量。',
      '14. 热身拉伸：训练前5-10分钟动态热身，训练后静态拉伸30秒×2组。',
      '15. 补剂建议：蛋白粉、肌酸（5g/天）、咖啡因。不夸大效果。',
      '16. 回答要具体：永远给出动作名称、组数、次数、RPE建议。禁止泛泛而谈。',
      '',
      '【本周计划】',
      summarizeWeekPlan(trainingPlans),
      '',
      '【预计算指标】',
      JSON.stringify(computeMetrics(completedLogs), null, 2),
      '',
      '【用户档案】',
      summarizeProfile(profile),
      '',
      '【训练记录】',
      summarizeWorkouts(completedLogs),
    ].join('\n');

    const reply = await callOpenAICompatible({
      systemPrompt,
      messages,
      tools: PLAN_TOOLS,
    });

    // 如果 LLM 返回了函数调用，透传给前端
    if (reply.functionCall) {
      res.json({
        reply: null,
        mode: reply.mode,
        functionCall: reply.functionCall,
      });
      return;
    }

    res.json({ reply: reply.text, mode: reply.mode });
  } catch (error) {
    console.error('[Chat] error:', error.message);
    res.status(500).json({ reply: '教练服务暂时不可用，请稍后重试。', error: 'CHAT_FAILED' });
  }
});

app.post('/api/feedback', async (req, res) => {
  try {
    const { userMessage, aiReply, rating, reason, profile, workouts, trainingPlans, workoutLogs, mode } = req.body || {};
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      timestamp: new Date().toISOString(),
      type: rating === 'report' ? 'report' : 'feedback',
      rating: rating || null,
      userMessage: userMessage || '',
      aiReply: aiReply || '',
      mode: mode || 'unknown',
      reason: reason || '',
      profileSnapshot: profile || {},
      workoutsSnapshot: workoutLogs || workouts || [],
      trainingPlansSnapshot: trainingPlans || [],
    };

    const logPath = path.join(__dirname, 'feedback-log.jsonl');
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');

    console.log('[Feedback] recorded:', entry.type, entry.rating);
    res.json({ ok: true });
  } catch (error) {
    console.error('[Feedback] failed:', error.message);
    res.status(500).json({ ok: false, error: 'FEEDBACK_FAILED' });
  }
});

app.listen(PORT, () => {
  console.log(`fitness llm server running on http://localhost:${PORT}`);
});
