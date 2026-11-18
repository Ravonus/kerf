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
