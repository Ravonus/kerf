import { screen } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { mount, tick } from '#adapter'
import { Stopwatch } from './solution'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

const setup = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
const elapsed = () => screen.getByTestId('elapsed').textContent?.trim()
const btn = (name: string) => screen.getByRole('button', { name })
const laps = () => screen.queryAllByRole('listitem').map(li => li.textContent?.trim())

test('starts stopped at 0.0', () => {
  mount(Stopwatch, {})
  expect(elapsed()).toBe('0.0')
  expect(btn('Start')).toBeTruthy()
})

test('counts while running and pauses when stopped', async () => {
  const user = setup()
  mount(Stopwatch, {})
  await user.click(btn('Start'))
  await tick(1000)
  expect(elapsed()).toBe('1.0')
  await user.click(btn('Stop'))
  await tick(1000)
  expect(elapsed()).toBe('1.0')
  await user.click(btn('Start'))
  await tick(500)
  expect(elapsed()).toBe('1.5')
})

test('speed chosen before starting', async () => {
  const user = setup()
  mount(Stopwatch, {})
  await user.selectOptions(screen.getByLabelText('Speed'), '2')
  await user.click(btn('Start'))
  await tick(1000)
  expect(elapsed()).toBe('2.0')
})

test('speed changed while running applies from then on', async () => {
  const user = setup()
  mount(Stopwatch, {})
  await user.click(btn('Start'))
  await tick(500)
  expect(elapsed()).toBe('0.5')
  await user.selectOptions(screen.getByLabelText('Speed'), '5')
  await tick(500)
  expect(elapsed()).toBe('3.0')
})

test('laps record the current value', async () => {
  const user = setup()
  mount(Stopwatch, {})
  await user.click(btn('Start'))
  await tick(1200)
  await user.click(btn('Lap'))
  await tick(300)
  await user.click(btn('Lap'))
  expect(screen.getByRole('list', { name: 'Laps' })).toBeTruthy()
  expect(laps()).toEqual(['Lap 1: 1.2', 'Lap 2: 1.5'])
})

test('reset stops and clears', async () => {
  const user = setup()
  mount(Stopwatch, {})
  await user.click(btn('Start'))
  await tick(700)
  await user.click(btn('Lap'))
  await user.click(btn('Reset'))
  expect(elapsed()).toBe('0.0')
  expect(laps()).toEqual([])
  expect(btn('Start')).toBeTruthy()
  await tick(1000)
  expect(elapsed()).toBe('0.0')
})

test('no timers left after stop', async () => {
  const user = setup()
  mount(Stopwatch, {})
  await user.click(btn('Start'))
  await tick(300)
  await user.click(btn('Stop'))
  expect(vi.getTimerCount()).toBe(0)
})

test('no timers left after unmount', async () => {
  const user = setup()
  const h = mount(Stopwatch, {})
  await user.click(btn('Start'))
  await tick(300)
  h.unmount()
  expect(vi.getTimerCount()).toBe(0)
})
