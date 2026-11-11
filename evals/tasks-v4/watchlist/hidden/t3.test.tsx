// kerf-allow T005: the task spec names data-testid values as the contract for every framework
import { screen } from '@testing-library/dom'
import { cost, fakeApi, seed, start, symbols, type User } from './helpers'

const stocks = seed()
const star = (i: number) => screen.getByRole('button', { name: `Favorite ${stocks[i].symbol}` })
const pressed = (i: number) => star(i).getAttribute('aria-pressed')
const click = (user: User, i: number) => user.click(star(i))
const favoritesOnly = () => screen.getByLabelText('Favorites only') as HTMLInputElement

test('stars show the loaded favorites', async () => {
  await start()
  expect(pressed(0)).toBe('true')
  expect(pressed(1)).toBe('false')
  expect(pressed(9)).toBe('true')
})

test('clicking changes the star at once and saves it', async () => {
  const { fake, user } = await start()
  await click(user, 1)
  expect(pressed(1)).toBe('true')
  expect(fake.saves.map((s) => [s.id, s.favorite])).toEqual([['s1', true]])
  await fake.saves[0].resolve()
  expect(pressed(1)).toBe('true')
  expect(screen.queryByRole('alert')).toBeNull()
})

test('a failed save puts the star back and says so', async () => {
  const { fake, user } = await start()
  await click(user, 0)
  expect(pressed(0)).toBe('false')
  await fake.saves[0].reject()
  expect(pressed(0)).toBe('true')
  expect(screen.getByRole('alert').textContent).toContain(`Couldn't update ${stocks[0].symbol}`)
})

test('a failure puts back only its own star, not ones still saving', async () => {
  const { fake, user } = await start()
  await click(user, 1)
  await click(user, 2)
  await click(user, 3)
  await fake.saves[0].reject()
  expect([pressed(1), pressed(2), pressed(3)]).toEqual(['false', 'true', 'true'])
  await fake.saves[2].resolve()
  await fake.saves[1].reject()
  expect([pressed(1), pressed(2), pressed(3)]).toEqual(['false', 'false', 'true'])
})

test('a failure after another click on the same star keeps the newer click', async () => {
  const { fake, user } = await start()
  await click(user, 4)
  await click(user, 4)
  expect(pressed(4)).toBe('false')
  await fake.saves[0].reject()
  expect(pressed(4)).toBe('false')
  await fake.saves[1].reject()
  expect(pressed(4)).toBe('true')
})

test('Favorites only shows favorites and combines with the search', async () => {
  const { fake, user } = await start()
  await user.click(favoritesOnly())
  expect(symbols()).toEqual(stocks.filter((s) => s.favorite).map((s) => s.symbol))
  await user.type(screen.getByLabelText('Search'), 'a')
  await fake.searches[0].resolve(['s0', 's10', 's18', 's20'])
  expect(symbols()).toEqual([stocks[0].symbol, stocks[18].symbol])
  await click(user, 0)
  expect(symbols()).toEqual([stocks[18].symbol])
})

test('the search text and Favorites only survive a reload, and the search runs again', async () => {
  const first = await start()
  await first.user.type(screen.getByLabelText('Search'), 'cd')
  await first.fake.searches[1].resolve(['s2', 's9', 's27'])
  await first.user.click(favoritesOnly())
  first.handle.unmount()
  const { fake } = await start()
  expect((screen.getByLabelText('Search') as HTMLInputElement).value).toBe('cd')
  expect(favoritesOnly().checked).toBe(true)
  expect(fake.searches.map((s) => s.query)).toEqual(['cd'])
  await fake.searches[0].resolve(['s2', 's9', 's27'])
  expect(symbols()).toEqual([stocks[9].symbol, stocks[27].symbol])
})

test('budget: toggling one star formats at most its row and touches only its DOM', async () => {
  const many = seed(200)
  const { user } = await start(fakeApi(many))
  const button = screen.getByRole('button', { name: `Favorite ${many[101].symbol}` })
  const toggled = await cost(() => user.click(button))
  expect(button.getAttribute('aria-pressed')).toBe('true')
  expect(toggled.calls).toBeLessThanOrEqual(4)
  expect(toggled.dom).toBeLessThanOrEqual(4)
})
