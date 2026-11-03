// `weft browser` commands, shared by the CLI and the `weft mcp` browser tools. Each takes structured params and
// returns JSON; the page side is @weft-js/core/agent (packages/weft/src/agent.ts).

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { call, close, launch, screenshot, spill, tabs, waitForTab } from './client.mjs'

export const actions = ['click', 'dblclick', 'hover', 'focus', 'clear', 'fill', 'type', 'press', 'select', 'check', 'uncheck']
export const expectations = ['visible', 'absent', 'text', 'exactText', 'value', 'checked', 'unchecked', 'disabled', 'enabled', 'focused', 'count']

const sleep = ms => new Promise(r => { setTimeout(r, ms) })

/**
 * @param {string} root project root
 * @param {string} cmd
 * @param {Record<string, any>} p params
 * @param {{ url?: string, tab?: string }} [o] dev server URL and tab
 */
export async function browser(root, cmd, p = {}, o = {}) {
  const page = (name, args, extra) => call(root, name, args, { ...o, ...extra })
  switch (cmd) {
    case 'tabs': return tabs(root, o)
    case 'launch': return launch(root, p.route ?? '/', { url: o.url, headed: p.headed })
    case 'close': return close(root)
    case 'open': {
      const before = await page('info', {})
      await page('navigate', { to: p.route ?? '/' })
      // Same tab id after the load (@weft-js/core/agent keeps it in sessionStorage); wait for the new document to say hello.
      const until = Date.now() + 15_000
      do {
        await sleep(150)
        try {
          const info = await page('info', {}, { timeout: 2000 })
          if (info.url !== before.url || p.route === new URL(before.url).pathname) return info
        } catch {}
      } while (Date.now() <= until)
      return waitForTab(root, o)
    }
    case 'snapshot': {
      const out = await page('snapshot', { interactive: p.interactive, scope: p.scope, delta: p.delta, graph: p.graph })
      if (!p.full) {
        if (out.tree) out.tree = spill(root, 'snapshot', out.tree)
        if (out.graph) out.graph = spill(root, 'graph', out.graph)
      }
      return out
    }
    case 'act': return page('act', { target: p.target, action: p.action, value: p.value })
    case 'assert': return page('assert', { target: p.target, expect: p.expect, timeout: p.timeout })
    case 'graph': {
      const out = await page('graph', { filter: p.filter })
      return { graph: p.full ? out.graph : spill(root, 'graph', out.graph), nodes: out.nodes.length }
    }
    case 'set': return page('set', { name: p.name, value: p.value })
    case 'time': return page('time', { op: p.op, ms: p.ms, reload: p.reload })
    case 'net': return page('net', { op: p.op, ms: p.ms })
    case 'record': {
      const out = await page('record', { op: p.op, text: p.text, component: p.component, from: p.from, props: p.props, imports: p.imports, name: p.name })
      if (p.op === 'code' && p.out) {
        const file = isAbsolute(p.out) ? p.out : join(root, p.out)
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, out.code)
        return { ...out, written: file }
      }
      return out
    }
    case 'logs': return page('logs', {})
    case 'overlay': return page('overlay', { show: p.show })
    case 'info': return page('info', {})
    case 'reload': return page('reload', {})
    case 'screenshot': return screenshot(root, p.out && (isAbsolute(p.out) ? p.out : join(root, p.out)))
    default:
      throw Object.assign(new Error(`unknown browser command ${cmd}`), { code: 'E_USAGE' })
  }
}

/** `button "Add Banana"`, `label Coupon`, `text Cart`, `@e5` → a target, and how many words it took. */
export function parseTarget(words) {
  const [a, b] = words
  if (!a) throw Object.assign(new Error('missing target: <role> <name>, label <text>, text <text>, or @ref'), { code: 'E_USAGE' })
  if (a.startsWith('@')) return [a, 1]
  if (a === 'label') return [{ label: b }, 2]
  if (a === 'text') return [{ text: b }, 2]
  return [b === undefined || b === '-' ? { role: a } : { role: a, name: b }, b === undefined ? 1 : 2]
}

/** CLI words → params. */
export function cliParams(cmd, words, flags) {
  const num = v => (v === undefined ? undefined : Number(v))
  switch (cmd) {
    case 'launch': case 'open': return { route: words[0] ?? '/', headed: !!flags.headed }
    case 'snapshot': return { interactive: !!flags.interactive, delta: !!flags.delta, graph: flags['graph-only'] ? 'only' : flags['no-graph'] ? false : flags.graph ?? true, scope: flags.scope ? parseScope(flags.scope) : undefined, full: !!flags.full }
    case 'act': {
      const [target, n] = parseTarget(words)
      const action = words[n] ?? 'click'
      if (!actions.includes(action)) throw Object.assign(new Error(`unknown action ${action}: ${actions.join(', ')}`), { code: 'E_USAGE' })
      return { target, action, value: words[n + 1] }
    }
    case 'assert': {
      const [target, n] = parseTarget(words)
      const kind = words[n] ?? 'visible'
      if (!expectations.includes(kind)) throw Object.assign(new Error(`unknown expectation ${kind}: ${expectations.join(', ')}`), { code: 'E_USAGE' })
      const v = words[n + 1]
      return { target, expect: { [kind]: kind === 'count' ? Number(v) : ['text', 'exactText', 'value'].includes(kind) ? v ?? '' : true }, timeout: num(flags.timeout) }
    }
    case 'graph': return { filter: words[0], full: !!flags.full }
    case 'set': {
      let value = words[1]
      try { value = JSON.parse(words[1]) } catch {}
      return { name: words[0], value }
    }
    case 'time': return { op: words[0] ?? 'status', ms: num(words[1]), reload: !!flags.reload }
    case 'net': return { op: words[0] ?? 'status', ms: num(words[1]) }
    case 'record': return { op: words[0] ?? 'code', text: words.slice(1).join(' '), component: flags.component, from: flags.from, props: flags.props, name: flags.name, out: flags.out }
    case 'overlay': return { show: words[0] === undefined ? undefined : words[0] !== 'off' }
    case 'screenshot': return { out: flags.out }
    default: return {}
  }
}

const parseScope = s => (s.startsWith('@') ? s : (() => { const i = s.indexOf(':'); return i < 0 ? { role: s } : { role: s.slice(0, i), name: s.slice(i + 1) } })())

export const browserUsage = `usage: weft browser <command> [--json] [--url <dev server>] [--tab <id>]

  The page is the app open in any browser (yours, an agent's, or \`launch\`); the dev server relays to it.
  In a browser that runs JS, the same commands are \`await __weft__.agent.run('<command>', args)\`.

  tabs                               tabs connected to the dev server
  launch [route] [--headed]          start a headless Chrome on the app (when you have no browser)
  open <route>                       navigate the tab
  snapshot [--interactive] [--delta] [--scope role:name|@ref] [--graph-only|--no-graph] [--full]
                                     roles, names and refs, plus the reactive graph (Cart.total = 42.5 ← …)
  act <role> <name> <action> [value] click dblclick hover focus clear fill type press select check uncheck
  act @e5 <action> [value]           (or: act label <text> …, act text <text> …)
  assert <target> <expectation> [v]  visible absent text exactText value checked unchecked disabled enabled focused count
  graph [filter]                     the named reactive graph
  set <Name.box> <json>              write state by its graph name (dev only)
  time pause [--reload]|advance <ms>|resume|status
  net offline|online|latency <ms>|drop|reset|status
  record start|stop|note <text>|code [--component App --from ./App --props '{…}' --out file.test.tsx]
  logs                               console errors/warnings and uncaught errors since the last call
  overlay [on|off]                   the graph panel in the page (Alt+Shift+G)
  screenshot [--out file.png]        launched Chrome only; use your own browser's screenshot otherwise
  close                              stop the launched Chrome`
