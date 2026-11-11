/** veneer's spacing scale at the default density, px → token (veneer.css). */
const SPACE = new Map([
  [2, 'hair'],
  [4, 'tight'],
  [8, 'related'],
  [16, 'group'],
])
const SPACE_NAMES = 'hair tight related group section page'.split(' ')
/** veneer's radii at the quiet stop, where a raw radius is most likely to have been copied from. */
const RADIUS = new Map([
  [4, 'mark'],
  [8, 'control'],
  [12, 'surface'],
])
export const VENEER = '@kerf-js/veneer'
/** The role each heading level takes by default: the same table as veneer's `Heading` (packages/veneer/src/Type.tsx). */
export const HEADING_ROLE = {
  1: 'title',
  2: 'heading',
  3: 'heading',
  4: 'label',
  5: 'label',
  6: 'label',
}

const COLOR_EXPECTED =
  'var(--veneer-color-text), -text-subtle, -surface, -surface-raised, -accent-solid, -border, or a `tone` on the component'
const COLOR =
  /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(|(?<![-\w])(?:white|black|red|green|blue|gray|grey|orange|yellow|purple|pink|indigo|teal)(?![-\w])/i
const COLOR_PROPS =
  /^(color|background|background-color|border-color|border(-(top|right|bottom|left|block|inline)(-(start|end))?)?|outline-color|fill|stroke|box-shadow|caret-color|accent-color)$/
const SPACE_PROPS =
  /^(gap|row-gap|column-gap|padding|margin)(-(top|right|bottom|left|block|inline)(-(start|end))?)?$/
const TYPE_PROPS = /^(font-size|font-weight|line-height|letter-spacing)$/
/** Sizes that scale with the text, the container or the viewport: nothing on a fixed scale is what they mean. */
const FLUID =
  /\b(?:clamp|calc|min|max)\(|\d(?:em|ex|lh|rlh|ch|cap|ic|vw|vh|vi|vb|vmin|vmax|[dsl]v[wh]|cq[iwhb]|cqmin|cqmax)\b|%/

const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

/** `16px 8px` → the same with tokens, or null if any part isn't exactly on the scale. */
function scaled(value) {
  const parts = value.trim().split(/\s+/)
  const out = parts.map((p) => {
    if (p === '0' || p === '0px' || p === 'auto') return p
    const m = /^(\d+(?:\.\d+)?)(px|rem)?$/.exec(p)
    if (!m) return null
    const px = m[2] === 'rem' ? Number(m[1]) * 16 : Number(m[1])
    return SPACE.has(px) ? `var(--veneer-space-${SPACE.get(px)})` : null
  })
  return out.every(Boolean) ? out.join(' ') : null
}

/** Declarations in a `style` attribute: `{ prop, value, numeric, start, end }` with offsets into the file. */
export function styleDecls(attr) {
  if (attr.kind === 'string') {
    const at = attr.valueStart + 1
    return [...attr.value.matchAll(/([\w-]+)\s*:\s*([^;]+)/g)].map((m) => {
      const start = at + m.index + m[0].indexOf(m[2], m[1].length + 1)
      return {
        prop: m[1].toLowerCase(),
        value: m[2].trim(),
        start,
        end: start + m[2].trimEnd().length,
      }
    })
  }
  const out = []
  for (const m of (attr.expr ?? '').matchAll(
    /([\w$]+|['"][\w-]+['"])\s*:\s*(?:(['"`])([^'"`$]*)\2|(\d+(?:\.\d+)?)(?=\s*[,}\s]))/g,
  )) {
    const value = m[3] ?? m[4]
    const inner = m[0].lastIndexOf(value)
    const start = attr.valueStart + m.index + inner - (m[3] !== undefined ? 1 : 0)
    out.push({
      prop: kebab(m[1].replace(/['"]/g, '')),
      value,
      numeric: m[3] === undefined,
      start,
      end: start + value.length + (m[3] !== undefined ? 2 : 0),
      quote: m[2],
    })
  }
  return out
}

/** The D-code for one raw declaration, or null. `report` takes (code, start, end, why, fix). */
export function declaration({ prop, value, numeric, start, end, quote }, report) {
  const css = (numeric && SPACE_PROPS.test(prop) ? `${value}px` : value).replace(
    /\s*!important\s*$/i,
    '',
  )
  if (/var\(|^(inherit|initial|unset|transparent|currentcolor|none)$/i.test(css.trim())) return
  if (COLOR_PROPS.test(prop) && COLOR.test(css.replace(/url\([^)]*\)/gi, '')))
    return report(
      'D001',
      start,
      end,
      `Raw colour \`${prop}: ${css}\`: it won't follow the theme, the dials or dark mode. Use ${COLOR_EXPECTED}, or promote it to a token in \`veneer({ tokens })\`.`,
    )
  if (SPACE_PROPS.test(prop)) {
    if (/^(0(px)?|auto)$/.test(css.trim()) || FLUID.test(css)) return
    const token = scaled(css)
    const text = token && (quote ? `${quote}${token}${quote}` : numeric ? `'${token}'` : token)
    return report(
      'D002',
      start,
      end,
      `\`${prop}: ${css}\` is ${token ? 'a scale step written by hand' : 'off the spacing scale'}: gaps are relationships (${SPACE_NAMES.join(', ')}).`,
      token ? { description: `Use ${token}`, safe: true, text } : undefined,
    )
  }
  if (TYPE_PROPS.test(prop))
    return report(
      'D003',
      start,
      end,
      `Raw \`${prop}: ${css}\`: type comes from roles, not sizes. Use \`<Heading role>\` or \`<Text role>\` (display title heading body label caption eyebrow code).`,
    )
  if (prop === 'border-radius') {
    if (/^(0(px)?|\d+%)$/.test(css.trim())) return
    const m = /^(\d+)(?:px)?$/.exec(css.trim())
    const name = m && RADIUS.get(Number(m[1]))
    const text = name && `var(--veneer-radius-${name})`
    return report(
      'D003',
      start,
      end,
      `Raw \`border-radius: ${css}\`: radii come from the expression dial (mark, control, surface, round).`,
      name
        ? {
            description: `Use ${text}`,
            safe: true,
            text: quote ? `${quote}${text}${quote}` : numeric ? `'${text}'` : text,
          }
        : undefined,
    )
  }
  if (prop === 'box-shadow' && !/^none$/i.test(css.trim()))
    return report(
      'D003',
      start,
      end,
      'A raw shadow: elevation comes from `--veneer-elevation-0…3`, which follow the dials and the theme.',
    )
}

// -- Tailwind classes, for an app that has veneer's tokens too --

const TW_SPACE = new Map([
  ['0.5', 'hair'],
  ['1', 'tight'],
  ['2', 'related'],
  ['4', 'group'],
])
const TW_PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const TW_PX = 4

/** D001–D003 for one class; returns `[code, why, replacement?]` or null. */
export function utility(cls) {
  const bare = cls
    .slice(cls.lastIndexOf(':') + 1)
    .replace(/^-/, '')
    .replace(/!$/, '')
  const variant = cls.slice(0, cls.length - cls.slice(cls.lastIndexOf(':') + 1).length)
  const space =
    /^(p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|gap|gap-x|gap-y|space-x|space-y)-(.+)$/.exec(
      bare,
    )
  if (space) {
    const [, util, v] = space
    if (['auto', 'px', '0'].includes(v) || SPACE_NAMES.includes(v)) return null
    const arb = /^\[(.+)\]$/.exec(v)?.[1]
    const px = arb
      ? (/^(\d+(?:\.\d+)?)(px|rem)$/.exec(arb) ?? [])[1] * (arb.endsWith('rem') ? 16 : 1)
      : Number(v) * TW_PX
    const name = arb ? SPACE.get(px) : TW_SPACE.get(v)
    if (arb || !Number.isNaN(Number(v)))
      return [
        'D002',
        `\`${cls}\` is ${name ? 'a scale step under another name' : 'off the spacing scale'}.`,
        name && `${variant}${util}-${name}`,
      ]
    return null
  }
  if (
    new RegExp(
      `^(bg|text|border|ring|fill|stroke|from|to|via|divide|outline|decoration|accent|caret|shadow)-(${TW_PALETTE})-\\d{2,3}(/\\d+)?$`,
    ).test(bare) ||
    /^(bg|text|border|ring|fill|stroke)-(white|black)$/.test(bare)
  )
    return [
      'D001',
      `\`${cls}\` is a raw palette colour: it won't follow the theme or the dials. Use \`bg-surface\`, \`text-text\`, \`text-text-subtle\`, \`bg-accent\`, \`border-border\`.`,
    ]
  if (/^(bg|text|border|ring|fill|stroke|from|to|via|outline)-\[(#|rgb|hsl|oklch)/.test(bare))
    return ['D001', `\`${cls}\` is a raw colour: it won't follow the theme or the dials.`]
  const radius = /^rounded(-[a-z]+)?-\[(\d+)px\]$/.exec(bare)
  if (radius)
    return [
      'D003',
      `\`${cls}\` is a raw radius.`,
      RADIUS.has(Number(radius[2])) && !radius[1]
        ? `${variant}rounded-${RADIUS.get(Number(radius[2]))}`
        : undefined,
    ]
  if (
    /^(text|leading|tracking|font|shadow)-\[/.test(bare) ||
    /^(text-(xs|sm|base|lg|[2-9]?xl)|font-(thin|light|normal|medium|semibold|bold|extrabold|black))$/.test(
      bare,
    )
  )
    return [
      'D003',
      `\`${cls}\`: type and elevation come from roles, not sizes. Use \`<Heading role>\` or \`<Text role>\`.`,
    ]
  return null
}

/** `<div class="flex flex-col gap-4">` and `style={{ display: 'flex', … }}`: the primitive it spells out, or null. */
export function layoutOf(el) {
  const cls = el.attr('class') ?? el.attr('className')
  if (cls?.kind === 'string') {
    const c = cls.value.split(/\s+/).filter(Boolean)
    if (!c.includes('flex') && !c.includes('grid')) return null
    const dir = c.includes('flex-col') ? 'Stack' : c.includes('flex') ? 'Row' : null
    if (!dir) return null
    const gap = c.find((x) => x.startsWith('gap-'))?.slice(4)
    const name = SPACE_NAMES.includes(gap) ? gap : TW_SPACE.get(gap)
    return {
      primitive: dir,
      gap: name,
      attr: cls,
      exact:
        c.every(
          (x) => ['flex', 'flex-col', 'flex-row', 'flex-wrap'].includes(x) || x.startsWith('gap-'),
        ) &&
        (!gap || !!name),
    }
  }
  const style = el.attr('style')
  if (!style) return null
  const decls = styleDecls(style)
  if (!decls.some((d) => d.prop === 'display' && d.value === 'flex')) return null
  const dir = decls.find((d) => d.prop === 'flex-direction')?.value
  const gap = decls.find((d) => d.prop === 'gap')
  const px = gap && Number(gap.value.replace('px', ''))
  const name = gap && SPACE.get(px)
  const only = decls.every((d) => ['display', 'flex-direction', 'gap'].includes(d.prop))
  return {
    primitive: dir === 'column' ? 'Stack' : 'Row',
    gap: name,
    attr: style,
    exact:
      only &&
      (!gap || !!name) &&
      style.kind === 'expr' &&
      !/\.\.\./.test(style.expr) &&
      (dir === 'column' || dir === undefined ? true : dir === 'row'),
  }
}
