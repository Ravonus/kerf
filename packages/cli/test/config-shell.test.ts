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
