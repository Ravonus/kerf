// s.text() (research 33 §7): a real element over the text's box, and the canvas paints what that element says. The
// mirror is always on, so selection, find, translation, screen readers, forced colours and print need nothing else.
// A surface with no 2D context has no text path: there the mirror itself is the visible text.

import { DEV, effect, onCleanup, state, type State } from 'weft'
import { loadMeasure, type MeasureHandle, type MeasureProvider } from './measure'

export type { MeasureHandle, MeasureLine, MeasureProvider } from './measure'

export interface TextOptions {
  x: number
  y: number
  /** The wrap width in CSS px. */
  width: number
  /** A font shorthand, `600 16px Inter`. Default: the mirror's computed font, so it comes from your CSS. */
  font?: string
  /** CSS px. Default: the computed line height. */
  lineHeight?: number
  /** Default: the surface's computed `color`. */
  color?: string
  align?: 'left' | 'center' | 'right'
  /** You know this text can't be predicted: no X001 or X004. */
  exact?: boolean
  class?: string
}

export interface SurfaceText {
  /** The mirror. Never hide it from assistive tech (X011). */
  el: HTMLElement
  lineCount: State<number>
  height: State<number>
}

/** What the surface's paint holds: the text, and how to draw it. */
export type PaintedText = SurfaceText & { paint(): void }

export interface TextHost {
  el: HTMLElement
  ctx: CanvasRenderingContext2D | null | undefined
  invalidate(): void
  paint(): void
}

type Live = { prepare(): void; host: TextHost }
const nodes = new Set<Live>()

let provider: MeasureProvider | undefined
let styled = false
let plain: MediaQueryList | undefined
let fontsWatched = false

/** The stylesheet, once: mirrors take the page's type, minus what line breaking can't predict. */
function sheet() {
  if (styled) return
  styled = true
  const style = document.createElement('style')
  style.textContent = '[data-surface-text]{position:absolute;margin:0;color:transparent;white-space:normal;overflow-wrap:break-word;text-wrap:wrap;hyphens:manual;word-spacing:normal;letter-spacing:normal;font-feature-settings:normal;font-variant-numeric:normal;font-variation-settings:normal}@media (forced-colors:active),print{[data-surface-text]{color:CanvasText!important}}'
  document.head.append(style)
}

/** While this matches the mirror is the visible text, so the canvas draws none. */
function fallback() {
  if (plain || typeof matchMedia !== 'function') return plain
  plain = matchMedia('(forced-colors: active), print')
  plain.addEventListener('change', () => { for (const n of nodes) n.host.paint() }) // before the print snapshot, so not on a frame
  return plain
}

function watchFonts() {
  if (fontsWatched || !document.fonts?.addEventListener) return
  fontsWatched = true
  document.fonts.addEventListener('loadingdone', () => {
    provider?.clear()
    for (const n of nodes) { n.prepare(); n.host.invalidate() }
  })
}

const fontOf = (c: CSSStyleDeclaration) => `${c.fontStyle} ${c.fontWeight} ${c.fontSize} ${c.fontFamily}`

const warned = new Set<string>()
const warn = (code: string, message: string) => {
  if (warned.has(code + message)) return
  warned.add(code + message)
  console.warn(`weft: ${code} ${message}`)
}

/** X002–X004 and X011: what only the live mirror can tell. Dev only. */
function inspect(el: HTMLElement, font: string, exact: boolean | undefined) {
  const c = getComputedStyle(el)
  const family = font.replace(/^.*?\d[\d.]*px(\/\S+)?\s*/, '')
  if (/(^|,)\s*("?system-ui"?|-apple-system|BlinkMacSystemFont)\s*(,|$)/i.test(family) || /^\s*(serif|sans-serif|monospace|cursive|fantasy)\s*$/i.test(family))
    warn('X002', `s.text() measures \`${font}\`: \`system-ui\`, \`-apple-system\` and generic-only families aren't safe to measure. Name a family.`)
  const fonts = document.fonts
  if (fonts?.check && !fonts.check(font)) {
    const first = family.split(',')[0].trim().replace(/^["']|["']$/g, '')
    if (![...fonts].some(f => f.family.replace(/^["']|["']$/g, '') === `${first} Fallback`)) warn('X003', `s.text() prepared \`${font}\` before the font loaded, and there's no "${first} Fallback" face: it's measured on another font until the swap. Declare it in \`text({ fonts })\`.`)
  }
  if (!exact) {
    const odd = [
      ['text-wrap', (c as any).textWrapStyle ?? (c as any).textWrap, /balance|pretty/], ['hyphens', c.hyphens, /auto/], ['word-spacing', c.wordSpacing, /^[^0n]/], ['letter-spacing', c.letterSpacing, /^[^0n]/],
      ['font-feature-settings', c.fontFeatureSettings, /^[^n]/], ['font-variant-numeric', c.fontVariantNumeric, /^[^n]/], ['font-variation-settings', (c as any).fontVariationSettings, /^[^n]/],
    ].filter(([, v, re]) => v && (re as RegExp).test(v as string)).map(([p, v]) => `\`${p}: ${v}\``)
    if (odd.length) warn('X004', `s.text() can't predict ${odd.join(', ')}. Drop it, or pass \`exact: false\`.`)
  }
  if (c.display === 'none' || c.visibility === 'hidden' || el.closest('[aria-hidden="true"]')) warn('X011', 'A surface text mirror is hidden from assistive tech. Leave the mirror to weft; it is the only copy of this text a screen reader can read.')
}

/** The mirror goes in `host.el`; the caller's scope owns its effects. */
export function surfaceText(host: TextHost, text: string | (() => string), options: TextOptions | (() => TextOptions)): PaintedText {
  sheet()
  const read = () => (typeof options === 'function' ? options() : options)
  const ctx = host.ctx
  const el = document.createElement('p')
  el.setAttribute('data-surface-text', '')
  const lineCount = state(0), height = state(0)

  let handle: MeasureHandle | undefined
  let font = ''
  let leading = 0
  let color = ''
  let laid: MeasureHandle | undefined
  let lines: { text: string; width: number }[] = []
  let laidWidth = -1

  const live: Live = {
    host,
    prepare() {
      if (!provider || !el.isConnected) return
      const o = read()
      const c = getComputedStyle(el)
      font = o.font ?? fontOf(c)
      leading = o.lineHeight ?? (parseFloat(c.lineHeight) || Math.round(parseFloat(c.fontSize) * 1.2))
      color = o.color ?? getComputedStyle(host.el).color
      handle = provider.prepare(el.textContent ?? '', font, { segments: true })
      laid = undefined
      if (handle.ready) handle.ready.then(() => { laid = undefined; host.invalidate() }) // an exact tier or pack arrived: lay out again
    },
  }
  nodes.add(live)
  onCleanup(() => { nodes.delete(live); el.remove() })

  effect(read, o => {
    const s = el.style
    s.left = `${o.x}px`
    s.top = `${o.y}px`
    s.width = `${o.width}px`
    if (o.font) s.font = o.font
    if (o.lineHeight) s.lineHeight = `${o.lineHeight}px`
    if (o.align) s.textAlign = o.align
    if (o.class) el.className = o.class
    if (!ctx) s.color = o.color ?? 'inherit' // no text path: the mirror is what's seen
    host.invalidate()
  })
  effect(() => (typeof text === 'function' ? text() : text), value => {
    if (el.textContent !== value) el.textContent = value // the one DOM write per change
  })
  host.el.append(el)

  if (ctx) {
    fallback()
    watchFonts()
    const ready = () => {
      live.prepare()
      if (!handle) return
      host.invalidate()
      if (DEV) inspect(el, font, read().exact)
      document.fonts?.load?.(font).then(() => { if (font && !laid) host.invalidate() }, () => {})
    }
    const changed = new MutationObserver(() => { live.prepare(); host.invalidate() }) // a write of ours, or a translator's
    changed.observe(el, { childList: true, characterData: true, subtree: true })
    onCleanup(() => changed.disconnect())
    loadMeasure().then(p => {
      provider = p
      if (nodes.has(live)) ready()
    }, error => console.error(error))
  } else if (DEV) inspect(el, fontOf(getComputedStyle(el)), true)

  const paint = () => {
    if (!handle || !provider || !ctx || plain?.matches) return
    const o = read()
    if (laid !== handle || laidWidth !== o.width) {
      const h = handle, p = provider
      laid = h
      laidWidth = o.width
      lines = p.lines(h, o.width).map(l => ({ text: p.lineText(h, l), width: l.width }))
      lineCount.value = lines.length
      height.value = lines.length * leading
      if (DEV && h.exact && !o.exact) {
        const drawn = el.getBoundingClientRect().height
        if (drawn && Math.abs(drawn - height.value) > 1) warn('X001', `s.text() predicted ${height.value} px (${lines.length} lines) and the mirror renders ${drawn} px: \`font\`, \`lineHeight\` or \`width\` differs from the CSS on the mirror (font \`${font}\`, line height ${leading}px, width ${o.width}px).`)
      }
    }
    ctx.font = font
    ctx.fillStyle = color
    ctx.textBaseline = 'alphabetic'
    const m = ctx.measureText('')
    const ascent = m.fontBoundingBoxAscent ?? 0, descent = m.fontBoundingBoxDescent ?? 0
    const top = o.y + (leading - ascent - descent) / 2 + ascent // CSS half-leading, so canvas and mirror share a baseline
    lines.forEach((line, i) => {
      const at = o.align === 'center' ? (o.width - line.width) / 2 : o.align === 'right' ? o.width - line.width : 0
      ctx.fillText(line.text, o.x + at, top + i * leading)
    })
  }

  return { el, lineCount, height, paint }
}
