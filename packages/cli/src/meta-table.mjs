// The human form of `kerf routes --meta`: one line per page, and one per sampled page of a param route, with where each
// value came from. `--json` has everything else (every tag, the merged object).

const short = (s, n) => {
  const text = s ?? ''
  return text.length > n ? text.slice(0, n - 1) + '…' : text
}

const cell = (s, n) => short(s, n).padEnd(n)

/** `/_kerf/og/users/42.png?v=abc` → `card: users/42.png`; an explicit image as it is. */
const imageOf = (url) =>
  !url
    ? 'none'
    : url
        .replace(/^https?:\/\/[^/]+/, '')
        .replace(/^\/_kerf\/og\//, '/_kerf/og/')
        .replace(/\?v=.*/, '')

export function metaTable(result) {
  const rows = []
  for (const r of result.routes) {
    if (r.kind !== 'page' || r.redirect !== undefined) continue
    const add = (path, title, description, image, source) =>
      rows.push({
        path,
        title,
        description,
        image: imageOf(image),
        source: source ? `${source.title}/${source.description}/${source.image}` : 'source only',
      })
    if (r.samples?.length) {
      r.samples.slice(0, 3).forEach((s) => add(s.url, s.title, s.description, s.image, s.source))
      if (r.samples.length > 3)
        rows.push({
          path: `  … ${r.samples.length - 3} more of ${r.path}`,
          title: '',
          description: '',
          image: '',
          source: '',
        })
    } else
      add(r.url ?? r.path, r.meta?.title, r.meta?.description, r.meta?.og?.image?.url, r.source)
  }
  const width = {
    path: Math.min(30, Math.max(5, ...rows.map((r) => r.path.length))),
    image: Math.min(34, Math.max(5, ...rows.map((r) => r.image.length))),
  }
  const line = (r) =>
    `${cell(r.path, width.path)}  ${cell(r.title, 36)}  ${cell(r.description, 48)}  ${cell(r.image, width.image)}  ${r.source}`
  const url = result.site?.url ? `site.url ${result.site.url}` : 'site.url not set'
  return [
    `${url}. source: title/description/image, each route, layout, config, auto or card.`,
    line({
      path: 'route',
      title: 'title',
      description: 'description',
      image: 'image',
      source: 'source',
    }),
    ...rows.map(line),
  ].join('\n')
}
