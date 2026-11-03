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

// What the shell has, however its markup is quoted.
const ATTR = /\b(data-[\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/gi
const CLASS = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/gi
const PROP = /--[A-Za-z_][\w-]*/g
// What a selector asks for. An attribute selector goes first and whole, or `[href$=".pdf"]` reads as a class.
const SELECTOR_WORD = /\[\s*([\w-]+)\s*(?:([~|^$*]?=)\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^\s\]]+))\s*(\w)?\s*)?\]|\.((?:[\w-]|[^\0-\x7f]|\\.)+)/g
// A reference the shell's text can't be compared with, so nothing is ruled out on its value.
const ENTITY = /&(?!(?:amp|quot|lt|gt);)/
const ANY_VALUE = '=*'
// Set on <html> by a script or `setDial`, so the server's HTML can't vouch for them.
const ROOT_ATTR = /^data-(?:theme|expression|density|form|pointer|motion|flair|fields|warp|scope)$/
// `dialScript` restores these before the first paint, so the server's HTML doesn't show their values.
const DIAL = /^data-(?:theme|expression|density|form|pointer|motion|flair|fields)$/
// Rules that can't paint until someone acts, so the late sheet is soon enough for them. A state the server can render
// (`:checked`, `aria-checked`, `:disabled`) has to stay.
const LATER = /:(?:hover|active|focus|focus-visible|focus-within|popover-open|modal)\b|::(?:backdrop|selection)/
const PRINT = /^@media\s+print\s*(?:and\b[^,]*)?$/i
const FORCED_COLORS = /^@media\s*\(\s*forced-colors\s*:\s*active\s*\)\s*(?:and\b[^,]*)?$/i
const GROUPING = /^@(?:media|supports|layer|container|scope|starting-style)\b/

const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const print = nodes => nodes.map(n => (n.body === undefined ? `${n.head};` : `${n.head}{${n.body}}`)).join('')

/** Calls `visit` at each top-level comma and bracket of `text` from `from`, skipping strings, and stops at the end of the bracket it began in. */
function scan(text, from, visit) {
  let depth = 0, quote = ''
  for (let i = from; i < text.length; i++) {
    const c = text[i]
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue }
    if (c === '"' || c === "'") quote = c
    else if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') { if (--depth < 0) return i }
    else if (c === ',' && !depth) visit(i)
  }
  return text.length
}

function selectors(head) {
  const out = []
  let from = 0
  scan(head, 0, i => { out.push(head.slice(from, i)); from = i + 1 })
  out.push(head.slice(from))
  return out
}

/** A selector with what proves nothing removed: `:not()`, and `:is()`, `:where()` or `:has()` holding alternatives. */
function required(selector) {
  let rest = selector
  for (;;) {
    const m = /:(not|is|where|has)\(/.exec(rest)
    if (!m) return rest
    const open = m.index + m[0].length
    let comma = false
    const end = scan(rest, open, () => { comma = true })
    rest = rest.slice(0, m.index) + (m[1] === 'not' || comma ? '' : ` ${rest.slice(open, end)} `) + rest.slice(end + 1)
  }
}

/**
 * What a selector needs the shell to have: `data-x` and `.class`, and a value for a plain `=` on a plain word. An
 * operator, a flag, a value with a space or an escape can match text the shell's words don't show, so only the name counts.
 */
function* demands(selector) {
  for (const m of selector.matchAll(SELECTOR_WORD)) {
    if (m[7]) {
      if (!/\\[\da-f]/i.test(m[7])) yield `.${m[7].replace(/\\(.)/g, '$1')}`
      continue
    }
    const name = m[1].toLowerCase()
    if (!name.startsWith('data-')) continue
    yield name
    const value = m[3] ?? m[4] ?? m[5]
    if (m[2] === '=' && !m[6] && /^[\w-]+$/.test(value)) yield { value }
  }
}

const ROOTED = /^\s*(?::root|html|body)\b/

/** Can the shell match this, going by the attributes, their values and the classes it has? Anything else stays. */
function present(rest, found) {
  if (ROOTED.test(rest)) return true
  let root = false
  for (const d of demands(rest)) {
    if (typeof d === 'string') {
      root = ROOT_ATTR.test(d)
      if (!root && !found.has(d)) return false
    } else if (!root && !found.has(ANY_VALUE) && !found.has(d.value)) return false
  }
  return true
}

/** Could this paint before anyone acts, on the shell the server sent? */
function paints(selector, found) {
  const rest = required(selector)
  return !LATER.test(rest.replace(/\[[^\]]*\]/g, '')) && present(rest, found)
}

/** A sheet without what can't show in the first paint. */
function firstPaint(css, parse, found) {
  const walk = source => print(parse(source).flatMap(n => {
    if (n.body === undefined) return [n]
    if (PRINT.test(n.head) || FORCED_COLORS.test(n.head)) return []
    if (GROUPING.test(n.head)) {
      const body = walk(n.body)
      return body ? [{ head: n.head, body }] : []
    }
    if (n.head[0] === '@') return [n]
    const kept = selectors(n.head).filter(s => paints(s, found))
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
    words.dials = []
    for (const s of sheets) {
      let name
      for (const d of demands(s.css)) {
        words.add(d.value ?? d)
        if (typeof d === 'string') name = d
        else if (DIAL.test(name)) words.dials.push(d.value)
      }
      for (const m of s.css.matchAll(PROP)) words.add(m[0])
    }
    if (vocabularies.size >= CRITICAL_MAX) vocabularies.delete(vocabularies.keys().next().value)
    vocabularies.set(id, words)
  }
  return words
}

/** Adds to `found` what these sources have of the sheets' words. */
function read(sources, known, found) {
  const see = w => { if (known.has(w)) found.add(w) }
  const once = (seen, value) => !seen.has(value) && !!seen.add(value) // a page of rows repeats a few values thousands of times
  const names = new Set(), values = new Set(), classes = new Set()
  for (const source of sources) {
    for (const m of source.matchAll(ATTR)) {
      if (once(names, m[1])) see(m[1].toLowerCase())
      const value = m[2] ?? m[3] ?? m[4]
      if (!value || !once(values, value)) continue
      if (ENTITY.test(value)) found.add(ANY_VALUE)
      for (const w of value.split(/\s+/)) see(w)
    }
    for (const m of source.matchAll(CLASS)) {
      const value = m[1] ?? m[2] ?? m[3]
      if (!once(classes, value)) continue
      if (ENTITY.test(value)) found.add(ANY_VALUE)
      for (const w of value.split(/\s+/)) see(`.${w}`)
    }
    for (const m of source.matchAll(PROP)) see(m[0])
  }
  return found
}

/** The rules `found` reaches in these sheets. Kept by the page's shape, not its text, so rows don't miss it. */
function criticalCss(sheets, found, { parse, purge }) {
  const key = `${sheets.map(s => s.href).join()}|${[...found].sort().join()}`
  let css = critical.get(key)
  if (css === undefined) {
    // Keeps a value the shell's words can't vouch for, as firstPaint does.
    const has = w => found.has(w) || found.has(ANY_VALUE) || !/^-{0,2}[\w-]+$/.test(w)
    css = usedFaces(purge(sheets.map(s => firstPaint(s.css, parse, found)), { has }).join(''), parse)
    if (critical.size >= CRITICAL_MAX) critical.delete(critical.keys().next().value)
    critical.set(key, css)
  }
  return css
}

/** A stylesheet's short id. The browser runs this same function (`LATE_SHEETS`), so both sides agree. */
export function sheetId(href) {
  var x = 2166136261
  for (var i = 0; i < href.length; i++) x = Math.imul(x ^ href.charCodeAt(i), 16777619)
  return (x >>> 0).toString(36)
}

/**
 * Browser: lists the stylesheets it now has, by `sheetId`, in the `weft-css` cookie (the latest 32). A page whose sheets
 * are all there is sent links, not rules to paint with first (`pageStyles`). Sent as its source, so it reads nothing else.
 */
function keepSheets(id) {
  var c = document.cookie.match(/(?:^|; )weft-css=([^;]*)/), s = c ? c[1].split('.') : []
  document.querySelectorAll('link[rel=stylesheet]').forEach(function (l) {
    var x = l.sheet && id(l.getAttribute('href'))
    if (x && s.indexOf(x) < 0) s.push(x)
  })
  document.cookie = 'weft-css=' + s.slice(-32).join('.') + ';path=/;max-age=31536000;samesite=lax'
}

/** The sheet ids the request's `weft-css` cookie lists. */
export function keptSheets(cookie) {
  const m = cookie && /(?:^|;\s*)weft-css=([^;]*)/.exec(cookie)
  return m ? new Set(m[1].split('.')) : undefined
}

/**
 * Switches on the head's deferred sheets once they're all here, or after 3s without the one that failed. One at a time,
 * each is a restyle of the whole page, and 20 of them cost a table of 50 rows more than all its script.
 */
export const LATE_SHEETS = `(a=>Promise.race([Promise.all(a.map(l=>l.sheet||new Promise(r=>{l.addEventListener('load',r);l.addEventListener('error',r)}))),new Promise(r=>setTimeout(r,3e3))]).then(()=>{a.forEach(l=>l.media='all');(${keepSheets})(${sheetId})}))([...document.querySelectorAll('link[data-late]')])`
/** The client entry's second chance: a `<style>` a CSP refused has no sheet, so the disabled link beside it is all that's left. */
export const REFUSED_SHEETS = `document.querySelectorAll('style+link[disabled]').forEach(l=>{l.previousElementSibling.sheet||(l.disabled=false)})`
// Put the `<style>` before this script in front of the head's first link.
const MOVE = `(s=>{var d=document,l=d.head.querySelector('link[rel=stylesheet]');l&&l.before(s)})(document.currentScript.previousElementSibling)`
const blocking = href => `<link rel="stylesheet" href="${esc(href)}">\n`

/**
 * `assets.inline` is `{ href: css }`, and `assets.critical` weft's `{ parse, purge }` (none in dev). Returns the head's
 * stylesheets, and `late(sheets, chunk)`: what a streamed chunk needs in front of it. A parser-inserted link holds all
 * that follows until it loads, so a sheet the head has already asked for is never one: the chunk brings the rules its own
 * HTML reaches, and they move in front of those sheets, which have to keep winning once they load. A sheet the head
 * lacks can only be a link, and its Boundary swaps once it's here. `seen`: an earlier render's `{ split, found }`, for a head
 * sent before this page's HTML exists; its `late` then brings what the HTML has beyond that. `have`: the sheet ids the
 * browser says it has (`keptSheets`). With all of the page's, it gets links (`links`): nothing to inline, or to look for.
 */
export function pageStyles(assets, css = [], html = '', head, seen, have) {
  const first = `<style>${LAYER_ORDER}</style>\n`
  if (have && css.length && css.every(c => have.has(sheetId(c.href)))) {
    const carried = new Set(css.map(c => c.href))
    return {
      head: first + css.map(c => blocking(c.href)).join(''),
      split: false,
      links: true,
      found: () => new Set(),
      late(sheets = []) {
        const hrefs = sheets.map(s => s.href).filter(h => !carried.has(h))
        for (const h of hrefs) carried.add(h)
        return hrefs.map(blocking).join('')
      },
    }
  }
  const inline = css.filter(c => assets.inline?.[c.href] !== undefined).map(c => ({ href: c.href, css: assets.inline[c.href] }))
  const raw = inline.reduce((n, s) => n + s.css.length, 0)
  const split = seen ? seen.split : !!assets.critical && inline.length > 0 && raw / CSS_RATIO + (html.length + (head?.length ?? 0)) / HTML_RATIO > FIRST_PAINT_BYTES
  const carried = new Set(css.map(c => c.href))
  const known = split && vocabulary(inline, inline.map(s => s.href).join())
  let sent = split && (seen ? new Set(seen.found) : read([html, head ?? ''], known, new Set(head?.includes('warp:dials') ? known.dials : [])))
  const tags = split
    ? `<style>${criticalCss(inline, sent, assets.critical)}</style>\n` + css.map(c => assets.inline?.[c.href] === undefined ? blocking(c.href) : `<link rel="stylesheet" href="${esc(c.href)}" media="print" data-late>`).join('') +
      `<noscript>${inline.map(s => blocking(s.href).trim()).join('')}</noscript>\n<script>${LATE_SHEETS}</script>\n`
    : css.map(c => assets.inline?.[c.href] === undefined ? blocking(c.href) : `<style>${assets.inline[c.href]}</style>\n<link rel="stylesheet" href="${esc(c.href)}" disabled>\n`).join('')
  return {
    head: first + tags,
    split,
    links: false,
    /** The words the page's rules have reached so far. */
    found: () => sent || new Set(),
    late(sheets = [], chunk = '') {
      const hrefs = sheets.map(s => s.href).filter(h => !carried.has(h))
      for (const h of hrefs) carried.add(h)
      const links = hrefs.map(blocking).join('')
      if (!split) return links
      const found = read([chunk], known, new Set(sent))
      if (found.size === sent.size) return links
      // All of them, repeats too: warp's rules weigh nothing, so order decides, and new ones alone would land after the head's.
      const rules = criticalCss(inline, found, assets.critical)
      sent = found
      return links + (rules && `<style>${rules}</style><script>${MOVE}</script>\n`)
    },
  }
}
