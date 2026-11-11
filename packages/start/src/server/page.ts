// Select a remembered head or render before sending the page.
import { keptSheets, sheetId } from '../inline.mjs'
import type { Scope } from '../exec'
import { payloadOf } from './payload'
import { saveData } from './render'
import { redirectBody } from './request'
import { esc, moved } from './text'
import { coldPage } from './page-cold'
import { leftToPage } from './head'
import { warmPage } from './page-warm'
import { EARLY_MS, type PageDeps, type PageState } from './page-types'

/** The page renderer for one handler and its remembered heads. */
export function makePage(deps: PageDeps) {
  return async function page(url: URL, request: Request, scope: Scope): Promise<Response> {
    const path = url.pathname + url.search
    const r = await deps.resolve(path, request)
    if (r.redirect) {
      const headers = new Headers(r.redirectHeaders)
      headers.set('location', r.redirect.href)
      if (!headers.has('cache-control')) headers.set('cache-control', 'no-cache')
      return redirectBody(
        new Response(moved(r.redirect.href), { status: r.redirect.status, headers }),
        scope,
        'text/html; charset=utf-8',
        r.redirect.href,
      )
    }
    scope.started = true // from here a redirect can't change the status (Q007)
    // The render reads raw deferred data; the page carries the settled part.
    const route = deps.stateOf(r, payloadOf(r, false))
    const sent = new Set<string>()
    const told: PageState['told'] = { r: {}, b: {} }
    const assets = deps.options.assets ?? {}
    const p: PageState = {
      ...deps,
      url,
      request,
      scope,
      path,
      r,
      route,
      sent,
      told,
      stream: undefined!,
      assets,
      lang: deps.site.locale ? ` lang="${esc(deps.site.locale.replace('_', '-'))}"` : '',
      dev: deps.options.dev
        ? '<script type="module" src="/@vite/client"></script>\n<script type="module" src="/@kerf-agent.js"></script>\n'
        : '',
      status: r.status === 200 && scope.form ? scope.form.status : r.status,
      enc: new TextEncoder(),
    }
    // A browser with the page's sheets gets the remembered link-only head. A table has no separate head.
    const cold = `${p.status} ${saveData(request) ? 1 : 0} ${r.levels.map((l) => l.id).join()}`
    const kept = assets.pieces ? undefined : keptSheets(request.headers.get('cookie'))
    const warm = kept && p.heads.get(cold + ' w')
    const shape = warm && warm.sheets.every((c) => kept.has(sheetId(c.href))) ? cold + ' w' : cold
    const known = p.heads.get(shape)
    // A level left words to the page, which are only known after it renders.
    const worded =
      !!r.metas &&
      r.status === 200 &&
      (leftToPage(r.source!.title) || leftToPage(r.source!.description))
    // Only a render slow enough to wait on sends its remembered head first.
    if (known && known.ms >= EARLY_MS && !worded) return warmPage(p, known, cold, kept)
    return coldPage(p, known, cold, kept)
  }
}
