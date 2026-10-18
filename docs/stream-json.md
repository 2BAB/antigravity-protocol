# CLI 的 stream-json

## 背景

`agy` 默认是给人用的交互式终端。加上 `--input-format stream-json` 之后，它变成一台可以被程序驱动的机器：stdin 收 JSON，stdout 吐 JSON，一行一个。

这不是什么正式协议，只是 NDJSON（JSON Lines）的约定。Claude Code 早就在用同样的开关名，`agy` 沿用了这套命名，但事件结构是它自己的。

## 怎么起

```bash
agy --input-format stream-json \
    --output-format stream-json \
    --dangerously-skip-permissions \
    [--model <model>] [--conversation <id>]
```

注意两件事：不要传 `-p`，也不要把 prompt 放进 argv。进程起来后挂在 stdin 上等输入。stdout 是协议，stderr 是日志，别混。

## 一轮怎么走

往 stdin 写一行：

```json
{"event":"user","message":{"content":"你的任务"}}
```

stdout 会依次出现三种事件：

`init` 在开头，给出 `conversation_id`、`model` 和工具清单。

`step_update` 是过程。关心的字段有 `step_index`、`state`（ACTIVE / DONE）、`step_type`、`tool_name`、`text_delta`、`duration_seconds`、`usage`。`step_type` 常见取值是 `user_input`、`system_message`、`agent_response`、`tool`。

`result` 收尾，给出 `status`、`response`、`error`、`duration_seconds`、`num_turns`、`usage`。

写完一行必须等 `result` 回来，才能写下一条。没有 cancel-turn，也没有中途插话的接口。

## 续接：两种方式，差别不小

`--continue` 续的是「该工作目录下最近的一个会话」。听起来方便，但如果你有两个任务共用一个 cwd，它们会互相串。

`--conversation <id>` 指定确切会话 id，id 从 `init` 或 `result` 里拿。要做多会话就存 id，用这个。

## usage 的坑

`result.usage` 是**整个会话的累计值**，不是这一轮。直接拿来记账，第二转会重复计费。

正确做法是累加本轮所有 `step_type=agent_response && state=DONE` 的 `step_update.usage`。实在没有 per-step 数据，才退回 `result.usage` 的差分。

另一个坑是 `input_tokens` 有时已经扣掉了 cache read（`cache_read_tokens > input_tokens`，且 `total = input + output`）。这时候再做减法会把输入算成 0。判断条件写清楚：只有 `input >= cache` 时才减。

## 几件会让人困惑的小事

`--mode auto` 对某些账号不可用，会静默退回默认模式，日志里有一行 warning，不影响功能。

冷启动大概 2–5 秒。进程常驻之后，后续回合不付这个成本。

没有 idle 超时，进程会一直挂着。自己记得回收。

## 带走这三条

1. 一行一个 JSON，一问一答，`result` 之前不能写下一行。
2. 要用 `--conversation <id>` 做续接，别依赖 `--continue`。
3. usage 是累计的，按 per-step 求和才准。
