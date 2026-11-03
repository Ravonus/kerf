// A layout's params are its page's, a catch-all's included: the layout knows which page is showing.
import { createHandler, type Manifest } from '../src/server'

const manifest: Manifest = {
  dir: 'src/routes',
  layouts: [{ id: 'layout:docs', file: 'layout', dir: 'docs' }],
  routes: [
    { id: '/docs/$', file: 'rest', layouts: ['layout:docs'], pattern: '/docs/$', params: ['slug'], splat: 'slug', kind: 'page' },
    { id: '/docs/v/$id', file: 'one', layouts: ['layout:docs'], pattern: '/docs/v/$id', params: ['id'], kind: 'page' },
  ],
}
const seen: Record<string, string>[] = []
const handler = createHandler({
  manifest,
  modules: {
    layout: {
      load: ({ params }) => {
        seen.push(params)
        return { from: 'layout' }
      },
      default: (props: { params: Record<string, string>; children?: unknown }) => <nav data-current={props.params.slug ?? props.params.id}>{props.children}</nav>,
    },
    rest: { default: (props: { params: Record<string, string> }) => <h1>{props.params.slug}</h1> },
    one: { default: (props: { params: Record<string, string> }) => <h1>{props.params.id}</h1> },
  },
  assets: { entry: '/entry.js' },
})
const get = (path: string) => handler(new Request(`http://localhost${path}`))

test('a layout over a catch-all gets the catch-all under its name, in its props and its load', async () => {
  seen.length = 0
  const html = await (await get('/docs/guide/install')).text()
  expect(html).toMatch(/<nav[^>]* data-current="guide\/install"/)
  expect(seen).toEqual([{ slug: 'guide/install' }])
  const body = await (await get('/_weft/data/docs/guide/install')).json() as { m: { id: string; params: Record<string, string> }[] }
  expect(body.m.map(m => [m.id, m.params])).toEqual([['layout:docs', { slug: 'guide/install' }], ['/docs/$', { slug: 'guide/install' }]])
})

test('a layout over a named param gets it, as before', async () => {
  const body = await (await get('/_weft/data/docs/v/7')).json() as { m: { id: string; params: Record<string, string> }[] }
  expect(body.m.map(m => [m.id, m.params])).toEqual([['layout:docs', { id: '7' }], ['/docs/v/$id', { id: '7' }]])
})
