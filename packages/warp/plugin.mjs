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
import { componentCatalog } from './src/plugin/catalog.mjs'
import { dtcgTokens } from './src/plugin/dtcg.mjs'
import { DEFAULT, RADII, FONTS, options } from './src/plugin/themes-options.mjs'
import { buttonPairs } from './src/plugin/themes-contrast.mjs'
import { tailwindTheme } from './src/plugin/tailwind.mjs'
import { paletteCss } from './src/plugin/themes-palettes.mjs'
import { namedToneCss } from './src/plugin/themes-tones.mjs'
import { themeAliases } from './src/plugin/themes-aliases.mjs'

const core = new URL('../warp-core/', import.meta.url)
// The spec's scope roots (warp.css §2): every one recomputes the sys tokens, so an override has to land on each.
const SCOPES =
  ':root,[data-expression],[data-density],[data-form],[data-pointer],[data-motion],[data-flair],[data-theme],[data-warp]'
const fontStack = (value, fallback) =>
  value.includes(',') ? value : `${JSON.stringify(value)}, ${fallback}`

/** The radius, fonts and tokens as declarations, or '' with none set. */
function overrides({ seed, radius, fonts = {}, tokens = {} }) {
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
  for (const [font, value] of Object.entries(fonts))
    out[`--warp-font-${FONTS[font][0]}`] = fontStack(value, FONTS[font][1])
  Object.assign(out, tokens)
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

// Check configured frame text and visible sweep boundaries before admitting overrides.
function checkButtonCandidate(button, resolved, tokens = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'warp-seed-'))
  try {
    const file = join(dir, 'theme-pairs.json')
    const pairs = buttonPairs(button, resolved, tokens)
    writeFileSync(file, JSON.stringify(pairs))
    let output
    try {
      output = execFileSync(
        process.execPath,
        [
          fileURLToPath(new URL('scripts/contrast-check.mjs', core)),
          fileURLToPath(new URL('styles/warp.css', core)),
          '--json',
          `--theme-pairs=${file}`,
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      )
    } catch (error) {
      if (!error.stdout) throw error
      output = error.stdout
    }
    const failures = JSON.parse(output).results.filter((row) => !row.pass)
    if (failures.length) {
      const path = failures[0].path ?? 'parts.button.text'
      throw Object.assign(
        new Error(
          `D010 ${path}: ${failures
            .map(
              (row) =>
                `${row.combo} ${row.fg} on ${row.bg} is ${row.ratio.toFixed(2)}:1, needs ${row.min}:1`,
            )
            .join('; ')}`,
        ),
        { code: 'D010', path, failures },
      )
    }
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
export const dialScript = `<script>try{const d=JSON.parse(localStorage.getItem('warp:dials')||'{}'),r=document.documentElement.dataset,v={expression:['quiet','balanced','vivid'],fields:['floating','classic'],theme:['auto','light','dark'],density:['compact','cozy','comfortable'],motion:['auto','full','reduce'],flair:['auto','sweep','none']};for(const k of [...Object.keys(v),'palette']){const x=d?.[k];if(typeof x!=='string'||!(k==='palette'?/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(x):v[k].includes(x)))continue;if(x==='auto'&&['theme','motion','flair','palette'].includes(k))delete r[k];else r[k]=x}}catch(e){}</script>`

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

const agents = `Import components from \`@weft-js/warp\`. Layout: \`Stack Row Grid Split Center Cover Frame Spacer Inset\` (\`gap\`: hair tight related group section page). No raw values (D001–D007); intent props only: \`tone\` (neutral accent positive caution critical info), \`emphasis\` (solid soft outline ghost frame link), \`size\` (sm md lg). The look comes from dials: \`data-expression|theme|density|motion|flair\` on any element (scopes nest). Fields take \`label\` (required), \`hint\`, \`error\`. App-wide: \`warp({ seed: { accent }, dials, radius, fonts, tokens })\`; D010 fails a pair that can't pass.`

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
  contribute(o, env) {
    const seed = o.seed ?? DEFAULT
    const custom = seed.hue !== DEFAULT.hue || seed.chroma !== DEFAULT.chroma
    let declarations = overrides(o)
    if (custom) declarations = fitSeed(seed, declarations, o.dials)
    else if (declarations) checkSeed(seed, declarations, o.dials)
    if (o.buttonCandidate) {
      checkButtonCandidate(o.buttonCandidate, contrast(seed, declarations).resolved, o.tokens)
      declarations += `${declarations ? ';' : ''}--warp-config-part-button-bg:${o.buttonCandidate.bg};--warp-config-part-button-text:${o.buttonCandidate.text}`
    }
    const note = o.asked && landed(seed, declarations, o.asked)
    const dials = Object.entries(o.dials ?? {})
      .filter(([dial]) => dial !== 'palette')
      .map(([dial, value]) => dialCss(dial, value))
      .join('')
    const css =
      (custom ? seedCss(seed) : '') +
      (o.fields === 'classic' ? classicCss() : '') +
      dials +
      overrideCss(declarations) +
      (o.palettes ? paletteCss(o.palettes) : '') +
      (o.namedColors
        ? namedToneCss(o, {
            overrides,
            fitSeed,
            checkButtonCandidate,
            contrast,
            source: () => readFileSync(new URL('styles/warp.css', core), 'utf8'),
          })
        : '') +
      (o.namedColors && !o.palettes
        ? `@layer warp.tokens{:root{${Object.entries(o.namedColors)
            .map(([name, value]) => `--warp-named-${name}:${value}`)
            .join(';')}}}\n`
        : '')
    return {
      tokens: {
        namespace: 'warp',
        ...(css && { css }),
        ...(o.namedColors && {
          cssEntries: { tailwind: tailwindTheme({ colors: o.namedColors }) },
        }),
        ...((o.namedColors || o.buttonCandidate) && { alias: themeAliases(o, env, core) }),
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
