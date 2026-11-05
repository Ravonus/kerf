import { fillPath } from './url.mjs'

/** A param route's real pages to run, at most: enough to compare them, and few enough for `weft check`. */
const SAMPLES = 50

/** Run the real samples of param routes. */
export async function inspectSamples(entries, modules, seen, take) {
  // The param routes' real pages: `prerender` first (what the build will make), then what rendered pages link to.
  for (const { route, entry, report } of entries) {
    if (route.kind !== 'page' || !route.params.length) continue
    const mod = modules[route.file] ?? {}
    let given = []
    try {
      given = (typeof mod.prerender === 'function' ? await mod.prerender() : mod.prerender) ?? []
    } catch {}
    if (!Array.isArray(given)) given = []
    const urls = new Set(given.slice(0, SAMPLES).map((p) => fillPath(route, p)))
    for (const [href, id] of seen) if (id === route.id && urls.size < SAMPLES) urls.add(href)
    entry.samples = []
    for (const u of urls) {
      const r = await take(route, u, report)
      if (r.status === 200 && !r.redirect)
        entry.samples.push({
          url: u,
          title: r.head.title,
          description: r.head.description,
          image: typeof r.head.og.image === 'object' ? r.head.og.image?.url : undefined,
          source: r.source,
        })
    }
    entry.source = entry.samples[0]?.source
    if (!entry.samples.length)
      report(
        'H016',
        'info',
        'No real page of this route to look at, so only its source was checked. Export `prerender`, or link to one from a page.',
      )
  }
}

/** Draw one card for each route that has one. */
export async function inspectCards(entries, manifest, found, handler) {
  // H005 and H008: a card only says what's wrong with it when it's drawn, so one page of each route with its own draws.
  for (const { route, entry, report } of entries) {
    const image = entry.samples?.[0]?.image ?? entry.meta?.og?.image?.url
    if (
      !(route.card || manifest.defaultCard) ||
      !image?.startsWith('/_weft/og/') ||
      image.includes('<')
    )
      continue
    found.length = 0
    try {
      await handler(new Request(`http://weft.local${image}`))
    } catch {}
    for (const d of found)
      if (d.code === 'H005' || d.code === 'H008') report(d.code, d.severity, d.message)
  }
}
