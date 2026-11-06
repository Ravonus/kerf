import { diagnostic } from '../diag.mjs'

/** What a rule means in a warp app, where warp is how it usually happens. */
const WARP = {
  'heading-order':
    "warp's titled parts (Accordion, Chart, ActivityFeed) are h3, for a page section under an h2: one placed elsewhere takes `level`, or the place gets the heading it lacks. ",
}

const say = {
  L001: (f) =>
    `${f.tag} (\`${f.selector}\`) has no accessible name (${f.rule}): a screen reader announces only its role. When the source has text, CSS hid it at this width.`,
  L002: (f) =>
    `${f.tag} (\`${f.selector}\`) is an image with no text alternative (${f.rule}): a screen reader reads its file name.`,
  L003: (f) =>
    `${f.tag} (\`${f.selector}\`): ${f.contrast ? `${f.contrast.fgColor} on ${f.contrast.bgColor} is ${f.contrast.contrastRatio}:1 at ${f.contrast.fontSize}, under ${f.contrast.expectedContrastRatio}` : 'its text contrast is too low'}.`,
  L004: (f) => `${f.tag} (\`${f.selector}\`): ${f.help} (axe \`${f.rule}\`).`,
  L031: (f) =>
    `The layout moved by ${f.cls} (CLS) while the page loaded, with no one touching it${f.moved.length ? `: ${f.moved.join(', ')} moved` : ''}. Over 0.1 costs Lighthouse's Performance score.`,
  L010: (f) => `Console error${f.at ? ` at ${f.at}` : ''}: ${f.text}`,
  L011: (f) =>
    f.at === '/favicon.ico'
      ? 'The page names no icon, so the browser asked for /favicon.ico and got a 404: Lighthouse counts it as a console error. Add `<link rel="icon">` through `site.head`, or a `public/favicon.ico`.'
      : `The browser logged an error${f.at ? ` for ${f.at}` : ''}: ${f.text}`,
  L012: (f) =>
    `A deprecated browser API is in use${f.at ? ` at ${f.at}` : ''}: ${f.text}. Lighthouse marks Best Practices down for it.`,
  L013: (f) =>
    `Chrome logged a ${f.text} issue for the page. Lighthouse marks Best Practices down for it.`,
  L020: () => 'The page has no `<title>`: search results and tabs show its URL.',
  L021: () => 'The page has no meta description: search results make one up from the page.',
  L022: () =>
    '`<html>` has no `lang`: screen readers guess the language, and translation offers go wrong.',
  L023: () =>
    'No `<meta name="viewport" content="width=device-width, initial-scale=1">`: a phone renders the page at 980px and shrinks it.',
  L024: (f) =>
    `Search engines are told not to index this page, by ${f.text}.${f.header ? ' The audited endpoint serves this header: check its host or proxy rules as well as the page head.' : ''}`,
  L025: (f) => `The page answered ${f.text}.`,
  L030: (f) =>
    `The page scrolls sideways on a phone: it is ${f.text} wider than the screen.${f.wide?.length ? ` Past the edge: ${f.wide.join(', ')}` : ''}`,
}
/** A page may ask not to be indexed, and a host's preview URL does on its behalf: L024 says so without failing. */
const SEVERITY = { L021: 'warning', L024: 'warning', L030: 'warning', L031: 'warning' }

export function reportFindings(findings, routes, forms, indexing = 'auto') {
  const diagnostics = [...findings.values()]
    .map((f) => {
      const pages = routes.filter((r) => f.routes.has(r))
      const on = `${forms.filter((x) => f.forms.has(x)).join(' and ')}, ${pages.length === 1 ? pages[0] : `${pages.length} pages (${pages.slice(0, 3).join(', ')}${pages.length > 3 ? ', …' : ''})`}`
      const severity =
        (f.code === 'L031' && f.cls > 0.1) || (f.code === 'L024' && indexing === 'public')
          ? 'error'
          : (SEVERITY[f.code] ?? 'error')
      // an axe rule outside L001–L003 carries its own fix: the rule's first remedy, and its page
      const help =
        f.code === 'L004'
          ? `${f.fix ? `${f.fix}. ` : ''}${WARP[f.rule] ?? ''}The rule: https://dequeuniversity.com/rules/axe/4.14/${f.rule}`
          : undefined
      return diagnostic({
        code: f.code,
        severity,
        file: pages[0],
        why: `${say[f.code](f)} (${on})`,
        help,
      })
    })
    .sort((a, b) =>
      a.severity === b.severity ? a.code.localeCompare(b.code) : a.severity === 'error' ? -1 : 1,
    )
  return diagnostics
}
