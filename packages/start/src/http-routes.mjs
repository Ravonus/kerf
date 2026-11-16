// HTTP modules have their own table: neither page hydration nor client routing may import them.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from './vite/syntax.mjs'

/** The web methods an HTTP module can export, in Allow order. */
export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

/** @typedef {{ file: string, path: string, pattern: string, params: string[], methods: string[], rank: number[] }} HttpEntry */

function methods(file) {
  const ast = parse(file, readFileSync(file, 'utf8'))
  if (ast.errors.length) throw new SyntaxError(`${file}: ${ast.errors[0].message}`)
  const names = new Set()
  for (const n of ast.program.body) {
    if (n.type !== 'ExportNamedDeclaration' || n.exportKind === 'type') continue
    const d = n.declaration
    if (d?.type === 'VariableDeclaration') for (const v of d.declarations) names.add(v.id?.name)
    else if (d?.id) names.add(d.id.name)
    for (const s of n.specifiers ?? [])
      if (s.exportKind !== 'type') names.add(s.exported.name ?? s.exported.value)
  }
  return HTTP_METHODS.filter((m) => names.has(m))
}

const shape = (pattern) => pattern.replace(/\$\$$/, '$').replace(/\$[\w$]+/g, '$param')

function segmentsOf(segments) {
  const params = [],
    parts = [],
    rank = []
  let bad = false
  for (const [i, s] of segments.entries()) {
    const optional = /^\[\[\.\.\.([A-Za-z_$][\w$]*)\]\]$/.exec(s)
    const param = /^\[(\.\.\.)?([A-Za-z_$][\w$]*)\]$/.exec(s)
    const name = optional?.[1] ?? param?.[2]
    const rest = !!optional || !!param?.[1]
    if (name) {
      if (params.includes(name) || (rest && i !== segments.length - 1)) bad = true
      params.push(name)
      parts.push(rest ? (optional ? '$$' : '$') : `$${name}`)
      rank.push(rest ? 0 : 1)
    } else {
      if (!s || /[[\]]/.test(s)) bad = true
      parts.push(s)
      rank.push(2)
    }
  }
  return { params, pattern: '/' + parts.join('/'), rank, bad }
}

function rankRoutes(a, b) {
  for (let i = 0; i < Math.max(a.rank.length, b.rank.length); i++) {
    const delta = (b.rank[i] ?? 3) - (a.rank[i] ?? 3)
    if (delta) return delta
  }
  return a.file.localeCompare(b.file)
}

/** Build and validate the HTTP table alongside the page manifest, without evaluating app code. */
export function httpRoutes(files, manifest, rel) {
  const out = []
  const problem = (file, code, message) => manifest.problems.push({ file, code, message })
  for (const f of files) {
    if (!/\.http\.[jt]s$/.test(f)) continue
    const file = rel(f)
    const segments = f.replace(/\.http\.[jt]s$/, '').split('/')
    if (segments[0] === '_kerf') {
      problem(file, 'H019', '/_kerf/ is reserved for Kerf endpoints. Choose a public app path.')
      continue
    }
    if (segments.some((s) => s.startsWith('_'))) continue
    if (segments.at(-1) === 'index') segments.pop()
    const { bad, ...parsed } = segmentsOf(segments)
    const exported = methods(join(manifest.root, file))
    if (bad || !exported.length) {
      problem(
        file,
        'H019',
        'Use whole [param] segments, a final [...rest] or [[...rest]], and named HTTP method exports outside /_kerf/.',
      )
      continue
    }
    const route = { file, path: '/' + segments.join('/'), ...parsed, methods: exported }
    const canonical = shape(route.pattern)
    const page = manifest.routes.find((r) => r.kind === 'page' && shape(r.pattern) === canonical)
    const other = out.find((r) => shape(r.pattern) === canonical)
    if (page && exported.some((m) => m === 'GET' || m === 'HEAD'))
      problem(
        file,
        'H018',
        `${file} and ${page.file} both handle GET or HEAD at ${route.path}. Keep only non-GET/HEAD methods beside a page, or move the route.`,
      )
    if (other)
      problem(
        file,
        'H018',
        `${file} and ${other.file} declare the same HTTP path. Combine their methods in one module.`,
      )
    out.push(route)
  }
  return out.sort(rankRoutes)
}
