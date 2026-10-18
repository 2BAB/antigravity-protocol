# agy-mcp

把本机的 Antigravity CLI（`agy`）包成一个 MCP server，任何支持 MCP 的宿主都能把它当工具调用。

## 为什么有这个东西

`agy` 本身好用，但要接进别的 agent 平台，你得写适配器：起进程、写 stdin、解析事件、管会话、算 usage。这些我写了一遍，抽成 MCP 工具，省得每个宿主重写。

## 三个工具

`agy_turn` 跑一个回合，返回 agy 的最终文本。传 `conversationId` 续接会话，不传就是新会话。

`agy_sessions` 列出已知会话和状态。`agy_close` 关掉某个会话的进程，会话还能再续。

默认常驻：一个会话一个进程，跨回合复用。启动一次两三秒，之后不重复付。想每轮起独立进程就加 `stateless: true`，代价是每次冷启动。

## 环境变量

- `AGY_MCP_BIN`，`agy` 路径，默认走 PATH
- `AGY_MCP_MODEL`，默认模型
- `AGY_MCP_HTTP_PORT`，设了就开 HTTP 模式
- `AGY_MCP_HTTP_HOST`，默认 `127.0.0.1`
- `AGY_MCP_TOKEN`，设了就要求 bearer token
- `AGY_MCP_HOME`，会话记录目录，默认 `~/.agy-mcp`
- `AGY_MCP_IDLE_MS`，空闲回收，默认五分钟
- `AGY_MCP_MAX_SESSIONS`，常驻进程上限，默认 4

## 冒烟测试

```bash
node scripts/smoke.mjs
```

会真的跑一次 agy，回一个 PONG。`scripts/smoke-modes.mjs` 对比常驻和一次性两种模式。

## 三个踩过的坑

返回体必须带 `jsonrpc: "2.0"` 信封。漏了客户端 schema 校验不过，很多宿主只报一句「连不上」，很难查。

usage 是累计值，不是单轮。所以这里按 per-step 求和，不直接读 `result.usage`。

单次调用延迟方差很大，五秒到二十秒都见过。这是 agy 后端的排队，不是这个 server 的问题。

## 许可

MIT。
