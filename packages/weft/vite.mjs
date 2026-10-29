// weft() for Vite 8: one filtered transform hook, so only .tsx/.jsx files cross into JS (§3.6).
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

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
        if (!existsSync(file)) this.error(`P101 ${source}: ${file} does not exist. Run \`weft plugins sync\`, or add a plugin that provides \`${id}\` to weft.config.ts.`)
        return file
      },
    },
  }
}

/**
 * `weft:tokens/<namespace>` → the generated `<root>/.weft/tokens/<namespace>.css` (a plugin's `tokens.css`), or an
 * empty module when the plugin left the defaults. A kit imports it once, so a seed in weft.config.ts needs no app wiring.
 */
function tokens() {
  let root = process.cwd()
  const EMPTY = '\0weft:tokens-empty'
  return {
    name: 'weft:tokens',
    configResolved(config) {
      root = config.root
    },
    resolveId: {
      filter: { id: /^weft:tokens\// },
      handler(source) {
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
      handler(code, id, options) {
        const mode = MODE.exec(id)?.[1]
        const ssr = mode ? mode === 'ssr' : !!options?.ssr
        const hydrating = hydratable || !!mode
        const out = transform(code, { filename: id.replace(/\?.*$/, ''), dev: isDev, sourceMap: true, generate: ssr ? 'ssr' : 'dom', hydratable: hydrating, hmr: isDev && isHot && !ssr && !hydrating })
        for (const d of out.diagnostics) {
          const text = `${d.code} ${d.message}\n  help: ${d.help}`
          const loc = { file: id, line: d.line, column: d.column - 1 }
          if (d.severity === 'error') this.error({ message: text, loc })
          else this.warn({ message: text, loc })
        }
        return { code: out.code, map: out.map }
      },
    },
  }
  return [main, features, slots(), tokens()]
}
