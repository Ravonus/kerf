import type { Merged } from '@weft-js/core/ssr'
import { pathPages } from '../derive.mjs'
import { esc } from './text'
import { fill } from './payload'
import type { Manifest, Resolved, RouteModule } from './types'

export function makePrerender(
  manifest: Manifest,
  mod: (file?: string) => RouteModule | undefined,
  resolve: (path: string, request: Request) => Promise<Resolved>,
  finished: (r: Resolved, request: Request) => Promise<Merged>,
) {
  /** Every path `weft build` prerenders: pages from `prerender`, and the card of each page that has a generated one. */
  async function prerenderPaths(request: Request): Promise<string[]> {
    const paths: string[] = []
    for (const route of manifest.routes) {
      if (route.kind !== 'page') continue
      const p = mod(route.file)?.prerender
      const given = typeof p === 'function' ? await p() : p
      const list: Record<string, string>[] =
        given === true ? [{}] : (given ?? (route.params.length ? [] : [{}]))
      for (const params of list) {
        const path = fill(route.pattern, params, route.splat)
        const r = await resolve(path, request)
        if (given && r.status === 200) paths.push(path)
        const image = (await finished(r, request)).og.image
        if (
          r.status === 200 &&
          typeof image === 'object' &&
          image &&
          image.url.startsWith('/_weft/og/')
        )
          paths.push(image.url.replace(/\?.*/, ''))
      }
    }
    return paths
  }

  /**
   * Build mode (research 20 §4.3): the card URLs `weft build` prerenders, queued through Nitro's `x-nitro-prerender`.
   * It's a header, so a big site's list comes a page at a time: too long a header is an error that Nitro's client
   * logs and carries on from, and the build ends with no cards.
   */
  let listing: Promise<string[][]> | undefined
  async function prerenderList(request: Request, url: URL): Promise<Response> {
    const pages = await (listing ??= prerenderPaths(request).then((p) => pathPages(p)))
    const n = Number(url.searchParams.get('page') ?? 0)
    const paths = [
      ...(pages[n] ?? []),
      ...(n + 1 < pages.length ? [`/_weft/og-routes?page=${n + 1}`] : []),
    ]
    // HTML, because Nitro's prerenderer only follows links (and this header) from HTML responses.
    const list = paths.map((p) => `<a href="${esc(p)}">${esc(p)}</a>`).join('\n')
    return new Response(`<!doctype html>\n<meta name="robots" content="noindex">\n${list}\n`, {
      headers: { 'content-type': 'text/html; charset=utf-8', 'x-nitro-prerender': paths.join(',') },
    })
  }

  return prerenderList
}
