// Project file discovery with a small glob (`**`, `*`, `?`, `{a,b}`), relative to the project root.

import { readdirSync } from 'node:fs'
import { join } from 'node:path'

const skipDirs = new Set([
  'public',
  'node_modules',
  '.git',
  '.weft',
  '.output',
  'dist',
  'coverage',
  'target',
])

export function globToRegExp(glob) {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*' && glob[i + 1] === '*') {
      re += glob[i + 2] === '/' ? '(?:.*/)?' : '.*'
      i += glob[i + 2] === '/' ? 2 : 1
    } else if (c === '*') re += '[^/]*'
    else if (c === '?') re += '[^/]'
    else if (c === '{') {
      const end = glob.indexOf('}', i)
      re += `(?:${glob
        .slice(i + 1, end)
        .split(',')
        .map((s) => s.replace(/[.+^$()|[\]\\]/g, '\\$&'))
        .join('|')})`
      i = end
    } else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`)
}

export const matcher = (globs) => {
  const res = (globs ?? []).map(globToRegExp)
  return (path) => res.some((re) => re.test(path))
}

/** Relative posix paths under `root` matching `include` and none of `exclude`. Sorted, so output is stable. */
export function discover(root, { include = ['**/*.{tsx,jsx}'], exclude = [] } = {}) {
  const inc = matcher(include)
  const exc = matcher(exclude)
  /** @type {string[]} */
  const out = []
  const walk = (rel) => {
    for (const ent of readdirSync(join(root, rel), { withFileTypes: true })) {
      const path = rel ? `${rel}/${ent.name}` : ent.name
      if (ent.isDirectory()) {
        if (!skipDirs.has(ent.name) && !exc(path) && !exc(`${path}/`)) walk(path)
      } else if (inc(path) && !exc(path)) out.push(path)
    }
  }
  walk('')
  return out.sort()
}
