// A section's own page and a splat beside it: the splat also matches the bare section, but the page is what it shows.
import { createHandler, type Manifest } from '../src/server'

const manifest: Manifest = {
  dir: 'src/routes',
  layouts: [],
  routes: [
    { id: '/docs', file: 'home', layouts: [], pattern: '/docs', params: [], kind: 'page' },
    {
      id: '/docs/$',
      file: 'rest',
      layouts: [],
      pattern: '/docs/$',
      params: ['slug'],
      splat: 'slug',
      kind: 'page',
    },
  ],
}
const get = async (path: string) => {
  const r = await createHandler({
    manifest,
    modules: {
      home: { default: () => <h1>Section</h1> },
      rest: { default: (p: { params: { slug: string } }) => <h1>Page {p.params.slug}</h1> },
    },
    assets: { entry: '/entry.js' },
  })(new Request(`http://localhost${path}`))
  return [r.status, await r.text()] as const
}

test('the bare section is its own page, not the splat with nothing in it', async () => {
  const [status, html] = await get('/docs')
  expect(status).toBe(200)
  expect(html).toMatch(/<h1[^>]*>Section<\/h1>/)
})

test('anything under it is still the splat', async () => {
  const [status, html] = await get('/docs/a/b')
  expect(status).toBe(200)
  expect(html).toMatch(/<h1[^>]*>Page (<!--.*?-->)*a\/b/)
})
