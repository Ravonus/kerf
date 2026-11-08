// Generate the explicit part table while consumer bindings are classified.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { classifyLinks } from './theme-schema-links.mjs'
import { consumers } from './theme-schema-consumers.mjs'
import { classifyShim } from './theme-schema-shims.mjs'
import { classifyComponents, componentsPath } from './theme-schema-components.mjs'
import { classifyButton } from './theme-schema-button.mjs'
import { classifyButtonVariants } from './theme-schema-button-variants.mjs'
import { buttonRadius, foundationsPath } from './theme-schema-button-radius.mjs'

const repoRoot = new URL('../../../', import.meta.url)
const root = process.env.WARP_SCHEMA_FIXTURE ? pathToFileURL(`${process.env.WARP_SCHEMA_FIXTURE}/`) : repoRoot
const read = (path) => readFileSync(new URL(path, root), 'utf8')
const designPath = 'docs/decisions/theming.md'
const templatePath = 'packages/warp/plugin.template.d.mts'
const outputs = [
  'packages/warp-core/theme.schema.json',
  'packages/warp/plugin.d.mts',
  'packages/cli/docs/theme-tokens.md',
]
const unquote = (text) => [...text.matchAll(/`([^`]+)`/g)].map((match) => match[1])
const cells = (line) => line.slice(1, -1).split('|').map((cell) => cell.trim())

function tables(design) {
  const marked = design.split('<!-- warp-theme-schema:begin -->')[1]?.split(
    '<!-- warp-theme-schema:end -->',
  )[0]
  if (!marked) throw new Error('Missing schema markers')
  const rows = (header) => {
    const lines = marked.split('\n')
    const start = lines.findIndex((line) => line.startsWith(`| ${header} |`))
    if (start < 0) throw new Error(`Missing table: ${header}`)
    return lines.slice(start + 2, lines.findIndex((line, i) => i > start + 1 && !line.startsWith('|')))
        .map(cells)
  }
  return { parts: rows('Part'), properties: rows('config path'), sources: rows('source'), system: rows('system path'), inventory: rows('scope or standalone part') }
}

function entries(parts) {
  const result = []
  const add = (part, state, property) => {
    const token = `--warp-${part}-${property}${state === 'rest' ? '' : `-${state}`}`
    result.push({ part, state, path: property, token, domain: ({ underline: 'underline-role', border: 'border', ring: 'ring-role' })[property] ?? 'color', units: 'forbidden', binding: 'unresolved' })
  }
  for (const [name, rest, states] of parts) {
    const part = unquote(name)[0]
    if (!part || !rest || !states) throw new Error('Invalid part row')
    for (const property of unquote(rest)) add(part, 'rest', property)
    if (states === 'none') continue
    for (const group of states.split(';')) {
      const [stateText, propText] = group.split(':')
      if (!propText) throw new Error(`Invalid state row: ${part}`)
      for (const state of unquote(stateText)) {
        for (const property of unquote(propText)) add(part, state, property)
      }
    }
  }
  const keys = result.map(({ part, state, path }) => `${part}.${state}.${path}`)
  if (new Set(keys).size !== keys.length) throw new Error('Duplicate part path')
  return result
}

function generate(design, template, bindings) {
  const table = tables(design)
  const allowedUnits = new Set(['forbidden', 'width/offset px', 'px width only', 'px', 'unitless', 'ms for times', 'ms', 'px,deg'])
  for (const row of table.properties) {
    if (!allowedUnits.has(row[3])) throw new Error(`Unknown unit: ${row[3]}`)
  }
  const shimBindings = bindings.filter((row) => row.part?.startsWith('text/'))
  const statusRow = table.inventory.find((row) => row[0] === '`status-light`')
  if (!statusRow || statusRow[1] !== 'font-size' || !table.properties.some((row) => row[0] === 'font.size')) {
    throw new Error('status-light: design inventory mismatch')
  }
  const componentBindings = bindings.filter((row) => row.source === componentsPath && row.classification === 'binding')
  const classified = [...shimBindings, ...componentBindings]
  const records = [...entries(table.parts), ...classified.map(({ part, state, path, token, domain, units }) => ({ part, state, path, token, domain, units, binding: 'classified' }))]
  const sources = table.sources.filter((row) => row[0].startsWith('`')).map((row) => unquote(row[0])[0])
  if (sources.length !== 13 || new Set(sources).size !== 13) throw new Error('Expected 13 inventory sources')
  const textScale = table.system.find((row) => row[0] === 'text')
  const spaceScale = table.system.find((row) => row[0] === 'space')
  if (!textScale || !spaceScale) throw new Error('Missing text or space system table')
  const system = bindings.filter((row) => row.systemPath).map((row) => ({
    path: row.systemPath, token: row.inputs[0].token, domain: row.domain, units: row.units,
    source: row.source, selector: row.selector, property: row.property, fallbackSpan: row.fallbackSpan,
  }))
  for (const row of system) {
    const [scale, key] = row.path.split('.')
    const keys = scale === 'text' ? textScale[1] : spaceScale[1]
    if (!keys.split(';')[0].split(',').includes(key)) throw new Error(`Unknown system key: ${row.path}`)
  }
  const digest = createHash('sha256').update(JSON.stringify({ records, sources, bindings, system, properties: table.properties })).digest('hex')
  const shape = (rows, indent = '    ') => rows.map((row) => `${indent}${row.path}?: ${['underline', 'ring'].includes(row.path) ? 'string | { color?: string; width?: number | string; offset?: number | string }' : row.path === 'border' ? 'string | { color?: string; width?: number | string; style?: string }' : 'string'}`).join('\n')
  const types = [...new Set(records.filter((row) => !row.part.startsWith('text/') && row.part !== 'status-light').map((row) => row.part))].map((part) => {
    const rows = records.filter((row) => row.part === part)
    const stateTypes = [...new Set(rows.filter((row) => row.state !== 'rest').map((row) => row.state))]
      .map((state) => `    ${state}?: {\n${shape(rows.filter((row) => row.state === state), '      ')}\n    }`).join('\n')
    return `  ${part}?: {\n${shape(rows.filter((row) => row.state === 'rest'))}\n${stateTypes}\n  }`
  }).join('\n')
  const roles = [...new Set(shimBindings.map((row) => row.part))].map((part) => {
    const fields = shimBindings.filter((row) => row.part === part).map((row) =>
      `      ${row.path.slice(5)}?: ${['family', 'transform'].includes(row.path.slice(5)) ? 'string' : 'number | string'}`).join('\n')
    return `  '${part}'?: { font?: {\n${fields}\n    } }`
  }).join('\n')
  const componentTypes = componentBindings.length ? `  'status-light'?: { font?: { size?: number | string } }` : ''
  if (!template.includes('/* THEME_TYPES */')) throw new Error('Missing type template marker')
  const systemRoles = [...new Set(shimBindings.map((row) => row.part))].map((part) => {
    const fields = shimBindings.filter((row) => row.part === part).map((row) =>
      `${row.path.slice(5)}?: ${['family', 'transform'].includes(row.path.slice(5)) ? 'string' : 'number | string'}`).join('; ')
    return `    ${part.slice(5)}?: { ${fields} }`
  }).join('\n')
  const typeText = `/** Explicit overrides; canonical sheet bindings remain under classification. */\nexport interface ThemeParts {\n${types}\n${roles}\n${componentTypes}\n}\n\n/** The classified system scales; other scales remain under classification. */\nexport interface ThemeSystem {\n  space?: Record<string, number | string>\n  text?: Record<string, { family?: string; size?: number | string; lineHeight?: number | string; weight?: number | string; letterSpacing?: number | string; transform?: string } | undefined> & {\n${systemRoles}\n  }\n}`
  const doc = records.map((row) => `| ${row.part} | ${row.state} | ${row.path} | ${row.token} | ${row.domain} | ${row.binding} |`).join('\n')
  return [
    `${JSON.stringify({ digest, status: 'partial', sources, records, system, bindings }, null, 2)}\n`,
    `// Theme schema digest: ${digest}\n${template.replace('/* THEME_TYPES */', typeText)}`,
    `# Theme tokens (partial)\n\nSchema digest: ${digest}\n\nBare-anchor, type and space-intent shim declarations the status-light rule, and partial Button paint and tone dependencies are reviewed below. Canonical sheets remain unresolved.\n\n| Part | State | Path | Candidate token | Domain | Binding |\n| --- | --- | --- | --- | --- | --- |\n${doc}\n\n## Reviewed declarations\n\n| Path | Variant | States | Selector | At-rules | Property | Fallback | Units | Classification | Reason | Source |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n${bindings.map((b) => `| ${b.path ?? b.systemPath ?? b.classification} | ${b.variant ?? '—'} | ${(b.states ?? [b.state ?? '—']).join(', ')} | \`${b.selector.replaceAll('\n', ' ')}\` | \`${b.atRules.join('; ')}\` | ${b.property} | \`${b.fallback.replaceAll('\n', '<br>')}\` | ${b.units ?? '—'} | ${b.classification} | ${b.reason ?? '—'} | ${b.source}:${b.fallbackSpan.join('-')} |`).join('\n')}\n`,
  ]
}

function drift(expected, actual) {
  return outputs.filter((_, index) => expected[index] !== actual[index])
}

const design = read(designPath)
const template = read(templatePath)
const linksPath = 'packages/warp/src/links.css'
const shimPaths = ['packages/warp/src/type.css', 'packages/warp/src/layout.css']
const componentText = read(componentsPath)
const buttonDefaults = classifyButton(componentText)
const bindings = [...classifyLinks(linksPath, read(linksPath)), ...shimPaths.flatMap((path) => classifyShim(path, read(path))), ...classifyComponents(componentText), ...buttonDefaults, ...classifyButtonVariants(componentText, buttonDefaults), ...buttonRadius(componentText, read(foundationsPath))]
const generated = generate(design, template, bindings)
if (process.argv.includes('--negative-test')) {
  const invalid = design.replace('| forbidden |', '| bad-unit |')
  try { generate(invalid, template, bindings); throw new Error('Bad unit passed') } catch (error) {
    if (error.message === 'Bad unit passed') throw error
    console.log(`negative bad unit: ${error.message}`)
  }
  const changedTable = design.replace('`highlight` | `hover`', '`highlight`, `extra` | `hover`')
  if (!drift(generate(changedTable, template, bindings), generated).length) throw new Error('Table mutation passed')
  console.log('negative table: drift detected')
  for (const index of [1, 2]) {
    const actual = [...generated]
    actual[index] += 'mutation\n'
    const mismatches = drift(generated, actual)
    if (mismatches.length !== 1 || mismatches[0] !== outputs[index]) throw new Error('Drift mutation passed')
    console.log(`negative ${index === 1 ? 'type' : 'doc'}: ${mismatches[0]}`)
  }
  process.exit(0)
}
if (!process.argv.includes('--check')) {
  outputs.forEach((path, index) => writeFileSync(new URL(path, root), generated[index]))
  console.log('Generated partial theme schema, types and reference')
  process.exit(0)
}
let failed = false
const mismatches = drift(generated, outputs.map(read))
for (const path of mismatches) { console.error(`Drift: ${path}`); failed = true }
const tracked = execFileSync('git', ['ls-files', '--', 'docs/design/warp/tokens/*.css', 'packages/warp/src/links.css', 'packages/warp/src/type.css', 'packages/warp/src/layout.css'], { cwd: repoRoot, encoding: 'utf8' }).trim().split('\n')
const sources = JSON.parse(generated[0]).sources
for (const source of sources) {
  if (!tracked.includes(source)) { console.error(`Missing tracked source: ${source}`); failed = true; continue }
  const content = read(source)
  const declarations = consumers(source, content)
  const direct = declarations.filter((row) => row.reads.some((name) => name.startsWith('--warp-')))
  const local = declarations.filter((row) => row.reads.some((name) => name.startsWith('--_')))
  const reads = (content.match(/var\(\s*--warp-/g) || []).length
  const classified = bindings.filter((row) => row.source === source).length
  console.log(`${source}: ${reads} direct token references, ${direct.length} declarations, ${local.length} local-channel readers, ${classified} reviewed records`)
}
const extra = tracked.filter((path) => !sources.includes(path))
if (extra.length) { console.error(`Uninventoried sources: ${extra.join(', ')}`); failed = true }
console.log(`Tracked sources: ${sources.filter((path) => tracked.includes(path)).length}/${sources.length}; reviewed records: ${bindings.length}; unresolved sources: ${sources.filter((path) => path.startsWith('docs/design/')).length}`)
const variants = bindings.filter((row) => row.variant)
const completedButton = JSON.parse(generated[0]).records.filter((row) =>
  row.part === 'button' && row.binding === 'classified')
console.log(`Button variant declarations unresolved: ${variants.filter((row) => row.classification === 'variant declaration unresolved').length}; partial property sites: ${variants.filter((row) => row.classification === 'partial property binding').length}; complete properties: ${completedButton.length}`)
console.error('Incomplete: CSS declaration ownership, transitive inputs, exclusions and fallbacks are unresolved')
process.exitCode = 1
