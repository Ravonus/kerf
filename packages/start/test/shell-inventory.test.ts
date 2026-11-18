import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { expect, test } from 'vitest'
import { checkShellContracts, requireShellContracts } from '../src/vite/shell-contracts.mjs'

test('one source scan lists every missing contract including unsupported declaration forms', () => {
  const root = mkdtempSync(join(tmpdir(), 'kerf-shell-inventory-'))
  const put = (path: string, source: string) => {
    const file = join(root, path)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, source)
  }
  try {
    put('src/routes/index.tsx', 'export const load = () => null')
    put('src/routes/_layout.tsx', 'export function load() {}')
    put(
      'src/routes/ok.tsx',
      'export const load = () => null; export const routeData = { initial: schema }',
    )
    put(
      'src/server/ops.ts',
      `
      import { query, mutation as act, channel } from '@kerf-js/start'
      import * as live from '@kerf-js/start/live'
      export const first = query({ run: () => null })
      export const second = act({ run: () => null, output: undefined })
      export const third = channel({ authorize: () => true })
      export const nameless = channel({ authorize: () => true, server: { notice: undefined } })
      export const other = live.stream({ run: async function* () {} })
      export const good = query({ output: schema, run: () => null })
      const aliased = query(options)
      export { aliased }
    `,
    )
    put('src/bootstrap.ts', 'export default contract')
    const findings = checkShellContracts(root)
    expect(findings.map(({ name }) => name).sort()).toEqual([
      'aliased',
      'default',
      'first',
      'load',
      'load',
      'nameless',
      'other',
      'second',
      'third',
    ])
    expect(findings.every(({ code }) => code === 'Q021')).toBe(true)
    expect(() => requireShellContracts(root)).toThrow(
      /index\.tsx[\s\S]*second[\s\S]*bootstrap\.server\.ts/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('refuses indirect declarations, IDs, and overrides in shell sources', () => {
  const root = mkdtempSync(join(tmpdir(), 'kerf-shell-inventory-'))
  try {
    for (const folder of ['src/server', 'src/routes'])
      mkdirSync(join(root, folder), { recursive: true })
    writeFileSync(
      join(root, 'src/client.ts'),
      `
      import { mutation } from '@kerf-js/start'
      export const local = mutation({ run: () => null })
    `,
    )
    writeFileSync(
      join(root, 'src/server/cases.ts'),
      `
      import { query, channel } from '@kerf-js/start'
      const factory = query
      export const aliased = factory({ run: () => null })
      export const dynamic = query({ $id: id(), run: () => null, output: schema })
      export const spread = query({ output: schema, ...options, run: () => null })
      export const duplicate = query({ output: schema, output: undefined, run: () => null })
      export const events = channel({ server: { ...inherited }, authorize: () => true })
    `,
    )
    writeFileSync(join(root, 'src/routes/index.tsx'), "export { default as load } from './other'")
    expect(
      checkShellContracts(root)
        .map(({ name }) => name)
        .sort(),
    ).toEqual(['aliased', 'duplicate', 'dynamic', 'events', 'load', 'local', 'spread'])
    expect(() => requireShellContracts(root)).toThrow(/Q021/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
