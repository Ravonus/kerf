// A page's stylesheets as two files: what every route shares, and what its own route adds, each hashed and cached for
// good. A build splits CSS by chunk, so a page would link 5 to 11 sheets. Only what's on every route is shared, so no
// route's CSS can reach a page it wasn't written for. The chunks' own sheets stay: a client route change fetches those.

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

/** A relative `url()` means something else from another file, and that file keeps its own link. */
const movable = css => !/url\(\s*(?!["']?(?:\/|data:|https?:|#|%23))/.test(css) && !/@import\b/.test(css)

/**
 * @param {string[][]} routes  each route's sheets, in cascade order
 * @param {(name: string) => string} text
 */
export function planSheets(routes, text) {
  const files = {}
  const join = has => {
    if (!has.length) return undefined
    const css = has.map(text).join('')
    const file = `assets/sheet-${createHash('sha256').update(css).digest('base64url').slice(0, 8)}.css`
    files[file] = css
    return { file, has }
  }
  const everywhere = n => routes.every(r => r.includes(n))
  const shared = join([...new Set(routes.flat())].filter(n => everywhere(n) && movable(text(n))))
  const seen = new Map()
  for (const list of routes) {
    const route = join([...new Set(list)].filter(n => !everywhere(n) && movable(text(n))))
    if (route) seen.set(route.file, route)
  }
  return { shared, routes: [...seen.values()], files }
}

const FROM = /(?:^|\n)\s*(?:import|export)\s[^'"\n]*?from\s+['"](\.[^'"]+)['"]/g
const EXTS = ['', '.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts']

/** The app's own source files `files` import: where the islands a route can show are declared. */
export function reach(files) {
  const seen = new Set()
  const walk = f => {
    if (seen.has(f)) return
    seen.add(f)
    for (const [, spec] of readFileSync(f, 'utf8').matchAll(FROM)) {
      const to = EXTS.map(e => resolve(dirname(f), spec) + e).find(c => /\.[jt]sx?$/.test(c) && existsSync(c))
      if (to) walk(to)
    }
  }
  files.filter(existsSync).forEach(walk)
  return seen
}

/** Which of the plan's sheets a page's list goes in. What neither holds keeps its own link. */
export function pick(plan, list) {
  const left = new Set(list)
  const out = []
  if (plan.shared?.has.some(n => left.has(n))) {
    out.push(plan.shared)
    plan.shared.has.forEach(n => left.delete(n))
  }
  let best, most = 0
  for (const r of plan.routes) {
    const hits = r.has.filter(n => left.has(n)).length
    if (hits > most && r.has.every(n => list.includes(n) || left.has(n))) { best = r; most = hits }
  }
  if (!best) for (const r of plan.routes) { // a route's sheet may hold a little more than this page showed: never another route's
    const hits = r.has.filter(n => left.has(n)).length
    if (hits > most) { best = r; most = hits }
  }
  if (best) {
    out.push(best)
    best.has.forEach(n => left.delete(n))
  }
  return { sheets: out, rest: list.filter(n => left.has(n)) }
}
