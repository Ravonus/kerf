import { mergeMeta, type Merged } from '@kerf-js/core/ssr'
import { pageText } from '../derive.mjs'
import { pointAt } from './resolver'
import { cardPath, hash } from './text'
import type {
  HandlerOptions,
  Level,
  Manifest,
  MetaSource,
  Resolved,
  RouteEntry,
  RouteModule,
} from './types'

/** Whether a title or description can come from the page itself. */
export const leftToPage = (s: MetaSource['title']) => s === 'config' || s === 'none'

/** Complete a head from the metadata and the rendered page. */
export function makeComplete(
  options: HandlerOptions,
  manifest: Manifest,
  site: NonNullable<HandlerOptions['site']>,
  mod: (file?: string) => RouteModule | undefined,
  CARD: { width: number; height: number },
) {
  /**
   * The content hash of a generated card: what it draws. The built-in card reads the head and the site's look and
   * nothing else, so a loader's timestamp can't change its URL; an `.og.tsx` also gets the page's data.
   */
  function cardUrl(route: RouteEntry, levels: Level[], head: Merged, path: string) {
    const card = route.card ?? manifest.defaultCard
    const size = mod(card)?.size ?? CARD
    const { image: _, ...graph } = head.og
    const leaf = levels.at(-1)!
    const v = hash(
      [
        options.build ?? '',
        card ?? 'builtin',
        JSON.stringify(size),
        JSON.stringify({ ...head, og: graph }),
        JSON.stringify(site.card ?? null),
        card ? JSON.stringify(leaf.data ?? null) : '',
      ].join('\0'),
    )
    return `/_kerf/og/${cardPath(path)}.png?v=${v}`
  }

  /**
   * The rest of the head, once the page's HTML can speak for it (research 20 §10): a level that set no title or
   * description gets the page's own, under anything a layout or the route wrote, and `image: 'auto'` becomes the
   * card, whose URL hashes the text it shows. Called once per request, before anything is written.
   */
  return function complete(r: Resolved, html?: string) {
    if (!r.metas || !r.source) return r.head
    const { metas, source } = r
    r.metas = undefined
    const left = leftToPage(source.title) || leftToPage(source.description)
    const words = left && r.status === 200 && html ? pageText(html) : {}
    const title = leftToPage(source.title) ? words.title : undefined
    const description = leftToPage(source.description) ? words.description : undefined
    if (title) source.title = 'auto'
    if (description) source.description = 'auto'
    const head = (r.head = mergeMeta(
      site,
      { ...(title !== undefined && { title }), ...(description !== undefined && { description }) },
      ...metas,
    ))
    pointAt(head, r.origin)
    if (
      head.jsonLd === undefined &&
      r.route?.pattern === '/' &&
      r.status === 200 &&
      r.origin &&
      site.name
    )
      head.jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: site.name,
        url: r.origin,
        ...(site.description && { description: site.description }),
      }
    if (head.og.image === 'auto') {
      const showing = r.status === 200 && r.route
      if (showing)
        head.og.image = {
          url: cardUrl(r.route!, r.levels, head, r.path),
          ...CARD,
          alt: head.og.title ?? head.title,
        }
      else delete head.og.image
      if (showing) source.image = r.route!.card || manifest.defaultCard ? 'card' : 'auto'
    } else if (head.og.image) source.image = 'explicit'
    return head
  }
}
