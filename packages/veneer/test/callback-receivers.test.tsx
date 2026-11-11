import { sleep as tick } from '../../../scripts/lib/sleep.mjs'
import { flush, render } from '@kerf/core/test'
import { CodeInput, type CodeInputProps } from '../src/CodeInput'
import { Checklist, type ChecklistProps } from '../src/flow/Checklist'
import { ConnBanner, type ConnBannerProps } from '../src/flow/ConnBanner'

afterEach(() => {
  document.body.innerHTML = ''
})

test('code reset reads the current callback with its original props receiver', async () => {
  const calls: unknown[] = []
  const first = vi.fn()
  const props: CodeInputProps = { label: 'Code', defaultValue: 'one', onReset: first }
  const { container } = render(() => <form>{CodeInput(props)}</form>)
  document.body.append(container)
  await tick()
  await flush()
  props.onReset = function (this: unknown) {
    calls.push(this)
  }
  container.querySelector('form')!.reset()
  await tick()
  await flush()
  expect(first).not.toHaveBeenCalled()
  expect(calls).toEqual([props])
})

test('checklist hide reads the current callback with its original props receiver', async () => {
  const calls: unknown[] = []
  const first = vi.fn()
  const props: ChecklistProps = { items: [], onHide: first }
  const { container } = render(() => Checklist(props))
  props.onHide = function (this: unknown) {
    calls.push(this)
  }
  container.querySelector<HTMLButtonElement>('button[aria-label="Hide checklist"]')!.click()
  await flush()
  expect(first).not.toHaveBeenCalled()
  expect(calls).toEqual([props])
})

test('connection later reads the current callback with its original props receiver', async () => {
  const calls: unknown[] = []
  const first = vi.fn()
  const props: ConnBannerProps = { stale: true, onLater: first }
  const { container } = render(() => ConnBanner(props))
  props.onLater = function (this: unknown) {
    calls.push(this)
  }
  const later = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Later')!
  later.click()
  await flush()
  expect(first).not.toHaveBeenCalled()
  expect(calls).toEqual([props])
})
