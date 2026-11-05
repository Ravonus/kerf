import { flush, render } from '@weft-js/core/test'
import { Button, type ButtonProps } from '../src/Button'
import { Tabs } from '../src/Tabs'
import { Question } from '../src/agent/Question'
import { TransportPicker } from '../src/live/TransportPicker'

afterEach(() => {
  document.body.innerHTML = ''
})

test('button press keeps the current callback and original props receiver', async () => {
  const calls: unknown[] = []
  const first = vi.fn()
  const props: ButtonProps = { children: 'Run', onClick: first }
  const { container } = render(() => Button(props))
  props.onClick = function (this: unknown, event) {
    expect(event).toBeInstanceOf(MouseEvent)
    calls.push(this)
  }
  container.querySelector('button')!.click()
  await flush()
  expect(first).not.toHaveBeenCalled()
  expect(calls).toEqual([props])
})

test('tab keys keep the current callback and original props receiver', async () => {
  const calls: Array<{ receiver: unknown; value: string }> = []
  const first = vi.fn()
  const props: Parameters<typeof Tabs>[0] = {
    label: 'Pages',
    value: 'a',
    onChange: first,
    options: [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ],
  }
  const { container } = render(() => Tabs(props))
  props.onChange = function (this: unknown, value) {
    calls.push({ receiver: this, value })
  }
  container
    .querySelector('[role="tablist"]')!
    .dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
    )
  await flush()
  expect(first).not.toHaveBeenCalled()
  expect(calls).toEqual([{ receiver: props, value: 'b' }])
})

test('question answers keep the current callback and original props receiver', async () => {
  const calls: Array<{ receiver: unknown; answer: string | string[] }> = []
  const first = vi.fn()
  const props: Parameters<typeof Question>[0] = {
    quiet: true,
    question: { id: 'q', prompt: 'Which?', options: ['a', 'b'] },
    onAnswer: first,
  }
  const { container } = render(() => Question(props))
  props.onAnswer = function (this: unknown, answer) {
    calls.push({ receiver: this, answer })
  }
  container
    .querySelector('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await flush()
  expect(first).not.toHaveBeenCalled()
  expect(calls).toEqual([{ receiver: props, answer: 'a' }])
})

test('transport configure and reset keep the current callback and original props receiver', async () => {
  const calls: Array<{ receiver: unknown; wire: string }> = []
  const first = vi.fn()
  const props: Parameters<typeof TransportPicker>[0] = { wire: 'tabs', onConfigChange: first }
  const { container } = render(() => TransportPicker(props))
  props.onConfigChange = function (this: unknown, config) {
    calls.push({ receiver: this, wire: config.wire })
  }
  container.querySelector<HTMLInputElement>('input[value="fake"]')!.click()
  await flush()
  const reset = [...container.querySelectorAll('button')].find((b) =>
    b.textContent?.trim().endsWith('Reset'),
  )!
  reset.click()
  await flush()
  expect(first).not.toHaveBeenCalled()
  expect(calls).toEqual([
    { receiver: props, wire: 'fake' },
    { receiver: props, wire: 'tabs' },
  ])
})
