// weftStart() for Vite 8 (research 25 §6): file routes as virtual modules, the server and client entries Nitro's Vite
// plugin builds (`nitro()` from `nitro/vite` goes next to it), and route modules without their server exports in
// the client build. Used through `weft dev` / `weft build`, which add weft() and nitro() and pass the config's `site`.
//
//   virtual:weft/routes         server: the manifest and every route, layout and card module
//                               client: the route table and a chunk loader per route id (load/meta/prerender stripped)
//   virtual:weft/app            server: site config, build id, card fonts (bytes, so every preset can read them)
//   virtual:weft/entry-server   the Nitro SSR entry: `export default { fetch }`
//   virtual:weft/entry-client   the client entry: `start()`, unless the app has src/entry.client.ts

import { existsSync, readFileSync, watch } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { parseSync, searchForWorkspaceRoot } from 'vite'
import { realpathSync } from 'node:fs'
import { scanRoutes, routeTypes } from './routes.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const V = {
  routes: 'virtual:weft/routes',
  app: 'virtual:weft/app',
  server: 'virtual:weft/entry-server',
  client: 'virtual:weft/entry-client',
}
const SERVER_EXPORTS = new Set(['load', 'meta', 'prerender'])
const DEFAULT_FONTS = ['Inter:400,700']

/**
 * @param {{ root?: string, site?: import('weft/ssr').Site, routesDir?: string, timeout?: number, fonts?: string[] }} [options]
 */
export default function weftStart(options = {}) {
  let root = options.root ?? process.cwd()
  let dev = false
  let manifest
  let build = ''
  const scan = () => (manifest = scanRoutes(root, options.routesDir ? resolve(root, options.routesDir) : undefined))
  const abs = f => resolve(root, f)
  const id = s => (s.startsWith('virtual:') ? '\0' + s : s)
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
        ssr: { noExternal: ['@weft/start', 'weft'], external: ['@takumi-rs/core'] },
        optimizeDeps: { exclude: ['@weft/start', 'weft'] },
        // The runtime files of @weft/start, weft and Nitro are served from wherever they're installed (a linked package
        // sits outside the app's root).
        server: { fs: { allow: [searchForWorkspaceRoot(root), join(here, '..'), ...packageDirs(root)] } },
        // One copy of the router: the app's route files and the generated entries import the same module.
        resolve: { alias: [{ find: /^@weft\/start$/, replacement: join(here, 'index.ts') }, { find: /^@weft\/start\/(client|server)$/, replacement: join(here, '$1.tsx') }] },
      }
    },
    configResolved(config) {
      build = createHash('sha256').update(String(Date.now())).digest('hex').slice(0, 8)
      if (dev) build = 'dev'
      root = config.root
    },
    configureServer(server) {
      // A route file added or removed changes the virtual modules; edits to existing ones are ordinary HMR/reloads.
      const dir = join(root, manifest.dir)
      if (!existsSync(dir)) return
      const w = watch(dir, { recursive: true }, (event, file) => {
        if (event !== 'rename' || !file) return
        scan()
        for (const env of Object.values(server.environments)) {
          for (const v of [V.routes]) {
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
    resolveId: {
      filter: { id: /^virtual:weft\// },
      handler(source) {
        const base = source.replace(/\?.*$/, '')
        if (Object.values(V).includes(base)) return id(source)
      },
    },
    load: {
      filter: { id: /^\0virtual:weft\// },
      handler(raw) {
        // `virtual:weft/entry-client?assets=client` (no src/entry.client.ts) is Nitro's assets plugin's to load.
        if (/[?&]assets\b/.test(raw)) return
        const which = raw.slice(1).replace(/\?.*$/, '')
        const client = this.environment?.config.consumer === 'client'
        if (which === V.routes) return client ? clientRoutes(manifest, abs) : serverRoutes(manifest, abs)
        if (which === V.app) return appModule({ site: options.site ?? {}, build, dev, fonts: cardFonts(manifest, abs, options.fonts ?? DEFAULT_FONTS, root), timeout: options.timeout })
        if (which === V.server) return serverEntry(clientEntry())
        if (which === V.client) return `import { start } from ${JSON.stringify(join(here, 'client.tsx'))}\nimport * as routes from '${V.routes}'\nstart(routes)\n`
      },
    },
    transform: {
      filter: { id: /\.[jt]sx?$/ },
      handler(code, file) {
        if (this.environment?.config.consumer !== 'client') return
        const rel = relative(root, file.replace(/\?.*$/, '')).split('\\').join('/')
        if (!manifest.routes.some(r => r.file === rel) && !manifest.layouts.some(l => l.file === rel)) return
        const out = stripServerExports(code, file)
        return out === code ? undefined : { code: out, map: null }
      },
    },
    /** `weft routes`, tests: the scanned manifest and the generated route types. */
    api: { manifest: () => manifest ?? scan(), types: () => routeTypes(manifest ?? scan()) },
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

function serverRoutes(manifest, abs) {
  const files = [...manifest.layouts.map(l => l.file), ...manifest.routes.map(r => r.file), ...manifest.routes.map(r => r.card).filter(Boolean), manifest.defaultCard].filter(Boolean)
  const unique = [...new Set(files)]
  return [
    ...unique.map((f, i) => `import * as m${i} from ${JSON.stringify(abs(f))}`),
    `export const manifest = ${JSON.stringify({ dir: manifest.dir, routes: manifest.routes, layouts: manifest.layouts, defaultCard: manifest.defaultCard })}`,
    `export const modules = { ${unique.map((f, i) => `${JSON.stringify(f)}: m${i}`).join(', ')} }`,
  ].join('\n')
}

function clientRoutes(manifest, abs) {
  const table = manifest.routes.filter(r => r.kind === 'page').map(r => ({ id: r.id, pattern: r.pattern, layouts: r.layouts }))
  const loads = [...manifest.layouts, ...manifest.routes].map(r => `${JSON.stringify(r.id)}: () => import(${JSON.stringify(abs(r.file))})`)
  return `export const table = ${JSON.stringify(table)}\nexport const load = { ${loads.join(', ')} }\n`
}

function serverEntry(clientEntry) {
  return `import { createHandler } from ${JSON.stringify(join(here, 'server.tsx'))}
import { manifest, modules } from '${V.routes}'
import * as app from '${V.app}'
import assets from '${clientEntry}?assets=client'
import { preloads } from 'weft:fonts/preloads'
const fetch = createHandler({ manifest, modules, site: app.site, build: app.build, dev: app.dev, fonts: app.fonts(), timeout: app.timeout, assets: { entry: assets.entry, js: assets.js, css: assets.css, fonts: preloads },
  // H005–H008 found while serving (a card's unsupported style, an image that didn't load): the server log, in dev and production.
  onDiagnostic: d => console.warn(\`[weft] \${d.code} \${d.severity}\${d.route ? \` (\${d.route})\` : ''}: \${d.message.replace(/^H\\d{3} /, '')}\`) })
export default { fetch }
`
}

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
  const again = parseSync(file, out, { lang: /\.tsx$/.test(file) ? 'tsx' : 'ts', sourceType: 'module' })
  const imports = again.program.body.filter(n => n.type === 'ImportDeclaration' && n.specifiers.length)
  let rest = out
  for (const imp of imports) rest = rest.slice(0, imp.start) + ' '.repeat(imp.end - imp.start) + rest.slice(imp.end)
  const used = name => new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}(?![\\w$])`).test(rest)
  for (const imp of imports.sort((x, y) => y.start - x.start)) {
    const keep = imp.specifiers.filter(s => used(s.local.name))
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

export { scanRoutes, routeTypes, here as startDir }
