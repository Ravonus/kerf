import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import ts from 'typescript'
import { declarations, typedProgram } from './typed-program.js'

const require = createRequire(import.meta.url)
const { derivedWrite } = require('../src/infer/derived-writes.cjs')
const { withBoxProps } = require('../src/infer/box-props.cjs')
const { Session } = require('../src/infer/session.cjs')
const prefix = "import { state, derived, type State, type Derived } from '@weft-js/core'; "
  + 'const n = state(0); const d = derived(() => 0); '

function findings(source: string, extra: Record<string, string> = {}) {
  const program = typedProgram(source, extra)
  return program.getSemanticDiagnostics(program.getSourceFile('/app/App.tsx')).map((diagnostic) =>
    derivedWrite(ts, program, diagnostic) ?? { code: `TS${diagnostic.code}` })
}

const codes = (source: string) => findings(source).map((finding: { code: string }) => finding.code)

describe('W007 core Derived writes', () => {
  it('maps a real TS2540 to error severity and state/pure-derived advice without edits', () => {
    const result = findings(`${prefix} d.value = 1`)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ code: 'W007', severity: 'error' })
    expect(result[0].why).toContain('Derived.value')
    expect(result[0].help).toContain('state(initial)')
    expect(result[0].help).toContain('state.linked')
    expect(result[0].help).toContain('pure')
    expect(result[0].edits).toBeUndefined()
  })

  it('covers assignments, compound updates, computed value keys and destructuring', () => {
    for (const write of ['d.value = 1', 'd.value += 1', 'd.value ||= 1', '++d.value',
      'd.value--', "d['value'] = 1", "d['value']++", '({ x: d.value } = { x: 1 })',
      '[d.value] = [1]']) {
      const result = codes(`${prefix} ${write}`)
      expect(result.filter((code) => code === 'W007')).toHaveLength(1)
      expect(result).not.toContain('TS2540')
    }
  })

  it('follows core import, namespace, receiver and written type aliases', () => {
    for (const source of [
      "import { derived as calculate } from '@weft-js/core'; const d = calculate(() => 0); d.value = 1",
      "import * as core from '@weft-js/core'; const d = core.derived(() => 0); d.value++",
      `${prefix} const alias = d; alias.value = 1`,
      `${prefix} type Reading = Derived<number>; declare const alias: Reading; alias.value = 1`,
      `${prefix} interface Reading extends Derived<number> { label: string }
       declare const alias: Reading; alias.value++`,
      `${prefix} declare const alias: Derived<number> & { label: string }; alias.value = 1`,
      `${prefix} declare const alias: Derived<number> | Derived<string>; alias.value = 1`,
    ]) expect(codes(source)).toEqual(['W007'])
  })

  it('retains TS2540 for ordinary readonly objects, shadowed names and State projections', () => {
    for (const source of [
      `${prefix} const ordinary: { readonly value: number } = { value: 0 }; ordinary.value = 1`,
      `import { state } from '@weft-js/core'; interface Derived<T> { readonly value: T }
       const ordinary: Derived<number> = { value: 0 }; ordinary.value = 1`,
      `${prefix} type FrozenState = { readonly [K in keyof State<number>]: State<number>[K] };
       declare const frozen: FrozenState; frozen.value = 1`,
      `${prefix} type ValueOnly = { readonly [K in 'value']: Derived<number>[K] };
       declare const valueOnly: ValueOnly; valueOnly.value = 1`,
      `${prefix} d.derivedBrand = 'derived'`,
      `${prefix} n.stateBrand = 'state'`,
    ]) expect(codes(source)).toEqual(['TS2540'])
  })

  it('does not relabel State writes, reads, any/unknown receivers or mixed unions', () => {
    expect(codes(`${prefix} n.value = 1; n.value++; const read = d.value`)).toEqual([])
    for (const source of [
      `${prefix} declare const weak: any; weak.value = 1`,
      `${prefix} declare const opaque: unknown; opaque.value = 1`,
      `${prefix} declare const mixed: State<number> | Derived<number>; mixed.value = 1`,
      `${prefix} declare const unknownType: Missing; unknownType.value = 1`,
    ]) expect(codes(source)).not.toContain('W007')
    expect(codes(`${prefix} declare const known: Derived<any>; known.value = 1`)).toEqual(['W007'])
  })

  it('recognizes the exported Derived alias without mistaking a matching State mapping for it', () => {
    const mapped = `declare module '@weft-js/core' {
      export interface State<T> { value: T; readonly stateBrand: 'state' }
      export type Derived<T> = { readonly [K in keyof State<T>]: State<T>[K] };
      export function derived<T>(read: () => T): Derived<T>;
    }`
    const source = "import { derived } from '@weft-js/core'; const d = derived(() => 0); d.value = 1"
    expect(findings(source, { '/app/core.d.ts': mapped })).toMatchObject([{ code: 'W007' }])
  })

  it('keeps repaired state writes and source-driven pure derivations quiet', () => {
    for (const source of [
      "import { state } from '@weft-js/core'; const d = state(0); d.value = 1",
      `${prefix} n.value = 1; const next = derived(() => n.value + 1)`,
    ]) expect(findings(source)).toEqual([])
  })

  it('checks plain TypeScript through analyze/all and clears repaired findings', async () => {
    for (const filename of ['state.ts', 'state.mts', 'state.cts']) {
      const root = mkdtempSync(join(tmpdir(), 'weft-derived-write-'))
      const file = join(root, filename)
      writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
        strict: true, noLib: true, module: 'esnext', moduleResolution: 'node',
      } }))
      writeFileSync(join(root, 'core.d.ts'), declarations)
      writeFileSync(file, `${prefix} d.value = 1`)
      const session = new Session(ts, root)
      try {
        expect((await session.analyze()).errors.get(file)).toMatchObject([{ code: 'W007' }])
        expect((await session.all()).errors.get(file)).toMatchObject([{ code: 'W007' }])
        writeFileSync(file, `${prefix} n.value = 1`)
        session.engine.set(file)
        session.touch([file])
        expect((await session.analyze([file])).errors.size).toBe(0)
      } finally {
        session.close()
        rmSync(root, { recursive: true, force: true })
      }
    }
  })

  it('uses native-host fallback for TS2540 outside JSX and requires matching error codes', () => {
    let started = 0
    const raw = [{ code: 2540, start: 10, length: 1 }, { code: 2322, start: 10, length: 1 }]
    const host = withBoxProps({ diagnostics: () => raw, update() {}, close() {} }, () => {
      started++
      return { diagnostics: () => [{ code: 2540, start: 10, weft: { code: 'W007' } }],
        update() {}, close() {} }
    })
    expect(started).toBe(0)
    expect(host.diagnostics('state.ts')[0].weft.code).toBe('W007')
    expect(host.diagnostics('state.ts')[1]).toEqual(raw[1])
    expect(host.diagnostics('state.tsx')[1]).toEqual(raw[1])
    expect(started).toBe(1)
    host.close()
  })
})
