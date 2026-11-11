// Two request-level helpers for publishing flows: `after` (work once the response is out) and `preview` (a visitor who
// sees a draft: their reads skip the shared cache, so nothing they see reaches anyone else).
import { server } from './foundation'
import { StartError } from './primitives'

const COOKIE = 'weft-preview'

/**
 * Run `fn` once this response is finished: after the page has streamed or the call has answered. The visitor never
 * waits for it. A preview's rollback, a snapshot to write, a push to send. Outside a request it runs at once.
 */
export function after(fn: () => unknown): void {
  const scope = server()
  if (!scope || scope.finished) {
    queueMicrotask(() => void fn())
    return
  }
  scope.after.push(fn)
}

const here = (what: string) => {
  const scope = server()
  if (!scope)
    throw new StartError('Q017', `\`preview.${what}\` needs a request`, 'call it in a server function or a `load`')
  return scope
}

/**
 * Preview mode, on a cookie. `start(value)` turns it on for this browser (the value is the app's: a draft's id), `stop()`
 * turns it off, `id()` reads it. While it's on, every query runs fresh: no shared cache read or written. Deciding who may
 * preview, and what the value shows, is the app's (its context reads `preview.id()` and checks the user).
 */
export const preview = {
  id(): string | undefined {
    const scope = server()
    const m = scope?.request.headers.get('cookie')?.match(/(?:^|;\s*)weft-preview=([^;]+)/)
    return m ? decodeURIComponent(m[1]!) : undefined
  },
  start(value: string) {
    const scope = here('start')
    const secure = scope.request.url.startsWith('https:') ? '; Secure' : ''
    scope.headers.append(
      'set-cookie',
      `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax${secure}`,
    )
  },
  stop() {
    here('stop').headers.append('set-cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
  },
}
