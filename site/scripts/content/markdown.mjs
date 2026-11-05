import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { docs as weftDocs } from '../../../packages/cli/src/docs.mjs'
import { catalog } from '../../../packages/cli/src/catalog.mjs'
import {
  cleanText,
  decode,
  descriptionProblem,
  truncate,
} from '../../../packages/start/src/derive.mjs'
import { highlight, markdownToHtml, site, pub } from './context.mjs'
import { slugify, SUMMARIES, LEADS, SECTIONS } from './docs-catalog.mjs'

const plain = (md) =>
  md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[`*_#>|]/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
/** Plain text from a block of markdown. */
const unmark = (b) =>
  cleanText(
    decode(
      b
        .replace(/<[^>]+>/g, ' ')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/[`*_]/g, ''),
    ),
  )

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
  const blocks = md
    .replace(/```[\s\S]*?```/g, '\n\n')
    .split(/\n\s*\n/)
    .map((b) => b.trim())
  for (const para of blocks.filter((b) => b && !/^(?:#|[-*+] |\d+[.)] |\||>|<|:::)/.test(b))) {
    const text = opening(unmark(para))
    if (text.length >= 40) return text
  }
  return ''
}
const CODE = /\b[WDTPHQSFIACRXM]\d{3}\b/g
const known = new Set(catalog.map((e) => e.code))
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
  return html
    .split(/(<pre[\s\S]*?<\/pre>|<a [\s\S]*?<\/a>|<[^>]+>)/)
    .map((part, i) => {
      if (i % 2) {
        return part
      }
      return part
        .replace(CODE, (c) => (known.has(c) ? `<a href="/reference/codes/${c}">${c}</a>` : c))
        .replace(/weft docs ([a-z-]+)/g, (m, t) =>
          slugs.has(t) ? `<a href="/reference/${t}">${m}</a>` : m,
        )
    })
    .join('')
}

/** Headings numbered by hand become steps: the number leaves the words for the page's gutter. */
const steps = (html) => html.replace(/<h2([^>]*)>(\d+)\. /g, '<h2$1 data-step="$2">')

/** One page's Markdown to HTML, with heading ids unique across every call, and the contents list they make. */
function renderer(slugs) {
  const toc = []
  const seen = new Map()
  const html = (md) =>
    steps(
      linkify(
        markdownToHtml(md, {
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
        }),
        slugs,
      ).replace(/href="(?:\.\.\/)+((?:docs|packages|evals)\/[^"]+)"/g, `href="${REPO}$1"`),
    )
  return { html, toc }
}

/** Reference: `weft docs` topics, the diagnostics index and one page per code. */
async function buildReference() {
  const nav = []
  const pages = {}
  const flat = SECTIONS.flatMap(([section, items]) =>
    items.map(([slug, title, source]) => ({ section, slug, title, source })),
  )
  const slugs = new Set(flat.map((p) => p.slug))
  for (const p of flat) p.md = await p.source()
  const render = (slug, title, section, md) => {
    const r = renderer(slugs)
    const html = r.html(md.replace(/^# [^\n]*\n/, ''))
    writeFileSync(join(pub, 'reference', `${slug}.md`), md)
    return {
      slug,
      title,
      section,
      lead: LEADS[slug] && markdownToHtml(LEADS[slug]).replace(/^\s*<p[^>]*>|<\/p>\s*$/g, ''),
      html,
      toc: r.toc,
      description:
        SUMMARIES[slug] ||
        summary(LEADS[slug] ?? md.replace(/^# [^\n]*\n/, '')) ||
        `${title}: ${section} in the weft reference.`,
    }
  }
  flat.forEach((p, i) => {
    pages[p.slug] = {
      ...render(p.slug, p.title, p.section, p.md),
      prev: flat[i - 1] && { slug: flat[i - 1].slug, title: flat[i - 1].title },
      next: flat[i + 1] && { slug: flat[i + 1].slug, title: flat[i + 1].title },
    }
  })
  for (const e of catalog) {
    const { text } = await weftDocs(site, e.code)
    pages[`codes/${e.code}`] = {
      ...render(`codes/${e.code}`, e.code, 'Diagnostics', text),
      description:
        opening(unmark(`${e.catches}.`)) ||
        `${e.code}: what this weft diagnostic means and how to fix it.`,
      parent: { slug: 'diagnostics', title: 'Diagnostics' },
    }
  }
  for (const [section, items] of SECTIONS)
    nav.push({ section, items: items.map(([slug, title]) => ({ slug, title })) })
  return { nav, pages, flat, slugs }
}

export { plain, summary, codeBlock, linkify, renderer, buildReference }
