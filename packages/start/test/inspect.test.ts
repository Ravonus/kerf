// `weft routes --meta` (research 25 §7): every route's merged metadata as JSON, without a browser or a server. The
// fixture's output is a snapshot, so a change to any route's tags shows in review.
import { metaExport, routesMeta, h006, staticRouteChecks } from '../src/inspect.mjs'
import { fixture, site } from './dev-server.setup.mjs'

// The `?v=` of a static route's card hashes the card's source and the build: stable in a run, noise in a snapshot.
const stable = (r: unknown): Awaited<ReturnType<typeof routesMeta>> =>
  JSON.parse(JSON.stringify(r).replace(/\?v=[a-z0-9]+/g, '?v=<hash>'))

test('the fixture: merged meta, tags, card mode and diagnostics for every route', async () => {
  const r = stable(await routesMeta({ root: fixture, site }))
  expect(r).toMatchSnapshot()
  const by = Object.fromEntries(r.routes.map((x) => [x.path, x]))
  // A param route runs `meta` on placeholders: what an agent reads is where each value comes from.
  expect(by['/users/[id]']).toMatchObject({
    url: '/users/<id>',
    data: 'placeholder',
    image: 'prerender+on-demand',
  })
  expect(by['/users/[id]'].meta).toMatchObject({
    title: '<data.name> · Acme',
    description: '<data.bio>',
  })
  expect(by['/users/[id]'].tags).toContainEqual([
    'link',
    { rel: 'canonical', href: 'https://acme.dev/users/<id>' },
  ])
  // Static routes ran their loaders: real values, real status.
  expect(by['/about']).toMatchObject({
    status: 200,
    data: 'loaded',
    image: 'build',
    meta: { title: 'About · Acme' },
  })
  expect(by['/boom'].status).toBe(500)
  expect(by['404']).toMatchObject({
    status: 404,
    image: 'none',
    meta: { title: 'Page not found · Acme' },
  })
  // The fixture's two errors, both on purpose; every other finding here is advice on pages it leaves bare.
  expect(r.diagnostics.filter((d) => d.severity === 'error').map((d) => [d.code, d.route])).toEqual(
    [
      ['H007', '/deferred-meta'],
      ['H005', '/meta/badcard'],
    ],
  )
  expect(r.ok).toBe(false)
})

test('H002: a static-only preset and a param route whose card is rendered on demand', async () => {
  const r = await routesMeta({ root: fixture, site, preset: 'static' })
  // tags/[tag] has no `prerender`, so a static host has nothing to serve its cards. users/[id] prerenders its pages
  // and their cards together, which a static host can serve.
  expect(r.diagnostics.filter((d) => d.code === 'H002').map((d) => d.route)).toEqual([
    '/meta/[name]',
    '/tags/[tag]',
  ])
  expect(r.routes.find((x) => x.path === '/users/[id]')!.image).toBe('prerender+on-demand')
})

test('H006: meta that reads a box or calls a hook, found in the source', () => {
  const found: string[][] = []
  const report = (why: string, file: string) => found.push([file, why.slice(0, 30)])
  h006(
    `import { state } from '@weft-js/core'\nconst n = state(1)\nexport const meta = () => ({ title: String(n.value) })`,
    'a.tsx',
    report,
  )
  h006(
    `export function meta({ data }) { const t = useTitle(); return { title: t } }`,
    'b.tsx',
    report,
  )
  h006(
    `export const meta = ({ data }) => ({ title: data.name })\nconst x = y.value`,
    'c.tsx',
    report,
  )
  expect(found).toEqual([
    ['a.tsx', '`meta` reads a box (`.value`):'],
    ['b.tsx', '`meta` calls `useTitle()`: met'],
  ])
})

describe('what `weft check` reports per route', () => {
  let r: Awaited<ReturnType<typeof routesMeta>>
  const found = (code: string, route?: string) =>
    r.diagnostics.filter((d) => d.code === code && (!route || d.route === route))
  beforeAll(async () => {
    r = await routesMeta({ root: fixture, site })
  })

  test('H011: what was derived, and text an agent can apply', () => {
    const [d] = found('H011', '/meta/plain')
    expect(d!.severity).toBe('warning')
    expect(d!.why).toContain('"Harvest & storage notes · Acme"')
    expect(d!.help).toBe(
      'export const meta: Meta = { title: "Harvest & storage notes", description: "Harvest when 5 < 7 and the \\"tonnes\\" & crates are in: every mark here is escaped wherever it lands." }',
    )
  })
  test('a page with its own words has no H011', () => {
    expect(found('H011', '/about')).toEqual([])
  })
  test('H012, H013: what routes share, from real samples', () => {
    expect(found('H012')[0]!.why).toMatch(/routes share this title/)
    expect(found('H013')[0]!.why).toMatch(/the site default/)
  })
  test('the table: each page, sampled from `prerender` and from links, with its source', () => {
    const users = r.routes.find((x) => x.path === '/users/[id]')
    expect(users!.samples[0]).toMatchObject({
      url: '/users/1',
      title: 'Ada Lovelace · Acme',
      source: { title: 'route', description: 'route', image: 'card' },
    })
    expect(r.routes.find((x) => x.path === '/meta/plain')!.source).toEqual({
      title: 'auto',
      description: 'auto',
      image: 'auto',
    })
  })
  test('H001 once, and only with no address', async () => {
    expect(found('H001')).toEqual([])
    const { url: _, ...bare } = site
    const out = await routesMeta({ root: fixture, site: bare })
    expect(out.diagnostics.filter((d) => d.code === 'H001')).toMatchObject([
      { severity: 'warning', file: 'weft.config.ts' },
    ])
  })
})

test('H003, H004, H005, H008: each one found on what the routes really produce', async () => {
  const { description: _, ...plain } = site
  const bare = await routesMeta({ root: fixture, site: plain })
  expect(
    bare.diagnostics.some((d) => d.code === 'H003' && d.route === '/about') ||
      bare.diagnostics.some((d) => d.code === 'H003'),
  ).toBe(true)
  const long = await routesMeta({
    root: fixture,
    site: { ...site, title: `%s · ${'a very long template '.repeat(4)}` },
  })
  expect(long.diagnostics.filter((d) => d.code === 'H004').length).toBeGreaterThan(3)
  const r = await routesMeta({ root: fixture, site })
  const card = r.diagnostics.filter((d) => d.route === '/meta/badcard')
  expect(card.map((d) => d.code).sort()).toEqual(['H005', 'H008'])
  expect(card.find((d) => d.code === 'H008')!.why).toMatch(/not allowed/)
})

test('metaExport: H014 needs to know whether `meta` reads anything', () => {
  expect(metaExport('export default function A() {}', 'a.tsx')).toEqual({
    present: false,
    reads: false,
  })
  expect(metaExport(`export const meta = { title: 'x' }`, 'a.tsx')).toEqual({
    present: true,
    reads: false,
  })
  expect(metaExport('export const meta = ({ data }) => ({ title: data.x })', 'a.tsx')).toEqual({
    present: true,
    reads: true,
  })
  expect(metaExport(`export { meta } from './shared'`, 'a.tsx')).toEqual({
    present: true,
    reads: true,
  })
})

test('staticRouteChecks: an app that cannot run is still read', () => {
  const list = staticRouteChecks(fixture)
  expect(list.some((d) => d.code === 'H014')).toBe(false) // the fixture's param routes all read `data` or `params`
  expect(list.some((d) => d.code === 'H011' && d.route === '/meta/plain')).toBe(true)
  expect(list.some((d) => d.route === '/about')).toBe(false)
})
