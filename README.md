# Antigravity (agy) 协议笔记

我把 `agy` 从命令行到 ACP 摸了两天，顺手写了个 MCP server。这个仓库装两样东西：一份关于它怎么跑的笔记，和一个能直接用的工具。

两样都来自同一个目的——让 agy 在我自己的工作流里跑得稳一点。笔记记的是实测到的行为，工具把踩过的坑固化了。

## 里面有什么

`docs/` 四篇：

- [stream-json](docs/stream-json.md) — 管道协议、事件格式、两种续接、usage 的坑
- [acp](docs/acp.md) — 官方 ACP server 的握手、认证、和 CLI 的差别
- [成本与审查](docs/costs-and-monitoring.md) — 为什么有的命令会多花一秒多
- [怎么量一次回合](docs/methodology.md) — 笨办法，但能重复

`mcp/` 一个 MCP server，把 agy 包成三个工具。零依赖，Node 24 直接跑 TypeScript，不用构建。

## 只想搞懂它怎么跑

从 [docs/stream-json.md](docs/stream-json.md) 开始。看完大概能明白为什么「接进去很简单，但很慢」。

## 想直接用

```bash
cd mcp
node src/index.ts
```

stdio 模式，宿主会自己拉起。要 HTTP：

```bash
AGY_MCP_HTTP_PORT=8787 node src/index.ts
curl http://127.0.0.1:8787/healthz
```

默认只监听 `127.0.0.1`。这个进程能执行本机命令，别改成 `0.0.0.0`。

接到宿主里的配置：

```json
{
  "mcpServers": {
    "agy": {
      "command": "node",
      "args": ["/absolute/path/to/antigravity-protocol/mcp/src/index.ts"],
      "env": { "AGY_MCP_MODEL": "gemini-3.8-flash-low" }
    }
  }
}
```

工具、环境变量、已知的坑，都在 [mcp/README.md](mcp/README.md)。

## 一个必须说的风险

用第三方宿主通过 Antigravity 的 OAuth 登录去驱动 `agy`，可能违反它的服务条款。ACP 支持用 API key 认证，走那条路更稳妥。细节在 [docs/acp.md](docs/acp.md) 的最后一节。

## 许可

代码 MIT，文档 CC BY 4.0。分别见 [LICENSE](LICENSE) 和 [LICENSE-docs](LICENSE-docs)。
