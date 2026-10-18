import { closeSession, listSessions, runTurn } from './pool.ts'
import { runOneShot } from './oneshot.ts'

export const TOOLS = [
  {
    name: 'agy_turn',
    title: 'Run one agy turn',
    description:
      'Run ONE turn of the local Antigravity (agy) CLI and return its final text. ' +
      'DEFAULT is a warm, persistent agy process per conversation (fastest across turns): ' +
      'pass conversationId to continue an existing conversation, omit it to start a new one. ' +
      'Set stateless=true ONLY when you explicitly want one process per call (cold start each ' +
      'time, resume via --continue, no pool). One call = one full turn either way.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The instruction for agy.' },
        conversationId: { type: 'string', description: 'Continue this agy conversation id (persistent mode only).' },
        cwd: { type: 'string', description: 'Working directory for agy (defaults to the server cwd).' },
        model: { type: 'string', description: 'Model id, e.g. gemini-4-argon-high or gemini-3.8-flash-low.' },
        timeoutMs: { type: 'number', description: 'Turn timeout in ms (default 180000).' },
        stateless: {
          type: 'boolean',
          description:
            'Opt-in per-turn isolation: spawn one agy process for this call and let it exit. ' +
            'Costs a cold start every time. Default false (persistent session).',
        },
        continueSession: {
          type: 'boolean',
          description:
            'Stateless mode only: pass --continue to resume the most recent conversation in that cwd. ' +
            'Weaker than conversationId: two tasks sharing a cwd can cross-talk.',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'agy_sessions',
    title: 'List agy sessions',
    description: 'List known agy conversations with liveness and last-used time.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'agy_close',
    title: 'Close an agy session',
    description: 'Kill the agy process for a conversation (the conversation itself stays resumable).',
    inputSchema: {
      type: 'object',
      properties: { conversationId: { type: 'string' } },
      required: ['conversationId'],
    },
  },
] as const

export async function callTool(name: string, args: any): Promise<{ text: string; isError?: boolean }> {
  if (name === 'agy_turn') {
    const prompt = String(args?.prompt ?? '').trim()
    if (!prompt) return { text: 'prompt is required', isError: true }
    if (args?.stateless === true) {
      const res = await runOneShot({
        prompt,
        cwd: args?.cwd ?? process.cwd(),
        model: args?.model ?? null,
        continueSession: args?.continueSession === true,
        timeoutMs: args?.timeoutMs && args.timeoutMs > 0 ? args.timeoutMs : 180_000,
      })
      const meta = JSON.stringify({
        mode: 'stateless',
        conversationId: res.conversationId,
        model: res.model,
        elapsedMs: res.elapsedMs,
        usage: res.usage,
        continued: args?.continueSession === true,
      })
      return { text: `${res.text.trim()}\n\n---\nagy-mcp: ${meta}` }
    }
    const res = await runTurn({
      prompt,
      conversationId: args?.conversationId ?? null,
      cwd: args?.cwd ?? null,
      model: args?.model ?? null,
      timeoutMs: args?.timeoutMs,
    })
    const meta = JSON.stringify({
      mode: 'persistent',
      conversationId: res.conversationId,
      model: res.model,
      elapsedMs: res.elapsedMs,
      toolUses: res.toolUses,
      usage: res.usage,
      reusedProcess: res.reused,
      turn: res.record.turns,
    })
    return { text: `${res.text.trim()}\n\n---\nagy-mcp: ${meta}` }
  }
  if (name === 'agy_sessions') {
    return { text: JSON.stringify(listSessions(), null, 2) }
  }
  if (name === 'agy_close') {
    const id = String(args?.conversationId ?? '')
    if (!id) return { text: 'conversationId is required', isError: true }
    return { text: closeSession(id) ? `closed ${id}` : `no live process for ${id}` }
  }
  return { text: `unknown tool: ${name}`, isError: true }
}
