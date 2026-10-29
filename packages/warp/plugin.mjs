// warp() for weft.config.ts: warp's config, tokens, catalog and AGENTS section (PLAN §7c, research 13 §2.13).
// Components stay ordinary imports; this only contributes data.
//
// - seed: the brand accent. The spec tokens (ui-core/styles/warp.css) derive every colour from
//   --warp-seed-accent-h/-c, so a seed is those two values. It is checked with the spec's own contrast checker
//   (ui-core/scripts/contrast-check.mjs: every sys pair, both themes, every dial stop); any failure is D010.
// - fields: 'classic' makes classic fields the default with no attribute in the app: the spec's classic rules
//   (keyed on [data-fields="classic"]) are copied, re-scoped to :root unless an ancestor says data-fields="floating".
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { definePlugin } from 'weft/plugin'
import { fromHex } from './tokens/color.mjs'

const core = new URL('../ui-core/', import.meta.url)
const DEFAULT = { hue: 152, chroma: 0.115 }

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
  for (const key of Object.keys(input)) if (!['seed', 'fields'].includes(key)) throw Object.assign(new Error(`unknown option \`${key}\``), { path: key })
  if (input.fields !== undefined && input.fields !== 'floating' && input.fields !== 'classic') throw Object.assign(new Error(`must be 'floating' or 'classic'`), { path: 'fields' })
  if (input.seed !== undefined) {
    try {
      out.seed = normalizeSeed(input.seed)
    } catch (error) {
      throw Object.assign(error, { path: 'seed' })
    }
  }
  if (input.fields) out.fields = input.fields
  return out
}

const seedCss = s => `@layer warp.tokens{:root{--warp-seed-accent-h:${s.hue};--warp-seed-accent-c:${s.chroma}}}\n`

/** Run the spec checker on warp.css with the seed applied; D010 with every failing pair. */
export function checkSeed(seed) {
  const dir = mkdtempSync(join(tmpdir(), 'warp-seed-'))
  try {
    const css = join(dir, 'warp.css')
    writeFileSync(css, readFileSync(new URL('styles/warp.css', core), 'utf8') + `\n:root{--warp-seed-accent-h:${seed.hue};--warp-seed-accent-c:${seed.chroma}}\n`)
    let out
    try {
      out = execFileSync(process.execPath, [new URL('scripts/contrast-check.mjs', core).pathname, css, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (e) {
      out = e.stdout // exit 1 on failures; the JSON is still on stdout
    }
    const { results } = JSON.parse(out)
    const failures = results.filter(r => !r.pass).map(r => `${r.combo}: ${r.fg} on ${r.bg} is ${r.ratio.toFixed(2)}:1, needs ${r.min}:1`)
    if (failures.length) throw Object.assign(new Error(`warp seed fails contrast (${failures.length} pairs):\n  ${failures.join('\n  ')}`), { code: 'D010', failures })
    return results.length
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Every spec rule keyed on [data-fields="classic"], re-scoped to the root, inside its original layer. */
export function classicCss() {
  const files = [new URL('styles/warp.css', core), ...readdirSync(new URL('styles/inputs/', core)).map(f => new URL(`styles/inputs/${f}`, core))]
  let out = ''
  for (const file of files) {
    const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const stack = []
    let start = 0
    for (let i = 0; i < css.length; i++) {
      if (css[i] === '{') { stack.push({ prelude: css.slice(start, i).trim(), at: i }); start = i + 1 }
      else if (css[i] === '}') {
        const open = stack.pop()
        if (open && open.prelude.includes('[data-fields="classic"]') && !open.prelude.startsWith('@')) {
          const layers = stack.map(s => s.prelude).filter(p => p.startsWith('@'))
          const rule = `${open.prelude.replaceAll('[data-fields="classic"]', ':root:not([data-fields="floating"])')}{${css.slice(open.at + 1, i).trim()}}`
          out += layers.reduceRight((inner, p) => `${p}{${inner}}`, rule) + '\n'
        }
        start = i + 1
      } else if (css[i] === ';' && !stack.length) start = i + 1
    }
  }
  return out
}

const agents = `Import components from \`@weft/warp\`; each brings its own CSS (the spec's, split per component). Intent props only: \`tone\` (neutral accent positive caution critical info), \`emphasis\` (solid soft outline ghost frame link), \`size\` (sm md lg). No style props: the look comes from the dials, \`data-expression="quiet|balanced|vivid"\`, \`data-theme\`, \`data-density\`, \`data-motion\`, \`data-flair\` on any element (scopes nest; \`setDial()\` from \`@weft/ui-core\` writes them). Fields take \`label\` (required: it is the accessible name), \`hint\`, \`error\`, native \`value\`/\`onInput\`; \`variant="classic"\` puts the label above. \`Modal\`/\`Drawer\` take \`open\` as a box. One solid Button per region. Seed: \`warp({ seed: { accent: '#0a7d4f' } })\`; the spec contrast check runs at every stop and \`weft check\` fails with D010 if any pair can't pass.`

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
    if (custom) checkSeed(seed) // throws { code: 'D010' }
    const css = (custom ? seedCss(seed) : '') + (o.fields === 'classic' ? classicCss() : '')
    return {
      tokens: { namespace: 'warp', ...(css && { css }), values: { seed, fields: o.fields ?? 'floating' } },
      agents: { title: 'warp (UI kit)', text: agents },
      catalog,
      diagnostics: [
        { code: 'D010', catches: 'A seed that leaves text, a control boundary or the focus ring below WCAG contrast at some dial stop', fix: 'Change the seed; the message lists each failing pair', severity: 'error' },
      ],
    }
  },
})

export default warp
