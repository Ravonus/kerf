// `weft audit`: a clean headless Chrome over a build's pages, at a phone's width and a desktop's (axe-core and the
// DevTools protocol). The page-reading half needs Chrome, which CI machines and containers may not have.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { get } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appRoutes, audit, pagesIn, samplePages, serveStatic } from '../src/audit.mjs'
import { findChrome } from '../src/browser/client.mjs'
import { unsafeAllowed } from '../src/start.mjs'

const head = (title = 'A page', extra = '') =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><link rel="icon" href="data:,"><meta name="description" content="What the page is."><style>body{background:#fff;color:#111;font:16px sans-serif}${extra}</style></head>`
const pages = {
  'index.html': `${head()}<body><main><h1>Fine</h1><p>Every word reads.</p><button type="button">Save</button></main></body></html>`,
  // the search button's bug: its only text hidden by CSS on a phone, so there it has no name
  'docs/index.html': `${head('Docs', '@media (max-width: 599.98px) { .t { display: none } }')}<body><main><h1>Docs</h1><button type="button"><svg aria-hidden="true" width="16" height="16"></svg><span class="t">Search</span></button></main></body></html>`,
  'docs/faded/index.html': `${head('Faded', '.dim { color: #bbb }')}<body><main><h1>Faded</h1><p class="dim">Grey on white.</p></main></body></html>`,
  'docs/a/b/index.html': `<!doctype html><html><head><meta charset="utf-8"></head><body><main><h1>Bare</h1><p>No title, no lang, no viewport.</p><script>console.error('boom')</script></main></body></html>`,
  '404.html': `${head('Missing')}<body><main><h1>Not here</h1></main></body></html>`,
}

describe('which pages', () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-audit-pages-'))
  for (const [rel, html] of Object.entries(pages)) {
    mkdirSync(join(dir, rel, '..'), { recursive: true })
    writeFileSync(join(dir, rel), html)
  }
  mkdirSync(join(dir, '_weft'))
  writeFileSync(join(dir, '_weft/x.html'), '')
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('lists prerendered pages as paths, leaving out error pages and _-folders', () => {
    expect(pagesIn(dir)).toEqual(['/', '/docs/', '/docs/a/b/', '/docs/faded/'])
  })

  it('samples one page of each kind: a section at each depth, every top-level page', () => {
    expect(
      samplePages(['/', '/a', '/learn/x', '/learn/y', '/learn/x/deep', '/learn/z/deep', '/b']),
    ).toEqual(['/', '/a', '/learn/x', '/learn/x/deep', '/b'])
    expect(samplePages(['/a', '/b', '/c'], 2)).toEqual(['/a', '/b'])
  })

  it('serves the directory and nothing outside it', async () => {
    const server = await serveStatic(join(dir, 'docs'))
    try {
      expect((await fetch(`${server.url}/faded`)).status).toBe(200)
      // fetch() resolves `..` away; a raw request keeps it, and gets the served folder's own index, not its parent's
      const body = await new Promise((ok) => {
        get(`${server.url}/../index.html`, { path: '/../index.html' }, (res) => {
          let b = ''
          res.on('data', (c) => (b += c)).on('end', () => ok(b))
        })
      })
      expect(body).toMatch('<h1>Docs</h1>')
    } finally {
      server.close()
    }
  })
})

describe('a build served as files', () => {
  it("knows the app's other pages are the server's to answer, not missing files", () => {
    const root = mkdtempSync(join(tmpdir(), 'weft-routes-'))
    for (const f of [
      'index.tsx',
      'about.tsx',
      'docs/[slug].tsx',
      'files/[...rest].tsx',
      '(app)/settings.tsx',
      'notes.server.ts',
    ]) {
      mkdirSync(join(root, 'src/routes', f, '..'), { recursive: true })
      writeFileSync(join(root, 'src/routes', f), '')
    }
    const served = appRoutes(root)
    expect(
      ['/', '/about', '/docs/a', '/files/a/b', '/files', '/settings'].filter((p) => !served(p)),
    ).toEqual([])
    expect(['/docs/a/b', '/notes', '/assets/x.js', '/about.x'].filter(served)).toEqual([])
    rmSync(root, { recursive: true, force: true })
  })
})

describe('--unsafe-allow', () => {
  const d = (code: string) => ({ code, severity: 'error', why: 'x' })
  it('lets named codes, a family or everything through, as warnings that say so', () => {
    const u = unsafeAllowed('R002,L', {})
    expect([
      u.allows(d('R002')),
      u.allows(d('L003')),
      u.allows(d('R003')),
      u.allows(d('W001')),
    ]).toEqual([true, true, false, false])
    expect(u.let(d('R002'))).toMatchObject({
      severity: 'warning',
      why: 'UNSAFE, let through (--unsafe-allow): x',
    })
    expect(
      unsafeAllowed(undefined, { build: { unsafeAllow: { all: 'demo deploy' } } }).let(d('Q001'))
        .why,
    ).toBe('UNSAFE, let through (demo deploy): x')
    expect(unsafeAllowed(undefined, {}).allows(d('R002'))).toBe(false)
  })
})

const chrome = findChrome()

// skipped without Chrome: CI machines and containers may not have it
describe.skipIf(!chrome)('the rendered pages, in Chrome', () => {
  let root: string
  let result: {
    pages: string[]
    ok: boolean
    diagnostics: { code: string; why: string; file: string; fix: { text: string } }[]
  }
  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'weft-audit-'))
    for (const [rel, html] of Object.entries(pages)) {
      mkdirSync(join(root, 'dist', rel, '..'), { recursive: true })
      writeFileSync(join(root, 'dist', rel), html)
    }
    result = (await audit(root)) as typeof result
  }, 120_000)
  afterAll(() => rmSync(root, { recursive: true, force: true }))
  const of = (code: string) => result.diagnostics.filter((d) => d.code === code)

  it('says when a page names no icon: the browser asks for /favicon.ico and logs the 404', () => {
    // asked by the audit, not left to Chrome's lazy request: every page that names none, at both widths
    expect(of('L011')).toHaveLength(1)
    expect(of('L011')[0]!.why).toMatch(/names no icon.*\(phone and desktop, \/docs\/a\/b\/\)/)
  })

  it('finds the build and audits each kind of page', () => {
    expect(result.pages).toEqual(['/', '/docs/', '/docs/a/b/', '/docs/faded/'])
    expect(result.ok).toBe(false)
  })

  it('names a button that has text in its source but none on a phone, and only there', () => {
    expect(of('L001')).toHaveLength(1)
    expect(of('L001')[0]!.why).toMatch(/^<button type="button">.*\(phone, \/docs\/\)$/)
  })

  it('reports contrast with the colours and the ratio', () => {
    expect(of('L003')[0]!.why).toMatch(/#bbbbbb on #ffffff is 1\.9\d?:1/)
    expect(of('L003')[0]!.why).toMatch(/phone and desktop, \/docs\/faded\//)
  })

  it('reads the head a crawler reads, and the console', () => {
    expect(of('L020')[0]!.file).toBe('/docs/a/b/')
    expect(of('L022')).toHaveLength(1)
    expect(of('L023')).toHaveLength(1)
    expect(of('L010')[0]!.why).toMatch(/Console error.*boom/)
  })

  it('leaves the good page alone, and gives each finding the fix from the catalog', () => {
    expect(result.diagnostics.filter((d) => d.file === '/')).toEqual([])
    for (const d of result.diagnostics) expect(d.fix.text).not.toBe('')
  })

  it('audits each page in the foreground', async () => {
    const foregroundRoot = mkdtempSync(join(tmpdir(), 'weft-audit-foreground-'))
    const html = `${head('Foreground')}
<body><main><h1>Foreground</h1><p>Visible words read clearly.</p></main>
<script>
  const reflect = () => {
    document.body.style.color = document.hidden ? '#bbb' : '#111'
  }
  document.addEventListener('visibilitychange', reflect)
  reflect()
</script></body></html>`
    try {
      for (const name of ['a', 'b', 'c', 'd']) {
        const dir = join(foregroundRoot, 'dist', name)
        mkdirSync(dir, { recursive: true })
        writeFileSync(join(dir, 'index.html'), html)
      }
      const got = await audit(foregroundRoot, { dir: join(foregroundRoot, 'dist') })
      expect(got.pages).toEqual(['/a/', '/b/', '/c/', '/d/'])
      expect(got.skipped).toBeUndefined()
      expect(got.diagnostics).toEqual([])
      expect(got.ok).toBe(true)
    } finally {
      rmSync(foregroundRoot, { recursive: true, force: true })
    }
  }, 30_000)
})
