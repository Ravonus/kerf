// The media route on its own, with a fake `media.server`: conditional GETs answer 304 only for a real match.
import { expect, test } from 'vitest'
import { makeMedia } from '../src/server/media'
import { etagMatches } from '../src/server/request'

const hash = 'a'.repeat(32)
const bytes = new Uint8Array([1, 2, 3, 4])
const serve = (temporary: boolean) =>
  makeMedia({} as never, () =>
    Promise.resolve({
      serve: () =>
        Promise.resolve({ type: 'image/webp', width: 64, format: 'webp', bytes, temporary }),
    } as never),
  )
const get = (route: ReturnType<typeof serve>, headers: Record<string, string> = {}) => {
  const url = new URL(`http://localhost/_kerf/m/${hash}/64.webp`)
  return route(url, new Request(url, { headers }))
}

test('a rung still encoding is served whole, never as an empty 304', async () => {
  const route = serve(true)
  const plain = await get(route)
  expect(plain.status).toBe(200)
  expect(new Uint8Array(await plain.arrayBuffer())).toEqual(bytes)
  expect(plain.headers.get('cache-control')).toBe('no-store')
  expect(plain.headers.get('etag')).toBeNull()
  expect((await get(route, { 'if-none-match': '*' })).status).toBe(200)
})

test('a finished rung answers 304 to its ETag, in a list or weak, and 200 otherwise', async () => {
  const route = serve(false)
  const first = await get(route)
  const etag = first.headers.get('etag')!
  expect(first.status).toBe(200)
  expect((await get(route, { 'if-none-match': etag })).status).toBe(304)
  expect((await get(route, { 'if-none-match': `"x", W/${etag}` })).status).toBe(304)
  expect((await get(route, { 'if-none-match': '"other"' })).status).toBe(200)
})

test('etagMatches never matches a missing ETag or header', () => {
  const req = (h?: string) => new Request('http://x/', { headers: h ? { 'if-none-match': h } : {} })
  expect(etagMatches(req(), null)).toBe(false)
  expect(etagMatches(req('*'), null)).toBe(false)
  expect(etagMatches(req(), '"a"')).toBe(false)
  expect(etagMatches(req('"a"'), '"a"')).toBe(true)
})
