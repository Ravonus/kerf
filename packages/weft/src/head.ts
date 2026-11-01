// Page metadata (research 20). Metadata is plain data, merged once per request and written as static tags at the
// top of `<head>` in the server's first response: link-preview crawlers don't run JS (§1). Nothing here is
// reactive, and components can't add to it. `mergeMeta` and `metaTags` are server-side (exported from weft/ssr);
// `headTags` is the pure tag list both the string writer and the client's `setHead` (weft/head) use.

/** `site` in weft.config.ts: the defaults every page starts from (§2). */
export interface Site {
  name?: string
  /** Absolute origin (and base path) for canonical, og:url and relative images. */
  url?: string
  /** Title template; a page's title fills `%s`. A page without a title gets `name`. */
  title?: string
  description?: string
  /** `en_US` style (og:locale). */
  locale?: string
  /** `'auto'` = the generated card (§4, not built yet: writes no image), or a path/URL. */
  image?: 'auto' | Image
  twitter?: Twitter
  /** A build's stylesheets go in the page up to 48 KB, saving a round trip. `false` keeps them as links. */
  inlineCss?: boolean
  /** Raw HTML for every page's head, before the stylesheets: what has to run before the first paint. Not escaped. */
  head?: string
}

export type Image = string | { url: string; width?: number; height?: number; alt?: string }

export interface Twitter {
  card?: 'summary' | 'summary_large_image' | 'app' | 'player'
  site?: string
  creator?: string
  title?: string
  description?: string
  image?: string
}

export interface Og {
  type?: string
  title?: string
  description?: string
  image?: 'auto' | Image
  siteName?: string
  locale?: string
}

export type Extra = { name: string; content: string } | { property: string; content: string } | { rel: string; href: string }

/** One layout's or route's metadata. Later metas win; `og` and `twitter` merge by key. */
export interface Meta {
  /** Fills the site's template; `{ absolute }` skips it. */
  title?: string | { absolute: string }
  description?: string
  og?: Og
  twitter?: Twitter
  /** Tags weft doesn't model (theme-color, hreflang alternates, verification). */
  extra?: readonly Extra[]
}

/** The merged result: what one page writes. */
export interface Merged {
  title: string
  description?: string
  url?: string
  og: Og
  twitter: Twitter
  extra: Extra[]
}

/** `[tag, attributes, text?]`: `title` carries text, `meta` and `link` attributes only. */
export type Tag = [tag: 'title' | 'meta' | 'link', attrs: Record<string, string>, text?: string]

/** Config defaults → layout metas (outer to inner) → the route's. */
export function mergeMeta(site: Site = {}, ...metas: readonly (Meta | null | undefined)[]): Merged {
  let title: string | { absolute: string } | undefined
  let description = site.description
  const og: Og = { type: 'website', siteName: site.name, locale: site.locale, image: site.image }
  const twitter: Twitter = { ...site.twitter }
  const extra: Extra[] = []
  for (const m of metas) {
    if (!m) continue
    if (m.title != null) title = m.title
    if (m.description != null) description = m.description
    assign(og, m.og)
    assign(twitter, m.twitter)
    if (m.extra) extra.push(...m.extra)
  }
  const text =
    title == null ? site.name ?? ''
    : typeof title === 'object' ? title.absolute
    : site.title?.includes('%s') ? site.title.replace('%s', title)
    : title
  return { title: text, description, url: site.url, og, twitter, extra }
}

/** Defined keys only, so `{ title: undefined }` doesn't erase an outer layout's title. */
function assign<T extends object>(to: T, from: T | undefined) {
  if (from) for (const k in from) if (from[k] !== undefined) to[k] = from[k]
}

/** The §2 tag set for `path`, in order. Canonical and og:url are written only with an absolute `site.url`. */
export function headTags(m: Merged, path: string): Tag[] {
  const base = m.url?.replace(/\/+$/, '')
  const abs = (u: string) => (!base || /^(https?:)?\/\//.test(u) ? u : base + (u[0] === '/' ? '' : '/') + u)
  const url = base && abs(path.replace(/[?#].*/, '') || '/')
  const og = m.og
  const image = og.image === 'auto' ? undefined : typeof og.image === 'string' ? { url: og.image } : og.image
  const title = og.title ?? m.title
  const description = og.description ?? m.description
  const tags: Tag[] = [['title', {}, m.title]]
  const meta = (key: 'name' | 'property', k: string, v: unknown) => {
    if (v != null && v !== '') tags.push(['meta', { [key]: k, content: String(v) }])
  }
  meta('name', 'description', m.description)
  if (url) tags.push(['link', { rel: 'canonical', href: url }])
  meta('property', 'og:type', og.type)
  meta('property', 'og:site_name', og.siteName)
  meta('property', 'og:title', title)
  meta('property', 'og:description', description)
  meta('property', 'og:url', url)
  meta('property', 'og:locale', og.locale)
  if (image) {
    meta('property', 'og:image', abs(image.url))
    meta('property', 'og:image:width', image.width)
    meta('property', 'og:image:height', image.height)
    meta('property', 'og:image:alt', image.alt)
  }
  // twitter:* falls back to og:*, so only what differs is written.
  const tw = m.twitter
  meta('name', 'twitter:card', tw.card ?? (image ? 'summary_large_image' : 'summary'))
  meta('name', 'twitter:site', tw.site)
  meta('name', 'twitter:creator', tw.creator)
  if (tw.title !== title) meta('name', 'twitter:title', tw.title)
  if (tw.description !== description) meta('name', 'twitter:description', tw.description)
  meta('name', 'twitter:image', tw.image && abs(tw.image))
  for (const e of m.extra) tags.push('rel' in e ? ['link', { ...e }] : ['meta', { ...e }])
  return tags
}

const esc = (s: string) => s.replace(/[&<"]/g, c => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&quot;'))

/** The tags as HTML, one per line, each marked `data-wm` (weft-managed) for client navigation. */
export function metaTags(m: Merged, path: string): string {
  return headTags(m, path)
    .map(([tag, attrs, text]) => {
      let a = ''
      for (const k in attrs) a += ` ${k}="${esc(attrs[k])}"`
      return tag === 'title' ? `<title data-wm>${esc(text!)}</title>` : `<${tag}${a} data-wm>`
    })
    .join('\n')
}

export interface HeadOptions {
  site?: Site
  /** Layout metas then the route's, outer to inner. */
  meta?: Meta | readonly (Meta | null | undefined)[]
  /** The request path (query and hash are stripped for canonical). */
  path: string
}

/**
 * Put the page's tags at the top of the app's `<head>` when it renders one (whole-document apps; hydrating a
 * TSX-rendered `<head>` isn't covered yet, Phase 3); otherwise wrap the output in a minimal
 * document (`<html lang>` from `site.locale`) with the tags in its head and the app in `<body>`.
 */
export function withHead(html: string, { site, meta, path }: HeadOptions): string {
  const metas = Array.isArray(meta) ? meta : [meta as Meta | undefined]
  const tags = metaTags(mergeMeta(site, ...metas), path)
  // After the app's `<meta charset>` when it leads the head (it must sit in the first 1024 bytes).
  const open = /<head\b[^>]*>(\s*<meta charset[^>]*>)?/i.exec(html)
  if (open) {
    const at = open.index + open[0].length
    return `${html.slice(0, at)}\n${tags}\n${html.slice(at)}`
  }
  const lang = site?.locale ? ` lang="${esc(site.locale.replace('_', '-'))}"` : ''
  return `<!doctype html>\n<html${lang}>\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n${tags}\n</head>\n<body>${html}</body>\n</html>`
}
