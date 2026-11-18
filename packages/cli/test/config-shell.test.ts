import { expect, test } from 'vitest'
import { loadConfig } from '../src/load-config.mjs'
import { project } from './helpers.mjs'

const config = (destination: string) =>
  project({
    'kerf.config.ts': `import { defineConfig } from '@kerf-js/core/config'
export default defineConfig({
  site: { render: 'shell', description: 'Release shell.', routeRedirects: { home: ${JSON.stringify(destination)} } },
})`,
  })

test('accepts shell rendering and refuses external redirect destinations', async () => {
  const good = await loadConfig(config('/'))
  expect(good.diagnostics).toEqual([])
  expect(good.config.site).toEqual({
    render: 'shell',
    description: 'Release shell.',
    routeRedirects: { home: '/' },
  })
  const bad = await loadConfig(config('//elsewhere.example'))
  expect(bad.diagnostics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: 'P007',
        why: expect.stringContaining('site.routeRedirects.home'),
      }),
    ]),
  )
})

test('checks all shell contracts without importing or building app modules', async () => {
  const root = project({
    'src/routes/index.tsx': 'throw new Error("must not execute"); export const load = () => null',
    'src/routes/one.tsx': 'export const load = () => null',
    'src/server/operations.ts': `
      import { query, stream } from '@kerf-js/start'
      export const first = query({ run: () => null })
      export const second = stream({ async *run() {} })
    `,
  })
  const { checkShell } = await import('../src/shell-check.mjs')
  const result = await checkShell(root)
  expect(result.ok).toBe(false)
  expect(result.diagnostics.map(({ code, file, why }) => [code, file, why.split(':')[0]])).toEqual([
    ['Q021', 'src/routes/index.tsx', 'load'],
    ['Q021', 'src/routes/one.tsx', 'load'],
    ['Q021', 'src/server/operations.ts', 'first'],
    ['Q021', 'src/server/operations.ts', 'second'],
  ])
})
