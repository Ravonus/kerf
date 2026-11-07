// File routes (research 25 §2): `src/routes` → a route manifest, plain data that the server, the client table, the
// Vite plugin and `weft routes` all read. Conventions:
//
//   index.tsx              /
//   about.tsx              /about
//   users/[id].tsx         /users/:id        (router-core path `/users/$id`)
//   docs/[...rest].tsx     /docs/*           (router-core splat `$`, the param is `rest`)
//   _layout.tsx            wraps every route in its directory and below (the root one wraps the whole app)
//   404.tsx                the not-found page (root only), rendered inside the root layout with status 404
//   _error.tsx             the error page (root only), rendered inside the root layout with status 500
//   users/[id].og.tsx      the share card of `users/[id]` (research 20 §4); `_default.og.tsx` replaces the built-in card
//
// Any other file or directory starting with `_` is ignored, and so are tests. A route module may export `default`
// (the component), `load`, `meta` and `prerender` (research 20 §3, §4.3).

import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const EXT = /\.(tsx|jsx|ts|js)$/
const posix = (p) => p.split('\\').join('/')

/**
 * @typedef {{ id: string, file: string, layouts: string[], path: string, pattern: string, params: string[], splat?: string, rank: number[], card?: string, kind: 'page' | '404' | 'error' }} RouteEntry
 * @typedef {{ id: string, file: string, dir: string, parent?: string }} LayoutEntry
 * @typedef {{ root: string, dir: string, routes: RouteEntry[], layouts: LayoutEntry[], defaultCard?: string, problems: { file: string, message: string }[] }} Manifest
 */

/** Scan `<root>/src/routes` (or `dir`). Paths in the manifest are relative to `root`, POSIX-style. */
export function scanRoutes(root, dir = join(root, 'src', 'routes')) {
  /** @type {Manifest} */
  const out = { root, dir: posix(relative(root, dir)), routes: [], layouts: [], problems: [] }
  if (!existsSync(dir)) return out
  const files = []
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const abs = join(d, name)
      if (statSync(abs).isDirectory()) {
        if (!name.startsWith('_') && !name.startsWith('.')) walk(abs)
      } else if (EXT.test(name) && !/\.(test|spec)\.|\.d\.ts$/.test(name))
        files.push(posix(relative(dir, abs)))
    }
  }
  walk(dir)

  const rel = (f) => posix(relative(root, join(dir, f)))
  const layoutFile = new Map() // route dir ('' = root) → its _layout file
  for (const f of files) {
    const m = /^(?:(.*)\/)?_layout\.[jt]sx?$/.exec(f)
    if (m) layoutFile.set(m[1] ?? '', f)
  }
  const layoutOf = new Map([...layoutFile.keys()].map((d) => [d, `layout:${d}`]))
  for (const [d, f] of [...layoutFile].sort((a, b) => a[0].length - b[0].length)) {
    out.layouts.push({
      id: layoutOf.get(d),
      file: rel(f),
      dir: d,
      parent: chain(d, layoutOf).at(-2),
    })
  }

  const cards = new Map()
  for (const f of files) {
    const m = /^(.*)\.og\.[jt]sx?$/.exec(f)
    if (!m) continue
    if (m[1] === '_default') out.defaultCard = rel(f)
    else cards.set(m[1], rel(f))
  }

  appendRoutes(files, out, rel, layoutOf, cards)
  out.routes.sort((a, b) => cmpRank(a.rank, b.rank) || a.id.localeCompare(b.id))
  for (const [b, file] of cards)
    if (!out.routes.some((r) => r.card === file))
      out.problems.push({ file, message: `no route \`${b}\` for this card` })
  return out
}

function appendRoutes(files, out, rel, layoutOf, cards) {
  for (const f of files) {
    const base = f.replace(EXT, '')
    const name = base.split('/').pop()
    if (base.endsWith('.og') || name === '_layout' || name === '_default') continue
    const d = base.includes('/') ? base.slice(0, base.lastIndexOf('/')) : ''
    if (name === '404' || name === '_error') {
      if (d) {
        out.problems.push({
          file: rel(f),
          message: `\`${name}\` is only read at the routes root for now; this one is ignored`,
        })
        continue
      }
      out.routes.push({
        id: name === '404' ? '404' : 'error',
        file: rel(f),
        layouts: chain('', layoutOf),
        path: '',
        pattern: '',
        params: [],
        rank: [],
        kind: name === '404' ? '404' : 'error',
      })
      continue
    }
    if (name.startsWith('_') || d.split('/').some((s) => s.startsWith('_'))) continue
    const segs = base === 'index' ? [] : base.split('/')
    if (segs.at(-1) === 'index') segs.pop()
    const params = []
    let splat
    const parts = []
    let bad = false
    for (const s of segs) {
      const p = /^\[(\.\.\.)?([A-Za-z_$][\w$]*)\]$/.exec(s)
      if (p) {
        if (p[1]) splat = p[2]
        params.push(p[2])
        parts.push(p[1] ? '$' : `$${p[2]}`)
      } else if (/[[\]]/.test(s)) bad = true
      else parts.push(s)
    }
    if (bad) {
      out.problems.push({
        file: rel(f),
        message: 'a segment mixes text and a `[param]`; use a whole segment `[name]`',
      })
      continue
    }
    if (splat && parts.at(-1) !== '$') {
      out.problems.push({ file: rel(f), message: '`[...rest]` must be the last segment' })
      continue
    }
    const pattern = '/' + parts.join('/')
    out.routes.push({
      id: pattern,
      file: rel(f),
      layouts: chain(d, layoutOf),
      path: '/' + segs.join('/'),
      pattern,
      params,
      splat,
      // Static segments outrank params, params outrank a splat (router-core's order; the client table uses it).
      rank: parts.map((p) => (p === '$' ? 0 : p.startsWith('$') ? 1 : 2)),
      card: cards.get(base),
      kind: 'page',
    })
  }
}

/** Layout ids from the root down to `d`. */
function chain(d, layoutOf) {
  const out = []
  const parts = d ? d.split('/') : []
  for (let i = 0; i <= parts.length; i++) {
    const id = layoutOf.get(parts.slice(0, i).join('/'))
    if (id) out.push(id)
  }
  return out
}

function cmpRank(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    // Shorter after: `/users/new` is tried before `/users/$id/edit`… only on ties. But a splat also matches nothing, so
    // the route it would extend comes first: `/docs` before `/docs/$`, or the splat takes `/docs` itself.
    if (a[i] === undefined) return b[i] === 0 && b.length === i + 1 ? -1 : 1
    if (b[i] === undefined) return a[i] === 0 && a.length === i + 1 ? 1 : -1
    if (a[i] !== b[i]) return b[i] - a[i]
  }
  return 0
}

/** `/users/$id` with `{ id: '42' }` → `/users/42`; a splat fills `$`. */
export function fillPath(pattern, params) {
  return pattern.replace(/\$([\w$]*)/g, (_, name) => {
    const v = params[name || '_splat'] ?? params[name]
    return name ? encodeURIComponent(String(v)) : String(v ?? '')
  })
}

/** A route's file path as authors write it in types: `src/routes/users/[id].tsx` → `/users/[id]`, `index.tsx` → `/`. */
export function filePath(manifest, route) {
  return (
    '/' +
    route.file
      .slice(manifest.dir.length + 1)
      .replace(EXT, '')
      .replace(/(^|\/)index$/, '')
  )
}

/** `.weft/routes.d.ts`: every route path, so `RouteProps<…, '/users/[id]'>` and `Meta<…, path>` only take real ones. */
export function routeTypes(manifest) {
  const pages = manifest.routes.filter((r) => r.kind === 'page')
  const lines = pages.map((r) => `    '${filePath(manifest, r)}': true`)
  return `// Generated by weft from ${manifest.dir}. Do not edit.\nimport '@weft-js/start'\ndeclare module '@weft-js/start' {\n  interface RouteFiles {\n${lines.join('\n')}\n  }\n}\n`
}
