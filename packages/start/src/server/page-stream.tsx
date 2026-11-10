// The render's shell, incremental data, and remaining streamed chunks.
import { metaTags, renderToStream } from '@weft-js/core/ssr'
import { keyOf } from '../data'
import * as exec from '../exec'
import { hub } from '../hub'
import { App } from '../view'
import type { pageStyles } from '../inline.mjs'
import { cookieJar } from './request'
import { dataTags, pageData, payloadOf, scrubbed, wire } from './payload'
import {
  islandsOf,
  modulepreloads,
  pageChunks,
  pageSheets,
  saveData,
  tableStyles,
  withLevels,
} from './render'
import { esc, json } from './text'
import type { PageState } from './page-types'

/** Cache entries the client hasn't got. */
function news(p: PageState) {
  const fresh = wire(p.scope).filter((w) => !p.sent.has(keyOf(w[0], w[1])))
  for (const w of fresh) p.sent.add(keyOf(w[0], w[1]))
  return fresh
}

/** What the client hasn't been told of the render. */
function since(p: PageState) {
  const d = p.stream.data()
  const changed = <T,>(from: Record<string, T>, seen: Record<string, unknown>) => {
    const out = Object.fromEntries(Object.entries(from).filter(([k, v]) => seen[k] !== v))
    Object.assign(seen, out)
    return out
  }
  const state = JSON.stringify(d?.s)
  const fresh = state !== p.told.s
  p.told.s = state
  return {
    r: scrubbed(changed(d?.r ?? {}, p.told.r), p.scope),
    b: changed(d?.b ?? {}, p.told.b),
    ...(fresh && d?.s && { s: d.s }),
  }
}

/** Start the page render with its request-local stream state. */
export function render(p: PageState) {
  return renderToStream(() => <App route={p.route} />, {
    ...p.timing,
    passes: p.passes,
    shown: (e) => exec.shown(e, p.scope),
    stalled: () =>
      p.options.onDiagnostic?.({
        code: 'E_STREAM',
        severity: 'warning',
        message: `${p.path}: a render stopped reading anything new, so what's still out is left to the client. Is a query's input different on every render, a \`Date.now()\` say?`,
      }),
    app: { cookies: cookieJar(p.request) },
    landing: () => `(self.$wc=self.$wc||[]).push(${json({ c: news(p), ...since(p) })});`,
  })
}

/** The head down to the fonts, after metadata is complete. */
/**
 * A full load between pages that opt into cross-document view transitions (warp does) brings the browser's own
 * transition. When the browser skips one ("invalid state"), its three promises reject, and the page reveals before the
 * runtime's module runs: so this listens from the head, on every page that has code. Chrome can also reject one the
 * page never sees (a skipped outgoing transition), so a rejection that says only that a transition was aborted or
 * skipped is marked handled too; nothing else is touched.
 */
const REVEAL = `<script>(f=>{["pagereveal","pageswap"].forEach(n=>addEventListener(n,e=>{var t=e.viewTransition;t&&[t.ready,t.finished,t.updateCallbackDone].forEach(q=>q.catch(f))}));addEventListener("unhandledrejection",e=>{/^Transition was (aborted|skipped)/.test(e.reason&&e.reason.message)&&e.preventDefault()})})(()=>{})</script>\n`

export function top(p: PageState) {
  return (
    `<!doctype html>\n<html${p.lang}>\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
    (p.assets.entry ? REVEAL : '') +
    metaTags(p.r.head, p.url.pathname) +
    '\n' +
    (p.site.head ? p.site.head + '\n' : '') +
    (p.assets.fonts ?? [])
      .map(
        (f) =>
          `<link rel="preload" as="font" type="${esc(f.type)}" href="${esc(f.href)}" crossorigin>\n`,
      )
      .join('')
  )
}

/** What this render's head needs, from its HTML. */
export function shaped(p: PageState) {
  const payload = withLevels(payloadOf(p.r, false, p.options), p.stream.shell, p.statics, false)
  const parts = islandsOf(p.stream.shell)
  // A Boundary is waiting: the client starts now, not at the last byte.
  const streaming = Object.values(p.stream.data()?.b ?? {}).includes('p')
  const now = !parts.lazy.length || payload.m.some((m) => !m.s) || !!payload.i?.length
  // The entry's own script tag already fetches it; preloads go above the styles.
  const preloads = modulepreloads(
    [
      ...(p.assets.js ?? []),
      ...pageChunks(payload, p.options.chunks, saveData(p.request) ? [] : parts.fold, now),
    ],
    p.assets,
  )
  return {
    payload,
    parts,
    streaming,
    now,
    preloads,
    sheets: pageSheets(p.assets.css, parts, p.options.chunks),
  }
}

/** First-paint rules for this render's sheets. */
export function table(p: PageState, shape: ReturnType<typeof shaped>) {
  return p.assets.pieces && tableStyles(p.assets.pieces, shape.sheets, p.site.head, p.lang)
}

/** From the app element to what remains to stream. */
export function pageShell(p: PageState, shape: ReturnType<typeof shaped>, after = '') {
  return (
    `<div id="app">${p.stream.shell}</div>\n` +
    after +
    `<script type="application/json" id="weft-route">${json(shape.payload)}</script>\n` +
    (p.scope.form
      ? `<script type="application/json" id="weft-form">${json(p.scope.form)}</script>\n`
      : '') +
    // Async, and after all it reads, so it can run while the stream goes on.
    (shape.streaming
      ? (since(p), dataTags({ ...pageData(p.stream.data(), p.scope)!, w: 1 }, news(p)))
      : '') +
    (p.assets.entry && shape.streaming
      ? `<script type="module" async src="${esc(p.assets.entry)}"></script>\n`
      : '')
  )
}

/** Finish the page with the resolved cache and live cursor. */
export async function finish(p: PageState, streaming: boolean) {
  const cached = wire(p.scope)
  // Read after the queries ran: the first live connect replays what is published from here.
  if (p.scope.live) await hub().ready()
  const liveScript = p.scope.live
    ? `<script type="application/json" id="weft-rt">${json({ c: hub().cursor(), b: p.options.build })}</script>\n`
    : ''
  // A client that starts after this finds the whole page, as if it had never streamed.
  const stale = streaming
    ? '<script>["weft-data","weft-cache"].forEach(function(i){(i=document.getElementById(i))&&i.remove()})</script>\n'
    : ''
  return (
    stale + dataTags(pageData(p.stream.data(), p.scope), cached) + liveScript + '</body>\n</html>\n'
  )
}

/** Flush each remaining chunk with its styles. */
export async function rest(
  p: PageState,
  {
    controller,
    styles,
    streaming,
  }: {
    controller: ReadableStreamDefaultController<Uint8Array>
    styles: Pick<ReturnType<typeof pageStyles>, 'late'>
    streaming: boolean
  },
) {
  try {
    for await (const chunk of p.stream.chunks)
      controller.enqueue(
        p.enc.encode(
          styles.late(pageSheets([], islandsOf(chunk), p.options.chunks), chunk) + chunk + '\n',
        ),
      )
  } catch (e) {
    p.options.onDiagnostic?.({ code: 'E_STREAM', severity: 'error', message: String(e) })
  }
  controller.enqueue(p.enc.encode(await finish(p, streaming)))
  controller.close()
}
