import { checkOrigins, hub } from '../hub'
import { StartError } from '../data'
import { realtimeFault } from '../server/realtime-fault'
import { socketFrame } from '../shell/realtime-server'
import { errorFrameStatus, peerStatus, shellResponse } from '../shell/operation'
import { ERROR_HEADER } from '../failure'
import type { Scope } from '../exec'
import type { Peer, Attached } from '../socket'

interface WsPeer {
  id: string
  send(text: string): unknown
  close(code?: number, reason?: string): unknown
  websocket?: { bufferedAmount?: number }
}

/** Nitro reads `crossws` off the response (research 32 §1). A refusal is a hook that throws, so no socket opens. */
export function socketRouteWith(
  request: Request,
  scope: Scope,
  origins: string[],
  attach: Attach,
): Promise<Response> {
  const h = hub()
  const shell = h.shell ? { build: h.build ?? null } : undefined
  const hooks = (crossws: object) =>
    Promise.resolve(Object.assign(new Response('Upgrade required', { status: 426 }), { crossws }))
  const turnAway = (code: string, message: string, status: number, cause?: unknown) => {
    const error = new StartError(code, message, undefined, { status }, { cause })
    const failure = realtimeFault(scope.options, error, '/_kerf/ws')
    if (!failure.ref) scope.options.onDiagnostic?.({ code, severity: 'error', message })
    // oxlint-disable only-throw-error -- crossws answers an upgrade with the Response its hook throws
    return hooks({
      upgrade() {
        if (shell) {
          const refusal = peerStatus(status)
          throw shellResponse(shell.build, 'realtime', { code: refusal }, errorFrameStatus(refusal))
        }
        throw Response.json(
          { e: failure },
          {
            status,
            headers: {
              'cache-control': 'no-store',
              ...(failure.ref && { [ERROR_HEADER]: failure.ref }),
            },
          },
        ) /* oxlint-enable only-throw-error */
      },
    })
  }
  if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket')
    return Promise.resolve(
      new Response('Upgrade required', { status: 426, headers: { 'cache-control': 'no-store' } }),
    )
  try {
    checkOrigins(origins)
  } catch (e) {
    return turnAway('R004', 'Invalid realtime origin configuration', 500, e)
  }
  const origin = request.headers.get('origin')
  if (!origin || (origin !== new URL(request.url).origin && !origins.includes(origin)))
    return turnAway(
      'R010',
      `R010: origin \`${origin ?? 'none'}\` may not open a socket: list it in \`realtime({ origins })\``,
      403,
    )
  const mux = new URL(request.url).searchParams.has('mux')
  if (shell && mux) return turnAway('R010', 'Shell sockets use direct channels', 403)
  return hooks(openPeers({ request, scope, attach, mux, shell }))
}

type Attach = (peer: Peer, request: Request, scope: Scope) => Promise<Attached>

function openPeers({
  request,
  scope,
  attach,
  mux,
  shell,
}: {
  request: Request
  scope: Scope
  attach: Attach
  mux: boolean
  shell: { build: string | null } | undefined
}) {
  const peers = new Map<string, Promise<Pick<Attached, 'message' | 'close'>>>()
  return {
    open(peer: WsPeer) {
      const p: Peer = {
        send(t) {
          const frame = shell ? socketFrame(shell.build, t) : t
          if (frame === undefined) {
            peer.send('null')
            peer.close(1009)
          } else peer.send(frame)
        },
        close: (code, reason) => peer.close(code, shell ? undefined : reason),
        backlog: () => peer.websocket?.bufferedAmount ?? 0,
      }
      peers.set(
        peer.id,
        (mux
          ? import('../mux').then((m) => m.muxed(p, request, scope))
          : attach(p, request, scope)
        ).catch((e) => {
          const failure = realtimeFault(scope.options, e, '/_kerf/ws')
          peer.close(
            1011,
            !shell && failure.ref ? `context failed [${failure.ref}]` : 'context failed',
          )
          return { message() {}, close() {} }
        }),
      )
    },
    message(peer: WsPeer, m: { text(): string }) {
      void peers.get(peer.id)?.then((a) => a.message(m.text()))
    },
    close(peer: WsPeer) {
      void peers.get(peer.id)?.then((a) => a.close())
      peers.delete(peer.id)
    },
  }
}
