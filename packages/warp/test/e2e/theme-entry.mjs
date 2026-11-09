import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'vite'
import { compile } from 'tailwindcss'
import { tokens } from '../../../core/vite/config-plugins.mjs'
import { sync } from '../../../cli/src/plugins.mjs'
import { tailwindTheme } from '../../src/plugin/tailwind.mjs'

const root = mkdtempSync(join(tmpdir(), 'weft-tailwind-'))
let server
try {
  const entry = join(root, '.weft/tokens/warp.tailwind.css')
  const css = tailwindTheme({
    colors: { brand: 'red' },
    system: {
      space: { 2: '4px' },
      radius: { card: '4px' },
      text: { body: { size: '1rem' } },
    },
  })
  sync(root, {
    slots: {},
    contributions: [
      {
        name: 'warp',
        manifest: {
          tokens: {
            namespace: 'warp',
            cssEntries: { tailwind: css },
            alias: { '@weft-js/warp/tailwind.css': entry },
          },
        },
      },
    ],
  })
  server = await createServer({
    root,
    configFile: false,
    plugins: [tokens()],
    server: { middlewareMode: true },
  })
  const resolved = await server.pluginContainer.resolveId('@weft-js/warp/tailwind.css')
  assert.equal(realpathSync(resolved.id), realpathSync(entry))
  const compiler = await compile(`${readFileSync(resolved.id, 'utf8')}\n@tailwind utilities;`)
  const output = compiler.build(['bg-brand', 'text-brand/80', 'gap-2', 'rounded-card', 'text-body'])
  for (const expected of [
    '--warp-named-brand',
    '--warp-space-2',
    '--warp-radius-surface',
    '--warp-text-body-size',
    'color-mix(',
  ])
    assert.ok(output.includes(expected), expected)
  console.log('Tailwind processor and Vite alias: 5 utility assertions passed')
} finally {
  await server?.close()
  rmSync(root, { recursive: true, force: true })
}
