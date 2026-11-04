// What a page's HTML says about itself (research 20 §10): the automatic layer under route `meta`. A route that sets no
// title gets its `h1`, one that sets no description gets its first real paragraph, cleaned and cut at a sentence. Pure
// functions on a string, server-side only: `weft check` runs the same `descriptionProblem` on what a route wrote.

const SKIP = new Set([
  'script',
  'style',
  'template',
  'noscript',
  'svg',
  'math',
  'nav',
  'aside',
  'footer',
  'pre',
  'figure',
  'table',
  'ul',
  'ol',
  'dl',
  'details',
  'button',
  'select',
  'textarea',
  'form',
  'dialog',
  'iframe',
  'canvas',
  'object',
])
const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
])
const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  middot: '·',
  copy: '©',
  reg: '®',
  trade: '™',
  times: '×',
  rarr: '→',
  larr: '←',
}

/** `&amp;`, `&#39;`, `&#x27;` → their characters. An unknown name stays as written. */
export const decode = (text) =>
  text.replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, (all, e) => {
    if (e[0] !== '#') return ENTITIES[e] ?? all
    const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ''
  })

/** One line of plain text: whitespace collapsed, no list marker in front, no space before punctuation. */
export const cleanText = (text) =>
  text
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?)])(?=\s|$)/g, '$1')
    .trim()
    .replace(/^(?:[-*•‣–—]\s+|\d{1,3}[.)]\s+)+/, '')

/** Not the end of a sentence, though it ends in a full stop. */
const ABBREVIATION = /(?:^|[\s(])(?:e\.g|i\.e|etc|vs|cf|approx|no|fig|[A-Z])\.$/

/**
 * At most `max` characters: whole sentences when the first ones fit (past a third of `max`, so one short sentence
 * isn't all that's left), else whole words and an ellipsis. Never cuts inside a word.
 */
export function truncate(text, max = 155) {
  if (text.length <= max) return text
  const head = text.slice(0, max + 1)
  let end = -1
  for (const m of head.matchAll(/[.!?…]["'”’)]?(?=\s)/g)) {
    const at = m.index + m[0].length
    if (at >= max / 3 && at <= max && !ABBREVIATION.test(head.slice(0, at))) end = at
  }
  if (end > 0) return head.slice(0, end)
  const cut = head.slice(0, max).replace(/\s+\S*$/, '')
  return cut.replace(/[\s,;:(–—-]+$/, '') + '…'
}

/** `undefined`, or why this text isn't a description a person would read: markup, code, a list item or a fragment. */
export function descriptionProblem(text) {
  const s = text.trim()
  if (/^(?:[-*•+]\s|\d{1,3}[.)]\s|#{1,6}\s|>\s)/.test(s))
    return 'it starts with a markdown list marker or heading'
  if (/<\/?[a-z][^>]*>?|\/>|=>|\w\(\)|[{}]|`|\]\(|\bx = </i.test(s))
    return 'it holds code or markup'
  if ((s.match(/[<>=;$[\]{}()|\\]/g)?.length ?? 0) / Math.max(s.length, 1) > 0.05)
    return 'it is mostly symbols, which reads as code'
  if (/\s[.,;:!?)](?=\s|$)/.test(s))
    return 'it has a space before punctuation, the mark of inline code that was stripped out'
  if (s.length && !/[.!?…"'”’)]$/.test(s) && s.length > 100) return 'it stops mid-sentence'
  if (/^[a-z]/.test(s) && !/^[a-z][\w.-]*[A-Z@/:]|^[a-z]+:/.test(s))
    return 'it starts in lower case, like a fragment of a longer sentence'
  return undefined
}

/** A paragraph worth quoting: prose of some length, with no code in it. */
const prose = (text) =>
  text.length >= 40 && text.includes(' ') && !descriptionProblem(truncate(text))

function tokens(html) {
  const out = []
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g
  let at = 0
  for (let m; (m = re.exec(html)); at = re.lastIndex) {
    if (m.index > at) out.push({ text: html.slice(at, m.index) })
    if (m[2]) out.push({ close: !!m[1], tag: m[2].toLowerCase(), attrs: m[3] })
  }
  if (at < html.length) out.push({ text: html.slice(at) })
  return out
}

const hidden = (attrs) => /\s(?:hidden|aria-hidden=(?:"true"|'true'|true))(?:[\s/]|$)/.test(attrs)

/**
 * The page's own words: `{ title, description }`, either missing when the page doesn't have one. Reads `<main>` when
 * there is one, so a header or a footer in a layout can't speak for the page. The title is the `h1`, or with none the
 * first `h2` or `h3`; the description is the first paragraph after the `h1` that reads as prose.
 */
export function pageText(html) {
  const open = /<main\b/i.exec(html)
  const end = html.toLowerCase().lastIndexOf('</main>')
  const region = open ? html.slice(open.index, end > open.index ? end : undefined) : html
  let title,
    heading,
    description,
    skip,
    grab,
    buffer = ''
  const done = (t) => {
    const text = cleanText(decode(buffer))
    grab = undefined
    if (t === 'p') {
      if (prose(text)) description ??= truncate(text)
    } else if (t !== 'h1') heading ??= text || undefined
    else if (text && !title) {
      title = text
      description = undefined
    } // the description is what follows the title
  }
  for (const t of tokens(region)) {
    if (skip) {
      if (t.tag === skip.tag && !VOID.has(t.tag) && !/\/\s*$/.test(t.attrs ?? ''))
        skip.depth += t.close ? -1 : 1
      if (!skip.depth) skip = undefined
      continue
    }
    if (t.text !== undefined) {
      if (grab) buffer += t.text
      continue
    }
    if (
      !t.close &&
      (SKIP.has(t.tag) || hidden(t.attrs)) &&
      !VOID.has(t.tag) &&
      !/\/\s*$/.test(t.attrs)
    ) {
      skip = { tag: t.tag, depth: 1 }
      continue
    }
    if (grab) {
      if (t.close && t.tag === grab) done(t.tag)
      else if (t.tag === 'br') buffer += ' '
      continue
    }
    if (!t.close && /^(?:h1|h2|h3|p)$/.test(t.tag)) {
      grab = t.tag
      buffer = ''
    }
    if (title && description) break
  }
  return { title: title ?? heading, description }
}

/**
 * The site's public origin, when something says what it is: `site.url`, `WEFT_SITE_URL`, or what the host sets on a
 * deploy. No request is involved, so the answer can be trusted and written into a page a CDN keeps.
 */
export function deployUrl(site, env = {}) {
  if (site?.url) return site.url
  const https = (host) => host && `https://${host}`
  return (
    env.WEFT_SITE_URL ||
    https(env.VERCEL_PROJECT_PRODUCTION_URL) ||
    https(env.VERCEL_URL) ||
    env.URL || // Netlify
    env.CF_PAGES_URL ||
    env.RENDER_EXTERNAL_URL ||
    https(env.RAILWAY_PUBLIC_DOMAIN) ||
    (env.FLY_APP_NAME && `https://${env.FLY_APP_NAME}.fly.dev`) ||
    undefined
  )
}

/** The built-in card's title size: bigger type for a shorter title. */
export const cardTitleSize = (title) =>
  title.length <= 24 ? 92 : title.length <= 44 ? 76 : title.length <= 70 ? 62 : 52

/** `paths` in pages that each fit in a response header, with room for the link to the next page. */
export function pathPages(paths, max = 6000) {
  const pages = [[]]
  let size = 0
  for (const p of paths) {
    if (size + p.length + 1 > max) {
      pages.push([])
      size = 0
    }
    pages.at(-1).push(p)
    size += p.length + 1
  }
  return pages
}
