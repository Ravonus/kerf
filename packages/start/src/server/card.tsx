import { renderToString } from '@kerf/core/ssr'
import type { Merged } from '@kerf/core/ssr'
import { DefaultCard } from '../og/DefaultCard'
import { renderCard } from '../og/index.mjs'
import { settledView } from './payload'
import type { HandlerOptions, Manifest, Resolved, RouteModule } from './types'
export function makeCard({
  resolve,
  finished,
  mod,
  manifest,
  options,
  site,
  CARD,
}: {
  resolve: (path: string, request: Request) => Promise<Resolved>
  finished: (r: Resolved, request: Request) => Promise<Merged>
  mod: (file?: string) => RouteModule | undefined
  manifest: Manifest
  options: HandlerOptions
  site: NonNullable<HandlerOptions['site']>
  CARD: { width: number; height: number }
}) {
  return async function og(url: URL, request: Request): Promise<Response> {
    const path =
      '/' +
      url.pathname
        .slice('/_kerf/og/'.length)
        .replace(/\.png$/, '')
        .replace(/^index$/, '')
    const r = await resolve(path, request)
    if (r.status !== 200 || !r.route) return new Response('Not found', { status: 404 }) // only params the route's own load accepts
    const head = await finished(r, request)
    const image = head.og.image
    if (typeof image !== 'object' || !image.url.startsWith('/_kerf/og/'))
      return new Response('Not found', { status: 404 }) // this page has no generated card
    const want = new URL(image.url, url).searchParams.get('v')
    const cardMod = mod(r.route.card ?? manifest.defaultCard)
    const leaf = r.levels.at(-1)!
    const cardProps = {
      params: leaf.params,
      data: settledView(leaf.raw, leaf.d, leaf.id, options),
      meta: head,
      site: { ...site, url: r.origin },
      path: r.path,
      title: head.og.title ?? head.title,
      description: head.og.description ?? head.description ?? '',
    }
    const Card = (cardMod?.default ?? DefaultCard) as (props: typeof cardProps) => unknown
    const html = renderToString(() => <Card {...cardProps} />, { hydratable: false })
    const png = await renderCard(html, cardMod?.size ?? CARD, options.fonts ?? [], {
      strict: false,
      onDiagnostic: (d: { code: string; severity: string; message: string }) =>
        options.onDiagnostic?.({ ...d, route: r.route!.id }),
    })
    // A signed-in request can see what a public cache must not keep.
    const fresh = url.searchParams.get('v') === want && !request.headers.has('cookie')
    const cache = options.dev
      ? 'no-store'
      : fresh
        ? 'public, max-age=31536000, immutable'
        : 'no-cache'
    return new Response(png, { headers: { 'content-type': 'image/png', 'cache-control': cache } })
  }
}
