// Page metadata (research 20). Metadata is plain data, merged once per request and written as static tags at the
// top of `<head>` in the server's first response: link-preview crawlers don't run JS (§1). Nothing here is
// reactive, and components can't add to it. `mergeMeta` and `metaTags` are server-side (exported from @weft-js/core/ssr);
// `headTags` is the pure tag list both the string writer and the client's `setHead` (@weft-js/core/head) use.

import { esc } from './markup-shared.mjs'

/** `site` in weft.config.ts: the defaults every page starts from (§2). */
export interface Site {
  name?: string | undefined
  /** Absolute origin (and base path) for canonical, og:url and relative images. */
  url?: string | undefined
  /** Title template; a page's title fills `%s`. A page without a title gets `name`. */
  title?: string | undefined
  description?: string | undefined
  /** `en_US` style (og:locale). */
  locale?: string | undefined
  /** A path or URL; `'auto'` (the default) is the generated card, `false` no image at all. */
  image?: Image | false | undefined
  twitter?: Twitter | undefined
  /** The generated card's look. Colours come from Warp and fonts from the text plugin when the app has them. */
  card?: CardTheme | undefined
  /** `false`: no stylesheet text in the page, just links. */
  inlineCss?: boolean | undefined
  /** `false`: one sheet per chunk, inline up to 48 KB, instead of a first-paint part of the build's one sheet. */
  criticalCss?: boolean | undefined
  /** Words of selectors a first paint keeps whatever the HTML holds: for a class a head script sets. */
  criticalKeep?: string[] | undefined
  /** Raw HTML for every page's head, before the stylesheets: what has to run before the first paint. Not escaped. */
  head?: string | undefined
}

/** One colour scheme of the generated card. */
export interface CardColors {
  background?: string | undefined
  text?: string | undefined
  subtle?: string | undefined
  accent?: string | undefined
}

export interface CardTheme extends CardColors {
  /** Which colours the card uses: one image is shown on every feed, so it picks. Default `dark`. */
  scheme?: 'dark' | 'light' | undefined
  light?: CardColors | undefined
  dark?: CardColors | undefined
  /** Faces for the card's title and text: a family, the font file (from the app root) and its weight. */
  fonts?: { display?: CardFont; body?: CardFont } | undefined
}

export interface CardFont {
  family: string
  src: string
  weight?: number | undefined
}

/** A social image: a URL, or a URL with its size and description. */
export type Image = string | { url: string; width?: number; height?: number; alt?: string }

/** The page's `twitter:` tags. */
export interface Twitter {
  card?: 'summary' | 'summary_large_image' | 'app' | 'player' | undefined
  site?: string | undefined
  creator?: string | undefined
  title?: string | undefined
  description?: string | undefined
  image?: string | undefined
}

/** The page's `og:` tags. */
export interface Og {
  type?: string | undefined
  title?: string | undefined
  description?: string | undefined
  image?: Image | false | undefined
  siteName?: string | undefined
  locale?: string | undefined
}

/** One more tag for the head: a named or property `<meta>`, or a `<link>`. */
export type Extra =
  | { name: string; content: string }
  | { property: string; content: string }
  | { rel: string; href: string }

/** One layout's or route's metadata. Later metas win; `og` and `twitter` merge by key. */
export interface Meta {
  /** Fills the site's template; `{ absolute }` skips it. */
  title?: string | { absolute: string } | undefined
  description?: string | undefined
  og?: Og | undefined
  twitter?: Twitter | undefined
  /** Tags Weft doesn't model (theme-color, hreflang alternates, verification). */
  extra?: readonly Extra[] | undefined
  /** Structured data, written as `application/ld+json`. `false` drops what a layout or Weft set. */
  jsonLd?: object | readonly object[] | false | undefined
}

/** The merged result: what one page writes. */
export interface Merged {
  title: string
  description?: string | undefined
  url?: string | undefined
  og: Og
  twitter: Twitter
  extra: Extra[]
  jsonLd?: object | readonly object[] | false
}

/** `[tag, attributes, text?]`: `title` carries text, `meta` and `link` attributes only. */
export type Tag = [tag: 'title' | 'meta' | 'link', attrs: Record<string, string>, text?: string]

/** Config defaults → layout metas (outer to inner) → the route's. */
export function mergeMeta(site: Site = {}, ...metas: readonly (Meta | null | undefined)[]): Merged {
  let title: string | { absolute: string } | undefined
  let description = site.description
  const og: Og = {
    type: 'website',
    siteName: site.name,
    locale: site.locale,
    image: site.image ?? 'auto',
  }
  const twitter: Twitter = { ...site.twitter }
  const extra: Extra[] = []
  let jsonLd: Merged['jsonLd']
  for (const m of metas) {
    if (!m) continue
    if (m.title != null) title = m.title
    if (m.description != null) description = m.description
    assign(og, m.og)
    assign(twitter, m.twitter)
    if (m.extra) extra.push(...m.extra)
    if (m.jsonLd != null) jsonLd = m.jsonLd
  }
  const text =
    title == null
      ? (site.name ?? '')
      : typeof title === 'object'
        ? title.absolute
        : site.title?.includes('%s')
          ? site.title.replace('%s', title)
          : title
  return {
    title: text,
    description,
    url: site.url,
    og,
    twitter,
    extra,
    ...(jsonLd != null && { jsonLd }),
  }
}

/** Defined keys only, so `{ title: undefined }` doesn't erase an outer layout's title. */
function assign<T extends object>(to: T, from: T | undefined) {
  if (from) for (const k in from) if (from[k] !== undefined) to[k] = from[k]
}

/** The §2 tag set for `path`, in order. Canonical and og:url are written only with an absolute `site.url`. */
export function headTags(m: Merged, path: string): Tag[] {
  const base = m.url?.replace(/\/+$/, '')
  const abs = (u: string) =>
    !base || /^(https?:)?\/\//.test(u) ? u : base + (u[0] === '/' ? '' : '/') + u
  const url = base && abs(path.replace(/[?#].*/, '') || '/')
  const og = m.og
  const image =
    og.image === 'auto' ? undefined : typeof og.image === 'string' ? { url: og.image } : og.image
  const title = og.title ?? m.title
  const description = og.description ?? m.description
  const tags: Tag[] = [['title', {}, m.title]]
  const meta = (key: 'name' | 'property', k: string, v: unknown) => {
    // oxlint-disable-next-line typescript/no-base-to-string -- whatever reaches here is a primitive or a mistake, and a mistake should show as it does anywhere else
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

/** The tags as HTML, one per line, each marked `data-wm` (weft-managed) for client navigation. */
export function metaTags(m: Merged, path: string): string {
  const tags = headTags(m, path).map(([tag, attrs, text]) => {
    let a = ''
    for (const k in attrs) a += ` ${k}="${esc(attrs[k]!)}"`
    return tag === 'title' ? `<title data-wm>${esc(text!)}</title>` : `<${tag}${a} data-wm>`
  })
  // Crawlers read this from the first response only, so it's here and not in `headTags`, which the client shares.
  if (m.jsonLd)
    tags.push(`<script type="application/ld+json" data-wm>${jsonText(m.jsonLd)}</script>`)
  return tags.join('\n')
}

/** JSON that can't end its `<script>` or an HTML comment: everything that could is written as an escape. */
const jsonText = (v: unknown) =>
  JSON.stringify(v).replace(
    /[<>&\u2028\u2029]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  )

/** What a render writes to `<head>`: the app's defaults, and how a page's tags merge into them. */
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
