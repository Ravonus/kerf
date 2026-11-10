import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const NAMES = '\0weft:icons-names'
const ONE = '\0weft:icon/'

function iconLoader() {
  let config, loading
  const load = (ctx, importer) =>
    (loading ??= (async () => {
      const found = await ctx.resolve('@weft-js/warp-icons/compile', importer, { skipSelf: true })
      // an app may reach icons only through warp: the next file, nearer the package, can still find it
      if (!found) {
        loading = undefined
        return null
      }
      const { pass, rewrite, unknownMessage, trimTiers } = await import(
        pathToFileURL(found.id.replace(/\?.*$/, '')).href
      )
      const alias = join(config.root, '.weft', 'tokens', 'icons.alias.json') // icons({ tier }) wrote this: a stop, or the package itself for every tier
      const options = existsSync(alias) ? JSON.parse(readFileSync(alias, 'utf8')) : {}
      const named = options['@weft-js/warp-icons']
      const out = pass({
        root: config.root,
        command: config.command,
        tier: named && (named.split('/')[2] ?? 'all'),
        source: options['@weft-js/warp-icons/source'],
      })
      return { ...out, rewrite, unknownMessage, trimTiers }
    })())
  return {
    load,
    setConfig(c) {
      config = c
      loading = undefined
    },
    get config() {
      return config
    },
    get loading() {
      return loading
    },
  }
}

function fail(ctx, p) {
  const first = p.result?.unknown[0]
  if (first)
    ctx.error({
      message: `${p.unknownMessage(first.name, p.catalog)} (${first.file}:${first.line}:${first.column})`,
      id: first.abs,
      loc: { line: first.line, column: first.column },
    })
}

/**
 * @weft-js/warp-icons' build pass, when the build has the package: only the icons, names and tiers the app uses ship
 * (packages/warp-icons/compile.mjs). Two hooks, because a rewrite has to see the source before weft compiles it and a resolve
 * has to run after weft's own, so a server build's importers keep their mode.
 */
export function icons() {
  const drawings = new Map()
  const state = iconLoader()
  const { load } = state
  return {
    rewrite: {
      name: 'weft:icons-rewrite',
      enforce: 'pre',
      configResolved(c) {
        state.setConfig(c)
        drawings.clear()
      },
      transform: {
        filter: {
          id: /\.[jt]sx?(\?|$)/,
          code: /@weft-js\/(warp-icons|warp)|\/\*#__PURE__\*\/ icon\(|export default pack|export \* from '\.\/all-/,
        },
        async handler(code, id) {
          const path = id.replace(/\?.*$/, '').replaceAll('\\', '/')
          const generated = /(?:^|\/)warp-icons\/src\/gen\/(index|all(?:-[a-z0-9-]+)?)\.tsx$/.exec(
            path,
          )
          // a build reads the pack as a namespace (rewrite), and this default would keep every icon alive
          if (generated?.[1] === 'index')
            return state.config.command === 'build' ? "export * from './all'\n" : null
          if (generated?.[1].startsWith('all')) {
            if (state.config.command !== 'build') return null
            const p = await load(this, id)
            if (!p) return null
            // A module per icon, because a module goes in one chunk: as one file, every icon any page uses is on every page.
            const svg = JSON.stringify(join(dirname(id.replace(/\?.*$/, '')), '../svg.tsx'))
            const trimmed = p.trimTiers(code, p.stops)
            const tiers =
              p.stops.size !== 1
                ? `import ${JSON.stringify(join(dirname(id.replace(/\?.*$/, '')), '../tiers.css'))}\n`
                : ''
            return trimmed
              .replace(
                /^export const (\w+) = (\/\*#__PURE__\*\/ icon\(.*)$/gm,
                (_, name, drawing) => {
                  drawings.set(
                    name,
                    `${tiers}import { icon } from ${svg}\nexport const ${name} = ${drawing}\n`,
                  )
                  return `export * from ${JSON.stringify(ONE + name)}`
                },
              )
              .replace(/^export \{ (.*) \};?$/gm, (_, names) =>
                names
                  .split(', ')
                  .map((n) => `export { ${n} } from ${JSON.stringify(ONE + n.split(' ')[0])}`)
                  .join('\n'),
              )
          }
          if (/node_modules|packages\/(warp-icons|warp)\/src\//.test(id)) return null
          const p = await load(this, await nearIcons(this, id))
          return p ? p.rewrite(code, id.replace(/\?.*$/, ''), p.catalog) : null
        },
      },
    },
    resolve: iconResolve(state, drawings),
  }
}

/**
 * Where an app file can reach @weft-js/warp-icons from. Warp's components put icon imports in the app's own files, and
 * under a strict layout (pnpm) an app that only lists @weft-js/warp can't see warp's dependency: then warp's entry can.
 */
async function nearIcons(ctx, importer) {
  const own = await ctx.resolve('@weft-js/warp-icons/compile', importer, { skipSelf: true })
  if (own) return importer
  const warp = await ctx.resolve('@weft-js/warp', importer, { skipSelf: true })
  return warp?.id ?? importer
}

function iconResolve(state, drawings) {
  const { load } = state
  return {
    name: 'weft:icons',
    enforce: 'pre',
    resolveId: {
      filter: { id: /^(@weft-js\/warp-icons(\/[\w.-]+)?$|\0weft:icon\/)/ },
      async handler(source, importer) {
        if (source.startsWith(ONE)) return source
        if (!importer) return null
        const from = await nearIcons(this, importer)
        if (state.config.command === 'build') {
          const p = await load(this, from)
          if (p) fail(this, p)
          if (p && source === '@weft-js/warp-icons/names') return NAMES
        }
        return from === importer ? null : this.resolve(source, from, { skipSelf: true })
      },
    },
    load: {
      filter: { id: /^\0weft:icon(s-names|\/)/ },
      async handler(id) {
        if (id.startsWith(ONE))
          return { code: drawings.get(id.slice(ONE.length)), moduleSideEffects: false }
        return (await state.loading).module()
      },
    },
  }
}
