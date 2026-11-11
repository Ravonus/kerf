import { state } from '@kerf-js/core'
import { flush, render } from '@kerf-js/core/test'
import { DateTimeField, TimeField } from '../src/TimeField'

test('time field keeps its controls while live labels and disabled state change', async () => {
  const label = state('Start')
  const disabled = state(false)
  const { container } = render(() => (
    <TimeField label={label.value} disabled={disabled.value} locale="en-US" today="2026-01-15" />
  ))
  await flush()
  const trigger = container.querySelector<HTMLButtonElement>('[data-part="trigger"]')!
  expect(trigger.disabled).toBe(false)
  expect(container.textContent).toContain('Start')
  label.value = 'Revised'
  disabled.value = true
  await flush()
  expect(container.textContent).toContain('Revised')
  expect(container.querySelector('[data-part="trigger"]')).toBe(trigger)
  expect(trigger.disabled).toBe(true)
})

test('date-time slot choices follow the current step while the panel stays mounted', async () => {
  const step = state(60)
  const { container } = render(() => (
    <DateTimeField label="Meeting" step={step.value} locale="en-US" today="2026-01-15" />
  ))
  await flush()
  container.querySelector<HTMLButtonElement>('[data-part="trigger"]')!.click()
  await flush()
  const list = container.querySelector<HTMLElement>('[role="listbox"][aria-label="Time"]')!
  expect(list).toBeTruthy()
  expect(list.querySelectorAll('[role="option"]').length).toBe(24)
  step.value = 30
  await flush()
  expect(container.querySelector('[role="listbox"][aria-label="Time"]')).toBe(list)
  expect(list.querySelectorAll('[role="option"]').length).toBe(48)
})
