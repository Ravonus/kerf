import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { readMigrations } from '../migrations.mjs'
import { routeTypes } from '../routes.mjs'
import { assetsOnly } from './assets.mjs'
import { entryCss, projectParent, watchEntryCandidates } from './shape-entry-css.mjs'
import { resolveImportedOverride, shapeOverride } from './shape-override.mjs'
import {
  clientRoutes,
  shellRoutes,
  serverRoutes,
  devStyles,
  markLinks,
  skeletonExport,
} from './route-modules.mjs'
import {
  serverEntry,
  httpModule,
  extensionsModule,
  mediaModule,
  busBound,
  busModule,
  appModule,
  cardFonts,
} from './entries.mjs'
import { stripServerExports, serverExports } from './syntax.mjs'
import {
  isServerModule,
  definesFns,
  withIds,
  clientStubs,
  functionContracts,
} from './server-functions.mjs'
import { here, V, DEFAULT_FONTS, ASSETS, ISLAND, ENTRY_SHEETS } from './shared.mjs'
import { normalizeAssetLookup } from './nitro-output.mjs'

/** Virtual modules that are an app file's default export: `src/<name>.server.ts`, or `undefined` without one. */
const CONFIG_FILES = new Set([V.context, V.auth, V.realtime, V.cache, V.cron, V.email, V.jobs])

export const resolveId = (s) => ({
  filter: {
    id: /^(virtual:kerf\/|@kerf-js\/start\/(db|auth|bus|list|rust|sidecar)(\/|$)|@kerf-js\/(realtime-(redis|nats|durable-object)|db-[\w-]+)$|sharp$)/,
  },
  handler(source, importer) {
    const asset = s.assetSources.get(source)
    if (asset) return asset === V.client ? s.id(asset) : this.resolve(asset, importer)
    // Sharp's addon can't be bundled, so it stays external and Nitro traces it, which it can only do from the app.
    if (source === 'sharp') {
      if (s.dev || !/[\\/](@kerf-js[\\/]media|packages[\\/]media)[\\/]/.test(importer ?? '')) return
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
    if (source.startsWith('@kerf-js/')) {
      if (this.environment?.config.consumer === 'client')
        this.error(
          `Q012: \`${source}\` reached the client graph${importer ? ` from ${relative(s.root, importer)}` : ''}: the database, auth and buses run on the server only.\n  fix: import it from a server module (src/server/**, *.server.ts) or a route's \`load\``,
        )
      return
    }
    const base = source.replace(/\?.*$/, '')
    if (
      Object.values(V).includes(base) ||
      base.startsWith(ISLAND) ||
      base.startsWith('virtual:kerf/shape-override/')
    )
      return s.id(source)
  },
})

export const load = (s) => ({
  filter: { id: /^\0virtual:kerf\// },
  async handler(raw) {
    // `virtual:kerf/entry-client?assets=client` (no src/entry.client.ts) is Nitro's assets plugin's to load.
    if (/[?&]assets\b/.test(raw)) return
    const which = raw.slice(1).replace(/\?.*$/, '')
    const client = this.environment?.config.consumer === 'client'
    if (which.startsWith('virtual:kerf/shape-override/'))
      return overrideModule(this, s, which, client)
    if (which.startsWith(ISLAND)) {
      const { islands } = await s.hydration(this)
      const i = islands[Number(which.slice(ISLAND.length))]
      return `export { $i${i.index} as default } from ${JSON.stringify(i.file)}\n`
    }
    if (which === V.routes) return routesModule(this, s, client)
    if (which === V.http || which === V.hooks) {
      if (client) this.error('Q012: HTTP routes and request hooks run only on the server')
      return httpModule(s, which === V.hooks, this)
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
    if (which === V.server) return serverEntry(s)
    if (which === V.fns)
      return s.serverModules.map((f) => `import ${JSON.stringify(s.abs(f))}`).join('\n') + '\n'
    if (CONFIG_FILES.has(which)) return configModule(s, which)
    if (which === V.extensions) return extensionsModule(s.root, s.abs)
    if (which === V.migrations)
      return s.dev
        ? `import { readMigrations } from ${JSON.stringify(join(here, 'migrations.mjs'))}\nexport default () => readMigrations(${JSON.stringify(s.root)})\n`
        : `const list = ${JSON.stringify(readMigrations(s.root))}\nexport default () => list\n`
    if (which === V.media) return mediaModule(s.root, s.dev)
    if (which === V.client)
      return `import { start } from ${JSON.stringify(join(here, 'client.tsx'))}\nimport * as routes from '${V.routes}'\n${s.shell ? '' : ENTRY_SHEETS}start(routes)\n`
  },
})

export const transform = (s) => ({
  filter: {
    id: /\.[jt]sx?(\?kerf-assets)?$|\/[\s\S]+\.[cm][jt]s$|\/vite\/dist\/client\/client\.mjs$|^\0virtual:fullstack\/assets\?|[?&]assets(?:[=&]|$)/,
  },
  async handler(code, file) {
    if (
      !s.dev &&
      (file.startsWith('\0virtual:fullstack/assets?') ||
        (/[?&]assets(?:[=&]|$)/.test(file) && code.includes('virtual:fullstack/assets-manifest')))
    )
      return { code: normalizeAssetLookup(code, s.assetKey), map: { mappings: '' } }
    const path = file.replace(/\?.*$/, '')
    if (file.endsWith(ASSETS))
      return { code: await assetsOnly(this, code, path, s.root, s.words), map: null }
    if (!s.shell && /\.[cm][jt]s$/.test(path) && !path.endsWith('/vite/dist/client/client.mjs'))
      return
    if (path.endsWith('/vite/dist/client/client.mjs'))
      return s.dev ? markLinks(s.root) + code : undefined
    if (path.includes('/node_modules/')) return
    const client = this.environment?.config.consumer === 'client'
    const shell = s.shell
    if (client && path === s.clientEntry() && !shell)
      return { code: ENTRY_SHEETS + code, map: null }
    const rel = relative(s.root, path).split('\\').join('/')
    if (client && (/\.http\.[jt]s$/.test(rel) || rel.startsWith('src/hooks.server.')))
      this.error(`Q012: ${rel} runs only on the server; do not import it from client code`)
    if (shell && !rel.startsWith('..') && code.includes('@kerf-js/start')) {
      const findings = functionContracts(code, rel)
      if (findings.length)
        this.error(findings.map(({ name, why }) => `Q021: ${rel} \`${name}\`: ${why}`).join('\n'))
    }
    if (isServerModule(rel)) {
      const out = client
        ? clientStubs(code, path, rel, await s.shapeTable(this), shell)
        : withIds(code, path, rel, shell)
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
    if (s.dev) s.loaders.set(file, serverExports(code, file, shell))
    const out = stripServerExports(code, file, shell)
    // @kerf-js/core/hmr saw the server exports and left this to Vite, but they're gone and the rest is components.
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

/** What a route's imported skeleton gave: a file to watch, an override to use, or nothing (said so). */
function took(ctx, { s, root, file, found, depend, overrides }) {
  if (found?.file) depend(found.file, file)
  if (found?.code) overrides.set(file, found.code)
  // An imported function that isn't plain markup is as unusable as a local one.
  else unusableSkeleton(ctx, s, root, file)
}

/** A route that exports `skeleton` in a form navigation can't use gets none at all: say so once, with what works. */
function unusableSkeleton(ctx, s, root, file) {
  if (!/export\s+const\s+skeleton\b/.test(readFileSync(file, 'utf8'))) return
  const warned = (s.skeletonWarned ??= new Set())
  if (warned.has(file)) return
  warned.add(file)
  ctx.warn(
    `${relative(root, file)}: \`export const skeleton\` can't be used, so this route shows no skeleton. ` +
      'Name a function in this file (or one imported from its own file) whose JSX is plain markup: div, span, section, ' +
      'article, main, header, footer, p, h1-h6, ul, ol, li, with only string class and data-* attributes. ' +
      '`export const skeleton = false` turns it off. `kerf docs start` has an example.',
  )
}

async function overrideModule(ctx, s, which, client) {
  if (!client || !which.endsWith('.tsx')) ctx.error('Invalid skeleton override request')
  const key = decodeURIComponent(which.slice('virtual:kerf/shape-override/'.length, -4))
  const file = s.dev ? key : s.abs(key)
  const levels = [...s.manifest.layouts, ...s.manifest.routes]
  if (!levels.some((level) => s.abs(level.file) === file)) ctx.error('Unknown skeleton override')
  const imported = await resolveImportedOverride(ctx, file, s.root ?? dirname(file))
  const code = shapeOverride(file) ?? imported?.code
  if (!code) ctx.error(`Unsafe or missing skeleton override: ${file}`)
  ctx.addWatchFile(file)
  if (imported?.file) ctx.addWatchFile(imported.file)
  return code
}

function configModule(s, which) {
  const name = which.slice('virtual:kerf/'.length)
  const f = ['ts', 'mts', 'js', 'mjs']
    .map((x) => `src/${name}.server.${x}`)
    .find((x) => existsSync(s.abs(x)))
  if (which === V.realtime && busBound(s.root)) return busModule(f && s.abs(f), here)
  return f ? `export { default } from ${JSON.stringify(s.abs(f))}\n` : 'export default undefined\n'
}

async function routesModule(ctx, s, client) {
  if (client && s.shell) return shellRoutes(s, retryRouteModules(ctx, s))
  if (client) return clientScan(ctx, s)
  const p = await s.hydration(ctx)
  return serverRoutes(
    s.manifest,
    s.abs,
    s.dev
      ? await devStyles(s.vite.environments.client, s.manifest, s.abs, s.clientEntry())
      : undefined,
    p,
    s.assetSource,
  )
}

/** A superseded scan's request can still use the current generation's module. */
function clientScan(ctx, s) {
  if (s.shapeEntryClosed) throw new Error('entry style scan outlived its server')
  const run = { owner: s.shapeEntryOwner, scan: (s.shapeScanGeneration ?? 0) + 1 }
  s.shapeScanActive = s.shapeScanGeneration = run.scan
  const result = (async () => {
    try {
      const output = await clientRoutesModule(ctx, s, await s.hydration(ctx), run)
      if (output !== undefined) return output
      if (s.shapeEntryClosed || run.owner !== s.shapeEntryOwner)
        throw new Error('entry style scan outlived its server')
      const latest = s.shapeScanLatest
      return latest.scan > run.scan ? latest.result : clientScan(ctx, s)
    } finally {
      if (s.shapeScanActive === run.scan) delete s.shapeScanActive
    }
  })()
  s.shapeScanLatest = { scan: run.scan, result }
  return result
}

async function scanOverrides(ctx, s, all, root) {
  const overrides = new Map()
  const dependencies = new Map()
  const missing = new Set()
  const depend = (target, file) => {
    if (!dependencies.has(target)) dependencies.set(target, new Set())
    dependencies.get(target).add(file)
  }
  for (const file of all) {
    if (!/\.[jt]sx$/.test(file) || skeletonExport(file) !== 'unavailable') continue
    const found = await resolveImportedOverride(ctx, file, root, (spec) => {
      const candidate = resolve(dirname(file), spec)
      if (projectParent(root, candidate)) {
        const path = candidate.replace(/\\/g, '/')
        missing.add(path)
        depend(path, file)
      }
    })
    took(ctx, { s, root, file, found, depend, overrides })
  }
  return { overrides, dependencies, missing }
}

async function clientRoutesModule(ctx, s, p, run) {
  const entry = s.clientEntry()
  const entryFile = entry.startsWith('virtual:') ? join(here, 'client.tsx') : entry
  const levels = [...s.manifest.layouts, ...s.manifest.routes]
  const all = [...new Set(levels.map((r) => s.abs(r.file)))]
  const root = s.root ?? dirname(entryFile)
  const { overrides, dependencies, missing } = await scanOverrides(ctx, s, all, root)
  const files = all.filter(
    (file) =>
      /\.[jt]sx$/.test(file) &&
      (overrides.has(file) || ['generated', 'custom'].includes(skeletonExport(file))),
  )
  const sources = await Promise.all(files.map((file) => entryCss(ctx, file, root)))
  const shared = await entryCss(ctx, entryFile, root)
  if (s.shapeEntryClosed || run.owner !== s.shapeEntryOwner)
    throw new Error('entry style scan outlived its server')
  if (run.scan !== s.shapeScanGeneration) return
  for (const source of sources) {
    for (const [file, signature] of source.signatures) shared.signatures.set(file, signature)
    for (const file of source.candidates) shared.candidates.add(file)
    for (const file of source.missing) shared.missing.add(file)
  }
  for (const file of missing) {
    shared.candidates.add(file)
    shared.missing.add(file)
  }
  const css = {
    entry: shared.styles,
    levels: new Map(files.map((file, i) => [file, sources[i].styles])),
    overrides,
    dev: s.dev,
    build: s.build || null,
    lazy: s.dev === false,
    retry: retryRouteModules(ctx, s),
  }
  const output = clientRoutes(s.manifest, s.abs, p, css)
  s.shapeEntrySignatures = shared.signatures
  s.shapeEntryCandidates = shared.candidates
  s.shapeEntryMissing = shared.missing
  s.shapeOverrideDependencies = dependencies
  if (s.dev) watchEntryCandidates(s.vite, shared.missing, root)
  return output
}

function retryRouteModules(ctx, s) {
  if (!s.build) return undefined
  if (s.dev)
    return {
      devUrl: (file) =>
        JSON.stringify(
          `${s.vite?.config?.base ?? '/'}@fs/${file.replaceAll('\\', '/').replace(/^\//, '')}`,
        ),
    }
  const build = createHash('sha256').update(s.build).digest('hex').slice(0, 12)
  const ref = ctx.emitFile({
    type: 'asset',
    fileName: `kerf-route-retry-${build}.json`,
    source: '{}',
  })
  return {
    manifest: `import.meta.ROLLUP_FILE_URL_${ref}`,
    register: (targets) => {
      s.retryManifest = { ref, targets }
    },
  }
}
