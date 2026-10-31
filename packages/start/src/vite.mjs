// weftStart() for Vite 8 (research 25 §6): file routes as virtual modules, the server and client entries Nitro's Vite
// plugin builds (`nitro()` from `nitro/vite` goes next to it), and route modules without their server exports in
// the client build. Used through `weft dev` / `weft build`, which add weft() and nitro() and pass the config's `site`.
//
//   virtual:weft/routes         server: the manifest, every route, layout and card module, and each one's stylesheets
//                               client: the route table and a chunk loader per route id (load/meta/prerender stripped)
//   virtual:weft/app            server: site config, build id, card fonts (bytes, so every preset can read them)
//   virtual:weft/entry-server   the Nitro SSR entry: `export default { fetch }`
//   virtual:weft/entry-client   the client entry: `start()`, unless the app has src/entry.client.ts
//   virtual:weft/fns            server: imports every server module, so `/_weft/fn/<id>` knows every function
//   virtual:weft/context        server: `src/context.server.ts`'s default export (the app's part of `ctx`)
//   virtual:weft/auth           server: `src/auth.server.ts`'s default export, mounted at its base path
//   virtual:weft/migrations     server: `drizzle/`'s migrations, embedded (a bundle can't read a folder on every preset)
//   virtual:weft/media          server: the `media.server` provider when one is bound (research 29 §6)
//   virtual:weft/realtime       server: `src/realtime.server.ts`'s default export (the bus, origins and limits)
//
// Server modules (`src/server/**`, `*.server.ts`, research 27 §2): each `query`/`mutation`/`stream`/`channel` export
// gets an `$id` on both sides; the client build replaces the module with stubs that keep only `optimistic`, the
// query's shape and a shared state's `initial`.
//
// Stylesheets: routes are chunks the entry only reaches through `import()`, so `?assets=client` names just the entry's
// CSS. Each route and layout's own CSS comes from Nitro's assets manifest (build) or the client module graph (dev);
// the server links the entry's and those of the levels it matched, so nothing paints before its styles and other
// routes' CSS stays out of the page. In dev the links stand in for Vite's injected `<style>`s and HMR updates them.
// In a build the sheets go in the HTML as well (`inlineSheets`): a round trip saved before the first paint. `site:
// { inlineCss: false }` keeps the links.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, watch, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { isCSSRequest, parseSync, searchForWorkspaceRoot } from 'vite'
import { realpathSync } from 'node:fs'
import { scanRoutes, routeTypes } from './routes.mjs'
import { solve } from 'weft/hydration'
import { readMigrations } from './migrations.mjs'
import { INLINE_CSS_MAX } from './inline.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const V = {
  routes: 'virtual:weft/routes',
  app: 'virtual:weft/app',
  server: 'virtual:weft/entry-server',
  client: 'virtual:weft/entry-client',
  fns: 'virtual:weft/fns',
  context: 'virtual:weft/context',
  auth: 'virtual:weft/auth',
  migrations: 'virtual:weft/migrations',
  media: 'virtual:weft/media',
  realtime: 'virtual:weft/realtime',
}
const SERVER_EXPORTS = new Set(['load', 'meta', 'prerender'])
const DEFAULT_FONTS = ['Inter:400,700']
const SHEET = '/@weft-sheet/'
const ASSETS = '?weft-assets'
const ISLAND = 'virtual:weft/island/'
const NOT_ASSET = /\.[cm]?[jt]sx?$/
const INLINE_SHEETS = '__WEFT_INLINE_SHEETS__'

/**
 * The client build's stylesheets a page can carry, `{ href: css }`, read by the server build so every preset has them
 * with no file system. Left out: a sheet over the page's limit, one a relative `url()` would break, and one that could
 * close its `<style>`.
 */
export function inlineSheets(outDir, base) {
  const dir = join(outDir, 'assets')
  if (!existsSync(dir)) return {}
  const sheets = {}
  for (const name of readdirSync(dir).filter(f => f.endsWith('.css'))) {
    const css = readFileSync(join(dir, name), 'utf8')
    if (css.length <= INLINE_CSS_MAX && !/<\/style|<!--/i.test(css) && !/url\(\s*(?!["']?(?:\/|data:|https?:|#|%23))/.test(css)) sheets[`${base}assets/${name}`] = css
  }
  return sheets
}

/**
 * @param {{ root?: string, site?: import('weft/ssr').Site, routesDir?: string, timeout?: number, fonts?: string[], hydration?: 'partial' | 'full' }} [options]
 */
export default function weftStart(options = {}) {
  let root = options.root ?? process.cwd()
  let dev = false
  let manifest
  let build = ''
  let serverModules = []
  let vite
  let compile
  let plan
  let planned = 0
  const facts = new Map()
  /** Partial hydration's view of the project (PLAN §11), redone in dev when a file it read changed. */
  const hydration = async ctx => {
    if (options.hydration === 'full' || !compile) return undefined
    if (plan && !dev) return plan
    if (plan && Date.now() - planned < 200) return plan
    planned = Date.now()
    if (plan) {
      const p = await plan
      if (!p.stamps.some(f => statSync(f, { throwIfNoEntry: false })?.mtimeMs !== facts.get(f)?.mtime)) return p
    }
    const entries = [...manifest.routes, ...manifest.layouts].map(r => abs(r.file))
    plan = solve({ entries, transform: compile, rel: f => relative(root, f).split('\\').join('/'), cache: facts, resolve: async (spec, from) => (await ctx.resolve(spec, from, { skipSelf: true }))?.id })
    const done = await plan
    try {
      mkdirSync(join(root, '.weft'), { recursive: true })
      writeFileSync(join(root, '.weft', 'hydration.json'), `${JSON.stringify({ islands: done.islands.map(i => i.id), files: done.report }, null, 2)}\n`)
    } catch {}
    return done
  }
  let words
  const scan = () => {
    serverModules = scanServerModules(root)
    return (manifest = scanRoutes(root, options.routesDir ? resolve(root, options.routesDir) : undefined))
  }
  const abs = f => resolve(root, f)
  const id = s => (s.startsWith('virtual:') ? '\0' + s : s)
  let shapes
  /** Research 31 §3: the shape table, when the project asks for shapes at all. Loads the server modules, once per edit. */
  const shapeTable = async ctx => {
    if (!usesShapes(root)) return undefined
    const stamp = serverModules.map(f => statSync(abs(f)).mtimeMs).join()
    if (shapes?.stamp === stamp) return shapes.table
    try {
      const { readShapes } = await import('./contract.mjs')
      shapes = { stamp, table: await readShapes({ root, site: options.site }) }
      return shapes.table
    } catch (e) {
      ctx.warn(`the query shapes couldn't be read, so skeletons only have last-seen shapes: ${e.message}`)
    }
  }
  const clientEntry = () => (existsSync(join(root, 'src', 'entry.client.ts')) ? join(root, 'src', 'entry.client.ts') : V.client)

  return {
    name: 'weft:start',
    enforce: 'pre',
    config(config, env) {
      root = config.root ? resolve(config.root) : root
      dev = env.command === 'serve'
      scan()
      return {
        environments: {
          client: { build: { rollupOptions: { input: clientEntry() } } },
          ssr: { build: { rollupOptions: { input: V.server } } },
        },
        // The router-core server bundle and Takumi's addon stay external to the SSR graph; Nitro traces them.
        ssr: { noExternal: ['@weft/start', '@weft/warp', 'weft'], external: ['@takumi-rs/core'] },
        optimizeDeps: { exclude: ['@weft/start', '@weft/warp', 'weft'] }, // they ship TSX for the weft plugin
        // The runtime files of @weft/start, weft and Nitro are served from wherever they're installed (a linked package
        // sits outside the app's root).
        server: { fs: { allow: [searchForWorkspaceRoot(root), join(here, '..'), ...packageDirs(root)] } },
        // One copy of the router: the app's route files and the generated entries import the same module.
        resolve: { alias: [{ find: /^@weft\/start$/, replacement: join(here, 'index.ts') }, { find: /^@weft\/start\/(client|server)$/, replacement: join(here, '$1.tsx') }, { find: /^@weft\/start\/media$/, replacement: join(here, 'media.ts') }] },
      }
    },
    renderChunk: {
      order: 'post',
      handler(code) {
        const token = new RegExp(`["'\`]${INLINE_SHEETS}["'\`]`)
        if (!token.test(code)) return null
        const top = this.environment.getTopLevelConfig()
        const client = resolve(root, top.environments.client.build.outDir)
        const sheets = options.site?.inlineCss === false ? {} : inlineSheets(client, top.base ?? '/')
        return { code: code.replace(token, () => JSON.stringify(sheets)), map: null }
      },
    },
    configResolved(config) {
      build = createHash('sha256').update(String(Date.now())).digest('hex').slice(0, 8)
      if (dev) build = 'dev'
      root = config.root
      const main = config.plugins.find(p => p.name === 'weft')
      words = config.plugins.find(p => p.name === 'weft:purge')?.api
      if (main?.api) {
        compile = createRequire(join(here, 'vite.mjs'))('weft/compiler').transform
        main.api.islands = async (ctx, id) => (await hydration(ctx))?.files.get(id.replace(/\?.*$/, ''))
      }
    },
    configureServer(server) {
      vite = server
      // A `<link>` to a virtual sheet (`weft:fonts`): Vite only serves those as modules.
      server.middlewares.use(SHEET, async (req, res, next) => {
        const css = await server.environments.client.pluginContainer.load(decodeURIComponent(req.url.slice(1))).catch(() => undefined)
        if (css == null) return next()
        res.setHeader('content-type', 'text/css')
        res.end(typeof css === 'string' ? css : css.code)
      })
      // A route file added or removed changes the virtual modules; edits to existing ones are ordinary HMR/reloads.
      const dir = join(root, 'src')
      if (!existsSync(dir)) return
      const routesDir = relative(dir, join(root, manifest.dir)).split('\\').join('/')
      const w = watch(dir, { recursive: true }, (event, file) => {
        if (event !== 'rename' || !file) return
        const rel = file.split('\\').join('/')
        if (!rel.startsWith(routesDir + '/') && !isServerModule('src/' + rel)) return
        scan()
        for (const env of Object.values(server.environments)) {
          for (const v of [V.routes, V.fns, V.context]) {
            const m = env.moduleGraph.getModuleById('\0' + v)
            if (m) env.moduleGraph.invalidateModule(m)
          }
        }
        server.ws.send({ type: 'full-reload' })
      })
      // Close with the server (middleware mode, as `weft routes --meta` runs it, has no httpServer to listen on).
      const close = server.close.bind(server)
      server.close = () => (w.close(), close())
    },
    /** An edit can add or drop a stylesheet import: the next server load of the routes walks the graph again. */
    hotUpdate({ file }) {
      if (this.environment.config.consumer !== 'server') return
      const m = this.environment.moduleGraph.getModuleById('\0' + V.routes)
      if (m) this.environment.moduleGraph.invalidateModule(m)
      // A static component is in no browser's module graph, so nothing else would tell the tab it changed.
      if (!vite?.environments.client.moduleGraph.getModulesByFile(file)?.size && this.environment.moduleGraph.getModulesByFile(file)?.size) vite?.ws.send({ type: 'full-reload' })
    },
    resolveId: {
      filter: { id: /^(virtual:weft\/|@weft\/start\/(db|auth|bus|list|rust|sidecar)(\/|$)|@weft\/(realtime-(redis|nats|durable-object)|db-[\w-]+)$|sharp$)/ },
      handler(source, importer) {
        // Sharp's addon can't be bundled, so it stays external and Nitro traces it, which it can only do from the app.
        if (source === 'sharp') {
          if (dev || !importer?.includes('plugin-media')) return
          try { createRequire(join(root, 'package.json')).resolve('sharp') } catch {
            this.warn('M017: `sharp` isn\'t a dependency of this app, so the built server can\'t load it for the media route.\n  fix: add `sharp` to dependencies')
            return
          }
          return { id: 'sharp', external: true }
        }
        if (source.startsWith('@weft/')) {
          if (this.environment?.config.consumer === 'client') this.error(`Q012: \`${source}\` reached the client graph${importer ? ` from ${relative(root, importer)}` : ''}: the database, auth and buses run on the server only.\n  fix: import it from a server module (src/server/**, *.server.ts) or a route's \`load\``)
          return
        }
        const base = source.replace(/\?.*$/, '')
        if (Object.values(V).includes(base) || base.startsWith(ISLAND)) return id(source)
      },
    },
    load: {
      filter: { id: /^\0virtual:weft\// },
      async handler(raw) {
        // `virtual:weft/entry-client?assets=client` (no src/entry.client.ts) is Nitro's assets plugin's to load.
        if (/[?&]assets\b/.test(raw)) return
        const which = raw.slice(1).replace(/\?.*$/, '')
        const client = this.environment?.config.consumer === 'client'
        if (which.startsWith(ISLAND)) {
          const { islands } = await hydration(this)
          const i = islands[Number(which.slice(ISLAND.length))]
          return `export { $i${i.index} as default } from ${JSON.stringify(i.file)}\n`
        }
        if (which === V.routes) {
          const p = await hydration(this)
          return client ? clientRoutes(manifest, abs, p) : serverRoutes(manifest, abs, dev ? await devStyles(vite.environments.client, manifest, abs, clientEntry()) : undefined, p)
        }
        if (which === V.app) return appModule({ site: options.site ?? {}, build, dev, fonts: cardFonts(manifest, abs, options.fonts ?? DEFAULT_FONTS, root), timeout: options.timeout })
        if (which === V.server) return serverEntry(clientEntry(), dev)
        if (which === V.fns) return serverModules.map(f => `import ${JSON.stringify(abs(f))}`).join('\n') + '\n'
        if (which === V.context || which === V.auth || which === V.realtime) {
          const name = which.slice('virtual:weft/'.length)
          const f = ['ts', 'mts', 'js', 'mjs'].map(x => `src/${name}.server.${x}`).find(x => existsSync(abs(x)))
          if (which === V.realtime && busBound(root)) return busModule(f && abs(f), here)
          return f ? `export { default } from ${JSON.stringify(abs(f))}\n` : 'export default undefined\n'
        }
        if (which === V.migrations) return dev ? `import { readMigrations } from ${JSON.stringify(join(here, 'migrations.mjs'))}\nexport default () => readMigrations(${JSON.stringify(root)})\n` : `const list = ${JSON.stringify(readMigrations(root))}\nexport default () => list\n`
        if (which === V.media) return mediaModule(root, dev)
        if (which === V.client) return `import { start } from ${JSON.stringify(join(here, 'client.tsx'))}\nimport * as routes from '${V.routes}'\nstart(routes)\n`
      },
    },
    transform: {
      filter: { id: /\.[jt]sx?(\?weft-assets)?$|\/vite\/dist\/client\/client\.mjs$/ },
      async handler(code, file) {
        const path = file.replace(/\?.*$/, '')
        if (file.endsWith(ASSETS)) return { code: await assetsOnly(this, code, path, root, words), map: null }
        if (path.endsWith('/client.mjs')) return dev ? markLinks(root) + code : undefined
        if (path.includes('/node_modules/')) return
        const client = this.environment?.config.consumer === 'client'
        const rel = relative(root, path).split('\\').join('/')
        if (isServerModule(rel)) {
          const out = client ? clientStubs(code, path, rel, await shapeTable(this)) : withIds(code, path, rel)
          return out === code ? undefined : { code: out, map: null }
        }
        if (client && !rel.startsWith('..')) {
          const q003 = definesFns(code, path)
          if (q003) this.error(`Q003: ${rel} defines \`${q003.name}\` with \`${q003.kind}()\`, but it isn't a server module: its \`run\` and imports would ship to the client.\n  fix: move it to src/server/ or a *.server.ts file`)
        }
        if (!client) return
        if (!manifest.routes.some(r => r.file === rel) && !manifest.layouts.some(l => l.file === rel)) return
        const out = stripServerExports(code, file)
        return out === code ? undefined : { code: out, map: null }
      },
    },
    /** `weft routes`, tests: the scanned manifest, the generated route types and the server modules. */
    api: { manifest: () => manifest ?? scan(), types: () => routeTypes(manifest ?? scan()), serverModules: () => (manifest ?? scan(), serverModules) },
  }
}

function packageDirs(root) {
  const req = createRequire(join(root, 'package.json'))
  const own = createRequire(import.meta.url)
  const out = []
  for (const name of ['weft/vite', 'nitro/package.json']) { // each at its package root
    for (const r of [req, own]) {
      try { out.push(dirname(realpathSync(r.resolve(name)))); break } catch {}
    }
  }
  return out
}

/** The project asks for shapes: a `pending="shape"`, or a read of `.shape`. */
function usesShapes(root) {
  const src = join(root, 'src')
  if (!existsSync(src)) return false
  return readdirSync(src, { recursive: true, withFileTypes: true }).some(f => f.isFile() && /\.[jt]sx?$/.test(f.name) && /pending="shape"|\.shape\b/.test(readFileSync(join(f.parentPath, f.name), 'utf8')))
}

/**
 * `dev`: the stylesheets from `devStyles`; a build asks Nitro's manifest instead (the plugin's expression reads up to
 * the first `)`, which a path can hold). `meta` is read once per level that renders, before the first byte: that's
 * how the entry learns the request's levels (`routeCss`), outermost first, 404 and error pages included.
 */
function serverRoutes(manifest, abs, dev, plan) {
  const files = [...manifest.layouts.map(l => l.file), ...manifest.routes.map(r => r.file), ...manifest.routes.map(r => r.card).filter(Boolean), manifest.defaultCard].filter(Boolean)
  const unique = [...new Set(files)]
  const levels = new Set([...manifest.layouts, ...manifest.routes].map(r => r.file))
  // A file with no default export renders nothing, and may leave no chunk for the manifest to find.
  const renders = f => levels.has(f) && /\bdefault\b/.test(readFileSync(abs(f), 'utf8'))
  const isStatic = f => plan?.statics.has(abs(f))
  const css = f => dev ? JSON.stringify(dev.files[f] ?? []) : `import.meta.vite.assets(${JSON.stringify({ import: abs(f) + (isStatic(f) ? ASSETS : ''), environment: 'client' }).replaceAll(')', '\\u0029')}).css`
  return [
    ...unique.map((f, i) => `import * as m${i} from ${JSON.stringify(abs(f))}`),
    `import { runtime } from ${JSON.stringify(join(here, 'data.ts'))}`,
    `const matched = new WeakMap()
const styled = (m, css) => !css.length ? m : { ...m, get meta() {
  const scope = runtime.scope?.()
  if (scope) matched.set(scope, [...(matched.get(scope) ?? []), ...css])
  return m.meta
} }
export const routeCss = css => [...new Map([...${JSON.stringify(dev?.entry ?? [])}, ...css, ...(matched.get(runtime.scope?.()) ?? [])].map(c => [c.href, c])).values()]`,
    `export const manifest = ${JSON.stringify({ dir: manifest.dir, routes: manifest.routes, layouts: manifest.layouts, defaultCard: manifest.defaultCard })}`,
    // The built-in 404 and error pages have no state, and stand in only when the app has no route file for them.
    `export const statics = ${JSON.stringify(!plan ? [] : [...[...manifest.layouts, ...manifest.routes].filter(r => isStatic(r.file)).map(r => r.id), ...['404', 'error'].filter(id => !manifest.routes.some(r => r.id === id))])}`,
    `export const modules = { ${unique.map((f, i) => `${JSON.stringify(f)}: ${renders(f) ? `styled(m${i}, ${css(f)})` : `m${i}`}`).join(', ')} }`,
  ].join('\n')
}

/**
 * The CSS each module reaches in the client graph, as `?assets=client` can't say in dev: the entry's, and each route
 * and layout's. The client env transforms what the browser is about to ask for anyway, and `<link href>` to a module's
 * URL gets the compiled sheet (Tailwind's output too). A module that doesn't transform fails again when it's imported.
 */
async function devStyles(env, manifest, abs, entry) {
  const reach = async url => {
    const seen = new Set(), css = new Map()
    const walk = async url => {
      const mod = await env.moduleGraph.getModuleByUrl(url).catch(() => undefined) ?? await env.moduleGraph.ensureEntryFromUrl(url).catch(() => undefined)
      if (!mod || seen.has(mod) || mod.id?.startsWith('\0virtual:weft/routes')) return // routes import every route
      seen.add(mod)
      await env.transformRequest(mod.url).catch(() => {})
      for (const next of mod.importedModules) {
        if (!next.id) continue
        if (!isCSSRequest(next.id)) await walk(next.url)
        else if (!/[?&](url|inline|raw)\b/.test(next.id)) css.set(next.url, { href: next.url[0] === '/' ? next.url : SHEET + encodeURIComponent(next.id) })
      }
    }
    await walk(url)
    return [...css.values()]
  }
  const files = {}
  for (const { file } of [...manifest.layouts, ...manifest.routes]) files[file] = await reach(abs(file))
  return { entry: await reach(entry.startsWith('virtual:') ? join(here, 'client.tsx') : entry), files }
}

/**
 * Vite's client, in dev: the fullstack plugin's patch hands a sheet to its `<link data-vite-dev-id>`, so the module
 * doesn't inject a second copy and CSS HMR swaps the link. The server only writes `href`, so the id is added here,
 * before the patched client reads the links.
 */
const markLinks = root => `document.querySelectorAll('link[rel="stylesheet"]:not([data-vite-dev-id])').forEach(l => {
  const href = l.getAttribute('href')
  if (href.startsWith('${SHEET}')) l.setAttribute('data-vite-dev-id', decodeURIComponent(href.slice(${SHEET.length})))
  else if (href.startsWith('/@fs/')) l.setAttribute('data-vite-dev-id', href.replace(/^\\/@fs(\\/(?=[A-Za-z]:))?/, ''))
  else if (href[0] === '/' && href[1] !== '/') l.setAttribute('data-vite-dev-id', ${JSON.stringify(root)} + href)
})
`

function clientRoutes(manifest, abs, plan) {
  const table = manifest.routes.filter(r => r.kind === 'page').map(r => ({ id: r.id, pattern: r.pattern, layouts: r.layouts }))
  const levels = [...manifest.layouts, ...manifest.routes]
  const isStatic = r => plan?.statics.has(abs(r.file))
  // A static route loads only what its module imports that isn't code: its stylesheets, for a navigation to it.
  const loads = levels.map(r => `${JSON.stringify(r.id)}: () => import(${JSON.stringify(abs(r.file) + (isStatic(r) ? ASSETS : ''))})`)
  const islands = (plan?.islands ?? []).map((i, n) => `${JSON.stringify(i.id)}: () => import(${JSON.stringify(ISLAND + n)})`)
  return `export const table = ${JSON.stringify(table)}\nexport const load = { ${loads.join(', ')} }\nexport const islands = { ${islands.join(', ')} }\n`
}

/**
 * A static module in the client build: what it imports that isn't code (stylesheets, images), and the same of the
 * modules it imports. Its class names go to the purge, which only sees client files.
 */
async function assetsOnly(ctx, code, path, root, words) {
  words?.add(code)
  const ast = parse(path, code)
  const out = []
  for (const n of ast.program.body) {
    if (!/^(ImportDeclaration|ExportNamedDeclaration|ExportAllDeclaration)$/.test(n.type) || !n.source || n.importKind === 'type' || n.exportKind === 'type') continue
    const spec = n.source.value
    if (/^(weft|@weft\/start)($|\/)/.test(spec)) continue
    const file = (await ctx.resolve(spec, path, { skipSelf: true }))?.id
    if (!file) continue
    const bare = file.replace(/\?.*$/, '')
    if (!NOT_ASSET.test(bare)) out.push(`import ${JSON.stringify(spec)}`)
    else if (!bare.includes('/node_modules/') && !isServerModule(relative(root, bare).split('\\').join('/'))) out.push(`import ${JSON.stringify(bare + ASSETS)}`)
  }
  if (code.includes('weft/style')) out.push(`import 'virtual:weft/groups.css'`)
  out.push('export default null') // a chunk of only CSS is dropped, and the server looks this one up
  return out.join('\n') + '\n'
}

function serverEntry(clientEntry, dev) {
  return `import { createHandler } from ${JSON.stringify(join(here, 'server.tsx'))}
import { manifest, modules, routeCss, statics } from '${V.routes}'
import '${V.fns}'
import context from '${V.context}'
import auth from '${V.auth}'
import migrations from '${V.migrations}'
import media from '${V.media}'
import realtime from '${V.realtime}'
import * as app from '${V.app}'
import assets from '${clientEntry}?assets=client'
import { preloads } from 'weft:fonts/preloads'
const fetch = createHandler({ manifest, modules, statics, context, auth, migrations, media, realtime, site: app.site, build: app.build, dev: app.dev, fonts: app.fonts(), timeout: app.timeout, assets: { entry: assets.entry, js: assets.js, get css() { return routeCss(assets.css) }, fonts: preloads, inline: ${dev ? 'undefined' : `'${INLINE_SHEETS}'`} },
  // H005–H008, Q002–Q014, A002–A004, F002–F003, M017 and R-codes found while serving: the server log, in dev and production.
  onDiagnostic: d => console.warn(\`[weft] \${d.code} \${d.severity}\${d.route ? \` (\${d.route})\` : ''}: \${d.message.replace(/^[HQACFMRW]\\d{3}:? /, '')}\`) })
export default { fetch }
`
}

/** Dev serves from the project; a built server from the directory it runs in (or `WEFT_MEDIA_DIR`). */
function mediaModule(root, dev) {
  const slot = join(root, '.weft', 'slots', 'media.server.ts')
  if (!existsSync(slot) || readFileSync(slot, 'utf8').includes('provider = null')) return 'export default undefined\n'
  const at = dev ? JSON.stringify(root) : 'undefined'
  if (!existsSync(join(root, '.weft', 'slots', 'media.encode.ts'))) return `import { load } from 'weft:slot/media.server'\nexport default () => load().then(m => m.at(${at}))\n`
  return `import { load } from 'weft:slot/media.server'
import { load as encoder, providers } from 'weft:slot/media.encode'
const encode = async () => Object.fromEntries(await Promise.all(Object.keys(providers).filter(k => providers[k]).map(async k => [k, await encoder(k)])))
export default () => Promise.all([load(), encode()]).then(([m, e]) => m.at(${at}, e))
`
}

const busBound = root => {
  const slot = join(root, '.weft', 'slots', 'realtime.bus.ts')
  return existsSync(slot) && readFileSync(slot, 'utf8').includes('provider = {')
}

/** A bus in `src/realtime.server.ts` wins over the plugin's, like any explicit choice. */
const busModule = (file, here) => `import { load, provider } from 'weft:slot/realtime.bus'
import { slotBus } from ${JSON.stringify(join(here, 'bus.ts'))}
${file ? `import own from ${JSON.stringify(file)}` : 'const own = undefined'}
export default { ...own, bus: own?.bus ?? slotBus(provider.plugin, load) }
`

function appModule({ site, build, dev, fonts, timeout }) {
  return `export const site = ${JSON.stringify(site)}
export const build = ${JSON.stringify(build)}
export const dev = ${dev}
export const timeout = ${timeout ?? 'undefined'}
const raw = ${JSON.stringify(fonts)}
let decoded
export function fonts() {
  return (decoded ??= raw.map(f => ({ ...f, data: Uint8Array.from(atob(f.data), c => c.charCodeAt(0)) })))
}
`
}

/**
 * The fonts every card can use, resolved at build and shipped inside the server bundle (research 20 §4.2: a render
 * never fetches fonts). `Inter:400,700` → `@fontsource/inter`'s latin WOFF2 files, from the app or from @weft/start.
 */
function cardFonts(manifest, abs, defaults, root) {
  const specs = new Set(defaults)
  for (const f of [...manifest.routes.map(r => r.card), manifest.defaultCard].filter(Boolean)) {
    const m = /export\s+const\s+fonts\s*=\s*\[([^\]]*)\]/.exec(readFileSync(abs(f), 'utf8'))
    if (m) for (const s of m[1].matchAll(/['"]([^'"]+)['"]/g)) specs.add(s[1])
  }
  const requires = [createRequire(join(root, 'package.json')), createRequire(import.meta.url)]
  const out = []
  for (const spec of specs) {
    const [family, weights = '400'] = spec.split(':')
    const pkg = family.toLowerCase().replace(/\s+/g, '-')
    for (const w of weights.split(',')) {
      const [weight, italic] = [Number.parseInt(w), /i(talic)?$/.test(w)]
      const file = `@fontsource/${pkg}/files/${pkg}-latin-${weight}-${italic ? 'italic' : 'normal'}.woff2`
      const path = requires.map(r => { try { return r.resolve(file) } catch { return undefined } }).find(Boolean)
      if (!path) throw new Error(`weft: card font \`${spec}\` needs \`@fontsource/${pkg}\` installed (looked for ${file})`)
      out.push({ name: family, weight, style: italic ? 'italic' : 'normal', data: readFileSync(path).toString('base64') })
    }
  }
  return out
}

/**
 * The client build of a route module: `load`, `meta` and `prerender` removed (they run on the server; loaders can
 * hold database code and secrets), then imports nothing else uses. Exported for tests.
 */
export function stripServerExports(code, file = 'route.tsx') {
  const ast = parseSync(file, code, { lang: /\.tsx$/.test(file) ? 'tsx' : /\.ts$/.test(file) ? 'ts' : 'jsx', sourceType: 'module' })
  const cuts = []
  for (const node of ast.program.body) {
    if (node.type !== 'ExportNamedDeclaration' || !node.declaration) continue
    const d = node.declaration
    const names = d.type === 'VariableDeclaration' ? d.declarations.map(x => x.id?.name) : [d.id?.name]
    if (names.length && names.every(n => SERVER_EXPORTS.has(n))) cuts.push([node.start, node.end])
  }
  if (!cuts.length) return code
  let out = code
  for (const [a, b] of cuts.sort((x, y) => y[0] - x[0])) out = out.slice(0, a) + out.slice(b)
  // Imports whose bindings are no longer used go too (a db client a loader imported must not reach the browser).
  return pruneImports(out, file)
}

const parse = (file, code) => parseSync(file, code, { lang: /\.tsx$/.test(file) ? 'tsx' : /\.[cm]?ts$/.test(file) ? 'ts' : 'jsx', sourceType: 'module' })

/** The TS nodes that hold code; every other `TS*` node is a type, gone once TypeScript is stripped. */
const TS_VALUE = /^TS((As|Satisfies|NonNull|Instantiation)Expression|TypeAssertion|Enum\w+|Module\w+|ImportEqualsDeclaration|ExternalModuleReference|ParameterProperty|ExportAssignment)$/
const NAMED_MEMBER = /^(Property|MethodDefinition|PropertyDefinition|AccessorProperty)$/
const binds = p => !p ? [] : p.type === 'Identifier' ? [p.name] : (p.properties ?? p.elements ?? [p.value ?? p.left ?? p.argument ?? p.parameter]).flatMap(binds)
const declares = s => s.type === 'VariableDeclaration' ? s.declarations.flatMap(d => binds(d.id)) : /^(Function|Class)Declaration$/.test(s.type) && s.id ? [s.id.name] : []

/**
 * The outer names `ast` reads at run time. Not types (`typeof x` in one reads nothing), property names, or what a
 * function or block binds itself: `optimistic: ({ input }) => …` doesn't use a top-level `input`. It errs towards a name
 * being used: a kept import is a bigger bundle, a dropped one a crash.
 */
function valueNames(ast) {
  const out = new Set()
  const walk = (n, bound) => {
    if (Array.isArray(n)) return n.forEach(x => walk(x, bound))
    if (typeof n?.type !== 'string' || n.type === 'ImportDeclaration' || n.exportKind === 'type' || (n.type.startsWith('TS') && !TS_VALUE.test(n.type))) return
    if (n.type === 'Identifier' || n.type === 'JSXIdentifier') { if (!bound.has(n.name)) out.add(n.name); return }
    const inner = /^(Arrow)?Function/.test(n.type) ? [...(n.id ? [n.id.name] : []), ...n.params.flatMap(binds)] : n.type === 'BlockStatement' ? n.body.flatMap(declares) : []
    const scope = inner.length ? new Set([...bound, ...inner]) : bound
    const skip = n.computed ? undefined : n.type === 'MemberExpression' ? 'property' : NAMED_MEMBER.test(n.type) ? 'key' : undefined
    for (const k in n) if (k !== skip && k !== 'parent' && n[k] && typeof n[k] === 'object') walk(n[k], scope)
  }
  walk(ast.program.body, new Set())
  return out
}

/** Drop value import specifiers nothing in `out` reads (and imports left empty). */
function pruneImports(out, file) {
  const again = parse(file, out)
  const imports = again.program.body.filter(n => n.type === 'ImportDeclaration' && n.specifiers.length)
  const used = valueNames(again)
  let rest = out
  for (const imp of imports) rest = rest.slice(0, imp.start) + ' '.repeat(imp.end - imp.start) + rest.slice(imp.end)
  const spelled = new Set(rest.match(/[A-Za-z_$][\w$]*/g)) // a type import is erased, so a type may keep it
  for (const imp of imports.sort((x, y) => y.start - x.start)) {
    const keep = imp.specifiers.filter(s => (imp.importKind === 'type' || s.importKind === 'type' ? spelled : used).has(s.local.name))
    if (keep.length === imp.specifiers.length) continue
    const text = keep.length ? rewriteImport(imp, keep, out) : ''
    out = out.slice(0, imp.start) + text + out.slice(imp.end)
  }
  return out
}

function rewriteImport(imp, keep, code) {
  const def = keep.find(s => s.type === 'ImportDefaultSpecifier')
  const ns = keep.find(s => s.type === 'ImportNamespaceSpecifier')
  const named = keep.filter(s => s.type === 'ImportSpecifier').map(s => code.slice(s.start, s.end))
  const parts = [def && def.local.name, ns && `* as ${ns.local.name}`, named.length && `{ ${named.join(', ')} }`].filter(Boolean)
  return `import ${imp.importKind === 'type' ? 'type ' : ''}${parts.join(', ')} from ${code.slice(imp.source.start, imp.source.end)}`
}

// ---- server modules (research 27 §2) ------------------------------------------------------------------------------

/** `src/server/**` and `*.server.ts(x)`: files whose `query`/`mutation` exports become client stubs. */
export const isServerModule = rel => /^src\/server\//.test(rel) || /\.server\.[cm]?[jt]sx?$/.test(rel)

function scanServerModules(root) {
  const out = []
  const walk = dir => {
    let list
    try { list = readdirSync(join(root, dir), { withFileTypes: true }) } catch { return }
    for (const d of list) {
      const rel = `${dir}/${d.name}`
      if (d.isDirectory()) { if (d.name !== 'node_modules' && !d.name.startsWith('.')) walk(rel) }
      else if (/\.[cm]?[jt]sx?$/.test(d.name) && !/\.(test|spec)\./.test(d.name) && !/\.d\.ts$/.test(d.name) && isServerModule(rel)) out.push(rel)
    }
  }
  walk('src')
  return out.sort()
}

const FN_KINDS = new Set(['query', 'mutation', 'stream', 'topic', 'channel', 'sharedState'])

/** Local names bound to the `FN_KINDS` from @weft/start. */
function fnLocals(ast) {
  const locals = new Map()
  for (const n of ast.program.body) {
    if (n.type !== 'ImportDeclaration' || n.importKind === 'type' || !/^@weft\/start(\/data)?$/.test(n.source.value)) continue
    for (const s of n.specifiers) if (s.type === 'ImportSpecifier' && s.importKind !== 'type' && FN_KINDS.has(s.imported.name ?? s.imported.value)) locals.set(s.local.name, s.imported.name ?? s.imported.value)
  }
  return locals
}

/** `export const name = query({ … })` statements: the call, its options object and the export name. */
function fnExports(ast, locals) {
  const out = []
  for (const n of ast.program.body) {
    if (n.type !== 'ExportNamedDeclaration' || n.declaration?.type !== 'VariableDeclaration') continue
    for (const d of n.declaration.declarations) {
      const call = d.init?.type === 'CallExpression' ? d.init : d.init?.type === 'TSAsExpression' || d.init?.type === 'TSSatisfiesExpression' ? d.init.expression : undefined
      if (call?.type !== 'CallExpression' || call.callee.type !== 'Identifier' || !locals.has(call.callee.name)) continue
      const obj = call.arguments[locals.get(call.callee.name) === 'sharedState' ? 1 : 0] // `sharedState(name, { … })`
      if (obj?.type !== 'ObjectExpression' || d.id.type !== 'Identifier') continue
      out.push({ node: n, name: d.id.name, callee: call.callee.name, obj, single: n.declaration.declarations.length === 1 })
    }
  }
  return out
}

const prop = (obj, key) => obj.properties.find(p => p.type === 'Property' && !p.computed && (p.key.name ?? p.key.value) === key)
export const fnId = (name, rel) => `${name}.${createHash('sha256').update(rel).digest('hex').slice(0, 6)}`

/** The server build of a server module: each definition gets its `$id`. Exported for tests. */
export function withIds(code, file, rel) {
  const ast = parse(file, code)
  const locals = fnLocals(ast)
  const all = fnExports(ast, locals)
  for (const f of all) {
    const kind = locals.get(f.callee)
    if ((kind === 'channel' || kind === 'sharedState') && !prop(f.obj, 'authorize')) {
      const line = code.slice(0, f.obj.start).split('\n').length
      throw Object.assign(new Error(`R001: ${rel}:${line} \`${f.name}\` has no \`authorize\`: anyone could join it.\n  fix: add \`authorize\` (\`() => true\` must be written out)`), { code: 'R001' })
    }
  }
  const list = all.filter(f => !prop(f.obj, '$id'))
  let out = code
  for (const f of list.sort((a, b) => b.obj.start - a.obj.start)) out = out.slice(0, f.obj.start + 1) + ` $id: ${JSON.stringify(fnId(f.name, rel))},` + out.slice(f.obj.start + 1)
  return out
}

/**
 * The client build of a server module: stubs (`query({ $id, shape })`, `mutation({ $id, optimistic })`), the top-level
 * declarations a kept `optimistic` reads as values, and the imports those use. Nothing else: no `run`, no database
 * client, no other export, and no types (they're erased, and `z.infer<typeof input>` would keep `input` and zod).
 * Exported for tests.
 */
export function clientStubs(code, file, rel, shapes) {
  const ast = parse(file, code)
  const locals = fnLocals(ast)
  const defs = new Map(fnExports(ast, locals).map(f => [f.node, f]))
  const kept = [] // [start, text]
  const candidates = []
  const names = text => new Set(text.match(/[A-Za-z_$][\w$]*/g) ?? [])
  for (const n of ast.program.body) {
    if (n.type === 'ImportDeclaration') {
      if (n.specifiers.length) kept.push([n.start, code.slice(n.start, n.end)]) // pruned below; side-effect imports go
      continue
    }
    const f = defs.get(n)
    if (f && f.single) {
      const opt = prop(f.obj, 'optimistic')
      const id = fnId(f.name, rel)
      const kind = locals.get(f.callee)
      if (kind === 'channel' || kind === 'sharedState') {
        const initial = prop(f.obj, 'initial')
        kept.push([n.start, `export const ${f.name} = ${f.callee}(${kind === 'sharedState' ? "'', " : ''}{ $id: ${JSON.stringify(id)}, $stub: 1${initial ? `, ${code.slice(initial.start, initial.end)}` : ''} })`])
        continue
      }
      // The tree the schema gave when there's a table; else what was declared, as it was written.
      const shape = shapes?.[id] !== undefined ? `shape: ${JSON.stringify(shapes[id])}` : prop(f.obj, 'shape') && code.slice(prop(f.obj, 'shape').start, prop(f.obj, 'shape').end)
      kept.push([n.start, `export const ${f.name} = ${f.callee}({ $id: ${JSON.stringify(id)}${opt ? `, ${code.slice(opt.start, opt.end)}` : ''}${shape ? `, ${shape}` : ''} })`])
      continue
    }
    const decl = n.type === 'ExportNamedDeclaration' ? n.declaration : n
    if (!decl) continue
    if (/^TS(TypeAlias|Interface)Declaration$/.test(decl.type) || n.exportKind === 'type') continue
    if (/^TS(Enum|Module)Declaration$/.test(decl.type)) { // the kinds with code in them, kept like any helper
      candidates.push({ n, declares: [decl.id.name] })
      continue
    }
    const declares = decl.type === 'VariableDeclaration' ? decl.declarations.flatMap(d => [...names(code.slice(d.id.start, d.id.end))]) : decl.id ? [decl.id.name] : []
    if (declares.length) candidates.push({ n, declares })
  }
  // Helpers a kept `optimistic` reads (and what they read), in source order.
  for (let grew = true; grew; ) {
    grew = false
    const used = valueNames(parse(file, kept.map(([, t]) => t).join('\n')))
    for (const c of candidates.splice(0)) {
      if (c.declares.some(d => used.has(d))) { kept.push([c.n.start, code.slice(c.n.start, c.n.end)]); grew = true }
      else candidates.push(c)
    }
  }
  const out = `// weft: client stubs for ${rel} (research 27 §2)\n` + kept.sort((a, b) => a[0] - b[0]).map(([, t]) => t).join('\n') + '\n'
  return pruneImports(out, file)
}

/** Q003: a `query`/`mutation` defined in a file that isn't a server module (its name and kind), or undefined. */
function definesFns(code, file) {
  if (!/@weft\/start/.test(code) || !/\b(query|mutation|stream|topic|channel|sharedState)\b/.test(code)) return
  const ast = parse(file, code)
  const locals = fnLocals(ast)
  if (!locals.size) return
  const f = fnExports(ast, locals)[0]
  if (f) return { name: f.name, kind: locals.get(f.callee) }
  for (const [local, kind] of locals) if (new RegExp(`(?<![\\w$.])${local}\\s*\\(`).test(code)) return { name: local, kind }
}

export { scanRoutes, routeTypes, here as startDir }
