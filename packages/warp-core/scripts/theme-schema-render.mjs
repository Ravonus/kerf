// Render the normalized registry, public types and reference.
import { createHash } from 'node:crypto'
import { format } from 'oxfmt'
import { partTypes, systemTypes } from './theme-schema-types.mjs'

function renderTypes(shimBindings, records, systemRules, tokens) {
  const textRoles = [...new Set(shimBindings.map((row) => row.part))]
    .map((part) => {
      const fields = shimBindings
        .filter((row) => row.part === part)
        .map(
          (row) =>
            `${row.path.slice(5)}?: ${['family', 'transform'].includes(row.path.slice(5)) ? 'string' : 'number | string'}`,
        )
        .join('; ')
      return `    ${part.slice(5)}?: { ${fields} }`
    })
    .join('\n')
  const parts = [...new Set(records.map((row) => row.part))]
  const chunks = ['']
  for (const part of parts) {
    const text = partTypes(records.filter((row) => row.part === part))
    if (`${chunks.at(-1)}${text}`.split('\n').length > 220) chunks.push('')
    chunks[chunks.length - 1] += `${text}\n`
  }
  if (chunks.length > 6) throw new Error('Too many generated part type chunks')
  while (chunks.length < 6) chunks.push('')
  const imports = chunks
    .map((_, i) => `import type { ThemeParts${i + 1} } from './src/theme-parts-${i + 1}.mjs'`)
    .join('\n')
  const partText = chunks.map(
    (chunk, i) =>
      `/** Generated finite part overrides. */\nexport interface ThemeParts${i + 1} {\n${chunk}}\n`,
  )
  const typeText = `${imports}\n/** Explicit overrides; canonical sheet bindings remain under classification. */\nexport type ThemeParts = ${chunks.map((_, i) => `ThemeParts${i + 1}`).join(' & ')}\n\n/** A system density stop. */\nexport interface ThemeDensity { factor?: number; control?: { sm?: number | string; md?: number | string; lg?: number | string } }\n/** A custom text role. */\nexport interface ThemeTextRole { family?: string; size?: number | string; lineHeight?: number | string; weight?: number | string; letterSpacing?: number | string; transform?: string }\n/** System scale types; bindings remain under classification. */\nexport interface ThemeSystem {\n${systemTypes(systemRules, textRoles, tokens)}\n}`
  return { partText, typeText }
}

export async function renderSchema({
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
}) {
  const digest = createHash('sha256')
    .update(JSON.stringify({ records, sources, bindings, system, radiusAudit, registry }))
    .digest('hex')
  if (!template.includes('/* THEME_TYPES */')) throw new Error('Missing type template marker')
  const { partText, typeText } = renderTypes(shimBindings, records, systemRules, tokens)
  const doc = groups
    .map(
      (row) =>
        `| ${row.part} | ${row.state} | ${row.path} | ${row.token} | ${row.domain} | ${row.binding} | ${row.bindingRefs.length} |`,
    )
    .join('\n')
  const compact = {
    version: 1,
    digest,
    status,
    groups: groups.map((row) => ({
      id: row.id,
      part: row.part,
      state: row.state,
      path: row.path,
      token: row.token,
      domain: row.domain,
      units: row.units,
      status: row.binding === 'raw-only' ? 'raw-only' : 'candidate',
      evidence: row.binding,
    })),
    systemScales: registry.systemScales,
    states: stateRules,
    propertyRules,
    expansion: table.expansion,
  }
  const output = [
    `${JSON.stringify({ digest, status, sources, records, system, bindings, radiusAudit, registry }, null, 2)}\n`,
    `// Theme schema digest: ${digest}\n${template.replace('/* THEME_TYPES */', typeText)}`,
    `# Theme tokens (partial)\n\nSchema digest: ${digest}\n\nBare-anchor, type and space-intent shim declarations the status-light rule, and partial Button paint and tone dependencies are reviewed below. Canonical sheets remain unresolved.\n\n| Part | State | Path | Candidate token | Domain | Binding | Reviewed sites |\n| --- | --- | --- | --- | --- | --- | --- |\n${doc}\n\nThe table lists partial and unresolved groups as design candidates. No additional raw-only part overrides have been classified; the existing \`tokens\` escape hatch remains available.\n\nThe \`@weft-js/warp-core/theme-schema\` module exports \`themeSchema\` and a default export of the same compact registry. Group \`status: candidate\` is not a supported config promise; \`evidence\` describes current source review. System \`declared-inputs\` means tokens exist, not that lowering or config support is complete.\n\n## System scale types\n\n${systemRules.map((row) => `- \`${row.path}\`: ${row.keys}; ${row.domain}.`).join('\n')}\n\nBreakpoint query keys are still unresolved and are not included in the generated type.\n\n## Explicit Button radius selector audit\n\n| Source | Line | Selector | Properties | Review |\n| --- | --- | --- | --- | --- |\n${radiusAudit.map((row) => `| ${row.source} | ${row.line} | \`${row.selector.replaceAll('\n', ' ')}\` | ${row.properties.join(', ')} | ${row.classification} |`).join('\n')}\n\n## Reviewed declarations\n\n| Path | Variant | States | Selector | At-rules | Property | Fallback | Units | Classification | Reason | Source |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n${bindings.map((b) => `| ${b.path ?? b.systemPath ?? b.classification} | ${b.variant ?? '—'} | ${(b.states ?? [b.state ?? '—']).join(', ')} | \`${b.selector.replaceAll('\n', ' ')}\` | \`${b.atRules.join('; ')}\` | ${b.property} | \`${b.fallback.replaceAll('\n', '<br>')}\` | ${b.units ?? '—'} | ${b.classification} | ${b.reason ?? '—'} | ${b.source}:${b.fallbackSpan.join('-')} |`).join('\n')}\n`,
    `// Generated theme schema digest: ${digest}\nimport data from './theme-schema-registry.json' with { type: 'json' }\n/** Finite schema candidates; status identifies unresolved coverage. */\nexport const themeSchema = data\n/** The same compact schema as the named export. */\nexport default themeSchema\n`,
    `${JSON.stringify(compact, null, 2)}\n`,
    ...partText,
  ]
  return Promise.all(
    output.map(async (value, i) => {
      if (!outputs[i].endsWith('.d.mts')) return value
      const result = await format(outputs[i], value, {
        printWidth: 100,
        semi: false,
        singleQuote: true,
      })
      if (result.errors.length) throw new Error(`Could not format ${outputs[i]}`)
      return result.code
    }),
  )
}
