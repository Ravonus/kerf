// `#/` is the app's source alias: `imports` in package.json for Vite, `paths` in tsconfig for tsc. `local` is how the
// checks follow a project import, so an aliased file gets the same analysis as a relative one.

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const roots = new Map()

/** The nearest package.json's `#/*` target directory, absolute. */
function aliasDir(from) {
  if (roots.has(from)) return roots.get(from)
  const file = join(from, 'package.json')
  const parent = dirname(from)
  let dir
  if (existsSync(file)) {
    const target = JSON.parse(readFileSync(file, 'utf8')).imports?.['#/*']
    if (typeof target === 'string' && target.endsWith('/*')) dir = join(from, target.slice(0, -2))
  } else if (parent !== from) dir = aliasDir(parent)
  roots.set(from, dir)
  return dir
}

/** The absolute path a project import points at, before extensions; null for a package. */
export function local(fromAbs, spec) {
  if (spec.startsWith('.')) return join(dirname(fromAbs), spec)
  if (!spec.startsWith('#/')) return null
  const dir = aliasDir(dirname(fromAbs))
  return dir ? join(dir, spec.slice(2)) : null
}

export const isLocal = spec => spec.startsWith('.') || spec.startsWith('#/')
