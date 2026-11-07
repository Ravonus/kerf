import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { scanRequired } from '../live-target.mjs'
import { here, V, purgeFile, INLINE_SHEETS, SHEET_PIECES, ROUTE_ASSET_BYTES } from './shared.mjs'

export function serverEntry(clientEntry, dev, root) {
  return `import { createHandler } from ${JSON.stringify(join(here, 'server.tsx'))}
import { chunks, lazy, manifest, modules, routeCss, statics } from '${V.routes}'
import '${V.fns}'
import context from '${V.context}'
import auth from '${V.auth}'
import migrations from '${V.migrations}'
import media from '${V.media}'
import realtime from '${V.realtime}'
import extensions from '${V.extensions}'
import * as app from '${V.app}'
import assets from '${clientEntry}?assets=client'
import { preloads } from 'weft:fonts/preloads'
${dev ? '' : `import { parse, purge } from ${JSON.stringify(purgeFile)}\n`}const fetch = createHandler({ manifest, modules, statics, chunks, lazy, context, auth, migrations, media, realtime, liveRequired: ${JSON.stringify(scanRequired(root).map((r) => r.name))}, extensions, site: app.site, build: app.build, dev: app.dev, fonts: app.fonts(), timeout: app.timeout, hold: app.hold, routeAssetBytes: ${dev ? 'null' : `'${ROUTE_ASSET_BYTES}'`}, assets: { entry: assets.entry, js: assets.js, get css() { return routeCss(assets.css) }, fonts: preloads, inline: ${dev ? 'undefined' : `'${INLINE_SHEETS}'`}, pieces: ${dev ? 'undefined' : `'${SHEET_PIECES}'`}, critical: ${dev ? 'undefined' : '{ parse, purge }'} },
  // H005–H008, Q002–Q014, A002–A004, F002–F003, M017 and R-codes found while serving: the server log, in dev and production.
  onDiagnostic: d => console.warn(\`[weft] \${d.code} \${d.severity}\${d.route ? \` (\${d.route})\` : ''}: \${d.message.replace(/^[A-Z]{1,3}\\d{3}:? /, '')}\`) })
export default { fetch }
`
}

/**
 * A `server.extension` provider runs only for an app with `src/<key>.server.ts`, the file that says it wants it (P118):
 * the provider is loaded on the first request and handed that file's default export. No provider gives an empty list.
 */
export function extensionsModule(root, abs) {
  const slot = join(root, '.weft', 'slots', 'server.extension.ts')
  const keys = existsSync(slot)
    ? Object.entries(
        JSON.parse(/providers = (\{.*\}) as const/.exec(readFileSync(slot, 'utf8'))?.[1] ?? '{}'),
      )
        .filter(([, name]) => name)
        .map(([key]) => key)
    : []
  const files = keys.flatMap((key) => {
    const f = ['ts', 'mts', 'js', 'mjs']
      .map((x) => `src/${key}.server.${x}`)
      .find((x) => existsSync(abs(x)))
    return f ? [[key, abs(f)]] : []
  })
  if (!files.length) return 'export default []\n'
  return `import { load } from 'weft:slot/server.extension'\n${files.map(([, f], i) => `import app${i} from ${JSON.stringify(f)}\n`).join('')}export default [${files.map(([key], i) => `{ key: ${JSON.stringify(key)}, load: () => load(${JSON.stringify(key)}).then(extend => extend(app${i})) }`).join(', ')}]\n`
}

/** Dev serves from the project; a built server from the directory it runs in (or `WEFT_MEDIA_DIR`). */
export function mediaModule(root, dev) {
  const slot = join(root, '.weft', 'slots', 'media.server.ts')
  if (!existsSync(slot) || readFileSync(slot, 'utf8').includes('provider = null'))
    return 'export default undefined\n'
  const at = dev ? JSON.stringify(root) : 'undefined'
  if (!existsSync(join(root, '.weft', 'slots', 'media.encode.ts')))
    return `import { load } from 'weft:slot/media.server'\nexport default () => load().then(m => m.at(${at}))\n`
  return `import { load } from 'weft:slot/media.server'
import { load as encoder, providers } from 'weft:slot/media.encode'
const encode = async () => Object.fromEntries(await Promise.all(Object.keys(providers).filter(k => providers[k]).map(async k => [k, await encoder(k)])))
export default () => Promise.all([load(), encode()]).then(([m, e]) => m.at(${at}, e))
`
}

export const busBound = (root) => {
  const slot = join(root, '.weft', 'slots', 'realtime.bus.ts')
  return existsSync(slot) && readFileSync(slot, 'utf8').includes('provider = {')
}

/** A bus in `src/realtime.server.ts` wins over the plugin's, like any explicit choice. */
export const busModule = (file, from) => `import { load, provider } from 'weft:slot/realtime.bus'
import { slotBus } from ${JSON.stringify(join(from, 'bus.ts'))}
${file ? `import own from ${JSON.stringify(file)}` : 'const own = undefined'}
export default { ...own, bus: own?.bus ?? slotBus(provider.plugin, load) }
`

export function appModule({ site, build, dev, fonts, timeout, hold }) {
  return `export const site = ${JSON.stringify(site)}
export const build = ${JSON.stringify(build)}
export const dev = ${dev}
export const timeout = ${timeout ?? 'undefined'}
export const hold = ${hold ?? 'undefined'}
const raw = ${JSON.stringify(fonts)}
let decoded
export function fonts() {
  return (decoded ??= raw.map(f => ({ ...f, data: Uint8Array.from(atob(f.data), c => c.charCodeAt(0)) })))
}
`
}

/**
 * The fonts every card can use, resolved at build and shipped inside the server bundle (research 20 §4.2: a render
 * never fetches fonts). `Inter:400,700` → `@fontsource/inter`'s latin WOFF2 files, from the app or from @weft-js/start.
 */
export function cardFonts(manifest, abs, defaults, root, own = {}) {
  const specs = new Set(defaults)
  for (const f of [...manifest.routes.map((r) => r.card), manifest.defaultCard].filter(Boolean)) {
    const m = /export\s+const\s+fonts\s*=\s*\[([^\]]*)\]/.exec(readFileSync(abs(f), 'utf8'))
    if (m) for (const s of m[1].matchAll(/['"]([^'"]+)['"]/g)) specs.add(s[1])
  }
  const requires = [
    createRequire(join(root, 'package.json')),
    createRequire(join(here, 'vite.mjs')),
  ]
  const out = []
  // The app's own faces (`site.card.fonts`, filled in by the text plugin): the card's title and text look like the app.
  for (const f of [own.display, own.body].filter(Boolean)) {
    const path = join(root, f.src)
    if (existsSync(path) && !out.some((x) => x.name === f.family))
      out.push({
        name: f.family,
        weight: f.weight ?? 400,
        style: 'normal',
        data: readFileSync(path).toString('base64'),
      })
  }
  for (const spec of specs) {
    const [family, weights = '400'] = spec.split(':')
    const pkg = family.toLowerCase().replace(/\s+/g, '-')
    for (const w of weights.split(',')) {
      const [weight, italic] = [Number.parseInt(w), /i(talic)?$/.test(w)]
      const file = `@fontsource/${pkg}/files/${pkg}-latin-${weight}-${italic ? 'italic' : 'normal'}.woff2`
      const path = requires
        .map((r) => {
          try {
            return r.resolve(file)
          } catch {
            return undefined
          }
        })
        .find(Boolean)
      if (!path)
        throw new Error(
          `weft: card font \`${spec}\` needs \`@fontsource/${pkg}\` installed (looked for ${file})`,
        )
      out.push({
        name: family,
        weight,
        style: italic ? 'italic' : 'normal',
        data: readFileSync(path).toString('base64'),
      })
    }
  }
  return out
}
