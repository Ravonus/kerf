// Sandbox switching for both rails: which host and key mode a config picks, and that a key from the other mode is a
// clear PAY032 before anything is sent. Every `fetch` here is a stub that records the URL; nothing reaches a network.
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { definePay, memoryPayStore } from '@kerf-js/pay/server'
import { stripeKeyMode, stripeRail } from '../src/stripe'
import { squareRail, squareSandbox } from '../src/square'
import type { CheckoutRequest } from '@kerf-js/pay'
import squarePlugin from '../square-plugin.mjs'
import { setup as paySetup } from '../src/setup.mjs'

const VARS = [
  'STRIPE_MODE',
  'STRIPE_SECRET_KEY',
  'STRIPE_PUBLISHABLE_KEY',
  'SQUARE_ENVIRONMENT',
  'SQUARE_ENV',
  'SQUARE_APPLICATION_ID',
  'SQUARE_ACCESS_TOKEN',
  'SQUARE_LOCATION_ID',
]
let saved: Record<string, string | undefined> = {}
beforeEach(() => {
  saved = Object.fromEntries(VARS.map((v) => [v, process.env[v]]))
  for (const v of VARS) delete process.env[v]
})
afterEach(() => {
  for (const v of VARS)
    if (saved[v] === undefined) delete process.env[v]
    else process.env[v] = saved[v]
})

// Not real keys, and the live one is assembled so no scanner (or PAY031) reads it as one: the prefix is all a rail reads.
const TEST_KEY = ['sk', 'test', 'notarealkey'].join('_')
const LIVE_KEY = ['sk', 'live', 'notarealkey'].join('_')

const request: CheckoutRequest = {
  user: 'u1',
  line: {
    product: 'pie',
    name: 'Pie',
    amount: 2400,
    currency: 'usd',
    mode: 'payment',
    quantity: 1,
  },
  successUrl: 'https://shop.test/ok',
  cancelUrl: 'https://shop.test/no',
  idempotencyKey: 'k1',
}

function stub(answer: unknown) {
  const urls: string[] = []
  const fetcher = vi.fn((url: string) => {
    urls.push(url)
    return Promise.resolve(new Response(JSON.stringify(answer)))
  }) as unknown as typeof fetch
  return { urls, fetcher }
}

// ---- Stripe ------------------------------------------------------------------------------------------------------

test('a Stripe key says its own mode', () => {
  expect(stripeKeyMode('sk_test_x')).toBe('test')
  expect(stripeKeyMode('rk_test_x')).toBe('test')
  expect(stripeKeyMode('pk_test_x')).toBe('test')
  expect(stripeKeyMode(LIVE_KEY)).toBe('live')
  expect(stripeKeyMode(['pk', 'live', 'x'].join('_'))).toBe('live')
  expect(stripeKeyMode('whsec_x')).toBeUndefined()
  expect(stripeKeyMode(undefined)).toBeUndefined()
})

test('a test key is test mode, with or without STRIPE_MODE', async () => {
  const { urls, fetcher } = stub({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' })
  process.env.STRIPE_SECRET_KEY = TEST_KEY
  expect(stripeRail({ fetch: fetcher }).sandbox).toBe(true)
  process.env.STRIPE_MODE = 'test'
  const rail = stripeRail({ fetch: fetcher })
  expect(rail.sandbox).toBe(true)
  await rail.checkout(request)
  expect(urls).toEqual(['https://api.stripe.com/v1/checkout/sessions'])
})

test('a live key in test mode is refused before anything is sent', async () => {
  const { urls, fetcher } = stub({})
  process.env.STRIPE_MODE = 'test'
  process.env.STRIPE_SECRET_KEY = LIVE_KEY
  const rail = stripeRail({ fetch: fetcher })
  await expect(rail.checkout(request)).rejects.toMatchObject({
    code: 'PAY032',
    message: expect.stringMatching(/live key/),
  })
  await expect(rail.refund!({ purchase: 'pi_1' })).rejects.toMatchObject({ code: 'PAY032' })
  expect(rail.sandbox).toBeUndefined()
  expect(urls).toEqual([])
})

test('a test key in live mode is refused, so a shop never takes pretend payments', async () => {
  const { urls, fetcher } = stub({})
  const rail = stripeRail({ fetch: fetcher, mode: 'live', secretKey: TEST_KEY })
  await expect(rail.checkout(request)).rejects.toMatchObject({
    code: 'PAY032',
    message: expect.stringMatching(/test key/),
  })
  expect(urls).toEqual([])
  expect(stripeRail({ mode: 'live', secretKey: LIVE_KEY }).sandbox).toBe(false)
})

test('a publishable key from the other mode is refused', async () => {
  const { fetcher } = stub({})
  process.env.STRIPE_PUBLISHABLE_KEY = ['pk', 'live', 'x'].join('_')
  await expect(
    stripeRail({ fetch: fetcher, secretKey: TEST_KEY }).checkout(request),
  ).rejects.toMatchObject({ code: 'PAY032', message: expect.stringMatching(/same mode/) })
})

test('STRIPE_MODE takes test, live and their Square spellings; anything else is refused', async () => {
  for (const mode of ['test', 'TEST', 'sandbox'])
    expect(stripeRail({ mode: mode as 'test', secretKey: TEST_KEY }).sandbox).toBe(true)
  expect(stripeRail({ mode: 'production' as 'live', secretKey: LIVE_KEY }).sandbox).toBe(false)
  process.env.STRIPE_MODE = 'staging'
  await expect(
    stripeRail({ secretKey: TEST_KEY, fetch: stub({}).fetcher }).checkout(request),
  ).rejects.toMatchObject({ code: 'PAY032', message: expect.stringMatching(/`staging`/) })
})

test('with no key yet, STRIPE_MODE alone answers sandbox', () => {
  expect(stripeRail().sandbox).toBeUndefined()
  process.env.STRIPE_MODE = 'test'
  expect(stripeRail().sandbox).toBe(true)
})

// ---- Square ------------------------------------------------------------------------------------------------------

const square = (fetcher: typeof fetch, over = {}) =>
  squareRail({ accessToken: 'EAAAsandboxtoken', locationId: 'L1', fetch: fetcher, ...over })

test('SQUARE_ENVIRONMENT=sandbox picks the sandbox host; unset is production', async () => {
  const link = { payment_link: { url: 'https://sandbox.square.link/u/abc' } }
  let s = stub(link)
  process.env.SQUARE_ENVIRONMENT = 'sandbox'
  expect(square(s.fetcher).sandbox).toBe(true)
  await square(s.fetcher).checkout(request)
  expect(s.urls[0]).toBe('https://connect.squareupsandbox.com/v2/online-checkout/payment-links')

  delete process.env.SQUARE_ENVIRONMENT
  s = stub(link)
  expect(square(s.fetcher).sandbox).toBe(false)
  await square(s.fetcher).checkout(request)
  expect(s.urls[0]).toBe('https://connect.squareup.com/v2/online-checkout/payment-links')
})

test('SQUARE_ENV still works, and the env is read per call, not frozen at load', async () => {
  const s = stub({ payment_link: { url: 'https://sandbox.square.link/u/abc' } })
  const rail = square(s.fetcher)
  process.env.SQUARE_ENV = 'Sandbox'
  await rail.checkout(request)
  expect(s.urls[0]).toMatch(/^https:\/\/connect\.squareupsandbox\.com\//)
})

test('a misspelled environment is refused, not read as production', async () => {
  const s = stub({})
  process.env.SQUARE_ENVIRONMENT = 'sandbx'
  await expect(square(s.fetcher).checkout(request)).rejects.toMatchObject({
    code: 'PAY032',
    message: expect.stringMatching(/`sandbx`/),
  })
  expect(s.urls).toEqual([])
  expect(square(s.fetcher).sandbox).toBeUndefined()
})

test('an application id from the other environment is refused', () => {
  expect(squareSandbox({ environment: 'sandbox', applicationId: 'sandbox-sq0idb-abc' })).toBe(true)
  expect(squareSandbox({ environment: 'production', applicationId: 'sq0idp-abc' })).toBe(false)
  expect(() =>
    squareSandbox({ environment: 'production', applicationId: 'sandbox-sq0idb-abc' }),
  ).toThrow(/SQUARE_ENVIRONMENT=sandbox/)
  expect(() => squareSandbox({ environment: 'sandbox', applicationId: 'sq0idp-abc' })).toThrow(
    /production app/,
  )
  process.env.SQUARE_APPLICATION_ID = 'sandbox-sq0idb-abc'
  expect(() => squareSandbox()).toThrow(expect.objectContaining({ code: 'PAY032' }))
})

test("a token on the other environment's host says which host it hit", async () => {
  const fetcher = (() =>
    Promise.resolve(
      new Response(
        JSON.stringify({ errors: [{ detail: 'This request could not be authorized.' }] }),
        {
          status: 401,
        },
      ),
    )) as unknown as typeof fetch
  await expect(square(fetcher).checkout(request)).rejects.toMatchObject({
    code: 'PAY030',
    message: expect.stringMatching(/SQUARE_ENVIRONMENT=sandbox/),
  })
  await expect(square(fetcher, { environment: 'sandbox' }).checkout(request)).rejects.toMatchObject(
    { message: expect.stringMatching(/sandbox token/) },
  )
})

test('a placeholder Square token never leaves for production', async () => {
  const s = stub({})
  await expect(
    square(s.fetcher, { accessToken: 'square_placeholder' }).checkout(request),
  ).rejects.toMatchObject({ code: 'PAY003' })
  expect(s.urls).toEqual([])
})

// ---- the ledger ------------------------------------------------------------------------------------------------

test('pay.sandbox() reads the bound rail, for a test-mode banner', async () => {
  const pay = definePay({
    catalog: [],
    store: memoryPayStore(),
    urls: { success: '/', cancel: '/' },
  })
  pay.use(stripeRail({ secretKey: TEST_KEY }))
  expect(await pay.sandbox()).toBe(true)
  pay.use(stripeRail({ secretKey: LIVE_KEY }))
  expect(await pay.sandbox()).toBe(false)
  pay.use(squareRail({ environment: 'sandbox' }))
  expect(await pay.sandbox()).toBe(true)
  pay.use(stripeRail({ secretKey: LIVE_KEY, mode: 'test' }))
  expect(await pay.sandbox()).toBe(false)
})

// ---- what `kerf add` writes ------------------------------------------------------------------------------------

test('`kerf add pay` writes STRIPE_MODE=test beside the test-key placeholder', () => {
  const plan = paySetup.run({ engine: null, layer: null, read: () => 'server: {\n' })
  expect(plan.env).toMatchObject({ STRIPE_MODE: 'test', STRIPE_SECRET_KEY: 'sk_test_placeholder' })
})

test('`kerf add pay-square` writes the sandbox switch and the empty sandbox variables', () => {
  const { setup } = squarePlugin().contribute({
    command: 'check',
    mode: 'development',
    root: '.',
  }) as {
    setup: { run(): { env: Record<string, string> } }
  }
  const { env } = setup.run()
  expect(env.SQUARE_ENVIRONMENT).toBe('sandbox')
  expect(Object.keys(env)).toEqual(
    expect.arrayContaining([
      'SQUARE_ACCESS_TOKEN',
      'SQUARE_LOCATION_ID',
      'SQUARE_WEBHOOK_SIGNATURE_KEY',
      'SQUARE_WEBHOOK_URL',
    ]),
  )
})

test('the Square placeholder token never leaves, even for the sandbox', async () => {
  const s = stub({})
  process.env.SQUARE_ENVIRONMENT = 'sandbox'
  await expect(
    square(s.fetcher, { accessToken: 'square_sandbox_placeholder' }).checkout(request),
  ).rejects.toMatchObject({ code: 'PAY003' })
  expect(s.urls).toEqual([])
})
