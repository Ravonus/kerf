// `dev({ port: 0 })` must take a free port from the OS: Nitro reads a falsy port as 3000, which parallel suites share.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { dev } from '../src/app.mjs'

async function app() {
  const root = await mkdtemp(join(import.meta.dirname, 'fixtures', 'port-'))
  await mkdir(join(root, 'src/routes'), { recursive: true })
  await writeFile(join(root, 'package.json'), '{"type":"module"}')
  await writeFile(join(root, 'vite.config.mjs'), 'export default { envDir: false }')
  await writeFile(join(root, 'src/routes/index.tsx'), 'export default () => <h1>port</h1>')
  return root
}

test('port 0 gives each dev server its own free port', async () => {
  const roots = await Promise.all([app(), app()])
  const servers: Awaited<ReturnType<typeof dev>>[] = []
  try {
    for (const root of roots) servers.push(await dev({ root, port: 0, logLevel: 'silent' }))
    const ports = servers.map((s) => {
      const address = s.httpServer?.address()
      return typeof address === 'object' && address ? address.port : undefined
    })
    expect(ports.every((p) => typeof p === 'number' && p > 0 && p !== 3000)).toBe(true)
    expect(ports[0]).not.toBe(ports[1])
  } finally {
    await Promise.all(servers.map((s) => s.close()))
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })))
  }
}, 30_000)
