// The design D-codes in `weft check` (PLAN §6, research 37). Two families:
//
//   D001–D007  off-system values, hand-rolled layout and role drift. Only where the app has warp's tokens to use instead (`@weft-js/warp`
//              in package.json), so an app that chose raw Tailwind or its own CSS is left alone.
//   D011, D030–D039  contrast and accessibility, in every app.
//
// An autofix is offered only when it keeps the meaning: a length that is exactly a scale step, a tag swap, a Tailwind
// class with an exact equivalent. A raw colour never gets one, because a token follows the theme and the raw value
// didn't; the agent chooses from `expected`. `check: { design: false }` turns both families off, and
// `// weft-allow D001: <reason>` on the line above keeps one site. Reads the JSX of the checked files and the app's .css.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { diagnostic, positions } from './diag.mjs'
import { discover } from './files.mjs'
import { scanJsx } from './jsx-scan.mjs'

/** warp's spacing scale at the default density, px → token (warp.css). */
const SPACE = new Map([[2, 'hair'], [4, 'tight'], [8, 'related'], [16, 'group']])
const SPACE_NAMES = 'hair tight related group section page'.split(' ')
/** warp's radii at the quiet stop, where a raw radius is most likely to have been copied from. */
const RADIUS = new Map([[4, 'mark'], [8, 'control'], [12, 'surface']])
const WARP = '@weft-js/warp'
/** The role each heading level takes by default: the same table as warp's `Heading` (packages/warp/src/Type.tsx). */
const HEADING_ROLE = { 1: 'title', 2: 'heading', 3: 'heading', 4: 'label', 5: 'label', 6: 'label' }

const COLOR_EXPECTED = 'var(--warp-color-text), -text-subtle, -surface, -surface-raised, -accent-solid, -border, or a `tone` on the component'
const COLOR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(|(?<![-\w])(?:white|black|red|green|blue|gray|grey|orange|yellow|purple|pink|indigo|teal)(?![-\w])/i
const COLOR_PROPS = /^(color|background|background-color|border-color|border(-(top|right|bottom|left|block|inline)(-(start|end))?)?|outline-color|fill|stroke|box-shadow|caret-color|accent-color)$/
const SPACE_PROPS = /^(gap|row-gap|column-gap|padding|margin)(-(top|right|bottom|left|block|inline)(-(start|end))?)?$/
const TYPE_PROPS = /^(font-size|font-weight|line-height|letter-spacing)$/

const kebab = s => s.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)

/** `16px 8px` → the same with tokens, or null if any part isn't exactly on the scale. */
function scaled(value) {
  const parts = value.trim().split(/\s+/)
  const out = parts.map(p => {
    if (p === '0' || p === '0px' || p === 'auto') return p
    const m = /^(\d+(?:\.\d+)?)(px|rem)?$/.exec(p)
    if (!m) return null
    const px = m[2] === 'rem' ? Number(m[1]) * 16 : Number(m[1])
    return SPACE.has(px) ? `var(--warp-space-${SPACE.get(px)})` : null
  })
  return out.every(Boolean) ? out.join(' ') : null
}

/** Declarations in a `style` attribute: `{ prop, value, numeric, start, end }` with offsets into the file. */
function styleDecls(attr) {
  if (attr.kind === 'string') {
    const at = attr.valueStart + 1
    return [...attr.value.matchAll(/([\w-]+)\s*:\s*([^;]+)/g)].map(m => {
      const start = at + m.index + m[0].indexOf(m[2], m[1].length + 1)
      return { prop: m[1].toLowerCase(), value: m[2].trim(), start, end: start + m[2].trimEnd().length }
    })
  }
  const out = []
  for (const m of (attr.expr ?? '').matchAll(/([\w$]+|['"][\w-]+['"])\s*:\s*(?:(['"`])([^'"`$]*)\2|(\d+(?:\.\d+)?)(?=\s*[,}\s]))/g)) {
    const value = m[3] ?? m[4]
    const inner = m[0].lastIndexOf(value)
    const start = attr.valueStart + m.index + inner - (m[3] !== undefined ? 1 : 0)
    out.push({ prop: kebab(m[1].replace(/['"]/g, '')), value, numeric: m[3] === undefined, start, end: start + value.length + (m[3] !== undefined ? 2 : 0), quote: m[2] })
  }
  return out
}

/** The D-code for one raw declaration, or null. `report` takes (code, start, end, why, fix). */
function declaration({ prop, value, numeric, start, end, quote }, report) {
  const css = (numeric && SPACE_PROPS.test(prop) ? `${value}px` : value).replace(/\s*!important\s*$/i, '')
  if (/var\(|^(inherit|initial|unset|transparent|currentcolor|none)$/i.test(css.trim())) return
  if (COLOR_PROPS.test(prop) && COLOR.test(css)) return report('D001', start, end, `Raw colour \`${prop}: ${css}\`: it won't follow the theme, the dials or dark mode. Use ${COLOR_EXPECTED}.`)
  if (SPACE_PROPS.test(prop)) {
    if (/^(0(px)?|auto)$/.test(css.trim())) return
    const token = scaled(css)
    const text = token && (quote ? `${quote}${token}${quote}` : numeric ? `'${token}'` : token)
    return report('D002', start, end, `\`${prop}: ${css}\` is ${token ? 'a scale step written by hand' : 'off the spacing scale'}: gaps are relationships (${SPACE_NAMES.join(', ')}).`, token ? { description: `Use ${token}`, safe: true, text } : undefined)
  }
  if (TYPE_PROPS.test(prop)) return report('D003', start, end, `Raw \`${prop}: ${css}\`: type comes from roles, not sizes. Use \`<Heading role>\` or \`<Text role>\` (display title heading body label caption eyebrow code).`)
  if (prop === 'border-radius') {
    const m = /^(\d+)(?:px)?$/.exec(css.trim())
    const name = m && RADIUS.get(Number(m[1]))
    const text = name && `var(--warp-radius-${name})`
    return report('D003', start, end, `Raw \`border-radius: ${css}\`: radii come from the expression dial (mark, control, surface, round).`, name ? { description: `Use ${text}`, safe: true, text: quote ? `${quote}${text}${quote}` : numeric ? `'${text}'` : text } : undefined)
  }
  if (prop === 'box-shadow' && !/^none$/i.test(css.trim())) return report('D003', start, end, 'A raw shadow: elevation comes from `--warp-elevation-0…3`, which follow the dials and the theme.')
}

// -- Tailwind classes, for an app that has warp's tokens too --

const TW_SPACE = new Map([['0.5', 'hair'], ['1', 'tight'], ['2', 'related'], ['4', 'group']])
const TW_PALETTE = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const TW_PX = 4

/** D001–D003 for one class; returns `[code, why, replacement?]` or null. */
function utility(cls) {
  const bare = cls.slice(cls.lastIndexOf(':') + 1).replace(/^-/, '').replace(/!$/, '')
  const variant = cls.slice(0, cls.length - cls.slice(cls.lastIndexOf(':') + 1).length)
  const space = /^(p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|gap|gap-x|gap-y|space-x|space-y)-(.+)$/.exec(bare)
  if (space) {
    const [, util, v] = space
    if (['auto', 'px', '0'].includes(v) || SPACE_NAMES.includes(v)) return null
    const arb = /^\[(.+)\]$/.exec(v)?.[1]
    const px = arb ? (/^(\d+(?:\.\d+)?)(px|rem)$/.exec(arb) ?? [])[1] * (arb.endsWith('rem') ? 16 : 1) : Number(v) * TW_PX
    const name = arb ? SPACE.get(px) : TW_SPACE.get(v)
    if (arb || !Number.isNaN(Number(v))) return ['D002', `\`${cls}\` is ${name ? 'a scale step under another name' : 'off the spacing scale'}.`, name && `${variant}${util}-${name}`]
    return null
  }
  if (new RegExp(`^(bg|text|border|ring|fill|stroke|from|to|via|divide|outline|decoration|accent|caret|shadow)-(${TW_PALETTE})-\\d{2,3}(/\\d+)?$`).test(bare) || /^(bg|text|border|ring|fill|stroke)-(white|black)$/.test(bare))
    return ['D001', `\`${cls}\` is a raw palette colour: it won't follow the theme or the dials. Use \`bg-surface\`, \`text-text\`, \`text-text-subtle\`, \`bg-accent\`, \`border-border\`.`]
  if (/^(bg|text|border|ring|fill|stroke|from|to|via|outline)-\[(#|rgb|hsl|oklch)/.test(bare)) return ['D001', `\`${cls}\` is a raw colour: it won't follow the theme or the dials.`]
  const radius = /^rounded(-[a-z]+)?-\[(\d+)px\]$/.exec(bare)
  if (radius) return ['D003', `\`${cls}\` is a raw radius.`, RADIUS.has(Number(radius[2])) && !radius[1] ? `${variant}rounded-${RADIUS.get(Number(radius[2]))}` : undefined]
  if (/^(text|leading|tracking|font|shadow)-\[/.test(bare) || /^(text-(xs|sm|base|lg|[2-9]?xl)|font-(thin|light|normal|medium|semibold|bold|extrabold|black))$/.test(bare)) return ['D003', `\`${cls}\`: type and elevation come from roles, not sizes. Use \`<Heading role>\` or \`<Text role>\`.`]
  return null
}

/** `<div class="flex flex-col gap-4">` and `style={{ display: 'flex', … }}`: the primitive it spells out, or null. */
function layoutOf(el) {
  const cls = el.attr('class') ?? el.attr('className')
  if (cls?.kind === 'string') {
    const c = cls.value.split(/\s+/).filter(Boolean)
    if (!c.includes('flex') && !c.includes('grid')) return null
    const dir = c.includes('flex-col') ? 'Stack' : c.includes('flex') ? 'Row' : null
    if (!dir) return null
    const gap = c.find(x => x.startsWith('gap-'))?.slice(4)
    const name = SPACE_NAMES.includes(gap) ? gap : TW_SPACE.get(gap)
    return { primitive: dir, gap: name, attr: cls, exact: c.every(x => ['flex', 'flex-col', 'flex-row', 'flex-wrap'].includes(x) || x.startsWith('gap-')) && (!gap || !!name) }
  }
  const style = el.attr('style')
  if (!style) return null
  const decls = styleDecls(style)
  if (!decls.some(d => d.prop === 'display' && d.value === 'flex')) return null
  const dir = decls.find(d => d.prop === 'flex-direction')?.value
  const gap = decls.find(d => d.prop === 'gap')
  const px = gap && Number(gap.value.replace('px', ''))
  const name = gap && SPACE.get(px)
  const only = decls.every(d => ['display', 'flex-direction', 'gap'].includes(d.prop))
  return { primitive: dir === 'column' ? 'Stack' : 'Row', gap: name, attr: style, exact: only && (!gap || !!name) && style.kind === 'expr' && !/\.\.\./.test(style.expr) && (dir === 'column' || dir === undefined ? true : dir === 'row') }
}

const NATIVE = { button: 'Button', select: 'Select', textarea: 'Textarea' }
// the input types a browser paints, and the warp control for each; `Input` passes `type` through, so it counts too
const NATIVE_TYPES = { date: 'DateField', 'datetime-local': 'DateTimeField', time: 'TimeField', month: 'MonthPicker', week: 'DateField', number: 'NumberField', range: 'Slider', color: 'ColorField', checkbox: 'Checkbox', radio: 'Radio', file: 'a dropzone' }
const INTERACTIVE = new Set(['a', 'button', 'input', 'select', 'textarea', 'summary', 'Button', 'Toggle', 'Input', 'Search', 'Textarea', 'Select', 'Checkbox', 'Switch', 'Chip', 'Link'])
const STATIC = new Set(['div', 'span', 'p', 'li', 'section', 'article', 'td', 'tr', 'img', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'label'])

const NAMED = ['aria-label', 'aria-labelledby', 'title']
const named = el => NAMED.some(n => el.attr(n)) || el.attrs.some(a => a.kind === 'spread')
/** Children with something a screen reader can read: text, an expression, a component, an image with alt. */
const hasName = children => {
  if (/<img\b[^>]*\balt=(["'])[^"']+\1/.test(children)) return true
  const stripped = children.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<(Icon|[A-Z]\w*Icon)\b[^>]*\/>/g, '').replace(/<[^>]*aria-hidden[^>]*>[\s\S]*?<\/[^>]+>/g, '')
  return /[^\s<>{}]/.test(stripped.replace(/<\/?[a-z][^>]*>/g, ''))
}

/** Parse `#rgb`, `#rrggbb`, `rgb(r, g, b)`, `white` and `black`, or null. */
function literalColor(v) {
  const s = v.trim().toLowerCase()
  if (s === 'white') return [255, 255, 255]
  if (s === 'black') return [0, 0, 0]
  const h = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s)?.[1]
  if (h) return (h.length === 3 ? Array.from(h, c => c + c) : h.match(/../g)).map(x => parseInt(x, 16))
  const m = /^rgb\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*\)$/.exec(s)
  return m ? m.slice(1).map(Number) : null
}
const lum = c => { const [r, g, b] = c.map(x => { const s = x / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

/** Lines an allow comment covers: `// weft-allow D001: reason` (or `{/* … *\/}`) on the line above or at the line's end. */
function allowed(text) {
  const out = new Map()
  text.split('\n').forEach((line, i) => {
    const m = /weft-allow\s+((?:D\d{3}[\s,]*)+):\s*\S/.exec(line)
    if (!m) return
    for (const code of m[1].match(/D\d{3}/g)) for (const n of [i + 1, i + 2]) out.set(`${code}:${n}`, true)
  })
  return out
}

/** The edit that imports `names` from warp: into the file's existing import, or a new first line. */
function addImport(text, names) {
  const m = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*['"]${WARP}['"]`).exec(text)
  if (!m) return [{ start: 0, end: 0, text: `import { ${names.join(', ')} } from '${WARP}'\n` }]
  const have = m[1].split(',').map(s => s.trim()).filter(Boolean)
  const missing = names.filter(n => !have.includes(n))
  if (!missing.length) return []
  const at = m.index + m[0].indexOf(m[1]) + m[1].trimEnd().length
  return [{ start: at, end: at, text: `, ${missing.join(', ')}` }]
}

/** Does the app have warp's tokens? */
export function hasTokens(root) {
  const file = join(root, 'package.json')
  if (!existsSync(file)) return false
  try {
    const { dependencies, devDependencies } = JSON.parse(readFileSync(file, 'utf8'))
    return '@weft-js/warp' in { ...dependencies, ...devDependencies }
  } catch {
    return false
  }
}

/**
 * @param {string} root
 * @param {{ files: { rel: string, text: string }[], exclude?: string[], tokens: boolean }} options
 */
export function designChecks(root, { files: all, exclude = [], tokens }) {
  const files = all.filter(f => !/\.og\.[jt]sx$/.test(f.rel)) // a share card is drawn to a PNG: no theme, no tokens, no reader
  const out = []
  const looks = new Map() // heading level → every site that renders it, across the app, for D006
  const reporter = file => {
    const pos = positions(file.text)
    const allow = allowed(file.text)
    return (code, start, end, why, fix, severity) => {
      if (allow.has(`${code}:${pos.lineCol(start)[0]}`)) return
      const edits = fix && (fix.edits ?? [{ start: fix.at?.[0] ?? start, end: fix.at?.[1] ?? end, text: fix.text }]).map(e => ({ file: file.rel, span: pos.span(e.start, e.end), offset: [e.start, e.end], text: e.text }))
      out.push(diagnostic({ code, severity, file: file.rel, span: pos.span(start, end), offset: [start, end], why, fix: fix && { description: fix.description, safe: fix.safe, edits } }))
    }
  }

  for (const f of files) {
    if (!/\.[jt]sx$/.test(f.rel)) continue
    let scan
    try {
      scan = scanJsx(f.text, f.rel)
    } catch {
      continue // syntax errors are W000's
    }
    const report = reporter(f)
    const localComponents = new Set(scan.functions.keys())
    const warpName = n => scan.imports.some(i => i.source === WARP && i.local === n)
    const labelled = new Set(scan.elements.map(e => e.attr('for')?.value ?? e.attr('htmlFor')?.value).filter(Boolean))
    const headings = []
    const solids = new Map()

    for (const el of scan.elements) {
      // -- values --
      if (tokens) {
        const style = el.attr('style')
        if (style) for (const d of styleDecls(style)) declaration(d, report)
        const cls = el.attr('class') ?? el.attr('className')
        if (cls?.kind === 'string') {
          let at = cls.valueStart + 1
          for (const c of cls.value.split(/(\s+)/)) {
            const hit = c.trim() && utility(c)
            if (hit) report(hit[0], at, at + c.length, hit[1], hit[2] ? { description: `Use ${hit[2]}`, safe: true, text: hit[2] } : undefined)
            at += c.length
          }
        }
        const layout = /^[a-z]/.test(el.name) && ['div', 'section', 'ul', 'ol', 'nav', 'header', 'footer', 'main', 'aside', 'article', 'form'].includes(el.name) && layoutOf(el)
        if (layout) {
          const close = f.text.lastIndexOf('</', el.end - 1)
          const selfClosed = !f.text.slice(el.start, el.end).includes(`</${el.name}`)
          const as = el.name === 'div' ? '' : ` as="${el.name}"`
          const gap = layout.gap ? ` gap="${layout.gap}"` : ''
          const sole = el.attrs.length === 1
          const fix = layout.exact && sole && !selfClosed && {
            description: `Use <${layout.primitive}>`, safe: false,
            edits: [
              { start: el.start + 1, end: el.attrs[0].end, text: `${layout.primitive}${as}${gap}` },
              { start: close + 2, end: el.end - 1, text: layout.primitive },
              ...addImport(f.text, [layout.primitive]),
            ].sort((a, b) => b.start - a.start),
          }
          report('D004', el.start, el.tagEnd, `Hand-rolled layout on <${el.name}>: <${layout.primitive}> says what this is and keeps the gap on the scale.`, fix || undefined)
        }
        const bare = /^h[1-6]$/.test(el.name)
        if (bare || (el.name === 'Heading' && warpName('Heading'))) {
          const site = headingSite(el, bare)
          if (site && !allowed(f.text).has(`D006:${positions(f.text).lineCol(el.start)[0]}`)) looks.set(site.level, [...(looks.get(site.level) ?? []), { ...site, el, text: f.text, report }])
        }
        if (el.attr('data-weft')?.value === 'styled' && (/^(?:main|h1|article)$/.test(el.name) || el.attr('role')?.value === 'main' || el.attr('data-vt')?.value === 'main')) {
          report('D040', el.start, el.tagEnd, `The style gate on <${el.name}>: this is the page's main content, and the first paint would leave it hidden until the stylesheet lands.`, 'Mark a secondary part, or remove `data-weft="styled"`')
        }
        if (el.name === 'a' && el.attr('href') && !el.attr('class') && !el.attr('className') && !el.attr('style') && !el.attr('data-scope') && !el.attr('data-part') && !el.attrs.some(a => a.kind === 'spread')) {
          const taken = localComponents.has('Link') || scan.imports.some(i => i.local === 'Link' && i.source !== WARP)
          const close = f.text.lastIndexOf('</', el.end - 1)
          report('D007', el.start, el.tagEnd, 'A bare <a> in a warp app: it gets warp\'s link colour but no underline sweep or touch target, and nav links read as prose. Use <Link>, or `Shell`\'s `nav` for navigation.', !taken && f.text.slice(el.start, el.end).includes('</a') ? {
            description: 'Use <Link>', safe: false,
            edits: [{ start: el.start + 1, end: el.tagEnd, text: 'Link' }, { start: close + 2, end: el.end - 1, text: 'Link' }, ...addImport(f.text, ['Link'])].sort((a, b) => b.start - a.start),
          } : undefined)
        }
        const typed = (el.name === 'input' || el.name === 'Input') && NATIVE_TYPES[el.attr('type')?.value]
        if (typed && !el.attr('hidden') && !el.attr('data-part')) report('D005', el.start, el.tagEnd, `\`type="${el.attr('type').value}"\` is painted by the browser: <${typed}> is warp's.`)
        if (/^[a-z]/.test(el.name) && el.name !== 'iframe' && el.attr('title')) report('D005', el.start, el.tagEnd, 'A `title` tooltip: the browser paints it, late, and never on touch or keyboard. Use <Tooltip>, or `aria-label` for a name.')
        if (NATIVE[el.name] && !localComponents.has(NATIVE[el.name])) {
          const swap = el.name === 'button' && !el.attr('class') && !el.attr('className') && !el.attr('style') && f.text.slice(el.start, el.end).includes('</button')
          report('D005', el.start, el.tagEnd, `Native <${el.name}> in a warp app: <${NATIVE[el.name]}> brings the focus ring, the sweep, the tones and the touch target.`, swap ? {
            description: 'Use <Button>', safe: false,
            edits: [{ start: el.start + 1, end: el.tagEnd, text: 'Button' }, { start: f.text.lastIndexOf('</', el.end - 1) + 2, end: el.end - 1, text: 'Button' }, ...addImport(f.text, ['Button'])].sort((a, b) => b.start - a.start),
          } : undefined)
        }
      }

      // -- contrast of a literal pair --
      const style = el.attr('style')
      if (style) {
        const decls = styleDecls(style)
        const fg = decls.find(d => d.prop === 'color')
        const bg = decls.find(d => d.prop === 'background' || d.prop === 'background-color')
        const [a, b] = [fg && literalColor(fg.value), bg && literalColor(bg.value)]
        if (a && b && ratio(a, b) < 4.5) report('D011', style.start, style.end, `\`${fg.value}\` on \`${bg.value}\` is ${ratio(a, b).toFixed(2)}:1; body text needs 4.5:1 (WCAG 1.4.3).`)
        const none = decls.find(d => (d.prop === 'outline' || d.prop === 'outline-width') && /^(none|0(px)?)$/.test(d.value))
        if (none) report('D036', none.start, none.end, 'This removes the focus ring with nothing in its place: keyboard users lose their place (WCAG 2.4.7).')
      }
      const cls = el.attr('class') ?? el.attr('className')
      if (cls?.kind === 'string' && /(^|\s)(focus:)?outline-none(\s|$)/.test(cls.value) && !/focus(-visible)?:(ring|outline(?!-none))/.test(cls.value)) report('D036', cls.start, cls.end, '`outline-none` with no `focus-visible:` style in its place: keyboard users lose their place (WCAG 2.4.7).')

      // -- accessible names --
      if (['input', 'select', 'textarea'].includes(el.name)) {
        const type = el.attr('type')?.value
        const skip = ['hidden', 'submit', 'button', 'reset', 'image'].includes(type)
        const id = el.attr('id')
        // A computed id can pair with a label anywhere, a component around the field can render its label, and an
        // aria-hidden field (a honeypot) has no name to give. `for` counts on a component too: a `<Field for>` passes it on.
        const unseen = id?.kind === 'expr' || el.attr('aria-hidden')?.value === 'true' || el.ancestors.some(a => /^[A-Z]/.test(a))
        if (!skip && !unseen && !named(el) && !(id?.value && labelled.has(id.value)) && !el.ancestors.includes('label')) report('D030', el.start, el.tagEnd, `<${el.name}> has no label: a screen reader announces only "edit" (WCAG 1.3.1, 4.1.2).${el.attr('placeholder') ? ' A placeholder is not a label.' : ''}`)
      }
      if (['button', 'a', 'Button', 'Link'].includes(el.name) && !el.attr('label') && !named(el) && !(el.name === 'a' && !el.attr('href')) && !hasName(el.children)) report('D031', el.start, el.tagEnd, `<${el.name}> has no name a screen reader can read: only an icon, or nothing (WCAG 4.1.2).`)
      if (el.name === 'img' && !el.attr('alt') && !el.attrs.some(a => a.kind === 'spread')) report('D032', el.start, el.tagEnd, '<img> has no `alt`: a screen reader reads out the file name (WCAG 1.1.1).')

      // -- behaviour on the wrong element --
      if (STATIC.has(el.name) && el.attr('onClick') && !el.attr('role') && !el.attr('tabindex') && !el.attr('tabIndex')) {
        const swap = (el.name === 'div' || el.name === 'span') && f.text.slice(el.start, el.end).includes(`</${el.name}`)
        report('D033', el.start, el.tagEnd, `onClick on <${el.name}>: no keyboard, no focus, no role, so it only works with a mouse (WCAG 2.1.1).`, swap ? {
          description: 'Use a real button', safe: false,
          edits: [{ start: el.start + 1, end: el.tagEnd, text: 'button type="button"' }, { start: f.text.lastIndexOf('</', el.end - 1) + 2, end: el.end - 1, text: 'button' }].sort((a, b) => b.start - a.start),
        } : undefined)
      }
      if (INTERACTIVE.has(el.name) && el.ancestors.some(a => INTERACTIVE.has(a) && a !== 'label')) {
        const parent = [...el.ancestors].reverse().find(a => INTERACTIVE.has(a))
        report('D034', el.start, el.tagEnd, `<${el.name}> inside <${parent}>: nested controls don't reach the keyboard and screen readers merge them.`)
      }
      const tabindex = el.attr('tabindex') ?? el.attr('tabIndex')
      const tab = tabindex?.kind === 'string' ? Number(tabindex.value) : tabindex?.kind === 'expr' ? Number(tabindex.expr) : 0
      if (tab > 0) report('D037', tabindex.start, tabindex.end, `\`tabindex="${tab}"\` jumps the page's tab order (WCAG 2.4.3).`, { description: 'Use tabindex 0', safe: true, text: tabindex.kind === 'string' ? '"0"' : '0', at: [tabindex.valueStart, tabindex.valueEnd] })

      // -- outline --
      const h = /^h([1-6])$/.exec(el.name)
      const level = h ? Number(h[1]) : el.name === 'Heading' && warpName('Heading') ? Number(el.attr('level')?.value ?? /^\d$/.exec(el.attr('level')?.expr ?? '')?.[0] ?? 2) : 0
      if (level) headings.push({ level, el })

      // -- one primary action per region --
      if (el.name === 'Button' && warpName('Button') && (!el.attr('emphasis') || el.attr('emphasis')?.value === 'solid') && !el.attr('tone')) {
        const region = el.ancestors.findLast(a => ['Card', 'Modal', 'Drawer', 'Popover', 'section', 'form', 'header', 'footer', 'main', 'aside', 'Alert'].includes(a)) ?? ''
        const key = `${region}:${el.ancestors.length}:${scanParent(el, scan.elements)?.start ?? 0}`
        solids.set(key, [...(solids.get(key) ?? []), el])
      }
    }

    for (let i = 1; i < headings.length; i++) {
      const { level, el } = headings[i]
      if (level > headings[i - 1].level + 1) report('D035', el.start, el.tagEnd, `The outline jumps from h${headings[i - 1].level} to h${level}: screen-reader users navigate by headings (WCAG 1.3.1).`, undefined, 'warning')
    }
    for (const group of solids.values()) {
      for (const el of group.slice(1)) report('D038', el.start, el.tagEnd, `${group.length} solid Buttons side by side: one primary action per region.`, { description: 'Make this one soft', safe: false, text: ' emphasis="soft"', at: [el.tagEnd, el.tagEnd] })
    }
  }

  for (const [level, sites] of looks) roleDrift(level, sites)

  // -- CSS files --
  for (const rel of discover(root, { include: ['**/*.css'], exclude })) {
    const text = readFileSync(join(root, rel), 'utf8')
    const css = text.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    const file = { rel, text }
    const report = reporter(file)
    for (const m of css.matchAll(/(?<=[{;\s])(-?-?[\w-]+)\s*:\s*([^;{}]+)/g)) {
      const prop = m[1].toLowerCase()
      if (prop.startsWith('--')) continue
      const start = m.index + m[0].indexOf(m[2], m[1].length + 1)
      if (tokens) declaration({ prop, value: m[2].trim(), start, end: start + m[2].trimEnd().length }, report)
      if ((prop === 'outline' || prop === 'outline-width') && /^(none|0(px)?)\s*$/.test(m[2])) {
        const rule = css.lastIndexOf('}', m.index)
        const selector = css.slice(rule + 1, css.indexOf('{', rule + 1))
        if (/:focus(?!-within)/.test(selector) && !/box-shadow|border/.test(css.slice(m.index, css.indexOf('}', m.index)))) report('D036', start, start + m[2].trimEnd().length, `\`${selector.trim()}\` removes the focus ring with nothing in its place: keyboard users lose their place (WCAG 2.4.7).`)
      }
    }
  }

  // -- the page --
  for (const rel of discover(root, { include: ['**/*.html'], exclude })) {
    const text = readFileSync(join(root, rel), 'utf8')
    const m = /<html\b[^>]*>/i.exec(text)
    if (m && !/\blang\s*=/.test(m[0])) reporter({ rel, text })('D039', m.index, m.index + m[0].length, '<html> has no `lang`: a screen reader guesses the language to speak (WCAG 3.1.1).', { description: 'Set lang="en"', safe: false, text: `${m[0].slice(0, -1)} lang="en">` })
  }
  return out
}

/** What one heading renders at: `{ level, role, set }`, or null when a `level` or `role` expression hides it. `role` is null for a bare `<hN>`. */
function headingSite(el, bare) {
  if (bare) return { level: Number(el.name[1]), role: null }
  const lv = el.attr('level')
  const level = !lv ? 2 : Number(lv.value ?? /^\d$/.exec(lv.expr ?? '')?.[0])
  if (!HEADING_ROLE[level]) return null
  const attr = el.attr('role')
  if (attr && attr.kind !== 'string') return null
  return { level, role: attr?.value ?? HEADING_ROLE[level], set: attr }
}

/** D006: the roles one level renders at across the app. The most used `Heading` role wins, then the level's default; every other site is fixed to it. */
function roleDrift(level, sites) {
  const counts = new Map()
  for (const s of sites) if (s.role) counts.set(s.role, (counts.get(s.role) ?? 0) + 1)
  if (!counts.size || new Set(sites.map(s => s.role)).size < 2) return
  const fallback = HEADING_ROLE[level]
  const top = Math.max(...counts.values())
  const role = counts.get(fallback) === top ? fallback : [...counts].find(([, n]) => n === top)[0]
  const prop = role === fallback ? '' : ` role="${role}"`
  const all = [...counts.keys()].join(', ')
  for (const { el, text, report, role: has, set } of sites) {
    if (has === role) continue
    if (has === null) {
      const swap = !el.attr('class') && !el.attr('className') && !el.attr('style') && text.slice(el.start, el.end).includes(`</${el.name}`)
      report('D006', el.start, el.tagEnd, `A bare <h${level}> beside <Heading level={${level}}>: this one renders at the browser's size, the rest at \`${role}\`.`, swap ? {
        description: `Use <Heading level={${level}}>`, safe: false,
        edits: [{ start: el.start + 1, end: el.tagEnd, text: `Heading level={${level}}${prop}` }, { start: text.lastIndexOf('</', el.end - 1) + 2, end: el.end - 1, text: 'Heading' }, ...addImport(text, ['Heading'])].sort((a, b) => b.start - a.start),
      } : undefined)
      continue
    }
    const fix = set
      ? { description: role === fallback ? `Drop \`role\`: h${level} is \`${role}\`` : `Use role="${role}"`, safe: false, edits: [role === fallback ? { start: text.slice(0, set.start).trimEnd().length, end: set.end, text: '' } : { start: set.valueStart, end: set.valueEnd, text: `"${role}"` }] }
      : { description: `Use role="${role}"`, safe: false, text: prop, at: [el.tagEnd, el.tagEnd] }
    report('D006', el.start, el.tagEnd, `h${level} renders at two roles in this app (${all}): a level is one size everywhere. This one is \`${has}\`, the rest \`${role}\`. \`// weft-allow D006: <reason>\` keeps a real exception.`, fix)
  }
}

/** The nearest element that contains `el`. */
function scanParent(el, elements) {
  let best
  for (const e of elements) if (e !== el && e.start <= el.start && e.end >= el.end && (!best || e.start >= best.start)) best = e
  return best
}
