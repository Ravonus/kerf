// Generate the explicit part table while consumer bindings are classified.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { classifyLinks } from './theme-schema-links.mjs'
import { consumers, declaredTokens } from './theme-schema-consumers.mjs'
import { classifyShim } from './theme-schema-shims.mjs'
import { classifyComponents, componentsPath } from './theme-schema-components.mjs'
import { classifyButton } from './theme-schema-button.mjs'
import { classifyButtonVariants } from './theme-schema-button-variants.mjs'
import { buttonRadius, foundationsPath } from './theme-schema-button-radius.mjs'
import { buttonRadiusJoins } from './theme-schema-button-radius-joins.mjs'
import { auditButtonRadius } from './theme-schema-radius-audit.mjs'
import { coverage } from './theme-schema-coverage.mjs'
import { sourceIndex, reconcile } from './theme-schema-index.mjs'
import { partTypes, systemTypes } from './theme-schema-types.mjs'

const fixtureFlag = process.argv.indexOf('--coverage-fixture')
if (fixtureFlag !== -1) {
  const result = coverage(JSON.parse(readFileSync(process.argv[fixtureFlag + 1], 'utf8')))
  console.log(`Coverage: ${result.status}`)
  for (const issue of result.issues) console.error(issue)
  process.exit(result.status === 'complete' ? 0 : 1)
}

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
  const expansion = marked.match(/```json\s*([\s\S]*?)```/)
  if (!expansion) throw new Error('Missing property expansion rules')
  return { parts: rows('Part'), properties: rows('config path'), sources: rows('source'),
    system: rows('system path'), states: rows('state'), inventory: rows('scope or standalone part'),
    expansion: JSON.parse(expansion[1]) }
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

function generate(design, template, bindings, radiusAudit) {
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
  for (const row of bindings.filter((item) => item.source.endsWith('/links.css') && item.classification === 'binding')) {
    const existing = records.find((item) => item.part === row.part && item.state === row.state && item.path === row.path)
    if (existing) existing.binding = 'partial'
    else records.push({ part: row.part, state: row.state, path: row.path, token: row.token,
      domain: row.domain, units: row.units, binding: 'partial' })
  }
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
  const propertyRules = table.properties.map(([path, binding, domain, units]) => ({
    paths: path.split(',').map((value) => value.trim()), binding, domain, units,
  }))
  const systemRules = table.system.map(([path, keys, domain, binding]) => ({ path, keys, domain, binding }))
  const stateRules = table.states.map(([name, predicate, precedence]) => ({
    name, predicate, precedence: Number(precedence),
  }))
  if (stateRules.some((row) => !Number.isInteger(row.precedence)) ||
      new Set(stateRules.map((row) => row.name)).size !== stateRules.length ||
      table.expansion.version !== 1) throw new Error('Invalid expansion or state rules')
  const stateNames = stateRules.map((row) => row.name)
  for (const row of records) {
    if (!stateNames.includes(row.state)) throw new Error(`Unknown state: ${row.state}`)
  }
  const unresolved = records.filter((row) => row.binding !== 'classified')
    .map((row) => `${row.part}.${row.state}.${row.path}`)
  const sites = []
  const index = sources.map((source) => {
    const text = read(source)
    const found = sourceIndex(source, text)
    const comparison = reconcile(source, text, found)
    for (const site of found) {
      const matches = bindings.filter((row) => row.source === source && row.classification === 'binding' &&
        row.property === site.property && row.fallbackSpan?.[0] === site.fallbackSpan[0] &&
        row.fallbackSpan?.[1] === site.fallbackSpan[1] && row.fallback === site.fallback &&
        row.selector === site.selectors.at(-1))
      if (matches.length > 1) throw new Error(`Duplicate binding for site: ${site.id}`)
      if (matches.length === 1) {
        const { part, state, path, token, domain, units } = matches[0]
        site.classification = 'binding'
        site.role = { part, state, path, token, domain, units }
        site.reason = 'The reviewed binding matches the source site and selector.'
      }
    }
    sites.push(...found)
    return { source, ...comparison, status: comparison.astOnly.length || comparison.sourceOnly.length
      ? 'discrepant' : 'indexed' }
  })
  const groups = records.map((row) => {
    const matching = bindings.filter((binding) => binding.classification === 'binding' &&
      binding.part === row.part && binding.state === row.state && binding.path === row.path)
    const siteIds = sites.filter((site) => site.role?.part === row.part &&
      site.role.state === row.state && site.role.path === row.path).map((site) => site.id)
    return { ...row, id: `${row.part}.${row.state}.${row.path}`, siteIds,
      bindingRefs: matching.map(({ source, fallbackSpan }) => ({ source, fallbackSpan })) }
  })
  if (new Set(groups.map((row) => row.id)).size !== groups.length ||
      new Set(groups.map((row) => row.token)).size !== groups.length) throw new Error('Duplicate normalized group or token')
  const unresolvedSites = sites.filter((site) => site.classification === 'unresolved').map((site) => site.id)
  const status = unresolved.length || unresolvedSites.length || index.some((row) => row.status !== 'indexed')
    ? 'partial' : 'complete'
  const tokens = [...new Set(sources.flatMap((source) => declaredTokens(source, read(source))))].sort()
  const registry = { status, declaredTokens: tokens, groups, unresolvedGroups: unresolved, unresolvedSites, sites, sourceIndex: index,
    propertyTable: table.properties, systemTable: table.system, stateTable: table.states,
    propertyRules, systemRules, stateRules, expansion: table.expansion }
  const digest = createHash('sha256').update(JSON.stringify({ records, sources, bindings, system, radiusAudit, registry })).digest('hex')
  if (!template.includes('/* THEME_TYPES */')) throw new Error('Missing type template marker')
  const textRoles = [...new Set(shimBindings.map((row) => row.part))].map((part) => {
    const fields = shimBindings.filter((row) => row.part === part).map((row) =>
      `${row.path.slice(5)}?: ${['family', 'transform'].includes(row.path.slice(5)) ? 'string' : 'number | string'}`).join('; ')
    return `    ${part.slice(5)}?: { ${fields} }`
  }).join('\n')
  const typeText = `/** Explicit overrides; canonical sheet bindings remain under classification. */\nexport interface ThemeParts {\n${partTypes(records)}\n}\n\n/** A system density stop. */\nexport interface ThemeDensity { factor?: number; control?: { sm?: number | string; md?: number | string; lg?: number | string } }\n/** A custom text role. */\nexport interface ThemeTextRole { family?: string; size?: number | string; lineHeight?: number | string; weight?: number | string; letterSpacing?: number | string; transform?: string }\n/** System scale types; bindings remain under classification. */\nexport interface ThemeSystem {\n${systemTypes(systemRules, textRoles, tokens)}\n}`
  const doc = groups.map((row) => `| ${row.part} | ${row.state} | ${row.path} | ${row.token} | ${row.domain} | ${row.binding} | ${row.bindingRefs.length} |`).join('\n')
  return [
    `${JSON.stringify({ digest, status, sources, records, system, bindings, radiusAudit, registry }, null, 2)}\n`,
    `// Theme schema digest: ${digest}\n${template.replace('/* THEME_TYPES */', typeText)}`,
    `# Theme tokens (partial)\n\nSchema digest: ${digest}\n\nBare-anchor, type and space-intent shim declarations the status-light rule, and partial Button paint and tone dependencies are reviewed below. Canonical sheets remain unresolved.\n\n| Part | State | Path | Candidate token | Domain | Binding | Reviewed sites |\n| --- | --- | --- | --- | --- | --- | --- |\n${doc}\n\nThe table lists partial and unresolved groups as design candidates. No additional raw-only part overrides have been classified; the existing \`tokens\` escape hatch remains available.\n\n## System scale types\n\n${systemRules.map((row) => `- \`${row.path}\`: ${row.keys}; ${row.domain}.`).join('\n')}\n\nBreakpoint query keys are still unresolved and are not included in the generated type.\n\n## Explicit Button radius selector audit\n\n| Source | Line | Selector | Properties | Review |\n| --- | --- | --- | --- | --- |\n${radiusAudit.map((row) => `| ${row.source} | ${row.line} | \`${row.selector.replaceAll('\n', ' ')}\` | ${row.properties.join(', ')} | ${row.classification} |`).join('\n')}\n\n## Reviewed declarations\n\n| Path | Variant | States | Selector | At-rules | Property | Fallback | Units | Classification | Reason | Source |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n${bindings.map((b) => `| ${b.path ?? b.systemPath ?? b.classification} | ${b.variant ?? '—'} | ${(b.states ?? [b.state ?? '—']).join(', ')} | \`${b.selector.replaceAll('\n', ' ')}\` | \`${b.atRules.join('; ')}\` | ${b.property} | \`${b.fallback.replaceAll('\n', '<br>')}\` | ${b.units ?? '—'} | ${b.classification} | ${b.reason ?? '—'} | ${b.source}:${b.fallbackSpan.join('-')} |`).join('\n')}\n`,
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
const bindings = [...classifyLinks(linksPath, read(linksPath)), ...shimPaths.flatMap((path) => classifyShim(path, read(path))), ...classifyComponents(componentText), ...buttonDefaults, ...classifyButtonVariants(componentText, buttonDefaults), ...buttonRadius(componentText, read(foundationsPath)), ...buttonRadiusJoins(componentText, read(foundationsPath))]
const sourcePaths = tables(design).sources.filter((row) => row[0].startsWith('`')).map((row) => unquote(row[0])[0])
const radiusAudit = auditButtonRadius(sourcePaths, read)
const generated = generate(design, template, bindings, radiusAudit)
if (process.argv.includes('--negative-test')) {
  const invalid = design.replace('| forbidden |', '| bad-unit |')
  try { generate(invalid, template, bindings, radiusAudit); throw new Error('Bad unit passed') } catch (error) {
    if (error.message === 'Bad unit passed') throw error
    console.log(`negative bad unit: ${error.message}`)
  }
  const changedTable = design.replace('`highlight` | `hover`', '`highlight`, `extra` | `hover`')
  if (!drift(generate(changedTable, template, bindings, radiusAudit), generated).length) throw new Error('Table mutation passed')
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
const priorSchema = JSON.parse(read(outputs[0]))
if (JSON.stringify(priorSchema.registry?.sites) !== JSON.stringify(JSON.parse(generated[0]).registry.sites)) {
  console.error('Source index drift')
  failed = true
}
if (JSON.stringify(priorSchema.radiusAudit) !== JSON.stringify(radiusAudit)) {
  console.error('Button radius selector audit drift')
  failed = true
}
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
console.log(`Tracked sources: ${sources.filter((path) => tracked.includes(path)).length}/${sources.length}; reviewed records: ${bindings.length}; canonical sources: ${sources.filter((path) => path.startsWith('docs/design/')).length}`)
console.log(`Button radius selector audit: ${sourcePaths.length} sources; ${radiusAudit.length} selector rules`)
const variants = bindings.filter((row) => row.variant)
const completedButton = JSON.parse(generated[0]).records.filter((row) =>
  row.part === 'button' && row.binding === 'classified')
console.log(`Button variant declarations unresolved: ${variants.filter((row) => row.classification === 'variant declaration unresolved').length}; partial property sites: ${variants.filter((row) => row.classification === 'partial property binding').length}; complete properties: ${completedButton.length}`)
const registry = JSON.parse(generated[0]).registry
const groupCounts = ['classified', 'partial', 'unresolved', 'raw-only'].map((kind) =>
  `${kind}: ${registry.groups.filter((row) => row.binding === kind).length}`).join('; ')
console.log(`Normalized groups: ${registry.groups.length}; ${groupCounts}`)
console.log(`Coverage: ${registry.status}; unresolved groups: ${registry.unresolvedGroups.length}; discrepant sources: ${registry.sourceIndex.filter((row) => row.status !== 'indexed').length}`)
console.log(`Source sites: ${registry.sites.length}; unresolved sites: ${registry.unresolvedSites.length}`)
if (registry.unresolvedGroups.length) console.log(`Unresolved groups: ${registry.unresolvedGroups.join(', ')}`)
if (registry.status !== 'complete') {
  console.error('Incomplete: CSS declaration ownership, transitive inputs, exclusions and fallbacks are unresolved')
  failed = true
}
process.exitCode = failed ? 1 : 0
