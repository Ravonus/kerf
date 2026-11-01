// Everything the site says that comes from elsewhere in the repo is generated here, so it can't drift. Docs are `weft docs`'
// own pages plus a few files; numbers are evals/. Output is gitignored: src/generated for the routes, public for files
// served as they are (`.md` twins, llms.txt, search indexes).
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliCompressSync, deflateSync } from 'node:zlib'
import { docs as weftDocs } from '../../packages/cli/src/docs.mjs'
import { catalog } from '../../packages/cli/src/catalog.mjs'
import { exportsOf, loadCompiler, resolveWeft } from '../../packages/cli/src/weft.mjs'
import { cleanText, decode, descriptionProblem, truncate } from '../../packages/start/src/derive.mjs'
import { readFixtures, readToolkit } from './toolkit.mjs'

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
const { level, PALETTE } = await import('../src/lib/field.ts')

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
  start: '`@weft/start` is the full-stack part of weft: routes from files, server functions, a database, auth and realtime. A new app from `create-weft` already has it.',
  browser: "`weft/browser` gives you the browser's changing values, such as being online or a tab being visible, as values you read in JSX. It handles the listeners and the cleanup.",
  testing: '`weft/test` renders components under vitest and drives them as a user would. `weft check` also flags tests that would pass whatever the code did.',
}

/** The nav. A page's source is `weft docs <topic>` wherever one exists, so the site and the CLI read one file. */
const SECTIONS = [
  ['Start', [
    ['getting-started', 'Getting started', file('site/content/getting-started.md')],
    ['rules', 'The rules', topic('rules')],
    ['props', 'Props', topic('props')],
    ['lists', 'Lists', topic('lists')],
    ['async', 'Async', topic('async')],
  ]],
  ['Learn', [
    ['start', 'Full stack', topic('start')],
    ['meta', 'Metadata and cards', topic('meta')],
    ['style', 'Style groups', topic('style')],
    ['design', 'Design language', topic('design')],
    ['icons', 'Icons', topic('icons')],
    ['fonts', 'Fonts', topic('fonts')],
    ['browser', 'Browser APIs', topic('browser')],
    ['ui-state', 'Shared UI state', topic('ui-state')],
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
/** Plain text from a block of markdown. */
const unmark = b => cleanText(decode(b.replace(/<[^>]+>/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*_]/g, '')))

/** The sentences a page's `meta` can open with: from the start, up to the first that a reader wouldn't want. */
function opening(text, skip) {
  const out = []
  for (const s of text.match(/\S.*?[.!?](?=\s+[A-Z"“`]|\s*$)/g) ?? []) {
    if (skip?.test(s) || descriptionProblem(s) || s.length < 25) break
    out.push(s)
  }
  const said = truncate(out.join(' '))
  return descriptionProblem(said) ? '' : said
}

/** A component's `meta`: how its doc comment opens, up to where it starts on how the thing was built. */
function blurb(name, doc) {
  return opening(unmark(doc).replace(/\bAPG /g, ''), /\b(?:specimen|the spec\b|markup exactly|tokens?\b)/i) || `${name}, a warp component with live previews, its props and how to use it.`
}

/** A docs page's `meta`: the opening of its first paragraph of prose that has one. */
function summary(md) {
  const blocks = md.replace(/```[\s\S]*?```/g, '\n\n').split(/\n\s*\n/).map(b => b.trim())
  for (const b of blocks.filter(b => b && !/^(?:#|[-*+] |\d+[.)] |\||>|<|:::)/.test(b))) {
    const text = opening(unmark(b))
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

/** The first thing on a page stays out. Long pages fold their other sections; `weft docs` prints the same source in full. */
function fold(html, slug) {
  if (slug === 'getting-started') return html // steps: all of them are the page
  const [lead, ...rest] = html.split(/(?=<h2[ >])/)
  if (rest.length < 2 || html.replace(/<[^>]+>/g, ' ').split(/\s+/).length < 220) return html
  return lead + rest.map(part => {
    const end = part.indexOf('</h2>') + 5
    return `<details data-part="fold"><summary>${part.slice(0, end)}</summary>${part.slice(end)}</details>`
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
    return { slug, title, section, lead: LEADS[slug] && markdownToHtml(LEADS[slug]).replace(/^\s*<p[^>]*>|<\/p>\s*$/g, ''), html: fold(html, slug), toc, description: SUMMARIES[slug] || summary(LEADS[slug] ?? md.replace(/^# [^\n]*\n/, '')) || `${title}: ${section} in the weft docs.` }
  }
  flat.forEach((p, i) => {
    pages[p.slug] = { ...render(p.slug, p.title, p.section, p.md), prev: flat[i - 1] && { slug: flat[i - 1].slug, title: flat[i - 1].title }, next: flat[i + 1] && { slug: flat[i + 1].slug, title: flat[i + 1].title } }
  })
  for (const e of catalog) {
    const { text } = await weftDocs(site, e.code)
    pages[`codes/${e.code}`] = { ...render(`codes/${e.code}`, e.code, 'Reference', text), description: opening(unmark(`${e.catches}.`)) || `${e.code}: what this weft diagnostic means and how to fix it.`, parent: { slug: 'diagnostics', title: 'Diagnostics' } }
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

/** Every name `weft` exports, pointing at the section that first uses it, so "state" finds `state` before prose about it. */
function symbols(docs) {
  const dir = join(repo, 'packages/weft')
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const rows = []
  for (const [from, names] of Object.entries(exportsOf({ dir, pkg }))) {
    for (const name of names) {
      const uses = new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`)
      for (const p of docs.flat) {
        const s = sections(p.md.replace(/^# [^\n]*\n/, '')).find(s => uses.test(s.lines.join('\n')))
        if (!s) continue
        rows.push({ title: name, url: `/docs/${p.slug}${s.heading ? `#${slugify(s.heading)}` : ''}`, group: 'API', rank: 0.95, parent: s.heading ? `${p.title} / ${s.heading}` : p.title, text: from })
        break
      }
    }
  }
  return rows
}

function buildSearch(docs, extra = []) {
  const t0 = []
  const t1 = []
  for (const p of docs.flat) {
    const group = GROUP[p.section]
    t0.push({ title: p.title, url: `/docs/${p.slug}`, group, rank: 1, keywords: p.slug })
    const rendered = docs.pages[p.slug]
    for (const h of rendered.toc) t0.push({ title: h.text, url: `/docs/${p.slug}#${h.id}`, group, rank: 0.6, parent: p.title })
    for (const s of sections(p.md.replace(/^# [^\n]*\n/, ''))) {
      const body = plain(s.lines.join('\n'))
      if (body.length < 12) continue
      const id = s.heading ? slugify(s.heading) : ''
      t1.push({ title: s.heading || p.title, url: `/docs/${p.slug}${id ? `#${id}` : ''}`, group, rank: 0.5, parent: s.heading ? p.title : undefined, text: body.slice(0, 120), keywords: body })
    }
  }
  for (const e of catalog) t0.push({ title: e.code, url: `/docs/codes/${e.code}`, group: 'Diagnostics', rank: 0.9, text: e.catches.slice(0, 90), keywords: e.fix })
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

/** Spec references belong to the design docs, not a reader of the component. */
const cleanDoc = text => text.replace(/\s*\((?:[^()]*§[^()]*|components\.html[^()]*)\)/g, '').replace(/\s+\[?\d{2} §[\d.]+\]?/g, '').trim()

function buildToolkit() {
  const components = readToolkit(repo)
  const fixtures = [
    ...readFixtures(join(repo, 'packages/warp/test/fixtures')).map(f => ({ ...f, file: `warp:${f.file}` })),
    ...readFixtures(join(site, 'src/previews')).map(f => ({ ...f, file: 'site' })),
  ]
  const usedBy = name => fixtures.filter(f => f.tags.includes(name) && f.name !== 'Part').sort((a, b) => (a.file === 'site' ? 0 : 1) - (b.file === 'site' ? 0 : 1) || a.tags.length - b.tags.length || a.source.length - b.source.length)
  const pages = {}
  const orphans = []
  for (const c of components) {
    const found = usedBy(c.name)
    if (!found.length) orphans.push(c.name)
    const cases = found.slice(0, 4).map((f, i) => {
      const names = f.tags.filter(t => components.some(x => x.name === t))
      const code = `import { ${names.join(', ')} } from '@weft/warp'\n\n${f.source}`
      return { file: f.file, name: f.name, label: i ? `Variant ${i}` : 'Preview', html: codeBlock(code, 'tsx') }
    })
    pages[c.slug] = { ...c, lede: cleanDoc(c.doc), description: blurb(c.name, cleanDoc(c.doc)), cases, use: codeBlock(`import { ${c.name} } from '@weft/warp'`, 'tsx') }
  }
  const order = ['Layout', 'Type', 'Actions', 'Inputs', 'Dates and time', 'Overlays', 'Feedback', 'Surfaces', 'Data', 'Charts', 'Agent', 'Schedule', 'Live', 'Collaboration', 'Flow', 'Admin', 'More']
  const nav = order.map(group => ({ group, items: components.filter(c => c.group === group).map(({ name, slug }) => ({ name, slug })) })).filter(g => g.items.length)
  const files = [...new Set(fixtures.map(f => f.file))]
  const lines = files.map(f => `  ${JSON.stringify(f)}: () => import(${JSON.stringify(f === 'site' ? '../previews/index' : `../../../packages/warp/test/fixtures/${f.slice(5, -4)}`)}),`)
  writeFileSync(join(out, 'previews.ts'), `// Generated by scripts/content.mjs.\nexport const previews: Record<string, () => Promise<unknown>> = {\n${lines.join('\n')}\n}\n`)
  write('toolkit.json', pages)
  write('toolkit-nav.json', nav)
  if (orphans.length) console.log(`[content] no preview for: ${orphans.join(' ')}`)
  return components.map(c => ({ title: c.name, url: `/toolkit/${c.slug}`, group: 'Components', rank: 0.9, parent: c.group }))
}

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
  const { transform } = loadCompiler(resolveWeft(site))
  const source = `import { state } from 'weft'

export function Counter() {
  const n = state(0)
  return <button onClick={() => n.value++}>{n.value}</button>
}`
  const compiled = transform(source, { filename: 'Counter.tsx' }).code.trim()
  const bad = `function Total(props: { count: number }) {
  const total = props.count * 5
  return <b>{total}</b>
}`
  const report = transform(bad, { filename: 'Total.tsx' }).diagnostics.find(d => d.code === 'W001')
  if (!report) throw new Error('the showcase expects W001')
  const entry = catalog.find(e => e.code === 'W001')
  const good = `function Total(props: { count: number }) {
  const total = derived(() => props.count * 5)
  return <b>{total.value}</b>
}`
  const block = (text, lang) => `<pre tabindex="0"><code>${highlight(text, lang)}</code></pre>`
  const plain = s => s.replaceAll('`', '') // the compiler's words, without the terminal's quoting
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
  const habit = transform(`import { state } from 'weft'\nfunction Price(props: { value: number }) {\n  const n = state(props.value)\n  return <b>{n.value}</b>\n}`, { filename: 'Price.tsx' }).diagnostics.find(d => d.code === 'W005')
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
  write('showcase.json', { receipt: { weft: kb(size.weft.js), kit: kb(size.kit), total: kb(size.weft.js + size.kit) }, server: block(server, 'tsx'), habit: { code: 'W005', message: plain(habit.message), fix: plain(habit.help ?? catalog.find(e => e.code === 'W005').fix) }, source: block(source, 'tsx'), compiled: block(compiled, 'ts'), bad: marked(bad, { 1: 'bad' }), good: block(good, 'tsx'), diff: marked(diff, { 1: 'del', 2: 'add', 3: 'del', 4: 'add' }), code: 'W001', message: plain(report.message), file: `Total.tsx, line ${report.line}`, fix: plain(entry.fix) })
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
const toolkit = buildToolkit()
buildArt()
buildShowcase()
buildSpeed()
// The shop's steps mark the lines each one added, so the code on the page shows the app growing.
// `ask` is a frame, so what it shows is the app inside it. `slow` shows the page it loads.
const SHOWN = { 'ask.tsx': 'arena/graph/main.tsx', 'slow.tsx': 'src/routes/examples/slow.tsx' }
const demoText = f => readFileSync(join(site, SHOWN[f] ?? `src/demos/${f}`), 'utf8').trim()
const demoHtml = f => {
  const text = demoText(f)
  const step = /^shop-(\d)\.tsx$/.exec(f)
  const before = step && step[1] !== '1' ? new Set(demoText(`shop-${step[1] - 1}.tsx`).split('\n')) : undefined
  let n = -1
  const lines = text.split('\n')
  const html = highlight(text, 'tsx').replace(/<span data-part="line">/g, tag => (before && lines[++n].trim() && !before.has(lines[n]) ? '<span data-part="line" data-new="">' : tag))
  return `<pre tabindex="0"><code>${html}</code></pre>`
}
write('demos.json', Object.fromEntries(readdirSync(join(site, 'src/demos')).filter(f => f.endsWith('.tsx')).map(f => [f.slice(0, -4), demoHtml(f)])))
write('numbers.json', numbers())
write('docs-nav.json', docs.nav)
write('docs.json', docs.pages)
const search = buildSearch(docs, [...toolkit, ...buildIcons()])
buildLlms(docs)
console.log(`[content] ${Object.keys(docs.pages).length} pages; T0 ${search.counts.t0} rows ${(search.t0.br / 1024).toFixed(1)} KB br; T1 ${search.counts.t1} rows ${(search.t1.br / 1024).toFixed(1)} KB br`)
