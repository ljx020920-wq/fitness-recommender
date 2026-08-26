# 健身进阶推荐器 —— 项目交接文档

> 本文档的目标：让一个新的 Codex 会话在读完本文档后，能够完全衔接当前状态继续开发，无需重新理解整个项目。

---

## 一、项目概述

**产品定位**：一个"对话式 AI 健身教练"的 Web MVP Demo。核心交互逻辑是：用户通过右下角浮动聊天窗口与 AI 教练对话，AI 不仅能回答健身问题，还能**根据用户指令自动修改训练计划**（如"今天我想练手臂"），并在页面上实时反映变化。

**当前用途**：AI PM 面试 Demo 项目，展示 LLM + Function Calling + 前端动态渲染的完整链路。

**部署状态**：当前为本地开发模式（Express 后端 + Python 静态服务器），尚未部署到生产环境。用户计划迁移到 GitHub + Vercel。

---

## 二、技术架构

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│  前端 (Browser)                                              │
│  ├─ index.html        ── 单页应用入口                        │
│  ├─ src/app.js        ── 主应用逻辑 (~900+ 行)              │
│  ├─ src/logic.js      ── 业务逻辑引擎                       │
│  ├─ src/data.js       ── 静态数据（用户档案 + 训练记录）      │
│  ├─ src/styles.css    ── 样式表                             │
│  └─ src/plan-modifier.js ── 计划修改引擎（规则驱动）          │
│                                                             │
│  数据持久化：localStorage                                   │
│    - fitness-profile-demo   （用户档案）                     │
│    - fitness-workouts-demo  （训练记录）                     │
│    - fitness-chat-messages  （聊天历史）                     │
│    - fitness-sync-log       （同步日志）                     │
│    - fitness-workouts-backup（计划修改前的备份）              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ HTTP POST
┌─────────────────────────────────────────────────────────────┐
│  后端 (Node.js + Express, localhost:3001)                   │
│  ├─ /api/chat          ── LLM 对话 + Function Calling       │
│  ├─ /api/feedback      ── 用户反馈收集（👍/👎/上报）         │
│  └─ server/llm-client.js ── FRIDAY API 封装层               │
│                                                             │
│  LLM 服务：美团内部 FRIDAY One-API                          │
│    - Endpoint: https://aigc.sankuai.com/v1/openai/native    │
│    - Model: LongCat-Flash-Chat                              │
│    - 需要 SSO Token / API Key（当前已配置）                  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 双服务启动方式

```bash
# Terminal 1: 启动后端
cd server && node index.js
# → http://localhost:3001

# Terminal 2: 启动静态服务器
cd app && python3 -m http.server 8080
# → http://localhost:8080
```

**注意**：
- 前端页面访问 `http://localhost:8080`
- 前端 JS 中硬编码了后端地址 `http://localhost:3001/api/chat`
- 如果端口被占用，需要 `kill -9 $(lsof -ti :3001)` 后再启动

---

## 三、文件结构与每个文件的作用

### 3.1 前端文件

#### `index.html`
- 单页应用入口，没有任何路由，所有页面切换由 JS 控制
- 核心 DOM 结构：
  - `.sidebar`：左侧导航栏（由 `navItems` 数组动态生成）
  - `.main`：主内容区，包含 `topbar` 和 `#page-root`
  - 右下角浮动聊天按钮（FAB）和聊天面板（`#chat-panel`）
- 资源引用带缓存清除版本号：`?v=7`

#### `src/app.js`（主应用逻辑，约 900+ 行）
**这是最重要的文件，所有页面渲染和交互都在这里。**

核心状态对象 `state`：
```js
{
  currentPage: 'dashboard',    // 当前页面
  profile: loadProfile(),      // 用户档案
  workouts: loadWorkouts(),    // 训练记录数组
  todayPreference: 'standard', // 今日偏好模式
  syncLog: loadSyncLog(),      // 同步历史
  chatOpen: false,             // 聊天面板开关
  chatLoading: false,          // 聊天加载状态
  chatInput: '',               // 聊天输入
  chatMessages: loadChatMessages(), // 聊天历史
}
```

**主要函数清单**：

| 函数 | 作用 |
|------|------|
| `render()` | 总渲染入口，调用 `computeState()` 生成派生数据，然后调用各页面渲染函数 |
| `computeState()` | 调用 `buildDashboard()`、`buildWorkoutRecommendations()`、`buildAnalysis()` 生成三份派生数据 |
| `renderDashboard(derived)` | **首页**：训练计划摘要 + 肌肉示意图 + 三张小卡片 |
| `renderToday(derived)` | **今日建议**：训练日概况 + 偏好标签（动态过滤）+ 动作推荐卡片 |
| `renderAnalysis(derived)` | **训练分析**：三维度分析（按训练 / 按肌肉 / 按动作） |
| `renderProfile()` | **首次建档**：表单填写用户档案 |
| `renderSync()` | **数据同步**：合并了原来的"训记连接"和"数据同步"功能 |
| `renderSettings()` | **个人设置**：修改训练偏好、疼痛状态等 |
| `renderMuscleMap(muscles)` | SVG 肌肉示意图渲染，正面 + 背面，高亮今日训练肌群 |
| `sendChatMessage()` | 发送聊天消息到后端 `/api/chat`，处理 Function Call 响应 |
| `detectPlanChangeIntent(text)` | **前端 fallback**：当 LLM 没有触发 function calling 时，通过关键词匹配检测用户是否要修改计划 |
| `submitFeedback({index, rating, reason})` | 提交 👍/👎 反馈到 `/api/feedback` |

**事件委托**：
- 所有按钮点击通过 `root.addEventListener('click', ...)` 和 `document.body.addEventListener('click', ...)` 委托处理
- 按钮通过 `data-*` 属性标识行为：`data-page`、`data-jump`、`data-save`、`data-pref`、`data-chat-feedback`、`data-chat-report` 等

#### `src/logic.js`（业务逻辑引擎）
纯函数，无状态，只负责计算和转换。

| 导出函数 | 作用 |
|----------|------|
| `buildDashboard(profile, workouts)` | 构建首页仪表盘数据：今日训练摘要、适合推进/建议巩固/疲劳偏高列表 |
| `buildWorkoutRecommendations(profile, workouts, dayType, preference)` | **核心算法**：根据历史训练记录计算每个动作的推荐（加重/维持/减量），返回 `exerciseRecommendations` 数组 |
| `buildAnalysis(profile, workouts)` | 构建三维度分析数据：按训练 / 按肌肉 / 按动作 |
| `EXERCISE_STANDARDS` | 常量对象：12 个动作的标准动作要领、常见问题、B 站教程链接 |

**`buildWorkoutRecommendations` 的推荐逻辑**：
1. 解析历史训练记录，提取每个动作的最近表现
2. 比较实际完成次数 vs 目标次数，判断达标情况
3. 根据恢复状态（`recovery.level`）调整推荐
4. 生成 `action`（`add`/`maintain`/`reduce`）和 `actionLabel`（`加重`/`维持`/`减量`）
5. 生成 `progressHint`（如"再完成 1 次达标，即可增重到 72.5 kg"）
6. 根据 `preference` 参数（`standard`/`glute`/`quad`/`low_fatigue`/`quick`/`full`/`cardio`）微调推荐

#### `src/data.js`（静态数据）
- `profileOptions`：表单选项枚举
- `userProfile`：默认用户档案（LJX 的演示数据）
- `workouts`：默认训练记录（4 条，覆盖推/拉/腿三种训练日）
- 每个训练记录包含 `id`、`date`、`dayType`、`exercises[]`
- 每个动作包含 `id`、`name`、`category`（主项/辅助/孤立）、`muscle`、`sets`（二维数组 [[weight, reps], ...]）、`target`（如 "3×6"）、`rpe`、`completedAt`

#### `src/plan-modifier.js`（计划修改引擎）
规则驱动的计划修改引擎，**LLM 只输出意图，实际修改由规则执行**。

| 导出 | 作用 |
|------|------|
| `modifyPlan(workouts, instruction)` | 主入口，返回 `{ result, nextWorkouts }` |
| `checkMuscleConflict(workouts, newDate, newDayType)` | 检查肌群恢复冲突 |
| `summarizeWeekPlan(workouts)` | 生成周计划摘要 |
| `PLAN_FUNCTIONS` | Function Calling schema（供 LLM 使用） |
| `DEFAULT_EXERCISES` | 各训练日的默认动作模板库 |

**支持的修改操作**：
- `change_day_type`：改变某天训练类型
- `swap_days`：交换两天训练
- `add_day`：新增训练日
- `remove_day`：删除训练日

**冲突检测**：修改前检查目标肌群是否在恢复间隔内（如腿部需要 72 小时恢复）。

#### `src/styles.css`
- 暗色主题（深蓝/近黑背景）
- CSS 变量定义在 `:root`，包括 `--brand`（#7c9cff）、`--brand-2`（#8ef2d0）等
- 关键类：`.card`、`.grid`、`.chip`、`.status-pill`、`.recommendation-card`、`.muscle-map`、`.hint-bubble`、`.progress-track`

### 3.2 后端文件

#### `server/index.js`
Express 服务器，端口 3001。

**端点**：
- `POST /api/chat`
  - 接收 `{ messages, profile, workouts }`
  - 组装 system prompt（包含用户档案摘要 + 预计算指标 + 本周计划摘要 + Function Calling 指令）
  - 调用 `callOpenAICompatible({ systemPrompt, messages, tools: PLAN_TOOLS })`
  - 如果 LLM 返回 `functionCall`，透传给前端 `{ reply: null, mode, functionCall }`
  - 否则返回 `{ reply: text, mode }`
- `POST /api/feedback`
  - 接收用户反馈（👍/👎/上报问题）
  - 写入 `server/feedback-log.jsonl`

**System Prompt 关键规则**（共 15+ 条）：
1. 回答基于用户档案和训练数据
2. 不编造训练记录
3. 遇到受伤/疼痛问题优先建议就医
4. 不给出极端饮食建议
5. **必须调用 `modify_plan` 工具执行计划修改，不能只是口头回复**
6. 每次回答后有一个点赞/点踩选项
7. 用户点踩或上报的问题会被记录用于模型评测

#### `server/llm-client.js`
FRIDAY One-API 的封装层。

| 导出 | 作用 |
|------|------|
| `callOpenAICompatible({ systemPrompt, messages, tools })` | 主调用函数 |

**三层 fallback 机制**：
1. **Live**：有 API Key 时，调用 FRIDAY API
2. **Fallback Mock**：API 请求失败时，生成上下文感知的 mock 回复（基于用户消息关键词分类）
3. **Mock**：没有 API Key 时，返回默认回复

**API 配置**：
- Base URL: `https://aigc.sankuai.com/v1/openai/native`
- Model: `LongCat-Flash-Chat`
- 注意：这是美团内网服务，外网不可访问

---

## 四、数据流详解

### 4.1 页面初始化流
```
index.html 加载 → app.js 执行
  → loadProfile() / loadWorkouts() 从 localStorage 读取数据
  → 首次访问无数据时，使用 data.js 中的默认值
  → computeState() 调用 logic.js 计算派生数据
  → render() 根据 currentPage 渲染对应页面
```

### 4.2 用户修改档案流
```
用户在 profile 页面填写表单 → 点击保存
  → collectForm() 收集表单数据
  → normalizeProfilePatch() 规范化数据类型
  → state.profile = { ...state.profile, ...patch }
  → saveProfile() 写入 localStorage
  → render() 重新渲染
```

### 4.3 AI 聊天 + 计划修改流
```
用户在聊天窗口输入消息
  → sendChatMessage()
  → POST /api/chat { messages, profile, workouts }
    → 后端组装 system prompt
    → 调用 FRIDAY API（带 tools: PLAN_TOOLS）
    → LLM 返回 functionCall 或纯文本
  ← 前端收到响应

  路径 A：收到 functionCall
    → 调用 modifyPlan(state.workouts, instruction)
    → 成功后 state.workouts = nextWorkouts
    → saveProfile() 写入 localStorage
    → render() 重新渲染 → 页面显示新计划

  路径 B：收到纯文本
    → 调用 detectPlanChangeIntent(text) 做前端 fallback 检测
    → 如果检测到修改意图，走 modifyPlan()
    → 否则直接显示 AI 回复文本

  路径 C：API 失败
    → llm-client.js 返回 fallback mock 回复
    → 前端显示 mock 回复
```

### 4.4 反馈收集流
```
用户点击 👍/👎/上报问题
  → submitFeedback() POST /api/feedback
  → 后端写入 feedback-log.jsonl
  → 前端更新消息状态显示"已反馈，感谢"
```

---

## 五、已实现功能清单（截至当前版本）

### 5.1 核心功能
- [x] 用户档案管理（首次建档 + 个人设置）
- [x] 训练记录存储与读取（localStorage 持久化）
- [x] 训练计划推荐引擎（基于双渐进/线性/RPE 渐进算法）
- [x] AI 聊天对话（接入 FRIDAY One-API）
- [x] **Function Calling / 工具调用**（AI 可以修改训练计划）
- [x] **前端 Fallback 意图检测**（LLM 不触发 function call 时的兜底方案）
- [x] 计划修改引擎（规则驱动，含冲突检测）
- [x] 聊天历史持久化

### 5.2 UI 功能
- [x] 首页：训练计划摘要 + 肌肉示意图 + 三张小卡片
- [x] 今日建议：动作推荐卡片 + 偏好标签（动态过滤）
- [x] 训练分析：三维度分析（按训练 / 按肌肉 / 按动作）
- [x] 数据同步：API Key 配置 + 同步历史
- [x] 浮动聊天窗口（可收起/展开）
- [x] 点赞/点踩/上报问题反馈 UI
- [x] 进度提示气泡（如"再完成 1 次达标，即可增重到 72.5 kg"）
- [x] SVG 肌肉示意图（正面 + 背面，高亮今日训练肌群）

### 5.3 工程功能
- [x] 缓存清除版本号（`?v=N` 机制）
- [x] 三层 LLM fallback（Live → Fallback Mock → Mock）
- [x] 上下文感知的 mock 回复（10+ 关键词分类）
- [x] 反馈数据持久化（feedback-log.jsonl）

---

## 六、待实现功能清单（用户明确要求的迭代方向）

### 6.1 高优先级（用户已明确要求）
- [ ] **训记 CSV 导入功能**
  - 训记 App 支持导出训练记录为 Excel/CSV
  - 在"数据同步"页面增加文件上传组件
  - 解析 CSV 格式，转换成 `workouts` 数组写入 localStorage
  - 这是**真实接入训记数据最现实的路径**

- [ ] **Vercel 部署改造**
  - 把项目改造成 Vercel Serverless 架构
  - 前端静态文件放 `public/`
  - 后端拆成 `api/chat.js` 和 `api/feedback.js`（Vercel Function）
  - 配置环境变量（API endpoint、API key）
  - **注意**：FRIDAY API 是美团内网服务，Vercel 外网无法访问，需要方案设计（如前端切换外网 LLM，或后端保留在内网机器）

- [ ] **SVG 肌肉图替换**
  - 用户可能有更好看的 SVG 素材
  - 替换 `renderMuscleMap()` 中的 SVG 代码
  - 保留 `muscleRegions()` 映射逻辑和 `is-active` 类控制高亮

- [ ] **UI 视觉风格升级**
  - 用户希望参考健身类网站（如训记、Keep 等）的视觉风格
  - 可能涉及配色、字体、卡片样式、交互动效等全面改版

### 6.2 中优先级（产品自然演进）
- [ ] **手动训练记录录入**
  - 表单方式添加/编辑训练记录
  - 比 CSV 导入更灵活，适合日常补录

- [ ] **训练计划 Undo/Redo**
  - 目前已保存备份到 `fitness-workouts-backup`
  - 需要在设置页面提供"恢复上一版本"按钮

- [ ] **动作库扩展**
  - `EXERCISE_STANDARDS` 目前只有 12 个动作
  - 需要覆盖更多常见动作

- [ ] **多周计划视图**
  - 目前只有单日推荐，需要周计划总览

- [ ] **数据可视化**
  - 重量趋势图、容量趋势图、RPE 变化图等

### 6.3 低优先级（锦上添花）
- [ ] 深色/浅色主题切换
- [ ] PWA 离线支持
- [ ] 训练计时器 / 组间休息提醒
- [ ] 图片上传（体型对比照）

---

## 七、已知问题与注意事项

### 7.1 LLM 相关问题
1. **FRIDAY API 不稳定**：LongCat-Flash-Chat 的 Function Calling 触发率不高，所以设计了前端 fallback `detectPlanChangeIntent()`
2. **API Key 管理**：当前 API Key 硬编码在 `server/llm-client.js` 中，需要改为环境变量
3. **内网限制**：FRIDAY API 只能在内网访问，部署到 Vercel 后需要切换外网 LLM

### 7.2 前端相关问题
1. **ES 模块缓存**：浏览器会缓存 ES module import，每次修改后必须在 `index.html` 中更新 `?v=N` 版本号
2. **localStorage 数据格式变更**：如果数据结构变化（如新增字段），需要写数据迁移逻辑或让用户清除数据重新加载
3. **移动端适配**：当前 CSS 有 `@media (max-width: 720px)` 响应式断点，但移动端体验还有优化空间

### 7.3 后端相关问题
1. **CORS**：当前后端允许所有来源（`*`），生产环境需要限制
2. **反馈日志无清理机制**：`feedback-log.jsonl` 会持续增长，需要定期清理或轮转
3. **无认证**：`/api/chat` 和 `/api/feedback` 是公开的，生产环境需要加认证

### 7.4 数据相关问题
1. **模拟数据 vs 真实数据**：当前 `workouts` 是 `data.js` 中的演示数据，用户实际训练后需要通过 CSV 导入或手动录入替换
2. **completedAt 字段**：目前统一为 `null`，真实使用时需要标记完成时间

---

## 八、关键代码约定

### 8.1 缓存清除版本号
每次修改 `app.js`、`styles.css`、`plan-modifier.js` 等被 `index.html` 引用的文件后，必须同步更新版本号：
```html
<link rel="stylesheet" href="./src/styles.css?v=7" />
<script type="module" src="./src/app.js?v=7"></script>
```
ES module import 也需要版本号：
```js
import { modifyPlan } from './plan-modifier.js?v=3';
```

### 8.2 状态管理
- 全局状态只有 `state` 一个对象
- 修改状态后必须调用 `saveProfile()` 写入 localStorage
- 修改状态后必须调用 `render()` 触发重新渲染
- 不要在 `render()` 内部修改状态，避免无限循环

### 8.3 事件委托
所有交互按钮使用 `data-*` 属性标识行为：
```html
<button data-page="today">今日建议</button>
<button data-pref="glute">臀腿偏翘臀</button>
<button data-chat-feedback="up" data-chat-index="0">👍</button>
```

### 8.4 Function Calling 约定
- 后端定义 `PLAN_TOOLS` schema
- LLM 返回 `functionCall` 时，后端透传给前端
- 前端解析 `functionCall.arguments` 后调用 `modifyPlan()`
- `modifyPlan()` 是规则引擎，LLM 不直接操作数据

### 8.5 数据格式
```js
// 训练记录
{
  id: 'w1',
  date: '2026-07-01',
  dayType: '推训练日',
  exercises: [
    {
      id: 'e1',
      name: '卧推',
      category: '主项',      // '主项' | '辅助' | '孤立'
      muscle: '胸',
      sets: [[70, 6], [70, 6], [70, 5]],  // [[weight, reps], ...]
      target: '3×6',
      rpe: 8.5,
      completedAt: null,      // Date string or null
    }
  ]
}

// 用户档案
{
  name: 'LJX',
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
  apiKeyMasked: 'xj_live_****_9A3F',
  lastSyncText: '2 小时前',
  currentDayType: '推训练日',
  painStatus: '无',
}
```

---

## 九、最近改动历史

### v7（当前版本）
1. **Tab 合并**：删除"训记连接"tab，将 API Key 配置和同步历史并入"数据同步"tab
2. **首页重构**：
   - 改为两列布局：左侧训练计划摘要列表，右侧 SVG 肌肉示意图
   - 每条动作右侧显示进度提示气泡（如"再完成 1 次达标，即可增重到 72.5 kg"）
   - 底部保留三张小卡片：训练状态、恢复情况、今日关键结论
3. **今日建议标签约束**：
   - 非腿训练日显示：标准推进、时间充分、今天状态一般、45 分钟快练、➕有氧
   - 腿训练日显示：标准推进、臀腿偏翘臀、腿部偏股四、今天状态一般、45 分钟快练
4. **训练分析重构**：
   - 维度一 · 按训练：展示最近一次训练的动作达标情况
   - 维度二 · 按肌肉：展示各肌群锻炼量 + 进度条 + 距达标还差多少组
   - 维度三 · 按动作：每个动作的趋势 + 标准动作要领 + 常见问题 + B 站教程链接
5. **训记 API 验证**：确认目前仅为 UI 状态模拟，无真实 API 调用

### v6（上一版本）
- AI 聊天功能完善
- Function Calling 支持计划修改
- 反馈收集系统（👍/👎/上报问题）
- 前端 fallback 意图检测

---

## 十、用户画像与偏好

**用户身份**：LJX，男，29 岁，训练年限 18 个月
**训练目标**：增肌优先，重点强化肩背
**训练分化**：推拉腿，每周 5 练
**当前训练日**：推训练日
**饮食阶段**：轻盈余增肌

这些数据是 Demo 数据，用户实际使用后会被替换。

---

## 十一、如何给 Codex 下指令

当用户想让 Codex 继续开发时，建议提供以下信息：

1. **先让 Codex 读这份文档**：`请读取 PROJECT_CONTEXT.md 了解项目全貌`
2. **明确具体任务**：不要只说"优化一下"，要说清楚改哪个页面、哪个组件、什么效果
3. **提供参考**：如果是 UI 改版，提供截图或参考网站链接
4. **更新版本号**：修改文件后提醒 Codex 更新 `index.html` 中的 `?v=N`
5. **验证步骤**：修改后让 Codex 截图验证页面效果

**常用指令模板**：
- "帮我实现训记 CSV 导入功能：在数据同步页面加一个文件上传组件，解析训记导出的 CSV，转换成 workouts 数组写入 localStorage。参考训记 CSV 格式：日期、动作名、组数、重量、次数..."
- "把 renderMuscleMap 里的 SVG 替换成我提供的这个更好看的版本：[贴 SVG 代码]。保持肌肉高亮逻辑不变。"
- "把项目改造成 Vercel 部署结构：前端静态文件放 public/，后端拆成 api/chat.js 和 api/feedback.js。"

---

*文档最后更新：2026-08-26*
