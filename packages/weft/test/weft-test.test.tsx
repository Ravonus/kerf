// @weft-js/core/test itself: user actions and the clock end in flush(), and a test that never asserts fails (T001).
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { resource, state } from '@weft-js/core'
import { interval } from '@weft-js/core/browser'
import { clock, render, screen, user } from '@weft-js/core/test'

function Counter() {
  const n = state(0)
  return <button onClick={() => (n.value += 1)}>Count {n.value}</button>
}

test('user.click ends in flush(): the DOM is current without waiting', async () => {
  render(Counter)
  await user.click(screen.getByRole('button', { name: 'Count 0' }))
  expect(screen.getByRole('button').textContent).toBe('Count 1')
})

test('user.type ends in flush()', async () => {
  function Echo() {
    const text = state('')
    return (
      <label>
        Name <input onInput={e => (text.value = e.currentTarget.value)} />
        <output>{text.value}</output>
      </label>
    )
  }
  render(Echo)
  await user.type(screen.getByLabelText('Name'), 'Ada')
  expect(screen.getByText('Ada').tagName).toBe('OUTPUT')
})

test('screen has role, label and text queries only', () => {
  expect(Object.keys(screen).filter(k => !/By(Role|LabelText|Text)$/.test(k))).toEqual([])
})

test('clock drives timers and the resources that wait on them', async () => {
  clock.install()
  const load = () => new Promise<string>(ok => { setTimeout(() => ok('Ada'), 500) })
  function Profile() {
    const person = resource(load)
    return <p>{person.pending ? 'loading' : person.value}</p>
  }
  render(Profile)
  await clock.advance(499)
  expect(screen.getByText('loading')).toBeTruthy()
  await clock.advance(1)
  expect(screen.getByText('Ada')).toBeTruthy()
  expect(clock.now()).toBe(500)
})

test('clock drives intervals with user actions in between', async () => {
  clock.install()
  function Ticker() {
    const n = state(0)
    const on = state(false)
    interval(100, () => on.value && (n.value += 1))
    return <button onClick={() => (on.value = !on.value)}>{n.value}</button>
  }
  render(Ticker)
  await user.click(screen.getByRole('button'))
  await clock.advance(350)
  expect(screen.getByRole('button').textContent).toBe('3')
})

test('clock is uninstalled after each test', async () => {
  expect(clock.installed).toBe(false)
  await expect(clock.advance(1)).rejects.toThrow(/T004: clock.advance\(\) needs clock.install\(\)/)
})

test('a test that never asserts fails with T001; asserting and test.fails tests pass', () => {
  const cwd = resolve(__dirname, '..')
  let out = ''
  try {
    execFileSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config', 'test/fixtures/runtime/vitest.config.ts'], { cwd, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' } })
  } catch (e) {
    const failed = e as { stdout: string; stderr: string }
    out = `${failed.stdout}${failed.stderr}`
  }
  expect(out).toContain('T001: "never asserts" made no assertion')
  expect(out).toMatch(/1 failed \| 1 passed \| 1 expected fail/)
}, 30000)
