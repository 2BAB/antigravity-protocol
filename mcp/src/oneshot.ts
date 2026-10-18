import { spawn } from 'node:child_process'
import { AGY_BIN, normalizeUsage, type TurnResult } from './agy.ts'

export interface OneShotOptions {
  prompt: string
  cwd: string
  model?: string | null
  /** `--continue`: resume the workspace's most recent conversation. agy offers no
   *  explicit conversation id in this mode, so this is WEAKER than the persistent
   *  path's `--conversation <id>` — two tasks sharing a cwd can cross-talk. */
  continueSession?: boolean
  timeoutMs: number
}

/**
 * One process per call: `agy` with piped stdin prints the reply on stdout and
 * exits. Pays the cold start every time, needs no process pool — the escape
 * hatch for hosts that explicitly prefer per-turn isolation.
 */
export async function runOneShot(opts: OneShotOptions): Promise<TurnResult> {
  const args = [
    '--output-format', 'json',
    '--dangerously-skip-permissions',
    '--print-timeout', `${Math.max(1, Math.ceil(opts.timeoutMs / 1000))}s`,
  ]
  if (opts.continueSession) args.push('--continue')
  if (opts.model) args.push('--model', opts.model)

  const started = Date.now()
  const child = spawn(AGY_BIN, args, { cwd: opts.cwd, stdio: ['pipe', 'pipe', 'pipe'] })
  let out = ''
  let errTail: string[] = []
  child.stdout.on('data', (d: Buffer) => { out += d.toString('utf8') })
  child.stderr.on('data', (d: Buffer) => {
    for (const l of d.toString('utf8').split('\n')) if (l.trim()) {
      errTail.push(l.trim())
      if (errTail.length > 20) errTail.shift()
    }
  })

  return await new Promise<TurnResult>((resolve, reject) => {
    let settled = false
    const finish = (fn: () => void) => { if (settled) return; settled = true; clearTimeout(timer); fn() }
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL') } catch {}
      finish(() => reject(new Error(`one-shot turn timed out after ${opts.timeoutMs}ms`)))
    }, opts.timeoutMs)

    child.on('error', (e: Error) => finish(() => reject(new Error(`agy spawn failed: ${e.message}`))))
    child.on('close', (code: number | null) => {
      const tail = errTail.slice(-3).join(' | ')
      let parsed: any = null
      const line = out.split('\n').map((s) => s.trim()).reverse().find((s) => s.startsWith('{'))
      if (line) { try { parsed = JSON.parse(line) } catch {} }
      if (!parsed) {
        finish(() => reject(new Error(`agy produced no JSON result (code ${code})${tail ? ` — ${tail.slice(0, 300)}` : ''}`)))
        return
      }
      if (parsed.status && parsed.status !== 'SUCCESS') {
        finish(() => reject(new Error(`engine turn failed: ${parsed.error || parsed.status}`)))
        return
      }
      finish(() => resolve({
        text: typeof parsed.response === 'string' ? parsed.response : '',
        conversationId: typeof parsed.conversation_id === 'string' ? parsed.conversation_id : null,
        model: typeof parsed.model === 'string' ? parsed.model : (opts.model || null),
        usage: normalizeUsage(parsed.usage) ?? { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 },
        elapsedMs: Date.now() - started,
        toolUses: 0,
      }))
    })

    child.stdin.on('error', () => {})
    child.stdin.write(opts.prompt)
    child.stdin.end()
  })
}
