import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { AgySession, type TurnResult } from './agy.ts'

export interface SessionRecord {
  conversationId: string
  model: string | null
  cwd: string
  createdAt: number
  lastUsedAt: number
  turns: number
}

const HOME = process.env.AGY_MCP_HOME || join(homedir(), '.agy-mcp')
const FILE = join(HOME, 'sessions.json')
const IDLE_MS = Number(process.env.AGY_MCP_IDLE_MS || 300_000)
const MAX_SESSIONS = Number(process.env.AGY_MCP_MAX_SESSIONS || 4)

const live = new Map<string, AgySession>()
let seq = 0

function load(): SessionRecord[] {
  try { return JSON.parse(readFileSync(FILE, 'utf8')) as SessionRecord[] } catch { return [] }
}
function save(records: SessionRecord[]): void {
  try { mkdirSync(HOME, { recursive: true }); writeFileSync(FILE, JSON.stringify(records, null, 2) + '\n') } catch {}
}
let records: SessionRecord[] = load()

function upsert(res: TurnResult, cwd: string): SessionRecord {
  if (!res.conversationId) throw new Error('agy returned no conversation id')
  const now = Date.now()
  const existing = records.find((r) => r.conversationId === res.conversationId)
  if (existing) {
    existing.lastUsedAt = now; existing.turns += 1
    if (res.model) existing.model = res.model
    return existing
  }
  const rec: SessionRecord = { conversationId: res.conversationId, model: res.model, cwd, createdAt: now, lastUsedAt: now, turns: 1 }
  records.push(rec)
  return rec
}

function evictIfNeeded(): void {
  if (live.size < MAX_SESSIONS) return
  const idle = [...live.entries()]
    .filter(([, s]) => !s.pending)
    .sort((a, b) => a[1].lastUsedAt - b[1].lastUsedAt)[0]
  if (idle) { idle[1].kill(); live.delete(idle[0]) }
}

export async function runTurn(input: {
  prompt: string
  conversationId?: string | null
  cwd?: string | null
  model?: string | null
  timeoutMs?: number
}): Promise<TurnResult & { reused: boolean; record: SessionRecord }> {
  const cwd = input.cwd || process.cwd()
  const timeoutMs = input.timeoutMs && input.timeoutMs > 0 ? input.timeoutMs : 180_000
  const known = input.conversationId || null

  let key: string
  let session: AgySession | undefined
  let reused = false
  if (known && live.has(known)) {
    session = live.get(known)
    if (session && !session.alive) { live.delete(known); session = undefined }
  }
  if (!session) {
    evictIfNeeded()
    key = known || `new-${++seq}`
    const rec = known ? records.find((r) => r.conversationId === known) : undefined
    session = new AgySession({ cwd: rec?.cwd || cwd, model: input.model || rec?.model || null, conversationId: known })
    live.set(key, session)
  } else {
    key = known as string
    reused = true
  }

  const res = await session.send(input.prompt, timeoutMs)
  const record = upsert(res, cwd)
  save(records)
  if (key !== record.conversationId) {
    live.delete(key)
    live.set(record.conversationId, session)
  }
  return { ...res, reused, record }
}

export function listSessions(): Array<SessionRecord & { alive: boolean; busy: boolean }> {
  return records.map((r) => {
    const s = live.get(r.conversationId)
    return { ...r, alive: Boolean(s?.alive), busy: Boolean(s?.pending) }
  })
}

export function closeSession(conversationId: string): boolean {
  const s = live.get(conversationId)
  if (!s) return false
  s.kill(); live.delete(conversationId)
  return true
}

setInterval(() => {
  const now = Date.now()
  for (const [key, s] of live) {
    if (s.pending) continue
    if (now - s.lastUsedAt > IDLE_MS) { s.kill(); live.delete(key) }
  }
}, Math.min(60_000, IDLE_MS)).unref()
