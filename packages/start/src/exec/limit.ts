import { CLIENT_IP, StartError, type Context, type Fn } from '../data'
import type { Scope, Store } from './scope'

/**
 * A function's `limit`: one more call by this caller, refused with 429 (Q019) and `Retry-After` once it's over. The
 * caller is the signed-in user, or the client's address (`by: 'ip'`, or no one signed in).
 */
export async function limitCall(fn: Fn, ctx: Context, scope: Scope, store: Store) {
  const rule = fn.def.limit
  if (!rule || !store.consume) return
  const user = (ctx as { user?: { id?: string | number } | null }).user?.id
  const who =
    rule.by !== 'ip' && user != null
      ? `u:${user}`
      : `ip:${scope.request.headers.get(CLIENT_IP) ?? 'unknown'}`
  const { allowed, retryAfter } = await store.consume(`limit:${fn.$id}:${who}`, rule)
  if (allowed) return
  scope.headers.set('retry-after', String(retryAfter ?? rule.window))
  throw new StartError(
    'Q019',
    `\`${fn.$id}\` was called too often (${rule.max} per ${rule.window} s)`,
    `wait ${retryAfter ?? rule.window} s`,
    { status: 429 },
  )
}
