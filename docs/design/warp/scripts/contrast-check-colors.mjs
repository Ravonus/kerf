// ---------------------------------------------------------------- CSS parsing
// Collect custom-property declarations with their selector and enclosing @media.
function parseBlocks(src, media = [], out = []) {
  let i = 0
  while (i < src.length) {
    const open = src.indexOf('{', i)
    const semi = src.indexOf(';', i)
    if (open === -1) break
    if (semi !== -1 && semi < open && src.slice(i, semi).trim().startsWith('@')) {
      i = semi + 1
      continue
    }
    const prelude = src.slice(i, open).trim()
    let depth = 1,
      j = open + 1
    while (j < src.length && depth) {
      if (src[j] === '{') depth++
      else if (src[j] === '}') depth--
      j++
    }
    const body = src.slice(open + 1, j - 1)
    if (prelude.startsWith('@media')) parseBlocks(body, [...media, prelude.slice(6).trim()], out)
    else if (/^@(container|supports)/.test(prelude)) parseBlocks(body, [...media, prelude], out)
    else if (prelude.startsWith('@layer')) parseBlocks(body, media, out)
    else if (prelude.startsWith('@')) {
      /* keyframes etc. */
    } else {
      for (const d of splitTop(body, ';')) {
        const m = d.match(/^\s*(--[\w-]+)\s*:\s*([\s\S]*)$/)
        if (m)
          out.push({ selector: prelude, media, prop: m[1], value: m[2].trim(), order: out.length })
      }
    }
    i = j
  }
  return out
}

function splitTop(s, sep) {
  const parts = []
  let depth = 0,
    cur = ''
  for (const ch of s) {
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    if (ch === sep && depth === 0) {
      parts.push(cur)
      cur = ''
    } else cur += ch
  }
  if (cur.trim()) parts.push(cur)
  return parts
}

// The cascade for one environment: highest specificity, then latest, wins.
function resolveEnv(decls, attrs, matchSelector) {
  const winners = new Map()
  for (const d of decls) {
    if (d.media.length) continue // media inputs (viewport, pointer, reduced motion) don't touch colour
    const spec = matchSelector(d.selector, attrs)
    if (spec < 0) continue
    const prev = winners.get(d.prop)
    if (!prev || spec > prev.spec || (spec === prev.spec && d.order > prev.order))
      winners.set(d.prop, { ...d, spec })
  }
  return new Map([...winners].map(([k, v]) => [k, v.value]))
}

function substitute(value, vars, theme, depth = 0) {
  if (depth > 40) throw new Error('var() cycle near ' + value)
  let out = value.replace(/var\((--[\w-]+)\s*(?:,\s*([^()]*))?\)/g, (_, name, fb) => {
    const v = vars.get(name) ?? fb
    if (v === undefined) throw new Error('undefined ' + name)
    return substitute(v, vars, theme, depth + 1)
  })
  // light-dark(a, b) → the theme's branch (innermost first)
  let guard = 0
  while (out.includes('light-dark(') && guard++ < 50) {
    const start = out.lastIndexOf('light-dark(')
    let depthP = 0,
      j = start + 'light-dark'.length
    for (; j < out.length; j++) {
      if (out[j] === '(') depthP++
      else if (out[j] === ')' && --depthP === 0) break
    }
    const [a, b] = splitTop(out.slice(start + 11, j), ',')
    out = out.slice(0, start) + (theme === 'light' ? a : b).trim() + out.slice(j + 1)
  }
  return out
}

// --------------------------------------------------------------- colour maths
// color-mix(in oklab, A p%, B): mixed in OKLab, returned as OKLCH (what the browser does)
const toLab = ({ L, C, H }) => [
  L,
  C * Math.cos((H * Math.PI) / 180),
  C * Math.sin((H * Math.PI) / 180),
]
const fromLab = ([L, a, b]) => ({
  L,
  C: Math.hypot(a, b),
  H: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360,
})

function oklchToLinear({ L, C, H }) {
  const h = (H * Math.PI) / 180,
    a = C * Math.cos(h),
    b = C * Math.sin(h)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}
const inGamut = (rgb) => rgb.every((c) => c >= -1e-4 && c <= 1 + 1e-4)
// CSS Color 4 style gamut mapping: reduce chroma until it fits.
function toLinearSrgb(c) {
  let rgb = oklchToLinear(c)
  if (inGamut(rgb)) return { rgb, clipped: false }
  let lo = 0,
    hi = c.C
  for (let k = 0; k < 24; k++) {
    const mid = (lo + hi) / 2
    inGamut(oklchToLinear({ ...c, C: mid })) ? (lo = mid) : (hi = mid)
  }
  rgb = oklchToLinear({ ...c, C: lo }).map((v) => Math.min(1, Math.max(0, v)))
  return { rgb, clipped: c.C - lo > 0.004 }
}
function fromSrgb(srgb) {
  const lin = srgb.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return { lin, alpha: 1 }
}
const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b
const ratio = (y1, y2) => (Math.max(y1, y2) + 0.05) / (Math.min(y1, y2) + 0.05)
const toHex = (lin) =>
  '#' +
  lin
    .map((v) => {
      const s = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
      return Math.round(Math.min(1, Math.max(0, s)) * 255)
        .toString(16)
        .padStart(2, '0')
    })
    .join('')

const over = (fg, bg) => fg.lin.map((v, i) => v * fg.alpha + bg.lin[i] * (1 - fg.alpha))

// On failure: the same search the token build runs to *compute* ink —
// walk OKLCH lightness away from the background until the ratio passes.
function suggest(fg, bg, min) {
  if (fg.L === undefined) return null
  const yb = luminance(bg.lin),
    dir = luminance(fg.lin) > yb ? 1 : -1
  for (let L = fg.L; L >= 0 && L <= 1; L += dir * 0.005) {
    const { rgb } = toLinearSrgb({ ...fg, L })
    if (ratio(luminance(rgb), yb) >= min) return `L ${L.toFixed(3)}`
  }
  return 'flip ink direction'
}

function readThemeColor(side, label, parseColor, fail) {
  if (
    !side ||
    typeof side.token !== 'string' ||
    !/^--[a-zA-Z0-9-]+$/.test(side.token) ||
    typeof side.value !== 'string'
  )
    fail(`invalid ${label} token or value`)
  let parsed
  try {
    parsed = parseColor(side.value)
  } catch (error) {
    fail(`unsupported ${label} colour ${side.value}: ${error.message}`)
  }
  const lin = parsed.lin ?? toLinearSrgb(parsed).rgb
  if (
    !lin.every(Number.isFinite) ||
    !Number.isFinite(parsed.alpha) ||
    parsed.alpha < 0 ||
    parsed.alpha > 1
  )
    fail(`invalid ${label} colour ${side.value}`)
  return { ...parsed, lin }
}

// The caller enumerates effective paints; this does not infer CSS states or paint coverage.
function checkThemePairs(pairs, parseColor) {
  if (!Array.isArray(pairs) || pairs.length === 0)
    throw new Error('D010 theme pairs must be a nonempty array')
  const sites = {
    button: {
      base: 4.5,
      'fill-start': 4.5,
      'fill-end': 4.5,
      'fill-fallback': 4.5,
      'fill-relative': 4.5,
      border: 3,
    },
    sweep: {
      'text-filled': 4.5,
      'text-unfilled': 4.5,
      'stroke-base': 3,
      'stroke-surface': 3,
      'base-surface': 3,
    },
  }
  const states = [
    'rest',
    'hover',
    'focus',
    'press',
    'active',
    'selected',
    'floated',
    'invalid',
    'open',
    'checked',
  ]
  const emphases = ['solid', 'soft', 'outline', 'ghost', 'link', 'frame']
  return pairs.map((pair, index) => {
    const path = typeof pair?.path === 'string' && pair.path ? pair.path : `pairs[${index}]`
    const fail = (message) => {
      throw new Error(`D010 ${path}: ${message}`)
    }
    if (!pair || typeof pair !== 'object' || Array.isArray(pair)) fail('expected a pair')
    const { palette, theme, expression, part, state, emphasis, site, fg, bg } = pair
    if (typeof palette !== 'string' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(palette))
      fail('invalid palette')
    if (!['light', 'dark'].includes(theme) || !['quiet', 'balanced', 'vivid'].includes(expression))
      fail('invalid mode or expression')
    if (!states.includes(state) || !emphases.includes(emphasis))
      fail('unsupported state or emphasis')
    if (!Object.hasOwn(sites, part) || !Object.hasOwn(sites[part], site))
      fail('unsupported part or paint site')
    const min = sites[part][site]
    const foreground = readThemeColor(fg, 'foreground', parseColor, fail),
      background = readThemeColor(bg, 'background', parseColor, fail)
    if (background.alpha !== 1) fail('background must be resolved over an opaque surface')
    const measured = ratio(luminance(over(foreground, background)), luminance(background.lin))
    return {
      group: 'Theme part',
      code: 'D010',
      combo: `${theme}/${expression}`,
      palette,
      theme,
      expression,
      part,
      state,
      emphasis,
      site,
      path,
      fg: fg.token,
      bg: bg.token,
      min,
      ratio: measured,
      pass: measured >= min,
      fgHex: toHex(foreground.lin),
      bgHex: toHex(background.lin),
    }
  })
}

export {
  checkThemePairs,
  parseBlocks,
  splitTop,
  resolveEnv,
  substitute,
  toLab,
  fromLab,
  fromSrgb,
  over,
  ratio,
  luminance,
  toHex,
  toLinearSrgb,
  suggest,
}
