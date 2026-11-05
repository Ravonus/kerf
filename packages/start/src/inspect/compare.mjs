import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { descriptionProblem } from '../derive.mjs'

const quote = (s) => JSON.stringify(s)
const short = (s, n = 70) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

function compareLengths(own, words, at, push) {
  const longTitle = own.find((p) => p.title.length > 60)
  if (longTitle)
    push(
      'H004',
      'warning',
      at,
      `The title is ${longTitle.title.length} characters (over 60): \`${longTitle.title}\`${own.length > 1 ? ` on ${longTitle.url}` : ''}.`,
    )
  const longText = own.find((p) => p.description && p.description.length > 160)
  if (longText)
    push(
      'H004',
      'warning',
      at,
      `The description is ${longText.description.length} characters (over 160)${own.length > 1 ? ` on ${longText.url}` : ''}.`,
    )
  const bad = own.filter(
    (p) => p.description && words(p.source.description) && descriptionProblem(p.description),
  )
  if (bad[0])
    push(
      'H015',
      'warning',
      at,
      `The description ${own.length > 1 ? `of ${bad[0].url}${bad.length > 1 ? ` (and ${bad.length - 1} more)` : ''} ` : ''}isn't a sentence: ${descriptionProblem(bad[0].description)}: ${quote(short(bad[0].description))}.`,
      {
        help: 'Write one plain sentence on what the page gives the reader. Never slice raw markdown or code into `description`.',
      },
    )
}

function compareRoute(root, route, entry, byRoute, site, push, metaExport, metaSnippet) {
  if (route.kind !== 'page') return
  const own = byRoute.get(route) ?? []
  const at = { file: route.file, path: entry.path }
  const first = own[0]
  const { present, reads } = metaExport(readFileSync(join(root, route.file), 'utf8'), route.file)
  const words = (s) => s === 'route' || s === 'layout'
  if (first && !(first.source.title === 'route' && first.source.description === 'route')) {
    const missing = [
      first.source.title !== 'route' && 'title',
      first.source.description !== 'route' && 'description',
    ]
      .filter(Boolean)
      .join(' and ')
    const whence = (what, s, text) =>
      `${what} ${s === 'auto' ? `comes from the page (${quote(short(text))})` : s === 'layout' ? 'comes from a layout' : s === 'config' ? 'is the site default' : 'is empty'}`
    push(
      'H011',
      'warning',
      at,
      `${present ? `\`meta\` sets no ${missing}` : 'This page sets no `meta`'}: the ${[first.source.title !== 'route' && whence('title', first.source.title, first.title), first.source.description !== 'route' && whence('description', first.source.description, first.description ?? '')].filter(Boolean).join(', and the ')}. That works, but words written for this page are better.`,
      {
        help: metaSnippet(
          route,
          first.source.title === 'auto' ? stripTemplate(first.title, site.title) : '',
          first.description,
        ),
      },
    )
  } else if (!first && !present)
    push(
      'H011',
      'warning',
      at,
      'This page sets no `meta`, so its title and description come from what it renders. Words written for the page are better.',
      { help: metaSnippet(route) },
    )

  if (route.params.length && present && !reads)
    push(
      'H014',
      'warning',
      at,
      'This route has params, but its `meta` reads neither `data` nor `params`: every page of it has the same tags.',
      { help: metaSnippet(route) },
    )
  else if (route.params.length && own.length > 1) {
    const same = (key) => new Set(own.map((p) => p[key])).size === 1 && own[0][key]
    for (const key of ['title', 'description'])
      if (same(key))
        push(
          'H014',
          'warning',
          at,
          `All ${own.length} pages of this route looked at have the same ${key} (${quote(short(own[0][key]))}), so a share or a search result can't tell them apart.`,
          { help: metaSnippet(route) },
        )
  }

  compareLengths(own, words, at, push)
}

/** The checks that take every page at once: is each one's text its own, and is it text at all? */
export function compare(root, entries, pages, site, known, metaExport, metaSnippet) {
  const out = []
  const push = (code, severity, route, why, extra) =>
    out.push({ code, severity, file: route.file, route: route.path, why, ...extra })
  const byRoute = new Map()
  for (const p of pages) byRoute.set(p.route, [...(byRoute.get(p.route) ?? []), p])

  if (!known)
    out.push({
      code: 'H001',
      severity: 'warning',
      file: 'weft.config.ts',
      route: '*',
      why: "`site.url` is not set: a build has no absolute URLs (no canonical, no og:url, a relative og:image), and a server takes them from the request's Host header. Crawlers don't resolve relative URLs.",
      help: 'Set `site.url` in weft.config.ts, or `WEFT_SITE_URL` in the deploy environment.',
    })

  for (const { route, entry } of entries)
    compareRoute(root, route, entry, byRoute, site, push, metaExport, metaSnippet)

  const clash = (key, code) => {
    const groups = new Map()
    for (const p of pages) if (p[key]) groups.set(p[key], [...(groups.get(p[key]) ?? []), p])
    for (const [text, list] of groups) {
      const routes = [...new Set(list.map((p) => p.route))]
      if (routes.length < 2) continue // one param route's pages are H014's
      const what =
        key === 'title'
          ? 'title'
          : text === site.description
            ? 'description (the site default)'
            : 'description'
      const a = routes[0]
      push(
        code,
        'warning',
        { file: a.file, path: list[0].url },
        `${routes.length} routes share this ${what}: ${list
          .slice(0, 4)
          .map((p) => p.url)
          .join(
            ', ',
          )}${list.length > 4 ? `, and ${list.length - 4} more` : ''} (${quote(short(text))}).`,
        { help: `Give each page its own ${key} in \`meta\`, from what is on it.` },
      )
    }
  }
  clash('title', 'H012')
  clash('description', 'H013')
  return out
}

const stripTemplate = (title, template) => {
  const [a = '', b = ''] = template?.split('%s') ?? []
  return title.startsWith(a) && title.endsWith(b)
    ? title.slice(a.length, title.length - b.length)
    : title
}
