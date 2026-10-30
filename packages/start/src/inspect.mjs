// `weft routes --meta` (research 20 §5, research 25 §7): every route's merged metadata as JSON, so an agent reviews
// every page's tags without a browser. Static routes run their loaders (one GET each, as a crawler's request would);
// param routes use placeholders: `params.id` is `<id>`, `data.name` is `<data.name>`. Diagnostics H001–H007 for each.

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createServer, parseSync } from 'vite'
import weft from 'weft/vite'
import weftStart, { startDir } from './vite.mjs'
import { filePath } from './routes.mjs'

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
    const { createHandler, hash, cardPath } = await server.ssrLoadModule(join(startDir, 'server.tsx'))
    const { mergeMeta, headTags } = await server.ssrLoadModule('weft/ssr')
    await server.ssrLoadModule('virtual:weft/fns')
    const { default: context } = await server.ssrLoadModule('virtual:weft/context')
    const found = []
    const handler = createHandler({ manifest, modules, site, context, build: 'inspect', onDiagnostic: d => found.push(d) })
    const out = []
    const diagnostics = []
    for (const route of manifest.routes) {
      const mod = modules[route.file] ?? {}
      const layouts = route.layouts.map(id => manifest.layouts.find(l => l.id === id))
      const entry = { path: route.kind === 'page' ? filePath(manifest, route) : route.kind, kind: route.kind, file: route.file, layouts: layouts.map(l => l.file), params: route.params }
      const report = (code, severity, why) => diagnostics.push({ code, severity, file: route.file, route: entry.path, why })
      for (const f of [route.file, ...entry.layouts]) h006(readFileSync(join(root, f), 'utf8'), f, (why, file) => diagnostics.push({ code: 'H006', severity: 'error', file, route: entry.path, why }))
      let head, status, url, data, redirect
      if (route.kind !== 'page') {
        const metas = [...layouts.map(l => modules[l.file]?.meta), mod.meta ?? { title: route.kind === '404' ? 'Not found' : 'Error' }]
        head = mergeMeta(site, ...(await Promise.all(metas.map(m => (typeof m === 'function' ? m({ params: {}, data: placeholder('data') }) : m)))))
        head.og.image = undefined
        status = route.kind === '404' ? 404 : 500
        url = null
        data = 'none'
      } else if (!route.params.length) {
        found.length = 0
        const r = await handler.resolve(route.pattern, new Request(`http://weft.local${route.pattern}`))
        ;({ head, status } = r)
        redirect = r.redirect?.href
        url = route.pattern
        data = 'loaded'
        for (const d of found) report(d.code, d.severity, d.message.replace(/^H\d{3} /, ''))
      } else {
        const params = Object.fromEntries(route.params.map(p => [p, `<${p}>`]))
        url = route.pattern.replace(/\$([\w$]*)/g, (_, n) => `<${n || route.splat}>`)
        const metas = []
        for (const m of [...layouts.map(l => modules[l.file]?.meta), mod.meta]) {
          try { metas.push(typeof m === 'function' ? await m({ params, data: placeholder('data') }) : m) } catch (e) { report('H007', 'error', `\`meta\` threw with placeholder data: ${e.message}`) }
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
      // Route-level checks on the merged result (the config-level ones run in `weft check`).
      const img = typeof image === 'object' && image ? image.url : undefined
      if (img && !site.url && !/^(https?:)?\/\//.test(img)) report('H001', 'error', `og:image \`${img}\` is relative and \`site.url\` is not set: crawlers don't resolve relative URLs.`)
      if (preset === 'static' && entry.image === 'on-demand') report('H002', 'error', 'A param route with a generated card on a static-only preset: export `prerender` with the params to build, or set `og.image`.')
      if (route.kind === 'page' && status === 200 && !head.description) report('H003', 'warning', 'No description after merging the config, layouts and route.')
      if (data !== 'placeholder' && head.title.length > 60) report('H004', 'warning', `The title is ${head.title.length} characters (over 60): \`${head.title}\`.`)
      if (data !== 'placeholder' && head.description && head.description.length > 160) report('H004', 'warning', `The description is ${head.description.length} characters (over 160).`)
      out.push(entry)
    }
    return { version: 1, ok: !diagnostics.some(d => d.severity === 'error'), site, routes: out, diagnostics }
  } finally {
    await server.close()
  }
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
  try { ast = parseSync(file, code, { lang: /x$/.test(file) ? 'tsx' : 'ts', sourceType: 'module' }) } catch { return }
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
