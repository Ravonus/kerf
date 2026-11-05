import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import ts from 'typescript'
import { declarations, typedProgram } from './typed-program.js'

const require = createRequire(import.meta.url)
const { boxMismatch, withBoxProps } = require('../src/infer/box-props.cjs')
const { Session } = require('../src/infer/session.cjs')
const prefix = `
import { state, derived, type State, type Derived } from '@weft-js/core';
declare function Value(props: { n: number }): JSX.Element;
declare function Box(props: { n: State<number> }): JSX.Element;
declare function ReadonlyBox(props: { n: Derived<number> }): JSX.Element;
const n = state(1); const d = derived(() => 1);
`

function findings(source: string, extra: Record<string, string> = {}) {
  const program = typedProgram(source, extra)
  return program.getSemanticDiagnostics(program.getSourceFile('/app/App.tsx')).map((diagnostic) =>
    boxMismatch(ts, program, diagnostic) ?? { code: `TS${diagnostic.code}` })
}

const codes = (source: string) => findings(source).map((finding: { code: string }) => finding.code)

describe('W008 typed component props', () => {
  it('reports both directions with error severity, advice and no edits', () => {
    for (const [jsx, direction] of [
      ['<Value n={n} />', 'expects a value'],
      ['<Value n={d} />', 'expects a value'],
      ['<Box n={n.value} />', 'expects a core box'],
      ['<ReadonlyBox n={d.value} />', 'expects a core box'],
    ]) {
      const result = findings(`${prefix} const app = ${jsx}`)
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ code: 'W008', severity: 'error' })
      expect(result[0].why).toContain(direction)
      expect(result[0].help).toContain(direction === 'expects a value' ? '.value' : 'box itself')
      expect(result[0].edits).toBeUndefined()
    }
  })

  it('requires the originating box to satisfy the whole expected contract', () => {
    const accepts = [
      `${prefix} const a = <Box n={n.value} />`,
      `${prefix} const a = <Box n={n['value']} />`,
      `${prefix} const a = <Box n={(n.value as number)} />`,
      `${prefix} const alias = n; const a = <Box n={alias.value} />`,
      `${prefix} type Counter = State<number>;
       declare function Card(props: { n: Counter }): JSX.Element;
       const a = <Card n={n.value} />`,
      `${prefix} declare function Card(props: { n: State<number> | Derived<number> }): JSX.Element;
       const a = <Card n={n.value} />`,
      `${prefix} declare function Card(props: { n: State<number> | undefined }): JSX.Element;
       const a = <Card n={n.value} />`,
      `${prefix} type Labeled = State<number> & { label: string };
       declare const labeled: Labeled;
       declare function Card(props: { n: Labeled }): JSX.Element;
       const a = <Card n={labeled.value} />`,
    ]
    for (const source of accepts) expect(codes(source)).toEqual(['W008'])
    const preserves = [
      `${prefix} declare function Card(props: { n: State<number> & { label: string } }): JSX.Element;
       const a = <Card n={n.value} />`,
      `${prefix} type Labeled = State<number> & { label: string };
       declare function Card(props: { n: Labeled }): JSX.Element;
       const a = <Card n={n['value']} />`,
      `${prefix} type Labeled = State<number> & { label: string };
       const alias = n; declare function Card(props: { n: Labeled }): JSX.Element;
       const a = <Card n={alias.value} />`,
      `${prefix} type Choice = (State<number> & { label: string })
         | (State<number> & { id: number });
       declare function Card(props: { n: Choice }): JSX.Element;
       const a = <Card n={n.value} />`,
      `${prefix} declare const optional: State<number> | undefined;
       const a = <Box n={optional?.value!} />`,
      `${prefix} const a = <Box n={1} />`,
      `${prefix} const scalar = n.value; const a = <Box n={scalar} />`,
      `${prefix} const wrong = state('wrong'); const a = <Box n={wrong.value as unknown as number} />`,
      `${prefix} const item = state({ count: 1 });
       declare function Detail(props: { n: { count: number } & { label: string } }): JSX.Element;
       const a = <Detail n={item} />`,
    ]
    for (const source of preserves) expect(codes(source)).toEqual(['TS2322'])
    expect(findings(`${prefix} type Labeled = State<number> & { label: string };
      declare const labeled: Labeled;
      declare function Card(props: { n: Labeled }): JSX.Element;
      const a = <Card n={labeled} />`)).toEqual([])
  })

  it('keeps repaired value and valid box props quiet', () => {
    for (const jsx of ['<Value n={n.value} />', '<Value n={d.value} />',
      '<Box n={n} />', '<ReadonlyBox n={d} />'])
      expect(findings(`${prefix} const app = ${jsx}`)).toEqual([])
  })

  it('follows import, namespace, type and component aliases', () => {
    expect(codes(`import * as core from '@weft-js/core';
      type Counter = core.State<number>;
      declare function Card(props: { n: number }): JSX.Element;
      const Alias = Card; const n: Counter = core.state(1); const a = <Alias n={n} />`))
      .toEqual(['W008'])
    const result = findings(`import { state as make } from '@weft-js/core';
      import type { Counter } from './types';
      declare function Card(props: { n: Counter }): JSX.Element;
      const n = make(1); const a = <Card n={n.value} />`, {
      '/app/types.ts': "export type { State as Counter } from '@weft-js/core';",
    })
    expect(result).toMatchObject([{ code: 'W008' }])
  })

  it('does not guess from any, unknown, shadowed names or ordinary value members', () => {
    for (const source of [
      `${prefix} declare const value: any; const a = <Box n={value} />`,
      `${prefix} declare const value: unknown; const a = <Box n={value} />`,
      `${prefix} const plain = { value: 1 }; const a = <Value n={plain} />`,
      `${prefix} type ValueOnly = { [K in 'value']: State<number>[K] };
       declare function Partial(props: { n: ValueOnly }): JSX.Element; const a = <Partial n={1} />`,
      `import { state } from '@weft-js/core'; type State<T> = { value: T };
       declare function Card(props: { n: State<number> }): JSX.Element; const a = <Card n={1} />`,
      `import { state } from '@weft-js/core'; type Derived<T> = { value: T };
       declare function Card(props: { n: number }): JSX.Element;
       const fake: Derived<number> = { value: 1 }; const a = <Card n={fake} />`,
    ]) expect(codes(source)).not.toContain('W008')
  })

  it('preserves unrelated type errors, valid unions, native props and non-prop errors', () => {
    expect(codes(`${prefix} const s = state('wrong'); const a = <Value n={s} />`))
      .toEqual(['TS2322'])
    for (const source of [
      `${prefix} declare function Either(props: { n: State<number> | number }): JSX.Element;
       const a = <Either n={n} />`,
      `${prefix} const a = <div title={n} />`,
      `${prefix} const value: number = n;`,
      `${prefix} const a = <Missing n={n} />`,
      `${prefix} declare const weak: State<any>; const a = <Value n={weak} />`,
    ]) expect(codes(source)).not.toContain('W008')
  })

  it('checks explicitly typed projects and clears a repaired finding after an edit', async () => {
    const root = mkdtempSync(join(tmpdir(), 'weft-box-props-'))
    const file = join(root, 'App.tsx')
    writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
      strict: true, noLib: true, jsx: 'preserve', module: 'esnext', moduleResolution: 'node',
    } }))
    writeFileSync(join(root, 'core.d.ts'), declarations)
    writeFileSync(file, `${prefix} const a = <Value n={n} />`)
    const session = new Session(ts, root)
    try {
      const first = await session.analyze()
      expect(first.started).toBe(true)
      expect(first.errors.get(file)).toMatchObject([{ code: 'W008', severity: 'error' }])
      writeFileSync(file, `${prefix} const a = <Value n={n.value} />`)
      session.engine.set(file)
      session.touch([file])
      expect((await session.analyze([file])).errors.size).toBe(0)
      expect((await session.all()).errors.size).toBe(0)
    } finally {
      session.close()
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('maps native errors lazily and leaves other diagnostics intact', () => {
    let started = 0, closed = 0
    const raw = [{ code: 2322, start: 10, length: 1 }, { code: 2339, start: 10, length: 1 }]
    const host = withBoxProps({ diagnostics: () => raw, update() {}, close() {} }, () => {
      started++
      return { diagnostics: () => [{ start: 10, weft: { code: 'W008' } }],
        update() {}, close() { closed++ } }
    })
    expect(started).toBe(0)
    expect(host.diagnostics('App.tsx')[0].weft.code).toBe('W008')
    expect(host.diagnostics('App.tsx')[1]).toEqual(raw[1])
    expect(started).toBe(1)
    host.close()
    expect(closed).toBe(1)
  })
})
