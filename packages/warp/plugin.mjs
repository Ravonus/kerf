// warp() for weft.config.ts: warp's config, tokens, catalog and AGENTS section (PLAN §7c, research 13 §2.13).
// Components stay ordinary imports; this only contributes data.
//
// - seed: the brand accent. The spec tokens (ui-core/styles/warp.css) derive every colour from
//   --warp-seed-accent-h/-c, so a seed is those two values. It is checked with the spec's own contrast checker
//   (ui-core/scripts/contrast-check.mjs: every sys pair, both themes, every dial stop). A hue that fails is fitted (see
//   fitted()), so every hue passes; what can still fail is a token override, which is D010.
// - fields: 'classic' makes classic fields the default with no attribute in the app: the spec's classic rules
//   (keyed on [data-fields="classic"]) are copied, re-scoped to :root unless an ancestor says data-fields="floating".
// - dials: the app's default expression, density, flair and theme, the same way. Markup still wins: a data-* on <html>
//   turns the default off, and any element can set its own scope.
// - radius, fonts, tokens: spec tokens set once for every scope. Each one goes through the contrast check with the seed.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { definePlugin } from 'weft/plugin'
import { fromHex, luminance, toLinear } from './tokens/color.mjs'

const core = new URL('../ui-core/', import.meta.url)
const DEFAULT = { hue: 152, chroma: 0.115 }
const DIALS = { expression: ['quiet', 'balanced', 'vivid'], density: ['compact', 'cozy', 'comfortable'], flair: ['sweep', 'none'], theme: ['light', 'dark'] }
const RADII = { sharp: [2, 2, 2], soft: [8, 12, 4], round: [14, 20, 6] }
const FONTS = { body: ['sans', 'ui-sans-serif, system-ui, sans-serif'], display: ['display', 'ui-sans-serif, system-ui, sans-serif'], mono: ['mono', 'ui-monospace, monospace'] }
// The spec's scope roots (warp.css §2): every one recomputes the sys tokens, so an override has to land on each.
const SCOPES = ':root,[data-expression],[data-density],[data-form],[data-pointer],[data-motion],[data-flair],[data-warp]'
const safe = value => typeof value === 'string' && value !== '' && !/[;{}<]/.test(value)
const bad = (path, message) => Object.assign(new Error(message), { path })

function normalizeSeed(seed) {
  if (seed && typeof seed.accent === 'string') {
    if (!/^#[0-9a-f]{6}$/i.test(seed.accent)) throw new Error('accent must be #rrggbb')
    const { C, H } = fromHex(seed.accent)
    return { hue: Math.round(H * 10) / 10, chroma: Math.round(C * 1000) / 1000 }
  }
  const { hue, chroma } = seed ?? {}
  if (!(hue >= 0 && hue < 360) || !(chroma >= 0 && chroma <= 0.37)) throw new Error('seed is { hue: 0–360, chroma: 0–0.37 } or { accent: "#rrggbb" }') // weft reports it as P115
  return { hue, chroma }
}

function options(input) {
  const out = {}
  for (const key of Object.keys(input)) if (!['seed', 'fields', 'dials', 'radius', 'fonts', 'tokens'].includes(key)) throw Object.assign(new Error(`unknown option \`${key}\``), { path: key })
  if (input.fields !== undefined && input.fields !== 'floating' && input.fields !== 'classic') throw Object.assign(new Error(`must be 'floating' or 'classic'`), { path: 'fields' })
  if (input.seed !== undefined) {
    try {
      out.seed = normalizeSeed(input.seed)
    } catch (error) {
      throw Object.assign(error, { path: 'seed' })
    }
  }
  if (input.fields) out.fields = input.fields
  for (const [dial, value] of Object.entries(input.dials ?? {})) {
    if (!DIALS[dial]) throw bad(`dials.${dial}`, `unknown dial; use ${Object.keys(DIALS).join(', ')}`)
    if (!DIALS[dial].includes(value)) throw bad(`dials.${dial}`, `must be one of ${DIALS[dial].join(', ')}`)
  }
  if (input.dials) out.dials = input.dials
  if (input.radius !== undefined) {
    if (!RADII[input.radius]) throw bad('radius', `must be one of ${Object.keys(RADII).join(', ')}`)
    out.radius = input.radius
  }
  for (const [font, value] of Object.entries(input.fonts ?? {})) {
    if (!FONTS[font]) throw bad(`fonts.${font}`, `unknown font; use ${Object.keys(FONTS).join(', ')}`)
    if (!safe(value)) throw bad(`fonts.${font}`, 'must be a font family or a CSS font stack')
  }
  if (input.fonts) out.fonts = input.fonts
  for (const [token, value] of Object.entries(input.tokens ?? {})) {
    if (!/^--warp-[a-z0-9-]+$/.test(token)) throw bad(`tokens.${token}`, 'must be a warp token, like --warp-color-page')
    if (!safe(value)) throw bad(`tokens.${token}`, 'must be a CSS value')
    if (token.startsWith('--warp-color-') && !/^(#[0-9a-f]{6}|(oklch|color-mix|light-dark)\(.+\))$/i.test(value)) throw bad(`tokens.${token}`, 'must be #rrggbb or oklch(), so the contrast check can read it')
  }
  if (input.tokens) out.tokens = input.tokens
  return out
}

const fontStack = (value, fallback) => (value.includes(',') ? value : `${JSON.stringify(value)}, ${fallback}`)

/** The radius, fonts and tokens as declarations, or '' with none set. */
function overrides({ radius, fonts = {}, tokens = {} }) {
  const out = {}
  if (radius) [out['--warp-radius-control'], out['--warp-radius-surface'], out['--warp-radius-mark']] = RADII[radius].map(px => `${px}px`)
  for (const [font, value] of Object.entries(fonts)) out[`--warp-font-${FONTS[font][0]}`] = fontStack(value, FONTS[font][1])
  Object.assign(out, tokens)
  return Object.entries(out).map(([k, v]) => `${k}:${v}`).join(';')
}

// In warp.base, a later layer than warp.tokens, so a token set here beats every dial stop and every copied default.
const overrideCss = declarations => (declarations ? `@layer warp.base{${SCOPES}{${declarations}}}\n` : '')

const seedCss = s => `@layer warp.tokens{:root{--warp-seed-accent-h:${s.hue};--warp-seed-accent-c:${s.chroma}}}\n`

/** Run the spec checker on warp.css with the seed and any token overrides applied; D010 with every failing pair. */
export function checkSeed(seed, declarations = '') {
  const dir = mkdtempSync(join(tmpdir(), 'warp-seed-'))
  try {
    const css = join(dir, 'warp.css')
    writeFileSync(css, readFileSync(new URL('styles/warp.css', core), 'utf8') + `\n:root{--warp-seed-accent-h:${seed.hue};--warp-seed-accent-c:${seed.chroma}}\n${declarations && `${SCOPES}{${declarations}}\n`}`)
    let out
    try {
      out = execFileSync(process.execPath, [new URL('scripts/contrast-check.mjs', core).pathname, css, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (e) {
      out = e.stdout // exit 1 on failures; the JSON is still on stdout
    }
    const { results } = JSON.parse(out)
    const failures = results.filter(r => !r.pass).map(r => `${r.combo}: ${r.fg} on ${r.bg} is ${r.ratio.toFixed(2)}:1, needs ${r.min}:1`)
    if (failures.length) throw Object.assign(new Error(`warp colours fail contrast (${failures.length} pairs): ${failures.slice(0, 5).join('; ')}${failures.length > 5 ? '; …' : ''}`), { code: 'D010', failures })
    return results.length
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// A token's value in the spec, with `from` (its lightness for one theme) replaced by `to`.
function relit(token, from, to) {
  const value = readFileSync(new URL('styles/warp.css', core), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').match(new RegExp(`${token}:\\s*([^;]+);`))[1]
  return value.replace(/\s+/g, ' ').replace(`oklch(${from} `, `oklch(${to} `)
}

/** The lightness at which `chroma` and `hue` have luminance `Y`: contrast only sees luminance, so this keeps the default's contrast. */
function lightnessFor(Y, chroma, hue) {
  let lo = 0, hi = 1
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
  const sweep = lightnessFor(luminance(toLinear({ L: 0.515, C: 0.13, H: DEFAULT.hue })), Math.min(Math.max(seed.chroma * 1.25, 0.12), 0.13), seed.hue)
  const text = lightnessFor(luminance(toLinear({ L: 0.8, C: DEFAULT.chroma, H: DEFAULT.hue })) * 1.03, seed.chroma, seed.hue)
  return { '--warp-color-sweep': relit('--warp-color-sweep', 0.515, sweep), '--warp-color-accent-text': relit('--warp-color-accent-text', 0.8, Math.max(text, 0.8)) }
}

/** `declarations` plus whatever a custom seed needs to pass, or D010. A token set in the config beats a fitted one. */
function fitSeed(seed, declarations) {
  try {
    checkSeed(seed, declarations)
    return declarations
  } catch (error) {
    if (error.code !== 'D010') throw error
  }
  const fit = Object.entries(fitted(seed)).filter(([token]) => !declarations.includes(`${token}:`)).map(([k, v]) => `${k}:${v}`)
  const merged = [...fit, ...(declarations ? [declarations] : [])].join(';')
  checkSeed(seed, merged)
  return merged
}

/** Every spec rule keyed on `key`, re-scoped to `scope`, inside its original layer. */
function rescoped(key, scope) {
  const files = [new URL('styles/warp.css', core), ...['inputs', 'components'].flatMap(dir => readdirSync(new URL(`styles/${dir}/`, core)).map(f => new URL(`styles/${dir}/${f}`, core)))]
  let out = ''
  for (const file of files) {
    const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const stack = []
    let start = 0
    for (let i = 0; i < css.length; i++) {
      if (css[i] === '{') { stack.push({ prelude: css.slice(start, i).trim(), at: i }); start = i + 1 }
      else if (css[i] === '}') {
        const open = stack.pop()
        if (open && open.prelude.includes(key) && !open.prelude.startsWith('@')) {
          const layers = stack.map(s => s.prelude).filter(p => p.startsWith('@'))
          const rule = `${open.prelude.replaceAll(key, scope)}{${css.slice(open.at + 1, i).trim()}}`
          out += layers.reduceRight((inner, p) => `${p}{${inner}}`, rule) + '\n'
        }
        start = i + 1
      } else if (css[i] === ';' && !stack.length) start = i + 1
    }
  }
  return out
}

export const classicCss = () => rescoped('[data-fields="classic"]', ':root:not([data-fields="floating"])')
export const dialCss = (dial, value) => rescoped(`[data-${dial}="${value}"]`, `:root:not([data-${dial}])`)

const agents = `Import components from \`@weft/warp\`; each brings its own CSS (the spec's, split per component). Intent props only: \`tone\` (neutral accent positive caution critical info), \`emphasis\` (solid soft outline ghost frame link), \`size\` (sm md lg). No style props: the look comes from the dials, \`data-expression="quiet|balanced|vivid"\`, \`data-theme\`, \`data-density\`, \`data-motion\`, \`data-flair\` on any element (scopes nest; \`setDial()\` from \`@weft/ui-core\` writes them). Fields take \`label\` (required: it is the accessible name), \`hint\`, \`error\`, native \`value\`/\`onInput\`; \`variant="classic"\` puts the label above. \`Modal\`/\`Drawer\` take \`open\` as a box. One solid Button per region. App-wide look: \`warp({ seed: { accent: '#0a7d4f' }, dials, radius, fonts, tokens })\`; the spec contrast check runs at every stop and \`weft check\` fails with D010 if any pair can't pass.`

const catalog = [
  ['Button', 'Native button: tone, emphasis (solid soft outline ghost frame link), size, loading, icon-only'],
  ['Toggle', 'Button with aria-pressed'],
  ['Input', 'Text field: floating border label (or classic), hint, error, prefix, suffix, clear'],
  ['Search', 'Search field with icon and clear'],
  ['Textarea', 'Multi-line field that grows 3 to 10 lines; Cmd/Ctrl+Enter submits'],
  ['Select', 'Native select in the field shell'],
  ['Checkbox', 'Native checkbox; indeterminate'],
  ['Switch', 'Checkbox with role switch; the rail fills with the sweep'],
  ['Segmented', 'Radio group with a sliding face'],
  ['Chip', 'Filter chip (aria-pressed)'],
  ['Tabs', 'Tablist (line, pill, enclosed) with panels'],
  ['Card', 'Surface: eyebrow, title, body; interactive cards sweep'],
  ['Badge', 'Status or count; status dot'],
  ['Tag', 'User label, removable'],
  ['Kbd', 'One keyboard key'],
  ['Alert', 'Inline message with icon, title, description, actions'],
  ['Progress', 'Linear or circular progress; indeterminate'],
  ['Spinner', 'Busy indicator'],
  ['Skeleton', 'Loading placeholder: text, circle, block'],
  ['Tooltip', 'Hint on hover and keyboard focus (never essential)'],
  ['Popover', 'Button that opens a non-modal dialog panel'],
  ['Modal', 'Native modal dialog; alert dialog'],
  ['Drawer', 'Sheet: side on wide screens, bottom on phones'],
  ['Toaster', 'Toast region; toast.show() from anywhere'],
].map(([name, summary]) => ({ name, import: '@weft/warp', summary }))

export const warp = definePlugin({
  name: '@weft/warp',
  version: '0.0.0',
  weft: '*',
  namespace: 'D',
  options,
  permissions: {},
  contribute(o) {
    const seed = o.seed ?? DEFAULT
    const custom = seed.hue !== DEFAULT.hue || seed.chroma !== DEFAULT.chroma
    let declarations = overrides(o)
    if (custom) declarations = fitSeed(seed, declarations) // throws { code: 'D010' }
    else if (declarations) checkSeed(seed, declarations)
    const dials = Object.entries(o.dials ?? {}).map(([dial, value]) => dialCss(dial, value)).join('')
    const css = (custom ? seedCss(seed) : '') + (o.fields === 'classic' ? classicCss() : '') + dials + overrideCss(declarations)
    return {
      tokens: { namespace: 'warp', ...(css && { css }), values: { seed, fields: o.fields ?? 'floating', ...(o.dials && { dials: o.dials }) } },
      agents: { title: 'warp (UI kit)', text: agents },
      catalog,
      map: [{ want: 'UI components', call: 'Import from `@weft/warp`; `weft plugins` has the catalog', have: `${catalog.length} components` }],
      diagnostics: [
        { code: 'D010', catches: 'A token override, alone or with the seed, that leaves text, a control boundary or the focus ring below WCAG contrast at some dial stop', fix: 'Change the token or seed; the message lists each failing pair', severity: 'error' },
      ],
    }
  },
})

export default warp
