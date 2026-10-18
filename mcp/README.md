# agy-mcp

An MCP server that exposes the local Antigravity CLI (`agy`) as three tools, so
any MCP-capable host can call it.

## Why this exists

`agy` is straightforward to use directly, but integrating it into another agent
platform means writing an adapter: spawn a process, write stdin, parse events,
manage sessions, account for usage. This server packages that work once instead
of once per host.

## Tools

`agy_turn` runs one turn and returns the final text. Pass `conversationId` to
continue an existing conversation; omit it to start a new one.

`agy_sessions` lists known conversations and their state. `agy_close` stops the
process behind a conversation, which can still be resumed later.

Sessions are persistent by default: one process per conversation, reused across
turns. A cold start takes roughly two to three seconds and is paid once.
`stateless: true` starts an independent process per call instead; the tradeoff is
a cold start on every call.

## Environment variables

- `AGY_MCP_BIN` — path to `agy`; defaults to PATH lookup
- `AGY_MCP_MODEL` — default model
- `AGY_MCP_HTTP_PORT` — enables HTTP mode
- `AGY_MCP_HTTP_HOST` — defaults to `127.0.0.1`
- `AGY_MCP_TOKEN` — when set, requests must carry a bearer token
- `AGY_MCP_HOME` — session records directory, defaults to `~/.agy-mcp`
- `AGY_MCP_IDLE_MS` — idle reaping interval, defaults to five minutes
- `AGY_MCP_MAX_SESSIONS` — concurrent process limit, defaults to four

## Smoke test

```bash
node scripts/smoke.mjs
```

Runs a real `agy` turn and prints the reply. `scripts/smoke-modes.mjs` compares
persistent and stateless modes.

## Implementation notes

Responses must carry the `jsonrpc: "2.0"` envelope. Without it, MCP clients fail
schema validation and typically report only a generic connection error.

Usage counters are cumulative, so token totals here are summed from per-step
records rather than read from `result.usage`.

Latency per call varies widely in practice, from about five to twenty seconds.
That spread originates in the backend, not in this server.

## License

MIT.
