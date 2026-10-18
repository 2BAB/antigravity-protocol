# Tool review cost

## Overview

Before running a tool, `agy` performs a check. The checker is compiled into the
binary; no flag or configuration file exposes it.

The check itself is cheap, on the order of tens of microseconds. When it flags a
call, a small language model reviews it. That review takes one to one and a half
seconds and is a model call, so it consumes quota.

## Three outcomes

A command on the built-in allowlist, such as `git`, `npm`, `head`, or `tail`,
is accepted with no review.

A command the checker does not recognize, including a project-local script or an
internal CLI, is flagged as `unknown_command` and reviewed.

A tool outside the checker's known set, such as a tool reached through MCP, is
reported as `unsupported_tool` and reviewed.

In observed runs the review almost always passes. The cost is the round trip,
not a blocked call.

## Observations

The review takes one to one and a half seconds regardless of task complexity.

Permission configuration does not change this. Adding an entry such as
`command(<name>)` to the permission grants still results in an
`unknown_command` review. That configuration controls whether the user is
prompted, not whether the review runs.

`--dangerously-skip-permissions` does not affect it either. That flag disables
interactive confirmation.

## Context and per-turn cost

Measured with one model and one short prompt:

- new session, about fourteen thousand input tokens: roughly seven to eight
  seconds
- same session, about two thousand new tokens plus twelve thousand cached: five
  to twenty-two seconds
- larger contexts: slower still

The spread within one row is backend queueing rather than local work.

## Model tier

Comparing flash and argon tiers on the same short task, per-hop timings overlap.
Differences between runs exceed differences between tiers, so changing the tier
is not a reliable way to reduce latency.

## Summary

1. Every unrecognized tool call costs an extra one to one and a half seconds.
   Fewer, larger calls are cheaper than many small ones.
2. The review is part of the CLI itself and has no configuration surface, so
   budget for it rather than trying to remove it.
