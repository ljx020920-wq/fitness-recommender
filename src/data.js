export const profileOptions = {
  genders: ['男', '女'],
  stressLevels: ['低', '中', '高'],
  goals: ['增肌优先', '减脂保肌', '力量提升'],
  splits: ['推拉腿', '上下肢', '全身'],
  dayTypes: ['推训练日', '拉训练日', '腿训练日', '胸训练日', '背训练日', '肩训练日', '手臂训练日', '休息日'],
  nutritionPhases: ['轻盈余增肌', '维持', '减脂'],
  proteinComplianceLevels: ['基本达标', '偶尔不足', '明显不足'],
};

export const userProfile = {
  name: '示例用户',
  experienceMonths: 18,
  age: 29,
  gender: '男',
  height: 178,
  weight: 76.5,
  bodyFat: 15.2,
  goal: '增肌优先',
  focusArea: '肩背强化',
  split: '推拉腿',
  daysPerWeek: 5,
  sleepHours: 6.8,
  stressLevel: '中',
  activityLevel: '中',
  nutritionPhase: '轻盈余增肌',
  proteinCompliance: '基本达标',
  xunjiConnected: true,
  apiKeyMasked: 'xj_demo_****_FORGE',
  lastSyncText: '模拟：2 小时前',
  currentDayType: '推训练日',
};

export const workouts = [
  {
    id: 'w1',
    date: '2026-07-01',
    dayType: '推训练日',
    exercises: [
      { id: 'e1', name: '卧推', category: '主项', muscle: '胸', sets: [[70, 6], [70, 6], [70, 5]], target: '3×6', rpe: 8.5, completedAt: null },
      { id: 'e2', name: '上斜哑铃卧推', category: '辅助', muscle: '胸上束', sets: [[28, 10], [28, 9], [28, 9]], target: '3×8-10', rpe: 8, completedAt: null },
      { id: 'e3', name: '杠铃肩推', category: '辅助', muscle: '肩', sets: [[42.5, 8], [42.5, 7], [42.5, 7]], target: '3×8', rpe: 8.5, completedAt: null },
      { id: 'e4', name: '侧平举', category: '孤立', muscle: '肩中束', sets: [[10, 15], [10, 14], [10, 13]], target: '3×12-15', rpe: 8, completedAt: null },
    ],
  },
  {
    id: 'w2',
    date: '2026-06-27',
    dayType: '推训练日',
    exercises: [
      { id: 'e5', name: '卧推', category: '主项', muscle: '胸', sets: [[70, 6], [70, 6], [70, 6]], target: '3×6', rpe: 8, completedAt: null },
      { id: 'e6', name: '上斜哑铃卧推', category: '辅助', muscle: '胸上束', sets: [[26, 10], [26, 10], [26, 10]], target: '3×8-10', rpe: 7.5, completedAt: null },
      { id: 'e7', name: '杠铃肩推', category: '辅助', muscle: '肩', sets: [[42.5, 8], [42.5, 8], [42.5, 7]], target: '3×8', rpe: 8, completedAt: null },
      { id: 'e8', name: '侧平举', category: '孤立', muscle: '肩中束', sets: [[10, 15], [10, 15], [10, 14]], target: '3×12-15', rpe: 8, completedAt: null },
    ],
  },
  {
    id: 'w3',
    date: '2026-06-29',
    dayType: '拉训练日',
    exercises: [
      { id: 'e9', name: '负重引体', category: '主项', muscle: '背', sets: [[10, 6], [10, 6], [10, 5]], target: '3×6', rpe: 8.5, completedAt: null },
      { id: 'e10', name: '坐姿划船', category: '辅助', muscle: '背', sets: [[65, 10], [65, 10], [65, 9]], target: '3×8-10', rpe: 8, completedAt: null },
      { id: 'e11', name: '高位下拉', category: '辅助', muscle: '背阔', sets: [[60, 12], [60, 11], [60, 10]], target: '3×10-12', rpe: 8, completedAt: null },
      { id: 'e12', name: '二头弯举', category: '孤立', muscle: '肱二头', sets: [[12, 12], [12, 12], [12, 11]], target: '3×10-12', rpe: 8, completedAt: null },
    ],
  },
  {
    id: 'w4',
    date: '2026-06-30',
    dayType: '腿训练日',
    exercises: [
      { id: 'e13', name: '深蹲', category: '主项', muscle: '腿', sets: [[100, 5], [100, 5], [100, 4]], target: '3×5', rpe: 9, completedAt: null },
      { id: 'e14', name: '罗马尼亚硬拉', category: '辅助', muscle: '腿后侧', sets: [[90, 8], [90, 8], [90, 7]], target: '3×8', rpe: 8.5, completedAt: null },
      { id: 'e15', name: '腿举', category: '辅助', muscle: '股四头', sets: [[180, 12], [180, 11], [180, 10]], target: '3×10-12', rpe: 8.5, completedAt: null },
      { id: 'e16', name: '腿弯举', category: '孤立', muscle: '腿后侧', sets: [[40, 12], [40, 12], [40, 12]], target: '3×10-12', rpe: 8, completedAt: null },
    ],
  },
];
