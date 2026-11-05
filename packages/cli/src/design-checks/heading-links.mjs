import { WARP } from './values.mjs'
import { positions } from '../diag.mjs'
import { allowed, addImport, headingSite } from './rules.mjs'

export function checkHeadingLinks({ el, f, report, warpName, looks, localComponents, scan }) {
  const bare = /^h[1-6]$/.test(el.name)
  if (bare || (el.name === 'Heading' && warpName('Heading'))) {
    const site = headingSite(el, bare)
    if (site && !allowed(f.text).has(`D006:${positions(f.text).lineCol(el.start)[0]}`))
      looks.set(site.level, [
        ...(looks.get(site.level) ?? []),
        { ...site, el, text: f.text, report },
      ])
  }
  if (
    el.attr('data-weft')?.value === 'styled' &&
    (/^(?:main|h1|article)$/.test(el.name) ||
      el.attr('role')?.value === 'main' ||
      el.attr('data-vt')?.value === 'main')
  ) {
    report(
      'D040',
      el.start,
      el.tagEnd,
      `The style gate on <${el.name}>: this is the page's main content, and the first paint would leave it hidden until the stylesheet lands.`,
      'Mark a secondary part, or remove `data-weft="styled"`',
    )
  }
  if (
    el.name === 'a' &&
    el.attr('href') &&
    !el.attr('class') &&
    !el.attr('className') &&
    !el.attr('style') &&
    !el.attr('data-scope') &&
    !el.attr('data-part') &&
    !el.attrs.some((a) => a.kind === 'spread')
  ) {
    const taken =
      localComponents.has('Link') ||
      scan.imports.some((i) => i.local === 'Link' && i.source !== WARP)
    const close = f.text.lastIndexOf('</', el.end - 1)
    report(
      'D007',
      el.start,
      el.tagEnd,
      "A bare <a> in a warp app: it gets warp's link colour but no underline sweep or touch target, and nav links read as prose. Use <Link>, or `Shell`'s `nav` for navigation.",
      !taken && f.text.slice(el.start, el.end).includes('</a')
        ? {
            description: 'Use <Link>',
            safe: false,
            edits: [
              { start: el.start + 1, end: el.tagEnd, text: 'Link' },
              { start: close + 2, end: el.end - 1, text: 'Link' },
              ...addImport(f.text, ['Link']),
            ].sort((a, b) => b.start - a.start),
          }
        : undefined,
    )
  }
}
