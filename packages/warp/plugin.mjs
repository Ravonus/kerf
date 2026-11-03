// warp() for weft.config.ts: warp's config, tokens, catalog and AGENTS section (PLAN §7c, research 13 §2.13).
// Components stay ordinary imports; this only contributes data.
//
// - seed: the brand's hue family, and optionally the neutral's. The spec tokens (warp-core/styles/warp.css) derive every colour from
//   --warp-seed-accent-h/-c, so a seed is those two values. It is checked with the spec's own contrast checker
//   (warp-core/scripts/contrast-check.mjs: every sys pair, both themes, every dial stop). A hue that fails is fitted (see
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
import { fileURLToPath } from 'node:url'
import { definePlugin } from '@weft-js/core/plugin'
import { fromHex, hex, luminance, toLinear } from './tokens/color.mjs'

const core = new URL('../warp-core/', import.meta.url)
const DEFAULT = { hue: 152, chroma: 0.115 }
const DIALS = { expression: ['quiet', 'balanced', 'vivid'], density: ['compact', 'cozy', 'comfortable'], flair: ['sweep', 'none'], theme: ['light', 'dark'] }
const RADII = { sharp: [2, 2, 2], soft: [8, 12, 4], round: [14, 20, 6] }
const FONTS = { body: ['sans', 'ui-sans-serif, system-ui, sans-serif'], display: ['display', 'ui-sans-serif, system-ui, sans-serif'], mono: ['mono', 'ui-monospace, monospace'] }
// The spec's scope roots (warp.css §2): every one recomputes the sys tokens, so an override has to land on each.
const SCOPES = ':root,[data-expression],[data-density],[data-form],[data-pointer],[data-motion],[data-flair],[data-warp]'
const safe = value => typeof value === 'string' && value !== '' && !/[;{}<]/.test(value)
const bad = (path, message) => Object.assign(new Error(message), { path })

function hueOf(value, name) {
  if (typeof value === 'string') {
    if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${name} must be #rrggbb`)
    const { C, H } = fromHex(value)
    return { hue: Math.round(H * 10) / 10, chroma: Math.round(C * 1000) / 1000 }
  }
  const { hue, chroma } = value ?? {}
  if (!(hue >= 0 && hue < 360) || !(chroma >= 0 && chroma <= 0.37)) throw new Error(`${name === 'accent' ? 'seed' : name} is { hue: 0–360, chroma: 0–0.37 } or ${name === 'accent' ? '{ accent: "#rrggbb" }' : '"#rrggbb"'}`) // weft reports it as P115
  return { hue, chroma }
}

function normalizeSeed(seed) {
  const { accent, neutral, ...rest } = seed ?? {}
  const out = hueOf(accent ?? (Object.keys(rest).length || neutral === undefined ? rest : DEFAULT), 'accent')
  return neutral === undefined ? out : { ...out, neutral: hueOf(neutral, 'neutral') }
}

function options(input) {
  const out = {}
  for (const key of Object.keys(input)) if (!['seed', 'fields', 'dials', 'radius', 'fonts', 'tokens'].includes(key)) throw Object.assign(new Error(`unknown option \`${key}\``), { path: key })
  if (input.fields !== undefined && input.fields !== 'floating' && input.fields !== 'classic') throw Object.assign(new Error(`must be 'floating' or 'classic'`), { path: 'fields' })
  if (input.seed !== undefined) {
    try {
      out.seed = normalizeSeed(input.seed)
      if (input.seed?.accent) out.asked = input.seed.accent.toLowerCase()
    } catch (error) {
      throw Object.assign(/** @type {Error} */ (error), { path: 'seed' })
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
function overrides({ seed, radius, fonts = {}, tokens = {} }) {
  const out = {}
  // The neutral's refs are redeclared at each expression stop, so it lands on every scope, as a token does.
  if (seed?.neutral) Object.assign(out, { '--warp-ref-neutral-h': seed.neutral.hue, '--warp-ref-neutral-c': seed.neutral.chroma })
  if (radius) [out['--warp-radius-control'], out['--warp-radius-surface'], out['--warp-radius-mark']] = RADII[radius].map(px => `${px}px`)
  for (const [font, value] of Object.entries(fonts)) out[`--warp-font-${FONTS[font][0]}`] = fontStack(value, FONTS[font][1])
  Object.assign(out, tokens)
  return Object.entries(out).map(([k, v]) => `${k}:${v}`).join(';')
}

// In warp.base, a later layer than warp.tokens, so a token set here beats every dial stop and every copied default.
const overrideCss = declarations => (declarations ? `@layer warp.base{${SCOPES}{${declarations}}}\n` : '')

const seedCss = s => `@layer warp.tokens{:root{--warp-seed-accent-h:${s.hue};--warp-seed-accent-c:${s.chroma}}}\n`

/** The spec checker's report on warp.css with the seed and any token overrides applied. */
function contrast(seed, declarations) {
  const dir = mkdtempSync(join(tmpdir(), 'warp-seed-'))
  try {
    const css = join(dir, 'warp.css')
    writeFileSync(css, readFileSync(new URL('styles/warp.css', core), 'utf8') + `\n:root{--warp-seed-accent-h:${seed.hue};--warp-seed-accent-c:${seed.chroma}}\n${declarations && `${SCOPES}{${declarations}}\n`}`)
    let out
    try {
      out = execFileSync(process.execPath, [fileURLToPath(new URL('scripts/contrast-check.mjs', core)), css, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (e) {
      out = e.stdout // exit 1 on failures; the JSON is still on stdout
    }
    return JSON.parse(out)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** The theme and expression stops an app's `dials` can render by default. Markup that sets another stop is the app's to check. */
const renders = (dials = {}) => r => (!dials.theme || r.theme === dials.theme) && (!dials.expression || r.expression === dials.expression)

/** D010 with every failing pair, at the stops `dials` leave. Returns how many pairs passed. */
export function checkSeed(seed, declarations = '', dials) {
  const results = contrast(seed, declarations).results.filter(renders(dials))
  const failed = results.filter(r => !r.pass)
  const failures = failed.map(r => `${r.combo}: ${r.fg} on ${r.bg} is ${r.ratio.toFixed(2)}:1, needs ${r.min}:1`)
  if (failures.length) throw Object.assign(new Error(`warp colours fail contrast (${failures.length} pairs): ${failures.slice(0, 5).join('; ')}${failures.length > 5 ? '; …' : ''}`), { code: 'D010', failures, help: 'Change the seed or token named in each pair, or limit the stops with `dials`. `weft docs theme` has worked looks.' })
  return results.length
}

/** Where a seed's accent lands: a seed sets the hue family, and each theme solves its own lightness for contrast. */
function landed(seed, declarations, asked) {
  const { resolved } = contrast(seed, declarations)
  const light = resolved['light/balanced']?.['accent-solid'], dark = resolved['dark/balanced']?.['accent-solid']
  return light === asked && dark === asked ? undefined : `warp: accent ${asked} landed as ${light} light, ${dark} dark. A seed sets the hue family; pin an exact brand with \`--warp-color-accent-solid\` (\`weft docs theme\`).`
}

/** The resolved tokens as DTCG 2025.10: one token file per theme × expression and a resolver over them. `css`: the app's seed and overrides. */
export function dtcg(css = '') {
  const dir = mkdtempSync(join(tmpdir(), 'warp-seed-'))
  let resolved
  try {
    const file = join(dir, 'warp.css')
    writeFileSync(file, readFileSync(new URL('styles/warp.css', core), 'utf8') + `\n${css.replace(/@layer warp\.\w+\{([\s\S]*)\}\n?$/gm, '$1')}\n`)
    let out
    try {
      out = execFileSync(process.execPath, [fileURLToPath(new URL('scripts/contrast-check.mjs', core)), file, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (e) {
      out = e.stdout
    }
    resolved = JSON.parse(out).resolved
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  const px = value => ({ $value: { value, unit: 'px' } })
  const SPACE = { hair: 2, tight: 4, related: 8, group: 16 }
  const X = { quiet: 0, balanced: 0.5, vivid: 1 }
  const files = {}
  for (const [combo, colours] of Object.entries(resolved)) {
    const [theme, expression] = combo.split('/')
    const x = X[expression]
    const color = Object.fromEntries(Object.entries(colours).filter(([, v]) => /^#[0-9a-f]{6}$/i.test(v)).map(([name, code]) => [name, { $value: { colorSpace: 'srgb', components: [1, 3, 5].map(i => parseInt(code.slice(i, i + 2), 16) / 255), hex: code } }]))
    files[`warp.${theme}.${expression}.tokens.json`] = {
      color: { $type: 'color', ...color },
      space: { $type: 'dimension', ...Object.fromEntries(Object.entries(SPACE).map(([k, v]) => [k, px(v)])) },
      radius: { $type: 'dimension', mark: px(Math.round(4 - 2 * x)), control: px(Math.round(8 - 6 * x)), surface: px(Math.round(12 - 10 * x)) },
    }
  }
  // Each file is whole, so one modifier picks one file: the dials don't layer in DTCG terms.
  const contexts = Object.fromEntries(Object.keys(files).map(f => [f.split('.').slice(1, 3).join('-'), [{ $ref: f }]]))
  files['warp.resolver.json'] = { name: 'warp', version: '2025.10', modifiers: { mode: { contexts, default: 'light-balanced' } }, resolutionOrder: [{ $ref: '#/modifiers/mode' }] }
  return files
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
function fitSeed(seed, declarations, dials) {
  try {
    checkSeed(seed, declarations, dials)
    return declarations
  } catch (error) {
    if (error.code !== 'D010') throw error
  }
  const fit = Object.entries(fitted(seed)).filter(([token]) => !declarations.includes(`${token}:`)).map(([k, v]) => `${k}:${v}`)
  const merged = [...fit, ...(declarations ? [declarations] : [])].join(';')
  checkSeed(seed, merged, dials)
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

/**
 * For `site.head`: applies the dials `setDial(…, { persist: true })` kept, before the first paint, so a prerendered page
 * doesn't show the OS theme first.
 */
export const dialScript = `<script>try{Object.assign(document.documentElement.dataset,JSON.parse(localStorage.getItem('warp:dials')||'{}'))}catch(e){}</script>`

export const classicCss = () => rescoped('[data-fields="classic"]', ':root:not([data-fields="floating"])')
export const dialCss = (dial, value) => rescoped(`[data-${dial}="${value}"]`, `:root:not([data-${dial}])`)

/**
 * The app's colours for its generated share cards (`site.card`, research 20 §10): the page, text and accent tokens of
 * warp.css as sRGB, since a card is an image and has no stylesheet.
 */
function cardColors(seed, dials) {
  const color = (L, C, H) => hex(toLinear({ L, C, H }))
  const [h, c] = seed.neutral ? [seed.neutral.hue, seed.neutral.chroma] : [85, 0.012] // --warp-ref-neutral: warm paper and ink, or the seed's
  return {
    scheme: dials?.theme ?? 'dark',
    dark: { background: color(0.155, c, h), text: color(0.935, c, h), subtle: color(0.735, c, h), accent: color(0.76, seed.chroma * 1.15, seed.hue) },
    light: { background: color(0.972, c / 2, h), text: color(0.235, c, h), subtle: color(0.475, c, h), accent: color(0.5, Math.min(seed.chroma, 0.13), seed.hue) },
  }
}

const agents = `Import components from \`@weft-js/warp\`; each brings its own CSS (the spec's, split per component). Layout: \`Stack Row Grid Split Center Cover Frame Spacer Inset\` (\`gap\`: hair tight related group section page; \`as\`: the element). Text: \`Heading\` (\`level\`, \`role\`), \`Text\` (\`role\`, \`tone\`, \`subtle\`). No raw values (D001–D007). Intent props only: \`tone\` (neutral accent positive caution critical info), \`emphasis\` (solid soft outline ghost frame link), \`size\` (sm md lg). No style props: the look comes from the dials, \`data-expression="quiet|balanced|vivid"\`, \`data-theme\`, \`data-density\`, \`data-motion\`, \`data-flair\` on any element (scopes nest; \`setDial()\` from \`@weft-js/warp-core\` writes them). Fields take \`label\` (required), \`hint\`, \`error\`, native \`value\`/\`onInput\`; \`variant="classic"\` puts the label above. \`Modal\`/\`Drawer\` take \`open\` as a box. App-wide look: \`warp({ seed: { accent: '#0a7d4f' }, dials, radius, fonts, tokens })\`; \`weft check\` fails with D010 if any pair can't pass.`

const catalog = [
  ['Stack', 'Vertical flow; `gap` is the relationship'],
  ['Row', 'Horizontal cluster that wraps; `justify`, `reflow` to stack below a step'],
  ['Grid', 'Intrinsic columns by `min`, capped by `cols`'],
  ['Split', 'Fixed side and fluid main, stacked below its step'],
  ['Center', 'Measured column, centred; `max`, `gutter`'],
  ['Cover', 'Fills the screen with one centred child (auth, errors)'],
  ['Frame', 'Fixed-ratio media box'],
  ['Spacer', 'Takes the free space in a Row or Stack'],
  ['Inset', 'Sunken padded region'],
  ['Heading', 'Real heading: `level` is the outline and picks the look; `role` overrides it'],
  ['Text', 'Text in a role: `role`, `tone`, `subtle`, `faint`'],
  ['Link', 'A link: `href`, `subtle`, `external`; a bare `<a>` still gets warp\'s colour'],
  ['VirtualList', 'A long list with exact text heights: rows render only in view'],
  ['Thread', 'A chat log on a window: stick to end, older messages, unread divider'],
  ['Feed', 'APG feed on a window with Page Up/Down between articles'],
  ['Kanban', 'A board whose columns are windows; drag, menu and Alt + arrows'],
  ['ScrollGrid', 'Read-only two-axis grid, both axes virtual, wrapped columns optional'],
  ['DateField', 'Typed date segments with a calendar; ISO value'],
  ['DateRangeField', 'Two date segments, range calendar, presets, compare'],
  ['TimeField', 'Typed time with a slot list or wheels'],
  ['DateTimeField', 'Date and time in one field; value is a plain date-time'],
  ['InlineCalendar', 'The calendar grid in the page: single, multiple, range'],
  ['MonthPicker', 'Month grid in a field'],
  ['WeekPicker', 'Week selection with week numbers'],
  ['PeriodPicker', 'Year, quarter, month or week in one trigger'],
  ['TimeZoneSelect', 'Searchable IANA zones with offsets'],
  ['CountrySelect', 'Searchable countries, names from Intl'],
  ['LanguageSelect', 'Searchable languages with endonyms'],
  ['CurrencySelect', 'Searchable currencies with symbols'],
  ['PhoneField', 'Country button and tel input; E.164 value'],
  ['DurationField', 'Spinbuttons per unit; ISO duration, balanced'],
  ['RecurrenceField', 'RRULE builder in plain language with next dates'],
  ['PlaceLookupInput', 'Place combobox over your search()'],
  ['AddressField', 'Country-first address, optional provider, manual fallback'],
  ['PaymentCardInput', "Field shell around the provider's hosted card field"],
  ['CardNumberText', 'Saved card display'],
  ['SignaturePad', 'Draw or type a signature'],
  ['Button', 'Native button: tone, emphasis (solid soft outline ghost frame link), size, loading, icon-only; `collapse` shows only the icon on a phone or tablet and keeps the text as its name'],
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
  ['Table', 'Data table: sort, filter, Columns, resize, pin, selection, bulk bar, details, inline edit, live cells, phone cards'],
  ['LineChart', 'Line or area chart: multi-series, crosshair, annotations, reference lines, live tween'],
  ['BarChart', 'Bars: grouped, stacked or percent (`layout`)'],
  ['ComboChart', 'Bars plus a moving average on one axis'],
  ['DonutChart', 'Donut or `pie`, centre readout'],
  ['RadialChart', '270° radial bars'],
  ['FunnelChart', 'Step bars with % of previous'],
  ['ScatterChart', 'Points, shape per group'],
  ['BubbleChart', 'Points sized by value'],
  ['Histogram', 'Bins with p50 and p95'],
  ['HeatGrid', 'Week by day heatmap; calendar at 52 weeks'],
  ['RadarChart', 'Polygons on up to 3 series'],
  ['Treemap', 'Squarified areas'],
  ['Sunburst', 'Two-ring part to whole'],
  ['SankeyChart', 'Flows between columns'],
  ['CandlestickChart', 'Candles or `variant="ohlc"`'],
  ['BoxPlot', 'Quartiles, whiskers, outliers'],
  ['WaterfallChart', 'Bridge with totals'],
  ['StreamChart', 'Rolling window on a fixed domain, Pause'],
  ['BrushChart', 'Overview and brush window'],
  ['TileMap', 'Tile-grid choropleth'],
  ['GaugeChart', 'Banded gauge with a needle'],
  ['Sparkline', 'Inline trend, aria-hidden inside a labelled parent'],
  ['Shell', 'App shell: bottom bar, rail or sidebar by its own width; header, account menu, More sheet, focus variant'],
  ['SideNav', 'Docs sidebar: a left panel of folding sections, remembered; a collapse bar at its edge folds it when docked and opens it over the page on phones; filter'],
].map(([name, summary]) => ({ name, import: '@weft-js/warp', summary }))

export const warp = definePlugin({
  name: '@weft-js/warp',
  version: '0.1.0',
  weft: '*',
  namespace: 'D',
  options,
  // A custom seed runs warp-core's contrast checker over a temporary copy of its stylesheet (checkSeed).
  permissions: { fs: { read: ['node_modules/@weft-js/warp-core/**'], write: ['$TMPDIR/warp-seed-*'] }, spawn: ['node'] },
  contribute(o) {
    const seed = o.seed ?? DEFAULT
    const custom = seed.hue !== DEFAULT.hue || seed.chroma !== DEFAULT.chroma
    let declarations = overrides(o)
    if (custom) declarations = fitSeed(seed, declarations, o.dials) // throws { code: 'D010' }
    else if (declarations) checkSeed(seed, declarations, o.dials)
    const note = o.asked && landed(seed, declarations, o.asked)
    const dials = Object.entries(o.dials ?? {}).map(([dial, value]) => dialCss(dial, value)).join('')
    const css = (custom ? seedCss(seed) : '') + (o.fields === 'classic' ? classicCss() : '') + dials + overrideCss(declarations)
    return {
      tokens: { namespace: 'warp', ...(css && { css }), values: { seed: { hue: seed.hue, chroma: seed.chroma }, fields: o.fields ?? 'floating', ...(o.dials && { dials: o.dials }) } },
      agents: { title: 'warp (UI kit)', text: agents },
      ...(note && { notes: [note] }),
      card: cardColors(seed, o.dials),
      catalog,
      map: [{ want: 'UI components', call: 'Import from `@weft-js/warp`; `weft plugins` has the catalog', have: `${catalog.length} components` }],
      diagnostics: [
        { code: 'D010', catches: 'A token override, alone or with the seed, that leaves text, a control boundary or the focus ring below WCAG contrast at some dial stop', fix: 'Change the token or seed; the message lists each failing pair', severity: 'error' },
      ],
    }
  },
})

export default warp
