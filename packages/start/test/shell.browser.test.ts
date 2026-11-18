import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import {
  a,
  b,
  address,
  captured,
  criticCookieRead,
  criticMarker,
  open,
  go,
  assertNoMarkup,
  watchSinks,
} from './shell.browser.setup'
import { testHostileShellOperations } from './shell.hostile.browser'

const output = join(import.meta.dirname, 'fixtures/shell/.output-browser-shell')

test('first load, soft navigation and both history directions render the release across two peers', async () => {
  const { page, documents } = await open()
  const from = captured.length
  try {
    const shell = await readFile(join(output, 'public/kerf-shell.html'), 'utf8')
    expect(shell).toContain('<div id="app"></div>')
    expect(shell).toContain('<link rel="stylesheet"')
    expect(shell).not.toMatch(/<h1|kerf-(route|data|cache)|\s+w[kb]=/)
    expect((await readdir(join(output, 'public'))).filter((f) => f.endsWith('.html'))).toEqual([
      'kerf-shell.html',
    ])
    for (const peer of [a, b]) {
      for (const path of ['/', '/items/42', '/broken', '/alias']) {
        const response = await fetch(peer.url + path)
        expect(response.status).toBe(404)
        expect(await response.text()).toBe('')
      }
    }

    await go(page, '/items/42', 'Peer A item 42')
    await page.getByText('Waiting for detail').waitFor()
    await page.getByText('Deferred detail 42').waitFor()
    expect(await page.title()).toBe('Peer A item 42 | Release')
    expect(await page.locator('meta[name=description]').getAttribute('content')).toBe(
      'From the release',
    )
    expect(await page.locator('script[type="application/ld+json"]').textContent()).toContain(
      'Peer A item',
    )
    const layout = await page.getByRole('button', { name: 'Counter 0' }).elementHandle()
    await layout.click()
    await page.evaluate(() => {
      sessionStorage.peer = 'b'
    })
    await page.getByRole('link', { name: 'Home' }).click()
    await page.getByRole('heading', { name: 'Release home' }).waitFor()
    expect(await page.locator('script[type="application/ld+json"]').count()).toBe(0)
    await page.goBack()
    await page.getByRole('heading', { name: 'Peer B item 42' }).waitFor()
    await page.goForward()
    await page.getByRole('heading', { name: 'Release home' }).waitFor()
    expect(await layout.textContent()).toBe('Counter 1')
    expect(documents).toEqual([address + '/items/42'])

    for (const [peer, name] of [
      ['a', 'Peer A item'],
      ['b', 'Peer B item'],
    ] as const) {
      const response = captured
        .slice(from)
        .find((r) => r.peer === peer && r.path === '/_kerf/data/items/42')!
      expect(response.headers.get('content-type')).toBe('application/x-ndjson')
      const raw = await response.text
      expect(raw).not.toMatch(/<|\b(?:head|html|params|path|cache|markup)\b/)
      const [first, detail] = raw
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
      expect(first).toEqual({
        v: 1,
        build: expect.any(String),
        kind: 'page',
        values: [null, { name, link: '/docs/example' }],
      })
      expect(detail).toEqual({
        kind: 'deferred',
        depth: 1,
        key: 'detail',
        value: { text: 'Deferred detail 42' },
      })
    }
    await assertNoMarkup(page)
  } finally {
    await page.close()
  }
})

test('redirects, errors, missing paths and decoded splats are reconstructed locally', async () => {
  const { page, documents } = await open()
  const from = captured.length
  try {
    await go(page, '/alias', 'Peer A item 42')
    expect(page.url()).toBe(address + '/items/42')
    const alias = captured.slice(from).find((r) => r.path.endsWith('/alias'))!
    expect(alias.headers.get('location')).toBeNull()
    expect(JSON.parse(await alias.text)).toEqual({
      v: 1,
      build: expect.any(String),
      kind: 'redirect',
      id: 'item',
    })
    await page.getByRole('link', { name: 'Broken' }).click()
    await page.getByRole('heading', { name: 'Release error' }).waitFor()
    expect(await page.title()).toBe('Release error | Release')
    expect(await page.locator('[data-reference]').getAttribute('data-reference')).toMatch(
      /^[a-f0-9]{24}$/,
    )
    const failed = captured.slice(from).find((r) => r.path.endsWith('/broken'))!
    expect(JSON.parse(await failed.text)).toEqual({
      v: 1,
      build: expect.any(String),
      kind: 'error',
      values: [null],
      reference: expect.stringMatching(/^[a-f0-9]{24}$/),
    })
    await Promise.all([
      page.waitForResponse((r) => r.url().endsWith('/broken')),
      page.getByRole('button', { name: 'Try again' }).click(),
    ])
    await page.getByRole('link', { name: 'Missing' }).click()
    await page.getByRole('heading', { name: 'Release not found /missing' }).waitFor()
    expect(documents).toEqual([address + '/alias'])
    await go(page, '/items/none', 'Release not found /items/none')
    await go(page, '/docs/part/extra%20words', 'Document part/extra words')
  } finally {
    await page.close()
  }
})

test('malicious peer frames, redirect targets, error text and untyped values fail closed', async () => {
  const { page } = await open()
  await page.addInitScript(() => {
    sessionStorage.peer = 'b'
  })
  const attacks = [
    'html',
    'transport-redirect',
    'legacy',
    'head',
    'raw',
    'version',
    'build',
    'params',
    'field',
    'type',
    'url',
    'oversize',
    'redirect-url',
    'redirect-id',
    'error-message',
  ]
  try {
    for (const attack of attacks) {
      const route = attack.startsWith('redirect-')
        ? '/alias'
        : attack === 'error-message'
          ? '/broken'
          : '/items/42'
      const path = route + '?attack=' + attack
      await go(page, path, 'Release error')
      expect(page.url()).toBe(address + path)
      expect(await page.locator('body').textContent()).not.toContain('Peer injection')
      await assertNoMarkup(page)
    }
  } finally {
    await page.close()
  }
})

test('a peer can neither inject markup during soft navigation nor when returning through history', async () => {
  const { page, documents } = await open()
  try {
    await go(page, '/items/42', 'Peer A item 42')
    await page.getByRole('link', { name: 'Home' }).click()
    await page.getByRole('heading', { name: 'Release home' }).waitFor()
    await page.evaluate(() => {
      sessionStorage.peer = 'b'
      sessionStorage.attack = 'head'
    })
    await page.goBack()
    await page.getByRole('heading', { name: 'Release error' }).waitFor()
    await assertNoMarkup(page)
    await page.goForward()
    await page.getByRole('heading', { name: 'Release home' }).waitFor()
    await page.getByRole('link', { name: 'Item' }).click()
    await page.getByRole('heading', { name: 'Release error' }).waitFor()
    await assertNoMarkup(page)
    expect(documents).toEqual([address + '/items/42'])
  } finally {
    await page.close()
  }
})

test('invalid deferred frames stay in the local Boundary and typed text stays literal', async () => {
  const { page } = await open()
  await page.addInitScript(() => {
    sessionStorage.peer = 'b'
  })
  try {
    for (const attack of ['deferred', 'truncated']) {
      await go(page, '/items/42?attack=' + attack, 'Peer B item 42')
      await page.getByText('Detail unavailable').waitFor()
      await assertNoMarkup(page)
    }
    await page.goto(address + '/items/42?attack=text')
    expect(await page.getByRole('heading').textContent()).toContain('<b id="peer-markup">')
    await assertNoMarkup(page)
  } finally {
    await page.close()
  }
})

test('route Fetch ignores peer presentation headers and refuses to read or write cookies', async () => {
  const { page, documents } = await open()
  const requests: string[] = []
  page.on('request', (request) => requests.push(new URL(request.url()).pathname))
  const marker = `<span id="${criticMarker}">probe</span>`
  const from = criticCookieRead.length
  try {
    await page.context().addCookies([{ name: 'critic-release', value: 'example', url: address }])
    await watchSinks(page)
    await go(page, '/critic?critic=headers', marker)
    expect(await page.title()).toBe(marker + ' | Release')
    expect(await page.locator('#' + criticMarker).count()).toBe(0)
    expect(await page.locator('meta[name=critic-note]').getAttribute('id')).toBeNull()
    expect(await page.locator('meta[name=critic-note]').getAttribute('content')).toBe(
      'Text content',
    )
    expect(await page.locator('link[href="/critic-hint.css"]').count()).toBe(0)
    expect(await page.locator('script[type="application/ld+json"]').textContent()).toBe(
      JSON.stringify({ label: marker }),
    )
    expect(criticCookieRead.slice(from)).toEqual([undefined])
    expect((await page.context().cookies()).map(({ name }) => name)).toEqual(['critic-release'])
    await page.getByRole('link', { name: 'Home' }).click()
    await page.getByRole('heading', { name: 'Release home' }).waitFor()
    expect(documents).toEqual([address + '/critic?critic=headers'])
    expect(requests).not.toContain('/critic-header-target')
    expect(requests).not.toContain('/critic-hint.css')
    expect(await page.evaluate(() => Reflect.get(window, 'criticSinks'))).toEqual([])
  } finally {
    await page.close()
  }
})

test('peer hydration, island and preload fields do not reach shell DOM sinks', async () => {
  const { page, documents } = await open()
  const requests: string[] = []
  page.on('request', (request) => requests.push(new URL(request.url()).pathname))
  try {
    await watchSinks(page)
    await go(page, '/critic?critic=legacy', 'Release error')
    expect(await page.locator('#' + criticMarker).count()).toBe(0)
    expect(await page.evaluate(() => Reflect.get(window, 'criticSinks'))).toEqual([])
    expect(await page.title()).toBe('Release error | Release')
    expect(documents).toEqual([address + '/critic?critic=legacy'])
    expect(requests).not.toContain('/critic-hint.css')
    expect(requests).not.toContain('/@vite/client')
  } finally {
    await page.close()
  }
})

test('a peer envelope is rejected after Back and a link click with release code already loaded', async () => {
  const { page, documents } = await open()
  const requests: string[] = []
  page.on('request', (request) => requests.push(request.url()))
  try {
    await go(page, '/critic', 'Release text')
    await page.getByRole('link', { name: 'Home' }).click()
    await page.getByRole('heading', { name: 'Release home' }).waitFor()
    await page.getByRole('link', { name: 'Critic' }).focus()
    expect(requests.filter((url) => url.endsWith('/_kerf/data/critic'))).toHaveLength(1)
    await page.route('**/peers/a/_kerf/data/critic', (request) =>
      request.continue({ url: request.request().url() + '?critic=legacy' }),
    )
    await page.goBack()
    await page.getByRole('heading', { name: 'Release error' }).waitFor()
    expect(page.url()).toBe(address + '/critic')
    await page.goForward()
    await page.getByRole('heading', { name: 'Release home' }).waitFor()
    await page.getByRole('link', { name: 'Critic' }).click()
    await page.getByRole('heading', { name: 'Release error' }).waitFor()
    expect(await page.locator('#' + criticMarker).count()).toBe(0)
    expect(documents).toEqual([address + '/critic'])
  } finally {
    await page.close()
  }
})

test('an untyped deferred property produces only the release Boundary fallback', async () => {
  const { page } = await open()
  try {
    await go(page, '/items/42?critic=deferred', 'Peer A item 42')
    await page.getByText('Detail unavailable').waitFor()
    expect(await page.getByText(criticMarker).count()).toBe(0)
  } finally {
    await page.close()
  }
})

test('refreshes a query after a mutation, calls a custom transport, and admits channels and SSE', async () => {
  const { page, documents } = await open()
  try {
    await go(page, '/critic', 'Release text')
    await page.locator('[data-refresh]').getByText('Server query 0').waitFor()
    await page.getByRole('button', { name: 'Read server function' }).click()
    await page.locator('[data-query]').getByText('Server query 0').waitFor()
    await page.getByRole('button', { name: 'Read through own transport' }).click()
    await page.locator('[data-direct]').getByText('Server query 0').waitFor()
    await page.locator('[data-stream]').getByText('Server stream').waitFor()
    await page.locator('[data-channel]').getByText('open').waitFor()
    await page.getByRole('button', { name: 'Request channel message' }).click()
    await page.locator('[data-notice]').getByText('Server channel').waitFor()
    await page.getByRole('button', { name: 'Submit server form' }).click()
    await page.locator('[data-form]').getByText('Server mutation 1').waitFor()
    await page.locator('[data-refresh]').getByText('Server query 1').waitFor()
    await page.getByRole('button', { name: 'Request refused mutation' }).click()
    await page.locator('[data-action]').getByText('forbidden').waitFor()
    const refused = captured.find((r) => r.path.startsWith('/_kerf/fn/refuseMutation.'))!
    expect(JSON.parse(await refused.text)).toMatchObject({ v: 1, value: { code: 'forbidden' } })
    expect(await refused.text).not.toContain('PEER_PRIVATE_ERROR')
    expect(documents).toEqual([address + '/critic'])
    const noJs = await fetch(a.url + '/critic', {
      method: 'POST',
      body: new URLSearchParams({ $fn: 'probeMutation' }),
      redirect: 'manual',
    })
    expect(noJs.status).toBe(405)
    expect(noJs.headers.get('location')).toBeNull()
  } finally {
    await page.close()
  }
})

test('expands parameterized redirects using release validators and derives return-to locally', async () => {
  const { page } = await open()
  try {
    await go(page, '/guard?tab=one', 'Peer A item 42')
    expect(new URL(page.url()).searchParams.get('next')).toBe('/guard?tab=one')
    await page.locator('[data-return-to]').getByText('/guard?tab=one').waitFor()
    for (const next of ['https://other.invalid/', '//other.invalid/', '/unlisted']) {
      await go(page, '/items/42?next=' + encodeURIComponent(next), 'Peer A item 42')
      await page.locator('[data-return-to]').getByText('No return route').waitFor()
    }
    await page.evaluate(() => {
      sessionStorage.peer = 'b'
    })
    await go(page, '/guard?attack=redirect-param', 'Release error')
    await go(page, '/guard?attack=redirect-id', 'Release error')
    await assertNoMarkup(page)
  } finally {
    await page.close()
  }
})

test('waits for bootstrap and re-reads on demand without mounting peer content', async () => {
  const { page } = await open()
  await page.addInitScript(() => {
    sessionStorage.bootstrapDelay = '1'
  })
  try {
    await page.goto(address, { waitUntil: 'domcontentloaded' })
    await page.getByText('Release bootstrap pending').waitFor()
    expect(await page.getByRole('heading', { name: 'Release home' }).count()).toBe(0)
    await page.getByRole('heading', { name: 'Release home' }).waitFor()
    await page.locator('[data-bootstrap]').getByText('a').waitFor()
    await page.evaluate(() => {
      sessionStorage.peer = 'b'
      sessionStorage.bootstrapAttack = 'field'
    })
    await page.getByRole('button', { name: 'Read bootstrap again' }).click()
    await page.locator('[data-bootstrap-error]').getByText('invalid').waitFor()
    expect(await page.locator('[data-bootstrap]').textContent()).toBe('a')
    await page.evaluate(() => {
      delete sessionStorage.bootstrapAttack
    })
    await page.getByRole('button', { name: 'Read bootstrap again' }).click()
    await page.locator('[data-bootstrap]').getByText('b').waitFor()
    await assertNoMarkup(page)
  } finally {
    await page.close()
  }
})

testHostileShellOperations()
