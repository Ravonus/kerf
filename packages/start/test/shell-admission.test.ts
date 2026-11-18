import { z } from 'zod'
import { clientFetch } from '../src/client-fetch'
import { readShell } from '../src/run/shell-data'
import { isRouteUrl, type RouteDataSchema } from '../src/shell'
import { frames } from '../src/shell/read'
import { matchShell } from '../src/shell/routes'
import { SHELL_BYTES, SHELL_FRAME_BYTES, SHELL_MEDIA, validate } from '../src/shell/wire'
import { stripServerExports } from '../src/vite/syntax.mjs'

const routes = {
  build: 'release',
  load: {},
  table: [{ id: 'probe', pattern: '/probe', layouts: [] }],
  shell: { site: { routeRedirects: { home: '/' } } },
}
const url = new URL('https://release.invalid/probe')
const base = { build: 'release', v: 1 }
const page = { ...base, kind: 'page', values: [{ label: 'Allowed' }] }
const schema = { initial: z.strictObject({ label: z.string().max(32) }) }
const line = (value: unknown) => JSON.stringify(value) + '\n'
const response = (body: string, status = 200, type = SHELL_MEDIA) =>
  new Response(body, { status, headers: { 'content-type': type } })

function read(reply: Response, contract: RouteDataSchema | null = schema) {
  clientFetch((_path, init) => {
    expect(init).toMatchObject({ credentials: 'omit', redirect: 'error', cache: 'no-store' })
    return Promise.resolve(reply)
  })
  return readShell({
    url,
    routes,
    local: matchShell(routes.table, undefined, url.pathname),
    schemas: () => Promise.resolve(contract ?? undefined),
    signal: new AbortController().signal,
  })
}

afterEach(() => clientFetch(undefined))

test.each([
  ['stale build', { ...page, build: 'earlier' }],
  ['wrong version', { ...page, v: 2 }],
  ['wrong kind', { ...page, kind: 'retry' }],
  ['extra level', { ...page, values: [...page.values, null] }],
  ['missing level', { ...page, values: [] }],
  ['object instead of array', { ...page, values: { 0: page.values[0] } }],
  ['string instead of object', { ...page, values: ['Probe'] }],
  ['object instead of string', { ...page, values: [{ label: {} }] }],
  ['extra typed-data key', { ...page, values: [{ label: 'Probe', details: 'Extra' }] }],
  ['nested reserved key', { ...page, values: [{ label: { constructor: {} } }] }],
  ['legacy SSR fields', { ...page, m: [], h: 'Probe', b: {} }],
  ['peer module list', { ...page, islands: ['probe'], preload: ['probe'] }],
  ['peer metadata', { ...page, head: { title: 'Probe' } }],
  ['peer params', { ...page, params: { id: 'Probe' } }],
  ['unmapped redirect', { ...base, kind: 'redirect', id: 'missing' }],
  ['inherited redirect', { ...base, kind: 'redirect', id: 'constructor' }],
  ['redirect URL extension', { ...base, kind: 'redirect', id: 'home', url: '/probe' }],
])('rejects route outcomes with %s', async (_name, value) => {
  await expect(read(response(line(value)))).rejects.toThrow('Invalid shell route data')
})

test.each([
  [404, { ...base, kind: 'not-found', values: [], detail: 'extra' }],
  [500, { ...base, kind: 'error', values: [], reference: 'invalid reference' }],
  [500, { ...base, kind: 'error', values: [], reference: 'a'.repeat(24), detail: 'extra' }],
  [201, page],
  [302, { ...base, kind: 'redirect', id: 'home' }],
])('rejects the untrusted outcome for HTTP %s', async (status, value) => {
  await expect(read(response(line(value), status))).rejects.toThrow('Invalid shell route data')
})

test.each([
  'text/html',
  'application/json',
  SHELL_MEDIA + '; charset=iso-8859-1',
  SHELL_MEDIA + '; extra=yes',
])('rejects a route response with media type %s', async (type) => {
  await expect(read(response(line(page), 200, type))).rejects.toThrow('Invalid shell route data')
})

test('permits UTF-8 and refuses a trailing frame on a route with no deferred slots', async () => {
  await expect(
    read(response(line(page), 200, SHELL_MEDIA + '; charset="UTF-8"')),
  ).resolves.toMatchObject({ kind: 'page', immediate: page.values })
  await expect(read(response(line(page) + line({ kind: 'deferred' })))).rejects.toThrow()
})

test('an intentionally data-less level accepts only the null sentinel', async () => {
  await expect(read(response(line({ ...page, values: [null] })), null)).resolves.toMatchObject({
    matches: [{ data: undefined }],
  })
  await expect(read(response(line(page)), null)).rejects.toThrow()
})

test.each([
  ['unknown key', { kind: 'deferred', depth: 0, key: 'other', value: 'Extra' }],
  ['string depth', { kind: 'deferred', depth: '0', key: 'detail', value: 'Extra' }],
  ['wrong shape', { kind: 'deferred', depth: 0, key: 'detail', value: {} }],
  ['extra field', { kind: 'deferred', depth: 0, key: 'detail', value: 'Extra', html: 'Probe' }],
  ['forged failure message', { kind: 'deferred-error', depth: 0, key: 'detail', message: 'Probe' }],
])('rejects a deferred value with %s', async (_reason, frame) => {
  const contract = { ...schema, deferred: { detail: z.string() } }
  const outcome = await read(response(line(page) + line(frame)), contract)
  if (outcome.kind === 'redirect') throw new Error('Unexpected redirect')
  const data = outcome.matches[0]!.data as { detail: Promise<unknown> }
  expect(data).toEqual({ label: 'Allowed', detail: expect.any(Promise) })
  const { detail } = data
  await expect(detail).rejects.toThrow('Deferred route data is unavailable.')
})

test('rejects reserved keys and excessive nesting even if a validator accepts every value', async () => {
  for (const value of [
    JSON.parse('{"nested":{"__proto__":{}}}'),
    { constructor: {} },
    { nested: { prototype: {} } },
    JSON.parse('['.repeat(34) + 'null' + ']'.repeat(34)),
  ]) {
    await expect(validate(z.unknown(), value)).rejects.toThrow()
  }
})

test('rejects a validator that silently changes the submitted object in place', async () => {
  const value = { label: 'Original' }
  const mutating = {
    '~standard': {
      version: 1 as const,
      validate(input: unknown) {
        const data = input as typeof value
        data.label = 'Changed'
        return { value: data }
      },
    },
  }
  await expect(validate(mutating, value)).rejects.toThrow()
  expect(value.label).toBe('Original')
})

function stream(text: string) {
  return frames(new Response(text).body!, new AbortController().signal)
}

test('counts the newline in the frame limit and caps the decoded response independently', async () => {
  const exact = line('x'.repeat(SHELL_FRAME_BYTES - 3))
  await expect(stream(exact).next()).resolves.toMatchObject({ done: false })
  await expect(stream(exact + ' ').next()).resolves.toMatchObject({ done: false })
  await expect(stream(' ' + exact).next()).rejects.toThrow('Invalid shell route data')
  await expect(read(response(' '.repeat(SHELL_BYTES + 1)))).rejects.toThrow()
})

test.each([
  // oxlint-disable-next-line eslint/no-script-url -- Inert scheme marker for URL admission.
  'javascript:',
  'data:,',
  '//other.invalid/path',
  '/a\\b',
  'https://other.invalid/a',
  'https://user@allowed.invalid/a',
  '/%2fpath',
  '/a%5cb',
  '/a/%252fpath',
  '/a/%00',
  '/a/%FF',
  'https:///allowed.invalid/a',
  'https://@allowed.invalid/a',
])('refuses ambiguous route URL %s', (path) =>
  expect(isRouteUrl(path, ['https://allowed.invalid'])).toBe(false),
)

test('rejects shell compilation for a loader without a runtime schema export', () => {
  const source = 'export const load = () => null; export type routeData = {}'
  expect(() => stripServerExports(source, 'route.tsx', true)).toThrow(/routeData schema/)
  expect(() => stripServerExports('export const { load } = loaders', 'route.tsx', true)).toThrow(
    /routeData schema/,
  )
  expect(stripServerExports(source, 'route.tsx')).not.toContain('const load')
})
