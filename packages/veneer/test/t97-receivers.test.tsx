import { flush, render } from '@kerf/core/test'
import { Segments } from '../src/Segments'

const key = (element: HTMLElement, value: string) =>
  element.dispatchEvent(
    new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }),
  )
const leave = (element: HTMLElement) =>
  element.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }))

test('Segments onEdit keeps the original receiver and reads replacements', async () => {
  const calls: { receiver: unknown; args: unknown[] }[] = []
  const props: Parameters<typeof Segments>[0] = {
    kind: 'date',
    locale: 'en-US',
    value: null,
    today: '2026-01-15',
    onEdit(this: unknown, ...args) {
      calls.push({ receiver: this, args })
    },
  }
  const app = render(() => Segments(props))
  await flush()
  const month = app.container.querySelector<HTMLElement>('[data-type="month"]')!
  key(month, '1')
  expect(calls).toHaveLength(1)
  expect(calls[0]!.receiver).toBe(props)
  expect(calls[0]!.args[0]).toBe('partial')
  expect(Array.isArray(calls[0]!.args[1])).toBe(true)
  const replacement = vi.fn(function (this: unknown, ...args: unknown[]) {
    calls.push({ receiver: this, args })
  })
  props.onEdit = replacement
  key(month, '2')
  expect(replacement).toHaveBeenCalledTimes(1)
  expect(calls.at(-1)!.receiver).toBe(props)
  expect(calls.at(-1)!.args[0]).toBe('partial')
  app.unmount()
})

test('Segments onBlurPartial keeps the original receiver, absence and replacement', async () => {
  const receivers: unknown[] = []
  const props: Parameters<typeof Segments>[0] = {
    kind: 'date',
    locale: 'en-US',
    value: null,
    today: '2026-01-15',
    onEdit() {},
    onBlurPartial(this: unknown) {
      receivers.push(this)
    },
  }
  const app = render(() => Segments(props))
  await flush()
  const month = app.container.querySelector<HTMLElement>('[data-type="month"]')!
  key(month, '1')
  leave(month)
  expect(receivers).toEqual([props])
  props.onBlurPartial = undefined
  leave(month)
  expect(receivers).toEqual([props])
  const replacement = vi.fn(function (this: unknown) {
    receivers.push(this)
  })
  props.onBlurPartial = replacement
  leave(month)
  expect(replacement).toHaveBeenCalledTimes(1)
  expect(receivers).toEqual([props, props])
  app.unmount()
})
