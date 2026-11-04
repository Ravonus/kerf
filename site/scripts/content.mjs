// Everything the site says that comes from elsewhere in the repo is generated here, so it can't drift. Docs are `weft docs`'
// own pages plus a few files; numbers are evals/. Output is gitignored: src/generated for the routes, public for files
// served as they are (`.md` twins, llms.txt, search indexes).
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliCompressSync, deflateSync } from 'node:zlib'
import { docs as weftDocs } from '../../packages/cli/src/docs.mjs'
import { catalog } from '../../packages/cli/src/catalog.mjs'
import { exportsOf, loadCompiler, resolveWeft } from '../../packages/cli/src/weft.mjs'
import { cleanText, decode, descriptionProblem, truncate } from '../../packages/start/src/derive.mjs'
import { readExamples, readToolkit, showExample } from './toolkit.mjs'
import { reportSampleWidths } from './sample-width.mjs'

// warp-core's source imports without extensions, for bundlers; here Node reads it directly.
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
const { buildIndex, highlight, markdownToHtml } = await import('../../packages/warp-core/src/index.ts')
const { level, PALETTE } = await import('../src/lib/field.ts')
const { GROUPS } = await import('../src/toolkit/docs/index.ts')

const site = join(dirname(fileURLToPath(import.meta.url)), '..')
const repo = join(site, '..')
const out = join(site, 'src/generated')
const pub = join(site, 'public')
rmSync(join(pub, 'search'), { recursive: true, force: true })
// `docs/` held the twins before the section became Learn and Reference: old addresses now redirect (src/routes/docs).
for (const d of ['docs', 'learn', 'reference']) rmSync(join(pub, d), { recursive: true, force: true })
for (const d of [out, join(pub, 'search'), join(pub, 'learn'), join(pub, 'reference/codes')]) mkdirSync(d, { recursive: true })
/** warp's three areas of the site, by the group's file. Everything else is core components. */
const AREAS = { charts: 'charts', agent: 'blocks', admin: 'blocks', collab: 'blocks', flow: 'blocks', live: 'blocks', schedule: 'blocks' }
const areaOf = file => AREAS[file] ?? 'components'
// Every page says something here: these are for the pages with no keyboard table or notes of their own.
const CHART_ACCESS = 'Every chart has a text alternative and a table view of its numbers, so nothing depends on seeing the marks. See [Chart](/charts/chart) for its keyboard support.'
const QUIET_ACCESS = 'This has no shortcuts of its own: controls inside it use Tab, Enter and Space as usual, and warp\'s parts keep their roles and labels.'
const hrefs = new Map()
/** A `/toolkit/x` written anywhere in the words, as the page's real address. Paths like src/toolkit are left alone. */
const live = text => text.replace(/(?<![\w.-])\/toolkit(?:\/([a-z0-9-]+))?(?![\w.-]*\/)/g, (all, slug) => (slug ? hrefs.get(slug) ?? (slug === 'art' ? '/art' : `/components/${slug}`) : '/components'))
const write = (file, value) => writeFileSync(join(out, file), live(JSON.stringify(value)))

// ------------------------------------------------------------------ numbers

/** The stack comparison, from evals/compare/results.json and the run that wrote it. */
function numbers() {
  const results = JSON.parse(readFileSync(join(repo, 'evals/compare/results.json'), 'utf8'))
  const run = readFileSync(join(repo, 'evals/results/compare-history.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l)).sort((a, b) => a.at.localeCompare(b.at)).at(-1)
  // a stack only in the design scenario (weft-tailwind) has no dashboard numbers
  const stacks = Object.entries(results).filter(([, s]) => s.size).map(([id, s]) => ({
    id, label: s.label, js: s.size.js.br, css: s.size.css.br, lines: s.lines, nodes: s.load.nodes, heap: s.load.heapMB, fcp: s.load.fcpMs,
    steps: Object.fromEntries(Object.entries(s.parity.steps).map(([k, v]) => [k, v.dom])),
  }))
  return { stacks, at: run.at.slice(0, 10), commit: run.commit, codes: catalog.length }
}

// ------------------------------------------------------------------ docs

const file = path => () => readFileSync(join(repo, path), 'utf8')
const topic = name => async () => (await weftDocs(site, name)).text

/**
 * The opening line of a page that starts straight in. `weft docs` is read by agents, whose context pays for every word, so
 * these say what a page is for to someone arriving here, and stay out of that source.
 */
/** Pages whose first paragraph is mostly code, so their `meta` is written here. */
const SUMMARIES = { props: 'How a component reads its props: why they stay live, how to destructure them, and when to pass a box instead.' }

const LEADS = {
  rules: 'Nine rules cover how every weft component behaves. The example below uses most of them. Nearly all carry a code, so when you break one, the build names it and says how to fix it.',
  lists: 'Lists and conditionals work as they do in React: `.map` with a `key`, `&&` and ternaries. This page covers the mistakes to avoid and the few habits that keep a long list fast.',
  async: 'Load data with `resource`, and say what to show while it loads with `Boundary`. On the server, weft can wait for that data so the first page arrives filled in.',
  start: '`@weft-js/start` is the full-stack part of weft: routes from files, server functions, a database, auth and realtime. A new app from `create-weft` already has it.',
  browser: "`@weft-js/core/browser` gives you the browser's changing values, such as being online or a tab being visible, as values you read in JSX. It handles the listeners and the cleanup.",
  testing: '`@weft-js/core/test` renders components under vitest and drives them as a user would. `weft check` also flags tests that would pass whatever the code did.',
}

/**
 * Reference: exact API, commands, config and codes. A page's source is `weft docs <topic>` wherever one exists, so the site
 * and the CLI read one file. Teaching goes in Learn (LEARN below), never here.
 */
const SECTIONS = [
  ['Core', [
    ['rules', 'The rules', topic('rules')],
    ['state', 'State', topic('state')],
    ['props', 'Props', topic('props')],
    ['lists', 'Lists', topic('lists')],
    ['async', 'Async', topic('async')],
    ['browser', 'Browser APIs', topic('browser')],
    ['ui-state', 'Shared UI state', topic('ui-state')],
    ['testing', 'Testing', topic('testing')],
  ]],
  ['Full stack', [
    ['start', 'Full stack', topic('start')],
    ['meta', 'Metadata and cards', topic('meta')],
    ['rust', 'Rust', topic('rust')],
    ['pay', 'Payments', file('packages/pay/docs/pay.md')],
  ]],
  ['Styling', [
    ['style', 'Style groups', topic('style')],
    ['design', 'Design language', topic('design')],
    ['icons', 'Icons', topic('icons')],
    ['fonts', 'Fonts', topic('fonts')],
    ['surface', 'Surfaces', topic('surface')],
  ]],
  ['Tooling', [
    ['config', 'Configuration', topic('config')],
    ['plugins', 'Plugins', topic('plugins')],
    ['verify', 'Check your work', topic('verify')],
    ['agents', 'AGENTS.md', topic('agents')],
    ['diagnostics', 'Diagnostics', () => diagnosticsIndex()],
  ]],
  ['Migrate', [
    ['react', 'From React', file('docs/react-props.md')],
  ]],
]

/**
 * Learn: the tutorial, in teaching order. Each page is `site/content/learn/<slug>.md`, read top to bottom. A chapter's first
 * page, when its slug is the chapter's own (see OVERVIEW), previews every page after it.
 */
const LEARN = [
  ['Get started', [
    ['quick-start', 'Quick start'],
    ['tutorial', 'Tutorial: a shop with a server'],
    ['thinking-in-weft', 'Thinking in weft'],
    ['installation', 'Installation'],
    ['setup', 'Editor and TypeScript setup'],
    ['diagnostics', 'Diagnostics and weft check'],
    ['working-with-agents', 'Working with AI agents'],
  ]],
  ['Describing the UI', [
    ['describing-the-ui', 'Describing the UI'],
    ['your-first-component', 'Your first component'],
    ['importing-and-exporting', 'Importing and exporting components'],
    ['writing-markup-with-tsx', 'Writing markup with TSX'],
    ['javascript-in-tsx', 'JavaScript in TSX with braces'],
    ['passing-props', 'Passing props'],
    ['conditional-rendering', 'Conditional rendering'],
    ['rendering-lists', 'Rendering lists'],
    ['components-run-once', 'Components run once'],
    ['your-ui-as-a-tree', 'Your UI as a tree'],
  ]],
  ['Adding interactivity', [
    ['adding-interactivity', 'Adding interactivity'],
    ['responding-to-events', 'Responding to events'],
    ['state', 'State: a box with .value'],
    ['how-updates-reach-the-dom', 'How an update reaches the DOM'],
    ['updating-objects-and-arrays', 'Updating objects and arrays'],
    ['bind', 'Writing to a parent with bind:'],
    ['forms-and-inputs', 'Forms and inputs'],
  ]],
  ['Managing state', [
    ['managing-state', 'Managing state'],
    ['reacting-to-input', 'Reacting to input with state'],
    ['choosing-state-structure', 'Choosing the state structure'],
    ['derived', 'Derived values'],
    ['sharing-state', 'Sharing state between components'],
    ['passing-data-deeply', 'Passing data deeply'],
    ['entries', 'Keyed state and entries'],
    ['ui-state', 'Hover, focus and shared UI state'],
    ['app-wide-state', 'App-wide state with defineState'],
  ]],
  ['Escape hatches', [
    ['escape-hatches', 'Escape hatches'],
    ['refs-and-the-dom', 'Refs and the DOM'],
    ['effects', 'Effects'],
    ['you-might-not-need-an-effect', 'You might not need an effect'],
    ['cleanup-and-ownership', 'Cleanup and ownership'],
    ['reusing-logic', 'Reusing logic'],
    ['async-and-loading', 'Async and loading states'],
    ['text-media-and-shapes', 'Text, media and shapes'],
  ]],
  ['Full-stack apps', [
    ['full-stack', 'Full-stack apps'],
    ['routing-and-layouts', 'Routing and layouts'],
    ['loading-data', 'Loading data'],
    ['server-functions', 'Server functions'],
    ['database', 'Database'],
    ['auth', 'Auth'],
    ['forms-and-validation', 'Forms and validation'],
    ['live-data', 'Realtime and live data'],
    ['uploads-and-media', 'Uploads and media'],
    ['payments', 'Payments'],
    ['metadata-and-share-images', 'Metadata and share images'],
    ['ssr-and-hydration', 'SSR, islands and hydration'],
    ['deploying', 'Runtimes and deploying'],
  ]],
  ['Styling and warp', [
    ['styling-and-warp', 'Styling and warp'],
    ['styling', 'Styling and style groups'],
    ['warp', 'Using warp'],
    ['theming', 'Theming'],
    ['icons', 'Icons'],
    ['fonts', 'Fonts'],
    ['accessibility', 'Accessibility'],
  ]],
  ['Testing and tooling', [
    ['testing-and-tooling', 'Testing and tooling'],
    ['testing', 'Testing'],
    ['plugins', 'Plugins'],
    ['performance', 'Performance and bundle size'],
    ['rust', 'Rust, in depth'],
  ]],
]
/** A chapter's overview page: the one whose slug is the chapter's name. Get started has /learn itself. */
const overviewOf = (section, items) => items.find(([slug]) => slug === slugify(section.replace(/ apps$/, '')))?.[0]
/** Learn pages that moved, old slug to new. src/routes/learn answers each with a 308, `.md` twins included. */
const MOVED = { 'lists-and-conditions': 'rendering-lists' }

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
/** Plain text from a block of markdown. */
const unmark = b => cleanText(decode(b.replace(/<[^>]+>/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*_]/g, '')))

/** The sentences a page's `meta` can open with: from the start, up to the first that a reader wouldn't want. */
function opening(text, skip) {
  const kept = []
  for (const s of text.match(/\S.*?[.!?](?=\s+[A-Z"“`]|\s*$)/g) ?? []) {
    if (skip?.test(s) || descriptionProblem(s) || s.length < 25) break
    kept.push(s)
  }
  const said = truncate(kept.join(' '))
  return descriptionProblem(said) ? '' : said
}

/** A docs page's `meta`: the opening of its first paragraph of prose that has one. */
function summary(md) {
  const blocks = md.replace(/```[\s\S]*?```/g, '\n\n').split(/\n\s*\n/).map(b => b.trim())
  for (const para of blocks.filter(b => b && !/^(?:#|[-*+] |\d+[.)] |\||>|<|:::)/.test(b))) {
    const text = opening(unmark(para))
    if (text.length >= 40) return text
  }
  return ''
}
const CODE = /\b[WDTPHQSFIACRXM]\d{3}\b/g
const known = new Set(catalog.map(e => e.code))
const REPO = 'https://github.com/Ravonus/weft/blob/main/'

const copyButton = `<button type="button" data-scope="button" data-emphasis="ghost" data-tone="neutral" data-size="sm" data-act="copy" data-copy="" aria-label="Copy code"><span data-part="indicator">${readIcon('copy')}${readIcon('check')}</span></button>`

/** warp's CodeBlock markup, as a string: a docs page has no component to run. */
function codeBlock(text, language) {
  const lang = language || 'text'
  const oneline = !text.trim().includes('\n')
  return `<figure data-scope="codeblock" data-bare=""${oneline ? ' data-oneline=""' : ''}><div data-part="head"><span class="sp"></span><span data-part="lang">${lang}</span>${copyButton}</div><pre tabindex="0"><code>${highlight(text, lang)}</code></pre></figure>`
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
      .replace(CODE, c => (known.has(c) ? `<a href="/reference/codes/${c}">${c}</a>` : c))
      .replace(/weft docs ([a-z-]+)/g, (m, t) => (slugs.has(t) ? `<a href="/reference/${t}">${m}</a>` : m))
  }).join('')
}

/** Headings numbered by hand become steps: the number leaves the words for the page's gutter. */
const steps = html => html.replace(/<h2([^>]*)>(\d+)\. /g, '<h2$1 data-step="$2">')

/** One page's Markdown to HTML, with heading ids unique across every call, and the contents list they make. */
function renderer(slugs) {
  const toc = []
  const seen = new Map()
  const html = md => steps(linkify(markdownToHtml(md, {
    code: codeBlock,
    heading: (text, depth) => {
      const base = slugify(text) || 'section'
      const n = seen.get(base) ?? 0
      seen.set(base, n + 1)
      const id = n ? `${base}-${n}` : base
      if (depth === 2) toc.push({ id, text: plain(text).replace(/^\d+\.\s+/, '') })
      if (depth === 3 && toc.length) toc.push({ id, text: plain(text), depth: 3 })
      return id
    },
  }), slugs).replace(/href="(?:\.\.\/)+((?:docs|packages|evals)\/[^"]+)"/g, `href="${REPO}$1"`))
  return { html, toc }
}

/** Reference: `weft docs` topics, the diagnostics index and one page per code. */
async function buildReference() {
  const nav = []
  const pages = {}
  const flat = SECTIONS.flatMap(([section, items]) => items.map(([slug, title, source]) => ({ section, slug, title, source })))
  const slugs = new Set(flat.map(p => p.slug))
  for (const p of flat) p.md = await p.source()
  const render = (slug, title, section, md) => {
    const r = renderer(slugs)
    const html = r.html(md.replace(/^# [^\n]*\n/, ''))
    writeFileSync(join(pub, 'reference', `${slug}.md`), md)
    return { slug, title, section, lead: LEADS[slug] && markdownToHtml(LEADS[slug]).replace(/^\s*<p[^>]*>|<\/p>\s*$/g, ''), html, toc: r.toc, description: SUMMARIES[slug] || summary(LEADS[slug] ?? md.replace(/^# [^\n]*\n/, '')) || `${title}: ${section} in the weft reference.` }
  }
  flat.forEach((p, i) => {
    pages[p.slug] = { ...render(p.slug, p.title, p.section, p.md), prev: flat[i - 1] && { slug: flat[i - 1].slug, title: flat[i - 1].title }, next: flat[i + 1] && { slug: flat[i + 1].slug, title: flat[i + 1].title } }
  })
  for (const e of catalog) {
    const { text } = await weftDocs(site, e.code)
    pages[`codes/${e.code}`] = { ...render(`codes/${e.code}`, e.code, 'Diagnostics', text), description: opening(unmark(`${e.catches}.`)) || `${e.code}: what this weft diagnostic means and how to fix it.`, parent: { slug: 'diagnostics', title: 'Diagnostics' } }
  }
  for (const [section, items] of SECTIONS) nav.push({ section, items: items.map(([slug, title]) => ({ slug, title })) })
  return { nav, pages, flat, slugs }
}

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
  const flush = () => { if (buf.join('').trim()) blocks.push({ html: r.html(buf.join('\n')) }); buf = [] }
  const lines = md.replace(/^# [^\n]*\n/, '').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    const fence = /^:::(learn|demo|note|pitfall|deepdive|challenge)\s*(.*)$/.exec(l)
    if (!fence) { buf.push(l); continue }
    const [, kind, arg] = fence
    if (kind === 'demo') {
      if (!demoIds.has(arg)) throw new Error(`learn: no demo called ${arg} in src/components/LearnDemo.tsx`)
      flush()
      blocks.push({ demo: arg })
      continue
    }
    const inner = []
    for (i++; i < lines.length && lines[i] !== ':::'; i++) inner.push(lines[i])
    if (i >= lines.length) throw new Error(`learn: :::${kind} is never closed`)
    const plainHtml = text => linkify(markdownToHtml(text, { code: codeBlock }), slugs)
    if (kind === 'learn') { box = plainHtml(inner.join('\n')); continue }
    flush()
    const titled = arg ? `<p data-part="title">${inline(arg)}</p>` : ''
    if (kind === 'note') { blocks.push({ html: `<aside data-site="note">${titled}${plainHtml(inner.join('\n'))}</aside>` }); continue }
    if (kind === 'pitfall') { blocks.push({ html: `<aside data-site="pitfall"><p data-part="label">Pitfall</p>${titled}${plainHtml(inner.join('\n'))}</aside>` }); continue }
    if (kind === 'deepdive') {
      if (!arg) throw new Error('learn: a :::deepdive needs a title')
      blocks.push({ html: `<details data-site="deepdive"><summary><span data-part="label">Deep dive</span><span data-part="title">${inline(arg)}</span></summary><div data-part="body">${plainHtml(inner.join('\n'))}</div></details>` })
      continue
    }
    const at = inner.indexOf(':::solution')
    const task = at < 0 ? inner : inner.slice(0, at)
    const answer = at < 0 ? [] : inner.slice(at + 1)
    challenges++
    blocks.push({ html: `<section data-site="challenge"><p data-part="label">Challenge ${challenges}</p><h3>${esc(arg)}</h3>${plainHtml(task.join('\n'))}${answer.length ? `<details><summary>Show the solution</summary>${plainHtml(answer.join('\n'))}</details>` : ''}</section>` })
  }
  flush()
  return { box, blocks, toc: r.toc }
}
const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Learn: the tutorial pages, in order, with prev and next running straight through the chapters. */
function buildLearn(reference) {
  // A demo shows only where src/components/LearnDemo.tsx has a JSX site for it.
  const demoIds = new Set([...readFileSync(join(site, 'src/components/LearnDemo.tsx'), 'utf8').matchAll(/props\.id === '([a-z0-9-]+)'/g)].map(m => m[1]))
  const flat = LEARN.flatMap(([section, items]) => items.map(([slug, title]) => ({ section, slug, title, md: readFileSync(join(site, 'content/learn', `${slug}.md`), 'utf8') })))
  const pages = {}
  flat.forEach((p, i) => {
    const { box, blocks, toc } = learnBlocks(p.md, reference.slugs, demoIds)
    if (!box) throw new Error(`learn/${p.slug}.md has no :::learn box`)
    writeFileSync(join(pub, 'learn', `${p.slug}.md`), p.md)
    const body = p.md.replace(/^# [^\n]*\n/, '').replace(/^:::learn[\s\S]*?^:::$/m, '')
    pages[p.slug] = {
      slug: p.slug, title: p.title, section: p.section, box, blocks, toc,
      description: summary(body) || `${p.title}: ${p.section} in Learn weft.`,
      prev: flat[i - 1] && { slug: flat[i - 1].slug, title: flat[i - 1].title },
      next: flat[i + 1] && { slug: flat[i + 1].slug, title: flat[i + 1].title },
    }
  })
  const nav = LEARN.map(([section, items]) => ({ section, overview: overviewOf(section, items) ?? null, items: items.map(([slug, title]) => ({ slug, title })) }))
  for (const [from, to] of Object.entries(MOVED)) if (!pages[to] || pages[from]) throw new Error(`learn: ${from} moves to ${to}, which must exist while ${from} doesn't`)
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

/** Search groups: Learn is the guide, Reference is the API. */
const GROUP = { learn: 'Guides', reference: 'API' }

/** Every name `weft` exports, pointing at the section that first uses it, so "state" finds `state` before prose about it. */
function symbols(docs) {
  const dir = join(repo, 'packages/weft')
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const rows = []
  for (const [from, names] of Object.entries(exportsOf({ dir, pkg }))) {
    for (const name of names) {
      const uses = new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`)
      for (const p of docs.flat) {
        const s = sections(p.md.replace(/^# [^\n]*\n/, '')).find(x => uses.test(x.lines.join('\n')))
        if (!s) continue
        rows.push({ title: name, url: `/reference/${p.slug}${s.heading ? `#${slugify(s.heading)}` : ''}`, group: 'API', rank: 0.95, parent: s.heading ? `${p.title} / ${s.heading}` : p.title, text: from })
        break
      }
    }
  }
  return rows
}

function buildSearch(docs, learn, extra = []) {
  const t0 = []
  const t1 = []
  const pages = [...learn.flat.map(p => ({ ...p, base: 'learn', toc: learn.pages[p.slug].toc })), ...docs.flat.map(p => ({ ...p, base: 'reference', toc: docs.pages[p.slug].toc }))]
  for (const p of pages) {
    const group = GROUP[p.base]
    const url = `/${p.base}/${p.slug}`
    t0.push({ title: p.title, url, group, rank: p.base === 'learn' ? 1 : 0.98, keywords: p.slug })
    for (const h of p.toc) t0.push({ title: h.text, url: `${url}#${h.id}`, group, rank: 0.6, parent: p.title })
    for (const s of sections(p.md.replace(/^# [^\n]*\n/, '').replace(/^:::.*$/gm, ''))) {
      const body = plain(s.lines.join('\n'))
      if (body.length < 12) continue
      const id = s.heading ? slugify(s.heading) : ''
      t1.push({ title: s.heading || p.title, url: `${url}${id ? `#${id}` : ''}`, group, rank: 0.5, parent: s.heading ? p.title : undefined, text: body.slice(0, 120), keywords: body })
    }
  }
  for (const e of catalog) t0.push({ title: e.code, url: `/reference/codes/${e.code}`, group: 'Diagnostics', rank: 0.9, text: e.catches.slice(0, 90), keywords: e.fix })
  t0.push(...symbols(docs), ...extra)
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

// ------------------------------------------------------------------ toolkit

/** What the common props mean, so a table isn't blank where the source has no comment. A Doc's `propDocs` wins. */
const PROP_WORDS = {
  children: 'What it contains.', label: 'Its accessible name. Fields show it; icon-only controls speak it.', hint: 'One line of help under the control.', error: 'A message that marks the field invalid and says why.',
  value: 'The current value, when you own the state.', defaultValue: 'The starting value, when the component owns the state.', defaultChecked: 'Starts checked.', checked: 'Whether it is on.', onChange: 'Called with the new value.', onInput: 'Called on each keystroke.',
  onClick: 'Called when pressed.', onSelect: 'Called with what was picked.', onClose: 'Called after it closes.', onOpen: 'Called after it opens.', open: 'A state box that holds whether it is open.', disabled: 'Turns it off, and takes it out of the tab order.', readOnly: 'Shows the value but does not let it change.', required: 'The form will not submit without it.',
  name: 'The name it posts under in a form.', id: 'The element id. One is made for you if you leave it out.', placeholder: 'Sample text shown while empty. Never a substitute for a label.', tone: 'What it means: neutral, accent, positive, caution, critical or info.', size: 'Control size. `md` by default.', emphasis: 'How loud it is.',
  icon: 'An icon name from `@weft-js/warp-icons`, or a component.', title: 'The heading.', description: 'One supporting line under the title.', footer: 'What sits at the bottom, usually actions.', options: 'What can be picked.', items: 'The rows it shows.', rows: 'The data, one object per row.', columns: 'One definition per column.', caption: 'Names the table for screen readers.',
  data: 'The series to draw.', format: 'Turns a value into the text shown.', min: 'The lowest allowed value.', max: 'The highest allowed value.', step: 'How far one key press moves it.', loading: 'Shows that work is under way.', full: 'Takes the whole width of its container.', side: 'Which edge it sits on.', align: 'How it lines up with what opened it.', placement: 'Where it opens relative to what opened it.',
  height: 'Its height, in pixels.', width: 'Its width.', ratio: 'Width to height.', gap: 'The space between children, from warp\'s space scale.', as: 'The element it renders as.', variant: 'Which form it takes.', count: 'The number it shows.', locale: 'The language and region used to format values.', href: 'Where it links.', ui: 'A row from `interaction()`, which it fills and draws.', onSubmit: 'Called with the values when submitted.', onSave: 'Called with the result when saved.', onCancel: 'Called when dismissed.', onDelete: 'Called when deleted.', onRemove: 'Called when removed.',
}
const HIDDEN_PROPS = new Set(['ui', 'ref', 'class', 'style', 'key'])
/** Plain headings for what the group files call an example. */
const PLAIN = {
  Emphasis: 'Variants', 'Label and line styles': 'Variants', 'Label styles': 'Variants', Tone: 'Tones', 'With an icon': 'Icons', 'With icons': 'Icons', 'Types and icons': 'With icon',
  'Every state': 'States', 'Each state': 'States', 'Off, on and disabled': 'States', 'Empty, hint and invalid': 'States', 'Empty, filled, hint and invalid': 'States', 'Empty, filled and disabled': 'States',
  'Live check': 'Validation', 'Hint and error': 'Validation', Align: 'Alignment', 'A short form': 'With form',
}
const plainTitle = t => PLAIN[t] ?? t
/**
 * A component page's order, the same everywhere: one preview, then an H2 per real option, simplest first. Examples in a
 * generic section ("Variants", "In context") each become their own H2; a named section, like Placement, keeps its
 * examples together under it. A group's file can name the opening preview with `hero`.
 */
function arrange(doc) {
  const shown = doc.sections.filter(s => s.kind !== 'prose')
  const by = kind => shown.filter(s => s.kind === kind).flatMap(s => s.examples)
  const hero = doc.hero ? { id: doc.hero, ...shown.flatMap(s => s.examples).find(e => e.id === doc.hero) } : (by('variants')[0] ?? by('composition')[0] ?? by('states')[0])
  const generic = /^(Variants?|States?|In context|Examples?|Composition)$/
  const rank = { variants: 10, sizes: 11, states: 12, composition: 13, prose: 14 }
  const first = ['Placement', 'Alignment', 'Variants', 'Sizes', 'Tones']
  const weight = s => (first.includes(s.title) ? first.indexOf(s.title) : rank[s.kind])
  const parts = doc.sections.flatMap(s => {
    if (s.kind === 'prose') return [s]
    const rest = s.examples.filter(e => e.id !== hero?.id)
    if (!rest.length) return []
    if (!generic.test(s.title)) return [{ ...s, examples: rest }]
    return rest.map(e => ({ kind: /^sizes?$/i.test(e.title) ? 'sizes' : s.kind, title: plainTitle(e.title), intro: e.note, examples: [{ ...e, note: undefined }] }))
  }).sort((a, b) => weight(a) - weight(b))
  return { hero, parts }
}

/** The shortest thing that shows a component in use, for the Usage heading. */
function usageOf(doc, name, found, play) {
  const line = `import { ${name} } from '@weft-js/warp'`
  const from = play && !play.code.includes('{children}') ? null : play?.code
  const start = play && Object.fromEntries(play.knobs.map(k => [k.prop, k.initial]))
  const kids = String(start?.children ?? '')
  if (from) return `${line}\n\n${(kids ? from : from.replace(/>\{children\}<\/[\w.]+>/, ' />')).replace('{props}', '').replace('{children}', () => kids)}`
  if (doc.usage) return `${line}\n\n${doc.usage}`
  const first = arrange(doc).hero, f = first && found.get(first.id)
  return f?.stateless && f.body.split('\n').length <= 10 ? `${line}\n\n${f.body}` : line
}

const SPEC_WORDS = /§|\bSIGNATURE\b|\bspecimen\b/
const GITHUB_SRC = 'https://github.com/Ravonus/weft/blob/main/'

/** A prop's row: the prop's own comment, then the page's, then the common word, and never a spec reference. */
/** A default the words name, as in "`md` by default", when it's one of the prop's own values and not one case of several. */
const namedDefault = (p, words) => {
  const named = /`([^`]+)` by default(?! for)/.exec(words)?.[1]
  return named !== undefined && p.values?.map(String).includes(named) ? (typeof p.values[0] === 'string' ? `'${named}'` : named) : undefined
}
/** The default the source states, else the one the words name; an optional switch left out is off. */
const propDefault = (p, words) => p.default ?? namedDefault(p, words) ?? (!p.required && !p.worked && p.type === 'boolean' ? 'false' : undefined)
const propRow = (p, doc) => {
  const words = (doc.propDocs?.[p.name] ?? cleanDoc(p.doc)) || PROP_WORDS[p.name] || ''
  return { name: p.name, type: p.type, required: p.required, default: propDefault(p, words), doc: words }
}
const cleanDoc = text => {
  const said = text.replace(/\s*\((?:[^()]*§[^()]*|components\.html[^()]*)\)/g, '').replace(/\s+\[?\d{2} §[\d.]+\]?/g, '').trim()
  return SPEC_WORDS.test(said) ? '' : said
}

/** The most options a playground shows as one button each; past it, a dropdown. */
const FEW = 6
/** Knobs, finished from the type checker: options, the control that suits them, and the default the code compares against. */
function finishKnobs(play, props, where) {
  return {
    ...play,
    knobs: play.knobs.map(k => {
      const p = props.find(x => x.name === k.prop)
      if (!p && k.prop !== 'children' && !k.options && !k.control) throw new Error(`${where}: no prop ${k.prop}`)
      const options = k.options ?? p?.values
      // A choice is a button per option while there are few enough to read at a glance; a long list is a dropdown.
      const choice = options && (k.control === 'select' || k.control === 'segmented' || (!k.control && p?.type !== 'boolean'))
      const control = choice ? (options.length <= FEW ? 'segmented' : 'select') : k.control ?? (p?.type === 'boolean' ? 'switch' : p?.type === 'number' ? 'slider' : 'text')
      const unquoted = p?.default?.replace(/^['"]|['"]$/g, '')
      const fallback = k.default !== undefined ? k.default : unquoted === 'true' ? true : unquoted === 'false' ? false : unquoted !== undefined && unquoted !== '' && !isNaN(+unquoted) ? +unquoted : unquoted
      const initial = k.initial !== undefined ? k.initial : fallback !== undefined ? fallback : control === 'switch' ? false : options?.[0] ?? ''
      return { prop: k.prop, control, label: k.label ?? (k.prop[0].toUpperCase() + k.prop.slice(1)).replace(/([a-z])([A-Z])/g, (_, a, b) => `${a} ${b.toLowerCase()}`), options, min: k.min, max: k.max, step: k.step, initial, default: fallback, when: k.when }
    }),
  }
}

function buildToolkit() {
  const facts = new Map(readToolkit(repo).map(c => [c.name, c]))
  const problems = []
  const pages = {}
  const index = []
  const registry = []
  const blank = { all: 0, none: 0 }
  const slugFor = name => facts.get(name)?.slug
  const order = GROUPS.flatMap(g => g.docs.map(d => d.component))
  const areaIn = n => areaOf(GROUPS.find(g => g.docs.some(d => d.component === n)).file)
  const seen = new Set()
  for (const g of GROUPS) for (const d of g.docs) if (facts.get(d.component)) hrefs.set(facts.get(d.component).slug, `/${areaOf(g.file)}/${facts.get(d.component).slug}`)
  for (const g of GROUPS) {
    const path = join(site, 'src/toolkit/examples', `${g.file}.tsx`)
    const found = existsSync(path) ? readExamples(path) : new Map()
    if (existsSync(path)) registry.push(g.file)
    const tiles = []
    for (const doc of g.docs) {
      const c = facts.get(doc.component)
      if (!c) { problems.push(`${doc.component}: not one of warp's exports`); continue }
      if (seen.has(c.name)) problems.push(`${c.name}: documented twice`)
      seen.add(c.name)
      if (!doc.summary) problems.push(`${c.name}: no summary`)
      if (doc.summary?.length > 120) problems.push(`${c.name}: summary is ${doc.summary.length} characters`)
      const words = [doc.summary, ...(doc.use?.when ?? []), ...doc.sections.flatMap(s => s.kind === 'prose' ? [s.md] : [s.title, s.intro ?? '', ...s.examples.flatMap(e => [e.title, e.note ?? ''])])].join('\n')
      if (SPEC_WORDS.test(words)) problems.push(`${c.name}: spec jargon in its words`)
      if (/Variant \d/.test(words)) problems.push(`${c.name}: an example is called "Variant N"`)
      const example = ref => {
        const f = found.get(ref.id)
        if (!f) { problems.push(`${c.name}: no export ${ref.id} in examples/${g.file}.tsx`); return ref }
        const text = showExample(f, c.name)
        return { ...ref, code: codeBlock(text, 'tsx'), lines: text.split('\n').length }
      }
      const { hero, parts: arranged } = arrange(doc)
      const shownHero = hero && example(hero)
      const shownSections = arranged.map(s => (s.kind === 'prose' ? { ...s, html: markdownToHtml(s.md) } : { ...s, intro: s.intro && inline(s.intro), examples: s.examples.map(e => ({ ...example(e), note: e.note && inline(e.note) })) }))
      const visible = c.props.filter(p => !HIDDEN_PROPS.has(p.name) && !doc.hideProps?.includes(p.name))
      const rows = visible.map(p => propRow(p, doc))
      blank.all += rows.length
      blank.none += rows.filter(r => !r.doc).length
      const groups = [['Props', rows.filter(r => !/^on[A-Z]/.test(r.name))], ['Events', rows.filter(r => /^on[A-Z]/.test(r.name))]].filter(([, list]) => list.length).map(([title, list]) => ({ title, rows: list }))
      const first = doc.sections.find(s => s.kind !== 'prose')?.examples[0]
      const tile = doc.tile ?? first?.id
      const related = (doc.related ?? []).filter(slugFor).map(name => ({ name, slug: slugFor(name), href: hrefs.get(slugFor(name)) }))
      const play = doc.playground && finishKnobs(doc.playground, c.props, c.name)
      if (play && !found.has(play.example)) problems.push(`${c.name}: no export ${play.example}`)
      const heads = [{ id: 'installation', text: 'Installation' }, ...(play ? [{ id: 'playground', text: 'Try it' }] : []), { id: 'usage', text: 'Usage' }, ...shownSections.flatMap(s => [{ id: slugify(s.title), text: s.title }, ...(s.kind === 'prose' || s.examples.length < 2 ? [] : s.examples.map(e => ({ id: e.id, text: e.title, depth: 3 })))]), ...(doc.use ? [{ id: 'when-to-use', text: 'When to use' }] : []), { id: 'accessibility', text: 'Accessibility' }, { id: 'api-reference', text: 'API Reference' }]
      const i = order.indexOf(c.name)
      const near = n => n && facts.get(n) && areaIn(n) === areaOf(g.file) && { name: n, slug: slugFor(n), href: hrefs.get(slugFor(n)) }
      pages[c.slug] = {
        name: c.name, slug: c.slug, area: areaOf(g.file), group: g.title, usage: codeBlock(usageOf(doc, c.name, found, play), 'tsx'), file: g.file, source: `${GITHUB_SRC}${c.file}`, sourceFile: c.file, summary: doc.summary, description: truncate(doc.summary),
        use: doc.use && { when: doc.use.when, instead: doc.use.instead?.filter(x => slugFor(x.name)).map(x => ({ ...x, slug: slugFor(x.name), href: hrefs.get(slugFor(x.name)) })) }, playground: play, hero: shownHero, sections: shownSections, keyboard: doc.keyboard, a11yNotes: (doc.a11yNotes ?? (doc.keyboard ? undefined : [areaOf(g.file) === 'charts' ? CHART_ACCESS : QUIET_ACCESS]))?.map(inline), groups, parts: c.parts, scope: c.scope, states: c.states, related, importLine: codeBlock(`import { ${c.name} } from '@weft-js/warp'`, 'tsx'), toc: heads, tile, prev: near(order[i - 1]), next: near(order[i + 1]),
      }
      const refs = doc.sections.flatMap(s => s.examples ?? [])
      tiles.push({ name: c.name, slug: c.slug, href: hrefs.get(c.slug), summary: doc.summary, id: tile, stage: doc.tileStage ?? refs.find(r => r.id === tile)?.stage ?? 'center', fit: doc.tileFit ?? (areaOf(g.file) === 'charts' ? 'contain' : undefined), width: doc.tileWidth })
    }
    index.push({ title: g.title, area: areaOf(g.file), id: slugify(g.title), file: g.file, intro: g.intro, pack: g.pack, tiles })
  }
  const missing = [...facts.keys()].filter(n => !seen.has(n))
  if (problems.length) throw new Error(`the toolkit's docs:\n  ${problems.join('\n  ')}`)
  writeFileSync(join(out, 'previews.ts'), `// Generated by scripts/content.mjs.\nexport const previews: Record<string, () => Promise<any>> = {\n${registry.map(f => `  ${JSON.stringify(f)}: () => import('../toolkit/examples/${f}'),`).join('\n')}\n}\n`)
  write('toolkit.json', pages)
  write('toolkit-index.json', { total: facts.size, groups: index })
  // the rail: a component with no page yet still has no link
  write('toolkit-nav.json', index.filter(g => g.tiles.length).map(g => ({ group: g.title, area: g.area, items: g.tiles.map(({ name, slug, href }) => ({ name, slug, href })) })))
  if (missing.length) console.log(`[content] no docs yet for ${missing.length}: ${missing.join(' ')}`)
  console.log(`[content] props with no words: ${blank.none} of ${blank.all}`)
  return Object.values(pages).map(p => ({ title: p.name, url: hrefs.get(p.slug), group: 'Components', rank: 0.9, parent: p.group, text: p.summary }))
}

/** One line of words: `code` becomes code, and nothing else is expected. */
const inline = md => markdownToHtml(md).replace(/^\s*<p[^>]*>|<\/p>\s*$/g, '')

// ------------------------------------------------------------------ icons

/** Every drawing, from the set's generated source: `{ name: [hollow, solid] }`, content-addressed in `public/`. */
function buildIcons() {
  const source = readFileSync(join(repo, 'packages/icons/src/gen/all.tsx'), 'utf8')
  const names = JSON.parse(/names = (\[[^\]]*\])/.exec(readFileSync(join(repo, 'packages/icons/src/gen/names.ts'), 'utf8'))[1])
  const title = n => n.replace(/(^|-)(.)/g, (_, __, c) => c.toUpperCase())
  const drawn = new Map()
  for (const [, id, one, two] of source.matchAll(/^export const (\w+) = \/\*#__PURE__\*\/ icon\('([^']*)'(?:,\s*'([^']*)')?\)/gm)) drawn.set(id, one + (two ?? ''))
  const set = Object.fromEntries(names.map(n => [n, [drawn.get(`${title(n)}Icon`), drawn.get(`${title(n)}IconSolid`)]]))
  const missing = names.filter(n => !set[n][0] || !set[n][1])
  if (missing.length) throw new Error(`icons without both forms: ${missing.join(' ')}`)
  const text = JSON.stringify(set)
  const hash = createHash('sha256').update(text).digest('hex').slice(0, 10)
  writeFileSync(join(pub, 'search', `icons.${hash}.json`), text)
  write('icons.json', { url: `/search/icons.${hash}.json`, names })
  return names.map(n => ({ title: n, url: `/icons?q=${n}`, group: 'Icons', rank: 0.3 }))
}

// ------------------------------------------------------------------ art

/** A palette PNG, by hand: the poster is a few KB of cells, sized up with `image-rendering: pixelated`. */
/** The share card's picture: the hero's field, fading out towards the words, with the mark woven on it. 10 px cells. */
function cardArt() {
  const cols = 120, rows = 63, CELL = 10
  const unit = 2.4, ox = 62, oy = 3
  const warps = [5, 10, 15, 20].map(u => ox + u * unit), wefts = [9, 15].map(u => oy + u * unit)
  const near = (v, at) => Math.abs(v + 0.5 - at) <= 1.5
  const cell = (x, y) => {
    const warp = warps.findIndex(at => near(x, at)), weft = wefts.findIndex(at => near(y, at))
    const inWarp = warp >= 0 && y >= oy + 3 * unit && y < oy + 21 * unit
    const inWeft = weft >= 0 && x >= ox + 2 * unit && x < ox + 22 * unit
    if (inWarp && (!inWeft || (warp + weft) % 2 === 1)) return 4
    if (inWeft) return 6
    return level(x, y, cols, rows, 0, -0.75 * (1 - Math.min(1, x / cols / 0.72)) ** 1.2 * 1.4)
  }
  return png(cols * CELL, rows * CELL, (x, y) => Math.max(0, cell((x / CELL) | 0, (y / CELL) | 0)), [...PALETTE, [250, 120, 90, 255]])
}

function png(width, height, pixel, palette) {
  const crcTable = Int32Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c })
  const crc = buf => { let c = -1; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0 }
  const chunk = (type, data) => {
    const head = Buffer.alloc(4); head.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const tail = Buffer.alloc(4); tail.writeUInt32BE(crc(body))
    return Buffer.concat([head, body, tail])
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 3
  const raw = Buffer.alloc((width + 1) * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) raw[y * (width + 1) + 1 + x] = pixel(x, y)
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('PLTE', Buffer.from(palette.flatMap(c => c.slice(0, 3)))), chunk('tRNS', Buffer.from(palette.map(c => c[3]))), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

function buildArt() {
  mkdirSync(join(pub, 'art'), { recursive: true })
  writeFileSync(join(pub, 'art/field.png'), png(160, 100, (x, y) => level(x, y, 160, 100, 0), PALETTE))
  write('card-art.json', { src: `data:image/png;base64,${cardArt().toString('base64')}` })
  // A band that dissolves from solid to nothing: the site's divider.
  writeFileSync(join(pub, 'art/band.png'), png(64, 12, (x, y) => (y / 12 < BAYER4[(y & 3) * 4 + (x & 3)] / 16 ? 1 : 0), [[0, 0, 0, 0], [46, 176, 104, 255]]))
}

/** The landing's code moment and diagnostic, from the real compiler. */
function buildShowcase() {
  const compiler = loadCompiler(resolveWeft(site))
  const source = `import { state } from '@weft-js/core'

export function Counter() {
  const n = state(0)
  return <button onClick={() => n.value++}>{n.value}</button>
}`
  const compiled = compiler.transform(source, { filename: 'Counter.tsx' }).code.trim()
  const bad = `function Total(props: { count: number }) {
  const total = props.count * 5
  return <b>{total}</b>
}`
  const report = compiler.transform(bad, { filename: 'Total.tsx' }).diagnostics.find(d => d.code === 'W001')
  if (!report) throw new Error('the showcase expects W001')
  const entry = catalog.find(e => e.code === 'W001')
  const good = `function Total(props: { count: number }) {
  const total = derived(() => props.count * 5)
  return <b>{total.value}</b>
}`
  const block = (text, lang) => `<pre tabindex="0"><code>${highlight(text, lang)}</code></pre>`
  const unquoted = s => s.replaceAll('`', '') // the compiler's words, without the terminal's quoting
  const marked = (text, lines) => {
    let n = -1
    return `<pre tabindex="0"><code>${highlight(text, 'tsx').replace(/<span data-part="line">/g, tag => { n++; return lines[n] ? `<span data-part="line" data-${lines[n]}="">` : tag })}</code></pre>`
  }
  const diff = `function Total(props: { count: number }) {
  const total = props.count * 5
  const total = derived(() => props.count * 5)
  return <b>{total}</b>
  return <b>{total.value}</b>
}`
  const habit = compiler.transform(`import { state } from '@weft-js/core'\nfunction Price(props: { value: number }) {\n  const n = state(props.value)\n  return <b>{n.value}</b>\n}`, { filename: 'Price.tsx' }).diagnostics.find(d => d.code === 'W005')
  if (!habit) throw new Error('the showcase expects W005')
  const server = `// src/server/shop.ts
export const products = query({
  tags: ['products'],
  run: ({ ctx }) => ctx.db.select().from(schema.products),
})

// in Shop: the list now comes from the database
const list = products()
{(list.value ?? []).map(p => <Row key={p.id} product={p} />)}`
  const size = JSON.parse(readFileSync(join(repo, 'evals/results/v3-warp-exit/exit.json'), 'utf8')).size
  const kb = n => +(n / 1024).toFixed(2)
  write('showcase.json', { receipt: { weft: kb(size.weft.js), kit: kb(size.kit), total: kb(size.weft.js + size.kit) }, server: block(server, 'tsx'), habit: { code: 'W005', message: unquoted(habit.message), fix: unquoted(habit.help ?? catalog.find(e => e.code === 'W005').fix) }, source: block(source, 'tsx'), compiled: block(compiled, 'ts'), bad: marked(bad, { 1: 'bad' }), good: block(good, 'tsx'), diff: marked(diff, { 1: 'del', 2: 'add', 3: 'del', 4: 'add' }), code: 'W001', message: unquoted(report.message), file: `Total.tsx, line ${report.line}`, fix: unquoted(entry.fix) })
}

/** The arena's table: evals/speed's numbers whichever way they fall, including the rows weft loses. */
function buildSpeed() {
  const run = JSON.parse(readFileSync(join(repo, 'evals/speed/results.json'), 'utf8'))
  if (!run.valid) throw new Error('evals/speed/results.json was measured under too much load')
  const rows = [
    ['Create 1,000 rows', 'rows total', 'create'], ['Replace 1,000 rows', 'rows total', 'replace'], ['Create 10,000 rows', 'rows total', 'runLots'],
    ['Append 1,000 rows', 'rows total', 'append'], ['Update every 10th row', 'rows total', 'update'], ['Select a row', 'rows total', 'select'],
    ['Swap two rows', 'rows total', 'swap'], ['Remove a row', 'rows total', 'remove'], ['Clear all rows', 'rows total', 'clear'],
    ['Update one cell of 10,000', 'update 10000', 'one cell, ms per tick'], ['Update every 10th of 10,000', 'update 10000', 'every 10th, ms per tick'], ['Update all 10,000 cells', 'update 10000', 'every cell, ms per tick'],
  ].map(([label, group, key]) => {
    const [weft, solid, react] = ['weft', 'solid-batch', 'react'].map(s => run.grid[s][group][key])
    // Across the rounds: a row only goes to whoever's 95% interval against the other stays on one side of even.
    const { lo, hi } = run.compared.weft[group][key]
    return { label, weft, solid, react, fastest: hi < 1 ? 'weft' : lo > 1 ? 'Solid' : 'Too close' }
  })
  const arena = JSON.parse(readFileSync(join(repo, 'evals/speed/arena-site.json'), 'utf8'))
  write('speed.json', { arena, machine: run.machine, solid: run.solid, when: run.when.slice(0, 10), rows, wins: rows.filter(r => r.fastest === 'weft').length, losses: rows.filter(r => r.fastest === 'Solid').length })
}

// ------------------------------------------------------------------ agents

function buildLlms(docs, learn) {
  const lines = ['# weft', '', '> TSX compiled to direct DOM bindings, with warp, its UI toolkit, and a compiler that explains errors to agents.', '', 'Every Learn and Reference page has a Markdown twin: add `.md` to its URL. `weft docs <topic>` prints the Reference text.', '']
  for (const [base, nav] of [['learn', learn.nav], ['reference', docs.nav]]) {
    for (const { section, items } of nav) {
      lines.push(`## ${base === 'learn' ? 'Learn' : 'Reference'}: ${section}`, '')
      for (const i of items) lines.push(`- [${i.title}](/${base}/${i.slug}.md)`)
      lines.push('')
    }
  }
  lines.push('## Files', '', '- [All of Learn and Reference in one file](/llms-full.txt)', '- [Every title on the site](/search.json)', '')
  writeFileSync(join(pub, 'llms.txt'), lines.join('\n'))
  writeFileSync(join(pub, 'llms-full.txt'), [...learn.flat, ...docs.flat].map(p => p.md).join('\n\n---\n\n'))
}

reportSampleWidths(repo)
const docs = await buildReference()
const learn = buildLearn(docs)
const toolkit = buildToolkit()
buildArt()
buildShowcase()
buildSpeed()
// The shop's steps, and any demo named `<name>-step-<n>`, mark the lines each one added, so the code shows the app growing.
// `ask` is a frame, so what it shows is the app inside it. `slow` shows the page it loads.
const SHOWN = { 'ask.tsx': 'arena/graph/main.tsx', 'slow.tsx': 'src/routes/examples/slow.tsx' }
const demoText = f => readFileSync(join(site, SHOWN[f] ?? `src/demos/${f}`), 'utf8').trim()
const demoHtml = f => {
  const text = demoText(f)
  const step = /^(shop|.+-step)-(\d+)\.tsx$/.exec(f)
  const before = step && step[2] !== '1' ? new Set(demoText(`${step[1]}-${step[2] - 1}.tsx`).split('\n')) : undefined
  let n = -1
  const lines = text.split('\n')
  const html = highlight(text, 'tsx').replace(/<span data-part="line">/g, tag => (before && lines[++n].trim() && !before.has(lines[n]) ? '<span data-part="line" data-new="">' : tag))
  return `<pre tabindex="0"><code>${html}</code></pre>`
}
// The arena's frames are built by arena/build.mjs and aren't in git. Without them the site says so instead of framing 404s.
const framed = name => existsSync(join(site, 'public/arena', name, 'index.html'))
const arena = { frames: ['weft', 'solid', 'react'].every(framed), graph: framed('graph') }
if (!arena.frames || !arena.graph) console.warn('[content] arena not built: its demos will say so. Run `npm ci` in site/arena, then `node arena/build.mjs`.')
write('arena-built.json', arena)
write('demos.json', Object.fromEntries(readdirSync(join(site, 'src/demos')).filter(f => f.endsWith('.tsx')).map(f => [f.slice(0, -4), demoHtml(f)])))
write('numbers.json', numbers())
write('reference-nav.json', docs.nav)
write('reference.json', docs.pages)
write('learn-nav.json', learn.nav)
write('learn-moved.json', MOVED)
write('learn.json', learn.pages)
const search = buildSearch(docs, learn, [...toolkit, ...buildIcons()])
buildLlms(docs, learn)
console.log(`[content] ${Object.keys(learn.pages).length} Learn and ${Object.keys(docs.pages).length} Reference pages; T0 ${search.counts.t0} rows ${(search.t0.br / 1024).toFixed(1)} KB br; T1 ${search.counts.t1} rows ${(search.t1.br / 1024).toFixed(1)} KB br`)
