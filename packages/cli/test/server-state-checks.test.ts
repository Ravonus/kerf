import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { serverStateChecks } from '../src/server-state-checks.mjs'

const made: string[] = []
afterEach(() => {
  for (const root of made.splice(0)) rmSync(root, { recursive: true, force: true })
})

function seed(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'kerf-server-state-'))
  made.push(root)
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true })
    writeFileSync(join(root, file), text)
  }
  return root
}

const shared = "import { state } from '@kerf-js/core'; export const shared = state(0)"
const inspect = (root: string, exclude: string[] = []) =>
  serverStateChecks(root, { files: [], exclude })

const defaultForms = [
  'function (n = state(0)) {}',
  'async function (n = state(0)) {}',
  'function* (n = state(0)) {}',
  'async function* (n = state(0)) {}',
  '(n = state(0)) => {}',
  'async (n = state(0)) => {}',
]

describe('W030 server reachability', () => {
  it('reports a seeded reachable allocation with error severity, ownership advice and no edits', () => {
    const root = seed({
      'src/entry-server.ts':
        "import { shared } from './shared'; export const run = () => shared.value",
      'src/shared.ts': shared,
      'src/main.ts': "import './browser'",
      'src/browser.ts': shared,
    })
    const result = inspect(root)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ code: 'W030', severity: 'error', file: 'src/shared.ts' })
    expect(result[0].why).toContain('src/entry-server.ts')
    expect(result[0].fix.text).toContain('context')
    expect(result[0].fix.text).toContain('state.global')
    expect(result[0].fix.edits).toBeUndefined()
  })

  it('follows value imports, side effects, reexports, cycles and local path aliases once', () => {
    const root = seed({
      'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '#/*': ['./src/*'] } } }),
      'src/entry-server.ts': "export { shared } from '#/barrel'",
      'src/barrel.ts': "export * from './shared'; import './side'; export * from './loop'",
      'src/shared.ts': shared,
      'src/side.ts': shared,
      'src/loop.ts': "export * from './barrel'",
      'src/unreachable.ts': shared,
    })
    expect(inspect(root).map((finding) => [finding.code, finding.file])).toEqual([
      ['W030', 'src/shared.ts'],
      ['W030', 'src/side.ts'],
    ])
  })

  it('keeps type-only imports and reexports out of server reachability', () => {
    const root = seed({
      'src/app.server.ts':
        "import type { Thing } from './types'; import { type Other } from './other'; " +
        "export type { Third } from './third'; export { type Fourth } from './fourth'; export type * from './fifth'",
      'src/types.ts': `${shared}; export interface Thing {}`,
      'src/other.ts': `${shared}; export interface Other {}`,
      'src/third.ts': `${shared}; export interface Third {}`,
      'src/fourth.ts': `${shared}; export interface Fourth {}`,
      'src/fifth.ts': shared,
    })
    expect(inspect(root)).toEqual([])
  })
})

describe('W030 entry points and aliases', () => {
  it('recognizes server modules and SSR routes without treating browser roots as server entries', () => {
    for (const file of [
      'src/server/handler.ts',
      'src/worker.server.ts',
      'src/server.ts',
      'src/routes/index.tsx',
    ])
      expect(inspect(seed({ [file]: shared }))[0].code).toBe('W030')
    expect(inspect(seed({ 'src/main.tsx': "import './shared'", 'src/shared.ts': shared }))).toEqual(
      [],
    )
    expect(
      inspect(
        seed({
          'src/entry-server.ts': 'export const run = () => 0',
          'src/browser.client.ts': shared,
        }),
      ),
    ).toEqual([])
  })

  it('resolves import, namespace, const and destructured aliases with binding identities', () => {
    for (const source of [
      "import { state as make } from '@kerf-js/core'; export const value = make(0)",
      "import * as core from '@kerf-js/core'; export const value = core.state(0)",
      "import * as core from '@kerf-js/core'; const c = core; const make = c['state']; make(0)",
      "import { state } from '@kerf-js/core'; const first = state; const second = first; second(0)",
      "import * as core from '@kerf-js/core'; const { state: make } = core; make(0)",
      "import { state } from '@kerf-js/core'; state.linked(() => 0)",
      "import { state } from '@kerf-js/core'; const link = state['linked']; link(() => 0)",
    ])
      expect(inspect(seed({ 'src/app.server.ts': source })).map((finding) => finding.code)).toEqual(
        ['W030'],
      )
  })

  it('ignores unrelated, shadowed, type-only, unknown and reassigned state functions', () => {
    for (const source of [
      "import { state } from 'other'; state(0)",
      'const state = value => ({ value }); state(0)',
      'state(0)',
      "import type { state } from '@kerf-js/core'; state(0)",
      "import { state } from '@kerf-js/core'; { const state = value => value; state(0) }",
      "import * as core from '@kerf-js/core'; { const core = { state: value => value }; core.state(0) }",
      "import { state } from '@kerf-js/core'; const make = state; make = value => value; make(0)",
      "import { state } from '@kerf-js/core'; const make = state; ({ make } = other); make(0)",
      "import { state } from '@kerf-js/core'; let make = state; make = value => value; make(0)",
    ])
      expect(inspect(seed({ 'src/app.server.ts': source }))).toEqual([])
  })
})

describe('W030 globals and eager execution', () => {
  it('respects explicit globals and deferred request/component/context factories', () => {
    for (const source of [
      "import { state } from '@kerf-js/core'; export const value = state.global(0)",
      "import { state } from '@kerf-js/core'; const shared = state['global']; shared(0)",
      "import * as core from '@kerf-js/core'; const c = core; c.state.global(0)",
      "import { state } from '@kerf-js/core'; export function request() { return state(0) }",
      "import { state } from '@kerf-js/core'; export const Component = () => { const n = state(0); return n }",
      "import { state, context } from '@kerf-js/core'; export const scope = context(() => state(0))",
      "import { state, defineState } from '@kerf-js/core'; export const scope = defineState(() => state(0))",
      "import { state } from '@kerf-js/core'; class Item { value = state(0) }",
    ])
      expect(inspect(seed({ 'src/app.server.ts': source }))).toEqual([])
  })

  it('detects eager IIFEs and static fields while factory declarations remain quiet', () => {
    const root = seed({
      'src/app.server.ts':
        "import { state } from '@kerf-js/core'; " +
        'const first = (() => state(0))(); class Item { static value = state(0) } ' +
        'export function request() { return state(0) }',
    })
    expect(inspect(root).map((finding) => finding.code)).toEqual(['W030', 'W030'])
  })

  it('keeps sync and async generator IIFE bodies deferred', () => {
    for (const invocation of [
      '(function* () { state(0) })()',
      '(async function* () { state(0) })()',
      '(function* values() { const n = state(0); yield n })()',
      '(async function* values() { const n = state(0); yield n })()',
    ]) {
      const source = "import { state } from '@kerf-js/core'; " + invocation
      expect(inspect(seed({ 'src/app.server.ts': source }))).toEqual([])
    }
  })

  it('still visits ordinary and async ordinary IIFE bodies', () => {
    for (const invocation of [
      '(() => state(0))()',
      '(function () { state(0) })()',
      '(async () => { state(0); await wait() })()',
      '(async function () { state(0); await wait() })()',
    ]) {
      const source = "import { state } from '@kerf-js/core'; " + invocation
      expect(inspect(seed({ 'src/app.server.ts': source })).map((finding) => finding.code)).toEqual(
        ['W030'],
      )
    }
  })
})

describe('W030 parameter defaults', () => {
  it('preserves eager generator parameter initializers without visiting their bodies', () => {
    for (const invocation of [
      '(function* (n = state(0)) { state(1) })()',
      '(async function* (n = state(0)) { state(1) })()',
    ]) {
      const source = "import { state } from '@kerf-js/core'; " + invocation
      expect(inspect(seed({ 'src/app.server.ts': source })).map((finding) => finding.code)).toEqual(
        ['W030'],
      )
    }
  })

  it('skips defaults for proven nonundefined IIFE arguments in every function form', () => {
    for (const form of defaultForms) {
      for (const argument of [
        '123',
        '0',
        'null',
        'false',
        "'value'",
        '{}',
        '[]',
        '1n',
        '/value/',
        '() => 0',
        'class {}',
        '(123 as number)',
        '-1',
        'typeof missing',
        'new Object()',
      ]) {
        const source = `import { state } from '@kerf-js/core'; (${form})(${argument})`
        expect(inspect(seed({ 'src/app.server.ts': source }))).toEqual([])
      }
    }
  })

  it('keeps omitted and explicit undefined defaults in every function form', () => {
    for (const form of defaultForms) {
      for (const argument of ['', 'undefined', 'void 0', '(undefined as unknown as number)']) {
        const source = `import { state } from '@kerf-js/core'; (${form})(${argument})`
        expect(
          inspect(seed({ 'src/app.server.ts': source })).map((finding) => finding.code),
        ).toEqual(['W030'])
      }
    }
  })
})

describe('W030 arguments and rechecks', () => {
  it('uses fixed positions before spreads and leaves unknown values conservative', () => {
    for (const [invocation, count] of [
      ['(function* (a = state(0), b = state(1)) {})(123)', 1],
      ['(function* (a = state(0), b = state(1)) {})(123, undefined)', 1],
      ['(function* (a = state(0), b = state(1)) {})(undefined, 123)', 1],
      ['(async (a = state(0), b = state(1)) => {})(void 0, 123)', 1],
      ['(function* (a = state(0), b = state(1)) {})(123, ...values)', 1],
      ['(function* (a = state(0), b = state(1)) {})(...values, 123)', 2],
      ['(function* (n = state(0)) {})(unknown)', 1],
      ['(function* (n = state(0)) {})(value.member)', 1],
      ['(function* (n = state(0)) {})(getValue())', 1],
      ['(function (this: unknown, n = state(0)) {})(123)', 0],
      ['(function (this: unknown, n = state(0)) {})()', 1],
    ] as const) {
      const source = "import { state } from '@kerf-js/core'; " + invocation
      expect(inspect(seed({ 'src/app.server.ts': source })).length).toBe(count)
    }
  })

  it('preserves argument effects and body evaluation independently from defaults', () => {
    for (const [invocation, count] of [
      ['(function* (n = state(0)) { state(1) })({ shared: state(2) })', 1],
      ['(async function* (n = state(0)) { state(1) })(123)', 0],
      ['(function (n = state(0)) { state(1) })(123)', 1],
      ['(async function (n = state(0)) { state(1); await wait() })(123)', 1],
      ['((n = state(0)) => state(1))(123)', 1],
      ['(function* (n = state(0)) { state(1) })()', 1],
    ] as const) {
      const source = "import { state } from '@kerf-js/core'; " + invocation
      expect(inspect(seed({ 'src/app.server.ts': source })).length).toBe(count)
    }
  })

  it('rechecks repaired sources and honors graph exclusions', () => {
    const root = seed({ 'src/entry-server.ts': "import './shared'", 'src/shared.ts': shared })
    expect(inspect(root)[0].code).toBe('W030')
    writeFileSync(join(root, 'src/shared.ts'), shared.replace('state(0)', 'state.global(0)'))
    expect(inspect(root)).toEqual([])
    writeFileSync(
      join(root, 'src/shared.ts'),
      shared.replace('export const shared = state(0)', 'export const request = () => state(0)'),
    )
    expect(inspect(root)).toEqual([])
    expect(
      inspect(
        seed({
          'src/entry-server.ts': "import './ignored/shared'",
          'src/ignored/shared.ts': shared,
        }),
        ['src/ignored/**'],
      ),
    ).toEqual([])
  })
})
