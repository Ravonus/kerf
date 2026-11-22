// The app's page routes as `src/routes` lays them out, for the audit: which paths the app answers, and which pages a
// server renders with no parameters to fill in.

import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** Each route file under `src/routes`, as its path (`[id]` and `[...rest]` left in) and whether it is a page. */
function routeFiles(root) {
  const dir = join(root, 'src', 'routes')
  const out = []
  if (!existsSync(dir)) return out
  const walk = (at, prefix) => {
    for (const e of readdirSync(at, { withFileTypes: true })) {
      const name = e.name.replace(/^\(.*\)$/, '')
      if (e.isDirectory()) {
        walk(join(at, e.name), name ? `${prefix}/${name}` : prefix)
        continue
      }
      if (
        !/\.[jt]sx?$/.test(e.name) ||
        /\.(server|test|spec)\./.test(e.name) ||
        e.name.startsWith('_')
      )
        continue
      const leaf = e.name.replace(/\.[jt]sx?$/, '')
      const path = leaf === 'index' ? prefix : `${prefix}/${leaf}`
      // the root 404 is the not-found page, and `.http`/`.og` files answer requests without being pages
      const page = !(prefix === '' && leaf === '404') && !/\.(http|og)$/.test(leaf)
      out.push({ path, page })
    }
  }
  walk(dir, '')
  return out
}

/**
 * The app's own pages as a test on a path (`src/routes`, `[id]` and `[...rest]` included). A build served as files has
 * only its prerendered pages: a request for one of the others is the server's to answer, not a missing file.
 */
export function appRoutes(root) {
  const tests = routeFiles(root).map(({ path }) => {
    const re = path
      .split('/')
      .map((seg) =>
        /^\[\.\.\.\w+\]$/.test(seg)
          ? '\0'
          : /^\[\w+\]$/.test(seg)
            ? '[^/]+'
            : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      )
      .join('/')
      .replace(/\/\0/g, '(?:/.+)?')
    return new RegExp(`^${re || ''}/?$`)
  })
  return (path) => tests.some((t) => t.test(path))
}

/** The app's pages a server answers with no parameters to fill in: `/`, `/about`, not `/docs/[slug]`. */
export function staticRoutes(root) {
  const paths = routeFiles(root)
    .filter((r) => r.page && !r.path.includes('['))
    .map((r) => r.path || '/')
  return [...new Set(paths)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}
