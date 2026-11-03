// `weft build` reads the live plan through a private Vite dev server before it builds. That server must not leave
// NODE_ENV=development behind, or the production build compiles with `import.meta.env.DEV` on and ships dev-only
// diagnostics (X031 and the rest) to every visitor.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readShapes } from '../src/contract.mjs'

test('loading the server modules leaves NODE_ENV as it found it', async () => {
  const root = mkdtempSync(join(tmpdir(), 'weft-env-'))
  const was = process.env.NODE_ENV
  try {
    delete process.env.NODE_ENV
    await readShapes({ root })
    expect(process.env.NODE_ENV).toBeUndefined()
    process.env.NODE_ENV = 'production'
    await readShapes({ root })
    expect(process.env.NODE_ENV).toBe('production')
  } finally {
    process.env.NODE_ENV = was
    rmSync(root, { recursive: true, force: true })
  }
}, 60_000)
