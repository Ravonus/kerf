// What each deploy target can do for live data, from its preset alone, and what `verify` may touch.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  literalSecrets,
  livePlan,
  liveTarget,
  refusal,
  resolveTarget,
  scanRequired,
} from '../src/live-target.mjs'

const source = { name: 'postgresql', tables: ['todos'] }
const required = [{ name: 'listTodos', file: 'src/server/todos.ts' }]
const codes = (p: { diagnostics: { code: string; severity: string }[] }) =>
  p.diagnostics.map((d) => `${d.code}:${d.severity}`)

const HELD = [
  'node',
  'node_server',
  'node_cluster',
  'bun',
  'deno_server',
  'digitalocean',
  'render',
  'koyeb',
  'zeabur',
  'heroku',
]
const FUNCTIONS = [
  'vercel',
  'vercel_edge',
  'netlify',
  'netlify_edge',
  'aws_lambda',
  'aws-lambda',
  'azure_functions',
  'azure_swa',
  'firebase',
  'cloudflare_module',
  'cloudflare_pages',
  'cloudflare_durable',
  'deno_deploy',
]

describe.each(HELD)('%s, a long-running server', (preset) => {
  test('the feed runs, and `required` is fine', () => {
    expect(liveTarget(preset).held).toBe(true)
    expect(livePlan({ preset, source, required })).toMatchObject({
      mode: 'feed',
      held: true,
      diagnostics: [],
    })
  })
  test('required with no `changes` is R013', () => {
    expect(codes(livePlan({ preset, required }))).toEqual(['R013:error'])
  })
})

describe.each(FUNCTIONS)('%s, functions', (preset) => {
  test('`changes` warns, and says what instead', () => {
    const plan = livePlan({ preset, source })
    expect(plan.mode).toBe('off')
    expect(codes(plan)).toEqual(['R014:warning'])
    expect(plan.options.join()).toMatch(/weft db listen/)
    expect(plan.options.join()).toMatch(/server preset/)
  })
  test('required is R013, naming the query and the options', () => {
    const d = livePlan({ preset, source, required }).diagnostics[0]!
    expect(d).toMatchObject({ code: 'R013', severity: 'error' })
    expect(d.why).toMatch(/`listTodos` requires/)
    expect(d.why).toContain(preset)
    expect(d.why).toMatch(/weft db listen.*server preset/s)
  })
  test('an external listener satisfies it', () => {
    expect(livePlan({ preset, source: { ...source, external: true }, required })).toMatchObject({
      mode: 'external',
      diagnostics: [],
    })
  })
})

test('no `changes`, nothing required: mutations only, and silent', () => {
  expect(livePlan({ preset: 'vercel' })).toMatchObject({ mode: 'app', diagnostics: [] })
})

describe('scanRequired', () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-required-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))
  test('on a query, and at a call', () => {
    mkdirSync(join(dir, 'src/server'), { recursive: true })
    writeFileSync(
      join(dir, 'src/server/a.ts'),
      `export const one = query({ tags: ['a'], run: () => 1 })\nexport const two = query({ live: { required: true }, run: () => 1 })\n`,
    )
    writeFileSync(
      join(dir, 'src/page.tsx'),
      `const x = three.live({ id }, { required: true })\nconst y = four.live()\n`,
    )
    expect(
      scanRequired(dir)
        .map((r) => r.name)
        .sort((a, b) => a.localeCompare(b)),
    ).toEqual(['three', 'two'])
  })
})

describe('verify targets', () => {
  test('`true` finds the two variables, and tells a newcomer what to set', () => {
    expect(
      resolveTarget(true, { env: { WEFT_STAGING_URL: 'https://staging.x.dev' } }),
    ).toMatchObject({ url: 'https://staging.x.dev', db: undefined })
    expect(
      resolveTarget(true, { env: { STAGING_DATABASE_URL: 'postgres://u@staging/x' } }),
    ).toMatchObject({ db: 'postgres://u@staging/x' })
    expect((resolveTarget(true, { env: {} }) as { missing: string }).missing).toMatch(
      /WEFT_STAGING_URL.*STAGING_DATABASE_URL/s,
    )
  })
  test('a name reads `live.targets`; its `db` is a variable', () => {
    const targets = { staging: { url: 'https://s.x.dev', db: 'S_DB', production: false } }
    expect(resolveTarget('staging', { targets, env: { S_DB: 'postgres://u@h/x' } })).toEqual({
      name: 'staging',
      url: 'https://s.x.dev',
      db: 'postgres://u@h/x',
      marked: true,
    })
    expect((resolveTarget('staging', { targets, env: {} }) as { missing: string }).missing).toMatch(
      /`S_DB`/,
    )
    expect((resolveTarget('qa', { targets, env: {} }) as { missing: string }).missing).toMatch(
      /live: \{ targets/,
    )
  })
  test('`{ db: undefined }` is an unset variable, not a target', () => {
    expect((resolveTarget({ db: undefined }, { env: {} }) as { missing: string }).missing).toMatch(
      /env var/,
    )
  })
  test.each([
    ['https://prod.acme.com'],
    ['https://app-production.acme.com'],
    ['https://www.acme.com'],
    ['https://live.acme.com'],
  ])('%s is refused', (url) => {
    expect(refusal({ name: 'inline', url, marked: false })).toMatch(/looks like production/)
    expect(
      refusal(
        { name: 'staging', url, marked: true },
        { targets: { staging: { production: false } } },
      ),
    ).toMatch(/looks like production/)
  })
  test('marked is enough for a host that says nothing, and unmarked is not', () => {
    const t = { name: 'staging', db: 'postgres://u@db9.internal/app', marked: true }
    expect(refusal(t, { targets: { staging: { production: false } } })).toBeUndefined()
    expect(refusal({ ...t, marked: false, name: 'inline' })).toMatch(/nothing says/)
  })
})

test('R020: a password in source is found; a URL with none, and an env read, are not', () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-secret-'))
  mkdirSync(join(dir, 'src'))
  writeFileSync(
    join(dir, 'src/a.ts'),
    `live: { verify: { db: 'postgres://app:hunter2@staging/x' } }\n`,
  )
  writeFileSync(
    join(dir, 'src/b.ts'),
    `live: { verify: { url: 'https://staging.x.dev', db: process.env.DB } }\n`,
  )
  expect(literalSecrets(dir)).toEqual([{ file: 'src/a.ts', line: 1 }])
  rmSync(dir, { recursive: true })
})
