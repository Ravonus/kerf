// renderCard for weft (research 20 §4, §9; promoted from spikes/og/card): weft SSR HTML → PNG/JPEG/WebP/SVG, on
// Takumi, with what Satori did better added around it:
//   - strict styles: every declaration is checked once against the renderer (an invalid value would fail the whole
//     card, an unknown property is silently dropped) and reported as H005; production drops the bad declaration and
//     renders the rest instead of failing the request
//   - any font format (WOFF too, which Takumi's wasm build can't read), resolved before the first render
//   - SVG output and a ready `Response` with the §4.3 cache headers
//   - a browser preview that matches the PNG: the same preflight (border-box everywhere) and the same font bytes
// and what neither did: SSR hole comments are removed (both HTML parsers drop text before a comment), and remote
// images are fetched with a timeout, size cap and host allowlist, cached, and left out (box kept) when they fail.
import { fromHtml } from '@takumi-rs/helpers/html'
import { normalizeFonts } from './fonts.mjs'
import { imageCache, loadImages } from './images.mjs'
import { native } from './native.mjs'

/** Applied to every card, in the PNG and in the preview. Takumi lays out border-box by default; browsers don't. */
export const PREFLIGHT = '*,*::before,*::after{box-sizing:border-box}'
/** The size of a generated card. */
export const SIZE = { width: 1200, height: 630 }
const TYPES = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' }

const stripComments = html => html.replace(/<!--[\s\S]*?-->/g, '')
const kebab = k => k.replace(/^Webkit/, '-webkit-').replace(/[A-Z]/g, c => '-' + c.toLowerCase())
// A value no CSS grammar accepts: a property the renderer knows rejects it, and one it doesn't know takes anything.
// (An identifier won't do: `text-overflow`, `grid-template-columns` and `font-family` accept custom idents.)
const PROBE = '}{'

const renderers = new Map() // fonts array → the renderer registered with them

/**
 * The one seam the server uses (research 20 §4.2): HTML at `size`, drawn with `fonts`, to PNG bytes. Diagnostics (H005
 * styles, H008 images) go to `onDiagnostic`; `strict` (dev, `weft build`) throws on an error instead. Native Takumi;
 * the edge build (`@takumi-rs/wasm`) plugs in here when an edge preset needs it.
 *
 * @param {string} html
 * @param {{ width?: number; height?: number }} [size]
 * @param {{ name: string; data: Uint8Array; weight?: number; style?: 'normal' | 'italic' }[]} [fonts]
 * @param {{ strict?: boolean; onDiagnostic?: (d: { code: string; severity: string; message: string }) => void; images?: unknown }} [options]
 */
export async function renderCard(html, size = SIZE, fonts = [], { strict = false, onDiagnostic, images } = {}) {
  let r = renderers.get(fonts)
  if (!r) renderers.set(fonts, (r = native().then(backend => createCardRenderer({ backend, fonts, images }))))
  const out = await (await r).render(html, { width: size.width ?? SIZE.width, height: size.height ?? SIZE.height, strict })
  for (const d of out.diagnostics) onDiagnostic?.(d)
  return out.body
}

/**
 * `backend` is `await native()` (card/native.mjs) or `await wasm(module)` (card/wasm.mjs). `fonts` is `{ name, data, weight?, style? }[]` in TTF, OTF,
 * WOFF or WOFF2. `images` configures `<img>` fetching (see images.mjs).
 */
export async function createCardRenderer({ backend, fonts = [], images: imageOptions = {} }) {
  const renderer = new backend.Renderer()
  for (const font of await normalizeFonts(fonts)) await renderer.registerFont(font)
  const cache = imageCache(imageOptions.cacheBytes)
  const verdicts = new Map() // `${prop}\0${value}` → null (fine) | { severity, message }

  const accepts = async style => {
    try { await renderer.measure({ type: 'container', style }, { width: 1, height: 1 }); return true } catch { return false }
  }
  async function judge(prop, value) {
    const key = `${prop}\0${value}`
    if (verdicts.has(key)) return verdicts.get(key)
    let v = null
    if (!(await accepts({ [prop]: value }))) {
      v = { severity: 'error', message: `\`${kebab(prop)}: ${value}\` isn't a value the card renderer accepts; the declaration is dropped.` }
    } else if (await accepts({ [prop]: PROBE })) {
      v = { severity: 'warning', message: `\`${kebab(prop)}\` isn't a property the card renderer supports; it has no effect.` }
    }
    verdicts.set(key, v)
    return v
  }

  /** Walks the tree: checks styles (dropping invalid declarations), and collects image nodes. */
  async function prepare(html) {
    const { node, css } = fromHtml(stripComments(html))
    const diagnostics = [], imageNodes = []
    const walk = async (n, path) => {
      if (n.type === 'image') imageNodes.push(n)
      for (const [prop, value] of Object.entries(n.style ?? {})) {
        const v = await judge(prop, value)
        if (!v) continue
        diagnostics.push({ code: 'H005', severity: v.severity, message: v.message, element: path })
        if (v.severity === 'error') delete n.style[prop]
      }
      for (const [i, c] of (n.children ?? []).entries()) await walk(c, `${path} > ${c.tagName ?? c.type}:nth-child(${i + 1})`)
    }
    await walk(node, node.tagName ?? node.type)
    return { node, css, diagnostics, imageNodes }
  }

  return {
    /** Diagnostics only (`weft check`, dev): nothing is fetched or rasterized. */
    async check(html) {
      return (await prepare(html)).diagnostics
    },

    /**
     * Renders a card. Never throws on a card's styles or images: those come back as diagnostics, and the card renders
     * without them. `strict` (dev, `weft build`) throws on any error-severity diagnostic instead.
     */
    async render(html, { width = SIZE.width, height = SIZE.height, format = 'png', quality, strict = false } = {}) {
      const { node, css, diagnostics, imageNodes } = await prepare(html)
      const { images, failed } = await loadImages(imageNodes.map(n => n.src), { cache, ...imageOptions })
      for (const f of failed) {
        diagnostics.push({ code: 'H008', severity: 'warning', message: `Card image ${f.src} didn't load (${f.reason}); the card renders without it.` })
        for (const n of imageNodes) if (n.src === f.src) Object.assign(n, { type: 'container', src: undefined, style: { width: n.width && `${n.width}px`, height: n.height && `${n.height}px`, ...n.style } })
      }
      if (strict && diagnostics.some(d => d.severity === 'error')) {
        throw Object.assign(new Error(diagnostics.filter(d => d.severity === 'error').map(d => `${d.code} ${d.message} (${d.element})`).join('\n')), { diagnostics })
      }
      const options = { width, height, images, css: [PREFLIGHT, ...css] }
      const body = format === 'svg'
        ? await renderer.renderSvg(node, options)
        : new Uint8Array(await renderer.render(node, { ...options, format, ...(quality != null && { quality }) }))
      return { body, type: TYPES[format], diagnostics }
    },
  }
}

/**
 * The HTTP response for `/_weft/og/<route>.png?v=<hash>` (§4.3): immutable, since the URL is content-addressed, except
 * in dev, where an edit must show on reload.
 */
export function cardResponse({ body, type }, { dev = false } = {}) {
  return new Response(body, {
    headers: { 'content-type': type, 'cache-control': dev ? 'no-store' : 'public, max-age=31536000, immutable' },
  })
}

/**
 * The card as a page for `weft open --og`: the same HTML, preflight and font bytes as the PNG, at the card's size, so a
 * browser shows what the renderer draws.
 */
export function previewHtml(html, { fonts = [], width = SIZE.width, height = SIZE.height } = {}) {
  const faces = fonts.map(f => `@font-face{font-family:"${f.name}";font-weight:${f.weight ?? 400};font-style:${f.style ?? 'normal'};src:url(data:font/${fontMime(f.data)};base64,${base64(f.data)})}`).join('')
  return `<!doctype html><meta charset="utf-8"><style>${faces}${PREFLIGHT}html,body{margin:0}#card{width:${width}px;height:${height}px;overflow:hidden;display:flex}</style><div id="card">${stripComments(html)}</div>`
}

const fontMime = d => ({ wOFF: 'woff', wOF2: 'woff2', OTTO: 'otf' })[String.fromCharCode(...d.subarray(0, 4))] ?? 'ttf'

function base64(bytes) {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
