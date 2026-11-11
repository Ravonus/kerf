import { existsSync, readFileSync, watch } from 'node:fs'
import { join, relative } from 'node:path'
import { waitingForAFix, reaches, refresh } from './dev.mjs'
import { serverExports } from './syntax.mjs'
import { isServerModule } from './server-functions.mjs'
import { SHEET, ASSETS, V } from './shared.mjs'

export const configureServer = (s) =>
  function (server) {
    s.vite = server
    // A `<link>` to a virtual sheet (`kerf:fonts`): Vite only serves those as modules.
    const sheet = async (req, res, next) => {
      const css = await server.environments.client.pluginContainer
        .load(decodeURIComponent(req.url.slice(1)))
        .catch(() => undefined)
      if (css == null) return next()
      res.setHeader('content-type', 'text/css')
      res.end(typeof css === 'string' ? css : css.code)
    }
    server.middlewares.use(SHEET, (req, res, next) => void sheet(req, res, next))
    server.middlewares.use(waitingForAFix)
    // A route file added or removed changes the virtual modules; edits to existing ones are ordinary HMR/reloads.
    const dir = join(s.root, 'src')
    if (!existsSync(dir)) return
    const routesDir = relative(dir, join(s.root, s.manifest.dir)).split('\\').join('/')
    const shape = () =>
      JSON.stringify([
        s.manifest.routes.map((r) => r.file),
        s.manifest.layouts.map((l) => l.file),
        s.serverModules,
      ])
    const changed = (file) => {
      const rel = file.split('\\').join('/')
      if (!rel.startsWith(routesDir + '/') && !isServerModule('src/' + rel)) return
      // Saving a file can count as a rename, depending on the platform and the editor.
      const before = shape()
      s.scan()
      if (shape() === before) return
      for (const env of Object.values(server.environments)) {
        for (const v of [V.routes, V.fns, V.context]) {
          const m = env.moduleGraph.getModuleById('\0' + v)
          if (m) env.moduleGraph.invalidateModule(m)
        }
      }
      server.config.logger.info(
        `kerf: full reload: ${rel} was added or removed, so the routes changed`,
        { timestamp: true },
      )
      server.ws.send({ type: 'full-reload' })
    }
    const w = watch(dir, { recursive: true }, (event, file) => {
      if (event === 'rename' && file) changed(file)
    })
    // Not every runtime's recursive watch reports a new file, and Vite's watcher does.
    for (const event of ['add', 'unlink'])
      server.watcher.on(event, (file) => {
        if (file.startsWith(dir)) changed(relative(dir, file))
      })
    // Close with the server (middleware mode, as `kerf routes --meta` runs it, has no httpServer to listen on).
    const close = server.close.bind(server)
    server.close = () => (w.close(), close())
  }

export const hotUpdate = (s) =>
  async function ({ file, modules }) {
    const rel = relative(s.root, file).split('\\').join('/')
    if (this.environment.config.consumer === 'server') {
      // An edit can add or drop a stylesheet import: the next server load of the routes walks the graph again.
      const m = this.environment.moduleGraph.getModuleById('\0' + V.routes)
      if (m) this.environment.moduleGraph.invalidateModule(m)
      // A static component or a server helper is in no browser's module graph, so nothing else would tell the tab.
      if (
        !s.vite?.environments.client.moduleGraph.getModulesByFile(file)?.size &&
        this.environment.moduleGraph.getModulesByFile(file)?.size
      )
        refresh(s.vite, rel)
      return
    }
    const route =
      s.manifest.routes.some((r) => r.file === rel) ||
      s.manifest.layouts.some((l) => l.file === rel)
    if (route) {
      const part = serverExports(readFileSync(file, 'utf8'), file)
      // A level the server renders has no module in the page, and its `load` and `meta` are on the server too.
      refresh(s.vite, rel, s.loaders.get(file) !== part, false)
      s.loaders.set(file, part)
    }
    if (isServerModule(rel) && s.stubs.has(file) && modules.length) {
      const before = s.stubs.get(file)
      await Promise.all(
        modules.map((m) => this.environment.transformRequest(m.url).catch(() => undefined)),
      )
      if (s.stubs.get(file) === before) return (refresh(s.vite, rel), [])
    }
    // A static route's stylesheet list: nothing runs it, so nothing has to take the update.
    const live = modules.filter((m) => !m.url.endsWith(ASSETS))
    if (live.some((m) => !reaches(m)))
      this.environment.logger.info(
        `kerf: full reload: ${rel} exports more than components and nothing that imports it can take the update`,
        { timestamp: true },
      )
    if (live.length < modules.length) return live
  }
