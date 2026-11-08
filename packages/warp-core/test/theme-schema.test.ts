import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { afterEach, expect, test } from 'vitest'

const root = resolve(process.cwd(), '../..')
const script = resolve(root, 'packages/warp-core/scripts/theme-schema.mjs')
const link = 'packages/warp/src/links.css'
let fixture = ''

afterEach(() => {
  if (fixture) rmSync(fixture, { recursive: true, force: true })
})

function setup() {
  fixture = mkdtempSync(resolve(tmpdir(), 'warp-schema-'))
  const schema = JSON.parse(readFileSync(resolve(root, 'packages/warp-core/theme.schema.json'), 'utf8')) as {
    sources: string[]
  }
  const files = [
    ...schema.sources, 'docs/decisions/theming.md', 'packages/warp/plugin.template.d.mts',
    'packages/warp/plugin.d.mts', 'packages/warp-core/theme.schema.json',
    'packages/cli/docs/theme-tokens.md',
  ]
  for (const file of files) {
    mkdirSync(dirname(resolve(fixture, file)), { recursive: true })
    copyFileSync(resolve(root, file), resolve(fixture, file))
  }
}

function check() {
  const result = spawnSync(process.execPath, [script, '--check'], {
    cwd: root, env: { ...process.env, WARP_SCHEMA_FIXTURE: fixture }, encoding: 'utf8',
  })
  expect(result.status).toBe(1)
  return `${result.stdout}\n${result.stderr}`
}

test('rejects filesystem changes while reporting the unresolved baseline', () => {
  setup()
  expect(check()).toContain('reviewed records: 229')
  expect(check()).toContain('Incomplete:')
  const path = resolve(fixture, link)
  const original = readFileSync(path, 'utf8')
  writeFileSync(path, original.replace('color: var(', 'padding: var(--warp-space-page); color: var('))
  expect(check()).toContain('unclassified declaration padding')
  writeFileSync(path, original)
  rmSync(path)
  expect(check()).toContain('ENOENT')
  writeFileSync(path, original)
  const doc = resolve(fixture, 'packages/cli/docs/theme-tokens.md')
  writeFileSync(doc, readFileSync(doc, 'utf8').replace('Schema digest:', 'Schema digest: changed'))
  expect(check()).toContain('Drift: packages/cli/docs/theme-tokens.md')
})

test('checks the tracked source inventory', () => {
  const tracked = execFileSync('git', ['ls-files', '--', 'docs/design/warp/tokens/*.css',
    'packages/warp/src/links.css', 'packages/warp/src/type.css', 'packages/warp/src/layout.css'], {
    cwd: root, encoding: 'utf8',
  }).trim().split('\n')
  const schema = JSON.parse(readFileSync(resolve(root, 'packages/warp-core/theme.schema.json'), 'utf8')) as {
    sources: string[]
  }
  expect(schema.sources.toSorted()).toEqual(tracked.toSorted())
  expect(tracked).toHaveLength(13)
})

test('counts nested token reads and local-channel dependencies as declarations', async () => {
  const { consumers } = await import('../scripts/theme-schema-consumers.mjs')
  const css = '.a { --_paint: var(--warp-ink); color: var(--_paint, var(--warp-fallback)); }'
  expect(consumers('fixture.css', css)).toEqual([
    { property: '--_paint', reads: ['--warp-ink'] },
    { property: 'color', reads: ['--_paint', '--warp-fallback'] },
  ])
  expect(consumers('fixture.css', css.replace('var(--warp-ink)', 'red'))).toEqual([
    { property: 'color', reads: ['--_paint', '--warp-fallback'] },
  ])
})


test('rejects changed and new consumers in both reviewed shims', () => {
  setup()
  for (const source of ['packages/warp/src/type.css', 'packages/warp/src/layout.css']) {
    const path = resolve(fixture, source)
    const original = readFileSync(path, 'utf8')
    writeFileSync(path, original.replace('var(--warp-', 'var(--warp-changed-'))
    expect(check()).toContain(`${source}: unreviewed source change`)
    writeFileSync(path, original.replace('@layer warp.layout {',
      '@layer warp.layout { :where(.new) { padding: var(--warp-space-page); }'))
    expect(check()).toContain(`${source}: unreviewed source change`)
    writeFileSync(path, original)
  }
})

test('records source spans and accounts for both shims', () => {
  const schema = JSON.parse(readFileSync(resolve(root, 'packages/warp-core/theme.schema.json'), 'utf8')) as {
    bindings: { source: string; fallback: string; fallbackSpan: number[]; classification: string }[]
  }
  const rows = schema.bindings.filter((row) => /\/(type|layout)\.css$/.test(row.source))
  expect(rows).toHaveLength(40)
  expect(rows.filter((row) => row.classification === 'binding')).toHaveLength(35)
  for (const row of rows) {
    const [start, end] = row.fallbackSpan
    expect(readFileSync(resolve(root, row.source), 'utf8').slice(start, end)).toBe(row.fallback)
  }
})


test('rejects changed and added status-light consumers', () => {
  setup()
  const source = 'docs/design/warp/tokens/warp-components.css'
  const path = resolve(fixture, source)
  const original = readFileSync(path, 'utf8')
  const statusRule = ':where([data-scope="status-light"]) { display: inline-flex; ' +
    'align-items: center; gap: 8px; font-size: var(--warp-text-body-size); }'
  expect(original).toContain(statusRule)
  const changed = statusRule.replace('--warp-text-body-size', '--warp-text-caption-size')
  writeFileSync(path, original.replace(statusRule, changed))
  expect(check()).toContain(`${source}: unreviewed source change`)
  writeFileSync(path, original.replace(':where([data-scope="status-light"]) {',
    ':where([data-scope="status-light"]) { padding: var(--warp-space-page);'))
  expect(check()).toContain(`${source}: unreviewed source change`)
})

test('records the status-light rule and exact source spans', () => {
  const source = 'docs/design/warp/tokens/warp-components.css'
  const schema = JSON.parse(readFileSync(resolve(root, 'packages/warp-core/theme.schema.json'), 'utf8')) as {
    bindings: { part?: string; property: string; fallback: string; fallbackSpan: number[]; classification: string }[]
  }
  const rows = schema.bindings.filter((row) => row.part === 'status-light')
  expect(rows.map((row) => row.property)).toEqual(['display', 'align-items', 'gap', 'font-size'])
  expect(rows.filter((row) => row.classification === 'binding')).toHaveLength(1)
  const text = readFileSync(resolve(root, source), 'utf8')
  for (const row of rows) {
    const [start, end] = row.fallbackSpan
    expect(text.slice(start, end)).toBe(row.fallback)
  }
})


test('records partial Button paint and shared tone fallback spans', () => {
  const source = 'docs/design/warp/tokens/warp-components.css'
  const schema = JSON.parse(readFileSync(resolve(root, 'packages/warp-core/theme.schema.json'), 'utf8')) as {
    bindings: { part?: string; source: string; classification: string; fallback: string; fallbackSpan: number[] }[]
  }
  const rows = schema.bindings.filter((row) => row.part === 'button' && row.source === source)
  expect(rows.filter((row) => row.classification === 'partial binding')).toHaveLength(3)
  expect(rows.filter((row) => row.classification === 'shared channel dependency')).toHaveLength(36)
  expect(rows.filter((row) => row.classification === 'partial channel dependency')).toHaveLength(5)
  const text = readFileSync(resolve(root, source), 'utf8')
  for (const row of rows) {
    const [start, end] = row.fallbackSpan
    expect(text.slice(start, end)).toBe(row.fallback)
  }
})

test('rejects changed and added Button consumers', () => {
  setup()
  const source = 'docs/design/warp/tokens/warp-components.css'
  const path = resolve(fixture, source)
  const original = readFileSync(path, 'utf8')
  const paint = 'background: var(--warp-tone-fill, var(--_fill))'
  expect(original).toContain(paint)
  writeFileSync(path, original.replace(paint, 'background: var(--warp-color-page)'))
  expect(check()).toContain(`${source}: unreviewed source change`)
  const host = ':where([data-scope="button"]) {'
  writeFileSync(path, original.replace(host, `${host} padding: var(--warp-space-page);`))
  expect(check()).toContain(`${source}: unreviewed source change`)
})


test('records reviewed Button variant rules and exact fallbacks', () => {
  const source = 'docs/design/warp/tokens/warp-components.css'
  const schema = JSON.parse(readFileSync(resolve(root, 'packages/warp-core/theme.schema.json'), 'utf8')) as {
    bindings: { variant?: string; fallback: string; fallbackSpan: number[]; classification: string }[]
  }
  const rows = schema.bindings.filter((row) => row.variant)
  expect(rows).toHaveLength(94)
  for (const variant of ['solid', 'soft', 'outline', 'ghost', 'frame', 'link']) {
    expect(rows.some((row) => row.variant === variant)).toBe(true)
  }
  const text = readFileSync(resolve(root, source), 'utf8')
  for (const row of rows) {
    const [start, end] = row.fallbackSpan
    expect(text.slice(start, end)).toBe(row.fallback)
  }
})

test('rejects changed and added Button variant declarations', () => {
  setup()
  const source = 'docs/design/warp/tokens/warp-components.css'
  const path = resolve(fixture, source)
  const original = readFileSync(path, 'utf8')
  const rule = ':where([data-scope="button"][data-emphasis="outline"]) {'
  expect(original).toContain(rule)
  const changed = original.replace('--_edge: var(--warp-color-border-strong)',
    '--_edge: var(--warp-color-border-control)')
  expect(changed).not.toBe(original)
  writeFileSync(path, changed)
  expect(check()).toContain(`${source}: unreviewed source change`)
  writeFileSync(path, original.replace(rule, `${rule} padding: var(--warp-space-page);`))
  expect(check()).toContain(`${source}: unreviewed source change`)
})

test('classifies the reviewed Button sites without claiming complete properties', async () => {
  const { buttonProperty } = await import('../scripts/theme-schema-button-properties.mjs')
  expect(() => buttonProperty('unrecognized-property', ':where([data-scope="button"])'))
    .toThrow('button: unclassified property unrecognized-property')
  const schema = JSON.parse(readFileSync(resolve(root, 'packages/warp-core/theme.schema.json'), 'utf8')) as {
    bindings: { variant?: string; classification: string; path?: string; property: string;
      localDependencies?: { token: string; definitions: { selector: string }[] }[] }[]
  }
  const rows = schema.bindings.filter((row) => row.variant)
  expect(rows.filter((row) => row.classification === 'variant declaration unresolved')).toHaveLength(0)
  expect(rows.filter((row) => row.classification === 'partial property binding')).toHaveLength(19)
  expect(rows.filter((row) => row.classification === 'external sweep dependency')).toHaveLength(2)
  expect(rows.filter((row) => row.classification === 'mechanical exclusion')).toHaveLength(30)
  expect(rows.find((row) => row.property === 'background-color')?.localDependencies)
    .toEqual(expect.arrayContaining([expect.objectContaining({
      token: '--_layer', definitions: expect.arrayContaining([expect.objectContaining({
        selector: ':where([data-scope="button"])',
      })]),
    })]))
})


test('checks Button radius source sites and upstream dependencies', () => {
  setup()
  const source = 'docs/design/warp/tokens/warp.css'
  const path = resolve(fixture, source)
  const original = readFileSync(path, 'utf8')
  expect(original).toContain('--warp-radius-control: calc(2px + 8px')
  writeFileSync(path, original.replace('--warp-radius-control: calc(2px + 8px',
    '--warp-radius-control: calc(2px + 9px'))
  expect(check()).toContain(`${source}: unreviewed radius dependency change`)
  writeFileSync(path, original.replace('--warp-radius-mark:', '--warp-radius-removed:'))
  expect(check()).toContain(`${source}: unreviewed radius dependency change`)
  writeFileSync(path, original)
  const component = 'docs/design/warp/tokens/warp-components.css'
  const componentPath = resolve(fixture, component)
  const componentText = readFileSync(componentPath, 'utf8')
  const host = componentText.indexOf(':where([data-scope="button"]) {')
  const site = componentText.indexOf('border-radius: var(--warp-radius-control);', host)
  expect(site).toBeGreaterThan(host)
  writeFileSync(componentPath, componentText.slice(0, site) +
    componentText.slice(site + 'border-radius: var(--warp-radius-control);'.length))
  expect(check()).toContain(`${component}: unreviewed source change`)
})

test('preserves Button radius dependency fallback spans', () => {
  const schema = JSON.parse(readFileSync(resolve(root, 'packages/warp-core/theme.schema.json'), 'utf8')) as {
    bindings: { part?: string; path?: string; source: string; fallback: string;
      fallbackSpan: number[]; classification: string }[]
  }
  const rows = schema.bindings.filter((row) => row.path === 'radius' &&
    (row.classification === 'radius dependency' || row.source.endsWith('warp-components.css') &&
      row.classification === 'partial property binding' && row.part === 'button' &&
      row.fallback === 'var(--warp-radius-control)'))
  expect(rows).toHaveLength(7)
  for (const row of rows) {
    const [start, end] = row.fallbackSpan
    expect(readFileSync(resolve(root, row.source), 'utf8').slice(start, end)).toBe(row.fallback)
  }
})


test('records attached, joined, RTL and clip radius geometry with exact spans', () => {
  const schema = JSON.parse(readFileSync(resolve(root, 'packages/warp-core/theme.schema.json'), 'utf8')) as {
    bindings: { classification: string; owner?: string; selector: string; source: string;
      fallback: string; fallbackSpan: number[] }[]
  }
  const rows = schema.bindings.filter((row) => row.classification === 'radius geometry dependency')
  expect(rows).toHaveLength(37)
  for (const [owner, count] of [
    ['attached Button host', 4], ['attached sweep child', 13], ['joined sweep child', 13],
    ['sweep child inherited radius', 1], ['sweep child LTR and RTL', 4], ['sweep child clip', 2],
  ] as const) expect(rows.filter((row) => row.owner === owner)).toHaveLength(count)
  expect(rows.some((row) => row.selector.includes(':dir(rtl)'))).toBe(true)
  expect(rows.some((row) => row.selector.includes('aria-orientation="vertical"'))).toBe(true)
  for (const row of rows) {
    const [start, end] = row.fallbackSpan
    expect(readFileSync(resolve(root, row.source), 'utf8').slice(start, end)).toBe(row.fallback)
  }
})

test('rejects changed group corners and joined sweep clips', () => {
  setup()
  for (const [source, originalValue, changedValue] of [
    ['docs/design/warp/tokens/warp-components.css', 'border-start-start-radius: 0;',
      'border-start-start-radius: 1px;'],
    ['docs/design/warp/tokens/warp.css', 'round var(--_round, var(--warp-sweep-radius))',
      'round var(--warp-sweep-radius)'],
  ]) {
    const path = resolve(fixture, source)
    const original = readFileSync(path, 'utf8')
    const anchor = source.includes('warp-components.css')
      ? ':where([data-scope="button-group"][data-attached] > [data-scope="button"]:not(:first-child))'
      : '/* the base wipes away'
    const start = original.indexOf(anchor)
    const site = original.indexOf(originalValue, start)
    expect(start).toBeGreaterThanOrEqual(0)
    expect(site).toBeGreaterThan(start)
    writeFileSync(path, original.slice(0, site) + changedValue + original.slice(site + originalValue.length))
    expect(check()).toContain(source.includes('warp-components.css')
      ? `${source}: unreviewed source change` : `${source}: unreviewed radius dependency change`)
    writeFileSync(path, original)
  }
})


test('retains frame, link and inherited Button radius fallbacks', () => {
  const schema = JSON.parse(readFileSync(resolve(root, 'packages/warp-core/theme.schema.json'), 'utf8')) as {
    bindings: { variant?: string; property: string; fallback: string; selector: string }[]
  }
  const rows = schema.bindings
  expect(rows.some((row) => row.variant === 'frame' && row.property === 'border-radius' &&
    row.fallback === 'min(var(--warp-radius-mark), 2px)')).toBe(true)
  expect(rows.some((row) => row.variant === 'frame' && row.property === '--warp-sweep-radius' &&
    row.fallback === '0px')).toBe(true)
  expect(rows.some((row) => row.variant === 'link' && row.property === 'border-radius' &&
    row.fallback === 'var(--warp-radius-mark)')).toBe(true)
  expect(rows.some((row) => row.selector.includes('button"])::before') &&
    row.property === 'border-radius' && row.fallback === 'inherit')).toBe(true)
})

test('audits the 13 tracked sources and distinguishes Button radius owners', () => {
  const schema = JSON.parse(readFileSync(resolve(root, 'packages/warp-core/theme.schema.json'), 'utf8')) as {
    sources: string[]
    radiusAudit: { source: string; selector: string; classification: string }[]
  }
  expect(schema.sources).toHaveLength(13)
  expect(schema.radiusAudit).toHaveLength(38)
  for (const [classification, count] of [
    ['Button scope candidate', 3], ['Button pseudo-element', 1], ['attached Button host', 2],
    ['attached sweep child', 4], ['excluded canvas skin', 1],
    ['generic button element candidate', 27],
  ] as const) expect(schema.radiusAudit.filter((row) => row.classification === classification)).toHaveLength(count)
  expect(schema.radiusAudit.find((row) => row.classification === 'excluded canvas skin')?.selector)
    .toContain('[data-skin="button"]')
  for (const row of schema.radiusAudit) {
    expect(readFileSync(resolve(root, row.source), 'utf8')).toContain(row.selector)
  }
})

test('detects a new Button radius rule in another canonical sheet', () => {
  setup()
  const source = 'docs/design/warp/tokens/warp-data.css'
  const path = resolve(fixture, source)
  const original = readFileSync(path, 'utf8')
  writeFileSync(path, `${original}\n:where([data-scope="button"]) { border-radius: 3px; }\n`)
  const output = check()
  expect(output).toContain('Button radius selector audit drift')
  expect(output).toContain('Drift: packages/warp-core/theme.schema.json')
  writeFileSync(path, `${original}\nbutton { border-radius: 4px; }\n`)
  expect(check()).toContain('Button radius selector audit drift')
})

test('does not infer Button ownership from a negative selector', async () => {
  const { auditButtonRadius } = await import('../scripts/theme-schema-radius-audit.mjs')
  const css = ':where([data-scope="card"]:not([data-scope="button"])) { border-radius: 2px; }'
  const rows = auditButtonRadius(['fixture.css'], () => css)
  expect(rows).toHaveLength(1)
  expect(rows[0].classification).toBe('excluded negative or query-only scope')
})

test('closed coverage fixture passes and rejects missing or unmapped evidence', () => {
  fixture = mkdtempSync(resolve(tmpdir(), 'warp-coverage-'))
  const file = resolve(fixture, 'coverage.json')
  const good = {
    sources: ['a.css'], trackedSources: ['a.css'], discovered: ['a:rule:color:0'],
    sites: [{ id: 'a:rule:color:0', source: 'a.css', fallback: 'red',
      classification: 'binding', group: 'link.rest.text' }],
    groups: [{ id: 'link.rest.text', token: '--warp-link-text', domain: 'color',
      units: 'forbidden', status: 'complete' }],
  }
  const run = (value: unknown) => {
    writeFileSync(file, JSON.stringify(value))
    return spawnSync(process.execPath, [script, '--coverage-fixture', file], { encoding: 'utf8' })
  }
  expect(run(good).status).toBe(0)
  const bad = [
    { ...good, sites: [] },
    { ...good, sites: [{ ...good.sites[0], classification: 'unknown' }] },
    { ...good, sites: [{ ...good.sites[0], fallback: '' }] },
    { ...good, sites: [{ ...good.sites[0], group: 'missing' }] },
    { ...good, trackedSources: ['a.css', 'missing.css'] },
    { ...good, groups: [{ ...good.groups[0], units: 'bad' }] },
    { ...good, groups: [{ ...good.groups[0], domain: 'bad' }] },
    { ...good, sources: ['a.css', 'extra.css'] },
    { ...good, groups: [good.groups[0], good.groups[0]] },
  ]
  for (const value of bad) expect(run(value).status).toBe(1)
})
