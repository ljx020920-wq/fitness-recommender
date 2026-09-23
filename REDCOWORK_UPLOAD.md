# REDcowork 提交说明

## 推荐导入方式

1. 使用项目根目录生成的 `forge-ai-redcowork.zip`。
2. 登录 REDcowork，点击首页输入框左侧的“添加附件”。
3. 上传 ZIP 后，将下方提示词完整发送给 REDcowork。
4. 等待应用生成，先在预览中完成验收，再点击右上角“上线”。
5. 上线成功后复制 REDcowork 作品链接，粘贴到小红书笔试提交页。

## 给 REDcowork 的首轮提示词

> 请基于我上传的代码包创建并运行这个 Web 应用，不要重做产品结构和视觉。它是一个 AI 渐进训练教练，核心闭环是“记录真实训练 → 生成下一次建议 → 通过对话调整今日计划 → 页面同步更新”。请优先保证现有 HTML、CSS 和 JavaScript 可以运行，并保留开屏双入口、今日建议、记录训练、三维度分析、肌肉图和 AI 对话。不要删除 `src/vendor/body-muscles.umd.min.js`。如果平台提供可供应用运行时调用的 AI 能力，请通过 `window.__FORGE_AI_CHAT__(payload)` 适配，返回 `{ reply, mode, functionCall }`；如果没有公开能力，请保留现有规则问答兜底，不要把 API Key 写入前端。训记同步页必须继续标注为部署演示，不得宣称已连接真实训记接口。

## 如果 REDcowork AI 可以接入

要求平台把模型能力封装为：

```js
window.__FORGE_AI_CHAT__ = async (payload) => {
  // payload 包含 messages、profile、trainingPlans、workoutLogs、clientDate
  // 调用平台模型能力后返回：
  return { reply: '回复文本', mode: 'live' };
};
```

计划修改最好返回：

```js
{
  reply: null,
  mode: 'live',
  functionCall: {
    name: 'modify_plan',
    arguments: '{"action":"change_day_type","targetDate":"YYYY-MM-DD","targetDayType":"胸训练日","reason":"用户今天想练胸"}'
  }
}
```

## 发布前验收

- 首屏同时看到“使用示例档案快速体验”和“创建我的训练档案”。
- 点击示例档案后，最近训练日期应在最近一周内。
- 肌肉图正反面完整显示，不出现空白区域。
- 选择“45 分钟快练”后，动作数量明显减少。
- 在 AI 对话输入“今天想练胸”，首页与今日计划同步变成胸训练日。
- AI 接口不可用时，顶部显示“规则问答 · 离线可用”，仍能回答“今天练什么”。
- 训记页面明确写明模拟，不保存真实 Key。
- 手机宽度下开屏、导航、聊天窗口和肌肉图均可使用。
- 用无痕窗口重新打开线上链接，完整走一遍示例体验。

## 不要上传的内容

- `.git/`
- `node_modules/`
- `.env`、`.env.local`
- `PROJECT_CONTEXT.md`
- `outputs/`
- `server/feedback-log.jsonl`

