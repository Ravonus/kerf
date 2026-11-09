// A known head can go out before the new render finishes.
import { LAYER_ORDER, pageStyles, type keptSheets } from '../inline.mjs'
import { capture } from '../capture'
import { withHeaders } from './request'
import { esc } from './text'
import { pageShell, render, rest, shaped, table, top } from './page-stream'
import { HOLD, type Head, type PageState } from './page-types'

type Styles = ReturnType<typeof pageStyles>

/** Render the shell behind a head that has already gone out. */
async function warmContent(
  p: PageState,
  known: Head,
  sent: {
    cold: string
    set: number
    styles: Styles | undefined
    controller: ReadableStreamDefaultController<Uint8Array>
  },
) {
  const { cold, set, styles, controller } = sent
  const t0 = performance.now()
  p.stream = render(p)
  await p.stream.settle() // queries read outside a Boundary have nowhere to stream to
  await p.stream.hold(p.options.hold ?? HOLD)
  const ms = performance.now() - t0
  const shape = shaped(p)
  const t = table(p, shape)
  const capturing = !!p.options.lazy || shape.streaming
  // What this page has beyond the head: sheets, rules, and chunks that render didn't reach.
  const have = new Set(known.preloads.split(/(?=<link )/))
  const more = shape.preloads
    .split(/(?=<link )/)
    .filter((l) => l && !have.has(l))
    .join('')
  const rules = t && t.rules(p.stream.shell)
  const lead =
    (t ? (rules ? `<style>${rules}</style>\n` : '') : styles!.late(shape.sheets, p.stream.shell)) +
    more +
    (capturing && !known.capture ? `<script>${capture(shape.now)}</script>\n` : '')
  controller.enqueue(
    p.enc.encode(
      lead +
        pageShell(p, shape, t ? t.links : '') +
        (p.assets.entry && !shape.streaming
          ? `<script type="module" src="${esc(p.assets.entry)}"></script>\n`
          : ''),
    ),
  )
  // A render that set a header after they went can't use this: the route goes back to rendering first.
  if ([...p.scope.headers].length !== set) {
    p.heads.set(cold, null).set(cold + ' w', null)
    p.options.onDiagnostic?.({
      code: 'E_HEAD',
      severity: 'warning',
      message: `${p.path}: a render set a response header after the head was sent, so this route now renders before sending anything.`,
    })
  } else
    p.remember(styles?.links ? cold + ' w' : cold, {
      ...shape,
      ms,
      split: styles?.split ?? false,
      found: styles?.found() ?? new Set(),
      capture: capturing,
      fold: !!shape.parts.fold.length,
      preloads: [...have, ...more.split(/(?=<link )/)].filter(Boolean).join(''),
    })
  await rest(p, { controller, styles: t || styles!, streaming: shape.streaming })
}

/** Send the remembered head, then flush the render behind it. */
export async function warmPage(
  p: PageState,
  known: Head,
  cold: string,
  kept: ReturnType<typeof keptSheets>,
) {
  p.complete(p.r)
  // A session read can set cookies, which have to be in the headers: read it before they go.
  if (p.request.headers.has('cookie')) await p.scope.ctx().catch(() => {})
  const set = [...p.scope.headers].length
  const styles = p.assets.pieces
    ? undefined
    : pageStyles(p.assets, known.sheets, '', {
        head: p.site.head,
        seen: known,
        have: kept,
        keep: p.request.headers.has('cookie'),
      })
  // With a table, the rules come with the shell; here there is only the layer order.
  const head =
    top(p) +
    known.preloads +
    (p.assets.entry ? `<link rel="modulepreload" href="${esc(p.assets.entry)}">\n` : '') +
    (styles ? styles.head : `<style>${LAYER_ORDER}${p.assets.pieces!.layers}</style>\n`) +
    (known.capture ? `<script>${capture(known.now)}</script>\n` : '') +
    p.dev +
    '</head>\n<body>\n'
  const init = {
    status: p.status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-cache',
      ...(known.fold && { vary: 'Save-Data, Sec-CH-Prefers-Reduced-Data' }),
    },
  }
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(p.enc.encode(head))
      try {
        await warmContent(p, known, { cold, set, styles, controller })
      } catch (e) {
        p.heads.set(cold, null).set(cold + ' w', null)
        p.options.onDiagnostic?.({
          code: 'E_HEAD',
          severity: 'error',
          message: `${p.path}: ${String(e)}`,
        })
        controller.enqueue(
          p.enc.encode('<p>Something went wrong. <a href="">Reload</a></p>\n</body>\n</html>\n'),
        )
        controller.close()
      }
    },
  })
  return withHeaders(new Response(body, init), p.scope)
}
