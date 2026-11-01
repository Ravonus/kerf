// weft() for Vite 8: one filtered transform hook, so only .tsx/.jsx files cross into JS (§3.6).
import { createHash } from 'node:crypto'
import { existsSync, globSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { basename, dirname, join, relative, resolve as resolvePath } from 'node:path'
import { emitGroups, GroupError, resolve as resolveIntent } from './node/css.mjs'
import { purge, words } from './node/purge.mjs'
import { assets } from './assets.mjs'
import { buildMatrix } from './node/matrix.mjs'

const { transform } = createRequire(import.meta.url)('./compiler.cjs')

// Scope options backed by their own module: an app pays for weft/persist, weft/history and weft/sync only where it uses them.
const FEATURES = [
  [/\bpersist\s*:/, 'weft/persist'],
  [/\bhistory\s*:\s*\{/, 'weft/history'],
  [/\bsync\s*:\s*['"]tabs['"]/, 'weft/sync'],
]

const SRC = join(dirname(fileURLToPath(import.meta.url)), 'src')

/**
 * A module that mentions `.get`, `.set` or `.linked`, or the same with brackets (`box['get']`), brings in weft/keyed, so a
 * page with none doesn't carry them. A word match costs at worst those bytes (`map.get`). A name only known when it runs
 * (`box[name]`) can't be seen: that module imports 'weft/keyed' itself. Past this plugin, `weft` is the core alone. In a
 * dependency it takes naming weft as well, or every package with a Map would count.
 */
const keyed = {
  name: 'weft:keyed',
  enforce: 'pre',
  resolveId: { filter: { id: /^weft$/ }, handler: () => join(SRC, 'index.ts') },
  transform: {
    filter: { id: { include: /\.[cm]?[jt]sx?(\?|$)/, exclude: /[\\/]packages[\\/]weft[\\/]src[\\/]|[\\/]node_modules[\\/]weft[\\/]/ }, code: /\.(?:get|set|linked)\b|\[\s*['"`](?:get|set|linked)['"`]\s*\]/ },
    handler(code, id) {
      if (id.includes('node_modules') && !code.includes('weft')) return
      return { code: `import ${JSON.stringify(join(SRC, 'keyed.ts'))};${code}`, map: null }
    },
  },
}

/** Adds `import 'weft/<feature>'` to app modules that use the option (filtered on id and code, §7c). */
const features = {
  name: 'weft:features',
  transform: {
    filter: { id: { include: /\.[cm]?[jt]sx?$/, exclude: /node_modules|[\\/]packages[\\/]weft[\\/]src[\\/]/ }, code: /\b(persist|history|sync)\s*:/ },
    handler(code) {
      const add = FEATURES.filter(([re]) => re.test(code)).map(([, mod]) => `import '${mod}';`)
      return add.length ? { code: `${add.join('')}${code}`, map: null } : undefined
    },
  },
}

/**
 * `ui=` and `interaction({ share })` need a module that only a package beyond weft has: warp draws `ui`, and
 * `@weft/start` carries `share` past the page. Where the app has that package, it's imported where it's used; where it
 * doesn't, `interaction()` still works, on this page.
 */
const INTERACTION = [
  [/\bui=\{/, '@weft/warp/ui'],
  [/\bshare\s*:/, '@weft/start/share'],
]
const interactionFeatures = {
  name: 'weft:interaction',
  enforce: 'pre',
  transform: {
    filter: { id: { include: /\.[cm]?[jt]sx?$/, exclude: /node_modules|[\\/]packages[\\/](weft|warp|ui-core|start)[\\/]src[\\/]/ }, code: /\bui=\{|\bshare\s*:/ },
    async handler(code, id) {
      if (!/\bui=\{/.test(code) && !code.includes('weft/interaction')) return
      const add = []
      for (const [re, mod] of INTERACTION) if (re.test(code) && (await this.resolve(mod, id))) add.push(`import '${mod}';`)
      return add.length ? { code: `${add.join('')}${code}`, map: null } : undefined
    },
  },
}

/** `weft({ off })`: the speed paths in src/flags.ts to leave out. `WEFT_OFF` does it for a whole run. */
const flags = off => ({
  name: 'weft:flags',
  enforce: 'pre',
  transform: {
    filter: { id: /[\\/]weft[\\/]src[\\/]flags\.ts$/ },
    handler(code) {
      const names = [...(off ?? []), ...(process.env.WEFT_OFF?.split(',').filter(Boolean) ?? [])]
      if (!names.length) return
      const every = names.includes('all')
      return { code: code.replace(/const (\w+) = true/g, (line, name) => (every || names.includes(name) ? `const ${name} = false` : line)), map: null }
    },
  },
})

// Slots weft/surface imports dynamically: it has to build in an app that never ran `weft plugins sync` (research 33 §5).
const CORE_SLOTS = new Set(['text.measure', 'surface.renderer', 'pay.rail'])
const UNSYNCED = '\0weft:slot-unsynced/'

/** `weft:slot/<id>` → the generated `<root>/.weft/slots/<id>.ts` (research 13 §2.6; `weft plugins sync` writes it). */
function slots() {
  let root = process.cwd()
  return {
    name: 'weft:slots',
    configResolved(config) {
      root = config.root
    },
    resolveId: {
      filter: { id: /^weft:slot\// },
      handler(source) {
        const id = source.slice('weft:slot/'.length)
        const file = join(root, '.weft', 'slots', `${id}.ts`)
        if (!existsSync(file) && CORE_SLOTS.has(id)) return `${UNSYNCED}${id}`
        if (!existsSync(file)) this.error(`P101 ${source}: ${file} does not exist. Run \`weft plugins sync\`, or add a plugin that provides \`${id}\` to weft.config.ts.`)
        return file
      },
    },
    load: {
      filter: { id: /^\0weft:slot-unsynced\// },
      handler(id) {
        const slot = id.slice(UNSYNCED.length)
        const why = `P101 ${slot}: nothing provides this slot. Add a plugin that provides it to \`plugins\` in weft.config.ts, then run \`weft plugins sync\`.`
        return `export const provider = null\nexport const load = () => { throw Object.assign(new Error(${JSON.stringify(why)}), { code: 'P101' }) }\n`
      },
    },
  }
}

/**
 * `weft:tokens/<namespace>` → the generated `<root>/.weft/tokens/<namespace>.css` (a plugin's `tokens.css`), or an
 * empty module when the plugin left the defaults. A kit imports it once, so a seed in weft.config.ts needs no app wiring.
 * A plugin's `tokens.alias` (`.weft/tokens/*.alias.json`) swaps one module id for another, so a config can compile one
 * variant of a package in.
 */
function tokens() {
  let root = process.cwd()
  let aliases = {}
  const EMPTY = '\0weft:tokens-empty'
  return {
    name: 'weft:tokens',
    enforce: 'pre',
    configResolved(config) {
      root = config.root
      const dir = join(root, '.weft', 'tokens')
      aliases = {}
      if (existsSync(dir)) for (const f of readdirSync(dir)) if (f.endsWith('.alias.json')) Object.assign(aliases, JSON.parse(readFileSync(join(dir, f), 'utf8')))
    },
    resolveId: {
      handler(source, importer) {
        if (Object.hasOwn(aliases, source)) return this.resolve(aliases[source], importer, { skipSelf: true })
        if (!source.startsWith('weft:tokens/')) return null
        const file = join(root, '.weft', 'tokens', `${source.slice('weft:tokens/'.length)}.css`)
        return existsSync(file) ? file : EMPTY
      },
    },
    load: {
      filter: { id: /^\0weft:tokens-empty$/ },
      handler: () => '',
    },
  }
}

const MODE = /\?weft-(ssr|hydrate)$/
const EXT = /\.[cm]?[jt]sx?$/
const GROUPS_CSS = 'virtual:weft/groups.css'
const SHAPE_IMPORTS = /import\s+(?:([\w$]+)\s*,?\s*)?(?:\{([^}]*)\}\s*)?from\s+['"](\.[^'"]+)['"]/g

/** Exports with a shape variant by file (`facts.shapes`, research 31 §5), read when a file imports one. */
const shapeExports = new Map()
function exportsOf(file) {
  const mtime = statSync(file, { throwIfNoEntry: false })?.mtimeMs
  if (mtime === undefined) return []
  const seen = shapeExports.get(file)
  if (seen?.mtime === mtime) return seen.exports
  const exports = transform(readFileSync(file, 'utf8'), { filename: file, checkOnly: true }).facts.shapes
  shapeExports.set(file, { mtime, exports })
  return exports
}

/** `options.shapes` for one file: which of the components it imports by relative path have a variant. */
async function importedShapes(ctx, code, id) {
  const out = {}
  for (const [, def, names, spec] of code.matchAll(SHAPE_IMPORTS)) {
    const file = (await ctx.resolve(spec, id, { skipSelf: true }))?.id?.replace(/\?.*$/, '')
    if (!file || !/\.[jt]sx$/.test(file)) continue
    const found = exportsOf(file)
    const key = resolvePath(dirname(id), spec).replace(EXT, '')
    for (const n of [...(def ? ['default'] : []), ...(names ?? '').split(',').map(n => n.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0])])
      if (found.includes(n)) out[`${key}#${n}`] = true
  }
  return out
}
const IMPORTS = /import\s+\{([^}]*)\}\s+from\s+['"](\.[^'"]+)['"]/g

/*
 * Style groups (research 23, src/style.ts). The compiler evaluates `group()` definitions and lowers call sites; this
 * plugin keeps the project's definitions and call sites (`facts.groups`, `facts.groupUses`) by file, hands each
 * compile the groups its relative imports bring in (`options.groups`), and serves `virtual:weft/groups.css`, which
 * every module that defines a group imports. A build scans the project first, so the CSS is complete when loaded;
 * dev and tests fill the registry as files compile and reload the CSS when it changes.
 *
 * It also writes the matrix, `.weft/styles.json` (src/style/matrix.ts, research 23 §2.4): after the build's scan, and
 * in dev whenever a compile changes it. `matrix: false` turns that off (it's off under vitest by default).
 */
function styleGroups({ taggedParts = false, matrix = !process.env.VITEST } = {}) {
  const defs = new Map() // file → [{ name, binding, exported, def, line }]
  const uses = new Map() // file → [GroupUse]
  const scanned = new Map() // file → mtime of the defs above, for files read off disk
  let root = process.cwd()
  let isDev = false
  let server

  const defsOf = file => {
    const mtime = statSync(file, { throwIfNoEntry: false })?.mtimeMs
    if (mtime === undefined) return []
    if (scanned.get(file) !== mtime || !defs.has(file)) {
      const code = readFileSync(file, 'utf8')
      const found = code.includes('weft/style') ? transform(code, { filename: file, checkOnly: true }).facts.groups : []
      defs.set(file, found)
      scanned.set(file, mtime)
    }
    return defs.get(file)
  }

  /** `options.groups` for one file: the exported groups of the modules it imports by relative path. */
  async function importedGroups(ctx, code, id) {
    const out = {}
    for (const [, names, spec] of code.matchAll(IMPORTS)) {
      const hit = ctx ? await ctx.resolve(spec, id, { skipSelf: true }) : { id: resolvePath(dirname(id), spec) }
      const file = hit?.id?.replace(/\?.*$/, '')
      if (!file || !EXT.test(file)) continue
      const found = defsOf(file).filter(g => g.exported)
      if (!found.length) continue
      const key = resolvePath(dirname(id), spec).replace(EXT, '')
      for (const n of names.split(',')) {
        const imported = n.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]
        const g = found.find(g => g.binding === imported)
        if (g) out[`${key}#${imported}`] = { name: g.name, def: g.def }
      }
    }
    return out
  }

  /** Check every value of the file's groups against the token table, and group names against the project. */
  function validate(ctx, file, groups) {
    for (const g of groups) {
      const where = `${relative(root, file)}:${g.line}`
      for (const [other, gs] of defs) if (other !== file && gs.some(x => x.name === g.name)) ctx.error(`weft/style: group ${g.name} (${where}) is also defined in ${relative(root, other)}`)
      const { base, axes = {}, parts = {}, states = {}, compounds = [] } = g.def
      try {
        resolveIntent(base ?? {}, `group ${g.name} (${where}) base`)
        for (const [axis, vals] of Object.entries(axes)) if (vals !== 'inherit') for (const [v, i] of Object.entries(vals)) resolveIntent(i, `group ${g.name} (${where}) ${axis}=${v}`)
        for (const [k, i] of Object.entries({ ...parts, ...states })) resolveIntent(i, `group ${g.name} (${where}) ${k}`)
        for (const [n, c] of compounds.entries()) resolveIntent(c.set, `group ${g.name} (${where}) compound ${n}`)
      } catch (e) {
        if (e instanceof GroupError) ctx.error(`D025 weft/style: ${e.message}`)
        throw e
      }
    }
  }

  const css = () => {
    const { all, used } = sources()
    return emitGroups(all, used, { dev: isDev, taggedParts })
  }
  let last = ''

  /** The matrix of everything compiled so far; written only when it changed. Returns it. */
  let written = ''
  let timer
  const sources = () => ({
    all: [...defs].flatMap(([file, gs]) => gs.map(g => ({ ...g, file: relative(root, file).split('\\').join('/') }))),
    used: [...uses].flatMap(([file, us]) => us.map(u => ({ ...u, file: relative(root, file).split('\\').join('/') }))),
  })
  const writeMatrix = () => {
    const { all, used } = sources()
    const m = buildMatrix(all, used)
    const text = `${JSON.stringify(m, null, 2)}\n`
    if (matrix && text !== written && (all.length || existsSync(join(root, '.weft', 'styles.json')))) {
      try {
        mkdirSync(join(root, '.weft'), { recursive: true })
        writeFileSync(join(root, '.weft', 'styles.json'), text)
        written = text
      } catch {}
    }
    return m
  }

  return {
    /** Before compiling: the groups option. After: record the facts; a module that defines groups imports the CSS. */
    async options(ctx, code, id) {
      return code.includes('{...') ? await importedGroups(ctx, code, id) : {}
    },
    record(ctx, id, facts, out, ssr) {
      const file = id.replace(/\?.*$/, '')
      if (facts.groups?.length) {
        validate(ctx, file, facts.groups)
        defs.set(file, facts.groups)
        scanned.delete(file)
      } else if (defs.get(file)?.length) defs.set(file, [])
      uses.set(file, facts.groupUses ?? [])
      if (server && matrix) {
        clearTimeout(timer)
        timer = setTimeout(writeMatrix, 100)
      }
      if (server) {
        const next = css()
        if (next !== last) {
          last = next
          const mod = server.moduleGraph.getModuleById('\0' + GROUPS_CSS)
          if (mod) server.reloadModule(mod)
        }
      }
      return facts.groups?.length && !ssr ? `${out}\nimport '${GROUPS_CSS}';` : out
    },
    plugin: {
      name: 'weft:style',
      configResolved(config) {
        root = config.root
        isDev = config.command === 'serve'
      },
      configureServer(s) {
        server = s
      },
      async buildStart() {
        if (isDev || process.env.VITEST) return
        // A build sees the whole project before any CSS loads: every source file's definitions and call sites.
        const files = globSync('**/*.{ts,tsx,jsx}', { cwd: root, exclude: f => f === 'node_modules' || f === 'dist' }).map(f => join(root, f))
        for (const file of files) defsOf(file)
        for (const file of files.filter(f => /\.[jt]sx$/.test(f))) {
          const code = readFileSync(file, 'utf8')
          if (!code.includes('{...')) continue
          const out = transform(code, { filename: file, checkOnly: true, taggedParts, groups: await importedGroups(this, code, file) })
          uses.set(file, out.facts.groupUses)
        }
        if (!matrix) return
        // The project-wide style codes (research 23 §3): errors stop the build, the rest are warnings.
        for (const d of writeMatrix().diagnostics) {
          const text = `${d.code} weft/style: ${d.message}\n  help: ${d.help}`
          const loc = { file: join(root, d.file), line: d.line, column: 0 }
          if (d.severity === 'error') this.error({ message: text, loc })
          else this.warn({ message: text, loc })
        }
      },
      resolveId(source) {
        return source === GROUPS_CSS ? '\0' + GROUPS_CSS : null
      },
      load(id) {
        if (id === '\0' + GROUPS_CSS) return (last = css())
      },
    },
  }
}

/**
 * `hydratable`: DOM output that adopts server HTML (`hydrate`), and SSR output with hydration keys. Vite's SSR
 * transforms get SSR output (imports from weft/ssr). `import { App } from './App.tsx?weft-ssr'` (or `?weft-hydrate`)
 * loads a component graph compiled that way into any process (round-trip tests); the query follows .tsx/.jsx imports.
 */
/*
 * `style.taggedParts`: group parts carry `data-g` as well as `data-part`; `style.matrix: false`: no `.weft/styles.json`
 * (style groups, below).
 */
/**
 * @weft/icons' build pass, when the build has the package: only the icons, names and tiers the app uses ship
 * (packages/icons/compile.mjs). Two hooks, because a rewrite has to see the source before weft compiles it and a resolve
 * has to run after weft's own, so a server build's importers keep their mode.
 */
function icons() {
  const NAMES = '\0weft:icons-names'
  const ONE = '\0weft:icon/'
  const drawings = new Map()
  let config, loading
  const load = (ctx, importer) => (loading ??= (async () => {
    const found = await ctx.resolve('@weft/icons/compile', importer, { skipSelf: true })
    // an app may reach icons only through warp: the next file, nearer the package, can still find it
    if (!found) { loading = undefined; return null }
    const { pass, rewrite, unknownMessage, trimTiers } = await import(pathToFileURL(found.id.replace(/\?.*$/, '')).href)
    const alias = join(config.root, '.weft', 'tokens', 'icons.alias.json') // icons({ tier }) wrote this: a stop, or the package itself for every tier
    const options = existsSync(alias) ? JSON.parse(readFileSync(alias, 'utf8')) : {}
    const named = options['@weft/icons']
    const out = pass({ root: config.root, command: config.command, tier: named && (named.split('/')[2] ?? 'all'), source: options['@weft/icons/source'] })
    return { ...out, rewrite, unknownMessage, trimTiers }
  })())
  const fail = (ctx, p) => {
    const first = p.result?.unknown[0]
    if (first) ctx.error({ message: `${p.unknownMessage(first.name, p.catalog)} (${first.file}:${first.line}:${first.column})`, id: first.abs, loc: { line: first.line, column: first.column } })
  }
  return {
    rewrite: {
      name: 'weft:icons-rewrite',
      enforce: 'pre',
      configResolved(c) { config = c },
      transform: {
        filter: { id: /\.[jt]sx?(\?|$)/, code: /@weft\/(icons|warp)|\/\*#__PURE__\*\/ icon\(|export default pack/ },
        async handler(code, id) {
          // a build reads the pack as a namespace (rewrite), and this default would keep every icon alive
          if (/icons\/src\/gen\/index\.tsx/.test(id)) return config.command === 'build' ? "export * from './all'\n" : null
          if (/icons\/src\/gen\/all\.tsx/.test(id)) {
            if (config.command !== 'build') return null
            const p = await load(this, id)
            if (!p) return null
            // A module per icon, because a module goes in one chunk: as one file, every icon any page uses is on every page.
            const svg = JSON.stringify(join(dirname(id.replace(/\?.*$/, '')), '../svg.tsx'))
            const trimmed = p.trimTiers(code, p.stops)
            const tiers = trimmed.includes("'../tiers.css'") ? `import ${JSON.stringify(join(dirname(id.replace(/\?.*$/, '')), '../tiers.css'))}\n` : ''
            return trimmed.replace(/^export const (\w+) = (\/\*#__PURE__\*\/ icon\(.*)$/gm, (_, name, drawing) => {
              drawings.set(name, `${tiers}import { icon } from ${svg}\nexport const ${name} = ${drawing}\n`)
              return `export * from ${JSON.stringify(ONE + name)}`
            }).replace(/^export \{ (.*) \};?$/gm, (_, names) => names.split(', ').map(n => `export { ${n} } from ${JSON.stringify(ONE + n.split(' ')[0])}`).join('\n'))
          }
          if (id.includes('node_modules') || /packages\/(icons|warp)\/src\//.test(id)) return null
          const p = await load(this, id)
          return p ? p.rewrite(code, id.replace(/\?.*$/, ''), p.catalog) : null
        },
      },
    },
    resolve: {
      name: 'weft:icons',
      enforce: 'pre',
      resolveId: {
        filter: { id: /^(@weft\/icons(\/names|\/quiet|\/balanced|\/vivid)?$|\0weft:icon\/)/ },
        async handler(source, importer) {
          if (source.startsWith(ONE)) return source
          if (config.command !== 'build' || !importer) return null
          const p = await load(this, importer)
          if (!p) return null
          fail(this, p)
          return source === '@weft/icons/names' ? NAMES : null
        },
      },
      load: {
        filter: { id: /^\0weft:icon(s-names|\/)/ },
        async handler(id) {
          if (id.startsWith(ONE)) return { code: drawings.get(id.slice(ONE.length)), moduleSideEffects: false }
          return (await loading).module()
        },
      },
    },
  }
}

/*
 * `hmr` (default: when serving, outside vitest): client modules register their components with weft/hmr and accept
 * their own updates (research 21). Never for SSR output.
 */
export default function weft({ dev, hydratable = false, hmr, style: styleOptions, purge: purgeOptions, off } = {}) {
  let isDev = false
  let isHot = false
  const style = styleGroups(styleOptions)
  const main = {
    name: 'weft',
    enforce: 'pre',
    config(user, env) {
      isDev = dev ?? env.command === 'serve'
      isHot = hmr ?? (env.command === 'serve' && !process.env.VITEST)
      return {
        oxc: { jsx: 'preserve' },
        optimizeDeps: { rolldownOptions: { transform: { jsx: 'preserve' } } },
        resolve: { tsconfigPaths: user.resolve?.tsconfigPaths ?? true }, // an app's aliases live in its tsconfig
      }
    },
    async resolveId(source, importer) {
      const mode = importer && MODE.exec(importer)
      if (!mode || !(source.startsWith('.') || source.startsWith('@weft/'))) return null // first-party packages ship TSX
      const r = await this.resolve(source, importer.slice(0, mode.index), { skipSelf: true })
      return r && /\.[jt]sx$/.test(r.id) ? r.id + mode[0] : r
    },
    transform: {
      filter: { id: /\.[jt]sx(\?weft-(ssr|hydrate))?$/ },
      async handler(code, id, options) {
        const mode = MODE.exec(id)?.[1]
        const ssr = mode ? mode === 'ssr' : !!options?.ssr
        const hydrating = hydratable || !!mode
        const groups = await style.options(this, code, id.replace(/\?.*$/, ''))
        const shapes = await importedShapes(this, code, id.replace(/\?.*$/, ''))
        const islands = hydrating && !mode ? await main.api.islands?.(this, id) : undefined
        const out = transform(code, { filename: id.replace(/\?.*$/, ''), islands, dev: isDev, sourceMap: true, generate: ssr ? 'ssr' : 'dom', hydratable: hydrating, hmr: isDev && isHot && !ssr, groups, shapes, taggedParts: !!styleOptions?.taggedParts })
        for (const d of out.diagnostics) {
          const text = `${d.code} ${d.message}\n  help: ${d.help}`
          const loc = { file: id, line: d.line, column: d.column - 1 }
          if (d.severity === 'error') this.error({ message: text, loc })
          else this.warn({ message: text, loc })
        }
        if (!out.code) return null
        return { code: style.record(this, id, out.facts, out.code, ssr), map: out.map }
      },
    },
    /**
     * The watcher takes one change per file per 50ms and drops the rest with no later event, so a save right after
     * another is never seen and the page stays on the file before it. A fix right after a syntax error was stuck that
     * way. Look again once the window has passed.
     */
    configureServer(server) {
      const stamp = file => { try { return statSync(file).mtimeMs } catch { return undefined } }
      server.watcher.on('change', file => {
        const at = stamp(file)
        setTimeout(() => stamp(file) !== at && server.watcher.emit('change', file), 75).unref?.()
      })
    },
    /** `islands(ctx, id)`: a framework's project view of the file (node/hydration.mjs). */
    api: {},
  }
  const icon = icons()
  return [icon.rewrite, flags(off), keyed, interactionFeatures, main, features, style.plugin, agent(), slots(), tokens(), icon.resolve, assets(), ...(purgeOptions === false ? [] : [purgeCss(purgeOptions?.keep)])]
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

/**
 * Removes CSS no built file can reach (node/purge.mjs). Runs last on the client build, and renames each stylesheet it
 * changes: a name hashed before purging would stay the same when the app starts using a new component, and browsers
 * would keep the old, smaller file. `weft({ purge: false })` turns it off; `purge: { keep: ['knob'] }` keeps names the
 * app builds at run time.
 */
function purgeCss(keep = []) {
  const sources = []
  return {
    name: 'weft:purge',
    /** `add(text)`: source that renders on the server only, whose class names the client's files don't hold. */
    api: { add: text => sources.push(text) },
    apply: 'build',
    enforce: 'post',
    generateBundle: {
      order: 'post',
      handler(_, bundle) {
        if (this.environment && this.environment.name !== 'client') return
        const files = Object.values(bundle)
        const text = f => (f.type === 'chunk' ? f.code : typeof f.source === 'string' ? f.source : Buffer.from(f.source).toString())
        const sheets = files.filter(f => f.type === 'asset' && f.fileName.endsWith('.css'))
        if (!sheets.length) return
        const found = words([...files.filter(f => /\.(js|mjs|html)$/.test(f.fileName)).map(text), ...sources], keep)
        const moved = []
        const purged = purge(sheets.map(text), found)
        for (const [i, sheet] of sheets.entries()) {
          const css = purged[i]
          const hash = createHash('sha256').update(css).digest('base64url').slice(0, 8)
          const name = sheet.fileName.replace(/(-[\w-]{8})?\.css$/, `-${hash}.css`)
          moved.push([sheet.fileName, name])
          delete bundle[sheet.fileName]
          this.emitFile({ type: 'asset', fileName: name, source: css })
        }
        for (const f of Object.values(bundle)) {
          for (const [from, to] of moved) {
            if (f.type === 'chunk') {
              f.code = f.code.replaceAll(basename(from), basename(to)) // by file name: with `base: './'` a chunk's preload list says ./index-….css
              if (f.viteMetadata?.importedCss.delete(from)) f.viteMetadata.importedCss.add(to)
            } else if (/\.(html|json)$/.test(f.fileName)) f.source = text(f).replaceAll(from, to)
          }
        }
      },
    },
  }
}
