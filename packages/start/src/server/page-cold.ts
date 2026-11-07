// Render first when no remembered head can be sent yet.
import { LAYER_ORDER, pageStyles, type keptSheets } from '../inline.mjs'
import { capture } from '../capture'
import { whole } from './compression'
import { withHeaders } from './request'
import { esc } from './text'
import { finish, pageShell, render, rest, shaped, table, top } from './page-stream'
import { HOLD, type Head, type PageState } from './page-types'

type Styles = ReturnType<typeof pageStyles>
type Shape = ReturnType<typeof shaped>
type Table = ReturnType<typeof table>

function coldHead(
  p: PageState,
  shape: Shape,
  t: Table,
  styles: Styles | undefined,
  capturing: boolean,
) {
  return (
    top(p) +
    shape.preloads +
    // A streamed page's entry is at the end of what the shell sends, so its script tag is found late.
    (p.assets.entry && shape.streaming
      ? `<link rel="modulepreload" href="${esc(p.assets.entry)}">\n`
      : '') +
    (t
      ? `<style>${LAYER_ORDER}${p.assets.pieces!.layers}${t.rules(p.stream.shell)}</style>\n`
      : styles!.head) +
    (capturing ? `<script>${capture(shape.now)}</script>\n` : '') +
    p.dev +
    (p.assets.entry && !shape.streaming
      ? `<script type="module" src="${esc(p.assets.entry)}"></script>\n`
      : '') +
    '</head>\n<body>\n' +
    pageShell(p, shape, t ? t.links : '')
  )
}

/** Render first and send the head and shell together. */
export async function coldPage(
  p: PageState,
  known: Head | null | undefined,
  cold: string,
  kept: ReturnType<typeof keptSheets>,
) {
  const t0 = performance.now()
  p.stream = render(p)
  await p.stream.settle() // queries read outside a Boundary have nowhere to stream to
  await p.stream.hold(p.options.hold ?? HOLD)
  const ms = performance.now() - t0
  p.complete(p.r, p.stream.shell)
  const shape = shaped(p)
  const t = table(p, shape)
  const styles = t
    ? undefined
    : pageStyles(
        p.assets,
        shape.sheets,
        p.stream.shell,
        p.site.head,
        undefined,
        kept,
        p.request.headers.has('cookie'),
      )
  const capturing = !!p.options.lazy || shape.streaming
  if (known !== null && !p.options.dev)
    p.remember(styles?.links ? cold + ' w' : cold, {
      ...shape,
      ms,
      split: styles?.split ?? false,
      found: styles?.found() ?? new Set(),
      capture: capturing,
      fold: !!shape.parts.fold.length,
    })
  const head = coldHead(p, shape, t, styles, capturing)
  const init = {
    status: p.status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-cache',
      ...(shape.parts.fold.length && { vary: 'Save-Data, Sec-CH-Prefers-Reduced-Data' }),
    },
  }
  // No Boundary is waiting, so there's nothing to stream: the page goes out in one piece.
  if (!shape.streaming) {
    const res = new Response(null, init)
    whole.set(res, head + (await finish(p, false)))
    return withHeaders(res, p.scope)
  }
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(p.enc.encode(head))
      await rest(p, controller, t || styles!, true)
    },
  })
  return withHeaders(new Response(body, init), p.scope)
}
