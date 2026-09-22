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
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`（可选）

如果没有配置 `OPENAI_API_KEY`，后端会自动回退到 mock 响应，这样也能跑通聊天流程。

## 说明

- 训练计划和实际完成记录分别保存；只有在“记录训练”中提交的数据会进入分析和下一次推荐。
- AI 对话修改今天的训练类型后，首页、今日建议和个人设置会使用同一份今日计划。
- 训练分析支持按胸、背、肩、手臂、核心、臀、腿筛选，并使用前后视交互肌肉图展示训练部位。
- 多文件版（通过 http://localhost:3001 访问）支持聊天接口调用。
- 单文件版 `fitness_recommender_standalone.html` 仅用于展示，聊天面板会提示需要启动后端服务。
