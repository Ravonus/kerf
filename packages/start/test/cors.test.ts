import { makeCors } from '../src/server/cors'
import type { Site } from '@kerf-js/core/ssr'

const request = (path = '/_kerf/fn/query', headers: Record<string, string> = {}, method = 'GET') =>
  new Request('https://node.test' + path, {
    method,
    headers: { origin: 'https://page.test', ...headers },
  })
const next = () =>
  Promise.resolve(
    new Response('answer', { headers: { vary: 'Accept', 'cache-control': 'private' } }),
  )

test('CORS defaults to same origin and rejects cross-origin preflight', async () => {
  const cors = makeCors()
  expect((await cors(request(), next)).headers.get('access-control-allow-origin')).toBeNull()
  expect(
    (await cors(request(undefined, { 'access-control-request-method': 'POST' }, 'OPTIONS'), next))
      .status,
  ).toBe(403)
  expect(
    (await cors(request(undefined, { origin: 'https://node.test' }), next)).headers.get(
      'access-control-allow-origin',
    ),
  ).toBe('https://node.test')
})

test('wildcard CORS never emits credentials, and credentials plus wildcard is rejected at runtime', async () => {
  const response = await makeCors({ cors: { origins: '*' } })(request(), next)
  expect(response.headers.get('access-control-allow-origin')).toBe('*')
  expect(response.headers.get('access-control-allow-credentials')).toBeNull()
  expect(() => makeCors({ cors: { origins: '*', credentials: true } } as unknown as Site)).toThrow(
    /wildcard/,
  )
})

test('named origins preserve Vary, data permits only reads and errors also carry CORS', async () => {
  const cors = makeCors({ cors: { origins: ['https://page.test'], credentials: true } })
  const response = await cors(request(), () =>
    Promise.resolve(new Response('no', { status: 403, headers: { vary: 'Accept' } })),
  )
  expect(response.status).toBe(403)
  expect(response.headers.get('vary')).toBe('Accept, Origin')
  expect(response.headers.get('access-control-allow-origin')).toBe('https://page.test')
  const preflight = await cors(
    request('/_kerf/data/about', { 'access-control-request-method': 'POST' }, 'OPTIONS'),
    next,
  )
  expect(preflight.status).toBe(403)
  const other = await cors(request('/api/own'), next)
  expect(other.headers.get('vary')).toBe('Accept')
  expect(other.headers.get('access-control-allow-origin')).toBeNull()
})
