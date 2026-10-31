// A page's chunks are preloaded with its HTML, so they don't wait for the entry to import them.
import { createHandler, type Manifest } from '../src/server'

const manifest: Manifest = { dir: 'src/routes', layouts: [], routes: [{ id: '/', file: 'home', layouts: [], pattern: '/', params: [], kind: 'page' }] } as any
const page = (chunks: Record<string, { js: { href: string }[] }>) =>
  createHandler({ manifest, modules: { home: { default: () => <h1>Lemon</h1> } } as any, chunks, assets: { entry: '/entry.js' } })(new Request('http://localhost/')).then(r => r.text())

test('the route on the page has its chunks preloaded once, and the entry not at all', async () => {
  const html = await page({ '/': { js: [{ href: '/home.js' }, { href: '/shared.js' }, { href: '/shared.js' }, { href: '/entry.js' }] } })
  expect(html.match(/rel="modulepreload" href="[^"]+"/g)).toEqual(['rel="modulepreload" href="/home.js"', 'rel="modulepreload" href="/shared.js"'])
})

test('a route that is not on the page preloads nothing', async () => {
  expect(await page({ '/other': { js: [{ href: '/other.js' }] } })).not.toContain('modulepreload')
})
