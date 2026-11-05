import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Scope options backed by their own module: an app pays for @weft-js/core/persist, @weft-js/core/history and @weft-js/core/sync only where it uses them.
const FEATURES = [
  [/\bpersist\s*:/, '@weft-js/core/persist'],
  [/\bhistory\s*:\s*\{/, '@weft-js/core/history'],
  [/\bsync\s*:\s*['"]tabs['"]/, '@weft-js/core/sync'],
]

const SRC = join(dirname(dirname(fileURLToPath(import.meta.url))), 'src')

/**
 * A module that mentions `.get`, `.set` or `.linked`, the same with brackets (`box['get']`), or `const { linked } = state`
 * brings in @weft-js/core/keyed, so a page with none doesn't carry them. A word match costs at worst those bytes (`map.get`). A name
 * only known when it runs (`box[name]`) or a renamed `state` can't be seen: that module imports '@weft-js/core/keyed' itself. Past this plugin, `weft` is the core alone. In a
 * dependency it takes naming weft as well, or every package with a Map would count.
 */
export const keyed = {
  name: 'weft:keyed',
  enforce: 'pre',
  // Through the resolver: Vite dates every installed .ts (`?v=`), and a bare path here would load a second runtime in
  // dev beside the one the core's own files import, with its own scopes.
  resolveId: {
    filter: { id: /^@weft-js\/core$/ },
    handler(source, importer, options) {
      return this.resolve(join(SRC, 'index.ts'), importer, { ...options, skipSelf: true })
    },
  },
  transform: {
    filter: {
      id: {
        include: /\.[cm]?[jt]sx?(\?|$)/,
        exclude: /[\\/]packages[\\/]core[\\/]src[\\/]|[\\/]node_modules[\\/]@weft-js[\\/]core[\\/]/,
      },
      code: /\.(?:get|set|linked)\b|\[\s*['"`](?:get|set|linked)['"`]\s*\]|\{[^{}]*\blinked\b[^{}]*\}\s*=\s*state\b/,
    },
    handler(code, id) {
      if (id.includes('node_modules') && !code.includes('weft')) return
      return { code: `import ${JSON.stringify(join(SRC, 'keyed.ts'))};${code}`, map: null }
    },
  },
}

/** Adds `import 'weft/<feature>'` to app modules that use the option (filtered on id and code, §7c). */
export const features = {
  name: 'weft:features',
  transform: {
    filter: {
      id: {
        include: /\.[cm]?[jt]sx?$/,
        exclude: /node_modules|[\\/]packages[\\/]core[\\/]src[\\/]/,
      },
      code: /\b(persist|history|sync)\s*:/,
    },
    handler(code) {
      const add = FEATURES.filter(([re]) => re.test(code)).map(([, mod]) => `import '${mod}';`)
      return add.length ? { code: `${add.join('')}${code}`, map: null } : undefined
    },
  },
}

/**
 * `ui=` and `interaction({ share })` need a module that only a package beyond weft has: warp draws `ui`, and
 * `@weft-js/start` carries `share` past the page. Where the app has that package, it's imported where it's used; where it
 * doesn't, `interaction()` still works, on this page.
 */
const INTERACTION = [
  [/\bui=\{/, '@weft-js/warp/ui'],
  [/\bshare\s*:/, '@weft-js/start/share'],
]
export const interactionFeatures = {
  name: 'weft:interaction',
  enforce: 'pre',
  transform: {
    filter: {
      id: {
        include: /\.[cm]?[jt]sx?$/,
        exclude: /node_modules|[\\/]packages[\\/](core|warp|ui-core|start)[\\/]src[\\/]/,
      },
      code: /\bui=\{|\bshare\s*:/,
    },
    async handler(code, id) {
      if (!/\bui=\{/.test(code) && !code.includes('@weft-js/core/interaction')) return
      const add = []
      for (const [re, mod] of INTERACTION)
        if (re.test(code) && (await this.resolve(mod, id))) add.push(`import '${mod}';`)
      return add.length ? { code: `${add.join('')}${code}`, map: null } : undefined
    },
  },
}

/** `weft({ off })`: the speed paths in src/flags.ts to leave out. `WEFT_OFF` does it for a whole run. */
export const flags = (off) => ({
  name: 'weft:flags',
  enforce: 'pre',
  transform: {
    filter: { id: /[\\/](?:core|@weft-js[\\/]core)[\\/]src[\\/]flags\.ts$/ },
    handler(code) {
      const names = [...(off ?? []), ...(process.env.WEFT_OFF?.split(',').filter(Boolean) ?? [])]
      if (!names.length) return
      const every = names.includes('all')
      return {
        code: code.replace(/const (\w+) = true/g, (line, name) =>
          every || names.includes(name) ? `const ${name} = false` : line,
        ),
        map: null,
      }
    },
  },
})

// Slots @weft-js/core/surface imports dynamically: it has to build in an app that never ran `weft plugins sync` (research 33 §5).
const CORE_SLOTS = new Set(['text.measure', 'surface.renderer', 'pay.rail'])
const UNSYNCED = '\0weft:slot-unsynced/'

/** `weft:slot/<id>` → the generated `<root>/.weft/slots/<id>.ts` (research 13 §2.6; `weft plugins sync` writes it). */
export function slots() {
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
        if (!existsSync(file))
          this.error(
            `P101 ${source}: ${file} does not exist. Run \`weft plugins sync\`, or add a plugin that provides \`${id}\` to weft.config.ts.`,
          )
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
export function tokens() {
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
      if (existsSync(dir))
        for (const f of readdirSync(dir))
          if (f.endsWith('.alias.json'))
            Object.assign(aliases, JSON.parse(readFileSync(join(dir, f), 'utf8')))
    },
    resolveId: {
      handler(source, importer) {
        if (Object.hasOwn(aliases, source))
          return this.resolve(aliases[source], importer, { skipSelf: true })
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
