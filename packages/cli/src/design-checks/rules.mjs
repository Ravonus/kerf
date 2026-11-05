import { WARP, HEADING_ROLE } from './values.mjs'

export const NATIVE = { button: 'Button', select: 'Select', textarea: 'Textarea' }
// the input types a browser paints, and the warp control for each; `Input` passes `type` through, so it counts too
export const NATIVE_TYPES = {
  date: 'DateField',
  'datetime-local': 'DateTimeField',
  time: 'TimeField',
  month: 'MonthPicker',
  week: 'DateField',
  number: 'NumberField',
  range: 'Slider',
  color: 'ColorField',
  checkbox: 'Checkbox',
  radio: 'Radio',
  file: 'a dropzone',
}
export const INTERACTIVE = new Set([
  'a',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  'Button',
  'Toggle',
  'Input',
  'Search',
  'Textarea',
  'Select',
  'Checkbox',
  'Switch',
  'Chip',
  'Link',
])
export const STATIC = new Set([
  'div',
  'span',
  'p',
  'li',
  'section',
  'article',
  'td',
  'tr',
  'img',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'label',
])

const NAMED = ['aria-label', 'aria-labelledby', 'title']
/** Elements whose implicit role (generic, paragraph, emphasis…) may not be named, and the explicit roles that can't be either. */
export const GENERIC = new Set([
  'div',
  'span',
  'p',
  'b',
  'i',
  'em',
  'strong',
  'small',
  'code',
  's',
  'u',
  'sub',
  'sup',
  'mark',
  'del',
  'ins',
  'kbd',
  'samp',
  'var',
])
export const UNNAMED = new Set([
  'generic',
  'presentation',
  'none',
  'paragraph',
  'caption',
  'code',
  'deletion',
  'emphasis',
  'insertion',
  'strong',
  'subscript',
  'superscript',
  'mark',
  'time',
])
export const named = (el) =>
  NAMED.some((n) => el.attr(n)) || el.attrs.some((a) => a.kind === 'spread')
/** Children with something a screen reader can read: text, an expression, a component, an image with alt. */
export const hasName = (children) => {
  if (/<img\b[^>]*\balt=(["'])[^"']+\1/.test(children)) return true
  const stripped = children
    .replace(/<svg[\s\S]*?<\/svg>/g, '')
    .replace(/<(Icon|[A-Z]\w*Icon)\b[^>]*\/>/g, '')
    .replace(/<[^>]*aria-hidden[^>]*>[\s\S]*?<\/[^>]+>/g, '')
  return /[^\s<>{}]/.test(stripped.replace(/<\/?[a-z][^>]*>/g, ''))
}

/** Parse `#rgb`, `#rrggbb`, `rgb(r, g, b)`, `white` and `black`, or null. */
export function literalColor(v) {
  const s = v.trim().toLowerCase()
  if (s === 'white') return [255, 255, 255]
  if (s === 'black') return [0, 0, 0]
  const h = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s)?.[1]
  if (h)
    return (h.length === 3 ? Array.from(h, (c) => c + c) : h.match(/../g)).map((x) =>
      parseInt(x, 16),
    )
  const m = /^rgb\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*\)$/.exec(s)
  return m ? m.slice(1).map(Number) : null
}
const lum = (c) => {
  const [r, g, b] = c.map((x) => {
    const s = x / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/** Lines an allow comment covers: `// weft-allow D001: reason` (or `{/* … *\/}`) on the line above or at the line's end. */
export function allowed(text) {
  const out = new Map()
  text.split('\n').forEach((line, i) => {
    const m = /weft-allow\s+((?:D\d{3}[\s,]*)+):\s*\S/.exec(line)
    if (!m) return
    for (const code of m[1].match(/D\d{3}/g))
      for (const n of [i + 1, i + 2]) out.set(`${code}:${n}`, true)
  })
  return out
}

/** The edit that imports `names` from warp: into the file's existing import, or a new first line. */
export function addImport(text, names) {
  const m = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*['"]${WARP}['"]`).exec(text)
  if (!m) return [{ start: 0, end: 0, text: `import { ${names.join(', ')} } from '${WARP}'\n` }]
  const have = m[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const missing = names.filter((n) => !have.includes(n))
  if (!missing.length) return []
  const at = m.index + m[0].indexOf(m[1]) + m[1].trimEnd().length
  return [{ start: at, end: at, text: `, ${missing.join(', ')}` }]
}

/** Does the app have warp's tokens? */
/** Where a host keeps response headers, outside the source. */
export const HOST_HEADERS = ['public/_headers', '_headers', 'netlify.toml', 'vercel.json']
const CSP_DIRECTIVE = /\b((?:default|style|script)-src(?:-attr|-elem)?)\b([^;\n"`]*)/gi

/** Every source list a file gives each directive, wherever in it the policy is written. */
export function cspDirectives(text) {
  const out = new Map()
  for (const m of text.matchAll(CSP_DIRECTIVE)) {
    const name = m[1].toLowerCase()
    out.set(name, [...(out.get(name) ?? []), m[2]])
  }
  return out
}

/** The first directive named governs, as in a browser's fallback; a nonce or a hash beside `unsafe-inline` cancels it. */
export function inlineAllowed(policy, ...names) {
  const lists = policy.get(names.find((n) => policy.has(n)))
  return !lists || lists.every((l) => /'unsafe-inline'/i.test(l) && !/'(?:nonce|sha\d+)-/i.test(l))
}

/** Can any script of the page's own run? The client entry can switch on what an inline script was refused. */
export function scriptsRun(policy) {
  const lists = policy.get(
    ['script-src-elem', 'script-src', 'default-src'].find((n) => policy.has(n)),
  )
  // Past `strict-dynamic` a browser ignores hosts, 'self' and 'unsafe-inline', and weft's scripts carry no nonce.
  return (
    !lists ||
    lists.every(
      (l) =>
        !/'strict-dynamic'/i.test(l) &&
        (/'self'/i.test(l) ||
          l.replace(/'[^']*'/g, '').trim() !== '' ||
          (/'unsafe-inline'/i.test(l) && !/'(?:nonce|sha\d+)-/i.test(l))),
    )
  )
}

/** What one heading renders at: `{ level, role, set }`, or null when a `level` or `role` expression hides it. `role` is null for a bare `<hN>`. */
export function headingSite(el, bare) {
  if (bare) return { level: Number(el.name[1]), role: null }
  const lv = el.attr('level')
  const level = !lv ? 2 : Number(lv.value ?? /^\d$/.exec(lv.expr ?? '')?.[0])
  if (!HEADING_ROLE[level]) return null
  const attr = el.attr('role')
  if (attr && attr.kind !== 'string') return null
  return { level, role: attr?.value ?? HEADING_ROLE[level], set: attr }
}

/** D006: the roles one level renders at across the app. The most used `Heading` role wins, then the level's default; every other site is fixed to it. */
export function roleDrift(level, sites) {
  const counts = new Map()
  for (const s of sites) if (s.role) counts.set(s.role, (counts.get(s.role) ?? 0) + 1)
  if (!counts.size || new Set(sites.map((s) => s.role)).size < 2) return
  const fallback = HEADING_ROLE[level]
  const top = Math.max(...counts.values())
  const role = counts.get(fallback) === top ? fallback : [...counts].find(([, n]) => n === top)[0]
  const prop = role === fallback ? '' : ` role="${role}"`
  const all = [...counts.keys()].join(', ')
  for (const { el, text, report, role: has, set } of sites) {
    if (has === role) continue
    if (has === null) {
      const swap =
        !el.attr('class') &&
        !el.attr('className') &&
        !el.attr('style') &&
        text.slice(el.start, el.end).includes(`</${el.name}`)
      report(
        'D006',
        el.start,
        el.tagEnd,
        `A bare <h${level}> beside <Heading level={${level}}>: this one renders at the browser's size, the rest at \`${role}\`.`,
        swap
          ? {
              description: `Use <Heading level={${level}}>`,
              safe: false,
              edits: [
                { start: el.start + 1, end: el.tagEnd, text: `Heading level={${level}}${prop}` },
                { start: text.lastIndexOf('</', el.end - 1) + 2, end: el.end - 1, text: 'Heading' },
                ...addImport(text, ['Heading']),
              ].sort((a, b) => b.start - a.start),
            }
          : undefined,
      )
      continue
    }
    const fix = set
      ? {
          description:
            role === fallback ? `Drop \`role\`: h${level} is \`${role}\`` : `Use role="${role}"`,
          safe: false,
          edits: [
            role === fallback
              ? { start: text.slice(0, set.start).trimEnd().length, end: set.end, text: '' }
              : { start: set.valueStart, end: set.valueEnd, text: `"${role}"` },
          ],
        }
      : { description: `Use role="${role}"`, safe: false, text: prop, at: [el.tagEnd, el.tagEnd] }
    report(
      'D006',
      el.start,
      el.tagEnd,
      `h${level} renders at two roles in this app (${all}): a level is one size everywhere. This one is \`${has}\`, the rest \`${role}\`. \`// weft-allow D006: <reason>\` keeps a real exception.`,
      fix,
    )
  }
}

/** The nearest element that contains `el`. */
export function scanParent(el, elements) {
  let best
  for (const e of elements)
    if (e !== el && e.start <= el.start && e.end >= el.end && (!best || e.start >= best.start))
      best = e
  return best
}
