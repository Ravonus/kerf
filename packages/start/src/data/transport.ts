import type * as Exec from '../exec'
import type { Scope } from '../exec'
import { fns, net, runtime } from './foundation'
import { FnError, isRedirect, stable, StartError } from './primitives'
import type { Answer, Fn, NetControl, Transport } from './types'

export function transport(): Transport {
  if (runtime.transport) return runtime.transport
  if (net()) return inProcess
  return http
}

const answer = async (res: Response): Promise<Answer> => {
  const body = await res
    .json()
    .catch(() => ({ e: { message: `server function answered ${res.status}` } }))
  if (body.e) throw new FnError(body.e, res.status)
  return body
}

/** The browser's: GET for queries, POST + JSON + `x-weft` for mutations (research 27 §3). */
export const http: Transport = {
  query: (id, input) =>
    fetch(`/_weft/fn/${id}${input == null ? '' : `?i=${encodeURIComponent(stable(input))}`}`, {
      headers: { accept: 'application/json' },
    }).then(answer),
  mutate(id, input, f, form) {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'x-weft': '1',
      ...(runtime.conn && { 'x-weft-conn': runtime.conn }),
    }
    if (form instanceof FormData) form.set('$r', JSON.stringify(f))
    else headers['content-type'] = 'application/json'
    return fetch(`/_weft/fn/${id}`, {
      method: 'POST',
      headers,
      body:
        form instanceof FormData ? form : JSON.stringify({ i: input, f, ...(form && { c: 1 }) }),
    }).then(answer)
  },
}

/**
 * @weft-js/core/test's fake transport: the server's executor in process, with the controls @weft-js/core/test's `net` sets (latency,
 * failures, replaced functions, offline), and a JSON round trip both ways so values arrive as they would over HTTP.
 */
export const fakeScope = (exec: typeof Exec, n: NetControl, request: Request) =>
  exec.createScope(request, {
    context: () => n.ctx ?? {},
    handlers: n.handlers,
    dev: true,
    extensions: n.extensions,
    onDiagnostic: (d) =>
      console.warn(`weft: ${d.message.startsWith(d.code) ? '' : d.code + ' '}${d.message}`),
  })

type Call = (exec: typeof Exec, scope: Scope, fn: Fn) => Promise<Answer>

const inProcess: Transport = {
  query: (id, input) =>
    fake(id, 'query', input, (exec, scope, fn) =>
      exec.fetchQuery(scope, fn, input).then((e) => ({ v: e.v, t: e.tags })),
    ),
  mutate: (id, input, f, form) =>
    fake(id, 'mutation', input, (exec, scope, fn) => exec.runMutation(scope, fn, input, f, !!form)),
}

function fake(id: string, kind: string, input: unknown, call: Call): Promise<Answer> {
  return track(fakeCall(net()!, id, kind, input, call))
}

/** `net.settle()` waits for `p`. */
export function track<T>(p: Promise<T>): Promise<T> {
  const n = net()
  if (!n) return p
  n.inflight.add(p)
  const over = () => void n.inflight.delete(p)
  p.then(over, over)
  return p
}

async function fakeCall(
  n: NetControl,
  id: string,
  kind: string,
  input: unknown,
  call: Call,
): Promise<Answer> {
  n.log.push({ id, kind, input })
  const exec = (runtime.exec ??= await import('../exec'))
  if (n.latency)
    await new Promise((ok) => {
      setTimeout(ok, n.latency)
    })
  if (!n.online())
    throw Object.assign(new Error(`offline: ${id} wasn't sent`), { name: 'OfflineError' })
  const fails = n.fails.get(id)
  if (fails?.length) throw fails.shift()
  const fn = fns.get(id)
  if (!fn) throw new FnError({ code: 'Q009', message: `Q009: no server function \`${id}\`` }, 404)
  const scope = fakeScope(
    exec,
    n,
    new Request(`http://localhost/_weft/fn/${id}`, {
      method: kind === 'query' ? 'GET' : 'POST',
      headers: runtime.conn ? { 'x-weft-conn': runtime.conn } : {},
    }),
  )
  try {
    return JSON.parse(JSON.stringify(await n.als.run(scope, () => call(exec, scope, fn))))
  } catch (e) {
    if (isRedirect(e)) return { r: e.href }
    throw e instanceof StartError
      ? new FnError(
          { code: e.code, message: e.message, issues: e.issues, data: e.data },
          e.status ?? 500,
        )
      : e
  } finally {
    await exec.finishScope(scope) // as the server does once the response is out
  }
}
