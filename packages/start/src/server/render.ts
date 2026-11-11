import type { RoutePayload } from '../router'
import { firstPaint } from '../first-paint'
import { pick } from '../sheets.mjs'
import type { HandlerOptions } from './types'
import { esc, hash } from './text'

/**
 * A page's styles from the build's first-paint table (`firstPaint`): the rules its HTML reaches, inline, and its sheets as
 * links past the shell, where they hold nothing above it. `late` gives a streamed chunk the rules it adds, and a link for
 * a sheet none of the page's has: an island in a Boundary the shell didn't show.
 */
export function tableStyles(
  pieces: NonNullable<NonNullable<HandlerOptions['assets']>['pieces']>,
  css: { href: string }[],
  siteHead: string | undefined,
  lang: string,
) {
  const hrefs = css.map((c) => c.href)
  const late = pick(pieces, hrefs)
  const paint = firstPaint(pieces, hrefs, siteHead)
  const held: string[] = late.sheets.flatMap((c: { has: string[] }) => c.has)
  const carried = new Set([...hrefs, ...held])
  const link = (href: string) => `<link rel="stylesheet" href="${esc(href)}">\n`
  return {
    rules: (shell: string) => paint(`<html${lang}><body><div id="app">${shell}`),
    // A combined sheet's parts as disabled links: Vite's preload helper finds them there and doesn't fetch them again.
    links:
      [...late.sheets.map((c: { href: string }) => c.href), ...late.rest].map(link).join('') +
      held.map((href) => `<link rel="stylesheet" href="${esc(href)}" disabled>\n`).join(''),
    late(sheets: { href: string }[] = [], chunk = '') {
      const more = sheets.map((c) => c.href).filter((h) => !carried.has(h))
      for (const h of more) carried.add(h)
      const rules = paint(chunk)
      return more.map(link).join('') + (rules ? `<style>${rules}</style>\n` : '')
    },
  }
}

/**
 * The payload with its static levels marked: their hash, without their data (the HTML holds it), and with `html` their
 * HTML, each level's next one cut down to its markers. The `aria-current` a navigation moves doesn't count as a change.
 */
/**
 * The chunks `payload`'s page will want: its non-static levels and the islands that load with it, and `fold`, the lazy
 * ones in the first view. Those stay preloaded, fetched but not run, so a first click on them doesn't wait; the rest
 * load when they're needed. `$client`: the router and runtime, whenever any of that will run.
 */
export const pageChunks = (
  payload: RoutePayload,
  chunks: HandlerOptions['chunks'] = {},
  fold: string[] = [],
  now = true,
) => {
  const ids = [...payload.m.filter((m) => !m.s).map((m) => m.id), ...(payload.i ?? []), ...fold]
  return [...(now || ids.length ? ['$client'] : []), ...ids].flatMap((id) => chunks[id]?.js ?? [])
}

/**
 * The route's stylesheets and those of every island on the page. An island is a dynamic import, so its CSS is not in the
 * route's chunk graph; without this the server's HTML paints bare and the sheets arrive with the script.
 */
export const pageSheets = (
  css: { href: string }[] = [],
  parts: { now: string[]; lazy: string[]; fold: string[] },
  chunks: HandlerOptions['chunks'] = {},
) => {
  const found = [...parts.now, ...parts.lazy, ...parts.fold].flatMap((id) => chunks[id]?.css ?? [])
  return [...new Map([...css, ...found].map((c) => [c.href, c])).values()]
}

export const saveData = (request: Request) =>
  request.headers.get('save-data') === 'on' ||
  request.headers.get('sec-ch-prefers-reduced-data') === 'reduce'

/** Where the first view ends, in px: past most laptops' and phones' first screen. */
const FOLD = 900

/**
 * About how far down the page `html` runs out, in px. The server has no layout, so this counts what makes a page tall:
 * blocks, and lines of their text. A wrong guess costs one chunk's fetch, either way: it's a preload, not a decision.
 */
function depth(html: string) {
  const plain = html.replace(/<(svg|style|template)\b[\s\S]*?<\/\1>|<!--[\s\S]*?-->/g, '')
  const blocks =
    plain.match(
      /<(?:section|article|header|footer|h[1-6]|p|li|tr|img|form|pre|blockquote|video|figure)\b/g,
    )?.length ?? 0
  return blocks * 32 + (plain.replace(/<[^>]*>/g, '').length / 60) * 24
}

/** What a page's HTML says about its islands: those that load with it, those that wait, and the waiting ones in view. */
export function islandsOf(html: string) {
  const known = renderedOf(html)
  if (known.p) return known.p
  const parts = { now: [] as string[], lazy: [] as string[], fold: [] as string[] }
  let past = false
  for (const m of html.matchAll(/<!--wi:(\[.*?\])-->/g)) {
    const [id, , , when] = JSON.parse(m[1]!) as [string, string, unknown[], string?]
    const list = when ? parts.lazy : parts.now
    if (!list.includes(id)) list.push(id)
    past ||= depth(html.slice(0, m.index)) >= FOLD
    if (when && !past && !parts.fold.includes(id)) parts.fold.push(id)
  }
  return (known.p = parts)
}

export function modulepreloads(
  chunks: { href: string }[],
  assets: NonNullable<HandlerOptions['assets']>,
) {
  const hrefs = new Set(chunks.map((c) => c.href))
  hrefs.delete(assets.entry!)
  return [...hrefs].map((href) => `<link rel="modulepreload" href="${esc(href)}">`).join('')
}

/** What a render's HTML says about its levels, worked out as asked and kept by the exact text. */
interface Rendered {
  h: Record<number, string>
  x: Record<number, string>
  p?: { now: string[]; lazy: string[]; fold: string[] }
}
const RENDERED_MAX = 64
const rendered = new Map<string, Rendered>()

function renderedOf(html: string) {
  let r = rendered.get(html)
  if (!r) {
    if (rendered.size >= RENDERED_MAX) rendered.clear()
    rendered.set(html, (r = { h: {}, x: {} }))
  }
  return r
}

/** A static level's HTML minus what its islands render: they refresh their own data, so a change there isn't the level's. */
export function outsideIslands(h: string) {
  let out = '',
    at = 0
  for (;;) {
    const i = h.indexOf('<!--wi:', at)
    if (i < 0) return out + h.slice(at)
    const open = h.indexOf('-->', i) + 3
    out += h.slice(at, open)
    at = open
    if (!h.startsWith('<!--[-->', open)) continue
    let nest = 0,
      j = open
    for (;;) {
      const a = h.indexOf('<!--[-->', j),
        b = h.indexOf('<!--]-->', j)
      if (b < 0) return out + h.slice(at)
      if (a >= 0 && a < b) {
        nest++
        j = a + 8
      } else {
        nest--
        j = b + 8
        if (!nest) break
      }
    }
    at = j
  }
}

export function withLevels(
  payload: RoutePayload,
  html: string,
  statics: Set<string>,
  sendHtml: boolean,
): RoutePayload {
  if (!payload.m.some((m) => statics.has(m.id))) return payload
  const known = renderedOf(html)
  const slice = (d: number) => {
    const open = html.indexOf(`<!--wl:${d}:`)
    const end = `<!--/wl:${d}-->`
    const close = html.indexOf(end)
    if (open < 0 || close < 0) return ''
    const body = html.slice(html.indexOf('-->', open) + 3, close)
    const kid = body.indexOf(`<!--wl:${d + 1}:`)
    const tail = body.indexOf(`<!--/wl:${d + 1}-->`)
    return kid < 0 || tail < 0
      ? body
      : body.slice(0, body.indexOf('-->', kid) + 3) + body.slice(tail)
  }
  const m = payload.m.map((lv, d) => {
    if (!statics.has(lv.id)) return lv
    const { data: _, ...rest } = lv
    const h = (known.h[d] ??= slice(d))
    return {
      ...rest,
      s: 1 as const,
      x: (known.x[d] ??= hash(outsideIslands(h).replaceAll(' aria-current="page"', ''))),
      ...(sendHtml && { h }),
    }
  })
  const i = islandsOf(html).now
  return { ...payload, m, ...(i.length && { i }) }
}
