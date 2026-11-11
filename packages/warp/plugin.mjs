// warp() contributes configuration, tokens, component discovery and agent instructions.
// Seed hues are contrast-checked and fitted against the canonical warp-core stylesheet.
// Classic fields and dial defaults re-scope canonical rules; explicit markup still wins.
// Radius, fonts and token overrides apply at every scope and pass the same contrast checks.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { definePlugin } from '@weft-js/core/plugin'
import { hex, luminance, toLinear } from './tokens/color.mjs'
import { ICONS } from './src/plugin/icons.mjs'
import { componentCatalog } from './src/plugin/catalog.mjs'
import { dtcgTokens } from './src/plugin/dtcg.mjs'
import { DEFAULT, normalizeSeed, seedByName } from './src/plugin/seed.mjs'
import { checkTokens, tailwindTheme, themed, themeOptions } from './src/plugin/theme.mjs'
import { themeContext, withRem } from './src/plugin/theme-context.mjs'

const core = new URL('../warp-core/', import.meta.url)
const DIALS = {
  expression: ['quiet', 'balanced', 'vivid'],
  density: ['compact', 'cozy', 'comfortable'],
  flair: ['sweep', 'none'],
  theme: ['light', 'dark'],
}
const RADII = { sharp: [2, 2, 2], soft: [8, 12, 4], round: [14, 20, 6] }
const FONTS = {
  body: ['sans', 'ui-sans-serif, system-ui, sans-serif'],
  display: ['display', 'ui-sans-serif, system-ui, sans-serif'],
  mono: ['mono', 'ui-monospace, monospace'],
}
// The spec's scope roots (warp.css §2): every one recomputes the sys tokens, so an override has to land on each.
const SCOPES =
  ':root,[data-expression],[data-density],[data-form],[data-pointer],[data-motion],[data-flair],[data-theme],[data-palette],[data-warp]'
const THEMING = ['colors', 'system', 'parts', 'themes']
const safe = (value) => typeof value === 'string' && value !== '' && !/[;{}<]/.test(value)
const bad = (path, message) => Object.assign(new Error(message), { path })

function options(input) {
  const out = {}
  for (const key of Object.keys(input))
    if (
      !['seed', 'fields', 'dials', 'radius', 'icons', 'fonts', 'tokens', ...THEMING].includes(key)
    )
      throw Object.assign(new Error(`unknown option \`${key}\``), { path: key })
  if (input.fields !== undefined && input.fields !== 'floating' && input.fields !== 'classic')
    throw Object.assign(new Error(`must be 'floating' or 'classic'`), { path: 'fields' })
  if (input.seed !== undefined) {
    try {
      const seed = seedByName(input.seed, input.colors)
      out.seed = normalizeSeed(seed)
      if (typeof seed?.accent === 'string') out.asked = seed.accent.toLowerCase()
    } catch (error) {
      throw Object.assign(/** @type {Error} */ (error), { path: 'seed' })
    }
  }
  if (input.fields) out.fields = input.fields
  const { palette, ...dialsIn } = input.dials ?? {}
  for (const [dial, value] of Object.entries(dialsIn)) {
    if (!DIALS[dial])
      throw bad(`dials.${dial}`, `unknown dial; use ${Object.keys(DIALS).join(', ')}`)
    if (!DIALS[dial].includes(value))
      throw bad(`dials.${dial}`, `must be one of ${DIALS[dial].join(', ')}`)
  }
  if (Object.keys(dialsIn).length) out.dials = dialsIn
  if (input.radius !== undefined) {
    if (!RADII[input.radius]) throw bad('radius', `must be one of ${Object.keys(RADII).join(', ')}`)
    out.radius = input.radius
  }
  if (input.icons !== undefined && !ICONS[input.icons])
    throw bad('icons', `must be one of ${Object.keys(ICONS).join(', ')}`)
  if (input.icons) out.icons = input.icons
  for (const [font, value] of Object.entries(input.fonts ?? {})) {
    if (!FONTS[font])
      throw bad(`fonts.${font}`, `unknown font; use ${Object.keys(FONTS).join(', ')}`)
    if (!safe(value)) throw bad(`fonts.${font}`, 'must be a font family or a CSS font stack')
  }
  if (input.fonts) out.fonts = input.fonts
  checkTokens(input.tokens, 'tokens')
  if (input.tokens) out.tokens = input.tokens
  const seedAt = (seed, path, colors) => {
    try {
      return normalizeSeed(seedByName(seed, colors))
    } catch (error) {
      throw Object.assign(/** @type {Error} */ (error), { path })
    }
  }
  if (THEMING.some((k) => input[k] !== undefined) || palette !== undefined)
    out.theme = themeOptions({ ...input, default: palette }, themeContext(core).tokenNames, {
      seed: seedAt,
      tokens: (tokens, path) => checkTokens(tokens, path) ?? {},
    })
  if (palette !== undefined) out.theme.default = palette
  return out
}

const fontStack = (value, fallback) =>
  value.includes(',') ? value : `${JSON.stringify(value)}, ${fallback}`

/** The radius, fonts and tokens as declarations, or '' with none set. */
function overrides({ seed, radius, icons, fonts = {}, tokens = {}, theme }) {
  const out = {}
  // The neutral's refs are redeclared at each expression stop, so it lands on every scope, as a token does.
  if (seed?.neutral)
    Object.assign(out, {
      '--warp-ref-neutral-h': seed.neutral.hue,
      '--warp-ref-neutral-c': seed.neutral.chroma,
    })
  if (radius)
    [out['--warp-radius-control'], out['--warp-radius-surface'], out['--warp-radius-mark']] = RADII[
      radius
    ].map((px) => `${px}px`)
  if (icons) for (const [k, v] of Object.entries(ICONS[icons])) out[`--warp-icon-${k}`] = v
  for (const [font, value] of Object.entries(fonts))
    out[`--warp-font-${FONTS[font][0]}`] = fontStack(value, FONTS[font][1])
  Object.assign(out, theme?.system, tokens)
  return Object.entries(out)
    .map(([k, v]) => `${k}:${v}`)
    .join(';')
}

// In warp.base, a later layer than warp.tokens, so a token set here beats every dial stop and every copied default.
const overrideCss = (declarations) =>
  declarations ? `@layer warp.base{${SCOPES}{${declarations}}}\n` : ''

const seedCss = (s) =>
  `@layer warp.tokens{:root{--warp-seed-accent-h:${s.hue};--warp-seed-accent-c:${s.chroma}}}\n`

/** The spec checker's report on warp.css with the seed and any token overrides applied. */
function contrast(seed, declarations) {
  const dir = mkdtempSync(join(tmpdir(), 'warp-seed-'))
  try {
    const css = join(dir, 'warp.css')
    writeFileSync(
      css,
      readFileSync(new URL('styles/warp.css', core), 'utf8') +
        `\n:root{--warp-seed-accent-h:${seed.hue};--warp-seed-accent-c:${seed.chroma}}\n${declarations && `${SCOPES}{${declarations}}\n`}`,
    )
    let out
    try {
      out = execFileSync(
        process.execPath,
        [fileURLToPath(new URL('scripts/contrast-check.mjs', core)), css, '--json'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      )
    } catch (e) {
      out = e.stdout // exit 1 on failures; the JSON is still on stdout
    }
    return JSON.parse(out)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** The theme and expression stops an app's `dials` can render by default. Markup that sets another stop is the app's to check. */
const renders =
  (dials = {}) =>
  (r) =>
    (!dials.theme || r.theme === dials.theme) &&
    (!dials.expression || r.expression === dials.expression)

/** D010 with every failing pair, at the stops `dials` leave. Returns how many pairs passed. */
export function checkSeed(seed, declarations = '', dials) {
  const results = contrast(seed, declarations).results.filter(renders(dials))
  const failed = results.filter((r) => !r.pass)
  const failures = failed.map(
    (r) => `${r.combo}: ${r.fg} on ${r.bg} is ${r.ratio.toFixed(2)}:1, needs ${r.min}:1`,
  )
  if (failures.length)
    throw Object.assign(
      new Error(
        `warp colours fail contrast (${failures.length} pairs): ${failures.slice(0, 5).join('; ')}${failures.length > 5 ? '; …' : ''}`,
      ),
      {
        code: 'D010',
        failures,
        help: 'Change the seed or token named in each pair, or limit the stops with `dials`. `weft docs theme` has worked looks.',
      },
    )
  return results.length
}

/** Where a seed's accent lands: a seed sets the hue family, and each theme solves its own lightness for contrast. */
function landed(seed, declarations, asked) {
  const { resolved } = contrast(seed, declarations)
  const light = resolved['light/balanced']?.['accent-solid'],
    dark = resolved['dark/balanced']?.['accent-solid']
  return light === asked && dark === asked
    ? undefined
    : `warp: accent ${asked} landed as ${light} light, ${dark} dark. A seed sets the hue family; pin an exact brand with \`--warp-color-accent-solid\` (\`weft docs theme\`).`
}

/** The resolved tokens as DTCG 2025.10, using the app's seed and overrides. */
export function dtcg(css = '') {
  return dtcgTokens(css, core)
}

// A token's value in the spec, with `from` (its lightness for one theme) replaced by `to`.
function relit(token, from, to) {
  const value = readFileSync(new URL('styles/warp.css', core), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .match(new RegExp(`${token}:\\s*([^;]+);`))[1]
  return value.replace(/\s+/g, ' ').replace(`oklch(${from} `, `oklch(${to} `)
}

/** The lightness at which `chroma` and `hue` have luminance `Y`: contrast only sees luminance, so this keeps the default's contrast. */
function lightnessFor(Y, chroma, hue) {
  let lo = 0,
    hi = 1
  for (let k = 0; k < 24; k++) {
    const mid = (lo + hi) / 2
    if (luminance(toLinear({ L: mid, C: chroma, H: hue })) < Y) lo = mid
    else hi = mid
  }
  return Math.ceil(hi * 1000) / 1000
}

// The spec's lightnesses are tuned for the default hue, and equal lightness is not equal luminance: other hues land just
// outside the two tightest pairs (light sweep against the ink, dark accent text on its pressed fill). Those two tokens
// are relit to the default's luminance, keeping the hue and chroma. Accent text takes a 3% margin: at these hues the soft
// fill behind it is brighter too, and text only ever gets lighter.
function fitted(seed) {
  const sweep = lightnessFor(
    luminance(toLinear({ L: 0.515, C: 0.13, H: DEFAULT.hue })),
    Math.min(Math.max(seed.chroma * 1.25, 0.12), 0.13),
    seed.hue,
  )
  const text = lightnessFor(
    luminance(toLinear({ L: 0.8, C: DEFAULT.chroma, H: DEFAULT.hue })) * 1.03,
    seed.chroma,
    seed.hue,
  )
  return {
    '--warp-color-sweep': relit('--warp-color-sweep', 0.515, sweep),
    '--warp-color-accent-text': relit('--warp-color-accent-text', 0.8, Math.max(text, 0.8)),
  }
}

/** `declarations` plus whatever a custom seed needs to pass, or D010. A token set in the config beats a fitted one. */
function fitSeed(seed, declarations, dials) {
  try {
    checkSeed(seed, declarations, dials)
    return declarations
  } catch (error) {
    if (error.code !== 'D010') throw error
  }
  const fit = Object.entries(fitted(seed))
    .filter(([token]) => !declarations.includes(`${token}:`))
    .map(([k, v]) => `${k}:${v}`)
  const merged = [...fit, ...(declarations ? [declarations] : [])].join(';')
  checkSeed(seed, merged, dials)
  return merged
}

/** Every spec rule keyed on `key`, re-scoped to `scope`, inside its original layer. */
function rescoped(key, scope) {
  const files = [
    new URL('styles/warp.css', core),
    ...['inputs', 'components'].flatMap((dir) =>
      // Selective choice mirrors already occur in choice.css; defaults copy each rule once.
      readdirSync(new URL(`styles/${dir}/`, core))
        .filter((f) => !f.startsWith('choice-'))
        .map((f) => new URL(`styles/${dir}/${f}`, core)),
    ),
  ]
  let out = ''
  for (const file of files) {
    const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const stack = []
    let start = 0
    for (let i = 0; i < css.length; i++) {
      if (css[i] === '{') {
        stack.push({ prelude: css.slice(start, i).trim(), at: i })
        start = i + 1
      } else if (css[i] === '}') {
        const open = stack.pop()
        if (open && open.prelude.includes(key) && !open.prelude.startsWith('@')) {
          const layers = stack.map((s) => s.prelude).filter((p) => p.startsWith('@'))
          const rule = `${open.prelude.replaceAll(key, scope)}{${css.slice(open.at + 1, i).trim()}}`
          out += layers.reduceRight((inner, p) => `${p}{${inner}}`, rule) + '\n'
        }
        start = i + 1
      } else if (css[i] === ';' && !stack.length) start = i + 1
    }
  }
  return out
}

/**
 * For `site.head`: applies the dials `setDial(…, { persist: true })` kept, before the first paint, so a prerendered page
 * doesn't show the OS theme first.
 */
export const dialScript = `<script>try{Object.assign(document.documentElement.dataset,JSON.parse(localStorage.getItem('warp:dials')||'{}'))}catch(e){}</script>`

export const classicCss = () =>
  rescoped('[data-fields="classic"]', ':root:not([data-fields="floating"])')
export const dialCss = (dial, value) =>
  rescoped(`[data-${dial}="${value}"]`, `:root:not([data-${dial}])`)

/**
 * The app's colours for its generated share cards (`site.card`, research 20 §10): the page, text and accent tokens of
 * warp.css as sRGB, since a card is an image and has no stylesheet.
 */
function cardColors(seed, dials) {
  const color = (L, C, H) => hex(toLinear({ L, C, H }))
  const [h, c] = seed.neutral ? [seed.neutral.hue, seed.neutral.chroma] : [85, 0.012] // --warp-ref-neutral: warm paper and ink, or the seed's
  return {
    scheme: dials?.theme ?? 'dark',
    dark: {
      background: color(0.155, c, h),
      text: color(0.935, c, h),
      subtle: color(0.735, c, h),
      accent: color(0.76, seed.chroma * 1.15, seed.hue),
    },
    light: {
      background: color(0.972, c / 2, h),
      text: color(0.235, c, h),
      subtle: color(0.475, c, h),
      accent: color(0.5, Math.min(seed.chroma, 0.13), seed.hue),
    },
  }
}

const agents = `Import components from \`@weft-js/warp\`. Layout: \`Stack Row Grid Split Center Cover Frame Spacer Inset\` (\`gap\`: hair tight related group section page). No raw values (D001–D007); intent props only: \`tone\` (neutral accent positive caution critical info), \`emphasis\` (solid soft outline ghost frame link), \`size\` (sm md lg). The look comes from dials: \`data-expression|theme|density|motion|flair\` on any element (scopes nest). Fields take \`label\` (required), \`hint\`, \`error\`. App-wide: \`warp({ seed: { accent }, dials, radius, icons, fonts, tokens })\` (\`icons\` pins the icon tier); D010 fails a pair that can't pass. Theming: \`colors\` names colours (\`tone="brand"\`), \`system\` retunes scales, \`parts\` restyles an element per state (\`parts.button.hover.bg\`; \`weft docs theme\` lists parts), \`themes\` are named looks switched by \`data-palette\` or \`setPalette\`. Own CSS: never a bare \`[data-part]\`; hang it from its \`[data-scope]\`. A tall sticky header sets \`--warp-scroll-offset\`.`

const catalog = componentCatalog()

export const warp = definePlugin({
  name: '@weft-js/warp',
  version: '0.1.0',
  weft: '*',
  namespace: 'D',
  options,
  // A custom seed runs warp-core's contrast checker over a temporary copy of its stylesheet (checkSeed).
  permissions: {
    fs: { read: ['node_modules/@weft-js/warp-core/**'], write: ['$TMPDIR/warp-seed-*'] },
    spawn: ['node'],
  },
  contribute(o) {
    const seed = o.seed ?? DEFAULT
    const custom = seed.hue !== DEFAULT.hue || seed.chroma !== DEFAULT.chroma
    let declarations = overrides(o)
    if (custom) declarations = fitSeed(seed, declarations, o.dials) // throws { code: 'D010' }
    else if (declarations) checkSeed(seed, declarations, o.dials)
    const note = o.asked && landed(seed, declarations, o.asked)
    const theming = o.theme
      ? themed(o.theme, {
          context: themeContext(core),
          seed,
          dials: o.dials,
          checkSeed: fitSeed,
          declare: overrides,
        })
      : ''
    const tailwind = o.theme ? tailwindTheme(o.theme) : ''
    const dials = Object.entries(o.dials ?? {})
      .map(([dial, value]) => dialCss(dial, value))
      .join('')
    const css =
      (custom ? seedCss(seed) : '') +
      (o.fields === 'classic' ? classicCss() : '') +
      dials +
      overrideCss(declarations) +
      theming
    return {
      tokens: {
        namespace: 'warp',
        ...(css && { css: withRem(css) }),
        ...(tailwind && { cssEntries: { tailwind } }),
        values: {
          seed: { hue: seed.hue, chroma: seed.chroma },
          fields: o.fields ?? 'floating',
          ...(o.dials && { dials: o.dials }),
        },
      },
      agents: { title: 'warp (UI kit)', text: agents },
      ...(note && { notes: [note] }),
      card: cardColors(seed, o.dials),
      catalog,
      map: [
        {
          want: 'UI components',
          call: 'Import from `@weft-js/warp`; `weft plugins` has the catalog',
          have: `${catalog.length} components`,
        },
      ],
      diagnostics: [
        {
          code: 'D010',
          catches:
            'A token override, alone or with the seed, that leaves text, a control boundary or the focus ring below WCAG contrast at some dial stop',
          fix: 'Change the token or seed; the message lists each failing pair',
          severity: 'error',
        },
      ],
    }
  },
})

export default warp
