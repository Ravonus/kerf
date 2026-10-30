// `weft routes --meta` (research 25 §7): every route's merged metadata as JSON, without a browser or a server. The
// fixture's output is a snapshot, so a change to any route's tags shows in review.
import { routesMeta, h006 } from '../src/inspect.mjs'
import { fixture, site } from './dev-server.setup.mjs'

// The `?v=` of a static route's card hashes the card's source and the build: stable in a run, noise in a snapshot.
const stable = r => JSON.parse(JSON.stringify(r).replace(/\?v=[a-z0-9]+/g, '?v=<hash>'))

test('the fixture: merged meta, tags, card mode and diagnostics for every route', async () => {
  const r = stable(await routesMeta({ root: fixture, site }))
  expect(r).toMatchSnapshot()
  const by = Object.fromEntries(r.routes.map(x => [x.path, x]))
  // A param route runs `meta` on placeholders: what an agent reads is where each value comes from.
  expect(by['/users/[id]']).toMatchObject({ url: '/users/<id>', data: 'placeholder', image: 'prerender+on-demand' })
  expect(by['/users/[id]'].meta).toMatchObject({ title: '<data.name> · Acme', description: '<data.bio>' })
  expect(by['/users/[id]'].tags).toContainEqual(['link', { rel: 'canonical', href: 'https://acme.dev/users/<id>' }])
  // Static routes ran their loaders: real values, real status.
  expect(by['/about']).toMatchObject({ status: 200, data: 'loaded', image: 'build', meta: { title: 'About · Acme' } })
  expect(by['/boom'].status).toBe(500)
  expect(by['404']).toMatchObject({ status: 404, image: 'none', meta: { title: 'Page not found · Acme' } })
  expect(r.diagnostics.map(d => [d.code, d.route])).toEqual([['H007', '/deferred-meta']])
  expect(r.ok).toBe(false)
})

test('H002: a static-only preset and a param route whose card is rendered on demand', async () => {
  const r = await routesMeta({ root: fixture, site, preset: 'static' })
  // tags/[tag] has no `prerender`, so a static host has nothing to serve its cards. users/[id] prerenders its pages
  // and their cards together, which a static host can serve.
  expect(r.diagnostics.filter(d => d.code === 'H002').map(d => d.route)).toEqual(['/tags/[tag]'])
  expect(r.routes.find(x => x.path === '/users/[id]').image).toBe('prerender+on-demand')
})

test('H006: meta that reads a box or calls a hook, found in the source', () => {
  const found = []
  const report = (why, file) => found.push([file, why.slice(0, 30)])
  h006(`import { state } from 'weft'\nconst n = state(1)\nexport const meta = () => ({ title: String(n.value) })`, 'a.tsx', report)
  h006(`export function meta({ data }) { const t = useTitle(); return { title: t } }`, 'b.tsx', report)
  h006(`export const meta = ({ data }) => ({ title: data.name })\nconst x = y.value`, 'c.tsx', report)
  expect(found).toEqual([['a.tsx', '`meta` reads a box (`.value`):'], ['b.tsx', '`meta` calls `useTitle()`: met']])
})
