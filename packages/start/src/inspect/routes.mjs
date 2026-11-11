import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { filePath } from '../routes.mjs'

/** `<data>`, `<data.name>`, `<data.user.name>`: reads become their own names, for meta run without a loader. */
function placeholder(path) {
  const text = `<${path}>`
  return new Proxy(function () {}, {
    get(_, k) {
      if (k === Symbol.toPrimitive || k === 'toString' || k === 'valueOf' || k === 'toJSON')
        return () => text
      if (typeof k === 'symbol') return undefined
      return placeholder(`${path}.${k}`)
    },
    apply: () => text,
  })
}

async function routeHead(route, layouts, mod, context, report) {
  const { site, mergeMeta, cardPath, take, modules } = context
  let head, status, url, data, redirect, source
  if (route.kind !== 'page') {
    const metas = [
      ...layouts.map((l) => modules[l.file]?.meta),
      mod.meta ?? { title: route.kind === '404' ? 'Not found' : 'Error' },
    ]
    head = mergeMeta(
      site,
      ...(await Promise.all(
        metas.map((m) =>
          typeof m === 'function' ? m({ params: {}, data: placeholder('data') }) : m,
        ),
      )),
    )
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
    if (status >= 500)
      report(
        'H016',
        'info',
        `This page answered ${status} here, so its metadata wasn't checked. It may need a database or an environment \`kerf check\` doesn't have.`,
      )
  } else {
    const params = Object.fromEntries(route.params.map((p) => [p, `<${p}>`]))
    url = route.pattern.replace(/\$([\w$]*)/g, (_, n) => `<${n || route.splat}>`)
    const metas = []
    for (const m of [...layouts.map((l) => modules[l.file]?.meta), mod.meta]) {
      // `meta` can do what placeholders can't (`data.tags.join()`), and that's no fault: the samples run it for real.
      try {
        metas.push(typeof m === 'function' ? await m({ params, data: placeholder('data') }) : m)
      } catch {}
    }
    head = mergeMeta(site, ...metas)
    if (head.og.image === 'auto')
      head.og.image = {
        url: `/_kerf/og/${cardPath(url)}.png?v=<hash>`,
        width: 1200,
        height: 630,
      }
    status = 200
    data = 'placeholder'
  }
  return { head, status, url, data, redirect, source }
}

function applyHead(entry, route, mod, resolved, context) {
  const { head, status, url, data, redirect, source } = resolved
  const { manifest, headTags, out } = context
  const image = head.og.image
  entry.url = url
  entry.status = status
  if (redirect !== undefined) {
    // `load` redirects (research 27 §3): the response has no body, so no tags and no card.
    Object.assign(entry, { redirect, data, card: null, image: 'none', meta: null, tags: [] })
    out.push(entry)
    return false
  }
  entry.data = data
  entry.card = route.kind !== 'page' ? null : (route.card ?? manifest.defaultCard ?? 'built-in')
  entry.image =
    typeof image !== 'object' || !image
      ? 'none'
      : !image.url.startsWith('/_kerf/og/')
        ? 'url'
        : !route.params.length
          ? 'build'
          : mod.prerender
            ? 'prerender+on-demand'
            : 'on-demand'
  entry.meta = JSON.parse(JSON.stringify(head))
  entry.tags = url
    ? headTags(head, url).map(([tag, attrs, text]) =>
        text === undefined ? [tag, attrs] : [tag, attrs, text],
      )
    : headTags(head, '/')
  if (source) entry.source = source
  return true
}

async function inspectRoute(route, context) {
  const { root, manifest, modules, h006, diagnostics, out, entries, preset } = context
  const mod = modules[route.file] ?? {}
  const layouts = route.layouts.map((id) => manifest.layouts.find((l) => l.id === id))
  const entry = {
    path: route.kind === 'page' ? filePath(manifest, route) : route.kind,
    kind: route.kind,
    file: route.file,
    layouts: layouts.map((l) => l.file),
    params: route.params,
  }
  const report = (code, severity, why, help) =>
    diagnostics.push({
      code,
      severity,
      file: route.file,
      route: entry.path,
      why,
      ...(help && { help }),
    })
  for (const f of [route.file, ...entry.layouts])
    h006(readFileSync(join(root, f), 'utf8'), f, (why, file) =>
      diagnostics.push({ code: 'H006', severity: 'error', file, route: entry.path, why }),
    )
  const resolved = await routeHead(route, layouts, mod, context, report)
  const { head, status } = resolved
  if (!applyHead(entry, route, mod, resolved, context)) return
  // Route-level checks on the merged result (the config-level ones run in `kerf check`).
  if (preset === 'static' && entry.image === 'on-demand')
    report(
      'H002',
      'error',
      'A param route with a generated card on a static-only preset: export `prerender` with the params to build, or set `og.image`.',
    )
  if (route.kind === 'page' && status === 200 && !route.params.length && !head.description)
    report('H003', 'warning', 'No description after merging the config, layouts and route.')
  entries.push({ route, entry, report })
  out.push(entry)
}

/** Inspect each route in the same order as before. */
export async function inspectRoutes(context) {
  const { manifest, entries } = context
  for (const route of [...manifest.routes].sort((a, b) => a.params.length - b.params.length))
    await inspectRoute(route, context)
  return entries
}
