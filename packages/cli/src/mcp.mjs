// `kerf mcp`: an MCP server over stdio (newline-delimited JSON-RPC 2.0) with the tools `docs`, `check`, `routes_meta`, `tasks`,
// `style_find`, `style_explain`, `test_gate` and the `browser_*` tools.
// Every tool returns the same JSON as the CLI's `--json`, as text and as structuredContent.

import { audit } from './audit.mjs'
import { agentMap } from './map.mjs'
import { once } from 'node:events'
import { createInterface } from 'node:readline'
import { check } from './check.mjs'
import { docs, topics } from './docs.mjs'
import { listSurfaces } from './surface-checks.mjs'
import { routesCommand } from './start.mjs'
import { tasks } from './tasks.mjs'
import { browser } from './browser/commands.mjs'
import { browserTools } from './mcp/browser-tools.mjs'
import { gate } from './gate.mjs'
import { explainTarget, findGroups, styleMatrix } from './style.mjs'

const versions = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']

/** What `kerf mcp` offers an agent: each tool's name, its description and the arguments it takes. */
export const tools = [
  {
    name: 'docs',
    description: `kerf docs for agents. Topics: ${Object.keys(topics).join(', ')}; or a diagnostic code such as W014. No topic: the index.`,
    inputSchema: {
      type: 'object',
      properties: { topic: { type: 'string', description: 'Topic name or diagnostic code' } },
    },
  },
  {
    name: 'check',
    description:
      'Run `kerf check`: every W- and P-diagnostic with code, file, span, why and fix (edits when an autofix exists), plus slot bindings.',
    inputSchema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Files relative to the project root; default: all',
        },
      },
    },
  },
  {
    name: 'routes_meta',
    description:
      "Every route's metadata as a crawler gets it (`kerf routes --meta --json`): title, description, image, every tag, where each came from (`route`, `layout`, `config`, `auto`, `card`), real samples of param routes, and H-diagnostics with text to apply. Every page sets `meta` from its own context as part of building it: call this after adding or changing a route.",
    inputSchema: {
      type: 'object',
      properties: {
        preset: {
          type: 'string',
          description: "`static`: no server at runtime, so a param route's card needs `prerender`",
        },
      },
    },
  },
  {
    name: 'audit',
    description:
      "The pages as a browser renders them (`kerf audit`): a clean Chrome at a phone's and a desktop's width, axe-core's WCAG rules (what Lighthouse grades), console errors, deprecations, the head a crawler reads, sideways scroll and layout shift, as L-diagnostics with fixes. Static checks read source; this catches what CSS and a breakpoint do to it. Default: the last build's pages.",
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'A running site to audit instead (a deploy, `kerf start`, the dev server)',
        },
        indexing: {
          type: 'string',
          enum: ['auto', 'public', 'private'],
          description:
            'Public makes noindex in markup or HTTP headers an error. Private preserves intentional noindex. Default inherits build.audit.indexing.',
        },
        routes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Paths; default one page of each kind',
        },
      },
    },
  },
  {
    name: 'map',
    description:
      'What this app has and what to call for each part: routes, server functions, data, styles, plugins',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'tasks',
    description:
      "List the project's commands and tasks: what each does, its args schema, side effects and allowed environments.",
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'style_find',
    description:
      "Before styling anything, find the style groups that already fit (`kerf style find`): name, doc, axes and values, parts, states, how often it's used, and similar groups. Reuse or add an axis value; don't write a new group or class list for the same thing.",
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'What the thing is: `card`, `status badge`, `nav`, or a token such as `critical`',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'style_explain',
    description:
      'Explain one variation of a style group (`kerf style explain`): every declaration on its root and parts in cascade order with the token, axis, state, compound or accent it came from, the attributes it renders, the CSS it emits, and the call sites that produce it.',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description:
            'A group (`order-card`), a part (`order-card.title`), `order-card[status=late][selected]`, or a DOM selector (`[data-g="order-card"][data-status="late"]`)',
        },
        axes: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'Axis values, e.g. { "status": "late" } (defaults fill the rest)',
        },
        states: {
          type: 'array',
          items: { type: 'string' },
          description: 'States to apply: selected, hover…',
        },
        accent: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'A call-site accent, intent → token: { "radius": "round" }',
        },
        part: { type: 'string', description: 'Only this part (and the root)' },
      },
      required: ['target'],
    },
  },
  {
    name: 'surfaces',
    description:
      'List the project\'s canvas and WebGL surfaces (`kerf surfaces`): each `defineSurface` with its name, kind, props and file, ready to drop in as `<Surface use={X} label="…" />`.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'test_gate',
    description:
      'Run the test gate on the diff (`kerf test --gate`): each new or changed test must fail on the old code (T010), kill a mutant of the changed lines (T011), and no existing test may get weaker (T020). Returns per-test results, surviving mutants with what to assert, and diagnostics.',
    inputSchema: {
      type: 'object',
      properties: {
        base: {
          type: 'string',
          description: 'Git ref to diff against (default HEAD: the uncommitted change)',
        },
        budgetSec: { type: 'number' },
        maxMutants: { type: 'number' },
        refactor: { type: 'boolean' },
      },
    },
  },
  ...browserTools(),
]

async function callBrowser(root, name, args) {
  const o = { url: args.url, tab: args.tab }
  const cmd = name.slice('browser_'.length)
  if (cmd === 'state')
    return args.set
      ? browser(root, 'set', { name: args.set, value: args.value }, o)
      : browser(root, 'graph', { filter: args.filter }, o)
  return browser(root, cmd, args, o)
}

/** Handle one JSON-RPC message. Returns the response, or undefined for notifications. */
export async function handle(root, msg) {
  const reply = (result) => ({ jsonrpc: '2.0', id: msg.id, result })
  const fail = (code, message) => ({ jsonrpc: '2.0', id: msg.id ?? null, error: { code, message } })
  if (msg?.jsonrpc !== '2.0' || typeof msg.method !== 'string')
    return fail(-32600, 'Invalid Request')
  const notification = msg.id === undefined
  switch (msg.method) {
    case 'initialize': {
      const asked = msg.params?.protocolVersion
      return reply({
        protocolVersion: versions.includes(asked) ? asked : versions[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'kerf', version: '0.1.4' },
        instructions:
          'kerf is a fine-grained reactive TSX framework, not React. Read `docs` topic `rules` first, and run `check` after every edit. Every page sets `meta` from its own context as part of building it (`docs` topic `meta`). Chrome shared across route sections (a sidebar) goes in one layout above them that follows `currentPath()`, never a layout per section (`docs` topic `start`). Style with groups from @kerf-js/core/style, not class lists: `style_find` before you write one. Verify behavior in the running app with the browser_* tools (or `__kerf__.agent` in your own browser), and run `test_gate` before you call a change done.',
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
        else if (name === 'routes_meta')
          data = await routesCommand(root, { meta: true, preset: args.preset })
        else if (name === 'audit')
          data = await audit(root, { url: args.url, routes: args.routes, indexing: args.indexing })
        else if (name === 'map') data = await agentMap(root)
        else if (name === 'style_find')
          data = findGroups((await styleMatrix(root)).matrix, args.query)
        else if (name === 'style_explain')
          data = explainTarget(await styleMatrix(root), args.target, {
            axes: args.axes,
            states: args.states,
            accent: args.accent,
            part: args.part,
          })
        else if (name === 'surfaces') data = { surfaces: listSurfaces(root) }
        else if (name === 'test_gate')
          data = await gate(root, {
            base: args.base,
            budgetSec: args.budgetSec,
            maxMutants: args.maxMutants,
            refactor: args.refactor,
          })
        else if (name.startsWith('browser_')) data = await callBrowser(root, name, args)
        else return fail(-32602, `Unknown tool: ${name}`)
        return reply({
          content: [{ type: 'text', text: JSON.stringify(data) }],
          structuredContent: data,
          isError: false,
        })
      } catch (error) {
        return reply({
          content: [{ type: 'text', text: `${error.code ?? 'E_INTERNAL'}: ${error.message}` }],
          isError: true,
        })
      }
    }
    default:
      return notification ? undefined : fail(-32601, `Method not found: ${msg.method}`)
  }
}

/** Answer newline-delimited JSON-RPC from `input`, one message at a time; resolves once `input` has closed and the last answer is out. */
export function serve(root, input = process.stdin, output = process.stdout) {
  const rl = createInterface({ input, crlfDelay: Infinity })
  const write = (obj) => output.write(`${JSON.stringify(obj)}\n`)
  let queue = Promise.resolve()
  rl.on('line', (line) => {
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
  return once(rl, 'close').then(() => queue)
}
