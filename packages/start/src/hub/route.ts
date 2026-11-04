import { StartError } from '../data'
import { sessionOf } from '../mux-session'
import type { Scope } from '../exec'
import type { Body, Conn, Hub, Sink } from '../hub'

// ---- the HTTP route -------------------------------------------------------------------------------------------------

const enc = new TextEncoder()
/** Whether a request body has the shape of `Body`. */
export const validBody = (input: unknown): input is Body => {
  const b = input as Partial<Record<keyof Body, unknown>> | null | undefined
  return (
    !!b &&
    typeof b === 'object' &&
    !Array.isArray(b) &&
    (b.k === undefined || typeof b.k === 'string') &&
    (b.c === undefined || typeof b.c === 'string') &&
    (b.d === undefined ||
      (Array.isArray(b.d) && b.d.every((n: unknown) => typeof n === 'number'))) &&
    (b.s === undefined ||
      (Array.isArray(b.s) &&
        b.s.every(
          (e: unknown) =>
            Array.isArray(e) &&
            typeof e[0] === 'number' &&
            (e[1] === 'q' || e[1] === 's') &&
            typeof e[2] === 'string',
        )))
  )
}

/** `/_weft/rt` (research 30 §4): opens a connection, or changes one. Same proof as a mutation, plus `origins`. */
export async function handleRoute(
  request: Request,
  scope: Scope,
  origins: string[],
  hub: () => Hub,
): Promise<Response> {
  const refuse = (code: string, message: string, status: number) => {
    scope.options.onDiagnostic?.({ code, severity: 'error', message })
    return Response.json(
      { e: { code, message } },
      { status, headers: { 'cache-control': 'no-store' } },
    )
  }
  if (request.method !== 'POST') return refuse('Q010', 'Q010: `/_weft/rt` needs POST', 405)
  const url = new URL(request.url)
  const origin = request.headers.get('origin')
  const site = request.headers.get('sec-fetch-site')
  const allowed = origin && origins.includes(origin)
  if (
    !allowed &&
    ((origin && origin !== url.origin) || (site && site !== 'same-origin' && site !== 'none'))
  )
    return refuse(
      'R010',
      `R010: origin \`${origin ?? site}\` may not open a realtime connection: list it in \`realtime({ origins })\``,
      403,
    )
  if (
    request.headers.get('x-weft') !== '1' ||
    !request.headers.get('content-type')?.startsWith('application/json')
  )
    return refuse(
      'Q010',
      'Q010: `/_weft/rt` without the CSRF proof (POST + JSON + `x-weft: 1`)',
      403,
    )
  const h = hub()
  const raw = await request.text()
  if (raw.length > h.limits.body)
    return refuse(
      'R008',
      `R008: a realtime request of ${raw.length} bytes; the limit is ${h.limits.body}`,
      413,
    )
  let body: Body
  try {
    body = JSON.parse(raw)
  } catch {
    return refuse('Q002', "Q002: `/_weft/rt` got a body that isn't JSON", 400)
  }
  // A tab that didn't dial the shared socket asks who it is now (link.ts).
  if ((body as { w?: 1 })?.w === 1)
    return Response.json(
      { u: await sessionOf(await scope.ctx()) },
      { headers: { 'cache-control': 'no-store' } },
    )
  if (!validBody(body))
    return refuse('Q002', 'Q002: `/_weft/rt` got a body of the wrong shape', 400)
  if (body.k) {
    const c = h.find(body.k)
    const user = c && ((await scope.ctx()) as { user?: { id?: string } }).user?.id
    if (!c || c.user !== user)
      return refuse('Q009', 'Q009: no such realtime connection (reconnect with the whole set)', 404)
    await h.change(c, request, scope.options, body)
    return new Response(null, { status: 204 })
  }
  return openStream(request, scope, body, h, refuse)
}

async function openStream(
  request: Request,
  scope: Scope,
  body: Body,
  h: Hub,
  refuse: (code: string, message: string, status: number) => Response,
): Promise<Response> {
  let conn: Conn | undefined
  let queued = 0
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const push = (text: string) => {
    const bytes = enc.encode(text)
    queued += bytes.length
    controller.enqueue(bytes)
  }
  const sink: Sink = {
    write: (event, data) => push(`event: ${event}\ndata: ${data}\n\n`),
    ping: () => push(': ping\n\n'),
    backlog: () => queued,
    close: () => {
      try {
        controller.close()
      } catch {}
    },
  }
  const out = new ReadableStream<Uint8Array>(
    {
      start: (c) => void (controller = c),
      // The reader took what was queued: the strategy's hwm of 0 means every pull is an empty queue.
      pull() {
        queued = 0
        if (conn) h.drain(conn)
      },
      cancel() {
        if (conn) h.close(conn)
        else closed = true
      },
    },
    { highWaterMark: 0 },
  )
  let closed = false
  try {
    conn = await h.connect(request, scope, body, sink)
  } catch (e) {
    if (e instanceof StartError) return refuse(e.code, e.message, (e.extra.status as number) ?? 500)
    throw e
  }
  if (closed) h.close(conn)
  return new Response(out, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      'x-accel-buffering': 'no',
      connection: 'keep-alive',
    },
  })
}
