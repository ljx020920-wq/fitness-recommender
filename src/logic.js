function parseTarget(target) {
  if (!target) return { type: 'unknown' };
  if (target.includes('×')) {
    const [, repsPart] = target.split('×');
    if (repsPart.includes('-')) {
      const [min, max] = repsPart.split('-').map((v) => Number(v.trim()));
      return { type: 'range', min, max };
    }
    return { type: 'fixed', reps: Number(repsPart.trim()) };
  }
  return { type: 'unknown' };
}

function isValidSet(setItem) {
  return Array.isArray(setItem)
    && setItem.length >= 2
    && typeof setItem[0] === 'number'
    && typeof setItem[1] === 'number'
    && setItem[0] > 0
    && setItem[1] > 0;
}

function sumReps(sets) {
  return sets.reduce((sum, [, reps]) => sum + reps, 0);
}

function averageRpe(exerciseEntries) {
  const rpes = exerciseEntries.map((item) => item.rpe).filter((value) => typeof value === 'number');
  if (!rpes.length) return null;
  return rpes.reduce((a, b) => a + b, 0) / rpes.length;
}

function targetSetCount(target) {
  const count = Number(String(target ?? '').split('×')[0]);
  return Number.isFinite(count) && count > 0 ? count : 3;
}

function normalizeExerciseName(name) {
  return String(name ?? '')
    .replace(/平板/g, '')
    .replace(/上斜哑铃推举/g, '上斜哑铃卧推')
    .replace(/杠铃弯举/g, '二头弯举')
    .replace(/\s+/g, '');
}

function findExerciseHistory(workouts, exercise) {
  const sorted = [...workouts].sort((a, b) => new Date(b.date) - new Date(a.date));
  const normalizedName = normalizeExerciseName(exercise.name);
  const exact = sorted
    .map((session) => session.exercises.find((item) => normalizeExerciseName(item.name) === normalizedName))
    .filter(Boolean);
  if (exact.length) return exact;

  return sorted
    .map((session) => session.exercises.find((item) => item.muscle === exercise.muscle && item.category === exercise.category))
    .filter(Boolean);
}

function classifyRecovery(profile, workouts) {
  const recentWorkouts = [...workouts]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 3);

  const poorSleep = profile.sleepHours < 6.2;
  const highStress = profile.stressLevel === '高';
  const painRisk = profile.painStatus && profile.painStatus !== '无';
  const hardSessions = recentWorkouts.flatMap((w) => w.exercises).filter((e) => e.rpe && e.rpe >= 9).length;

  if (painRisk || (poorSleep && highStress) || hardSessions >= 3) {
    return { level: 'high', label: '恢复压力偏高', tip: '本周建议保住主项质量，减少部分辅助训练量。' };
  }
  if (poorSleep || highStress || hardSessions >= 2) {
    return { level: 'medium', label: '恢复一般', tip: '可以继续推进，但不建议全动作一起冲重量。' };
  }
  return { level: 'low', label: '恢复良好', tip: '恢复状态支持正常推进。' };
}

function recommendDelta(category, action) {
  if (action !== 'add') return null;
  if (category === '主项') return '上肢 +2.5kg / 下肢 +2.5~5kg';
  if (category === '辅助') return '小幅加重 2~5%';
  return '优先加次数或增加 1 组';
}

export function buildDashboard(profile, workouts, plannedWorkout = null, preference = 'standard') {
  const recovery = classifyRecovery(profile, workouts);
  const dayType = plannedWorkout?.dayType ?? profile.currentDayType;
  const recommendations = buildWorkoutRecommendations(profile, workouts, dayType, preference, plannedWorkout);

  const improving = recommendations.exerciseRecommendations.filter((item) => item.action === 'add').map((item) => item.name);
  const stalled = recommendations.exerciseRecommendations.filter((item) => item.action === 'maintain').map((item) => item.name);
  const fatigue = recommendations.exerciseRecommendations.filter((item) => item.action === 'reduce').map((item) => item.name);

  return {
    recovery,
    todaySummary: recommendations,
    improving,
    stalled,
    fatigue,
  };
}

export function buildWorkoutRecommendations(profile, workouts, dayType, preference = 'standard', plannedWorkout = null) {
  const matched = workouts.filter((w) => w.dayType === dayType).sort((a, b) => new Date(b.date) - new Date(a.date));
  const latestRecorded = matched[0];
  const plannedExercises = plannedWorkout?.exercises ?? [];
  const latest = plannedExercises.length
    ? {
        date: latestRecorded?.date ?? null,
        dayType,
        exercises: plannedExercises.map((plannedExercise) => {
          const history = findExerciseHistory(workouts, plannedExercise);
          const previous = history[0];
          return previous
            ? { ...previous, ...plannedExercise, sets: previous.sets, rpe: previous.rpe }
            : plannedExercise;
        }),
      }
    : latestRecorded;
  const recovery = classifyRecovery(profile, workouts);

  if (dayType === '休息日') {
    return {
      dayType,
      latestDate: null,
      recovery,
      dayStatus: '主动恢复',
      daySummary: '今天安排休息，让疲劳真正下降，为下一次训练保留状态。',
      exerciseRecommendations: [],
      weeklyAdvice: '保持轻量活动、充足睡眠和稳定蛋白质摄入即可。',
      nutritionAdvice: '休息日不必大幅减少进食，保持蛋白质和基础碳水。',
    };
  }

  if (!latest) {
    return {
      dayType,
      latestDate: null,
      recovery,
      dayStatus: '数据不足',
      daySummary: '当前训练日数据不足，建议先完成一次训练记录后再生成推荐。',
      exerciseRecommendations: [],
      weeklyAdvice: '建议先同步最近 2-6 周训练记录，再生成更可靠的计划。',
      nutritionAdvice: '饮食部分首版仅做提醒，先保持蛋白质和总热量稳定。',
    };
  }

  let exerciseRecommendations = latest.exercises.map((exercise) => {
    const parsedExerciseTarget = parseTarget(exercise.target);
    if (!Array.isArray(exercise.sets) || exercise.sets.length === 0 || exercise.sets.some((setItem) => !isValidSet(setItem)) || parsedExerciseTarget.type === 'unknown') {
      return {
        id: exercise.id,
        name: exercise.name,
        category: exercise.category ?? '辅助',
        muscle: exercise.muscle ?? '未知肌群',
        averageRpe: typeof exercise.rpe === 'number' ? exercise.rpe : null,
        action: 'maintain',
        actionLabel: '维持',
        targetWeight: Array.isArray(exercise.sets) && exercise.sets[0]?.[0] ? exercise.sets[0][0] : '待填写',
          targetSets: targetSetCount(exercise.target),
          targetRepsRange: exercise.target ?? '未知',
          intensity: '保留 2 次余力',
          deltaHint: null,
          progressHint: null,
        explanation: '暂无可匹配的完成记录，先按计划目标训练；完成本次后再生成个性化重量建议。',
        currentWeight: Array.isArray(exercise.sets) && exercise.sets[0]?.[0] ? exercise.sets[0][0] : '-',
        currentReps: Array.isArray(exercise.sets) ? exercise.sets.map((setItem) => Array.isArray(setItem) ? setItem[1] : '?').join(' / ') : '-',
      };
    }

    const history = findExerciseHistory(workouts, exercise).slice(0, 3);

    const current = history[0];
    const prev = history[1];
    const historyAverageRpe = averageRpe(history);
    const target = parseTarget(current.target);
    const reps = current.sets.map(([, rep]) => rep);
    const prevReps = prev ? prev.sets.map(([, rep]) => rep) : [];
    const currentWeight = current.sets[0][0];
    const currentTotalReps = sumReps(current.sets);
    const prevTotalReps = prev ? sumReps(prev.sets) : null;
    const targetTotalReps = target.type === 'fixed' ? target.reps * current.sets.length : null;

    let action = 'maintain';
    let actionLabel = '维持';
    let explanation = '当前表现接近目标，建议先巩固。';
    let targetWeight = currentWeight;
    let targetSets = current.sets.length;
    let targetRepsRange = current.target.replace('×', ' × ');
    let intensity = '保留 1-2 次余力';
    let progressHint = null;

    if (target.type === 'fixed') {
      const allHit = reps.every((rep) => rep >= target.reps);
      const previousStable = prev ? prevReps.every((rep) => rep >= target.reps) : false;
      const missBy = Math.max(0, targetTotalReps - currentTotalReps);
      const prevMissBy = prevTotalReps == null ? null : Math.max(0, targetTotalReps - prevTotalReps);
      const nearHit = missBy <= 1;
      const clearlyDown = prevTotalReps != null && currentTotalReps <= prevTotalReps - 2;

      if (allHit && previousStable && recovery.level !== 'high' && !(historyAverageRpe != null && historyAverageRpe >= 9)) {
        action = 'add';
        actionLabel = '加重';
        targetWeight = current.category === '主项' ? currentWeight + (dayType === '腿训练日' ? 5 : 2.5) : Number((currentWeight * 1.025).toFixed(1));
        explanation = `最近两次都完成目标组次，${exercise.category === '主项' ? '建议小幅加重继续推进。' : '建议小幅加重后重新从目标下限开始。'}`;
        progressHint = `已连续两次达标，本次直接加重到 ${targetWeight} kg`;
      } else if (allHit && previousStable && historyAverageRpe != null && historyAverageRpe >= 9) {
        explanation = '虽然已完成目标组次，但近期训练强度偏高，建议先维持重量。';
      } else if (nearHit && previousStable) {
        const nextAddWeight = current.category === '主项' ? currentWeight + (dayType === '腿训练日' ? 5 : 2.5) : Number((currentWeight * 1.025).toFixed(1));
        explanation = '距离稳定加重只差 1 次，建议本次先维持重量，把最后一组补齐。';
        progressHint = `再完成 ${missBy} 次达标，即可增重到 ${nextAddWeight} kg`;
      } else if (prev && prevMissBy != null && missBy >= 3 && clearlyDown && recovery.level !== 'low') {
        action = 'reduce';
        actionLabel = '减量';
        targetSets = Math.max(2, current.sets.length - 1);
        explanation = '近期完成度连续下降，且恢复状态一般，建议短暂减量保留动作质量。';
        intensity = '不要练到力竭';
      } else {
        explanation = '还没有稳定完成目标组次，建议先维持当前重量巩固一次。';
      }
    }

    if (target.type === 'range') {
      const allTop = reps.every((rep) => rep >= target.max);
      const allAtLeastMin = reps.every((rep) => rep >= target.min);
      if (allTop && recovery.level === 'low' && !(historyAverageRpe != null && historyAverageRpe >= 9)) {
        action = 'add';
        actionLabel = '加重';
        targetWeight = current.category === '孤立' ? currentWeight : Number((currentWeight * 1.05).toFixed(1));
        explanation = '上次所有工作组都达到区间上限，建议加重后从区间下限重新推进。';
        progressHint = `已全部达到区间上限，本次加重到 ${targetWeight} kg`;
      } else if (allTop && historyAverageRpe != null && historyAverageRpe >= 9) {
        explanation = '近期训练强度偏高，虽然达到上限，仍建议先维持重量。';
      } else if ((!allAtLeastMin && recovery.level === 'high') || (recovery.level === 'high' && current.category !== '主项')) {
        action = 'reduce';
        actionLabel = '减量';
        if (current.category === '孤立') {
          targetSets = Math.max(2, current.sets.length - 1);
          explanation = '当前恢复压力偏高，孤立动作本次建议减少 1 组。';
        } else {
          explanation = '当前未稳定处于目标区间，建议保守处理，先控制训练量。';
        }
      } else if (!allAtLeastMin) {
        explanation = '当前次数还没稳定站上目标区间，建议先把次数补回下限。';
      } else {
        explanation = '仍有继续补次数空间，建议先维持重量把次数补满。';
        progressHint = current.category === '孤立'
          ? `所有组达到 ${target.max} 次后，下次可增加次数或小幅加重`
          : `所有组达到 ${target.max} 次后，可加重到 ${Number((currentWeight * 1.05).toFixed(1))} kg`;
      }
    }

    if (recovery.level === 'medium' && action === 'add' && current.category !== '主项') {
      action = 'maintain';
      actionLabel = '维持';
      targetWeight = currentWeight;
      explanation = '虽然已接近加重条件，但当前恢复一般，建议先维持并巩固动作质量。';
      progressHint = null;
    }

    if (recovery.level === 'high' && current.category !== '主项') {
      action = 'reduce';
      actionLabel = '减量';
      targetSets = Math.max(2, current.sets.length - 1);
      targetWeight = currentWeight;
      explanation = '本周恢复压力偏高，建议减少辅助或孤立动作总量。';
      intensity = '全程保留 2 次以上余力';
      progressHint = null;
    }

    return {
      id: exercise.id,
      name: exercise.name,
      category: exercise.category,
      muscle: exercise.muscle,
      averageRpe: historyAverageRpe,
      action,
      actionLabel,
      targetWeight,
      targetSets,
      targetRepsRange,
      intensity,
      deltaHint: recommendDelta(exercise.category, action),
      explanation,
      currentWeight,
      currentReps: reps.join(' / '),
      progressHint,
    };
  });

if (preference === 'low_fatigue') {
exerciseRecommendations = exerciseRecommendations.map((item) => {
if (item.category === '主项') {
return {
...item,
action: 'maintain',
actionLabel: '维持',
progressHint: null,
explanation: `${item.explanation} 今日选择了“状态一般”模式，主项不建议加重。`,
};
}
return {
...item,
action: 'reduce',
actionLabel: '减量',
progressHint: null,
targetSets: Math.max(1, item.targetSets - 1),
explanation: `${item.explanation} 今日状态一般，辅助动作减少 1 组。`,
};
});
}

if (preference === 'quick') {
const primary = exerciseRecommendations.find((item) => item.category === '主项');
const supports = exerciseRecommendations.filter((item) => item.category === '辅助').slice(0, 2);
exerciseRecommendations = [primary, ...supports].filter(Boolean);
}

if (preference === 'full') {
exerciseRecommendations = exerciseRecommendations.map((item) => {
if (item.category === '主项') return item;
return {
...item,
targetSets: item.targetSets + 1,
progressHint: null,
explanation: `${item.explanation} 时间充分模式下，增加 1 组容量。`,
};
});
}

  if (preference === 'glute' && dayType === '腿训练日') {
    exerciseRecommendations = exerciseRecommendations.map((item) => {
      if (item.name === '罗马尼亚硬拉') {
        return {
          ...item,
          targetSets: item.targetSets + 1,
          explanation: `${item.explanation} 臀腿偏翘臀模式下，增加 1 组强化臀腿后侧。`,
        };
      }
      if (item.name === '腿举') {
        return {
          ...item,
          explanation: `${item.explanation} 臀腿偏翘臀模式下，建议优先考虑臀推或偏臀分腿蹲替代。`,
        };
      }
      return item;
    }).sort((a, b) => {
      const priority = { '深蹲': 1, '罗马尼亚硬拉': 2, '腿弯举': 3, '腿举': 4 };
      return (priority[a.name] ?? 99) - (priority[b.name] ?? 99);
    });
  }

  if (preference === 'quad' && dayType === '腿训练日') {
    exerciseRecommendations = exerciseRecommendations.map((item) => {
      if (item.name === '腿举') {
        return {
          ...item,
          targetSets: item.targetSets + 1,
          explanation: `${item.explanation} 股四头偏置模式下，增加 1 组并建议采用更低脚位。`,
        };
      }
      if (item.name === '深蹲') {
        return {
          ...item,
          explanation: `${item.explanation} 股四头偏置模式下，深蹲继续作为优先主项保留。`,
        };
      }
      return item;
    });
  }

  const addCount = exerciseRecommendations.filter((item) => item.action === 'add').length;
  const reduceCount = exerciseRecommendations.filter((item) => item.action === 'reduce').length;
  let dayStatus = '正常推进';
  let daySummary = '今天适合按照计划推进，优先关注主项质量。';

  if (recovery.level === 'medium') {
    dayStatus = '保守推进';
    daySummary = '可以继续练，但不建议所有动作一起冲重量。';
  }
  if (recovery.level === 'high' || reduceCount >= 2) {
    dayStatus = '恢复控制';
    daySummary = '本次优先保留主项刺激，辅助动作适当减量。';
  } else if (recovery.level === 'low' && addCount === 0) {
    dayStatus = '正常推进';
    daySummary = '今天更适合巩固现有重量，优先把动作完成质量做稳。';
  }

  return {
    dayType,
    latestDate: latest.date,
    recovery,
    dayStatus,
    daySummary,
    exerciseRecommendations,
    weeklyAdvice: recovery.level === 'high'
      ? '建议本周后半段把总量下调 10%-20%，避免连续高疲劳。'
      : '本周可继续推进，若下次主项再次达标，可考虑小幅加重。',
    nutritionAdvice: profile.proteinCompliance === '基本达标'
      ? '饮食方面保持蛋白质稳定即可，暂不需要大改。'
      : '蛋白质摄入可能影响恢复，建议先提高稳定度。',
  };
}

export const EXERCISE_STANDARDS = {
  '卧推': {
    keyPoints: ['肩胛骨后缩下沉，上背贴紧凳面', '杠铃下落到胸口中下沿，小臂垂直地面', '双脚踩实，臀部不离凳'],
    commonIssues: ['肘部过度外展导致肩部压力过大', '触胸反弹借力，失去张力控制', '起杠时肩胛松动导致肩前侧不适'],
    tutorial: 'https://search.bilibili.com/all?keyword=卧推标准动作',
  },
  '上斜哑铃卧推': {
    keyPoints: ['凳面角度 30°-45°', '哑铃下落到上胸两侧，手腕保持中立', '顶峰不锁定肘关节'],
    commonIssues: ['角度过高变成肩推', '下放过浅，上胸刺激不足', '两侧重量晃动，核心失稳'],
    tutorial: 'https://search.bilibili.com/all?keyword=上斜哑铃卧推标准动作',
  },
  '杠铃肩推': {
    keyPoints: ['杠铃落在锁骨上方，肘部略在杠前', '核心收紧，肋骨下沉避免腰椎代偿', '推起后头部穿过手臂平面'],
    commonIssues: ['腰部过度反弓借力', '推杠轨迹绕头，动作路径变长', '半程推起，肩部刺激打折'],
    tutorial: 'https://search.bilibili.com/all?keyword=杠铃肩推标准动作',
  },
  '侧平举': {
    keyPoints: ['肘部微屈固定角度，用肩带动手臂', '抬至与肩同高即可', '下放阶段控制 2 秒'],
    commonIssues: ['耸肩用斜方肌代偿', '甩动惯性借力', '抬得过高挤压肩峰'],
    tutorial: 'https://search.bilibili.com/all?keyword=侧平举标准动作',
  },
  '负重引体': {
    keyPoints: ['肩胛先下沉再拉起身体', '下巴过杠即可，不用胸口撞杠', '下放要完全伸展手臂'],
    commonIssues: ['摆腿借力变成惯性引体', '半程幅度，背阔刺激不足', '颈部前伸够杠'],
    tutorial: 'https://search.bilibili.com/all?keyword=负重引体向上标准动作',
  },
  '高位下拉': {
    keyPoints: ['挺胸微后倾，把杠拉向下胸或锁骨', '肘部垂直向下走', '回放阶段控制 2 秒'],
    commonIssues: ['身体过度后仰变成划船', '拉到颈后导致肩部风险', '握太紧导致小臂先疲劳'],
    tutorial: 'https://search.bilibili.com/all?keyword=高位下拉标准动作',
  },
  '坐姿划船': {
    keyPoints: ['躯干固定微后倾，肩胛先收紧', '把手拉向腹部，肘部贴身', '回放时让肩胛前伸'],
    commonIssues: ['躯干大幅前后摆动借力', '耸肩导致斜方肌上部代偿', '回放过快失去离心刺激'],
    tutorial: 'https://search.bilibili.com/all?keyword=坐姿划船标准动作',
  },
  '二头弯举': {
    keyPoints: ['肘部固定在身体两侧', '弯举至肌肉收缩顶点稍作停顿', '下放控制 2-3 秒'],
    commonIssues: ['身体后仰甩动借力', '肘部前移变成前平举', '下放过快'],
    tutorial: 'https://search.bilibili.com/all?keyword=二头弯举标准动作',
  },
  '深蹲': {
    keyPoints: ['脚尖微外展与膝盖同向', '髋部后坐，下蹲至大腿至少平行', '全程核心刚性，背部中立'],
    commonIssues: ['膝盖过度内扣', '重心前移变成脚尖蹲', '蹲得过浅或蹲过深失去控制'],
    tutorial: 'https://search.bilibili.com/all?keyword=深蹲标准动作',
  },
  '罗马尼亚硬拉': {
    keyPoints: ['髋部后推，杠铃贴大腿下滑', '背部全程平直', '感受腿后侧拉伸到极限再站起'],
    commonIssues: ['变成深蹲式下蹲', '杠铃离身体太远腰部受压', '腰椎弯曲借力'],
    tutorial: 'https://search.bilibili.com/all?keyword=罗马尼亚硬拉标准动作',
  },
  '腿举': {
    keyPoints: ['双脚与肩同宽踩实踏板', '下放到大腿贴近胸前但腰不离开靠垫', '不完全锁膝'],
    commonIssues: ['重量过大导致骨盆翻转腰部代偿', '底部反弹借力', '双脚过高把腿举变成臀推'],
    tutorial: 'https://search.bilibili.com/all?keyword=腿举标准动作',
  },
  '腿弯举': {
    keyPoints: ['骨盆压实凳面', '只做膝关节屈伸', '顶峰收缩稍作停顿'],
    commonIssues: ['臀部抬起借力', '幅度过半程', '速度过快失去控制'],
    tutorial: 'https://search.bilibili.com/all?keyword=腿弯举标准动作',
  },
};

const MUSCLE_WEEKLY_TARGET = { min: 10, max: 20 };

function parseTargetRaw(target) {
  return parseTarget(target);
}

export function buildAnalysis(profile, workouts) {
  const sortedWorkouts = [...workouts].sort((a, b) => new Date(b.date) - new Date(a.date));

  // 维度一：按训练 —— 分析最近一次训练的执行情况
  const latestWorkout = sortedWorkouts[0];
  const sessionItems = latestWorkout
    ? latestWorkout.exercises.map((exercise) => {
        const target = parseTargetRaw(exercise.target);
        const sets = Array.isArray(exercise.sets) ? exercise.sets : [];
        const totalReps = sets.reduce((sum, set) => sum + (Array.isArray(set) ? set[1] : 0), 0);
        const topWeight = sets.reduce((max, set) => Math.max(max, Array.isArray(set) ? set[0] : 0), 0);
        let hit = null;
        if (target.type === 'fixed') {
          const targetTotal = target.reps * sets.length;
          hit = totalReps >= targetTotal;
        } else if (target.type === 'range') {
          hit = sets.length > 0 && sets.every(([, rep]) => rep >= target.min);
        }
        return {
          name: exercise.name,
          muscle: exercise.muscle,
          category: exercise.category ?? '辅助',
          weight: topWeight,
          setsText: `${sets.length} 组 · 共 ${totalReps} 次`,
          target: exercise.target,
          rpe: exercise.rpe ?? null,
          hit,
          hitLabel: hit === null ? '数据不足' : hit ? '达标' : '未达标',
        };
      })
    : [];

  // 维度二：按肌肉 —— 每块肌肉的锻炼程度与达标进度
  const groups = {};
  for (const workout of workouts) {
    for (const exercise of workout.exercises) {
      groups[exercise.muscle] ??= { volume: 0, effectiveSets: 0 };
      groups[exercise.muscle].volume += exercise.sets.reduce((sum, [weight, reps]) => sum + weight * reps, 0);
      groups[exercise.muscle].effectiveSets += typeof exercise.rpe === 'number' && exercise.rpe >= 6 ? exercise.sets.length : 0;
    }
  }

  const volumeSummary = Object.entries(groups)
    .map(([muscle, value]) => {
      const progress = Math.round(Math.min(100, (value.effectiveSets / MUSCLE_WEEKLY_TARGET.max) * 100));
      return {
        muscle,
        volume: Math.round(value.volume),
        effectiveSets: value.effectiveSets,
        level: value.effectiveSets < MUSCLE_WEEKLY_TARGET.min ? '偏低' : value.effectiveSets > MUSCLE_WEEKLY_TARGET.max ? '偏高' : '适中',
        progress,
        note: value.effectiveSets < MUSCLE_WEEKLY_TARGET.min
          ? `距最低有效组数还差 ${MUSCLE_WEEKLY_TARGET.min - value.effectiveSets} 组`
          : value.effectiveSets > MUSCLE_WEEKLY_TARGET.max
            ? '已超过建议上限，注意恢复'
            : '处于理想区间',
      };
    })
    .sort((a, b) => b.volume - a.volume);

  // 维度三：按动作 —— 每个动作的趋势与标准说明
  const dayTypes = ['推训练日', '拉训练日', '腿训练日', '胸训练日', '背训练日', '肩训练日', '手臂训练日'];
  const allRecommendations = dayTypes.flatMap((dayType) => buildWorkoutRecommendations(profile, workouts, dayType).exerciseRecommendations.map((item) => ({ ...item, dayType })));
  const plateauCandidates = allRecommendations.filter((item) => item.action === 'maintain');

  const exerciseNames = [...new Set(sortedWorkouts.flatMap((workout) => workout.exercises.map((exercise) => exercise.name)))];
  const exerciseItems = exerciseNames
    .map((name) => {
      const sessions = [];
      for (const workout of sortedWorkouts) {
        const found = workout.exercises.find((item) => item.name === name);
        if (found) sessions.push({ date: workout.date, dayType: workout.dayType, exercise: found });
      }
      if (!sessions.length) return null;
      const weights = sessions.map((s) => s.exercise.sets.reduce((max, set) => Math.max(max, Array.isArray(set) ? set[0] : 0), 0));
      const trend = weights.length >= 2
        ? weights[0] > weights[weights.length - 1] ? 'up' : weights[0] < weights[weights.length - 1] ? 'down' : 'flat'
        : 'flat';
      const trendLabel = { up: '重量上升', down: '重量回落', flat: '重量持平' }[trend];
      const recommendation = allRecommendations.find((item) => item.name === name);
      return {
        name,
        muscle: sessions[0].exercise.muscle,
        trend,
        trendLabel,
        latestWeight: weights[0],
        progressHint: recommendation?.progressHint ?? null,
        actionLabel: recommendation?.actionLabel ?? '维持',
        standard: EXERCISE_STANDARDS[name] ?? {
          keyPoints: ['先用可控重量完成全程动作', '保持躯干与关节稳定，避免借力', '下放阶段主动控制，保留 1-2 次余力'],
          commonIssues: ['重量过大导致动作变形', '动作幅度不足', '在疲劳状态下用惯性完成'],
          tutorial: `https://search.bilibili.com/all?keyword=${encodeURIComponent(`${name} 标准动作`)}`,
        },
      };
    })
    .filter(Boolean);

  const lowVolumeGroups = volumeSummary.filter((item) => item.level === '偏低');
  const diagnosis = [];
  const lowHit = sessionItems.filter((item) => item.hit === false);
  if (lowHit.length) {
    diagnosis.push(`最近一次训练中 ${lowHit.map((item) => item.name).join('、')} 未完全达标，本次建议优先补齐目标组次。`);
  } else if (sessionItems.length) {
    diagnosis.push('最近一次训练所有动作均按目标完成，执行质量稳定，可以继续考虑渐进。');
  }
  if (lowVolumeGroups.length) {
    diagnosis.push(`因为 ${lowVolumeGroups.map((item) => item.muscle).join('、')} 的有效组数偏低，所以建议后续适当补充这些肌群的训练量。`);
  }

  return {
    latestSession: latestWorkout
      ? { date: latestWorkout.date, dayType: latestWorkout.dayType, items: sessionItems }
      : null,
    volumeSummary,
    exerciseItems,
    plateauCandidates,
    diagnosis,
  };
}
