import { esc } from '@kerf-js/core/markup'
export { esc } from '@kerf-js/core/markup'

export const json = (v: unknown) => JSON.stringify(v ?? null).replace(/</g, '\\u003c')
/**
 * A redirect's body. A server's 3xx is followed by its `location`; a prerendered one is a file on a static host, and this
 * is what that file says: go now, and the address to index. No stylesheet, so no view transition starts on a page
 * that never paints (Chrome aborts it, and logs an InvalidStateError).
 */
export const moved = (href: string) =>
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Moved</title><meta name="robots" content="noindex"><link rel="canonical" href="${esc(href)}"><meta http-equiv="refresh" content="0; url=${esc(href)}"><a href="${esc(href)}">Moved here</a>`
export const thenable = (v: unknown): v is PromiseLike<unknown> =>
  typeof (v as Partial<PromiseLike<unknown>> | null | undefined)?.then === 'function'

/** `/` → `index`, `/users/42` → `users/42`: the card path under `/_kerf/og/`. */
export const cardPath = (path: string) =>
  path.replace(/[?#].*/, '').replace(/^\/+|\/+$/g, '') || 'index'

/** FNV-1a, twice (different seeds), in base 36: a stable, sync content hash for `?v=`. */
export function hash(s: string): string {
  let a = 0x811c9dc5,
    b = 0x01000193 ^ 0x5bd1e995
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    a = Math.imul(a ^ c, 0x01000193)
    b = Math.imul(b ^ c, 0x5bd1e995)
  }
  return ((a >>> 0).toString(36) + (b >>> 0).toString(36)).slice(0, 10)
}
