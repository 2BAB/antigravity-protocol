#!/usr/bin/env node
import { AGY_BIN } from './agy.ts'
import { handleRpc } from './rpc.ts'
import { startHttpServer } from './http.ts'

const VERSION = '0.1.0'
const log = (...a: unknown[]) => process.stderr.write('[agy-mcp] ' + a.map(String).join(' ') + '\n')
const send = (msg: Record<string, unknown>) => {
  try { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n') } catch {}
}

const httpPort = Number(process.env.AGY_MCP_HTTP_PORT || (process.argv.includes('--http') ? (process.argv[process.argv.indexOf('--http') + 1] ?? '8787') : '0'))

if (httpPort > 0) {
  const token = process.env.AGY_MCP_TOKEN || ''
  startHttpServer({ port: httpPort, token, log: (m) => log(m), host: process.env.AGY_MCP_HTTP_HOST || '127.0.0.1' })
  log(`agy-mcp ${VERSION} (http) bin=${AGY_BIN} auth=${token ? 'bearer' : 'none'}`)
} else {
  let buf = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk: string) => {
    buf += chunk
    let i: number
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (!line) continue
      let msg: any
      try { msg = JSON.parse(line) } catch { log('skip non-JSON line'); continue }
      void handleRpc(msg).then((r) => { if (r) send(r) })
    }
  })
  process.stdin.on('end', () => { log('stdin closed, exiting'); process.exit(0) })
  log(`agy-mcp ${VERSION} (stdio) bin=${AGY_BIN}`)
}

process.on('SIGTERM', () => process.exit(0))
process.on('SIGINT', () => process.exit(0))
