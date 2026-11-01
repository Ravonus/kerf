// A page's stylesheets. All of them inline while the document fits the first flight; past that, the rules the server's
// HTML can reach, with every sheet behind them as an immutable link that doesn't hold the paint.

/**
 * The one order every app shares. Layers rank by first appearance, so this goes before any sheet: warp's own too, or the
 * order would follow whichever component's sheet a page lists first.
 */
export const LAYER_ORDER = '@layer warp,app,theme,base,components,utilities;@layer warp.tokens,warp.base,warp.signature,warp.layout,warp.components,warp.inputs,warp.inputs-rich,warp.data,warp.app,warp.flows,warp.marketing,warp.canvas;'
/** Head plus shell, in compressed bytes: about what a first flight carries, less headers and TLS. */
export const FIRST_PAINT_BYTES = 12 * 1024
/** Compression at the server's brotli 5, measured on built warp pages (5.9 to 6.2 for CSS, 3.7 to 4 for HTML). */
const CSS_RATIO = 6
const HTML_RATIO = 4
const CRITICAL_MAX = 64

const ATTR = /\b(data-[\w-]+)(?:="([^"]*)")?/g
const CLASS = /\bclass="([^"]*)"/g
const PROP = /--[A-Za-z_][\w-]*/g
const SHEET_WORD = /\[(data-[\w-]+)(?:[~|^$*]?=["']?([^\]"']+))?|\.(-?[_a-zA-Z][\w-]*)/g
// Set on <html> by a script or `setDial`, so the server's HTML can't vouch for them.
const ROOT_ATTR = /^data-(?:theme|expression|density|form|pointer|motion|flair|fields|warp|scope)$/
// `dialScript` restores these before the first paint, so the server's HTML doesn't show them.
const DIALS = 'quiet balanced vivid floating classic compact cozy comfortable sweep none'.split(' ')
// Rules that can't paint until someone acts, so the late sheet is soon enough for them. A state the server can render
// (`:checked`, `aria-checked`, `:disabled`) has to stay.
const LATER = /:(?:hover|active|focus|focus-visible|focus-within|popover-open|modal)\b|::(?:backdrop|selection)/
const GROUPING = /^@(?:media|supports|layer|container|scope|starting-style)\b/

const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const print = nodes => nodes.map(n => (n.body === undefined ? `${n.head};` : `${n.head}{${n.body}}`)).join('')

function selectors(head) {
  const out = []
  let depth = 0, from = 0
  for (let i = 0; i < head.length; i++) {
    const c = head[i]
    if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    else if (c === ',' && !depth) { out.push(head.slice(from, i)); from = i + 1 }
  }
  out.push(head.slice(from))
  return out
}

/** A selector with what proves nothing removed: `:not()`, and `:is()`, `:where()` or `:has()` holding alternatives. */
function required(selector) {
  let rest = selector
  for (;;) {
    const m = /:(not|is|where|has)\(/.exec(rest)
    if (!m) return rest
    let depth = 1, comma = false, i = m.index + m[0].length
    for (; i < rest.length && depth; i++) {
      if (rest[i] === '(') depth++
      else if (rest[i] === ')') depth--
      else if (rest[i] === ',' && depth === 1) comma = true
    }
    const inner = rest.slice(m.index + m[0].length, i - 1)
    rest = rest.slice(0, m.index) + (m[1] === 'not' || comma ? '' : ` ${inner} `) + rest.slice(i)
  }
}

/** Can the shell match this, going by the attributes, their values and the classes it has? Anything else stays. */
function present(selector, found) {
  const rest = required(selector)
  if (/^\s*(?::root|html|body)\b/.test(rest)) return true
  for (const m of rest.matchAll(SHEET_WORD)) {
    if (m[3] ? !found.has(`.${m[3]}`) : !ROOT_ATTR.test(m[1]) && (!found.has(m[1]) || (m[2] && !found.has(m[2])))) return false
  }
  return true
}

/** A sheet without what can't show in the first paint. */
function firstPaint(css, parse, found) {
  const walk = source => print(parse(source).flatMap(n => {
    if (n.body === undefined) return [n]
    if (/^@media\s+(?:print|\(forced-colors)/.test(n.head)) return []
    if (GROUPING.test(n.head)) {
      const body = walk(n.body)
      return body ? [{ head: n.head, body }] : []
    }
    if (n.head[0] === '@') return [n]
    const kept = selectors(n.head).filter(s => !LATER.test(s) && present(s, found))
    return kept.length ? [{ head: kept.join(','), body: n.body }] : []
  }))
  return walk(css)
}

/** `@font-face` rules no remaining rule names: warp's metric fallbacks for families this page doesn't set. */
function usedFaces(css, parse) {
  const rest = print(parse(css).filter(n => !n.head.startsWith('@font-face')))
  return print(parse(css).filter(n => {
    if (!n.head.startsWith('@font-face')) return true
    const family = /font-family:\s*["']?([^"';}]+)/.exec(n.body)?.[1]
    return !family || rest.includes(family)
  }))
}

const critical = new Map()
const vocabularies = new Map()

/** Every attribute, value and class the sheets name: only these can change a page's rules, so only they key the cache. */
function vocabulary(sheets, id) {
  let words = vocabularies.get(id)
  if (!words) {
    words = new Set()
    for (const s of sheets) {
      for (const m of s.css.matchAll(SHEET_WORD)) m[3] ? words.add(`.${m[3]}`) : (words.add(m[1]), m[2] && words.add(m[2]))
    }
    if (vocabularies.size >= CRITICAL_MAX) vocabularies.delete(vocabularies.keys().next().value)
    vocabularies.set(id, words)
  }
  return words
}

/** The rules these words can reach in these sheets. Kept by the page's shape, not its text, so rows don't miss it. */
function criticalCss(sheets, html, head, { parse, purge }) {
  const id = sheets.map(s => s.href).join()
  const known = vocabulary(sheets, id)
  const found = new Set(head?.includes('warp:dials') ? DIALS : [])
  const see = w => { if (known.has(w)) found.add(w) }
  for (const source of [html, head ?? '']) {
    for (const m of source.matchAll(ATTR)) {
      see(m[1])
      if (m[2]) for (const w of m[2].split(/\s+/)) see(w)
    }
    for (const m of source.matchAll(CLASS)) for (const w of m[1].split(/\s+/)) see(`.${w}`)
    for (const m of source.matchAll(PROP)) found.add(m[0])
  }
  const key = `${id}|${[...found].sort().join()}`
  let css = critical.get(key)
  if (css === undefined) {
    css = usedFaces(purge(sheets.map(s => firstPaint(s.css, parse, found)), { has: w => found.has(w) }).join(''), parse)
    if (critical.size >= CRITICAL_MAX) critical.delete(critical.keys().next().value)
    critical.set(key, css)
  }
  return css
}

const blocking = href => `<link rel="stylesheet" href="${esc(href)}">\n`

/**
 * `assets.inline` is `{ href: css }`, and `assets.critical` weft's `{ parse, purge }` (none in dev). Returns the head's
 * stylesheets, and `late(hrefs)`: the links a streamed chunk needs in front of it. A parser-inserted link holds the inline
 * script after it, so a Boundary swaps only once its styles are here.
 */
export function pageStyles(assets, css = [], html = '', head) {
  const first = `<style>${LAYER_ORDER}</style>\n`
  const inline = css.filter(c => assets.inline?.[c.href] !== undefined).map(c => ({ href: c.href, css: assets.inline[c.href] }))
  const raw = inline.reduce((n, s) => n + s.css.length, 0)
  const split = !!assets.critical && inline.length > 0 && raw / CSS_RATIO + html.length / HTML_RATIO > FIRST_PAINT_BYTES
  const carried = new Set(css.map(c => c.href))
  const deferred = split ? inline.map(s => s.href) : []
  const tags = split
    ? `<style>${criticalCss(inline, html, head, assets.critical)}</style>\n` + css.map(c =>
      assets.inline?.[c.href] === undefined ? blocking(c.href) : `<link rel="stylesheet" href="${esc(c.href)}" media="print" onload="this.media='all'">\n<noscript>${blocking(c.href).trim()}</noscript>\n`).join('')
    : css.map(c => assets.inline?.[c.href] === undefined ? blocking(c.href) : `<style>${assets.inline[c.href]}</style>\n<link rel="stylesheet" href="${esc(c.href)}" disabled>\n`).join('')
  return {
    head: first + tags,
    late(sheets = []) {
      const hrefs = [...deferred.splice(0), ...sheets.map(s => s.href).filter(h => !carried.has(h))]
      for (const h of hrefs) carried.add(h)
      return hrefs.map(blocking).join('')
    },
  }
}
