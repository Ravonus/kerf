// weft() for Vite 8: one filtered transform hook, so only .tsx/.jsx files cross into JS (§3.6).
import { globSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve as resolvePath } from 'node:path'
import { emitGroups, GroupError, resolve as resolveIntent } from './src/style/css.ts'

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
const EXT = /\.[cm]?[jt]sx?$/
const GROUPS_CSS = 'virtual:weft/groups.css'
const IMPORTS = /import\s+\{([^}]*)\}\s+from\s+['"](\.[^'"]+)['"]/g

/*
 * Style groups (research 23, src/style.ts). The compiler evaluates `group()` definitions and lowers call sites; this
 * plugin keeps the project's definitions and call sites (`facts.groups`, `facts.groupUses`) by file, hands each
 * compile the groups its relative imports bring in (`options.groups`), and serves `virtual:weft/groups.css`, which
 * every module that defines a group imports. A build scans the project first, so the CSS is complete when loaded;
 * dev and tests fill the registry as files compile and reload the CSS when it changes.
 */
function styleGroups() {
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
        if (e instanceof GroupError) ctx.error(`weft/style: ${e.message}`)
        throw e
      }
    }
  }

  const css = () => {
    const all = [...defs].flatMap(([file, gs]) => gs.map(g => ({ ...g, file: relative(root, file) })))
    const used = [...uses].flatMap(([file, us]) => us.map(u => ({ ...u, file: relative(root, file) })))
    return emitGroups(all, used, { dev: isDev })
  }
  let last = ''

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
          const out = transform(code, { filename: file, checkOnly: true, groups: await importedGroups(this, code, file) })
          uses.set(file, out.facts.groupUses)
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
 * `hmr` (default: when serving, outside vitest): client modules register their components with weft/hmr and accept
 * their own updates (research 21). Never for SSR or hydratable output.
 */
export default function weft({ dev, hydratable = false, hmr } = {}) {
  let isDev = false
  let isHot = false
  const style = styleGroups()
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
      async handler(code, id, options) {
        const mode = MODE.exec(id)?.[1]
        const ssr = mode ? mode === 'ssr' : !!options?.ssr
        const hydrating = hydratable || !!mode
        const groups = await style.options(this, code, id.replace(/\?.*$/, ''))
        const out = transform(code, { filename: id.replace(/\?.*$/, ''), dev: isDev, sourceMap: true, generate: ssr ? 'ssr' : 'dom', hydratable: hydrating, hmr: isDev && isHot && !ssr && !hydrating, groups })
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
  }
  return [main, features, style.plugin]
}
