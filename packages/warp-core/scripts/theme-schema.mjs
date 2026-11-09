// Generate the explicit part table while consumer bindings are classified.
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
import { buttonRadiusJoins } from './theme-schema-button-radius-joins.mjs'
import { auditButtonRadius } from './theme-schema-radius-audit.mjs'
import { coverage } from './theme-schema-coverage.mjs'
import { tables, unquote, makeRecords, deriveRules, makeRegistry } from './theme-schema-model.mjs'
import { renderSchema } from './theme-schema-render.mjs'

const fixtureFlag = process.argv.indexOf('--coverage-fixture')
if (fixtureFlag !== -1) {
  const result = coverage(JSON.parse(readFileSync(process.argv[fixtureFlag + 1], 'utf8')))
  console.log(`Coverage: ${result.status}`)
  for (const issue of result.issues) console.error(issue)
  process.exit(result.status === 'complete' ? 0 : 1)
}

const repository = new URL('../../../', import.meta.url)
const root = process.env.WARP_SCHEMA_FIXTURE
  ? pathToFileURL(`${process.env.WARP_SCHEMA_FIXTURE}/`)
  : repository
const read = (path) => readFileSync(new URL(path, root), 'utf8')
const designPath = 'docs/decisions/theming.md'
const templatePath = 'packages/warp/plugin.template.d.mts'
const outputs = [
  'packages/warp-core/theme.schema.json',
  'packages/warp/plugin.d.mts',
  'packages/cli/docs/theme-tokens.md',
  'packages/warp-core/scripts/theme-schema-registry.mjs',
  'packages/warp-core/scripts/theme-schema-registry.json',
  ...Array.from({ length: 6 }, (_, i) => `packages/warp/src/theme-parts-${i + 1}.d.mts`),
]
async function generate(design, template, bindings, radiusAudit) {
  const table = tables(design)
  const { records, shimBindings } = makeRecords(table, bindings)
  const { sources, system, propertyRules, systemRules, stateRules } = deriveRules(
    table,
    bindings,
    records,
  )
  const { registry, status, tokens, groups } = makeRegistry(
    table,
    bindings,
    records,
    read,
    sources,
    systemRules,
    propertyRules,
    stateRules,
  )
  return renderSchema({
    template,
    bindings,
    radiusAudit,
    records,
    sources,
    system,
    registry,
    status,
    tokens,
    groups,
    propertyRules,
    systemRules,
    stateRules,
    table,
    outputs,
    shimBindings,
  })
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
const bindings = [
  ...classifyLinks(linksPath, read(linksPath)),
  ...shimPaths.flatMap((path) => classifyShim(path, read(path))),
  ...classifyComponents(componentText),
  ...buttonDefaults,
  ...classifyButtonVariants(componentText, buttonDefaults),
  ...buttonRadius(componentText, read(foundationsPath)),
  ...buttonRadiusJoins(componentText, read(foundationsPath)),
]
const sourcePaths = tables(design)
  .sources.filter((row) => row[0].startsWith('`'))
  .map((row) => unquote(row[0])[0])
const radiusAudit = auditButtonRadius(sourcePaths, read)
const generated = await generate(design, template, bindings, radiusAudit)
if (process.argv.includes('--negative-test')) {
  const invalid = design.replace('| forbidden |', '| bad-unit |')
  try {
    await generate(invalid, template, bindings, radiusAudit)
    throw new Error('Bad unit passed')
  } catch (error) {
    if (error.message === 'Bad unit passed') throw error
    console.log(`negative bad unit: ${error.message}`)
  }
  const changedTable = design.replace('`highlight` | `hover`', '`highlight`, `extra` | `hover`')
  if (!drift(await generate(changedTable, template, bindings, radiusAudit), generated).length)
    throw new Error('Table mutation passed')
  console.log('negative table: drift detected')
  for (const index of [1, 2]) {
    const actual = [...generated]
    actual[index] += 'mutation\n'
    const mismatches = drift(generated, actual)
    if (mismatches.length !== 1 || mismatches[0] !== outputs[index])
      throw new Error('Drift mutation passed')
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
if (
  JSON.stringify(priorSchema.registry?.sites) !==
  JSON.stringify(JSON.parse(generated[0]).registry.sites)
) {
  console.error('Source index drift')
  failed = true
}
if (JSON.stringify(priorSchema.radiusAudit) !== JSON.stringify(radiusAudit)) {
  console.error('Button radius selector audit drift')
  failed = true
}
const mismatches = drift(generated, outputs.map(read))
for (const path of mismatches) {
  console.error(`Drift: ${path}`)
  failed = true
}
const tracked = execFileSync(
  'git',
  [
    'ls-files',
    '--',
    'docs/design/warp/tokens/*.css',
    'packages/warp/src/links.css',
    'packages/warp/src/type.css',
    'packages/warp/src/layout.css',
  ],
  { cwd: repository, encoding: 'utf8' },
)
  .trim()
  .split('\n')
const sources = JSON.parse(generated[0]).sources
for (const source of sources) {
  if (!tracked.includes(source)) {
    console.error(`Missing tracked source: ${source}`)
    failed = true
    continue
  }
  const content = read(source)
  const declarations = consumers(source, content)
  const direct = declarations.filter((row) => row.reads.some((name) => name.startsWith('--warp-')))
  const local = declarations.filter((row) => row.reads.some((name) => name.startsWith('--_')))
  const reads = (content.match(/var\(\s*--warp-/g) || []).length
  const classified = bindings.filter((row) => row.source === source).length
  console.log(
    `${source}: ${reads} direct token references, ${direct.length} declarations, ${local.length} local-channel readers, ${classified} reviewed records`,
  )
}
const extra = tracked.filter((path) => !sources.includes(path))
if (extra.length) {
  console.error(`Uninventoried sources: ${extra.join(', ')}`)
  failed = true
}
console.log(
  `Tracked sources: ${sources.filter((path) => tracked.includes(path)).length}/${sources.length}; reviewed records: ${bindings.length}; canonical sources: ${sources.filter((path) => path.startsWith('docs/design/')).length}`,
)
console.log(
  `Button radius selector audit: ${sourcePaths.length} sources; ${radiusAudit.length} selector rules`,
)
const variants = bindings.filter((row) => row.variant)
const completedButton = JSON.parse(generated[0]).records.filter(
  (row) => row.part === 'button' && row.binding === 'classified',
)
console.log(
  `Button variant declarations unresolved: ${variants.filter((row) => row.classification === 'variant declaration unresolved').length}; partial property sites: ${variants.filter((row) => row.classification === 'partial property binding').length}; complete properties: ${completedButton.length}`,
)
const registry = JSON.parse(generated[0]).registry
const groupCounts = ['classified', 'partial', 'unresolved', 'raw-only']
  .map((kind) => `${kind}: ${registry.groups.filter((row) => row.binding === kind).length}`)
  .join('; ')
console.log(`Normalized groups: ${registry.groups.length}; ${groupCounts}`)
console.log(
  `Coverage: ${registry.status}; unresolved groups: ${registry.unresolvedGroups.length}; discrepant sources: ${registry.sourceIndex.filter((row) => row.status !== 'indexed').length}`,
)
console.log(
  `Source sites: ${registry.sites.length}; unresolved sites: ${registry.unresolvedSites.length}`,
)
if (registry.unresolvedGroups.length)
  console.log(`Unresolved groups: ${registry.unresolvedGroups.join(', ')}`)
if (registry.status !== 'complete') {
  console.error(
    'Incomplete: CSS declaration ownership, transitive inputs, exclusions and fallbacks are unresolved',
  )
  failed = true
}
process.exitCode = failed ? 1 : 0
