# Antigravity (agy) protocol notes

This repository collects two things: notes on how the Antigravity CLI (`agy`)
behaves when driven by another program, and a small MCP server that exposes it
as three tools.

Both come from the same exercise: running `agy` as a worker inside an agent
host. The notes record observable behavior. The server packages the parts that
are easy to get wrong.

## Contents

`docs/`

- [stream-json](docs/stream-json.md) — the line-delimited JSON transport, event
  shapes, resuming a conversation, token accounting
- [acp](docs/acp.md) — the ACP server: handshake, authentication, and how it
  differs from the CLI
- [costs and monitoring](docs/costs-and-monitoring.md) — why some tool calls
  take an extra second or two
- [methodology](docs/methodology.md) — a small, repeatable way to measure a turn

`mcp/`

An MCP server that wraps `agy` as three tools. No dependencies; Node 24 runs the
TypeScript sources directly, with no build step.

## Where to start

For the transport, start with [docs/stream-json.md](docs/stream-json.md). It
explains why an integration can be simple to build and still feel slow.

For the server, see [mcp/README.md](mcp/README.md).

## Quick start

```bash
cd mcp
node src/index.ts
```

stdio mode; the host spawns the process. For HTTP:

```bash
AGY_MCP_HTTP_PORT=8787 node src/index.ts
curl http://127.0.0.1:8787/healthz
```

The server binds to `127.0.0.1` by default. It can execute commands on the
machine it runs on, so it should not be exposed on a public interface.

Registering it with a host:

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

## What the server exposes

`agy_turn` runs one turn and returns the final text. `agy_sessions` lists known
conversations. `agy_close` stops the process behind one of them.

Sessions are persistent by default: one process per conversation, reused across
turns. `stateless: true` starts a fresh process for a single call instead.

## Notes for integrators

Three details that took time to get right:

- Responses need the `jsonrpc: "2.0"` envelope. Without it, MCP clients reject
  the payload during schema validation and usually surface only a generic
  connection error.
- Usage counters reported by `agy` are cumulative for the session. Per-turn
  accounting has to be derived from per-step records.
- Per-call latency varies widely, from about five to twenty seconds in observed
  runs, independent of the integration layer.

## Authentication and terms

`agy` and its ACP server support both Google account sign-in and API key
authentication. Antigravity's terms describe access to the service through
third-party tools as outside the agreement. If that matters for your setup, API
key authentication avoids the question entirely; see
[docs/acp.md](docs/acp.md#authentication).

## License

Code is MIT ([LICENSE](LICENSE)). Documentation is CC BY 4.0
([LICENSE-docs](LICENSE-docs)).
