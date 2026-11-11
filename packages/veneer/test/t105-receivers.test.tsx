import { fireEvent } from '@testing-library/dom'
import { state } from '@kerf/core'
import { flush, render } from '@kerf/core/test'
import { Checklist, type ChecklistProps } from '../src/flow/Checklist'
import { MfaSetup, type MfaSetupProps } from '../src/flow/MfaSetup'
import { OtpField, type OtpFieldProps } from '../src/flow/Otp'
import { button, named, type } from './flow-support'

const settle = async () => {
  await new Promise((resolve) => {
    setTimeout(resolve)
  })
  await flush()
}

test('MFA uses current verify and done methods with original receiver and awaits verify', async () => {
  const calls: unknown[] = []
  let resolveVerify: (value: boolean) => void = () => {}
  const props: MfaSetupProps = {
    open: state(true),
    secret: 'secret',
    codes: ['A'],
    onVerify() {},
    onDone() {},
  }
  const { container } = render(() => MfaSetup(props))
  await flush()
  button(container, /Continue/).click()
  await settle()
  props.onVerify = function (value) {
    calls.push(this, value)
    return Promise.reject(new Error('verification failed'))
  }
  type(named(container, 'totp'), '123456')
  button(container, /Continue/).click()
  await settle()
  expect(calls).toEqual([props, '123456'])
  expect(container.querySelector('[data-part="codes"]')).toBeNull()
  calls.length = 0
  props.onVerify = function (value) {
    calls.push(this, value)
    return new Promise<boolean>((resolve) => {
      resolveVerify = resolve
    })
  }
  props.onDone = function () {
    calls.push(this, 'done')
  }
  button(container, /Continue/).click()
  await flush()
  expect(container.querySelector('[data-part="codes"]')).toBeNull()
  resolveVerify(true)
  await settle()
  container.querySelector<HTMLInputElement>('[data-step="codes"] input[type="checkbox"]')!.click()
  await flush()
  button(container, /Finish/).click()
  expect(calls).toEqual([props, '123456', props, 'done'])
  expect(props.open.value).toBe(false)
})

test('OTP uses current value and completion methods with original receiver', async () => {
  const calls: unknown[] = []
  const props: OtpFieldProps = { autoSubmit: false, onValueChange() {}, onComplete() {} }
  const { container } = render(() => OtpField(props))
  await flush()
  props.onValueChange = function (value) {
    calls.push(this, value)
  }
  props.onComplete = function (value) {
    calls.push(this, value)
  }
  type(container.querySelector('input')!, '123456')
  expect(calls).toEqual([props, '123456', props, '123456'])
})

test('checklist looks up its current callback before reading checked', async () => {
  const events: unknown[] = []
  const callbacks: { current: ChecklistProps['onToggle'] } = { current() {} }
  const props: ChecklistProps = { items: [{ id: 'one', title: 'One' }] }
  Object.defineProperty(props, 'onToggle', {
    get() {
      events.push('callback')
      return callbacks.current
    },
  })
  const { container } = render(() => Checklist(props))
  await flush()
  const input = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!
  Object.defineProperty(input, 'checked', {
    get() {
      events.push('checked')
      return true
    },
  })
  callbacks.current = function (this: unknown, id, checked) {
    events.push(this, id, checked)
  }
  events.length = 0
  fireEvent.change(input)
  expect(events).toEqual(['callback', 'checked', props, 'one', true])
  callbacks.current = undefined
  events.length = 0
  fireEvent.change(input)
  expect(events).toEqual(['callback'])
})
