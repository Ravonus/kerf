// kerf-allow T005: the task spec names data-testid values as the contract for every framework
import { screen } from '@testing-library/dom'
import { cost, count, fakeApi, seed, start, symbols, tab, type User } from './helpers'

const stocks = seed()
const of = (sector: string) => stocks.filter((s) => s.sector === sector)
const box = () => screen.getByLabelText('Search') as HTMLInputElement
const favOnly = () => screen.getByLabelText('Favorites only') as HTMLInputElement
const go = (user: User, name: string) => user.click(tab(name))

test('tabs show their sector, All by default', async () => {
  const { user } = await start()
  expect(tab('All').getAttribute('aria-pressed')).toBe('true')
  await go(user, 'energy')
  expect(tab('energy').getAttribute('aria-pressed')).toBe('true')
  expect(tab('All').getAttribute('aria-pressed')).toBe('false')
  expect(symbols()).toEqual(of('energy').map((s) => s.symbol))
  expect(count()).toBe(`${of('energy').length} stocks`)
  await go(user, 'All')
  expect(symbols()).toHaveLength(50)
})

test('each tab keeps its own search, Favorites only and Sort', async () => {
  const { fake, user } = await start()
  await go(user, 'tech')
  await user.type(box(), 'z')
  await fake.searches[0].resolve(['s0', 's4', 's5'])
  expect(symbols()).toEqual([stocks[0].symbol, stocks[4].symbol])
  await go(user, 'health')
  expect(box().value).toBe('')
  await user.click(favOnly())
  await user.selectOptions(screen.getByLabelText('Sort'), 'change')
  expect(symbols()).toEqual(
    of('health')
      .filter((s) => s.favorite)
      .sort((a, b) => (b.price - b.prevClose) / b.prevClose - (a.price - a.prevClose) / a.prevClose)
      .map((s) => s.symbol),
  )
  await go(user, 'tech')
  expect(box().value).toBe('z')
  expect(favOnly().checked).toBe(false)
  expect((screen.getByLabelText('Sort') as HTMLSelectElement).value).toBe('symbol')
  expect(symbols()).toEqual([stocks[0].symbol, stocks[4].symbol])
  expect(fake.searches).toHaveLength(1)
})

test("a tab's search keeps going in the background and shows when you come back", async () => {
  const { fake, user } = await start()
  await go(user, 'finance')
  await user.type(box(), 'k')
  expect(screen.getByRole('status').textContent).toContain('Searching…')
  await go(user, 'energy')
  expect(fake.searches[0].signal.aborted).toBe(false)
  expect(screen.queryByText('Searching…')).toBeNull()
  await fake.searches[0].resolve(['s3', 's7', 's1'])
  expect(symbols()).toEqual(of('energy').map((s) => s.symbol))
  await go(user, 'finance')
  expect(symbols()).toEqual([stocks[3].symbol, stocks[7].symbol])
  expect(fake.searches).toHaveLength(1)
})

test('only a newer query in the same tab aborts, and failures stay with their tab', async () => {
  const { fake, user } = await start()
  await go(user, 'tech')
  await user.type(box(), 'm')
  await go(user, 'energy')
  await user.type(box(), 'n')
  expect(fake.searches.map((s) => s.signal.aborted)).toEqual([false, false])
  await fake.searches[0].reject()
  expect(screen.queryByText('Search failed')).toBeNull()
  await user.type(box(), 'o')
  expect(fake.searches[1].signal.aborted).toBe(true)
  await fake.searches[2].resolve(['s1', 's5'])
  expect(symbols()).toEqual([stocks[1].symbol, stocks[5].symbol])
  await go(user, 'tech')
  expect(screen.getByRole('alert').textContent).toContain('Search failed')
})

test('favorites are shared by every tab', async () => {
  const { user } = await start()
  await go(user, 'energy')
  await user.click(screen.getByRole('button', { name: `Favorite ${stocks[1].symbol}` }))
  await go(user, 'All')
  await user.click(favOnly())
  expect(symbols()).toContain(stocks[1].symbol)
})

test('the tab and every tab’s settings survive a reload; a restored search runs when its tab is first shown', async () => {
  const first = await start()
  await go(first.user, 'tech')
  await first.user.type(box(), 'p')
  await go(first.user, 'energy')
  await first.user.type(box(), 'q')
  await first.user.click(favOnly())
  first.handle.unmount()
  const { fake, user } = await start()
  expect(tab('energy').getAttribute('aria-pressed')).toBe('true')
  expect(box().value).toBe('q')
  expect(favOnly().checked).toBe(true)
  expect(fake.searches.map((s) => s.query)).toEqual(['q'])
  await go(user, 'tech')
  expect(box().value).toBe('p')
  expect(fake.searches.map((s) => s.query)).toEqual(['q', 'p'])
  await go(user, 'energy')
  expect(fake.searches).toHaveLength(2)
})

test('budget: switching to a tab whose rows were on screen does not format them', async () => {
  const { user } = await start(fakeApi(seed(200)))
  const c = await cost(() => go(user, 'tech'))
  expect(symbols()).toHaveLength(50)
  expect(c.calls).toBeLessThanOrEqual(2)
})
