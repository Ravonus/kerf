// The release-owned schema contract shared by shell routes and their browser entry.
import type { MetaObject } from './index'

/** The Standard Schema v1 interface used to check JSON, on both the peer and the browser. */
export interface RouteSchema<T = unknown> {
  readonly '~standard': {
    readonly version: 1
    validate(
      value: unknown,
    ):
      | { readonly value: T }
      | { readonly issues: readonly { readonly message: string }[] }
      | PromiseLike<
          { readonly value: T } | { readonly issues: readonly { readonly message: string }[] }
        >
  }
}

/** Export as `routeData` from a shell-mode level with a loader. Deferred keys are top-level loader promises. */
export interface RouteDataSchema {
  readonly initial: RouteSchema
  readonly deferred?: Readonly<Record<string, RouteSchema>>
}

/** Export as `meta` in a shell-mode route. Data contains only the validated, immediate fields. */
export type ShellMeta<Data = unknown, Params = Record<string, string>> =
  | MetaObject
  | ((args: { data: Data; params: Params }) => MetaObject | Promise<MetaObject>)

/** A loader's redirect signal. The release maps its id to a local path. */
export class RouteRedirect<Id extends string = string> extends Error {
  constructor(readonly id: Id) {
    super('Route redirect')
  }
}

/** Return or throw from a shell loader. Type the id with the keys of the release's redirect table. */
export function routeRedirect<Id extends string>(id: Id): RouteRedirect<Id> {
  return new RouteRedirect(id)
}

const localBase = 'https://kerf.invalid'

/** Refine URL fields with this check. Allows root-relative URLs and exact, explicitly allowed HTTPS origins. */
export function isRouteUrl(value: unknown, origins: readonly string[] = []): value is string {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\\\p{Cc}<>]/u.test(value))
    return false
  const local = value.startsWith('/')
  if (local ? value.startsWith('//') : !/^https:\/\/[^/@?#]+(?:[/?#]|$)/.test(value)) return false
  try {
    const url = new URL(value, localBase)
    if (url.username || url.password) return false
    // Encoded separators and nested escapes can be decoded by downstream route handlers.
    if (/%(?:2f|5c|25[\da-f]{2})/i.test(url.pathname)) return false
    if (/\p{Cc}/u.test(decodeURIComponent(url.pathname))) return false
    return local
      ? url.origin === localBase && !url.pathname.startsWith('//')
      : url.protocol === 'https:' && origins.includes(url.origin)
  } catch {
    return false
  }
}
