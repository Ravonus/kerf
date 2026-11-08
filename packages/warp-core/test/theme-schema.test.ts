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
  expect(check()).toContain('reviewed records: 91')
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
    bindings: { part?: string; classification: string; fallback: string; fallbackSpan: number[] }[]
  }
  const rows = schema.bindings.filter((row) => row.part === 'button')
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
