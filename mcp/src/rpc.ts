import { TOOLS, callTool } from './tools.ts'

export const SERVER_INFO = { name: 'agy-mcp', version: '0.1.0' } as const

export interface RpcResponse { [k: string]: unknown }

/** One JSON-RPC message → one response (null for notifications). */
export async function handleRpc(msg: any): Promise<RpcResponse | null> {
  const { id, method, params } = msg ?? {}
  const isNotification = id === undefined || id === null

  if (method === 'initialize') {
    return {
      id,
      result: {
        protocolVersion: params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
      },
    }
  }
  if (isNotification) return null
  if (method === 'ping') return { id, result: {} }
  if (method === 'tools/list') return { id, result: { tools: TOOLS } }
  if (method === 'tools/call') {
    const name = String(params?.name ?? '')
    try {
      const out = await callTool(name, params?.arguments ?? {})
      return { id, result: { content: [{ type: 'text', text: out.text }], ...(out.isError ? { isError: true } : {}) } }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { id, result: { content: [{ type: 'text', text: `error: ${message}` }], isError: true } }
    }
  }
  return { id, result: {} }
}
