import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { brotliCompressSync } from 'node:zlib'
import { catalog } from '../../../packages/cli/src/catalog.mjs'
import { exportsOf } from '../../../packages/cli/src/weft.mjs'
import { buildIndex, markdownToHtml, site, repo, pub } from './context.mjs'
import { slugify, write, LEARN, overviewOf, MOVED, inline } from './docs-catalog.mjs'
import { plain, summary, codeBlock, linkify, renderer } from './markdown.mjs'

/**
 * A Learn page's blocks. Plain Markdown, plus fences of our own, each opened by a line that starts `:::` and closed by a
 * line that is only `:::`:
 *   :::learn             the "You will learn" box (a list)
 *   :::demo <id>         a live demo from src/demos, beside its own source (one line, no closing fence)
 *   :::note [title]      an aside
 *   :::pitfall [title]   a mistake that is easy to make, and what to do instead
 *   :::deepdive <title>  an aside for the curious, closed until opened
 *   :::challenge <t>     a "Try it" task; a `:::solution` line inside starts its hidden answer
 */
function learnBlocks(md, slugs, demoIds) {
  const r = renderer(slugs)
  const blocks = []
  let box = ''
  let buf = []
  let challenges = 0
  const flush = () => {
    if (buf.join('').trim()) blocks.push({ html: r.html(buf.join('\n')) })
    buf = []
  }
  const lines = md.replace(/^# [^\n]*\n/, '').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    const fence = /^:::(learn|demo|note|pitfall|deepdive|challenge)\s*(.*)$/.exec(l)
    if (!fence) {
      buf.push(l)
      continue
    }
    const [, kind, arg] = fence
    if (kind === 'demo') {
      if (!demoIds.has(arg))
        throw new Error(`learn: no demo called ${arg} in src/components/LearnDemo.tsx`)
      flush()
      blocks.push({ demo: arg })
      continue
    }
    const inner = []
    for (i++; i < lines.length && lines[i] !== ':::'; i++) inner.push(lines[i])
    if (i >= lines.length) throw new Error(`learn: :::${kind} is never closed`)
    const plainHtml = (text) => linkify(markdownToHtml(text, { code: codeBlock }), slugs)
    if (kind === 'learn') {
      box = plainHtml(inner.join('\n'))
      continue
    }
    flush()
    const titled = arg ? `<p data-part="title">${inline(arg)}</p>` : ''
    if (kind === 'note') {
      blocks.push({
        html: `<aside data-site="note">${titled}${plainHtml(inner.join('\n'))}</aside>`,
      })
      continue
    }
    if (kind === 'pitfall') {
      blocks.push({
        html: `<aside data-site="pitfall"><p data-part="label">Pitfall</p>${titled}${plainHtml(inner.join('\n'))}</aside>`,
      })
      continue
    }
    if (kind === 'deepdive') {
      if (!arg) throw new Error('learn: a :::deepdive needs a title')
      blocks.push({
        html: `<details data-site="deepdive"><summary><span data-part="label">Deep dive</span><span data-part="title">${inline(arg)}</span></summary><div data-part="body">${plainHtml(inner.join('\n'))}</div></details>`,
      })
      continue
    }
    const at = inner.indexOf(':::solution')
    const task = at < 0 ? inner : inner.slice(0, at)
    const answer = at < 0 ? [] : inner.slice(at + 1)
    challenges++
    blocks.push({
      html: `<section data-site="challenge"><p data-part="label">Challenge ${challenges}</p><h3>${esc(arg)}</h3>${plainHtml(task.join('\n'))}${answer.length ? `<details><summary>Show the solution</summary>${plainHtml(answer.join('\n'))}</details>` : ''}</section>`,
    })
  }
  flush()
  return { box, blocks, toc: r.toc }
}
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Learn: the tutorial pages, in order, with prev and next running straight through the chapters. */
function buildLearn(reference) {
  // A demo shows only where src/components/LearnDemo.tsx has a JSX site for it.
  const demoIds = new Set(
    [
      ...readFileSync(join(site, 'src/components/LearnDemo.tsx'), 'utf8').matchAll(
        /props\.id === '([a-z0-9-]+)'/g,
      ),
    ].map((m) => m[1]),
  )
  const flat = LEARN.flatMap(([section, items]) =>
    items.map(([slug, title]) => ({
      section,
      slug,
      title,
      md: readFileSync(join(site, 'content/learn', `${slug}.md`), 'utf8'),
    })),
  )
  const pages = {}
  flat.forEach((p, i) => {
    const { box, blocks, toc } = learnBlocks(p.md, reference.slugs, demoIds)
    if (!box) throw new Error(`learn/${p.slug}.md has no :::learn box`)
    writeFileSync(join(pub, 'learn', `${p.slug}.md`), p.md)
    const body = p.md.replace(/^# [^\n]*\n/, '').replace(/^:::learn[\s\S]*?^:::$/m, '')
    pages[p.slug] = {
      slug: p.slug,
      title: p.title,
      section: p.section,
      box,
      blocks,
      toc,
      description: summary(body) || `${p.title}: ${p.section} in Learn weft.`,
      prev: flat[i - 1] && { slug: flat[i - 1].slug, title: flat[i - 1].title },
      next: flat[i + 1] && { slug: flat[i + 1].slug, title: flat[i + 1].title },
    }
  })
  const nav = LEARN.map(([section, items]) => ({
    section,
    overview: overviewOf(section, items) ?? null,
    items: items.map(([slug, title]) => ({ slug, title })),
  }))
  for (const [from, to] of Object.entries(MOVED))
    if (!pages[to] || pages[from])
      throw new Error(`learn: ${from} moves to ${to}, which must exist while ${from} doesn't`)
  return { nav, pages, flat }
}

/** Heading-sized pieces of one page, for the body index. */
function sections(md) {
  const parts = []
  let cur = { heading: '', lines: [] }
  let inFence = false
  for (const l of md.split('\n')) {
    if (l.startsWith('```')) inFence = !inFence
    const h = !inFence && /^##+\s+(.*)$/.exec(l)
    if (h) {
      parts.push(cur)
      cur = { heading: plain(h[1]), lines: [] }
    } else cur.lines.push(l)
  }
  parts.push(cur)
  return parts
}

/** Search groups: Learn is the guide, Reference is the API. */
const GROUP = { learn: 'Guides', reference: 'API' }

/** Every name `weft` exports, pointing at the section that first uses it, so "state" finds `state` before prose about it. */
function symbols(docs) {
  const dir = join(repo, 'packages/core')
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const rows = []
  for (const [from, names] of Object.entries(exportsOf({ dir, pkg }))) {
    for (const name of names) {
      const uses = new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`)
      for (const p of docs.flat) {
        const s = sections(p.md.replace(/^# [^\n]*\n/, '')).find((x) =>
          uses.test(x.lines.join('\n')),
        )
        if (!s) continue
        rows.push({
          title: name,
          url: `/reference/${p.slug}${s.heading ? `#${slugify(s.heading)}` : ''}`,
          group: 'API',
          rank: 0.95,
          parent: s.heading ? `${p.title} / ${s.heading}` : p.title,
          text: from,
        })
        break
      }
    }
  }
  return rows
}

function buildSearch(docs, learn, extra = []) {
  const t0 = []
  const t1 = []
  const pages = [
    ...learn.flat.map((p) => ({ ...p, base: 'learn', toc: learn.pages[p.slug].toc })),
    ...docs.flat.map((p) => ({ ...p, base: 'reference', toc: docs.pages[p.slug].toc })),
  ]
  for (const p of pages) {
    const group = GROUP[p.base]
    const url = `/${p.base}/${p.slug}`
    t0.push({ title: p.title, url, group, rank: p.base === 'learn' ? 1 : 0.98, keywords: p.slug })
    for (const h of p.toc)
      t0.push({ title: h.text, url: `${url}#${h.id}`, group, rank: 0.6, parent: p.title })
    for (const s of sections(p.md.replace(/^# [^\n]*\n/, '').replace(/^:::.*$/gm, ''))) {
      const body = plain(s.lines.join('\n'))
      if (body.length < 12) continue
      const id = s.heading ? slugify(s.heading) : ''
      t1.push({
        title: s.heading || p.title,
        url: `${url}${id ? `#${id}` : ''}`,
        group,
        rank: 0.5,
        parent: s.heading ? p.title : undefined,
        text: body.slice(0, 120),
        keywords: body,
      })
    }
  }
  for (const e of catalog)
    t0.push({
      title: e.code,
      url: `/reference/codes/${e.code}`,
      group: 'Diagnostics',
      rank: 0.9,
      text: e.catches.slice(0, 90),
      keywords: e.fix,
    })
  t0.push(...symbols(docs), ...extra)
  const emit = (name, wire) => {
    const text = JSON.stringify(wire)
    const hash = createHash('sha256').update(text).digest('hex').slice(0, 10)
    writeFileSync(join(pub, 'search', `${name}.${hash}.json`), text)
    return {
      url: `/search/${name}.${hash}.json`,
      raw: text.length,
      br: brotliCompressSync(text).length,
    }
  }
  const search = {
    t0: emit('t0', buildIndex(t0)),
    t1: emit('t1', buildIndex(t1)),
    counts: { t0: t0.length, t1: t1.length },
  }
  writeFileSync(
    join(pub, 'search.json'),
    JSON.stringify({
      about: 'Every title on the site. /llms.txt has the rest.',
      items: t0.map(({ title, url, group, parent }) => ({ title, url, group, parent })),
    }),
  )
  write('search.json', { t0: search.t0.url, t1: search.t1.url })
  return search
}

export { buildLearn, buildSearch }
