// Generate the explicit part table while consumer bindings are classified.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { classifyLinks } from './theme-schema-links.mjs'

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
  return { parts: rows('Part'), properties: rows('config path'), sources: rows('source') }
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
  const records = entries(table.parts)
  const sources = table.sources.filter((row) => row[0].startsWith('`')).map((row) => unquote(row[0])[0])
  if (sources.length !== 13 || new Set(sources).size !== 13) throw new Error('Expected 13 inventory sources')
  const digest = createHash('sha256').update(JSON.stringify({ records, sources, bindings, properties: table.properties })).digest('hex')
  const shape = (rows, indent = '    ') => rows.map((row) => `${indent}${row.path}?: ${['underline', 'ring'].includes(row.path) ? 'string | { color?: string; width?: number | string; offset?: number | string }' : row.path === 'border' ? 'string | { color?: string; width?: number | string; style?: string }' : 'string'}`).join('\n')
  const types = [...new Set(records.map((row) => row.part))].map((part) => {
    const rows = records.filter((row) => row.part === part)
    const stateTypes = [...new Set(rows.filter((row) => row.state !== 'rest').map((row) => row.state))]
      .map((state) => `    ${state}?: {\n${shape(rows.filter((row) => row.state === state), '      ')}\n    }`).join('\n')
    return `  ${part}?: {\n${shape(rows.filter((row) => row.state === 'rest'))}\n${stateTypes}\n  }`
  }).join('\n')
  if (!template.includes('/* THEME_TYPES */')) throw new Error('Missing type template marker')
  const typeText = `/** Explicit colour overrides; CSS bindings remain under classification. */\nexport interface ThemeParts {\n${types}\n}`
  const doc = records.map((row) => `| ${row.part} | ${row.state} | ${row.path} | ${row.token} | ${row.domain} | unresolved |`).join('\n')
  return [
    `${JSON.stringify({ digest, status: 'partial', sources, records, bindings }, null, 2)}\n`,
    `// Theme schema digest: ${digest}\n${template.replace('/* THEME_TYPES */', typeText)}`,
    `# Theme tokens (partial)\n\nSchema digest: ${digest}\n\nBare-anchor bindings are classified below. All other bindings remain unresolved.\n\n| Part | State | Path | Candidate token | Domain | Binding |\n| --- | --- | --- | --- | --- | --- |\n${doc}\n\n## Classified bare anchors\n\n| Path | Selector | Property | Fallback | Source |\n| --- | --- | --- | --- | --- |\n${bindings.map((b) => `| ${b.path} | \`${b.selector}\` | ${b.property} | \`${b.fallback}\` | ${b.source}:${b.fallbackSpan.join('-')} |`).join('\n')}\n`,
  ]
}

function drift(expected, actual) {
  return outputs.filter((_, index) => expected[index] !== actual[index])
}

const design = read(designPath)
const template = read(templatePath)
const linksPath = 'packages/warp/src/links.css'
const bindings = classifyLinks(linksPath, read(linksPath))
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
  const reads = (content.match(/var\(\s*--warp-/g) || []).length
  const classified = source === linksPath ? 2 : 0
  console.log(`${source}: ${reads} direct token references, ${classified} classified`)
}
const extra = tracked.filter((path) => !sources.includes(path))
if (extra.length) { console.error(`Uninventoried sources: ${extra.join(', ')}`); failed = true }
console.log(`Tracked sources: ${sources.filter((path) => tracked.includes(path)).length}/${sources.length}; classified declarations: ${bindings.length} (2 direct token reads)`)
console.error('Incomplete: CSS declaration ownership, transitive inputs, exclusions and fallbacks are unresolved')
process.exitCode = 1
