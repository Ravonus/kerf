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
  expect(check()).toContain('classified declarations: 3')
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
