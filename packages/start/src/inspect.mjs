// `weft routes --meta` (research 20 §5, §10; research 25 §7) and the route half of `weft check`: every route's merged
// metadata and where its words came from, so an agent reviews every page's tags without a browser. Static routes run
// their loaders and render (one GET each, as a crawler's request would). Param routes run `meta` on placeholders
// (`params.id` is `<id>`, `data.name` is `<data.name>`), then on real samples: their `prerender` params and the links
// the rendered pages hold. Diagnostics H001–H007 and H011–H016 for each.

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createServer, parseSync } from 'vite'
import weft from '@weft-js/core/vite'
import weftStart, { startDir } from './vite.mjs'
import { deployUrl } from './derive.mjs'
import { compare } from './inspect/compare.mjs'
import { inspectRoutes } from './inspect/routes.mjs'
import { inspectSamples, inspectCards } from './inspect/samples.mjs'
import { filePath, scanRoutes } from './routes.mjs'

const quote = (s) => JSON.stringify(s)

/** `/users/$id` → a matcher for the concrete paths of that route. */
const matcher = (pattern) =>
  new RegExp(
    '^' +
      pattern
        .replace(/[.+?^(){}|[\]\\]/g, '\\$&')
        .replace(/\$[\w$]+/g, '[^/]+')
        .replace(/\$$/, '.+') +
      '/?$',
  )

/** The same-site paths a page links to. */
const links = (html) => [...html.matchAll(/\shref="(\/[^"#?]*)/g)].map((m) => m[1])

/** @param {string} code @param {string} file `{ present, reads }`: does the module export `meta`, and does it read `data` or `params`? */
export function metaExport(code, file) {
  let ast
  try {
    ast = parseSync(file, code, { lang: file.endsWith('x') ? 'tsx' : 'ts', sourceType: 'module' })
  } catch {
    return { present: true, reads: true }
  }
  for (const node of ast.program.body) {
    if (node.type !== 'ExportNamedDeclaration') continue
    if (node.specifiers?.some((s) => (s.exported?.name ?? s.exported?.value) === 'meta'))
      return { present: true, reads: true } // from elsewhere: can't tell
    const d = node.declaration
    if (!d) continue
    const decl =
      d.type === 'VariableDeclaration'
        ? d.declarations.find((x) => x.id?.name === 'meta')
        : d.id?.name === 'meta'
          ? d
          : undefined
    if (decl)
      return {
        present: true,
        reads: /\b(?:data|params|args|props)\b/.test(code.slice(decl.start, decl.end)),
      }
  }
  return { present: false, reads: false }
}

/** What to paste: the page's own words, as a starting point an agent improves. */
function metaSnippet(route, title, description) {
  if (route.params.length)
    return `export const meta: Meta<typeof load> = ({ data }) => ({ title: data.title, description: data.summary })`
  return `export const meta: Meta = { title: ${quote(title || 'What this page is')}, description: ${quote(description || 'One sentence on what this page gives the reader.')} }`
}

/**
 * Only what reading the source can tell, for an app whose routes can't run here (`weft check` falls back to it):
 * pages with no `meta`, and param routes whose `meta` reads neither `data` nor `params`.
 */
export function staticRouteChecks(root) {
  const manifest = scanRoutes(root)
  const out = []
  for (const route of manifest.routes) {
    if (route.kind !== 'page') continue
    const { present, reads } = metaExport(readFileSync(join(root, route.file), 'utf8'), route.file)
    const path = filePath(manifest, route)
    if (!present)
      out.push({
        code: 'H011',
        severity: 'warning',
        file: route.file,
        route: path,
        why: 'This page sets no `meta`, so its title and description come from what it renders. Words written for the page are better.',
        help: metaSnippet(route),
      })
    else if (route.params.length && !reads)
      out.push({
        code: 'H014',
        severity: 'warning',
        file: route.file,
        route: path,
        why: 'This route has params, but its `meta` reads neither `data` nor `params`: every page of it has the same tags.',
        help: metaSnippet(route),
      })
  }
  return out
}

function makeTaker(found, run, seen, manifest, pages) {
  /** One run of a real page: its diagnostics, and its place in the comparison. */
  return async (route, url, report) => {
    found.length = 0
    const r = await run(url)
    for (const d of found) report(d.code, d.severity, d.message.replace(/^H\d{3} /, ''))
    if (r.html)
      for (const href of links(r.html))
        if (!seen.has(href))
          seen.set(
            href,
            manifest.routes.find((x) => x.kind === 'page' && matcher(x.pattern).test(href))?.id,
          )
    if (r.status === 200 && !r.redirect)
      pages.push({
        route,
        url,
        title: r.head.title,
        description: r.head.description,
        source: r.source,
      })
    return r
  }
}

/**
 * @param {{ root: string, site?: object, preset?: string }} options `preset: 'static'` means no server at runtime (H002).
 */
export async function routesMeta({ root, site = {}, preset }) {
  root = resolve(root)
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, ws: false },
    plugins: [weft({ hydratable: true, csp: site?.csp }), weftStart({ root, site })],
  })
  try {
    const { manifest, modules } = await server.ssrLoadModule('virtual:weft/routes')
    const { createHandler, cardPath } = await server.ssrLoadModule(join(startDir, 'server.tsx'))
    const { mergeMeta, headTags } = await server.ssrLoadModule('@weft-js/core/ssr')
    await server.ssrLoadModule('virtual:weft/fns').catch(() => {})
    // An app's server code often validates its environment as it loads, and this may not be that environment. Its pages
    // can still be looked at: one that needs it answers 500, which is H016.
    const context = await server.ssrLoadModule('virtual:weft/context').then(
      (m) => m.default,
      () => undefined,
    )
    const found = []
    const known = deployUrl(site, process.env)
    const handler = createHandler({
      manifest,
      modules,
      site: known ? { ...site, url: known } : site,
      context,
      build: 'inspect',
      requestOrigin: false,
      onDiagnostic: (d) => found.push(d),
    })
    const run = (path) => handler.inspect(path, new Request(`http://weft.local${path}`))
    const out = []
    const diagnostics = []
    const pages = [] // { route, url, title, description, source }: what the rest compares
    const seen = new Map() // path → the route's id, from the links on rendered pages

    const take = makeTaker(found, run, seen, manifest, pages)

    const entries = []
    await inspectRoutes({
      root,
      manifest,
      modules,
      site,
      mergeMeta,
      cardPath,
      take,
      headTags,
      h006,
      diagnostics,
      out,
      entries,
      preset,
    })

    await inspectSamples(entries, modules, seen, take)
    await inspectCards(entries, manifest, found, handler)

    diagnostics.push(...compare({ root, entries, pages, site, known, metaExport, metaSnippet }))
    out.sort(
      (a, b) =>
        manifest.routes.findIndex((r) => r.file === a.file) -
        manifest.routes.findIndex((r) => r.file === b.file),
    )
    return {
      version: 1,
      ok: !diagnostics.some((d) => d.severity === 'error'),
      site,
      routes: out,
      diagnostics,
    }
  } finally {
    await server.close()
  }
}

/**
 * H006, statically: `meta` is plain data from `params` and `data`, so its source reads no `.value` and creates or calls
 * nothing reactive. The AST gives the export's exact source range.
 */
export function h006(code, file, report) {
  let ast
  try {
    ast = parseSync(file, code, { lang: file.endsWith('x') ? 'tsx' : 'ts', sourceType: 'module' })
  } catch {
    return
  }
  for (const node of ast.program.body) {
    if (node.type !== 'ExportNamedDeclaration' || !node.declaration) continue
    const d = node.declaration
    const decl =
      d.type === 'VariableDeclaration'
        ? d.declarations.find((x) => x.id?.name === 'meta')
        : d.id?.name === 'meta'
          ? d
          : undefined
    if (!decl) continue
    const src = code.slice(decl.start, decl.end)
    const hit =
      /\.value\b/.exec(src) ?? /\b(state|derived|resource|watch|use[A-Z]\w*)\s*\(/.exec(src)
    if (hit)
      report(
        `\`meta\` ${hit[0].startsWith('.') ? 'reads a box (`.value`)' : `calls \`${hit[1]}()\``}: metadata is plain data, computed once per request from \`params\` and \`data\`.`,
        file,
      )
  }
}
