// `weft mcp`: an MCP server over stdio (newline-delimited JSON-RPC 2.0) with the tools `docs`, `check`, `tasks`,
// `style_find`, `style_explain`, `test_gate` and the `browser_*` tools.
// Every tool returns the same JSON as the CLI's `--json`, as text and as structuredContent.

import { createInterface } from 'node:readline'
import { check } from './check.mjs'
import { docs, topics } from './docs.mjs'
import { tasks } from './tasks.mjs'
import { browser, expectations, actions as browserActions } from './browser/commands.mjs'
import { gate } from './gate.mjs'
import { explainTarget, findGroups, styleMatrix } from './style.mjs'

const versions = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']

const target = {
  description: 'What the user sees: { role, name } (name exact), { label }, { text }, or a ref from the latest snapshot ("@e12")',
  anyOf: [
    { type: 'string', pattern: '^@?e\\d+$' },
    { type: 'object', properties: { role: { type: 'string' }, name: { type: 'string' }, exact: { type: 'boolean' } }, required: ['role'] },
    { type: 'object', properties: { label: { type: 'string' } }, required: ['label'] },
    { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  ],
}

/** The `weft browser` commands as tools. The page is the app open in any browser; the dev server relays to it. */
function browserTools() {
  const tab = { url: { type: 'string', description: 'Dev server URL (default: .weft/dev.json, then environments.dev.url)' }, tab: { type: 'string', description: 'Tab id from browser_tabs (default: the focused or latest tab)' } }
  const t = (name, description, properties = {}, required) => ({ name, description, inputSchema: { type: 'object', properties: { ...properties, ...tab }, ...(required ? { required } : {}) } })
  return [
    t('browser_tabs', 'Tabs of the app connected to the dev server. Any browser works (yours, the person\'s); with none, call browser_launch. If your own browser can run JS, `await __weft__.agent.run(command, args)` in the page does the same as these tools.'),
    t('browser_launch', 'Start a headless Chrome on the app (only when you have no browser of your own)', { route: { type: 'string' }, headed: { type: 'boolean' } }),
    t('browser_open', 'Navigate the tab to a route', { route: { type: 'string' } }, ['route']),
    t('browser_snapshot', "The page as roles, names and refs (`- button \"Add Banana\" [ref=e15]`), plus weft's live reactive graph with real names (`Cart.total = 42.5 ← Cart.subtotal → 1 binding in <Cart>`), and errors since the last call. Big payloads come back as a file path.", {
      interactive: { type: 'boolean', description: 'Only interactive elements' }, delta: { type: 'boolean', description: 'Only what changed since the last snapshot' },
      scope: target, graph: { description: "false: no graph; 'only': only the graph; a string filters it by name", anyOf: [{ type: 'boolean' }, { type: 'string' }] },
    }),
    t('browser_act', `Act like a user (user-event, as in weft/test) and get back what changed on the page. Actions: ${browserActions.join(', ')}`, { target, action: { type: 'string', enum: browserActions }, value: { type: 'string', description: 'fill/type text, press key (`{Enter}`), select option' } }, ['target', 'action']),
    t('browser_assert', `Check what the user sees (retries up to timeout ms). Expectations: ${expectations.join(', ')}. Recorded for browser_record.`, { target, expect: { type: 'object', description: '{ text: "Total $4" } | { value: "SAVE10" } | { disabled: true } | { count: 3 } | { absent: true } | …' }, timeout: { type: 'number' } }, ['target', 'expect']),
    t('browser_state', "Read the named reactive graph, or write a box by its graph name to reach a state fast (dev only)", { filter: { type: 'string', description: 'Name prefix (`Cart`, `cart.`)' }, set: { type: 'string', description: 'Graph name to write, e.g. Cart.coupon' }, value: { description: 'JSON value to write' } }),
    t('browser_time', "The page's clock: pause (reload: from page load, so startup timers are faked too), advance ms (runs due timers in order), resume, status", { op: { type: 'string', enum: ['pause', 'advance', 'resume', 'status'] }, ms: { type: 'number' }, reload: { type: 'boolean' } }, ['op']),
    t('browser_net', 'The network as the app sees it: offline (navigator.onLine false, offline event, fetch fails, sockets dropped), online, latency ms (fetch), drop (close open WebSockets/EventSources: a server restart), reset, status', { op: { type: 'string', enum: ['offline', 'online', 'latency', 'drop', 'reset', 'status'] }, ms: { type: 'number' } }, ['op']),
    t('browser_record', 'Record what happens in the tab (your acts and asserts, and clicks/typing from any browser tool) and turn it into a weft/test test, which then has to pass the gate', {
      op: { type: 'string', enum: ['start', 'stop', 'steps', 'note', 'code'] }, text: { type: 'string' }, component: { type: 'string' }, from: { type: 'string' }, props: { type: 'string' }, name: { type: 'string' }, out: { type: 'string', description: 'Write the test to this file (relative to the project)' },
    }, ['op']),
    t('browser_logs', 'Console errors and warnings, and uncaught errors with the weft binding they came from, since the last call'),
    t('browser_screenshot', 'PNG of the launched Chrome (browser_launch); in your own browser, use its screenshot tool', { out: { type: 'string' } }),
  ]
}

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
  {
    name: 'style_find',
    description: "Before styling anything, find the style groups that already fit (`weft style find`): name, doc, axes and values, parts, states, how often it's used, and similar groups. Reuse or add an axis value; don't write a new group or class list for the same thing.",
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'What the thing is: `card`, `status badge`, `nav`, or a token such as `critical`' } }, required: ['query'] },
  },
  {
    name: 'style_explain',
    description: 'Explain one variation of a style group (`weft style explain`): every declaration on its root and parts in cascade order with the token, axis, state, compound or accent it came from, the attributes it renders, the CSS it emits, and the call sites that produce it.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'A group (`order-card`), a part (`order-card.title`), `order-card[status=late][selected]`, or a DOM selector (`[data-g="order-card"][data-status="late"]`)' },
        axes: { type: 'object', additionalProperties: { type: 'string' }, description: 'Axis values, e.g. { "status": "late" } (defaults fill the rest)' },
        states: { type: 'array', items: { type: 'string' }, description: 'States to apply: selected, hover…' },
        accent: { type: 'object', additionalProperties: { type: 'string' }, description: 'A call-site accent, intent → token: { "radius": "round" }' },
        part: { type: 'string', description: 'Only this part (and the root)' },
      },
      required: ['target'],
    },
  },
  {
    name: 'test_gate',
    description: 'Run the test gate on the diff (`weft test --gate`): each new or changed test must fail on the old code (T010), kill a mutant of the changed lines (T011), and no existing test may get weaker (T020). Returns per-test results, surviving mutants with what to assert, and diagnostics.',
    inputSchema: { type: 'object', properties: { base: { type: 'string', description: 'Git ref to diff against (default HEAD: the uncommitted change)' }, budgetSec: { type: 'number' }, maxMutants: { type: 'number' }, refactor: { type: 'boolean' } } },
  },
  ...browserTools(),
]

async function callBrowser(root, name, args) {
  const o = { url: args.url, tab: args.tab }
  const cmd = name.slice('browser_'.length)
  if (cmd === 'state') return args.set ? browser(root, 'set', { name: args.set, value: args.value }, o) : browser(root, 'graph', { filter: args.filter }, o)
  return browser(root, cmd, args, o)
}

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
        instructions: 'weft is a fine-grained reactive TSX framework, not React. Read `docs` topic `rules` first, and run `check` after every edit. Style with groups from weft/style, not class lists: `style_find` before you write one. Verify behavior in the running app with the browser_* tools (or `__weft__.agent` in your own browser), and run `test_gate` before you call a change done.',
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
        else if (name === 'style_find') data = findGroups((await styleMatrix(root)).matrix, args.query)
        else if (name === 'style_explain') data = explainTarget(await styleMatrix(root), args.target, { axes: args.axes, states: args.states, accent: args.accent, part: args.part })
        else if (name === 'test_gate') data = await gate(root, { base: args.base, budgetSec: args.budgetSec, maxMutants: args.maxMutants, refactor: args.refactor })
        else if (name.startsWith('browser_')) data = await callBrowser(root, name, args)
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
