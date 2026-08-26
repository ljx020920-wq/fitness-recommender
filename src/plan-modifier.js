// 计划修改引擎 —— 负责解析 AI 的函数调用指令并安全地修改训练计划
// 设计原则：LLM 只输出意图指令，实际数据修改由规则引擎执行

// ── 默认动作模板库 ──
const DEFAULT_EXERCISES = {
  '推训练日': [
    { name: '平板卧推', category: '主项', muscle: '胸', target: '4×6-8', sets: [] },
    { name: '上斜哑铃推举', category: '辅助', muscle: '胸上束', target: '3×8-10', sets: [] },
    { name: '哑铃飞鸟', category: '辅助', muscle: '胸', target: '3×12', sets: [] },
    { name: '杠铃肩推', category: '辅助', muscle: '肩', target: '3×8', sets: [] },
    { name: '侧平举', category: '孤立', muscle: '肩中束', target: '3×12-15', sets: [] },
    { name: '绳索下压', category: '孤立', muscle: '肱三头', target: '3×12-15', sets: [] },
  ],
  '拉训练日': [
    { name: '引体向上', category: '主项', muscle: '背', target: '4×6-8', sets: [] },
    { name: '杠铃划船', category: '辅助', muscle: '背', target: '3×8', sets: [] },
    { name: '坐姿划船', category: '辅助', muscle: '背', target: '3×10-12', sets: [] },
    { name: '面拉', category: '辅助', muscle: '肩后束', target: '3×15', sets: [] },
    { name: '杠铃弯举', category: '孤立', muscle: '肱二头', target: '3×10-12', sets: [] },
    { name: '锤式弯举', category: '孤立', muscle: '肱二头', target: '3×12', sets: [] },
  ],
  '腿训练日': [
    { name: '深蹲', category: '主项', muscle: '腿', target: '4×5-8', sets: [] },
    { name: '罗马尼亚硬拉', category: '辅助', muscle: '腿后侧', target: '3×8', sets: [] },
    { name: '腿举', category: '辅助', muscle: '股四头', target: '3×10-12', sets: [] },
    { name: '腿弯举', category: '孤立', muscle: '腿后侧', target: '3×10-12', sets: [] },
    { name: '小腿提踵', category: '孤立', muscle: '小腿', target: '3×15', sets: [] },
  ],
  '手臂训练日': [
    { name: '杠铃弯举', category: '主项', muscle: '肱二头', target: '4×8-10', sets: [] },
    { name: '绳索下压', category: '主项', muscle: '肱三头', target: '4×10-12', sets: [] },
    { name: '上斜哑铃弯举', category: '辅助', muscle: '肱二头', target: '3×10', sets: [] },
    { name: '窄距卧推', category: '辅助', muscle: '肱三头', target: '3×8-10', sets: [] },
    { name: '锤式弯举', category: '辅助', muscle: '肱二头', target: '3×12', sets: [] },
    { name: '仰卧臂屈伸', category: '辅助', muscle: '肱三头', target: '3×12', sets: [] },
  ],
  '胸训练日': [
    { name: '平板卧推', category: '主项', muscle: '胸', target: '4×6-8', sets: [] },
    { name: '上斜哑铃推举', category: '辅助', muscle: '胸上束', target: '3×8-10', sets: [] },
    { name: '哑铃飞鸟', category: '辅助', muscle: '胸', target: '3×12', sets: [] },
    { name: '双杠臂屈伸', category: '辅助', muscle: '胸下束', target: '3×10', sets: [] },
    { name: '器械夹胸', category: '孤立', muscle: '胸', target: '3×15', sets: [] },
  ],
  '背训练日': [
    { name: '引体向上', category: '主项', muscle: '背', target: '4×6-8', sets: [] },
    { name: '杠铃划船', category: '辅助', muscle: '背', target: '3×8', sets: [] },
    { name: '高位下拉', category: '辅助', muscle: '背阔', target: '3×10-12', sets: [] },
    { name: '坐姿划船', category: '辅助', muscle: '背', target: '3×10-12', sets: [] },
    { name: '直臂下压', category: '孤立', muscle: '背阔', target: '3×15', sets: [] },
  ],
  '肩训练日': [
    { name: '站姿推举', category: '主项', muscle: '肩', target: '4×6-8', sets: [] },
    { name: '哑铃推举', category: '辅助', muscle: '肩', target: '3×8-10', sets: [] },
    { name: '侧平举', category: '辅助', muscle: '肩中束', target: '4×12-15', sets: [] },
    { name: '俯身飞鸟', category: '辅助', muscle: '肩后束', target: '3×12', sets: [] },
    { name: '面拉', category: '孤立', muscle: '肩后束', target: '3×15', sets: [] },
  ],
  '休息日': [],
};

// 肌群恢复间隔（小时）
const MUSCLE_RECOVERY_HOURS = {
  '胸': 48,
  '胸上束': 48,
  '胸下束': 48,
  '背': 48,
  '背阔': 48,
  '肩': 48,
  '肩中束': 48,
  '肩后束': 48,
  '腿': 72,
  '股四头': 72,
  '腿后侧': 72,
  '小腿': 48,
  '肱二头': 48,
  '肱三头': 48,
};

// ── 辅助函数 ──

function getMusclesForDayType(dayType) {
  const exercises = DEFAULT_EXERCISES[dayType] || [];
  const muscles = new Set();
  exercises.forEach((ex) => muscles.add(ex.muscle));
  return [...muscles];
}

function getDateDiffHours(dateA, dateB) {
  return Math.abs(new Date(dateA) - new Date(dateB)) / (1000 * 60 * 60);
}

function createWorkoutEntry(date, dayType) {
  const templates = DEFAULT_EXERCISES[dayType] || [];
  return {
    id: `w_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    date,
    dayType,
    exercises: templates.map((t, i) => ({
      id: `e_${Date.now()}_${i}`,
      name: t.name,
      category: t.category,
      muscle: t.muscle,
      target: t.target,
      sets: [],
      rpe: null,
      completedAt: null,
    })),
  };
}

// ── 冲突检测 ──

function checkMuscleConflict(workouts, newDate, newDayType) {
  const newMuscles = getMusclesForDayType(newDayType);
  const conflicts = [];

  for (const workout of workouts) {
    if (workout.date === newDate) continue;
    const hoursDiff = getDateDiffHours(workout.date, newDate);
    const workoutMuscles = getMusclesForDayType(workout.dayType);

    for (const muscle of newMuscles) {
      if (workoutMuscles.includes(muscle)) {
        const requiredHours = MUSCLE_RECOVERY_HOURS[muscle] || 48;
        if (hoursDiff < requiredHours) {
          conflicts.push({
            muscle,
            conflictDate: workout.date,
            conflictDayType: workout.dayType,
            hoursGap: Math.round(hoursDiff),
            requiredHours,
          });
        }
      }
    }
  }

  return conflicts;
}

// ── 执行修改 ──

export function modifyPlan(workouts, instruction) {
  const { action, targetDate, targetDayType, reason } = instruction;
  // 深拷贝，避免直接修改原数组，确保前端 state 能正确更新
  const nextWorkouts = JSON.parse(JSON.stringify(workouts));
  const backup = JSON.parse(JSON.stringify(workouts));
  let result = { success: false, changes: [], warnings: [], newWorkout: null };

  const existingIndex = nextWorkouts.findIndex((w) => w.date === targetDate);

  if (action === 'change_day_type') {
    const conflicts = checkMuscleConflict(nextWorkouts, targetDate, targetDayType);
    if (conflicts.length > 0) {
      result.warnings.push(
        `检测到肌群冲突：${conflicts.map((c) => `${c.muscle} 与 ${c.conflictDate} 的 ${c.conflictDayType} 间隔仅 ${c.hoursGap} 小时，建议间隔 ${c.requiredHours} 小时`).join('；')}`
      );
    }

    if (existingIndex >= 0) {
      const oldType = nextWorkouts[existingIndex].dayType;
      nextWorkouts[existingIndex] = createWorkoutEntry(targetDate, targetDayType);
      result.changes.push(`${targetDate}: ${oldType} → ${targetDayType}`);
    } else {
      nextWorkouts.push(createWorkoutEntry(targetDate, targetDayType));
      result.changes.push(`${targetDate}: 新增 ${targetDayType}`);
    }

    result.newWorkout = nextWorkouts.find((w) => w.date === targetDate);
    result.success = true;
  }

  if (action === 'swap_days') {
    const { swapDate } = instruction;
    const idxA = nextWorkouts.findIndex((w) => w.date === targetDate);
    const idxB = nextWorkouts.findIndex((w) => w.date === swapDate);

    if (idxA >= 0 && idxB >= 0) {
      const typeA = nextWorkouts[idxA].dayType;
      const typeB = nextWorkouts[idxB].dayType;
      nextWorkouts[idxA].dayType = typeB;
      nextWorkouts[idxB].dayType = typeA;
      const newExA = createWorkoutEntry(targetDate, typeB);
      const newExB = createWorkoutEntry(swapDate, typeA);
      nextWorkouts[idxA].exercises = newExA.exercises;
      nextWorkouts[idxB].exercises = newExB.exercises;
      result.changes.push(`${targetDate} ↔ ${swapDate}: ${typeA} ↔ ${typeB}`);
      result.success = true;
    } else {
      result.warnings.push('交换失败：找不到指定的训练日');
    }
  }

  if (action === 'add_day') {
    if (existingIndex >= 0) {
      result.warnings.push(`${targetDate} 已有 ${nextWorkouts[existingIndex].dayType}，将替换为 ${targetDayType}`);
      nextWorkouts[existingIndex] = createWorkoutEntry(targetDate, targetDayType);
    } else {
      nextWorkouts.push(createWorkoutEntry(targetDate, targetDayType));
    }
    nextWorkouts.sort((a, b) => new Date(a.date) - new Date(b.date));
    result.changes.push(`${targetDate}: 新增 ${targetDayType}`);
    result.newWorkout = nextWorkouts.find((w) => w.date === targetDate);
    result.success = true;
  }

  if (action === 'remove_day') {
    if (existingIndex >= 0) {
      const removedType = nextWorkouts[existingIndex].dayType;
      nextWorkouts.splice(existingIndex, 1);
      result.changes.push(`${targetDate}: 删除 ${removedType}`);
      result.success = true;
    } else {
      result.warnings.push(`${targetDate} 没有训练计划可删除`);
    }
  }

  return { result, nextWorkouts, backup };
}

// ── 预计算本周计划摘要（用于注入 system prompt） ──

export function summarizeWeekPlan(workouts) {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const weekWorkouts = workouts.filter((w) => {
    const d = new Date(w.date);
    return d >= weekStart && d <= weekEnd;
  }).sort((a, b) => new Date(a.date) - new Date(b.date));

  return weekWorkouts.map((w) => ({
    date: w.date,
    dayType: w.dayType,
    exerciseCount: w.exercises?.length || 0,
    muscles: getMusclesForDayType(w.dayType),
  }));
}

// ── 可用的函数定义（用于注入 LLM system prompt） ──

export const PLAN_FUNCTIONS = [
  {
    name: 'modify_plan',
    description: '修改用户的训练计划。当用户要求改变某天的训练内容、增加训练日、删除训练日或交换两天时调用。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['change_day_type', 'swap_days', 'add_day', 'remove_day'],
          description: '修改类型：change_day_type=改某天训练类型, swap_days=交换两天, add_day=新增训练日, remove_day=删除训练日',
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
          description: '交换目标日期（仅 swap_days 时需要），格式 YYYY-MM-DD',
        },
        reason: {
          type: 'string',
          description: '修改原因，用于生成回复说明',
        },
      },
      required: ['action', 'targetDate', 'reason'],
    },
  },
];
