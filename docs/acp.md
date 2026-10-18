# ACP server

## 背景

ACP 是 Zed 提出的 Agent Client Protocol，用来让编辑器驱动 coding agent。`agy` 有一个官方的 ACP server，和 Antigravity 一起分发——不是 npm 包，是一个独立可执行文件，从官方渠道下载。

它的定位相当于 `agy` 的 app-server：有会话、有流式更新、能取消、能请求权限。

## 怎么起

下载官方分发包，解压后目录里通常有两个文件：ACP server 自身，以及一个 helper。两者要放在一起。直接运行 server 即可，它用 stdio 跑 JSON-RPC。

握手顺序：

1. `initialize`，带 `protocolVersion: 1` 和客户端能力
2. `authenticate`，`methodId` 选一种认证方式
3. `session/new`，带 `cwd`，需要的话带 `mcpServers`
4. 之后每轮 `session/prompt`

`session/prompt` 的返回值里有 `stopReason`，正常结束是 `end_turn`。

## 认证有四种

`initialize` 会把这些列出来：个人 Google 账号、企业账号、Gemini API key、Enterprise Agent Platform。

如果只是自己玩，OAuth 最省事。但要注意下面那条风险。

## 和 CLI 比，好在哪

正文是随 `session/prompt` 直接送进去的，不需要 agent 再去别处取一次。所以一轮只有一次模型生成，而不是「先查再回」两次。

另外它不经过 CLI 那层命令安全审查，每次工具调用省下 1–2 秒。它还支持 `session/cancel`，能真正打断一个回合。

`session/load` 可以从磁盘上已有的会话恢复，包括历史里的工具调用。

## 一个容易被误会的组件

server 启动时会起一个本地小代理，日志里写着 credentials injection proxy，监听 `127.0.0.1` 的随机端口。它的作用是把凭证注入到出站请求，让 agent 子进程本身拿不到 token。

它只在本机回环，不构成延迟来源。真正的延迟在 Google 的后端。

## 延迟

实测同一句「讲个笑话」：CLI 一次性调用 10 秒出头，桌面版 8–13 秒，ACP 一次 prompt 五秒到二十秒不等。

波动最大的不是协议，是后端。

## 关于服务条款

Antigravity 的服务条款明确禁止「使用第三方软件、工具或服务访问该服务」，并点名通过 OAuth 的第三方接入。用编辑器或别的 agent 平台驱动 `agy`，属于这个模式。

想避开这个风险，用 `authenticate` 里的 API key 方式，不要用 OAuth。Google 官方也是这么建议的。

## 带走这三条

1. ACP 是 `agy` 最接近 app-server 的接口：会话、流式、取消、权限，都有。
2. 正文随 prompt 直送，一轮一次生成。
3. 认证优先用 API key，别用 OAuth 走第三方。
