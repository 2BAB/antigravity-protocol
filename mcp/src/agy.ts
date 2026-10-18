import { spawn } from 'node:child_process'

export const AGY_BIN = process.env.AGY_MCP_BIN || 'agy'
const DEFAULT_MODEL = process.env.AGY_MCP_MODEL || ''

export interface Usage { input_tokens: number; output_tokens: number; cache_read_input_tokens: number }
export interface TurnResult {
  text: string
  conversationId: string | null
  model: string | null
  usage: Usage
  elapsedMs: number
  toolUses: number
}

interface RawUsage { input_tokens?: number; output_tokens?: number; cache_read_tokens?: number }

function num(v: unknown): number { return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : 0 }

/** agy reports input_tokens sometimes gross (>= cache) and sometimes net of cache. */
export function normalizeUsage(raw: RawUsage | undefined): Usage | undefined {
  if (!raw) return undefined
  const cached = num(raw.cache_read_tokens)
  const rawIn = num(raw.input_tokens)
  const input = rawIn >= cached ? rawIn - cached : rawIn
  const output = num(raw.output_tokens)
  if (!input && !output && !cached) return undefined
  return { input_tokens: input, output_tokens: output, cache_read_input_tokens: cached }
}

function addUsage(acc: Usage, step: RawUsage): Usage {
  const u = normalizeUsage(step)!
  return {
    input_tokens: acc.input_tokens + u.input_tokens,
    output_tokens: acc.output_tokens + u.output_tokens,
    cache_read_input_tokens: acc.cache_read_input_tokens + u.cache_read_input_tokens,
  }
}

const EMPTY: Usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 }

export class AgySession {
  private child: ReturnType<typeof spawn>
  private buf = ''
  private stderrTail: string[] = []
  private pending: { resolve: (r: TurnResult) => void; reject: (e: Error) => void } | null = null
  private startedAt = 0
  private usage: Usage = { ...EMPTY }
  private toolUses = 0
  private text = ''
  private seenTool = new Set<number>()
  private seenResp = new Set<number>()
  private exited = false
  conversationId: string | null
  model: string | null
  lastUsedAt = Date.now()

  constructor(opts: { cwd: string; model?: string | null; conversationId?: string | null }) {
    const args = [
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--mode', 'auto',
      '--dangerously-skip-permissions',
      '--disable-slash-commands',
    ]
    if (opts.conversationId) args.push('--conversation', opts.conversationId)
    const model = opts.model || DEFAULT_MODEL
    if (model) args.push('--model', model)
    this.conversationId = opts.conversationId ?? null
    this.model = model || null
    this.child = spawn(AGY_BIN, args, { cwd: opts.cwd, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env } })
    this.child.stdout!.on('data', (d: Buffer) => this.onData(d))
    this.child.stderr!.on('data', (d: Buffer) => {
      for (const line of d.toString('utf8').split('\n')) if (line.trim()) {
        this.stderrTail.push(line.trim())
        if (this.stderrTail.length > 40) this.stderrTail.shift()
      }
    })
    this.child.on('close', (code: number | null) => { this.exited = true; this.fail(`agy exited (code ${code})${this.stderrHint()}`) })
    this.child.on('error', (e: Error) => { this.exited = true; this.fail(`agy spawn failed: ${e.message}`) })
  }

  get alive(): boolean { return !this.exited && this.child.stdin?.writable === true }

  async send(prompt: string, timeoutMs: number): Promise<TurnResult> {
    if (this.pending) throw new Error('session busy: a turn is already in flight')
    if (!this.alive) throw new Error(`session is not alive${this.stderrHint()}`)
    this.usage = { ...EMPTY }; this.toolUses = 0; this.text = ''
    this.seenTool.clear(); this.seenResp.clear()
    this.startedAt = Date.now()
    this.lastUsedAt = this.startedAt
    const done = new Promise<TurnResult>((resolve, reject) => { this.pending = { resolve, reject } })
    const timer = setTimeout(() => {
      this.fail(`turn timed out after ${timeoutMs}ms`)
      this.kill()
    }, timeoutMs)
    done.finally(() => clearTimeout(timer)).catch(() => {})
    this.child.stdin!.write(JSON.stringify({ event: 'user', message: { content: prompt } }) + '\n')
    return done
  }

  private stderrHint(): string {
    const tail = this.stderrTail.slice(-3).join(' | ')
    return tail ? ` — ${tail.slice(0, 300)}` : ''
  }

  private onData(d: Buffer): void {
    this.buf += d.toString('utf8')
    let i: number
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i).trim()
      this.buf = this.buf.slice(i + 1)
      if (!line.startsWith('{')) continue
      let ev: any
      try { ev = JSON.parse(line) } catch { continue }
      this.observe(ev)
    }
  }

  private observe(ev: any): void {
    const id = ev.conversation_id ?? ev.init?.conversation_id ?? ev.result?.conversation_id
    if (typeof id === 'string' && id) this.conversationId = id
    const named = ev.init?.model ?? ev.result?.model
    if (typeof named === 'string' && named) this.model = named

    if (ev.event === 'step_update') {
      const s = ev.step_update
      if (!s) return
      if (s.tool_info != null && s.state === 'DONE' && typeof s.step_index === 'number' && !this.seenTool.has(s.step_index)) {
        this.seenTool.add(s.step_index); this.toolUses += 1
      }
      if (s.step_type === 'agent_response' && s.state === 'DONE' && s.usage) {
        const idx = typeof s.step_index === 'number' ? s.step_index : null
        if (idx === null || !this.seenResp.has(idx)) {
          if (idx !== null) this.seenResp.add(idx)
          this.usage = addUsage(this.usage, s.usage)
        }
      }
      if (s.step_type === 'agent_response' && typeof s.text_delta === 'string') this.text = s.text_delta
      return
    }
    if (ev.event !== 'result' || !ev.result) return
    const r = ev.result
    const text = typeof r.response === 'string' ? r.response : this.text
    const error = r.status && r.status !== 'SUCCESS' ? String(r.error || r.status) : null
    if (error) { this.fail(`engine turn failed: ${error}`); return }
    const p = this.pending
    if (!p) return
    this.pending = null
    p.resolve({
      text,
      conversationId: this.conversationId,
      model: this.model,
      usage: this.usage,
      elapsedMs: Date.now() - this.startedAt,
      toolUses: this.toolUses,
    })
  }

  private fail(message: string): void {
    const p = this.pending
    if (!p) return
    this.pending = null
    p.reject(new Error(message))
  }

  kill(): void {
    this.exited = true
    try { this.child.stdin?.end() } catch {}
    try { this.child.kill('SIGKILL') } catch {}
  }
}
