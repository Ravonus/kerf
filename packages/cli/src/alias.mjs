// An app's import aliases are its own: tsconfig `paths` (which Vite follows too), plus package.json `imports` if it has
// them. `#/*` is only what create-weft writes. `local` is how the checks follow a project import, so an aliased file
// gets the same analysis as a relative one.

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import ts from 'typescript'

const cache = new Map()

/** `{ prefix, suffix, target }` for each alias declared in `dir`, longest prefix first; `target` has a `*` to fill. */
function rulesIn(dir) {
  const rules = []
  const add = (pattern, target) => {
    const [prefix, suffix = ''] = pattern.split('*')
    rules.push({ prefix, suffix, exact: !pattern.includes('*'), target })
  }
  const tsconfig = join(dir, 'tsconfig.json')
  if (existsSync(tsconfig)) {
    const host = { ...ts.sys, readDirectory: () => [] }
    const { options } = ts.parseJsonConfigFileContent(ts.readConfigFile(tsconfig, path => ts.sys.readFile(path)).config, host, dir)
    const base = options.pathsBasePath ?? options.baseUrl ?? dir
    for (const [pattern, [target]] of Object.entries(options.paths ?? {})) add(pattern, resolve(base, target))
  }
  const pkg = join(dir, 'package.json')
  if (existsSync(pkg)) {
    for (const [pattern, target] of Object.entries(JSON.parse(readFileSync(pkg, 'utf8')).imports ?? {})) {
      if (typeof target === 'string' && target.startsWith('.')) add(pattern, resolve(dir, target))
    }
  }
  return rules.sort((a, b) => b.prefix.length - a.prefix.length)
}

/** The rules of the nearest project root above `dir`. */
function rulesFor(dir) {
  if (cache.has(dir)) return cache.get(dir)
  const parent = dirname(dir)
  const isRoot = existsSync(join(dir, 'tsconfig.json')) || existsSync(join(dir, 'package.json'))
  const rules = isRoot ? rulesIn(dir) : parent === dir ? [] : rulesFor(parent)
  cache.set(dir, rules)
  return rules
}

/** The absolute path a project import points at, before extensions; null for a package. */
export function local(fromAbs, spec) {
  if (spec.startsWith('.')) return join(dirname(fromAbs), spec)
  for (const { prefix, suffix, exact, target } of rulesFor(dirname(fromAbs))) {
    if (exact ? spec === prefix : spec.startsWith(prefix) && spec.endsWith(suffix)) {
      return exact ? target : target.replace('*', spec.slice(prefix.length, spec.length - suffix.length))
    }
  }
  return null
}

/** The prefix that maps to `<root>/src/`, like `#/`; null when the app has none. */
export function sourceAlias(root) {
  const rule = rulesFor(resolve(root)).find(r => r.target === join(resolve(root), 'src', '*') && !r.suffix)
  return rule?.prefix ?? null
}
