// Keep style group facts for compilation, CSS and the optional project matrix.
import { globSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { transform } from './compiler.mjs'
import { css, defsOf, importedGroups, validate, writeMatrix } from './style-registry.mjs'

const GROUPS_CSS = 'virtual:weft/groups.css'

/** The Vite hooks for group CSS and the build's project scan. */
function stylePlugin(s) {
  return {
    name: 'weft:style',
    configResolved(config) {
      s.root = config.root
      s.isDev = config.command === 'serve'
    },
    configureServer(server) {
      s.server = server
    },
    async buildStart() {
      if (s.isDev || process.env.VITEST) return
      // A build sees the whole project before any CSS loads: every source file's definitions and call sites.
      const files = globSync('**/*.{ts,tsx,jsx}', {
        cwd: s.root,
        exclude: (f) => f === 'node_modules' || f === 'dist',
      }).map((f) => join(s.root, f))
      for (const file of files) defsOf(s, file)
      for (const file of files.filter((f) => /\.[jt]sx$/.test(f))) {
        const code = readFileSync(file, 'utf8')
        if (!code.includes('{...')) continue
        const out = transform(code, {
          filename: file,
          checkOnly: true,
          taggedParts: s.taggedParts,
          groups: await importedGroups(s, this, code, file),
        })
        s.uses.set(file, out.facts.groupUses)
      }
      if (!s.matrix) return
      // The project-wide style codes (research 23 §3): errors stop the build, the rest are warnings.
      for (const d of writeMatrix(s).diagnostics) {
        const text = `${d.code} @weft-js/core/style: ${d.message}\n  help: ${d.help}`
        const loc = { file: join(s.root, d.file), line: d.line, column: 0 }
        if (d.severity === 'error') this.error({ message: text, loc })
        else this.warn({ message: text, loc })
      }
    },
    resolveId(source) {
      return source === GROUPS_CSS ? '\0' + GROUPS_CSS : null
    },
    load(id) {
      if (id === '\0' + GROUPS_CSS) return (s.last = css(s))
    },
  }
}

/** Keep the facts and hooks for a single weft plugin instance. */
export function styleGroups({ taggedParts = false, matrix = !process.env.VITEST } = {}) {
  const s = {
    taggedParts,
    matrix,
    defs: new Map(),
    uses: new Map(),
    scanned: new Map(),
    root: process.cwd(),
    isDev: false,
    server: undefined,
    last: '',
    written: '',
    timer: undefined,
  }
  return {
    /** Before compiling: the groups option. After: record the facts; a module that defines groups imports the CSS. */
    async options(ctx, code, id) {
      return code.includes('{...') ? await importedGroups(s, ctx, code, id) : {}
    },
    record(ctx, id, facts, out, ssr) {
      const file = id.replace(/\?.*$/, '')
      if (facts.groups?.length) {
        validate(s, ctx, file, facts.groups)
        s.defs.set(file, facts.groups)
        s.scanned.delete(file)
      } else if (s.defs.get(file)?.length) s.defs.set(file, [])
      s.uses.set(file, facts.groupUses ?? [])
      if (s.server && s.matrix) {
        clearTimeout(s.timer)
        s.timer = setTimeout(() => writeMatrix(s), 100)
      }
      if (s.server) {
        const next = css(s)
        if (next !== s.last) {
          s.last = next
          const mod = s.server.moduleGraph.getModuleById('\0' + GROUPS_CSS)
          if (mod) s.server.reloadModule(mod)
        }
      }
      return facts.groups?.length && !ssr ? `${out}\nimport '${GROUPS_CSS}';` : out
    },
    plugin: stylePlugin(s),
  }
}
