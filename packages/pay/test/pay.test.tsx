// @vitest-environment jsdom
// weft/pay end to end over `fakePay` (research 10 §8): a real mutation opens the checkout, a signed webhook goes through
// the real ledger, and a `.live` query shows the grant. Nothing here reaches a network.
import { derived } from '@weft-js/core'
import { clock, net, render, screen, user } from '@weft-js/core/test'
import { entitlementTag, price, product } from '@weft-js/pay'
import type { RailEvent } from '@weft-js/pay'
import { definePay, memoryPayStore } from '@weft-js/pay/server'
import { fakePay } from '@weft-js/pay/test'
import { mutation, query, redirect } from '@weft-js/start'

const DAY = 86_400_000
const pro = product({
  id: 'pro',
  kind: 'subscription',
  use: 'digital',
  plans: { month: { usd: 999 }, year: { usd: 7999, trialDays: 7 } },
  grants: ['pro'],
})
const credits = product({
  id: 'credits',
  kind: 'consumable',
  use: 'digital',
  price: { usd: 500 },
  grants: ['credits'],
})

const pay = definePay({
  catalog: { pro, credits },
  store: memoryPayStore(),
  urls: { success: '/thanks', cancel: '/pricing' },
})

const entitlements = query({
  $id: 'pay.mine',
  auth: 'user',
  tags: (_, ctx) => [entitlementTag(ctx.user.id)],
  run: ({ ctx }) => ctx.entitlements.list(),
})
const checkout = mutation({
  $id: 'pay.checkout',
  auth: 'user',
  input: pay.input,
  run: async ({ input, ctx }) => redirect(await pay.checkout(ctx, input), 303),
})
const report = query({
  $id: 'pay.report',
  auth: 'user',
  requires: ['pro'],
  run: () => 'the numbers',
})
const export_ = mutation({ $id: 'pay.export', auth: 'user', requires: ['pro'], run: () => 'done' })
const has = query({
  $id: 'pay.has',
  auth: 'user',
  run: async ({ ctx }) => ctx.entitlements.has('pro'),
})

declare module '@weft-js/start' {
  interface Context {
    user: { id: string } | null
  }
}

function Paywall() {
  const mine = entitlements.live()
  const isPro = derived(() => mine.value?.includes('pro'))
  return (
    <>
      <p aria-label="plan">{isPro.value ? 'Pro' : 'Free'}</p>
      <button onClick={() => void checkout({ product: 'pro', plan: 'month' })}>
        Go Pro · {price(pro, 'month').display}
      </button>
    </>
  )
}
const plan = () => screen.getByLabelText('plan').textContent

describe('a purchase, as a user sees it', () => {
  test('checkout grants nothing; the verified event does, live', async () => {
    const fake = fakePay(pay)
    net.context({ user: { id: 'u1' } })
    render(Paywall)
    await net.settle()
    expect(plan()).toBe('Free')

    await user.click(screen.getByRole('button', { name: /Go Pro · \$9\.99/ }))
    await net.settle()
    expect(fake.sessions[0]).toMatchObject({
      user: 'u1',
      line: { product: 'pro', amount: 999, interval: 'month' },
    })
    expect(fake.sessions[0]!.successUrl).toBe('http://localhost/thanks')
    expect(plan()).toBe('Free')

    await fake.complete()
    expect(plan()).toBe('Pro')
    await fake.simulate('refund')
    expect(plan()).toBe('Free')
  })

  test('abandoning the page changes nothing', async () => {
    const fake = fakePay(pay)
    net.context({ user: { id: 'u1' } })
    render(Paywall)
    await net.settle()
    await user.click(screen.getByRole('button'))
    await net.settle()
    fake.abandon()
    expect(plan()).toBe('Free')
    expect(fake.deliveries).toEqual([])
  })
})

describe('between tests', () => {
  test("a purchase on the app's own ledger", async () => {
    const fake = fakePay(pay)
    await fake.buy('leak', 'pro', 'month')
    expect(await fake.entitlements('leak')).toEqual(['pro'])
  })

  test('is gone, and so is the fake rail', async () => {
    expect(await pay.entitlements('leak').list()).toEqual([])
    await expect(
      Promise.resolve().then(() =>
        pay.checkout({ user: { id: 'u' }, request: { url: 'http://x/' } }, { product: 'pro' }),
      ),
    ).rejects.toMatchObject({ code: 'P101' })
  })
})

describe('the life of a subscription, on the clock', () => {
  test('renews, fails into grace, recovers, then expires', async () => {
    clock.install(Date.UTC(2026, 0, 1))
    const fake = fakePay({ catalog: [pro] })
    await fake.buy('u1', 'pro', 'month')
    expect(await fake.entitlements('u1')).toEqual(['pro'])

    await fake.simulate('renewal')
    expect((await fake.purchases('u1'))[0]).toMatchObject({
      state: 'active',
      expires: Date.UTC(2026, 0, 1) + 60 * DAY,
    })
    expect(await fake.entitlements('u1')).toEqual(['pro'])

    await fake.simulate('renewal-failed')
    expect((await fake.purchases('u1'))[0]!.state).toBe('grace')
    expect(await fake.entitlements('u1')).toEqual(['pro'])

    await fake.simulate('recovered')
    await fake.simulate('renewal-failed')
    await fake.simulate('grace-expired')
    expect(await fake.entitlements('u1')).toEqual([])
  })

  test('a trial is access, and it ends with its days', async () => {
    clock.install(Date.UTC(2026, 0, 1))
    const fake = fakePay({ catalog: [pro], leeway: 0 })
    await fake.buy('u1', 'pro', 'year')
    expect((await fake.purchases('u1'))[0]).toMatchObject({ state: 'trial', plan: 'year' })
    await clock.advance(7 * DAY - 1)
    expect(await fake.entitlements('u1')).toEqual(['pro'])
    await clock.advance(1)
    expect(await fake.entitlements('u1')).toEqual([]) // the renewal event never came
  })

  test('a late renewal keeps access through the leeway, not forever', async () => {
    clock.install(Date.UTC(2026, 0, 1))
    const fake = fakePay({ catalog: [pro] })
    await fake.buy('u1', 'pro', 'month')
    await clock.advance(32 * DAY)
    expect(await fake.entitlements('u1')).toEqual(['pro'])
    await clock.advance(2 * DAY)
    expect(await fake.entitlements('u1')).toEqual([])
  })

  test('a one-time purchase has no period, and a dispute takes it back', async () => {
    const fake = fakePay({ catalog: [credits] })
    const id = await fake.buy('u1', 'credits')
    expect(await fake.entitlements('u1')).toEqual(['credits'])
    await expect(fake.simulate('renewal', id)).rejects.toThrow('only a subscription renews')
    await fake.simulate('revoke', id)
    expect(await fake.entitlements('u1')).toEqual([])
  })
})

describe('webhooks', () => {
  const event = (over: object) =>
    ({
      id: 'e1',
      at: 1000,
      purchase: 'p1',
      state: 'active',
      user: 'u1',
      product: 'pro',
      ...over,
    }) as RailEvent

  test('a forged delivery is refused and changes nothing', async () => {
    const fake = fakePay({ catalog: [pro] })
    expect(await fake.deliver(event({}), { forged: true })).toBe(400)
    expect(await fake.entitlements('u1')).toEqual([])
    expect(await fake.purchases('u1')).toEqual([])
  })

  test('a redelivery is a no-op, even after the state moved on', async () => {
    const fake = fakePay({ catalog: [pro] })
    expect(await fake.deliver(event({ id: 'grant', at: 1000 }))).toBe(200)
    await fake.deliver(event({ id: 'took', at: 2000, state: 'refunded' }))
    fake.deliveries.length = 0
    expect(await fake.deliver(event({ id: 'grant', at: 3000 }))).toBe(200)
    expect((await fake.purchases('u1'))[0]).toMatchObject({ state: 'refunded', at: 2000 })
  })

  test('a repeat pokes no one', async () => {
    const ledger = definePay({
      catalog: [pro],
      store: memoryPayStore(),
      urls: { success: '/', cancel: '/' },
    })
    const events = [event({})]
    expect(await ledger.ingest('fake', events)).toEqual(['entitlements:u1'])
    expect(await ledger.ingest('fake', events)).toEqual([])
  })

  test("events out of order land where the rail's clock puts them", async () => {
    const fake = fakePay({ catalog: [pro] })
    await fake.deliver(event({ id: 'new', at: 2000, state: 'expired' }))
    await fake.deliver(event({ id: 'old', at: 1000, state: 'active' }))
    expect(await fake.entitlements('u1')).toEqual([])
  })

  test('a refund in the same second as a renewal stands', async () => {
    const fake = fakePay({ catalog: [pro] })
    await fake.deliver(event({ id: 'a', at: 1000, state: 'refunded' }))
    await fake.deliver(event({ id: 'b', at: 1000, state: 'active' }))
    expect(await fake.entitlements('u1')).toEqual([])
  })

  test('a dispute before its payment still counts when the payment arrives', async () => {
    const fake = fakePay({ catalog: [pro] })
    await fake.deliver({ id: 'd', at: 2000, purchase: 'p1', state: 'revoked' })
    await fake.deliver(event({ id: 'paid', at: 1000 }))
    expect((await fake.purchases('u1'))[0]).toMatchObject({ user: 'u1', state: 'revoked' })
  })

  test("a store failure answers 500, so the rail redelivers, and the event isn't marked seen", async () => {
    const store = memoryPayStore()
    const save = store.save.bind(store)
    let down = true
    store.save = async (p) => {
      if (down) throw new Error('database down')
      return save(p)
    }
    const fake = fakePay({ catalog: [pro], store })
    expect(await fake.deliver(event({}))).toBe(500)
    down = false
    expect(await fake.redeliver()).toBe(200)
    expect(await fake.entitlements('u1')).toEqual(['pro'])
  })
})

describe('on the server', () => {
  test('`ctx.entitlements` reads in a query, and is false for a stranger', async () => {
    const fake = fakePay({ catalog: [pro] })
    await fake.buy('u1', 'pro', 'month')
    net.context({ user: { id: 'u1' } })
    expect(await has.fetch()).toBe(true)
    net.context({ user: { id: 'u2' } })
    await net.session({ user: { id: 'u2' } })
    expect(await fake.entitlements('u2')).toEqual([])
  })

  test('`requires` answers a typed 403 before `run`, in a query and a mutation', async () => {
    const fake = fakePay({ catalog: [pro] })
    net.context({ user: { id: 'u1' } })
    await expect(report.fetch()).rejects.toMatchObject({
      code: 'ENTITLEMENT_REQUIRED',
      status: 403,
    })
    await expect(export_()).rejects.toMatchObject({ code: 'ENTITLEMENT_REQUIRED', status: 403 })
    await fake.buy('u1', 'pro', 'month')
    expect(await export_()).toBe('done')
  })

  test('a signed-out buyer and a second subscription are refused, by code', async () => {
    const fake = fakePay({ catalog: [pro] })
    await expect(
      fake.pay.checkout({ user: null, request: { url: 'http://x/' } }, { product: 'pro' }),
    ).rejects.toMatchObject({ code: 'PAY010', status: 401 })
    await fake.buy('u1', 'pro', 'month')
    await expect(fake.buy('u1', 'pro', 'month')).rejects.toMatchObject({
      code: 'PAY023',
      status: 409,
    })
  })

  test('a second purchase reuses the customer, and the portal needs one', async () => {
    const fake = fakePay({ catalog: [pro, credits] })
    const ctx = { user: { id: 'u1' }, request: { url: 'https://app.test/account' } }
    await expect(fake.pay.portal(ctx)).rejects.toMatchObject({ code: 'PAY024' })
    await fake.buy('u1', 'pro', 'month')
    expect(await fake.pay.portal(ctx)).toMatch(/^https:\/\/fake-pay\.test\/portal\//)
    await fake.pay.checkout(ctx, { product: 'credits' })
    expect(fake.sessions.at(-1)!.customer).toBe((await fake.purchases('u1'))[0]!.customer)
  })

  test('the input takes names; an unknown product or plan fails validation, and an amount is dropped', () => {
    const standard = pay.input['~standard']
    const validate = (v: unknown) => standard.validate(v)
    expect(validate({ product: 'pro', plan: 'month', amount: 1 })).toEqual({
      value: { product: 'pro', plan: 'month' },
    })
    expect(validate({ product: 'free' })).toMatchObject({
      issues: [{ message: 'no product `free`' }],
    })
    expect(validate({ product: 'pro', plan: 'week' })).toMatchObject({
      issues: [{ message: '`pro` has no plan `week`' }],
    })
    expect(validate({ product: 'credits', quantity: 1.5 })).toMatchObject({ issues: [{}] })
  })

  test('a memory ledger is refused outside dev, and two rails need a choice', async () => {
    const memory = definePay({
      catalog: [pro],
      store: memoryPayStore(),
      urls: { success: '/', cancel: '/' },
      slot: () =>
        Promise.resolve({
          load: () => Promise.resolve({}),
          providers: { stripe: '@a', paddle: '@b' },
        }),
    })
    expect(() => memory.check!(false)).toThrow(expect.objectContaining({ code: 'PAY016' }))
    memory.check!(true)
    await expect(
      Promise.resolve().then(() =>
        memory.checkout({ user: { id: 'u' }, request: { url: 'http://x/' } }, { product: 'pro' }),
      ),
    ).rejects.toMatchObject({ code: 'PAY022' })
  })
})

describe('the catalog', () => {
  test('a float or a missing currency is PAY008, at definition', () => {
    expect(() =>
      product({ id: 'x', kind: 'one-time', use: 'digital', price: { usd: 9.99 } }),
    ).toThrow(expect.objectContaining({ code: 'PAY008' }))
    expect(() => product({ id: 'x', kind: 'one-time', use: 'digital', price: {} })).toThrow(
      expect.objectContaining({ code: 'PAY008' }),
    )
    expect(() =>
      product({ id: 'x', kind: 'subscription', use: 'digital', plans: { month: { usd: 1.5 } } }),
    ).toThrow(expect.objectContaining({ code: 'PAY008' }))
  })

  test("`price` formats by the currency's own exponent", () => {
    const yen = product({ id: 'y', kind: 'one-time', use: 'digital', price: { jpy: 500 } })
    expect(price(yen, undefined, { locale: 'en-US' }).display).toBe('¥500')
    expect(price(pro, 'year', { locale: 'en-US' })).toEqual({
      amount: 7999,
      currency: 'usd',
      display: '$79.99',
      plan: 'year',
      interval: 'year',
      trialDays: 7,
    })
  })
})
