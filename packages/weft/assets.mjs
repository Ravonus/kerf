// Build-side slots in weft/vite (research 26 §2–3): `?media` imports (`media.build@1`) and `weft:fonts`
// (`font.build@1`). `weft plugins sync` writes `.weft/slots/<id>.build.json` for each bound build-side provider; this
// imports the provider module in Node and serves or emits the files it returns. With no provider, `?media` still
// gives dimensions (a header probe) and the fonts modules are empty. With a font build the client imports `weft:fonts`
// on its own: the entry a Start app boots from, or a script in an HTML app's page.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { probe } from './media-probe.mjs'

/** The provider bound to a build-side slot, instantiated from `.weft/slots/<id>.build.json`, or null. */
export async function buildSlot(root, id) {
  const file = join(root, '.weft', 'slots', `${id}.build.json`)
  if (!existsSync(file)) return null
  const ref = JSON.parse(readFileSync(file, 'utf8'))
  const spec = isAbsolute(ref.module) ? pathToFileURL(ref.module).href : pathToFileURL(createRequire(join(root, 'package.json')).resolve(ref.module)).href
  const mod = await import(spec)
  const make = mod[ref.export]
  if (typeof make !== 'function') throw new Error(`${id}: ${ref.plugin} names \`${ref.export}\` in ${ref.module}, which is not a function`)
  return { plugin: ref.plugin, impl: await make(ref.options ?? {}) }
}

/** A `keyed` slot's build-side providers: `{ key: implementation }`. */
export async function buildKeys(root, id) {
  const file = join(root, '.weft', 'slots', `${id}.build.json`)
  if (!existsSync(file)) return {}
  const keys = {}
  for (const [key, ref] of Object.entries(JSON.parse(readFileSync(file, 'utf8')).keys)) {
    const spec = isAbsolute(ref.module) ? pathToFileURL(ref.module).href : pathToFileURL(createRequire(join(root, 'package.json')).resolve(ref.module)).href
    keys[key] = (await import(spec))[ref.export](ref.options ?? {})
  }
  return keys
}

const MEDIA = /\?media(?:&audio=[^&]+)?$/
const FONTS = 'weft:fonts'
const PRELOADS = 'weft:fonts/preloads'
const DEV_PREFIX = '/@weft-assets/'
/** A Start app's client entry: the generated one, or its own `src/entry.client.ts`. */
const CLIENT_ENTRY = /(?:^\0virtual:weft\/entry-client|[\\/]src[\\/]entry\.client\.[cm]?[jt]sx?)$/

/** Files the providers return: served from memory in dev, emitted under `assets/` in a build. */
function fileStore() {
  const files = new Map()
  let base = '/'
  let serving = false
  return {
    configResolved(config) {
      base = config.base ?? '/'
      serving = config.command === 'serve'
    },
    // A name, or already a URL: `encoder: 'server'` records point at the media route.
    url: name => (name[0] === '/' ? name : (serving ? DEV_PREFIX : `${base}assets/`) + name),
    add(ctx, name, bytes) {
      files.set(name, bytes)
      if (!serving) ctx.emitFile({ type: 'asset', fileName: `assets/${name}`, source: bytes })
    },
    middleware: (req, res, next) => {
      const name = req.url?.startsWith(DEV_PREFIX) && decodeURIComponent(req.url.slice(DEV_PREFIX.length).split('?')[0])
      const bytes = name && files.get(name)
      if (!bytes) return next()
      res.setHeader('content-type', TYPES[extname(name).slice(1)] ?? 'application/octet-stream')
      res.setHeader('cache-control', 'no-cache')
      // Safari won't play a video from a server without ranges.
      const range = /^(?:mp4|webm|m4a)$/.test(extname(name).slice(1)) && /^bytes=(\d+)-(\d*)$/.exec(req.headers?.range ?? '')
      if (range) {
        const start = Number(range[1])
        const end = Math.min(range[2] ? Number(range[2]) : Infinity, bytes.length - 1)
        res.statusCode = 206
        res.setHeader('content-range', `bytes ${start}-${end}/${bytes.length}`)
        return res.end(Buffer.from(bytes.subarray(start, end + 1)))
      }
      res.end(Buffer.from(bytes))
    },
  }
}

const TYPES = { avif: 'image/avif', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', svg: 'image/svg+xml', woff2: 'font/woff2', woff: 'font/woff', mp4: 'video/mp4', webm: 'video/webm', m4a: 'audio/mp4' }

/** No provider: the original file, its header dimensions, nothing else. */
function original(file, bytes) {
  const size = probe(bytes, file)
  if (!size) throw new Error(`${file}: not an image weft can read the size of (PNG, JPEG, GIF, WebP, AVIF, SVG). Video and audio need \`media()\` and \`mediaFfmpeg()\` in \`plugins\` (P101).`)
  const ext = extname(file)
  const name = `${basename(file, ext)}-${createHash('sha256').update(bytes).digest('hex').slice(0, 8)}${ext}`
  const kind = size.type === 'image/svg+xml' ? 'vector' : size.type === 'image/jpeg' || size.type === 'image/avif' || size.type === 'image/heif' ? 'photo' : 'graphic'
  return { asset: { kind, src: name, width: size.width, height: size.height, type: size.type, sources: [], name: basename(file), quality: 'original' }, files: [{ name, bytes }] }
}

export function assets() {
  const store = fileStore()
  let root = process.cwd()
  let dev = false
  const providers = new Map()
  const provider = id => {
    if (!providers.has(id)) providers.set(id, buildSlot(root, id))
    return providers.get(id)
  }
  let fonts
  let encode
  const fontEnvs = new Set()
  const fontBuild = () => existsSync(join(root, '.weft', 'slots', 'font.build.build.json'))

  /** Run font.build once per process; writes `.weft/fonts.json` (metrics and the budget report X022 reads). */
  const buildFonts = async ctx => {
    const out = await (fonts ??= (async () => {
      const p = await provider('font.build')
      if (!p) return { css: '', preloads: [], files: [] }
      const out = await p.impl.build({ root, cacheDir: join(root, '.weft', 'cache', 'fonts'), url: name => store.url(name) })
      mkdirSync(join(root, '.weft'), { recursive: true })
      writeFileSync(join(root, '.weft', 'fonts.json'), `${JSON.stringify({ plugin: p.plugin, metrics: out.metrics ?? {}, report: out.report ?? {} }, null, 2)}\n`)
      return out
    })())
    // Each environment writes its own output: the server's asking first mustn't leave the client's without the files.
    const env = ctx.environment?.name
    if (!fontEnvs.has(env)) {
      fontEnvs.add(env)
      for (const f of out.files) store.add(ctx, f.name, f.bytes)
    }
    return out
  }

  return {
    name: 'weft:assets',
    enforce: 'pre',
    configResolved(config) {
      root = config.root
      dev = config.command === 'serve'
      store.configResolved(config)
    },
    configureServer(server) {
      server.middlewares.use(store.middleware)
    },
    transform: {
      filter: { id: CLIENT_ENTRY },
      handler(code) {
        if (this.environment?.config.consumer !== 'server' && fontBuild()) return { code: `import '${FONTS}'\n${code}`, map: null }
      },
    },
    transformIndexHtml: {
      order: 'pre',
      handler: () => (fontBuild() ? [{ tag: 'script', attrs: { type: 'module' }, children: `import '${FONTS}'`, injectTo: 'head' }] : undefined),
    },
    resolveId(source) {
      if (source === FONTS) return '\0weft:fonts.css'
      if (source === PRELOADS) return '\0' + PRELOADS
      return null
    },
    load: {
      filter: { id: [MEDIA, /^\0weft:fonts/] },
      async handler(id) {
        if (id === '\0weft:fonts.css') return (await buildFonts(this)).css
        if (id === '\0' + PRELOADS) return `export const preloads = ${JSON.stringify((await buildFonts(this)).preloads)}\n`
        const file = id.replace(MEDIA, '')
        const track = /&audio=([^&]+)$/.exec(id)?.[1]
        const audio = track && resolve(dirname(file), decodeURIComponent(track))
        this.addWatchFile(file)
        if (audio) this.addWatchFile(audio)
        const bytes = new Uint8Array(readFileSync(file))
        const p = await provider('media.build')
        encode ??= buildKeys(root, 'media.encode')
        const out = p
          ? await p.impl.build({ file, bytes, audio }, { root, dev, cacheDir: join(root, '.weft', 'cache', 'media'), url: name => name, encode: await encode })
          : original(file, bytes)
        for (const d of out.diagnostics ?? []) {
          if (d.severity === 'error') this.error(`${d.code} ${d.message}`)
          else if (d.severity === 'info') this.info(`${d.code} ${d.message}`)
          else this.warn(`${d.code} ${d.message}`)
        }
        for (const f of out.files) store.add(this, f.name, f.bytes)
        const asset = { ...out.asset, src: store.url(out.asset.src), sources: out.asset.sources.map(s => ({ ...s, srcset: s.srcset.replace(/(^|,\s*)([^\s,]+)/g, (_, sep, n) => sep + store.url(n)) })) }
        if (asset.poster) asset.poster = store.url(asset.poster)
        if (asset.copy) asset.copy = { ...asset.copy, src: store.url(asset.copy.src) }
        return `export default ${JSON.stringify(asset)}\n`
      },
    },
  }
}
