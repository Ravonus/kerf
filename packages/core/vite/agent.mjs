import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { configureAgent } from './agent-server.mjs'

/**
 * Dev serving only: load @weft-js/core/agent (or just @weft-js/core/devtools when Testing Library isn't installed) into every page, and
 * relay `weft browser` / MCP commands to an open tab over Vite's own socket (research 22). `POST /__weft/agent`
 * `{ cmd, args, tab? }` → the tab's result; `GET /__weft/agent` lists the tabs. The URL goes to `.weft/dev.json`.
 */
const ENTRY = '/@weft-agent.js'

export function agent() {
  const req = createRequire(join(dirname(dirname(fileURLToPath(import.meta.url))), 'vite.mjs'))
  const can = [
    '@testing-library/dom',
    '@testing-library/user-event',
    'dom-accessibility-api',
  ].every((m) => {
    try {
      req.resolve(m)
      return true
    } catch {
      return false
    }
  })
  const entry = can ? '@weft-js/core/agent' : '@weft-js/core/devtools'
  /** tab id → { client, url, title, visible, focused, seen } */
  const tabs = new Map()
  const pending = new Map()
  let seq = 0
  const pick = (id) => {
    if (id) return tabs.get(id)
    const all = [...tabs.values()]
    return all.find((t) => t.focused) ?? all.sort((a, b) => b.seen - a.seen)[0]
  }
  return {
    name: 'weft:agent',
    apply: (_, env) => env.command === 'serve' && env.mode !== 'test', // not vitest's own server
    config: () => ({
      // One copy of weft in the page: the app's graph and the bridge's must be the same module instance.
      optimizeDeps: {
        exclude: ['@weft-js/core'],
        include: can
          ? [
              '@weft-js/core > @testing-library/dom',
              '@weft-js/core > @testing-library/user-event',
              '@weft-js/core > dom-accessibility-api',
            ]
          : [],
      },
    }),
    // A virtual entry, so Vite resolves and transforms the import like any app module.
    resolveId: (id) => (id === ENTRY ? ENTRY : null),
    load: (id) => (id === ENTRY ? `import '${entry}'` : null),
    transformIndexHtml: () => [
      { tag: 'script', attrs: { type: 'module', src: ENTRY }, injectTo: 'head-prepend' },
    ],
    configureServer(server) {
      configureAgent(server, can, tabs, pending, pick, () => `${++seq}`)
    },
  }
}
