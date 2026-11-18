import type { Page, Route, WebSocketRoute } from 'playwright-core'
import {
  address,
  assertNoMarkup,
  go,
  open,
  operationCookieRead,
  watchSinks,
} from './shell.browser.setup'

const key = 'CRITIC_MARKER'
const wireHeaders = { 'content-type': 'application/x-ndjson' }
const rawQuery = '**/peers/a/_kerf/fn/probeQuery.*'
const rawMutation = '**/peers/a/_kerf/fn/probeMutation.*'

async function replaceFrame(route: Route, edit: (frame: Record<string, unknown>) => string) {
  const response = await route.fetch()
  const frame = JSON.parse(await response.text()) as Record<string, unknown>
  await route.fulfill({ headers: wireHeaders, body: edit(frame) + '\n' })
}

async function code(page: Page, field: string, value: string) {
  await page
    .locator('[data-' + field + ']')
    .getByText(value, { exact: true })
    .waitFor()
}

function operationCases() {
  test.each([
    ['wrong operation', (frame: object) => JSON.stringify({ ...frame, kind: 'fn:other' })],
    ['other build', (frame: object) => JSON.stringify({ ...frame, build: 'different' })],
    ['legacy result', () => JSON.stringify({ v: { text: key }, c: [], r: '/critic-target' })],
    ['oversize', (frame: object) => JSON.stringify({ ...frame, value: 'á'.repeat(40_000) })],
    [
      'nested',
      (frame: object) =>
        JSON.stringify({
          ...frame,
          value: { v: { text: JSON.parse('['.repeat(45) + 'null' + ']'.repeat(45)) }, t: [] },
        }),
    ],
    [
      'reserved JSON key',
      (frame: object) => JSON.stringify(frame).replace(/"text":/, '"constructor":null,"text":'),
    ],
    [
      'duplicate JSON key',
      (frame: object) => JSON.stringify(frame).replace(/"text":/, '"te\\u0078t":null,"text":'),
    ],
  ] as const)('raw transport refuses %s before app state', async (_name, edit) => {
    const { page } = await open()
    try {
      await go(page, '/critic', 'Release text')
      await page.route(rawQuery, (route) => replaceFrame(route, edit))
      await page.getByRole('button', { name: 'Read through own transport' }).click()
      await code(page, 'direct', 'invalid')
      expect(page.url()).toBe(address + '/critic')
      await assertNoMarkup(page)
    } finally {
      await page.close()
    }
  })

  test('refuses the exported legacy HTTP transport before it goes to the peer', async () => {
    const { page } = await open()
    try {
      await go(page, '/critic', 'Release text')
      await page
        .locator('[data-refresh]')
        .getByText(/^Server query /)
        .waitFor()
      const calls: string[] = []
      await page.route(rawQuery, async (route) => {
        calls.push(route.request().url())
        await route.fulfill({ json: { v: { text: key }, r: '/critic-target' } })
      })
      await page.getByRole('button', { name: 'Call legacy HTTP transport' }).click()
      await code(page, 'legacy', 'invalid')
      expect(calls).toEqual([])
      expect(page.url()).toBe(address + '/critic')
    } finally {
      await page.close()
    }
  })
}

function rollbackCase() {
  test('rolls back the local prediction and refuses an invalid revalidation', async () => {
    const { page } = await open()
    try {
      await go(page, '/critic', 'Release text')
      const cache = page.locator('[data-refresh]')
      await cache.getByText(/^Server query /).waitFor()
      const prior = await cache.textContent()
      await page.route(rawQuery, (route) =>
        replaceFrame(route, (frame) =>
          JSON.stringify({
            ...frame,
            value: { v: { text: key, extra: true }, t: [] },
          }),
        ),
      )
      let release = () => {}
      const hold = new Promise<void>((resolve) => {
        release = resolve
      })
      await page.route(rawMutation, async (route) => {
        await hold
        await replaceFrame(route, (frame) =>
          JSON.stringify({
            ...frame,
            value: { r: '/critic-target', c: [], v: { text: key }, t: [] },
          }),
        )
      })
      await page.getByRole('button', { name: 'Submit server form' }).click()
      try {
        await code(page, 'refresh', 'Release prediction')
      } finally {
        release()
      }
      await code(page, 'action', 'invalid')
      expect(await cache.textContent()).toBe(prior)
      expect(await page.locator('[data-form]').textContent()).toBe('')
      expect(page.url()).toBe(address + '/critic')
    } finally {
      await page.close()
    }
  })
}

function revalidationCase() {
  test('revalidates local queries without broadcasting peer tags', async () => {
    const { page } = await open()
    try {
      await page.addInitScript(() => {
        const received: unknown[] = []
        const receiver = new BroadcastChannel('kerf:tags')
        receiver.addEventListener('message', (event) => received.push(event.data))
        Reflect.set(window, 'criticBroadcast', { receiver, received })
      })
      await go(page, '/critic', 'Release text')
      const field = page.locator('[data-refresh]')
      await field.getByText(/^Server query /).waitFor()
      const prior = await field.textContent()
      await page.route(rawMutation, (route) =>
        replaceFrame(route, (frame) =>
          JSON.stringify({
            ...frame,
            value: { ...(frame.value as object), t: [key] },
          }),
        ),
      )
      await page.getByRole('button', { name: 'Submit server form' }).click()
      await page
        .locator('[data-form]')
        .getByText(/^Server mutation /)
        .waitFor()
      await expect
        .poll(async () => {
          const text = await field.textContent()
          return text !== prior && (text?.startsWith('Server query ') ?? false)
        })
        .toBe(true)
      expect(await page.evaluate(() => Reflect.get(window, 'criticBroadcast').received)).toEqual([])
    } finally {
      await page.close()
    }
  })
}

function httpHeaderCases() {
  test.each(['critic-headers', 'critic-redirect'])(
    'keeps %s out of navigation and storage',
    async (attack) => {
      const { page, documents } = await open()
      const requests: string[] = []
      page.on('request', (request) => requests.push(new URL(request.url()).pathname))
      try {
        await watchSinks(page)
        await page
          .context()
          .addCookies([{ name: 'release-session', value: 'present', url: address }])
        await go(page, '/critic', 'Release text')
        await page.evaluate((mode) => {
          sessionStorage.operationAttack = mode
        }, attack)
        await page.getByRole('button', { name: 'Read through own transport' }).click()
        if (attack === 'critic-redirect') await code(page, 'direct', 'unexpected')
        else
          await page
            .locator('[data-direct]')
            .getByText(/^Server query /)
            .waitFor()
        expect((await page.context().cookies()).map((cookie) => cookie.name)).toEqual([
          'release-session',
        ])
        if (attack === 'critic-headers') {
          expect(operationCookieRead.length).toBeGreaterThan(0)
          expect(operationCookieRead.every((cookie) => cookie === undefined)).toBe(true)
        }
        expect(await page.evaluate(() => Reflect.get(window, 'criticSinks'))).toEqual([])
        expect(requests.filter((path) => path.startsWith('/critic-operation-'))).toEqual([])
        expect(documents).toEqual([address + '/critic'])
      } finally {
        await page.close()
      }
    },
  )
}

function mediaTypeCases() {
  test.each(['application/json', 'application/x-ndjson; charset=iso-8859-1'])(
    'refuses valid operation bytes presented as %s',
    async (type) => {
      const { page } = await open()
      try {
        await go(page, '/critic', 'Release text')
        await page.route(rawQuery, async (route) => {
          const response = await route.fetch()
          await route.fulfill({ response, headers: { 'content-type': type } })
        })
        await page.getByRole('button', { name: 'Read through own transport' }).click()
        await code(page, 'direct', 'invalid')
      } finally {
        await page.close()
      }
    },
  )
}

function socketPeer(route: WebSocketRoute, state: { resumed: unknown[]; count: number }) {
  const server = route.connectToServer()
  const first = ++state.count === 1
  route.onMessage((message) => {
    if (typeof message === 'string') {
      const row = JSON.parse(message) as unknown[]
      if (!first && row[0] === 'j') state.resumed.push(row[4])
    }
    server.send(message)
  })
  server.onMessage((message) => {
    if (typeof message !== 'string') return
    const frame = JSON.parse(message) as { value: unknown[] }
    const [kind, id, cursor] = frame.value
    if (first && kind === 'j') {
      route.send(JSON.stringify({ ...frame, value: ['m', id, cursor, 'notice', { text: key }] }))
    }
    if (first && kind === 'm' && frame.value[3] === 'notice') {
      route.send(Buffer.from('binary peer frame'))
      return
    }
    route.send(message)
  })
}

function realtimeCases() {
  test('does not open a socket without a configured gateway', async () => {
    const { page } = await open()
    try {
      await page.addInitScript(() => {
        sessionStorage.noSocket = '1'
      })
      const sockets: string[] = []
      page.on('websocket', (socket) => sockets.push(socket.url()))
      await go(page, '/critic', 'Release text')
      await code(page, 'channel', 'unavailable')
      await code(page, 'channel-error', 'unavailable')
      expect(sockets).toEqual([])
    } finally {
      await page.close()
    }
  })

  test('ignores channel messages before join and refuses binary before resuming', async () => {
    const { page } = await open()
    const state = { resumed: [] as unknown[], count: 0 }
    try {
      await page.routeWebSocket(/\/_kerf\/ws$/, (route) => socketPeer(route, state))
      await go(page, '/critic', 'Release text')
      await code(page, 'channel', 'open')
      await code(page, 'presence', 'unavailable')
      expect(await page.locator('[data-notice]').textContent()).toBe('')
      await page.getByRole('button', { name: 'Request channel message' }).click()
      await expect.poll(() => state.count).toBeGreaterThan(1)
      await code(page, 'channel', 'open')
      expect(state.resumed.some((value) => typeof value === 'string')).toBe(true)
      expect(
        state.resumed.every(
          (value) => value === null || (typeof value === 'string' && !value.includes(key)),
        ),
      ).toBe(true)
      await page.getByRole('button', { name: 'Request channel message' }).click()
      await code(page, 'notice', 'Server channel')
    } finally {
      await page.close()
    }
  })

  test.each(['id', 'retry', 'event', 'type', 'presence'])(
    'SSE refuses an unexpected %s without a value',
    async (field) => {
      const { page } = await open()
      try {
        await page.addInitScript((mode) => {
          sessionStorage.operationAttack = 'critic-sse-' + mode
        }, field)
        await go(page, '/critic', 'Release text')
        await code(page, 'stream-error', 'invalid')
        expect(await page.locator('[data-stream]').textContent()).toBe('')
      } finally {
        await page.close()
      }
    },
  )
}

async function redirectFor(page: Page, params: unknown) {
  await page.route('**/peers/a/_kerf/data/guard?*', (route) =>
    replaceFrame(route, (frame) => JSON.stringify({ ...frame, id: 'broad', params })),
  )
}

function navigationCases() {
  test.each([
    'new',
    '/',
    '..',
    '%2f',
    '%252f',
    '?next=',
    '#hash',
    '\\',
    '',
    'a'.repeat(257),
    'e\u0301',
  ])('refuses an invalid route segment (%j) without changing the address', async (id) => {
    const { page } = await open()
    try {
      await redirectFor(page, { id })
      await go(page, '/guard?critic-case=1', 'Release error')
      expect(page.url()).toBe(address + '/guard?critic-case=1')
    } finally {
      await page.close()
    }
  })
}

function returnCases() {
  test.each([
    '//elsewhere.invalid',
    'https://user:pass@elsewhere.invalid/',
    'https://elsewhere.invalid',
    '/\\elsewhere.invalid',
    '/%2felsewhere.invalid',
    '/%252felsewhere.invalid',
    ['javascript', 'example'].join(':'),
    'data:text/plain,example',
    '/items/../guard',
    '/items/%2e%2e/guard',
    '/guard?next=%2F',
    '/items/42?tab=other',
    '/%69tems/42/',
  ])('rejects an ambiguous return address (%j)', async (next) => {
    const { page } = await open()
    try {
      await go(page, '/items/42?next=' + encodeURIComponent(next), 'Peer A item 42')
      await code(page, 'return-to', 'No return route')
    } finally {
      await page.close()
    }
  })

  test('uses the initial navigation for return-to through an intermediate redirect', async () => {
    const { page } = await open()
    try {
      await page.route('**/peers/a/_kerf/data/alias?*', (route) =>
        replaceFrame(route, (frame) => JSON.stringify({ ...frame, id: 'startGuard' })),
      )
      await go(page, '/alias?tab=one', 'Peer A item 42')
      expect(new URL(page.url()).searchParams.get('next')).toBe('/alias?tab=one')
      await code(page, 'return-to', '/alias?tab=one')
    } finally {
      await page.close()
    }
  })

  test('refuses a redirect from a release page without a route contract', async () => {
    const { page } = await open()
    try {
      await page.route('**/peers/a/_kerf/data/', (route) =>
        replaceFrame(route, (frame) =>
          JSON.stringify({
            v: frame.v,
            build: frame.build,
            kind: 'redirect',
            id: 'item',
          }),
        ),
      )
      await go(page, '/', 'Release error')
      expect(page.url()).toBe(address + '/')
    } finally {
      await page.close()
    }
  })

  test('cuts off a redirect loop without committing an intermediate address', async () => {
    const { page } = await open()
    try {
      await page.route('**/peers/a/_kerf/data/guard*', (route) =>
        replaceFrame(route, (frame) =>
          JSON.stringify({
            v: frame.v,
            build: frame.build,
            kind: 'redirect',
            id: 'startGuard',
          }),
        ),
      )
      await go(page, '/guard?tab=one', 'Release error')
      expect(page.url()).toBe(address + '/guard?tab=one')
    } finally {
      await page.close()
    }
  })
}

function bootstrapCase() {
  test('bounds startup settings before any release route mounts', async () => {
    const { page } = await open()
    try {
      await page.route('**/peers/a/_kerf/bootstrap', (route) =>
        replaceFrame(route, (frame) =>
          JSON.stringify({
            ...frame,
            value: { peer: 'á'.repeat(40_000) },
          }),
        ),
      )
      await go(page, '/', 'Release bootstrap failed')
      expect(await page.getByRole('heading', { name: 'Release home' }).count()).toBe(0)
      expect(await page.locator('[data-bootstrap]').count()).toBe(0)
    } finally {
      await page.close()
    }
  })

  test('clears settings after a refused refresh completes during another route', async () => {
    const { page } = await open()
    let release = () => {}
    const hold = new Promise<void>((resolve) => {
      release = resolve
    })
    try {
      await go(page, '/', 'Release home')
      await code(page, 'bootstrap', 'a')
      await page.route('**/peers/a/_kerf/bootstrap', async (route) => {
        await hold
        await replaceFrame(route, (frame) => JSON.stringify({ ...frame, value: { peer: [] } }))
      })
      await page.getByRole('button', { name: 'Read bootstrap again' }).click()
      await page.getByRole('link', { name: 'Item' }).click()
      await page.getByRole('heading', { name: 'Peer A item 42' }).waitFor()
      const response = page.waitForResponse('**/peers/a/_kerf/bootstrap')
      release()
      await response
      await page.getByRole('link', { name: 'Home' }).click()
      await code(page, 'bootstrap', 'No admitted settings')
      await page.unroute('**/peers/a/_kerf/bootstrap')
      await page.getByRole('button', { name: 'Read bootstrap again' }).click()
      await code(page, 'bootstrap', 'a')
    } finally {
      release()
      await page.close()
    }
  })
}

export function testCriticShellOperations() {
  operationCases()
  rollbackCase()
  httpHeaderCases()
  mediaTypeCases()
  revalidationCase()
  realtimeCases()
  navigationCases()
  returnCases()
  bootstrapCase()
}
