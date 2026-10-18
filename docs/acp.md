# ACP server

## Overview

ACP (Agent Client Protocol) is a protocol proposed by Zed for editors to drive
coding agents. Antigravity ships an official ACP server alongside the CLI. It is
a separate executable distributed through the official channel rather than an
npm package, and runs over JSON-RPC on stdio.

It is the closest equivalent to an app-server: sessions, streaming updates,
cancellation, and permission requests.

## Launch and handshake

Download the official package, extract it, and run the server. The bundle
contains the server and a helper binary that must stay beside it.

The handshake has three steps:

1. `initialize` with `protocolVersion: 1` and client capabilities.
2. `authenticate` with one of the advertised auth method ids.
3. `session/new` with `cwd`, and `mcpServers` if the session needs tools.

Each turn is then one `session/prompt`. The response carries a `stopReason`;
`end_turn` indicates a normal completion.

## Authentication

`initialize` advertises four methods: a personal Google account, a Google
business account, a Gemini API key, and the Gemini Enterprise Agent Platform.
The first two use OAuth. The API key options do not depend on an Antigravity
account.

## Differences from the CLI

The prompt body is delivered inside `session/prompt`. The agent does not need to
fetch it from anywhere else, so a turn is one model generation rather than a
fetch followed by a reply.

The ACP server also does not run the CLI's command review described in
[costs and monitoring](costs-and-monitoring.md), which removes one to two
seconds per tool call.

`session/cancel` cancels a running turn. `session/load` restores a conversation
from its on-disk record, including the tool calls in its history.

## The local credential proxy

At startup the server binds a small proxy on a random `127.0.0.1` port and logs
it as a credentials injection proxy. The proxy attaches credentials to outbound
requests so the agent process itself never holds a token.

It is loopback-only and does not add measurable latency. Time spent per turn is
in the backend, not in this proxy.

## Latency

Observed on one machine with the same prompt: a one-shot CLI call took about ten
seconds, the desktop application eight to thirteen, and a single ACP
`session/prompt` five to twenty. Run-to-run variance is larger than the
difference between transports.

## Authentication and terms

Antigravity's terms describe access to the service through third-party software
or tools as outside the agreement. Using OAuth from a non-Google host falls under
that description. The API key methods advertised during `initialize` avoid the
question and are the recommended choice for third-party integrations.

## Summary

1. ACP is the app-server-shaped interface: sessions, streaming, cancel,
   permission requests.
2. The prompt is delivered with the request, so a turn is one generation.
3. For third-party hosts, prefer API key authentication.
