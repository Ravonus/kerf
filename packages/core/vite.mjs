// weft() for Vite 8: one filtered transform hook, so only .tsx/.jsx files cross into JS (§3.6).
import { createRequire } from 'node:module'
import { assets } from './assets.mjs'
import {
  keyed,
  features,
  interactionFeatures,
  flags,
  slots,
  tokens,
} from './vite/config-plugins.mjs'
import { importedShapes, thinShape } from './vite/shapes.mjs'
import { purgeCss } from './vite/purge.mjs'
import { styleGroups } from './vite/style-groups.mjs'
import { cspStyles } from './vite/csp.mjs'
import { shapeGroupCss } from './vite/shape-styles.mjs'
import { shapeWatch } from './vite/shape-watch.mjs'
import { icons } from './vite/icons.mjs'
import { agent } from './vite/agent.mjs'
import { watchChanges } from './vite/watch.mjs'
import { MODE, modeHooks } from './vite/modes.mjs'

const { transform } = createRequire(import.meta.url)('./compiler.cjs')

/**
 * `hydratable`: DOM output that adopts server HTML (`hydrate`), and SSR output with hydration keys. Vite's SSR
 * transforms get SSR output (imports from @weft-js/core/ssr). `import { App } from './App.tsx?weft-ssr'` (or `?weft-hydrate`)
 * loads a component graph compiled that way into any process (round-trip tests); the query follows .tsx/.jsx imports.
 */
/*
 * `style.taggedParts`: group parts carry `data-g` as well as `data-part`; `style.matrix: false`: no `.weft/styles.json`
 * (style groups, below).
 */
/*
 * `hmr` (default: when serving, outside vitest): client modules register their components with @weft-js/core/hmr and accept
 * their own updates (research 21). Never for SSR output.
 */
/** The compiler's diagnostics as Vite errors and warnings, at their place in the file. */
function report(ctx, id, diagnostics) {
  for (const d of diagnostics) {
    const text = `${d.code} ${d.message}\n  help: ${d.help}`
    const loc = { file: id, line: d.line, column: d.column - 1 }
    if (d.severity === 'error') ctx.error({ message: text, loc })
    else ctx.warn({ message: text, loc })
  }
}

/*
 * `csp: 'strict'`: output for a Content-Security-Policy with no `'unsafe-inline'` styles. Fixed `style` values become
 * generated classes in a stylesheet (vite/csp.mjs) instead of style attributes.
 */
/**
 * The Vite plugin: compiles TSX, wires hydration, styles and purging, and relays `weft browser` in dev.
 * @param {{ dev?: boolean, hydratable?: boolean, hmr?: boolean, style?: { taggedParts?: boolean, matrix?: boolean }, purge?: false | { keep?: string[] }, off?: string[], csp?: 'strict' }} [options]
 */
export default function weft({
  dev,
  hydratable = false,
  hmr,
  style: styleOptions,
  purge: purgeOptions,
  off,
  csp,
} = {}) {
  let isDev = false
  let isHot = false
  const style = styleGroups(styleOptions)
  const watching = shapeWatch((file) => style.forget(file))
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
      return await modeHooks.resolveId.call(this, source, importer)
    },
    transform: {
      filter: { id: /\.[jt]sx(\?weft-(ssr|hydrate|shape))?$/ },
      async handler(code, id, options) {
        const standalone = id.endsWith('?weft-shape')
        const mode = MODE.exec(id)?.[1]
        const ssr = mode ? mode === 'ssr' : !!options?.ssr
        const hydrating = hydratable || !!mode
        const dependencies = new Set()
        const groups = await style.options(
          this,
          code,
          id.replace(/\?.*$/, ''),
          (file) => {
            if (standalone) dependencies.add(file)
          },
          (file) => {
            if (standalone) watching.candidate(file, dependencies)
          },
        )
        if (standalone) watching.replace(id, dependencies, this)
        const shapes = standalone ? {} : await importedShapes(this, code, id.replace(/\?.*$/, ''))
        const islands =
          hydrating && !mode && !standalone ? await main.api.islands?.(this, id) : undefined
        const out = transform(code, {
          filename: standalone ? id : id.replace(/\?.*$/, ''),
          islands,
          dev: isDev,
          sourceMap: true,
          generate: ssr ? 'ssr' : 'dom',
          hydratable: hydrating,
          hmr: !standalone && isDev && isHot && !ssr,
          groups,
          shapes,
          taggedParts: !!styleOptions?.taggedParts,
          csp: csp === 'strict' ? 'strict' : '',
        })
        report(this, id, out.diagnostics)
        if (!out.code) return null
        const generated = standalone
          ? shapeGroupCss(out.facts, groups, id.replace(/\?.*$/, ''), {
              dev: isDev,
              taggedParts: !!styleOptions?.taggedParts,
            })
          : ''
        return {
          code: standalone
            ? `${out.code}\nexport const $weftShapeCss = ${JSON.stringify(generated)};\nexport const $weftShapeThin = ${thinShape(out.code)};${
                // A route edit changes its shape too: taking the update here keeps the page instead of reloading it.
                isDev && !ssr ? '\nif (import.meta.hot) import.meta.hot.accept();' : ''
              }`
            : style.record(this, id, out.facts, out.code, ssr),
          map: out.map,
        }
      },
    },
    configureServer(server) {
      watching.attach(server)
      return watchChanges(server)
    },
    // oxlint-disable-next-line typescript/unbound-method -- the native method is kept to be called with .call()
    hotUpdate: watching.hotUpdate,
    /** `islands(ctx, id)`: a framework's project view of the file (node/hydration.mjs). */
    api: {},
  }
  const icon = icons()
  return [
    icon.rewrite,
    flags(off),
    keyed,
    interactionFeatures,
    main,
    features,
    style.plugin,
    cspStyles(),
    agent(),
    slots(),
    tokens(),
    icon.resolve,
    assets(),
    ...(purgeOptions === false ? [] : [purgeCss(purgeOptions?.keep)]),
  ]
}
