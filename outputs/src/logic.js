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

export function buildDashboard(profile, workouts) {
  const recovery = classifyRecovery(profile, workouts);
  const today = workouts.find((w) => w.dayType === profile.currentDayType) ?? workouts[0];
  const recommendations = buildWorkoutRecommendations(profile, workouts, today.dayType);

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

export function buildWorkoutRecommendations(profile, workouts, dayType, preference = 'standard') {
  const matched = workouts.filter((w) => w.dayType === dayType).sort((a, b) => new Date(b.date) - new Date(a.date));
  const latest = matched[0];
  const recovery = classifyRecovery(profile, workouts);

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
        targetWeight: Array.isArray(exercise.sets) && exercise.sets[0]?.[0] ? exercise.sets[0][0] : '-',
        targetSets: Array.isArray(exercise.sets) ? exercise.sets.length : 0,
        targetRepsRange: exercise.target ?? '未知',
        intensity: '请先检查数据',
        deltaHint: null,
        explanation: '该动作数据异常，建议检查训练记录',
        currentWeight: Array.isArray(exercise.sets) && exercise.sets[0]?.[0] ? exercise.sets[0][0] : '-',
        currentReps: Array.isArray(exercise.sets) ? exercise.sets.map((setItem) => Array.isArray(setItem) ? setItem[1] : '?').join(' / ') : '-',
      };
    }

    const history = matched
      .map((session) => session.exercises.find((item) => item.name === exercise.name))
      .filter(Boolean)
      .slice(0, 3);

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
      } else if (allHit && previousStable && historyAverageRpe != null && historyAverageRpe >= 9) {
        explanation = '虽然已完成目标组次，但近期训练强度偏高，建议先维持重量。';
      } else if (nearHit && previousStable) {
        explanation = '距离稳定加重只差 1 次，建议本次先维持重量，把最后一组补齐。';
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
      }
    }

    if (recovery.level === 'medium' && action === 'add' && current.category !== '主项') {
      action = 'maintain';
      actionLabel = '维持';
      targetWeight = currentWeight;
      explanation = '虽然已接近加重条件，但当前恢复一般，建议先维持并巩固动作质量。';
    }

    if (recovery.level === 'high' && current.category !== '主项') {
      action = 'reduce';
      actionLabel = '减量';
      targetSets = Math.max(2, current.sets.length - 1);
      targetWeight = currentWeight;
      explanation = '本周恢复压力偏高，建议减少辅助或孤立动作总量。';
      intensity = '全程保留 2 次以上余力';
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
    };
  });

  if (preference === 'low_fatigue') {
    exerciseRecommendations = exerciseRecommendations.map((item) => {
      if (item.category === '主项') {
        return {
          ...item,
          action: 'maintain',
          actionLabel: '维持',
          explanation: `${item.explanation} 今日选择了“状态一般”模式，主项不建议加重。`,
        };
      }
      return {
        ...item,
        action: 'reduce',
        actionLabel: '减量',
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

export function buildAnalysis(profile, workouts) {
  const groups = {};
  for (const workout of workouts) {
    for (const exercise of workout.exercises) {
      groups[exercise.muscle] ??= { volume: 0, effectiveSets: 0 };
      groups[exercise.muscle].volume += exercise.sets.reduce((sum, [weight, reps]) => sum + weight * reps, 0);
      groups[exercise.muscle].effectiveSets += typeof exercise.rpe === 'number' && exercise.rpe >= 6 ? exercise.sets.length : 0;
    }
  }

  const volumeSummary = Object.entries(groups)
    .map(([muscle, value]) => ({
      muscle,
      volume: Math.round(value.volume),
      effectiveSets: value.effectiveSets,
      level: value.effectiveSets < 10 ? '偏低' : value.effectiveSets > 20 ? '偏高' : '适中',
      note: '基于现有数据估算',
    }))
    .sort((a, b) => b.volume - a.volume);

  const dayTypes = ['推训练日', '拉训练日', '腿训练日'];
  const allRecommendations = dayTypes.flatMap((dayType) => buildWorkoutRecommendations(profile, workouts, dayType).exerciseRecommendations.map((item) => ({ ...item, dayType })));
  const plateauCandidates = allRecommendations.filter((item) => item.action === 'maintain');

  const firstAdd = allRecommendations.find((item) => item.action === 'add');
  const nearHit = allRecommendations.find((item) => item.action === 'maintain' && typeof item.explanation === 'string' && item.explanation.includes('只差 1 次'));
  const highRpe = allRecommendations.find((item) => typeof item.averageRpe === 'number' && item.averageRpe >= 9);
  const lowVolumeGroups = volumeSummary.filter((item) => item.level === '偏低');

  const diagnosis = [];
  if (firstAdd) {
    diagnosis.push(`因为 ${firstAdd.dayType} 的 ${firstAdd.name} 已达到加重条件，所以建议优先作为下一步进阶动作。`);
  } else if (nearHit) {
    diagnosis.push(`因为 ${nearHit.dayType} 的 ${nearHit.name} 距离加重只差一步，所以建议先把当前重量稳定完成再推进。`);
  }

  if (highRpe) {
    diagnosis.push(`因为 ${highRpe.dayType} 的 ${highRpe.name} 近期平均 RPE 偏高，所以建议先维持重量，避免盲目继续加重。`);
  }

  if (lowVolumeGroups.length) {
    diagnosis.push(`因为 ${lowVolumeGroups.map((item) => item.muscle).join('、')} 的有效组数偏低，所以建议后续适当补充这些肌群的训练量。`);
  }

  return {
    volumeSummary,
    plateauCandidates,
    diagnosis,
  };
}
