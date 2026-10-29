// `weft mcp`: an MCP server over stdio (newline-delimited JSON-RPC 2.0) with the tools `docs`, `check` and `tasks`.
// Every tool returns the same JSON as the CLI's `--json`, as text and as structuredContent.

import { createInterface } from 'node:readline'
import { check } from './check.mjs'
import { docs, topics } from './docs.mjs'
import { tasks } from './tasks.mjs'

const versions = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']

export const tools = [
  {
    name: 'docs',
    description: `weft docs for agents. Topics: ${Object.keys(topics).join(', ')}; or a diagnostic code such as W014. No topic: the index.`,
    inputSchema: { type: 'object', properties: { topic: { type: 'string', description: 'Topic name or diagnostic code' } } },
  },
  {
    name: 'check',
    description: 'Run `weft check`: every W- and P-diagnostic with code, file, span, why and fix (edits when an autofix exists), plus slot bindings.',
    inputSchema: { type: 'object', properties: { files: { type: 'array', items: { type: 'string' }, description: 'Files relative to the project root; default: all' } } },
  },
  {
    name: 'tasks',
    description: "List the project's commands and tasks: what each does, its args schema, side effects and allowed environments.",
    inputSchema: { type: 'object', properties: {} },
  },
]

/** Handle one JSON-RPC message. Returns the response, or undefined for notifications. */
export async function handle(root, msg) {
  const reply = result => ({ jsonrpc: '2.0', id: msg.id, result })
  const fail = (code, message) => ({ jsonrpc: '2.0', id: msg.id ?? null, error: { code, message } })
  if (msg?.jsonrpc !== '2.0' || typeof msg.method !== 'string') return fail(-32600, 'Invalid Request')
  const notification = msg.id === undefined
  switch (msg.method) {
    case 'initialize': {
      const asked = msg.params?.protocolVersion
      return reply({
        protocolVersion: versions.includes(asked) ? asked : versions[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'weft', version: '0.0.0' },
        instructions: 'weft is a fine-grained reactive TSX framework, not React. Read `docs` topic `rules` first, and run `check` after every edit.',
      })
    }
    case 'ping':
      return reply({})
    case 'tools/list':
      return reply({ tools })
    case 'tools/call': {
      const { name, arguments: args = {} } = msg.params ?? {}
      try {
        let data
        if (name === 'docs') {
          const page = await docs(root, args.topic)
          return reply({ content: [{ type: 'text', text: page.text }] })
        }
        if (name === 'check') data = await check(root, { files: args.files })
        else if (name === 'tasks') data = await tasks(root)
        else return fail(-32602, `Unknown tool: ${name}`)
        return reply({ content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data, isError: false })
      } catch (error) {
        return reply({ content: [{ type: 'text', text: `${error.code ?? 'E_INTERNAL'}: ${error.message}` }], isError: true })
      }
    }
    default:
      return notification ? undefined : fail(-32601, `Method not found: ${msg.method}`)
  }
}

export function serve(root, input = process.stdin, output = process.stdout) {
  const rl = createInterface({ input, crlfDelay: Infinity })
  const write = obj => output.write(`${JSON.stringify(obj)}\n`)
  let queue = Promise.resolve()
  rl.on('line', line => {
    if (!line.trim()) return
    queue = queue.then(async () => {
      let msg
      try {
        msg = JSON.parse(line)
      } catch {
        return write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
      }
      const res = await handle(root, msg)
      if (res) write(res)
    })
  })
  return new Promise(done => rl.on('close', () => queue.then(done)))
}
