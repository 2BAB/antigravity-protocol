import { spawn } from 'node:child_process'
const srv = spawn('node', ['src/index.ts'], { cwd: new URL('..', import.meta.url).pathname, stdio: ['pipe','pipe','pipe'] })
let buf = ''
const waiters = new Map()
srv.stdout.on('data', (d) => {
  buf += d.toString()
  let i
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1)
    if (!line) continue
    let m; try { m = JSON.parse(line) } catch { continue }
    if (m.id != null && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id) }
  }
})
srv.stderr.on('data', (d) => process.stderr.write('[server] ' + d.toString()))
const rpc = (id, method, params) => new Promise((res, rej) => {
  waiters.set(id, res)
  srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  setTimeout(() => rej(new Error(`timeout: ${method}`)), 200000)
})
const t0 = Date.now()
const init = await rpc(1, 'initialize', { protocolVersion: '2025-06-18', clientCapabilities: {} })
console.log('server:', init.result.serverInfo.name, init.result.serverInfo.version)
const list = await rpc(2, 'tools/list', {})
console.log('tools:', list.result.tools.map((t) => t.name).join(', '))
const turn = await rpc(3, 'tools/call', { name: 'agy_turn', arguments: { prompt: 'Reply with ONLY the word PONG', timeoutMs: 120000 } })
console.log('--- agy_turn ---')
console.log(turn.result.content[0].text)
console.log(`--- total ${Date.now() - t0}ms ---`)
srv.kill('SIGKILL')
