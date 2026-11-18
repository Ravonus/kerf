import { z } from 'zod'
import { isRouteUrl } from '../src/shell'
import { validate } from '../src/shell/wire'
import { matchShell } from '../src/shell/routes'
import { stripServerExports } from '../src/vite.mjs'

test('wire validation rejects stripped nested keys, transforms and unsafe object keys', async () => {
  const schema = z.strictObject({ nested: z.object({ title: z.string() }) })
  await expect(validate(schema, { nested: { title: 'Literal <text>' } })).resolves.toEqual({
    nested: { title: 'Literal <text>' },
  })
  await expect(
    validate(schema, { nested: { title: 'title', unrelated: 'text' } }),
  ).rejects.toThrow()
  await expect(validate(z.string().trim(), ' padded ')).rejects.toThrow()
  const proto: unknown = JSON.parse('{"__proto__":{"title":"x"}}')
  await expect(validate(z.unknown(), proto)).rejects.toThrow()
  await expect(validate(z.unknown(), Number.POSITIVE_INFINITY)).rejects.toThrow()
})

test.each([
  '//outside.example',
  '/a/..//outside.example',
  // oxlint-disable-next-line eslint/no-script-url -- this value must be rejected before it reaches a URL sink
  'javascript:alert(1)',
  'https://user@allowed.example/a',
  '/a\\b',
  'data:text/html,a',
  'https://outside.example/a',
])('URL admission refuses %s', (url) => {
  expect(isRouteUrl(url, ['https://allowed.example'])).toBe(false)
})

test('URL admission accepts root-relative paths and exact HTTPS origins', () => {
  expect(isRouteUrl('/docs?tab=items#heading')).toBe(true)
  expect(isRouteUrl('https://allowed.example/a', ['https://allowed.example'])).toBe(true)
  expect(isRouteUrl('https://allowed.example:444/a', ['https://allowed.example'])).toBe(false)
})

test('match parameters are computed locally and malformed escapes go to the local 404', () => {
  const routes = [{ id: 'item', pattern: '/items/$id', layouts: ['root'] }]
  expect(matchShell(routes, 'root', '/items/blue%20sky')).toEqual({
    found: true,
    ids: ['root', 'item'],
    params: { id: 'blue sky' },
  })
  expect(matchShell(routes, 'root', '/items/%FF')).toEqual({
    found: false,
    ids: ['root'],
    params: {},
  })
})

test('shell route transforms preserve the release meta/schema and require direct loader declarations', () => {
  const source = `
    import { db } from './db.server'
    export const load = () => db.run()
    export const meta = { title: 'Release' }
    export const routeData = {}
    export default function Page() { return null }
  `
  const output = stripServerExports(source, 'route.tsx', true)
  expect(output).toContain('const meta')
  expect(output).toContain('const routeData')
  expect(output).not.toMatch(/db|const load/)
  expect(() =>
    stripServerExports("export { read as load } from './db.server'", 'route.tsx', true),
  ).toThrow()
  expect(() => stripServerExports("export * from './db.server'", 'route.tsx', true)).toThrow()
})
