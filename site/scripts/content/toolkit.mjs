import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { truncate } from '../../../packages/start/src/derive.mjs'
import { readExamples, readToolkit, showExample } from '../toolkit.mjs'
import { markdownToHtml, GROUPS, site, repo, out } from './context.mjs'
import {
  slugify,
  areaOf,
  CHART_ACCESS,
  QUIET_ACCESS,
  hrefs,
  write,
  inline,
} from './docs-catalog.mjs'
import { codeBlock } from './markdown.mjs'
import {
  HIDDEN_PROPS,
  arrange,
  usageOf,
  SPEC_WORDS,
  GITHUB_SRC,
  propRow,
  finishKnobs,
} from './toolkit-props.mjs'

function toolkitPage({
  c,
  doc,
  g,
  found,
  play,
  slugFor,
  shownHero,
  shownSections,
  groups,
  related,
  heads,
  tile,
  near,
  order,
  i,
}) {
  return {
    name: c.name,
    slug: c.slug,
    area: areaOf(g.file),
    group: g.title,
    usage: codeBlock(usageOf(doc, c.name, found, play), 'tsx'),
    file: g.file,
    source: `${GITHUB_SRC}${c.file}`,
    sourceFile: c.file,
    summary: doc.summary,
    description: truncate(doc.summary),
    use: doc.use && {
      when: doc.use.when,
      instead: doc.use.instead
        ?.filter((x) => slugFor(x.name))
        .map((x) => ({ ...x, slug: slugFor(x.name), href: hrefs.get(slugFor(x.name)) })),
    },
    playground: play,
    hero: shownHero,
    sections: shownSections,
    keyboard: doc.keyboard,
    a11yNotes: (
      doc.a11yNotes ??
      (doc.keyboard ? undefined : [areaOf(g.file) === 'charts' ? CHART_ACCESS : QUIET_ACCESS])
    )?.map(inline),
    groups,
    parts: c.parts,
    scope: c.scope,
    states: c.states,
    related,
    importLine: codeBlock(`import { ${c.name} } from '@weft-js/warp'`, 'tsx'),
    toc: heads,
    tile,
    prev: near(order[i - 1]),
    next: near(order[i + 1]),
  }
}

function toolkitDetails({ facts, problems, blank, seen }, g, doc, found) {
  const c = facts.get(doc.component)
  if (!c) {
    problems.push(`${doc.component}: not one of warp's exports`)
    return
  }
  if (seen.has(c.name)) problems.push(`${c.name}: documented twice`)
  seen.add(c.name)
  if (!doc.summary) problems.push(`${c.name}: no summary`)
  if (doc.summary?.length > 120)
    problems.push(`${c.name}: summary is ${doc.summary.length} characters`)
  const words = [
    doc.summary,
    ...(doc.use?.when ?? []),
    ...doc.sections.flatMap((s) =>
      s.kind === 'prose'
        ? [s.md]
        : [s.title, s.intro ?? '', ...s.examples.flatMap((e) => [e.title, e.note ?? ''])],
    ),
  ].join('\n')
  if (SPEC_WORDS.test(words)) problems.push(`${c.name}: spec jargon in its words`)
  if (/Variant \d/.test(words)) problems.push(`${c.name}: an example is called "Variant N"`)
  const example = (ref) => {
    const f = found.get(ref.id)
    if (!f) {
      problems.push(`${c.name}: no export ${ref.id} in examples/${g.file}.tsx`)
      return ref
    }
    const text = showExample(f, c.name)
    return { ...ref, code: codeBlock(text, 'tsx'), lines: text.split('\n').length }
  }
  const { hero, parts: arranged } = arrange(doc)
  const shownHero = hero && example(hero)
  const shownSections = arranged.map((s) =>
    s.kind === 'prose'
      ? { ...s, html: markdownToHtml(s.md) }
      : {
          ...s,
          intro: s.intro && inline(s.intro),
          examples: s.examples.map((e) => ({ ...example(e), note: e.note && inline(e.note) })),
        },
  )
  const visible = c.props.filter(
    (p) => !HIDDEN_PROPS.has(p.name) && !doc.hideProps?.includes(p.name),
  )
  const rows = visible.map((p) => propRow(p, doc))
  blank.all += rows.length
  blank.none += rows.filter((r) => !r.doc).length
  const groups = [
    ['Props', rows.filter((r) => !/^on[A-Z]/.test(r.name))],
    ['Events', rows.filter((r) => /^on[A-Z]/.test(r.name))],
  ]
    .filter(([, list]) => list.length)
    .map(([title, list]) => ({ title, rows: list }))
  return { c, shownHero, shownSections, groups }
}

function toolkitDoc(
  { facts, problems, pages, blank, slugFor, order, areaIn, seen },
  g,
  doc,
  found,
  tiles,
) {
  const details = toolkitDetails({ facts, problems, blank, seen }, g, doc, found)
  if (!details) return
  const { c, shownHero, shownSections, groups } = details
  const first = doc.sections.find((s) => s.kind !== 'prose')?.examples[0]
  const tile = doc.tile ?? first?.id
  const related = (doc.related ?? [])
    .filter(slugFor)
    .map((name) => ({ name, slug: slugFor(name), href: hrefs.get(slugFor(name)) }))
  const play = doc.playground && finishKnobs(doc.playground, c.props, c.name)
  if (play && !found.has(play.example)) problems.push(`${c.name}: no export ${play.example}`)
  const heads = [
    { id: 'installation', text: 'Installation' },
    ...(play ? [{ id: 'playground', text: 'Try it' }] : []),
    { id: 'usage', text: 'Usage' },
    ...shownSections.flatMap((s) => [
      { id: slugify(s.title), text: s.title },
      ...(s.kind === 'prose' || s.examples.length < 2
        ? []
        : s.examples.map((e) => ({ id: e.id, text: e.title, depth: 3 }))),
    ]),
    ...(doc.use ? [{ id: 'when-to-use', text: 'When to use' }] : []),
    { id: 'accessibility', text: 'Accessibility' },
    { id: 'api-reference', text: 'API Reference' },
  ]
  const i = order.indexOf(c.name)
  const near = (n) =>
    n &&
    facts.get(n) &&
    areaIn(n) === areaOf(g.file) && { name: n, slug: slugFor(n), href: hrefs.get(slugFor(n)) }
  pages[c.slug] = toolkitPage({
    c,
    doc,
    g,
    found,
    play,
    slugFor,
    shownHero,
    shownSections,
    groups,
    related,
    heads,
    tile,
    near,
    order,
    i,
  })
  const refs = doc.sections.flatMap((s) => s.examples ?? [])
  tiles.push({
    name: c.name,
    slug: c.slug,
    href: hrefs.get(c.slug),
    summary: doc.summary,
    id: tile,
    stage: doc.tileStage ?? refs.find((r) => r.id === tile)?.stage ?? 'center',
    fit: doc.tileFit ?? (areaOf(g.file) === 'charts' ? 'contain' : undefined),
    width: doc.tileWidth,
  })
}

function toolkitGroup(state, g) {
  const { registry, index } = state
  const path = join(site, 'src/toolkit/examples', `${g.file}.tsx`)
  const found = existsSync(path) ? readExamples(path) : new Map()
  if (existsSync(path)) registry.push(g.file)
  const tiles = []
  for (const doc of g.docs) toolkitDoc(state, g, doc, found, tiles)
  index.push({
    title: g.title,
    area: areaOf(g.file),
    id: slugify(g.title),
    file: g.file,
    intro: g.intro,
    pack: g.pack,
    tiles,
  })
}

function buildToolkit() {
  const facts = new Map(readToolkit(repo).map((c) => [c.name, c]))
  const problems = []
  const pages = {}
  const index = []
  const registry = []
  const blank = { all: 0, none: 0 }
  const slugFor = (name) => facts.get(name)?.slug
  const order = GROUPS.flatMap((g) => g.docs.map((d) => d.component))
  const areaIn = (n) => areaOf(GROUPS.find((g) => g.docs.some((d) => d.component === n)).file)
  const seen = new Set()
  for (const g of GROUPS)
    for (const d of g.docs)
      if (facts.get(d.component))
        hrefs.set(facts.get(d.component).slug, `/${areaOf(g.file)}/${facts.get(d.component).slug}`)
  const state = { facts, problems, pages, index, registry, blank, slugFor, order, areaIn, seen }
  for (const g of GROUPS) toolkitGroup(state, g)
  const missing = [...facts.keys()].filter((n) => !seen.has(n))
  if (problems.length) throw new Error(`the toolkit's docs:\n  ${problems.join('\n  ')}`)
  writeFileSync(
    join(out, 'previews.ts'),
    `// Generated by scripts/content.mjs.\nexport const previews: Record<string, () => Promise<any>> = {\n${registry.map((f) => `  ${JSON.stringify(f)}: () => import('../toolkit/examples/${f}'),`).join('\n')}\n}\n`,
  )
  write('toolkit.json', pages)
  write('toolkit-index.json', { total: facts.size, groups: index })
  // the rail: a component with no page yet still has no link
  write(
    'toolkit-nav.json',
    index
      .filter((g) => g.tiles.length)
      .map((g) => ({
        group: g.title,
        area: g.area,
        items: g.tiles.map(({ name, slug, href }) => ({ name, slug, href })),
      })),
  )
  if (missing.length)
    console.log(`[content] no docs yet for ${missing.length}: ${missing.join(' ')}`)
  console.log(`[content] props with no words: ${blank.none} of ${blank.all}`)
  return Object.values(pages).map((p) => ({
    title: p.name,
    url: hrefs.get(p.slug),
    group: 'Components',
    rank: 0.9,
    parent: p.group,
    text: p.summary,
  }))
}

export { buildToolkit }
