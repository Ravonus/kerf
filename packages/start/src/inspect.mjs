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
import { deployUrl, descriptionProblem } from './derive.mjs'
import { filePath, scanRoutes } from './routes.mjs'

/** A param route's real pages to run, at most: enough to compare them, and few enough for `weft check`. */
const SAMPLES = 50
const quote = s => JSON.stringify(s)
const short = (s, n = 70) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

/** `/users/$id` → a matcher for the concrete paths of that route. */
const matcher = pattern => new RegExp('^' + pattern.replace(/[.+?^(){}|[\]\\]/g, '\\$&').replace(/\$[\w$]+/g, '[^/]+').replace(/\$$/, '.+') + '/?$')
const fillPath = (route, params) => route.pattern.replace(/\$([\w$]*)/g, (_, n) => String(params[n || route.splat]))

/** The same-site paths a page links to. */
const links = html => [...html.matchAll(/\shref="(\/[^"#?]*)/g)].map(m => m[1])

/** @param {string} code @param {string} file `{ present, reads }`: does the module export `meta`, and does it read `data` or `params`? */
export function metaExport(code, file) {
  let ast
  try { ast = parseSync(file, code, { lang: file.endsWith('x') ? 'tsx' : 'ts', sourceType: 'module' }) } catch { return { present: true, reads: true } }
  for (const node of ast.program.body) {
    if (node.type !== 'ExportNamedDeclaration') continue
    if (node.specifiers?.some(s => (s.exported?.name ?? s.exported?.value) === 'meta')) return { present: true, reads: true } // from elsewhere: can't tell
    const d = node.declaration
    if (!d) continue
    const decl = d.type === 'VariableDeclaration' ? d.declarations.find(x => x.id?.name === 'meta') : d.id?.name === 'meta' ? d : undefined
    if (decl) return { present: true, reads: /\b(?:data|params|args|props)\b/.test(code.slice(decl.start, decl.end)) }
  }
  return { present: false, reads: false }
}

/** What to paste: the page's own words, as a starting point an agent improves. */
function metaSnippet(route, title, description) {
  if (route.params.length) return `export const meta: Meta<typeof load> = ({ data }) => ({ title: data.title, description: data.summary })`
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
    if (!present) out.push({ code: 'H011', severity: 'warning', file: route.file, route: path, why: 'This page sets no `meta`, so its title and description come from what it renders. Words written for the page are better.', help: metaSnippet(route) })
    else if (route.params.length && !reads) out.push({ code: 'H014', severity: 'warning', file: route.file, route: path, why: 'This route has params, but its `meta` reads neither `data` nor `params`: every page of it has the same tags.', help: metaSnippet(route) })
  }
  return out
}

/**
 * @param {{ root: string, site?: object, preset?: string }} options `preset: 'static'` means no server at runtime (H002).
 */
export async function routesMeta({ root, site = {}, preset }) {
  root = resolve(root)
  const server = await createServer({
    root, configFile: false, logLevel: 'silent', appType: 'custom',
    server: { middlewareMode: true, hmr: false, ws: false },
    plugins: [weft({ hydratable: true }), weftStart({ root, site })],
  })
  try {
    const { manifest, modules } = await server.ssrLoadModule('virtual:weft/routes')
    const { createHandler, cardPath } = await server.ssrLoadModule(join(startDir, 'server.tsx'))
    const { mergeMeta, headTags } = await server.ssrLoadModule('@weft-js/core/ssr')
    await server.ssrLoadModule('virtual:weft/fns').catch(() => {})
    // An app's server code often validates its environment as it loads, and this may not be that environment. Its pages
    // can still be looked at: one that needs it answers 500, which is H016.
    const context = await server.ssrLoadModule('virtual:weft/context').then(m => m.default, () => undefined)
    const found = []
    const known = deployUrl(site, process.env)
    const handler = createHandler({ manifest, modules, site: known ? { ...site, url: known } : site, context, build: 'inspect', requestOrigin: false, onDiagnostic: d => found.push(d) })
    const run = path => handler.inspect(path, new Request(`http://weft.local${path}`))
    const out = []
    const diagnostics = []
    const pages = [] // { route, url, title, description, source }: what the rest compares
    const seen = new Map() // path → the route's id, from the links on rendered pages

    /** One run of a real page: its diagnostics, and its place in the comparison. */
    const take = async (route, url, report) => {
      found.length = 0
      const r = await run(url)
      for (const d of found) report(d.code, d.severity, d.message.replace(/^H\d{3} /, ''))
      if (r.html) for (const href of links(r.html)) if (!seen.has(href)) seen.set(href, manifest.routes.find(x => x.kind === 'page' && matcher(x.pattern).test(href))?.id)
      if (r.status === 200 && !r.redirect) pages.push({ route, url, title: r.head.title, description: r.head.description, source: r.source })
      return r
    }

    const entries = []
    for (const route of [...manifest.routes].sort((a, b) => a.params.length - b.params.length)) {
      const mod = modules[route.file] ?? {}
      const layouts = route.layouts.map(id => manifest.layouts.find(l => l.id === id))
      const entry = { path: route.kind === 'page' ? filePath(manifest, route) : route.kind, kind: route.kind, file: route.file, layouts: layouts.map(l => l.file), params: route.params }
      const report = (code, severity, why, help) => diagnostics.push({ code, severity, file: route.file, route: entry.path, why, ...(help && { help }) })
      for (const f of [route.file, ...entry.layouts]) h006(readFileSync(join(root, f), 'utf8'), f, (why, file) => diagnostics.push({ code: 'H006', severity: 'error', file, route: entry.path, why }))
      let head, status, url, data, redirect, source
      if (route.kind !== 'page') {
        const metas = [...layouts.map(l => modules[l.file]?.meta), mod.meta ?? { title: route.kind === '404' ? 'Not found' : 'Error' }]
        head = mergeMeta(site, ...(await Promise.all(metas.map(m => (typeof m === 'function' ? m({ params: {}, data: placeholder('data') }) : m)))))
        head.og.image = undefined
        status = route.kind === '404' ? 404 : 500
        url = null
        data = 'none'
      } else if (!route.params.length) {
        const r = await take(route, route.pattern, report)
        ;({ head, status, source } = r)
        redirect = r.redirect?.href
        url = route.pattern
        data = 'loaded'
        if (status >= 500) report('H016', 'info', `This page answered ${status} here, so its metadata wasn't checked. It may need a database or an environment \`weft check\` doesn't have.`)
      } else {
        const params = Object.fromEntries(route.params.map(p => [p, `<${p}>`]))
        url = route.pattern.replace(/\$([\w$]*)/g, (_, n) => `<${n || route.splat}>`)
        const metas = []
        for (const m of [...layouts.map(l => modules[l.file]?.meta), mod.meta]) {
          // `meta` can do what placeholders can't (`data.tags.join()`), and that's no fault: the samples run it for real.
          try { metas.push(typeof m === 'function' ? await m({ params, data: placeholder('data') }) : m) } catch {}
        }
        head = mergeMeta(site, ...metas)
        if (head.og.image === 'auto') head.og.image = { url: `/_weft/og/${cardPath(url)}.png?v=<hash>`, width: 1200, height: 630 }
        status = 200
        data = 'placeholder'
      }
      const image = head.og.image
      entry.url = url
      entry.status = status
      if (redirect !== undefined) {
        // `load` redirects (research 27 §3): the response has no body, so no tags and no card.
        Object.assign(entry, { redirect, data, card: null, image: 'none', meta: null, tags: [] })
        out.push(entry)
        continue
      }
      entry.data = data
      entry.card = route.kind !== 'page' ? null : route.card ?? manifest.defaultCard ?? 'built-in'
      entry.image = typeof image !== 'object' || !image ? 'none' : !image.url.startsWith('/_weft/og/') ? 'url' : !route.params.length ? 'build' : mod.prerender ? 'prerender+on-demand' : 'on-demand'
      entry.meta = JSON.parse(JSON.stringify(head))
      entry.tags = url ? headTags(head, url).map(([tag, attrs, text]) => (text === undefined ? [tag, attrs] : [tag, attrs, text])) : headTags(head, '/')
      if (source) entry.source = source
      // Route-level checks on the merged result (the config-level ones run in `weft check`).
      if (preset === 'static' && entry.image === 'on-demand') report('H002', 'error', 'A param route with a generated card on a static-only preset: export `prerender` with the params to build, or set `og.image`.')
      if (route.kind === 'page' && status === 200 && !route.params.length && !head.description) report('H003', 'warning', 'No description after merging the config, layouts and route.')
      entries.push({ route, entry, report })
      out.push(entry)
    }

    // The param routes' real pages: `prerender` first (what the build will make), then what rendered pages link to.
    for (const { route, entry, report } of entries) {
      if (route.kind !== 'page' || !route.params.length) continue
      const mod = modules[route.file] ?? {}
      let given = []
      try { given = (typeof mod.prerender === 'function' ? await mod.prerender() : mod.prerender) ?? [] } catch {}
      if (!Array.isArray(given)) given = []
      const urls = new Set(given.slice(0, SAMPLES).map(p => fillPath(route, p)))
      for (const [href, id] of seen) if (id === route.id && urls.size < SAMPLES) urls.add(href)
      entry.samples = []
      for (const u of urls) {
        const r = await take(route, u, report)
        if (r.status === 200 && !r.redirect) entry.samples.push({ url: u, title: r.head.title, description: r.head.description, image: typeof r.head.og.image === 'object' ? r.head.og.image?.url : undefined, source: r.source })
      }
      entry.source = entry.samples[0]?.source
      if (!entry.samples.length) report('H016', 'info', 'No real page of this route to look at, so only its source was checked. Export `prerender`, or link to one from a page.')
    }

    // H005 and H008: a card only says what's wrong with it when it's drawn, so one page of each route with its own draws.
    for (const { route, entry, report } of entries) {
      const image = entry.samples?.[0]?.image ?? entry.meta?.og?.image?.url
      if (!(route.card || manifest.defaultCard) || !image?.startsWith('/_weft/og/') || image.includes('<')) continue
      found.length = 0
      try { await handler(new Request(`http://weft.local${image}`)) } catch {}
      for (const d of found) if (d.code === 'H005' || d.code === 'H008') report(d.code, d.severity, d.message)
    }

    diagnostics.push(...compare(root, entries, pages, site, known))
    out.sort((a, b) => manifest.routes.findIndex(r => r.file === a.file) - manifest.routes.findIndex(r => r.file === b.file))
    return { version: 1, ok: !diagnostics.some(d => d.severity === 'error'), site, routes: out, diagnostics }
  } finally {
    await server.close()
  }
}

/** The checks that take every page at once: is each one's text its own, and is it text at all? */
function compare(root, entries, pages, site, known) {
  const out = []
  const push = (code, severity, route, why, extra) => out.push({ code, severity, file: route.file, route: route.path, why, ...extra })
  const byRoute = new Map()
  for (const p of pages) byRoute.set(p.route, [...(byRoute.get(p.route) ?? []), p])

  if (!known) out.push({ code: 'H001', severity: 'warning', file: 'weft.config.ts', route: '*', why: "`site.url` is not set: a build has no absolute URLs (no canonical, no og:url, a relative og:image), and a server takes them from the request's Host header. Crawlers don't resolve relative URLs." , help: 'Set `site.url` in weft.config.ts, or `WEFT_SITE_URL` in the deploy environment.' })

  for (const { route, entry } of entries) {
    if (route.kind !== 'page') continue
    const own = byRoute.get(route) ?? []
    const at = { file: route.file, path: entry.path }
    const first = own[0]
    const { present, reads } = metaExport(readFileSync(join(root, route.file), 'utf8'), route.file)
    const words = s => s === 'route' || s === 'layout'
    if (first && !(first.source.title === 'route' && first.source.description === 'route')) {
      const missing = [first.source.title !== 'route' && 'title', first.source.description !== 'route' && 'description'].filter(Boolean).join(' and ')
      const whence = (what, s, text) => `${what} ${s === 'auto' ? `comes from the page (${quote(short(text))})` : s === 'layout' ? 'comes from a layout' : s === 'config' ? 'is the site default' : 'is empty'}`
      push('H011', 'warning', at, `${present ? `\`meta\` sets no ${missing}` : 'This page sets no `meta`'}: the ${[first.source.title !== 'route' && whence('title', first.source.title, first.title), first.source.description !== 'route' && whence('description', first.source.description, first.description ?? '')].filter(Boolean).join(', and the ')}. That works, but words written for this page are better.`, { help: metaSnippet(route, first.source.title === 'auto' ? stripTemplate(first.title, site.title) : '', first.description) })
    } else if (!first && !present) push('H011', 'warning', at, 'This page sets no `meta`, so its title and description come from what it renders. Words written for the page are better.', { help: metaSnippet(route) })

    if (route.params.length && present && !reads) push('H014', 'warning', at, 'This route has params, but its `meta` reads neither `data` nor `params`: every page of it has the same tags.', { help: metaSnippet(route) })
    else if (route.params.length && own.length > 1) {
      const same = key => new Set(own.map(p => p[key])).size === 1 && own[0][key]
      for (const key of ['title', 'description']) if (same(key)) push('H014', 'warning', at, `All ${own.length} pages of this route looked at have the same ${key} (${quote(short(own[0][key]))}), so a share or a search result can't tell them apart.`, { help: metaSnippet(route) })
    }

    const longTitle = own.find(p => p.title.length > 60)
    if (longTitle) push('H004', 'warning', at, `The title is ${longTitle.title.length} characters (over 60): \`${longTitle.title}\`${own.length > 1 ? ` on ${longTitle.url}` : ''}.`)
    const longText = own.find(p => p.description && p.description.length > 160)
    if (longText) push('H004', 'warning', at, `The description is ${longText.description.length} characters (over 160)${own.length > 1 ? ` on ${longText.url}` : ''}.`)
    const bad = own.filter(p => p.description && words(p.source.description) && descriptionProblem(p.description))
    if (bad[0]) push('H015', 'warning', at, `The description ${own.length > 1 ? `of ${bad[0].url}${bad.length > 1 ? ` (and ${bad.length - 1} more)` : ''} ` : ''}isn't a sentence: ${descriptionProblem(bad[0].description)}: ${quote(short(bad[0].description))}.`, { help: 'Write one plain sentence on what the page gives the reader. Never slice raw markdown or code into `description`.' })
  }

  const clash = (key, code) => {
    const groups = new Map()
    for (const p of pages) if (p[key]) groups.set(p[key], [...(groups.get(p[key]) ?? []), p])
    for (const [text, list] of groups) {
      const routes = [...new Set(list.map(p => p.route))]
      if (routes.length < 2) continue // one param route's pages are H014's
      const what = key === 'title' ? 'title' : text === site.description ? 'description (the site default)' : 'description'
      const a = routes[0]
      push(code, 'warning', { file: a.file, path: list[0].url }, `${routes.length} routes share this ${what}: ${list.slice(0, 4).map(p => p.url).join(', ')}${list.length > 4 ? `, and ${list.length - 4} more` : ''} (${quote(short(text))}).`, { help: `Give each page its own ${key} in \`meta\`, from what is on it.` })
    }
  }
  clash('title', 'H012')
  clash('description', 'H013')
  return out
}

const stripTemplate = (title, template) => {
  const [a = '', b = ''] = template?.split('%s') ?? []
  return title.startsWith(a) && title.endsWith(b) ? title.slice(a.length, title.length - b.length) : title
}

/** `<data>`, `<data.name>`, `<data.user.name>`: reads become their own names, for meta run without a loader. */
function placeholder(path) {
  const text = `<${path}>`
  return new Proxy(function () {}, {
    get(_, k) {
      if (k === Symbol.toPrimitive || k === 'toString' || k === 'valueOf' || k === 'toJSON') return () => text
      if (typeof k === 'symbol') return undefined
      return placeholder(`${path}.${k}`)
    },
    apply: () => text,
  })
}

/**
 * H006, statically: `meta` is plain data from `params` and `data`, so its source reads no `.value` and creates or calls
 * nothing reactive. The AST gives the export's exact source range.
 */
export function h006(code, file, report) {
  let ast
  try { ast = parseSync(file, code, { lang: file.endsWith('x') ? 'tsx' : 'ts', sourceType: 'module' }) } catch { return }
  for (const node of ast.program.body) {
    if (node.type !== 'ExportNamedDeclaration' || !node.declaration) continue
    const d = node.declaration
    const decl = d.type === 'VariableDeclaration' ? d.declarations.find(x => x.id?.name === 'meta') : d.id?.name === 'meta' ? d : undefined
    if (!decl) continue
    const src = code.slice(decl.start, decl.end)
    const hit = /\.value\b/.exec(src) ?? /\b(state|derived|resource|watch|use[A-Z]\w*)\s*\(/.exec(src)
    if (hit) report(`\`meta\` ${hit[0].startsWith('.') ? 'reads a box (`.value`)' : `calls \`${hit[1]}()\``}: metadata is plain data, computed once per request from \`params\` and \`data\`.`, file)
  }
}
