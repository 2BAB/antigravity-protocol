# Stream-json transport

## Overview

`agy` runs interactively by default. Adding `--input-format stream-json` makes it
scriptable: newline-delimited JSON on stdin, the same on stdout.

This is a convention rather than a formal specification. Claude Code uses the
same flag names; the event shapes described here are specific to `agy`.

## Starting a process

```bash
agy --input-format stream-json \
    --output-format stream-json \
    --dangerously-skip-permissions \
    [--model <model>] [--conversation <id>]
```

Two constraints. Do not pass `-p`, and do not put the prompt in argv: the
process reads stdin and stays alive between turns. Treat stdout as protocol data
and stderr as logs.

## Turn structure

Write one line to stdin:

```json
{"event":"user","message":{"content":"your task"}}
```

Three event types follow on stdout.

`init` arrives first and carries `conversation_id`, `model`, and the tool list.

`step_update` describes progress. Relevant fields are `step_index`, `state`
(`ACTIVE` or `DONE`), `step_type`, `tool_name`, `text_delta`,
`duration_seconds`, and `usage`. Common `step_type` values are `user_input`,
`system_message`, `agent_response`, and `tool`.

`result` closes the turn with `status`, `response`, `error`,
`duration_seconds`, `num_turns`, and `usage`.

One turn may be in flight at a time. The next user event must wait for the
`result`. There is no cancel or mid-turn input.

## Resuming a conversation

`--continue` resumes the most recent conversation in the current working
directory. It is convenient, but two tasks that share a directory will resume
each other's context.

`--conversation <id>` resumes a specific conversation. The id comes from `init`
or `result`. Applications that keep several sessions should store the id and use
this form.

## Token accounting

`result.usage` is cumulative for the session, not for the turn. Using it as a
per-turn value re-bills earlier turns.

The accurate approach is to sum `usage` from every `step_update` with
`step_type=agent_response` and `state=DONE`. The `result.usage` delta is a
fallback when no per-step records were emitted.

A second detail: `input_tokens` is sometimes already net of cache reads
(`cache_read_tokens > input_tokens`, and `total = input + output`). Subtracting
cache in that case clamps input to zero. Subtract only when
`input_tokens >= cache_read_tokens`.

## Operational notes

`--mode auto` is not available for every account. The CLI logs a warning and
continues in its default mode; functionality is unaffected.

Cold start takes roughly two to five seconds. A persistent process avoids paying
it on later turns.

There is no idle timeout. Processes stay alive until the host reaps them.

## Summary

1. One JSON object per line, strictly one turn at a time.
2. Resume with `--conversation <id>` rather than `--continue`.
3. Derive per-turn usage from step records, not from the cumulative result.
