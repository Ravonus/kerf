// @vitest-environment node
// Headless imports must not activate the optional icon pass, and its compiler lookup cannot re-enter that pass.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { build } from 'vite'
import { vi } from 'vitest'
import kerf from '../vite.mjs'
import { icons } from '../vite/icons.mjs'

test('a headless veneer-core import builds without resolving the optional icon compiler', async () => {
  const root = mkdtempSync(join(tmpdir(), 'kerf-headless-'))
  try {
    const entry = join(root, 'entry.tsx')
    writeFileSync(entry, "import { label } from '@kerf-js/veneer-core'; document.title = label")
    const out = await build({
      configFile: false,
      root,
      logLevel: 'silent',
      plugins: [
        kerf(),
        {
          name: 'headless-fixture',
          resolveId(source) {
            if (source === '@kerf-js/veneer-core') return '\0headless-fixture'
            if (source.startsWith('@kerf-js/veneer-icons'))
              throw new Error('Unexpected icon lookup')
            return null
          },
          load: (id) =>
            id === '\0headless-fixture' ? "export const label = 'headless-only'" : null,
        },
      ],
      build: { write: false, lib: { entry, formats: ['es'] } },
    })
    const results = out as unknown as { output: { code?: string }[] }[]
    expect(
      results
        .flatMap((result) => result.output)
        .map((chunk) => chunk.code ?? '')
        .join(''),
    ).toContain('headless-only')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the icon compiler entry passes to normal resolution without starting another icon pass', async () => {
  const resolve = vi.fn(() => Promise.reject(new Error('Re-entered icon resolution')))
  const result = await icons().resolve.resolveId.handler.call(
    { resolve },
    '@kerf-js/veneer-icons/compile',
    '/app/main.tsx',
  )
  expect(result).toBeNull()
  expect(resolve).not.toHaveBeenCalled()
})
