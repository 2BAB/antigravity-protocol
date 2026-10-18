# Measuring a turn

## Overview

Agent latency is easy to measure incorrectly. These are the steps that produced
numbers consistent with what a user sees.

## Three numbers

Wall clock time from request to reply. This is what a user experiences.

Per-hop time for a single model round trip. A turn may contain several.

Token counts, with input, output, and cache reads recorded separately.

## Cumulative counters

Some reported usage values are cumulative for the session rather than the turn.

The signal is arithmetic: if the cache read count is larger than the prompt
token count, the value cannot describe a single request.

A reliable approach is to read the counter before and after each turn and
subtract.

## A workable procedure

Fix the prompt and the model. Run the same call at least three times; a single
sample is not enough, because observed spread reaches four times within one
configuration.

For each run record wall clock, number of model generations in the turn, and
input, cache, and output tokens per generation.

Generation counts can be read from logs. For the CLI transport, count
`agent_response` steps. For ACP, count usage update notifications.

## Control experiments

Running the same task on a second engine shows which side of the integration
owns the cost.

In one comparison, a second engine completed a turn in nineteen seconds with
seven model generations, while `agy` took forty-four seconds with three. Per-hop
cost differed by three to five times; hop count did not explain it.

Without a control, it is easy to attribute backend behavior to the integration
layer.

## Tool calls

Each tool call adds a model generation and, on the CLI transport, possibly a
review (see [costs and monitoring](costs-and-monitoring.md)). Record the call
count alongside timings so review time is not attributed to the model.

## Summary

1. Repeat measurements at least three times before drawing conclusions.
2. When cache reads exceed prompt tokens, suspect a cumulative counter.
