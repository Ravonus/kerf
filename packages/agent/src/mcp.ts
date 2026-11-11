// The app as an MCP server, at `/_weft/x/agent/mcp`: Claude Code, Codex or anything that speaks MCP connects with a
// bearer token and sees exactly the tools its grants allow. Streamable HTTP, answered as plain JSON (no server-sent
// events: nothing here pushes), which is all a tools-only server needs.
import type { Part, ToolInfo } from './index'

type Result = { status: Extract<Part, { type: 'result' }>['status']; output: unknown }

interface Serve {
  tools(): ToolInfo[]
  call(name: string, input: unknown): Promise<Result>
}

const VERSION = '2025-06-18'

type Rpc = {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: Record<string, unknown>
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

async function answer(m: Rpc, s: Serve): Promise<unknown> {
  switch (m.method) {
    case 'initialize':
      return {
        protocolVersion:
          typeof m.params?.protocolVersion === 'string' ? m.params.protocolVersion : VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'weft-agent', version: '0.1.0' },
      }
    case 'ping':
      return {}
    case 'tools/list':
      return {
        tools: s.tools().map((t) => ({
          name: t.name,
          description: t.confirm
            ? `${t.description} (the owner approves each call)`
            : t.description,
          inputSchema: t.input,
          annotations: { readOnlyHint: t.kind === 'query' },
        })),
      }
    case 'tools/call': {
      const name = typeof m.params?.name === 'string' ? m.params.name : ''
      const r = await s.call(name, m.params?.arguments ?? {})
      const text = typeof r.output === 'string' ? r.output : JSON.stringify(r.output)
      return { content: [{ type: 'text', text }], isError: r.status !== 'ok' }
    }
    default:
      throw Object.assign(new Error(`Unknown method ${m.method}`), { rpc: -32601 })
  }
}

export async function serveMcp(request: Request, s: Serve): Promise<Response> {
  if (request.method === 'GET')
    return new Response(null, { status: 405, headers: { allow: 'POST' } })
  if (request.method === 'DELETE') return new Response(null, { status: 204 })
  if (request.method !== 'POST')
    return new Response(null, { status: 405, headers: { allow: 'POST' } })
  let body: Rpc | Rpc[]
  try {
    body = (await request.json()) as Rpc | Rpc[]
  } catch {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400)
  }
  const one = async (m: Rpc) => {
    // a notification (no id) gets no answer
    if (m.id === undefined) {
      if (m.method !== 'notifications/initialized') await answer(m, s).catch(() => {})
      return undefined
    }
    try {
      return { jsonrpc: '2.0', id: m.id, result: await answer(m, s) }
    } catch (e) {
      const code = (e as { rpc?: number }).rpc ?? -32603
      return {
        jsonrpc: '2.0',
        id: m.id,
        error: { code, message: e instanceof Error ? e.message : String(e) },
      }
    }
  }
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map(one))).filter(Boolean)
    return out.length ? json(out) : new Response(null, { status: 202 })
  }
  const out = await one(body)
  return out ? json(out) : new Response(null, { status: 202 })
}
