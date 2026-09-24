# FORGE AI 健身助手 MVP

## 启动方式

1. 首次打开项目时安装依赖

```bash
npm install
```

2. 启动本地服务（页面和 AI 接口会一起启动）

```bash
npm run dev
```

3. 打开浏览器访问

[http://localhost:3001](http://localhost:3001)

## 环境变量

后端会读取以下环境变量：

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`（使用真实模型时必填）
- `OPENAI_MODEL`（可选）

如果没有配置 `OPENAI_API_KEY`，后端会自动回退到 mock 响应，这样也能跑通聊天流程。

## 部署到 Vercel

1. 将本项目推送到 GitHub 仓库。
2. 在 Vercel 中选择 **Add New → Project**，导入该仓库。
3. Framework Preset 选择 **Other**；构建命令和输出目录保持为空，根目录使用仓库根目录。
4. 不配置环境变量也可以运行，聊天会使用规则问答或 mock 兜底。
5. 如需启用真实模型，在 Vercel Project Settings → Environment Variables 中配置：
   - `OPENAI_API_KEY`
   - `OPENAI_BASE_URL`（例如兼容 OpenAI Chat Completions 的服务地址）
   - `OPENAI_MODEL`（可选）
6. 部署完成后用无痕窗口检查：首页、今日建议、记录训练、训练分析、AI 对话和数据同步说明。

`vercel.json` 已声明 `/api/chat` 与 `/api/feedback` 两个 Serverless Functions。不要把 API Key 写入前端文件或提交到 GitHub。

## 说明

- 训练计划和实际完成记录分别保存；只有在“记录训练”中提交的数据会进入分析和下一次推荐。
- AI 对话修改今天的训练类型后，首页、今日建议和个人设置会使用同一份今日计划。
- 训练分析支持按胸、背、肩、手臂、核心、臀、腿筛选，并使用前后视交互肌肉图展示训练部位。
- 按动作分析会显示每个动作的主要与辅助肌群；手机端使用紧凑卡片和正反面切换，避免人体图连续占据多屏。
- 多文件版（通过 http://localhost:3001 访问）支持聊天接口调用。
- AI 接口不可用时，聊天会自动切换为浏览器内的规则问答，计划修改仍可使用。
- 训记 Key 页面是部署演示，不会保存或发送真实 Key；当前仅完成本地接入流程骨架，等待官方接口权限后再接入真实数据。
- 肌肉图运行文件已放在 `src/vendor/`，线上不依赖公开访问 `node_modules`。

## REDcowork AI 适配点

如 REDcowork 提供模型调用能力，只需在页面加载前注入以下函数，无需修改产品业务逻辑：

```js
window.__FORGE_AI_CHAT__ = async function (payload) {
  // 在这里调用 REDcowork 提供的模型能力。
  // 返回纯文本，或返回 { reply, mode, functionCall }。
  return { reply: '模型回复', mode: 'live' };
};
```

如果平台没有公开的运行时 AI API，不注入该函数即可，产品会优先尝试 `/api/chat`，失败后自动使用规则问答。

详细导入与验收步骤见 `REDCOWORK_UPLOAD.md`。
