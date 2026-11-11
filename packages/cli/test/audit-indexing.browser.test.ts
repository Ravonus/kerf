// Exercise actual responses: proxies can block indexing even when HTML is correct.
import { createServer } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { audit } from '../src/audit.mjs'
import { findChrome } from '../src/browser/client.mjs'

// These integration checks require Chrome; the non-browser policy tests always run.
describe.skipIf(!findChrome())('indexing response policy', () => {
  it('fails public meta/header blocks, keeps private exclusions, and accepts crawlable HTML', async () => {
    const root = mkdtempSync(join(tmpdir(), 'kerf-indexing-'))
    const server = createServer((request, response) => {
      if (request.url === '/header') response.setHeader('X-Robots-Tag', 'noindex, nofollow')
      response.setHeader('Content-Type', 'text/html')
      response.end(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Indexing fixture</title><meta name="description" content="A fixture for indexing policy."><link rel="icon" href="data:,">${request.url === '/meta' ? '<meta name="robots" content="noindex">' : ''}</head><body><main><h1>Indexing fixture</h1><p>Readable content.</p></main></body></html>`,
      )
    })
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No fixture port')
    const url = `http://127.0.0.1:${address.port}`
    try {
      const strict = await audit(root, {
        url,
        routes: ['/meta', '/header'],
        forms: ['desktop'],
        indexing: 'public',
      })
      expect(strict.ok).toBe(false)
      expect(strict.diagnostics).toEqual([
        expect.objectContaining({ code: 'L024', severity: 'error' }),
        expect.objectContaining({ code: 'L024', severity: 'error' }),
      ])
      const intentional = await audit(root, {
        url,
        routes: ['/meta', '/header'],
        forms: ['desktop'],
        indexing: 'private',
      })
      expect(intentional.ok).toBe(true)
      expect(intentional.diagnostics).toHaveLength(2)
      const publicPage = await audit(root, {
        url,
        routes: ['/'],
        forms: ['desktop'],
        indexing: 'public',
      })
      expect(publicPage.ok).toBe(true)
      expect(publicPage.diagnostics).toEqual([])
    } finally {
      await new Promise<void>((resolve) => {
        server.close(() => resolve())
      })
      rmSync(root, { recursive: true, force: true })
    }
  }, 60000)
})
