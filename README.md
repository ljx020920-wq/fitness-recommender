# 健身进阶推荐器 Demo

## 启动方式

1. 先启动后端服务

```bash
npm run dev
```

2. 再启动前端静态服务

```bash
npm run serve
```

3. 打开浏览器访问

[http://localhost:8080](http://localhost:8080)

## 环境变量

后端会读取以下环境变量：

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`（可选）

如果没有配置 `OPENAI_API_KEY`，后端会自动回退到 mock 响应，这样也能跑通聊天流程。

## 说明

- 多文件版（通过 http://localhost:8080 访问）支持聊天接口调用。
- 单文件版 `fitness_recommender_standalone.html` 仅用于展示，聊天面板会提示需要启动后端服务。
