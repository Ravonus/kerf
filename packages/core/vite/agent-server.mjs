import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Register the agent's server and socket hooks. */
export function configureAgent(server, can, tabs, pending, pick, nextId) {
  const root = server.config.root
  server.httpServer?.once('listening', () => {
    const url = server.resolvedUrls?.local?.[0]
    if (!url) return
    try {
      mkdirSync(join(root, '.weft'), { recursive: true })
      writeFileSync(
        join(root, '.weft', 'dev.json'),
        `${JSON.stringify({ url, pid: process.pid, agent: can }, null, 2)}\n`,
      )
    } catch {}
  })
  server.ws.on('weft:hello', (data, client) => {
    if (data.focused) for (const t of tabs.values()) t.focused = false
    tabs.set(data.tab, { ...data, client, seen: Date.now() })
  })
  server.ws.on('weft:reply', (data) => {
    const p = pending.get(data.id)
    if (p) {
      pending.delete(data.id)
      p(data)
    }
  })
  server.ws.on('vite:ws:disconnect', (_, client) => {
    for (const [id, t] of tabs) if (t.client === client) tabs.delete(id)
  })

  server.middlewares.use('/__weft/agent', middleware(server, can, tabs, pending, pick, nextId))
}

/** Answer local agent requests and forward them to a tab. */
function middleware(server, can, tabs, pending, pick, nextId) {
  return (ask, res) => {
    const send = (status, body) => {
      res.statusCode = status
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(body))
    }
    // Only the CLI and MCP (a custom header, so a web page can't send it cross-site without a preflight we refuse).
    if (
      ask.headers['x-weft-agent'] !== '1' ||
      (ask.headers.origin &&
        !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(ask.headers.origin))
    )
      return send(403, { ok: false, error: 'weft agent requests need the x-weft-agent header' })
    const list = () =>
      [...tabs.entries()].map(([tab, t]) => ({
        tab,
        url: t.url,
        title: t.title,
        visible: t.visible,
        focused: t.focused,
      }))
    if (ask.method === 'GET') return send(200, { ok: true, agent: can, tabs: list() })
    let body = ''
    ask.on('data', (d) => {
      body += d
    })
    ask.on('end', () => {
      let msg
      try {
        msg = JSON.parse(body || '{}')
      } catch {
        return send(400, { ok: false, error: 'bad JSON' })
      }
      const tab = pick(msg.tab)
      if (!tab)
        return send(200, {
          ok: false,
          code: 'E_NO_TAB',
          error: `no page is open on this dev server: open ${server.resolvedUrls?.local?.[0] ?? 'the app'} in your browser (or \`weft browser launch\`)`,
          tabs: list(),
        })
      const id = nextId()
      const timer = setTimeout(() => {
        pending.delete(id)
        send(200, {
          ok: false,
          code: 'E_TIMEOUT',
          error: `tab ${tab.tab} did not answer \`${msg.cmd}\` in time`,
        })
      }, msg.timeout ?? 30_000)
      pending.set(id, (data) => {
        clearTimeout(timer)
        send(200, data)
      })
      tab.client.send('weft:cmd', { id, tab: tab.tab, cmd: msg.cmd, args: msg.args ?? {} })
    })
  }
}
