import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Scope options backed by their own module: an app pays for @kerf/core/persist, @kerf/core/history and @kerf/core/sync only where it uses them.
const FEATURES = [
  [/\bpersist\s*:/, '@kerf/core/persist'],
  [/\bhistory\s*:\s*\{/, '@kerf/core/history'],
  [/\bsync\s*:\s*['"]tabs['"]/, '@kerf/core/sync'],
]

const SRC = join(dirname(dirname(fileURLToPath(import.meta.url))), 'src')

/**
 * A module that mentions `.get`, `.set` or `.linked`, the same with brackets (`box['get']`), or `const { linked } = state`
 * brings in @kerf/core/keyed, so a page with none doesn't carry them. A word match costs at worst those bytes (`map.get`). A name
 * only known when it runs (`box[name]`) or a renamed `state` can't be seen: that module imports '@kerf/core/keyed' itself. Past this plugin, `kerf` is the core alone. In a
 * dependency it takes naming kerf as well, or every package with a Map would count.
 */
export const keyed = {
  name: 'kerf:keyed',
  enforce: 'pre',
  // Through the resolver: Vite dates every installed .ts (`?v=`), and a bare path here would load a second runtime in
  // dev beside the one the core's own files import, with its own scopes.
  resolveId: {
    filter: { id: /^@kerf\/core$/ },
    handler(source, importer, options) {
      return this.resolve(join(SRC, 'index.ts'), importer, { ...options, skipSelf: true })
    },
  },
  transform: {
    filter: {
      id: {
        include: /\.[cm]?[jt]sx?(\?|$)/,
        exclude: /[\\/]packages[\\/]core[\\/]src[\\/]|[\\/]node_modules[\\/]@kerf[\\/]core[\\/]/,
      },
      code: /\.(?:get|set|linked)\b|\[\s*['"`](?:get|set|linked)['"`]\s*\]|\{[^{}]*\blinked\b[^{}]*\}\s*=\s*state\b/,
    },
    handler(code, id) {
      if (id.includes('node_modules') && !code.includes('kerf')) return
      return { code: `import ${JSON.stringify(join(SRC, 'keyed.ts'))};${code}`, map: null }
    },
  },
}

/** Adds `import 'kerf/<feature>'` to app modules that use the option (filtered on id and code, §7c). */
export const features = {
  name: 'kerf:features',
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
 * `ui=` and `interaction({ share })` need a module that only a package beyond kerf has: veneer draws `ui`, and
 * `@kerf/start` carries `share` past the page. Where the app has that package, it's imported where it's used; where it
 * doesn't, `interaction()` still works, on this page.
 */
const INTERACTION = [
  [/\bui=\{/, '@kerf/veneer/ui'],
  [/\bshare\s*:/, '@kerf/start/share'],
]
export const interactionFeatures = {
  name: 'kerf:interaction',
  enforce: 'pre',
  transform: {
    filter: {
      id: {
        include: /\.[cm]?[jt]sx?$/,
        exclude: /node_modules|[\\/]packages[\\/](core|veneer|ui-core|start)[\\/]src[\\/]/,
      },
      code: /\bui=\{|\bshare\s*:/,
    },
    async handler(code, id) {
      if (!/\bui=\{/.test(code) && !code.includes('@kerf/core/interaction')) return
      const add = []
      for (const [re, mod] of INTERACTION)
        if (re.test(code) && (await this.resolve(mod, id))) add.push(`import '${mod}';`)
      return add.length ? { code: `${add.join('')}${code}`, map: null } : undefined
    },
  },
}

/** `kerf({ off })`: the speed paths in src/flags.ts to leave out. `KERF_OFF` does it for a whole run. */
export const flags = (off) => ({
  name: 'kerf:flags',
  enforce: 'pre',
  transform: {
    filter: { id: /[\\/](?:core|@kerf[\\/]core)[\\/]src[\\/]flags\.ts$/ },
    handler(code) {
      const names = [...(off ?? []), ...(process.env.KERF_OFF?.split(',').filter(Boolean) ?? [])]
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

// Slots @kerf/core/surface imports dynamically: it has to build in an app that never ran `kerf plugins sync` (research 33 §5).
const CORE_SLOTS = new Set(['text.measure', 'surface.renderer', 'pay.rail'])
const UNSYNCED = '\0kerf:slot-unsynced/'

/** `kerf:slot/<id>` → the generated `<root>/.kerf/slots/<id>.ts` (research 13 §2.6; `kerf plugins sync` writes it). */
export function slots() {
  let root = process.cwd()
  return {
    name: 'kerf:slots',
    configResolved(config) {
      root = config.root
    },
    resolveId: {
      filter: { id: /^kerf:slot\// },
      handler(source) {
        const id = source.slice('kerf:slot/'.length)
        const file = join(root, '.kerf', 'slots', `${id}.ts`)
        if (!existsSync(file) && CORE_SLOTS.has(id)) return `${UNSYNCED}${id}`
        if (!existsSync(file))
          this.error(
            `P101 ${source}: ${file} does not exist. Run \`kerf plugins sync\`, or add a plugin that provides \`${id}\` to kerf.config.ts.`,
          )
        return file
      },
    },
    load: {
      filter: { id: /^\0kerf:slot-unsynced\// },
      handler(id) {
        const slot = id.slice(UNSYNCED.length)
        const why = `P101 ${slot}: nothing provides this slot. Add a plugin that provides it to \`plugins\` in kerf.config.ts, then run \`kerf plugins sync\`.`
        return `export const provider = null\nexport const load = () => { throw Object.assign(new Error(${JSON.stringify(why)}), { code: 'P101' }) }\n`
      },
    },
  }
}

/**
 * `kerf:tokens/<namespace>` → the generated `<root>/.kerf/tokens/<namespace>.css` (a plugin's `tokens.css`), or an
 * empty module when the plugin left the defaults. A kit imports it once, so a seed in kerf.config.ts needs no app wiring.
 * A plugin's `tokens.alias` (`.kerf/tokens/*.alias.json`) swaps one module id for another, so a config can compile one
 * variant of a package in.
 */
export function tokens() {
  let root = process.cwd()
  let aliases = {}
  const EMPTY = '\0kerf:tokens-empty'
  return {
    name: 'kerf:tokens',
    enforce: 'pre',
    configResolved(config) {
      root = config.root
      const dir = join(root, '.kerf', 'tokens')
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
        if (!source.startsWith('kerf:tokens/')) return null
        const file = join(root, '.kerf', 'tokens', `${source.slice('kerf:tokens/'.length)}.css`)
        return existsSync(file) ? file : EMPTY
      },
    },
    load: {
      filter: { id: /^\0kerf:tokens-empty$/ },
      handler: () => '',
    },
  }
}
