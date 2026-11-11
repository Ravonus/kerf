import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { diagnoseLaunch } from '../src/browser/client.mjs'

it('keeps the original error when DevTools is unavailable', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'kerf-diagnostics-'))
  try {
    const error = Object.assign(new Error('no tab connected in time'), { code: 'E_NO_TAB' })
    expect(await diagnoseLaunch(error, profile, 'http://localhost:5173/?token=secret')).toBe(error)
    expect(error.code).toBe('E_NO_TAB')
    expect(error.message).toContain('no tab connected in time; DevTools unavailable')
    expect(error.message).not.toContain('secret')
  } finally {
    rmSync(profile, { recursive: true, force: true })
  }
})

it('reports page metadata from the launched profile without URL secrets', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'kerf-diagnostics-'))
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json')
    res.end(
      JSON.stringify(
        req.url === '/json/version'
          ? { Browser: 'Chrome/123' }
          : [
              {
                type: 'page',
                url: 'http://user:pass@localhost:5173/shop?token=secret#hidden',
                webSocketDebuggerUrl: 'ws://localhost/devtools/page/private',
              },
              { type: 'worker', url: 'http://localhost/worker' },
            ],
      ),
    )
  })
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  try {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('no address')
    writeFileSync(join(profile, 'DevToolsActivePort'), `${address.port}\n/devtools/browser/private`)
    const error = new Error('no tab connected in time')
    await diagnoseLaunch(error, profile, 'http://localhost:5173/shop?token=secret')
    expect(error.message).toContain('Chrome/123')
    expect(error.message).toContain('http://localhost:5173/shop')
    expect(error.message).toContain('debuggable')
    expect(error.message).not.toMatch(/secret|pass|hidden|private|worker/)
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
    rmSync(profile, { recursive: true, force: true })
  }
})
