import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'
import { readMigrations } from '../migrations.mjs'
import { routeTypes } from '../routes.mjs'
import { assetsOnly } from './assets.mjs'
import { entryCss } from './shape-entry-css.mjs'
import {
  clientRoutes, serverRoutes, devStyles, markLinks, shapeCssSources, skeletonExport,
} from './route-modules.mjs'
import {
  serverEntry,
  extensionsModule,
  mediaModule,
  busBound,
  busModule,
  appModule,
  cardFonts,
} from './entries.mjs'
import { stripServerExports, serverExports } from './syntax.mjs'
import { isServerModule, definesFns, withIds, clientStubs } from './server-functions.mjs'
import { here, V, DEFAULT_FONTS, ASSETS, ISLAND, ENTRY_SHEETS } from './shared.mjs'

export const resolveId = (s) => ({
  filter: {
    id: /^(virtual:weft\/|@weft-js\/start\/(db|auth|bus|list|rust|sidecar)(\/|$)|@weft-js\/(realtime-(redis|nats|durable-object)|db-[\w-]+)$|sharp$)/,
  },
  handler(source, importer) {
    // Sharp's addon can't be bundled, so it stays external and Nitro traces it, which it can only do from the app.
    if (source === 'sharp') {
      if (s.dev || !importer?.includes('plugin-media')) return
      try {
        createRequire(join(s.root, 'package.json')).resolve('sharp')
      } catch {
        this.warn(
          "M017: `sharp` isn't a dependency of this app, so the built server can't load it for the media route.\n  fix: add `sharp` to dependencies",
        )
        return
      }
      return { id: 'sharp', external: true }
    }
    if (source.startsWith('@weft-js/')) {
      if (this.environment?.config.consumer === 'client')
        this.error(
          `Q012: \`${source}\` reached the client graph${importer ? ` from ${relative(s.root, importer)}` : ''}: the database, auth and buses run on the server only.\n  fix: import it from a server module (src/server/**, *.server.ts) or a route's \`load\``,
        )
      return
    }
    const base = source.replace(/\?.*$/, '')
    if (Object.values(V).includes(base) || base.startsWith(ISLAND)) return s.id(source)
  },
})

export const load = (s) => ({
  filter: { id: /^\0virtual:weft\// },
  async handler(raw) {
    // `virtual:weft/entry-client?assets=client` (no src/entry.client.ts) is Nitro's assets plugin's to load.
    if (/[?&]assets\b/.test(raw)) return
    const which = raw.slice(1).replace(/\?.*$/, '')
    const client = this.environment?.config.consumer === 'client'
    if (which.startsWith(ISLAND)) {
      const { islands } = await s.hydration(this)
      const i = islands[Number(which.slice(ISLAND.length))]
      return `export { $i${i.index} as default } from ${JSON.stringify(i.file)}\n`
    }
    if (which === V.routes) {
      const p = await s.hydration(this)
      if (client) {
        const entry = s.clientEntry()
        const entryFile = entry.startsWith('virtual:') ? join(here, 'client.tsx') : entry
        const levels = [...s.manifest.layouts, ...s.manifest.routes]
        const files = [...new Set(levels.map((r) => s.abs(r.file)))]
          .filter((file) => /\.[jt]sx$/.test(file) && skeletonExport(file) === 'generated')
        const sources = await Promise.all(files.map((file) => shapeCssSources(this, file)))
        const shared = await entryCss(this, entryFile, s.root ?? dirname(entryFile))
        s.shapeEntrySignatures = shared.signatures
        const css = {
          entry: shared.styles,
          levels: new Map(files.map((file, i) => [file, sources[i]])),
        }
        return clientRoutes(s.manifest, s.abs, p, css)
      }
      return serverRoutes(
        s.manifest,
        s.abs,
        s.dev
          ? await devStyles(s.vite.environments.client, s.manifest, s.abs, s.clientEntry())
          : undefined,
        p,
      )
    }
    if (which === V.app)
      return appModule({
        site: s.options.site ?? {},
        build: s.build,
        dev: s.dev,
        fonts: cardFonts(
          s.manifest,
          s.abs,
          s.options.fonts ?? DEFAULT_FONTS,
          s.root,
          s.options.site?.card?.fonts,
        ),
        timeout: s.options.timeout,
        hold: s.options.hold,
      })
    if (which === V.server) return serverEntry(s.clientEntry(), s.dev, s.root)
    if (which === V.fns)
      return s.serverModules.map((f) => `import ${JSON.stringify(s.abs(f))}`).join('\n') + '\n'
    if (which === V.context || which === V.auth || which === V.realtime) {
      const name = which.slice('virtual:weft/'.length)
      const f = ['ts', 'mts', 'js', 'mjs']
        .map((x) => `src/${name}.server.${x}`)
        .find((x) => existsSync(s.abs(x)))
      if (which === V.realtime && busBound(s.root)) return busModule(f && s.abs(f), here)
      return f
        ? `export { default } from ${JSON.stringify(s.abs(f))}\n`
        : 'export default undefined\n'
    }
    if (which === V.extensions) return extensionsModule(s.root, s.abs)
    if (which === V.migrations)
      return s.dev
        ? `import { readMigrations } from ${JSON.stringify(join(here, 'migrations.mjs'))}\nexport default () => readMigrations(${JSON.stringify(s.root)})\n`
        : `const list = ${JSON.stringify(readMigrations(s.root))}\nexport default () => list\n`
    if (which === V.media) return mediaModule(s.root, s.dev)
    if (which === V.client)
      return `import { start } from ${JSON.stringify(join(here, 'client.tsx'))}\nimport * as routes from '${V.routes}'\n${ENTRY_SHEETS}start(routes)\n`
  },
})

export const transform = (s) => ({
  filter: { id: /\.[jt]sx?(\?weft-assets)?$|\/vite\/dist\/client\/client\.mjs$/ },
  async handler(code, file) {
    const path = file.replace(/\?.*$/, '')
    if (file.endsWith(ASSETS))
      return { code: await assetsOnly(this, code, path, s.root, s.words), map: null }
    if (path.endsWith('/client.mjs')) return s.dev ? markLinks(s.root) + code : undefined
    if (path.includes('/node_modules/')) return
    const client = this.environment?.config.consumer === 'client'
    if (client && path === s.clientEntry()) return { code: ENTRY_SHEETS + code, map: null }
    const rel = relative(s.root, path).split('\\').join('/')
    if (isServerModule(rel)) {
      const out = client
        ? clientStubs(code, path, rel, await s.shapeTable(this))
        : withIds(code, path, rel)
      if (client && s.dev) s.stubs.set(path, out)
      return out === code ? undefined : { code: out, map: null }
    }
    if (client && !rel.startsWith('..')) {
      const q003 = definesFns(code, path)
      if (q003)
        this.error(
          `Q003: ${rel} defines \`${q003.name}\` with \`${q003.kind}()\`, but it isn't a server module: its \`run\` and imports would ship to the client.\n  fix: move it to src/server/ or a *.server.ts file`,
        )
    }
    if (!client) return
    if (
      !s.manifest.routes.some((r) => r.file === rel) &&
      !s.manifest.layouts.some((l) => l.file === rel)
    )
      return
    if (s.dev) s.loaders.set(file, serverExports(code, file))
    const out = stripServerExports(code, file)
    // @weft-js/core/hmr saw the server exports and left this to Vite, but they're gone and the rest is components.
    if (
      s.dev &&
      out !== code &&
      !/^export (?!default\b|\{ \S+\$shape as default\$shape \})/m.test(out) &&
      !out.includes('import.meta.hot.accept(')
    )
      return { code: `${out}\nif (import.meta.hot) import.meta.hot.accept();\n`, map: null }
    return out === code ? undefined : { code: out, map: null }
  },
})

export const api = (s) => ({
  manifest: () => s.manifest ?? s.scan(),
  types: () => routeTypes(s.manifest ?? s.scan()),
  serverModules: () => (s.manifest ?? s.scan(), s.serverModules),
})
