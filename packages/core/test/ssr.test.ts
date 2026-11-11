// Server render → hydrate round trips of the v3 reference app (evals/reference-v3/kerf). The same sources load
// twice: `?kerf-ssr` compiles them for @kerf/core/ssr, `?kerf-hydrate` for hydratable @kerf/core/dom (vite.mjs), both with
// kerf's own back end (research 19 §2.4: keys are source paths, ` wk="0.1/0"`).
// kerf-allow T005: framework test of SSR and hydration; server markup and node identity are the subject
import { readFileSync } from 'node:fs'
import { screen } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { attr, renderToString } from '@kerf/core/ssr'
import { hydrate } from '@kerf/core/dom'
import { flush } from '@kerf/core/test'
import { hydration } from '../src/hydrate'
import { App as ServerApp } from '../../../evals/reference-v3/kerf/src/App.tsx?kerf-ssr'
import { App as ClientApp } from '../../../evals/reference-v3/kerf/src/App.tsx?kerf-hydrate'
import { Shop as ServerShop } from './fixtures/ssr/Shop.tsx?kerf-ssr'
import { Shop as ClientShop } from './fixtures/ssr/Shop.tsx?kerf-hydrate'
import type { Product } from '../../../evals/reference-v3/kerf/src/api'
import { App as ServerScopeApp } from './fixtures/v3-scope/App.tsx?kerf-ssr'
import * as basicsS from './fixtures/next/Basics.tsx?kerf-ssr'
import * as basicsC from './fixtures/next/Basics.tsx?kerf-hydrate'
import * as twoS from './fixtures/next/Step2.tsx?kerf-ssr'
import * as twoC from './fixtures/next/Step2.tsx?kerf-hydrate'
import { Watched as WatchedS } from './fixtures/ssr/Watched.tsx?kerf-ssr'
import { Watched as WatchedC } from './fixtures/ssr/Watched.tsx?kerf-hydrate'

const products: Product[] = [
  { id: 'apple', name: 'Apple', category: 'fruit', price: 0.5, stock: 20 },
  { id: 'banana', name: 'Banana & co', category: 'fruit', price: 0.25, stock: 3 },
  { id: 'bagel', name: 'Bagel <b>', category: 'bakery', price: 1.2, stock: 6 },
  { id: 'yogurt', name: 'Yogurt "plain"', category: 'dairy', price: 0.9, stock: 0 },
]
const data = () => ({
  products,
  cart: { apple: { qty: 2, addedPrice: 0.4 }, bagel: { qty: 1, addedPrice: 1.2 } },
  filters: { search: '', category: 'all' as const, sort: 'price-asc' as const },
})

/** Render on the "server", put the HTML in the page, hydrate it, and report what hydration changed. */
function roundTrip(server: () => unknown, client: () => unknown) {
  const html = renderToString(server)
  const container = document.body.appendChild(document.createElement('div'))
  container.innerHTML = html
  const before = [...container.querySelectorAll('*')]
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const mutations: MutationRecord[] = []
  const observer = new MutationObserver((r) => mutations.push(...r))
  observer.observe(container, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  })
  const dispose = hydrate(client, container)
  mutations.push(...observer.takeRecords())
  observer.disconnect()
  const warnings = warn.mock.calls.map((c) => String(c[0]))
  warn.mockRestore()
  return { html, container, before, dispose, mutations, warnings }
}

afterEach(() => {
  document.body.innerHTML = ''
})

/** The DOM's own serialization of `html` (jsdom quotes every attribute value). */
const parsed = (html: string) =>
  Object.assign(document.createElement('div'), { innerHTML: html }).innerHTML

test('server attributes: ARIA booleans are the words true/false, other booleans add or drop the attribute', () => {
  expect([
    attr('aria-pressed', false),
    attr('aria-expanded', true),
    attr('disabled', false),
    attr('hidden', true),
  ]).toEqual([' aria-pressed="false"', ' aria-expanded="true"', '', ' hidden'])
})

test('loaded shop: zero mismatches, every server node kept, no DOM writes', () => {
  const r = roundTrip(
    () => ServerShop(data()),
    () => ClientShop(data()),
  )
  expect(r.warnings).toEqual([])
  expect(hydration.misses).toBe(0)
  expect(r.before.every((el) => el.isConnected)).toBe(true)
  expect(r.container.innerHTML).toBe(parsed(r.html))
  expect(r.mutations).toHaveLength(0)
  // the server output is what the user would see before any script runs
  expect(r.html).toContain('Bagel &lt;b>')
  expect(r.html).toContain('aria-label="Add Yogurt &quot;plain&quot;" disabled')
  expect(r.html).toMatch(/<option value="price-asc" selected>/)
  expect(r.before.length).toBeGreaterThan(40)
})

test('loaded shop: hydrated handlers and bindings work', async () => {
  const r = roundTrip(
    () => ServerShop(data()),
    () => ClientShop(data()),
  )
  const user = userEvent.setup()
  const appleRow = screen.getByRole('button', { name: 'Increase Apple' }).closest('li')!
  await user.click(screen.getByRole('button', { name: 'Increase Apple' }))
  await flush()
  expect(appleRow.isConnected).toBe(true) // updated in place, not re-rendered
  expect(appleRow.querySelector('[data-testid=qty]')!.textContent).toBe('3')
  expect(screen.getByRole('button', { name: 'Cart (4)' })).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Add Banana & co' }))
  await flush()
  expect(screen.getByRole('button', { name: 'Increase Banana & co' })).toBeTruthy()
  await user.selectOptions(screen.getByRole('combobox', { name: 'Category' }), 'bakery')
  await flush()
  expect(screen.getByTestId('product-count').textContent).toBe('1 product')
  r.dispose()
})

test('reference App (loading state): round trip, then the client fetch takes over', async () => {
  const api = { listProducts: () => Promise.resolve(products), subscribePrices: () => () => {} }
  const r = roundTrip(
    () => ServerApp({ api }),
    () => ClientApp({ api }),
  )
  expect(r.warnings).toEqual([])
  expect(hydration.misses).toBe(0)
  expect(r.html).toContain('Loading…')
  expect(r.container.innerHTML).toBe(parsed(r.html))
  const header = r.container.querySelector('header')!
  await screen.findByRole('list', { name: 'Products' })
  expect(header.isConnected).toBe(true)
  await userEvent.setup().click(screen.getByRole('button', { name: 'Add Apple' }))
  await flush()
  expect(screen.getByRole('button', { name: 'Cart (1)' })).toBe(
    header.querySelectorAll('button')[1],
  )
  r.dispose()
})

test('a key miss is counted, warned and rendered fresh', () => {
  const html = renderToString(() => ServerShop(data()))
  const container = document.body.appendChild(document.createElement('div'))
  container.innerHTML = html.replace(/ wk="[^"]*"(?=[^]*<\/main>$)/, '') // drop the last key
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  hydrate(() => ClientShop(data()), container)
  expect(hydration.misses).toBe(1)
  expect(warn.mock.calls.some((c) => String(c[0]).includes('hydration key miss'))).toBe(true)
  warn.mockRestore()
})

test('renderToString without hydration: no keys, same markup', () => {
  const plain = renderToString(() => ServerShop(data()), { hydratable: false })
  expect(plain).not.toContain('wk=')
  expect(plain).toBe(renderToString(() => ServerShop(data())).replace(/ wk="[^"]*"/g, ''))
})

test('defineState on the server: one app per render, seeded per request, never shared', () => {
  const api = { listProducts: () => new Promise<never>(() => {}), subscribePrices: () => () => {} }
  const seeded = renderToString(() => ServerScopeApp({ api }), {
    app: { state: { cart: { lines: { apple: { qty: 3, addedPrice: 0.5 } } } } },
  })
  const fresh = renderToString(() => ServerScopeApp({ api }))
  expect(seeded).toContain('Cart (<!--[-->3<!--]-->)')
  expect(fresh).toContain('Cart (<!--[-->0<!--]-->)')
})

// Round trips over the constructs research 19 steps 1–2 lowered: adjacent texts, fragments, conditionals over
// JSX, class/style objects, element spreads, refs, <select value> over a list, SVG and namespaced attributes.

describe('round trips of every lowered construct: 0 misses, 0 DOM writes, then live', () => {
  const clean = (r: ReturnType<typeof roundTrip>) => {
    expect(r.warnings).toEqual([])
    expect(hydration.misses).toBe(0)
    expect(r.before.every((el) => el.isConnected)).toBe(true)
    expect(r.mutations).toHaveLength(0)
  }
  const click = (sel: string) => (document.querySelector(sel) as HTMLElement).click()
  registerMarkupRoundTrips(clean, click)
  registerInteractiveRoundTrips(clean, click)
})

// The point of source-path keys (research 19 §2.4): bindings that exist on one side only don't shift any key.

test('client-only watchers and extra memos shift no key', () => {
  const r = roundTrip(
    () => WatchedS({ client: false }),
    () => WatchedC({ client: true }),
  )
  expect(r.warnings).toEqual([])
  expect(hydration.misses).toBe(0)
  expect(r.mutations).toHaveLength(0)
  r.dispose()
})

test('dev hydration warnings name the source line of the template that missed', () => {
  const source = readFileSync('test/fixtures/next/Basics.tsx', 'utf8')
  const button = source.indexOf('<button')
  expect(button).toBeGreaterThan(-1)
  const line = source.slice(0, button).split('\n').length
  const container = document.body.appendChild(document.createElement('div'))
  container.innerHTML = renderToString(() => basicsS.Hello({}))
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  hydrate(() => basicsC.Counter({}), container)
  expect(hydration.misses).toBe(1)
  expect(warn.mock.calls[0]![0]).toBe(
    `kerf: hydration mismatch at test/fixtures/next/Basics.tsx:${line} <button> (wk=0): the client renders <button>, the server rendered <p>; rendering it fresh`,
  )
  warn.mockRestore()
  container.remove()
})

function registerMarkupRoundTrips(
  clean: (r: ReturnType<typeof roundTrip>) => void,
  click: (sel: string) => void,
) {
  test('text, entities, components with children, fragments, class and style objects', async () => {
    const r = roundTrip(basicsS.Panel, basicsC.Panel)
    clean(r)
    expect(r.html).toContain('on &amp; <!--,-->Ada') // two texts: the client finds two text nodes
    expect(r.html).toContain('class="open panel"')
    click('.wider')
    await flush()
    expect((document.querySelector('section') as HTMLElement).style.width).toBe('15px')
    click('button')
    await flush()
    expect(document.querySelector('em')!.textContent).toBe('closed')
    r.dispose()
  })

  test('conditionals over JSX', async () => {
    const r = roundTrip(twoS.Toggle, twoC.Toggle)
    clean(r)
    const b = document.querySelector('b')!
    click('.inc')
    await flush()
    expect(document.querySelector('b')).toBe(b)
    expect(b.textContent).toBe('on 1')
    r.dispose()
  })

  test('element spreads: server attributes, then client handlers', () => {
    const clicks: string[] = []
    const props = () => ({
      rest: { id: 'spread', href: '/a', onClick: () => clicks.push('a') },
      tone: 'info',
    })
    const r = roundTrip(
      () => twoS.Spread(props()),
      () => twoC.Spread(props()),
    )
    clean(r)
    expect(r.html).toContain('id="spread" href="/a" data-tone="info" title="fixed"')
    click('a')
    expect(clicks).toEqual(['a'])
    r.dispose()
  })
}

function registerInteractiveRoundTrips(
  clean: (r: ReturnType<typeof roundTrip>) => void,
  click: (sel: string) => void,
) {
  test("textContent and innerHTML render on the server; a spread's children are a hole", async () => {
    const props = () => ({ rest: { title: 'kids', children: ['one ', 'two'] } })
    const r = roundTrip(
      () => twoS.Content(props()),
      () => twoC.Content(props()),
    )
    clean(r)
    expect(r.html).toContain('<p class="text">a &lt;b> &amp; 1</p>')
    expect(r.html).toContain('<div class="html"><i>1</i></div>')
    expect(r.html).toMatch(/<div class="kids" title="kids">one <!--,-->two<\/div>/)
    click('button')
    await flush()
    expect(document.querySelector('.text')!.textContent).toBe('a <b> & 2')
    expect(document.querySelector('.html')!.innerHTML).toBe('<i>2</i>')
    expect(document.querySelector('.kids')!.textContent).toBe('one two')
    r.dispose()
  })

  test('refs, <select value> over a list, SVG', async () => {
    const seen: Element[] = []
    const refs = roundTrip(
      () => twoS.Refs({ seen: () => {} }),
      () => twoC.Refs({ seen: (el: Element) => seen.push(el) }),
    )
    // The fixture reads `box.id` through its ref, which only exists on the client: that one text is written.
    expect(hydration.misses).toBe(0)
    expect(refs.mutations.map((m) => m.type)).toEqual(['childList'])
    expect(document.querySelector('output')!.textContent).toBe('box')
    expect(seen).toEqual([document.querySelector('span')])
    refs.dispose()

    const picker = roundTrip(twoS.Picker, twoC.Picker)
    clean(picker)
    expect(picker.html).toMatch(/<option wk="[^"]+" value="b" selected>/)
    expect(document.querySelector('select')!.value).toBe('b')
    picker.dispose()

    const icon = roundTrip(twoS.Icon, twoC.Icon)
    clean(icon)
    expect(document.querySelector('circle')!.namespaceURI).toBe('http://www.w3.org/2000/svg')
    document.querySelector('svg')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()
    expect(document.querySelector('circle')!.getAttribute('r')).toBe('3')
    icon.dispose()
  })
}
