import http from 'node:http'
import { handleRpc } from './rpc.ts'

export interface HttpOptions {
  port: number
  host?: string
  token?: string
  log: (msg: string) => void
}

function readBody(req: http.IncomingMessage, limit = 8 * 1024 * 1024): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > limit) { reject(new Error('body too large')); req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/** Loopback-only streamable-HTTP transport. Never bind a public interface: this
 *  process can execute the local `agy` CLI, so exposure == remote execution. */
export function startHttpServer(opts: HttpOptions): http.Server {
  const host = opts.host ?? '127.0.0.1'
  const server = http.createServer(async (req, res) => {
    const url = req.url ?? '/'
    if (req.method === 'GET' && url.startsWith('/healthz')) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      return
    }
    if (!url.startsWith('/mcp')) { res.writeHead(404); res.end('not found'); return }
    if (opts.token && req.headers.authorization !== `Bearer ${opts.token}`) {
      res.writeHead(401, { 'www-authenticate': 'Bearer' }); res.end('unauthorized'); return
    }
    if (req.method === 'GET' || req.method === 'DELETE') { res.writeHead(405); res.end('no server-initiated stream'); return }
    if (req.method !== 'POST') { res.writeHead(405); res.end('method not allowed'); return }

    let body: Buffer
    try { body = await readBody(req) } catch { res.writeHead(413); res.end('body too large'); return }
    let parsed: unknown
    try { parsed = JSON.parse(body.toString('utf8')) } catch { res.writeHead(400); res.end('invalid json'); return }

    const batch = Array.isArray(parsed)
    const messages = batch ? (parsed as unknown[]) : [parsed]
    const out: unknown[] = []
    for (const m of messages) {
      const r = await handleRpc(m)
      // JSON-RPC envelope is mandatory: the MCP client validates `jsonrpc: "2.0"`.
      if (r) out.push({ jsonrpc: '2.0', ...r })
    }
    if (out.length === 0) { res.writeHead(202); res.end(); return }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(batch ? out : out[0]))
  })
  server.listen(opts.port, host, () => opts.log(`http listening on http://${host}:${opts.port}/mcp`))
  return server
}
