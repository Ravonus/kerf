import { screen } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { mount, tick } from '#adapter'
import { Stopwatch } from './solution'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

const setup = (props: { hidden?: boolean } = {}) => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  const h = mount(Stopwatch, props)
  return { user, h }
}
const elapsed = () => screen.getByTestId('elapsed').textContent?.trim()
const btn = (name: string) => screen.getByRole('button', { name })
const laps = () => screen.queryAllByRole('listitem').map((li) => li.textContent?.trim())
const speed = (user: ReturnType<typeof userEvent.setup>, v: string) =>
  user.selectOptions(screen.getByLabelText('Speed'), v)

test('still counts at normal speed', async () => {
  const { user } = setup()
  await user.click(btn('Start'))
  await tick(1000)
  expect(elapsed()).toBe('1.0')
})

test('speed changed while running applies from then on', async () => {
  const { user } = setup()
  await user.click(btn('Start'))
  await tick(500)
  await speed(user, '5')
  await tick(500)
  expect(elapsed()).toBe('3.0')
  await speed(user, '2')
  await tick(500)
  expect(elapsed()).toBe('4.0')
})

test('laps record the current time and reset clears them', async () => {
  const { user } = setup()
  await speed(user, '2')
  await user.click(btn('Start'))
  await tick(600)
  await user.click(btn('Lap'))
  await tick(300)
  await user.click(btn('Lap'))
  expect(laps()).toEqual(['Lap 1: 1.2', 'Lap 2: 1.8'])
  await user.click(btn('Reset'))
  expect(laps()).toEqual([])
  expect(elapsed()).toBe('0.0')
})

test('hidden pauses counting and showing again resumes', async () => {
  const { user, h } = setup()
  await user.click(btn('Start'))
  await tick(500)
  await h.setProps({ hidden: true })
  await tick(1000)
  expect(elapsed()).toBe('0.5')
  await h.setProps({ hidden: false })
  await tick(500)
  expect(elapsed()).toBe('1.0')
})

test('no timers run while hidden', async () => {
  const { user, h } = setup()
  await user.click(btn('Start'))
  await tick(200)
  await h.setProps({ hidden: true })
  expect(vi.getTimerCount()).toBe(0)
})

test('a stopped stopwatch stays stopped when shown again', async () => {
  const { h } = setup()
  await h.setProps({ hidden: true })
  await h.setProps({ hidden: false })
  await tick(1000)
  expect(elapsed()).toBe('0.0')
})

test('mounted hidden does not count after Start until shown', async () => {
  const { user, h } = setup({ hidden: true })
  await user.click(btn('Start'))
  await tick(500)
  expect(elapsed()).toBe('0.0')
  await h.setProps({ hidden: false })
  await tick(500)
  expect(elapsed()).toBe('0.5')
})

test('no timers left after unmount', async () => {
  const { user, h } = setup()
  await user.click(btn('Start'))
  await tick(200)
  h.unmount()
  expect(vi.getTimerCount()).toBe(0)
})
