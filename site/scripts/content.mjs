// Everything the site says that comes from elsewhere in the repo is generated here, so it can't drift. Docs are `weft docs`'
// own pages plus a few files; numbers are evals/. Output is gitignored: src/generated for the routes, public for files
// served as they are (`.md` twins, llms.txt, search indexes).
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliCompressSync } from 'node:zlib'
import { docs as weftDocs } from '../../packages/cli/src/docs.mjs'
import { catalog } from '../../packages/cli/src/catalog.mjs'

// ui-core's source imports without extensions, for bundlers; here Node reads it directly.
registerHooks({
  resolve(spec, context, next) {
    try {
      return next(spec, context)
    } catch (e) {
      if (spec.startsWith('.')) return next(`${spec}.ts`, context)
      throw e
    }
  },
})
const { buildIndex, highlight, markdownToHtml } = await import('../../packages/ui-core/src/index.ts')

const site = join(dirname(fileURLToPath(import.meta.url)), '..')
const repo = join(site, '..')
const out = join(site, 'src/generated')
const pub = join(site, 'public')
rmSync(join(pub, 'search'), { recursive: true, force: true })
rmSync(join(pub, 'docs'), { recursive: true, force: true })
for (const d of [out, join(pub, 'search'), join(pub, 'docs/codes')]) mkdirSync(d, { recursive: true })
const write = (file, value) => writeFileSync(join(out, file), JSON.stringify(value))

// ------------------------------------------------------------------ numbers

/** The stack comparison, from evals/compare/results.json and the run that wrote it. */
function numbers() {
  const results = JSON.parse(readFileSync(join(repo, 'evals/compare/results.json'), 'utf8'))
  const run = readFileSync(join(repo, 'evals/results/compare-history.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l)).sort((a, b) => a.at.localeCompare(b.at)).at(-1)
  const stacks = Object.entries(results).map(([id, s]) => ({
    id, label: s.label, js: s.size.js.br, css: s.size.css.br, lines: s.lines, nodes: s.load.nodes, heap: s.load.heapMB, fcp: s.load.fcpMs,
    steps: Object.fromEntries(Object.entries(s.parity.steps).map(([k, v]) => [k, v.dom])),
  }))
  return { stacks, at: run.at.slice(0, 10), commit: run.commit, codes: catalog.length }
}

// ------------------------------------------------------------------ docs

const file = path => () => readFileSync(join(repo, path), 'utf8')
const topic = name => async () => (await weftDocs(site, name)).text

/** The nav. A page's source is `weft docs <topic>` wherever one exists, so the site and the CLI read one file. */
const SECTIONS = [
  ['Start', [
    ['getting-started', 'Getting started', file('docs/getting-started.md')],
    ['rules', 'The rules', topic('rules')],
    ['props', 'Props', topic('props')],
    ['lists', 'Lists', topic('lists')],
    ['async', 'Async', topic('async')],
  ]],
  ['Learn', [
    ['start', 'Full stack', topic('start')],
    ['style', 'Style groups', topic('style')],
    ['design', 'Design language', topic('design')],
    ['icons', 'Icons', topic('icons')],
    ['fonts', 'Fonts', topic('fonts')],
    ['browser', 'Browser APIs', topic('browser')],
    ['surface', 'Surfaces', topic('surface')],
    ['testing', 'Testing', topic('testing')],
  ]],
  ['Extend', [
    ['plugins', 'Plugins', topic('plugins')],
    ['rust', 'Rust sidecars', topic('rust')],
    ['pay', 'Payments', file('packages/pay/docs/pay.md')],
  ]],
  ['Reference', [
    ['config', 'Configuration', topic('config')],
    ['diagnostics', 'Diagnostics', () => diagnosticsIndex()],
  ]],
  ['Agents', [
    ['verify', 'Check your work', topic('verify')],
    ['agents', 'AGENTS.md', topic('agents')],
  ]],
  ['Migrate', [
    ['react', 'From React', file('docs/react-props.md')],
  ]],
]

function diagnosticsIndex() {
  const families = { W: 'Compiler', D: 'Design', T: 'Tests', P: 'Plugins and config', H: 'Head and metadata', Q: 'Queries', S: 'State', F: 'Forms', I: 'Icons', A: 'Auth', C: 'Contracts', R: 'Realtime', X: 'Surfaces and fonts', M: 'Media' }
  const lines = ['# Diagnostics', '', `Every code weft reports, ${catalog.length} in all. \`weft docs <code>\` prints the same page.`, '']
  for (const [letter, name] of Object.entries(families)) {
    const list = catalog.filter(e => e.code[0] === letter)
    if (!list.length) continue
    lines.push(`## ${name}`, '', '| Code | Catches |', '|---|---|')
    for (const e of list) lines.push(`| \`${e.code}\` | ${e.catches.replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`)
    lines.push('')
  }
  return lines.join('\n')
}

const slugify = t => t.toLowerCase().replace(/`/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const plain = md => md.replace(/```[\s\S]*?```/g, ' ').replace(/[`*_#>|]/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim()
const CODE = /\b[WDTPHQSFIACRXM]\d{3}\b/g
const known = new Set(catalog.map(e => e.code))
const REPO = 'https://github.com/Ravonus/weft/blob/main/'

const copyButton = `<button type="button" data-scope="button" data-emphasis="ghost" data-tone="neutral" data-size="sm" data-act="copy" data-copy="" aria-label="Copy code"><span data-part="indicator">${readIcon('copy')}${readIcon('check')}</span></button>`

/** warp's CodeBlock markup, as a string: a docs page has no component to run. */
function codeBlock(text, language) {
  const lang = language || 'text'
  return `<figure data-scope="codeblock"><div data-part="head"><span class="sp"></span><span data-part="lang">${lang}</span>${copyButton}</div><pre tabindex="0"><code>${highlight(text, lang)}</code></pre></figure>`
}

function readIcon(name) {
  return name === 'copy'
    ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M4 16V5.5A1.5 1.5 0 0 1 5.5 4H16"/></svg>'
    : '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 12.5 10 17.5 19 7"/></svg>'
}

/** Codes and `weft docs x` become links, outside tags, links and code blocks. */
function linkify(html, slugs) {
  return html.split(/(<pre[\s\S]*?<\/pre>|<a [\s\S]*?<\/a>|<[^>]+>)/).map((part, i) => {
    if (i % 2) {
      return part
    }
    return part
      .replace(CODE, c => (known.has(c) ? `<a href="/docs/codes/${c}">${c}</a>` : c))
      .replace(/weft docs ([a-z-]+)/g, (m, t) => (slugs.has(t) ? `<a href="/docs/${t}">${m}</a>` : m))
  }).join('')
}

async function buildDocs() {
  const nav = []
  const pages = {}
  const flat = SECTIONS.flatMap(([section, items]) => items.map(([slug, title, source]) => ({ section, slug, title, source })))
  const slugs = new Set(flat.map(p => p.slug))
  for (const p of flat) p.md = await p.source()
  const render = (slug, title, section, md) => {
    const toc = []
    const seen = new Map()
    const html = linkify(markdownToHtml(md.replace(/^# [^\n]*\n/, ''), {
      code: codeBlock,
      heading: (text, level) => {
        const base = slugify(text) || 'section'
        const n = seen.get(base) ?? 0
        seen.set(base, n + 1)
        const id = n ? `${base}-${n}` : base
        if (level === 2) toc.push({ id, text: plain(text) })
        return id
      },
    }), slugs).replace(/href="(?:\.\.\/)+((?:docs|packages|evals)\/[^"]+)"/g, `href="${REPO}$1"`).replace(/<code data-scope="code"><a /g, '<code data-scope="code"><a ')
    const twin = slug.replace(/^codes\//, 'codes/')
    writeFileSync(join(pub, 'docs', `${twin}.md`), md)
    return { slug, title, section, html, toc, description: plain(md.replace(/^# [^\n]*\n/, '')).slice(0, 155) }
  }
  flat.forEach((p, i) => {
    pages[p.slug] = { ...render(p.slug, p.title, p.section, p.md), prev: flat[i - 1] && { slug: flat[i - 1].slug, title: flat[i - 1].title }, next: flat[i + 1] && { slug: flat[i + 1].slug, title: flat[i + 1].title } }
  })
  for (const e of catalog) {
    const { text } = await weftDocs(site, e.code)
    pages[`codes/${e.code}`] = { ...render(`codes/${e.code}`, e.code, 'Reference', text), parent: { slug: 'diagnostics', title: 'Diagnostics' } }
  }
  for (const [section, items] of SECTIONS) nav.push({ section, items: items.map(([slug, title]) => ({ slug, title })) })
  return { nav, pages, flat }
}

// ------------------------------------------------------------------ search

/** Heading-sized pieces of one page, for the body index. */
function sections(md) {
  const parts = []
  let cur = { heading: '', lines: [] }
  let inFence = false
  for (const l of md.split('\n')) {
    if (l.startsWith('```')) inFence = !inFence
    const h = !inFence && /^##+\s+(.*)$/.exec(l)
    if (h) { parts.push(cur); cur = { heading: plain(h[1]), lines: [] } } else cur.lines.push(l)
  }
  parts.push(cur)
  return parts
}

const GROUP = { Start: 'Guides', Learn: 'Guides', Extend: 'Guides', Agents: 'Guides', Migrate: 'Guides', Reference: 'API' }

function buildSearch(docs, extra = []) {
  const t0 = []
  const t1 = []
  for (const p of docs.flat) {
    const group = GROUP[p.section]
    t0.push({ title: p.title, url: `/docs/${p.slug}`, group, rank: 1, keywords: p.slug })
    const rendered = docs.pages[p.slug]
    for (const h of rendered.toc) t0.push({ title: h.text, url: `/docs/${p.slug}#${h.id}`, group, rank: 0.6, parent: p.title })
    for (const s of sections(p.md)) {
      const body = plain(s.lines.join('\n'))
      if (body.length < 12) continue
      const id = s.heading ? slugify(s.heading) : ''
      t1.push({ title: s.heading || p.title, url: `/docs/${p.slug}${id ? `#${id}` : ''}`, group, rank: 0.5, parent: s.heading ? p.title : undefined, text: body.slice(0, 120), keywords: body })
    }
  }
  for (const e of catalog) t0.push({ title: e.code, url: `/docs/codes/${e.code}`, group: 'Diagnostics', rank: 0.9, text: e.catches.slice(0, 90), keywords: e.fix })
  t0.push(...extra)
  const emit = (name, wire) => {
    const text = JSON.stringify(wire)
    const hash = createHash('sha256').update(text).digest('hex').slice(0, 10)
    writeFileSync(join(pub, 'search', `${name}.${hash}.json`), text)
    return { url: `/search/${name}.${hash}.json`, raw: text.length, br: brotliCompressSync(text).length }
  }
  const search = { t0: emit('t0', buildIndex(t0)), t1: emit('t1', buildIndex(t1)), counts: { t0: t0.length, t1: t1.length } }
  writeFileSync(join(pub, 'search.json'), JSON.stringify({ about: 'Every title on the site. /llms.txt has the rest.', items: t0.map(({ title, url, group, parent }) => ({ title, url, group, parent })) }))
  write('search.json', { t0: search.t0.url, t1: search.t1.url })
  return search
}

// ------------------------------------------------------------------ agents

function buildLlms(docs) {
  const lines = ['# weft', '', '> TSX compiled to direct DOM bindings, with warp, its UI toolkit, and a compiler that explains errors to agents.', '', 'Every docs page has a Markdown twin: add `.md` to its URL. `weft docs <topic>` prints the same text.', '']
  for (const { section, items } of docs.nav) {
    lines.push(`## ${section}`, '')
    for (const i of items) lines.push(`- [${i.title}](/docs/${i.slug}.md)`)
    lines.push('')
  }
  lines.push('## Files', '', '- [All docs in one file](/llms-full.txt)', '- [Every title on the site](/search.json)', '')
  writeFileSync(join(pub, 'llms.txt'), lines.join('\n'))
  writeFileSync(join(pub, 'llms-full.txt'), docs.flat.map(p => p.md).join('\n\n---\n\n'))
}

const docs = await buildDocs()
write('numbers.json', numbers())
write('docs-nav.json', docs.nav)
write('docs.json', docs.pages)
const extra = existsSync(join(out, 'search-extra.json')) ? JSON.parse(readFileSync(join(out, 'search-extra.json'), 'utf8')) : []
const search = buildSearch(docs, extra)
buildLlms(docs)
console.log(`[content] ${Object.keys(docs.pages).length} pages; T0 ${search.counts.t0} rows ${(search.t0.br / 1024).toFixed(1)} KB br; T1 ${search.counts.t1} rows ${(search.t1.br / 1024).toFixed(1)} KB br`)
