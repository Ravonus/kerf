// weft() for Vite 8: one filtered transform hook, so only .tsx/.jsx files cross into JS (§3.6).
import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const { transform } = createRequire(import.meta.url)('./compiler.cjs')

// Scope options backed by their own module: an app pays for weft/persist and weft/history only where it uses them.
const FEATURES = [
  [/\bpersist\s*:/, 'weft/persist'],
  [/\bhistory\s*:\s*\{/, 'weft/history'],
]

/** Adds `import 'weft/<feature>'` to app modules that use the option (filtered on id and code, §7c). */
const features = {
  name: 'weft:features',
  transform: {
    filter: { id: { include: /\.[cm]?[jt]sx?$/, exclude: /node_modules|[\\/]packages[\\/]weft[\\/]src[\\/]/ }, code: /\b(persist|history)\s*:/ },
    handler(code) {
      const add = FEATURES.filter(([re]) => re.test(code)).map(([, mod]) => `import '${mod}';`)
      return add.length ? { code: `${add.join('')}${code}`, map: null } : undefined
    },
  },
}

const MODE = /\?weft-(ssr|hydrate)$/

/**
 * `hydratable`: DOM output that adopts server HTML (`hydrate`), and SSR output with hydration keys. Vite's SSR
 * transforms get SSR output (imports from weft/ssr). `import { App } from './App.tsx?weft-ssr'` (or `?weft-hydrate`)
 * loads a component graph compiled that way into any process (round-trip tests); the query follows .tsx/.jsx imports.
 */
/*
 * `hmr` (default: when serving, outside vitest): client modules register their components with weft/hmr and accept
 * their own updates (research 21). Never for SSR or hydratable output.
 */
export default function weft({ dev, hydratable = false, hmr } = {}) {
  let isDev = false
  let isHot = false
  const main = {
    name: 'weft',
    enforce: 'pre',
    config(_, env) {
      isDev = dev ?? env.command === 'serve'
      isHot = hmr ?? (env.command === 'serve' && !process.env.VITEST)
      return { oxc: { jsx: 'preserve' }, optimizeDeps: { rolldownOptions: { transform: { jsx: 'preserve' } } } }
    },
    async resolveId(source, importer) {
      const mode = importer && MODE.exec(importer)
      if (!mode || !source.startsWith('.')) return null
      const r = await this.resolve(source, importer.slice(0, mode.index), { skipSelf: true })
      return r && /\.[jt]sx$/.test(r.id) ? r.id + mode[0] : r
    },
    transform: {
      filter: { id: /\.[jt]sx(\?weft-(ssr|hydrate))?$/ },
      handler(code, id, options) {
        const mode = MODE.exec(id)?.[1]
        const ssr = mode ? mode === 'ssr' : !!options?.ssr
        const hydrating = hydratable || !!mode
        const out = transform(code, { filename: id.replace(/\?.*$/, ''), dev: isDev, sourceMap: true, generate: ssr ? 'ssr' : 'dom', hydratable: hydrating, hmr: isDev && isHot && !ssr && !hydrating })
        for (const d of out.diagnostics) {
          const text = `${d.code} ${d.message}\n  help: ${d.help}`
          const loc = { file: id, line: d.line, column: d.column - 1 }
          if (d.severity === 'error') this.error({ message: text, loc })
          else this.warn({ message: text, loc })
        }
        return { code: out.code, map: out.map }
      },
    },
  }
  return [main, features, agent()]
}

/**
 * Dev serving only: load weft/agent (or just weft/devtools when Testing Library isn't installed) into every page, and
 * relay `weft browser` / MCP commands to an open tab over Vite's own socket (research 22). `POST /__weft/agent`
 * `{ cmd, args, tab? }` → the tab's result; `GET /__weft/agent` lists the tabs. The URL goes to `.weft/dev.json`.
 */
const ENTRY = '/@weft-agent.js'

function agent() {
  const req = createRequire(import.meta.url)
  const can = ['@testing-library/dom', '@testing-library/user-event', 'dom-accessibility-api'].every(m => { try { req.resolve(m); return true } catch { return false } })
  const entry = can ? 'weft/agent' : 'weft/devtools'
  /** tab id → { client, url, title, visible, focused, seen } */
  const tabs = new Map()
  const pending = new Map()
  let seq = 0
  const pick = id => {
    if (id) return tabs.get(id)
    const all = [...tabs.values()]
    return all.find(t => t.focused) ?? all.sort((a, b) => b.seen - a.seen)[0]
  }
  return {
    name: 'weft:agent',
    apply: (_, env) => env.command === 'serve' && env.mode !== 'test', // not vitest's own server
    config: () => ({
      // One copy of weft in the page: the app's graph and the bridge's must be the same module instance.
      optimizeDeps: { exclude: ['weft'], include: can ? ['weft > @testing-library/dom', 'weft > @testing-library/user-event', 'weft > dom-accessibility-api'] : [] },
    }),
    // A virtual entry, so Vite resolves and transforms the import like any app module.
    resolveId: id => (id === ENTRY ? ENTRY : null),
    load: id => (id === ENTRY ? `import '${entry}'` : null),
    transformIndexHtml: () => [{ tag: 'script', attrs: { type: 'module', src: ENTRY }, injectTo: 'head-prepend' }],
    configureServer(server) {
      const root = server.config.root
      server.httpServer?.once('listening', () => {
        const url = server.resolvedUrls?.local?.[0]
        if (!url) return
        try {
          mkdirSync(join(root, '.weft'), { recursive: true })
          writeFileSync(join(root, '.weft', 'dev.json'), `${JSON.stringify({ url, pid: process.pid, agent: can }, null, 2)}\n`)
        } catch {}
      })
      server.ws.on('weft:hello', (data, client) => {
        if (data.focused) for (const t of tabs.values()) t.focused = false
        tabs.set(data.tab, { ...data, client, seen: Date.now() })
      })
      server.ws.on('weft:reply', data => {
        const p = pending.get(data.id)
        if (p) { pending.delete(data.id); p(data) }
      })
      server.ws.on('vite:ws:disconnect', (_, client) => { for (const [id, t] of tabs) if (t.client === client) tabs.delete(id) })
      server.middlewares.use('/__weft/agent', (req, res) => {
        const send = (status, body) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)) }
        // Only the CLI and MCP (a custom header, so a web page can't send it cross-site without a preflight we refuse).
        if (req.headers['x-weft-agent'] !== '1' || (req.headers.origin && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(req.headers.origin)))
          return send(403, { ok: false, error: 'weft agent requests need the x-weft-agent header' })
        const list = () => [...tabs.entries()].map(([tab, t]) => ({ tab, url: t.url, title: t.title, visible: t.visible, focused: t.focused }))
        if (req.method === 'GET') return send(200, { ok: true, agent: can, tabs: list() })
        let body = ''
        req.on('data', d => { body += d })
        req.on('end', () => {
          let msg
          try { msg = JSON.parse(body || '{}') } catch { return send(400, { ok: false, error: 'bad JSON' }) }
          const tab = pick(msg.tab)
          if (!tab) return send(200, { ok: false, code: 'E_NO_TAB', error: `no page is open on this dev server: open ${server.resolvedUrls?.local?.[0] ?? 'the app'} in your browser (or \`weft browser launch\`)`, tabs: list() })
          const id = `${++seq}`
          const timer = setTimeout(() => { pending.delete(id); send(200, { ok: false, code: 'E_TIMEOUT', error: `tab ${tab.tab} did not answer \`${msg.cmd}\` in time` }) }, msg.timeout ?? 30_000)
          pending.set(id, data => { clearTimeout(timer); send(200, data) })
          tab.client.send('weft:cmd', { id, tab: tab.tab, cmd: msg.cmd, args: msg.args ?? {} })
        })
      })
    },
  }
}
