import { sleep as tick } from '../../../scripts/lib/sleep.mjs'
import { state } from '@kerf/core'
import { flush, render } from '@kerf/core/test'
import { Ticker } from '../src/Ticker'

const settle = async () => {
  await tick()
  await flush()
  await tick()
  await flush()
}

describe('Ticker', () => {
  test('a new locale reformats it', async () => {
    const locale = state('en-US')
    const { container: c } = render(() => <Ticker value={48120} locale={locale.value} />)
    await settle()
    expect(c.querySelector('[data-part="sr"]')!.textContent).toBe('48,120')
    locale.value = 'de-DE'
    await settle()
    expect(c.querySelector('[data-part="sr"]')!.textContent).toBe('48.120')
    expect(c.querySelector('[data-part="sym"]')!.textContent).toBe('.')
  })

  test('a new format does too, and the value still rolls', async () => {
    const format = state<Intl.NumberFormatOptions | undefined>(undefined)
    const value = state(5)
    const { container: c } = render(() => (
      <Ticker value={value.value} locale="en-US" format={format.value} />
    ))
    await settle()
    format.value = { style: 'percent' }
    await settle()
    expect(c.querySelector('[data-part="sr"]')!.textContent).toBe('500%')
    value.value = 6
    await settle()
    expect(c.querySelector('[data-part="sr"]')!.textContent).toBe('600%')
  })
})
