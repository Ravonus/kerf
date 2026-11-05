import { state } from '@weft-js/core'
import { render } from '@weft-js/core/test'
import { Input, Select } from '../../src/index'
import { fruit, key, mount, parts, tick } from './support'

function registerResetGoesBackToThe() {
  test('reset goes back to the first value, on the trigger too', async () => {
    const { container: c } = render(() => (
      <form>
        <Select label="Fruit" name="f" defaultValue="c" options={fruit} />
      </form>
    ))
    document.body.append(c)
    await tick()
    const { trigger, carrier, value } = parts(c)
    key(trigger, 'ArrowDown')
    key(trigger, 'ArrowDown')
    key(trigger, 'Enter')
    await tick()
    expect(value.textContent).toBe('Cress')
    c.querySelector('form')!.reset()
    await tick()
    await tick()
    expect(carrier.value).toBe('c')
    expect(value.textContent).toBe('Corn')
    expect(new FormData(c.querySelector('form')!).get('f')).toBe('c')
  })
  test('a picked value posts; a change on the carrier (autofill) reaches the trigger', async () => {
    const { container: c } = render(() => (
      <form>
        <Select label="Fruit" name="f" options={fruit} />
      </form>
    ))
    document.body.append(c)
    await tick()
    const { carrier, value } = parts(c)
    carrier.value = 'd'
    carrier.dispatchEvent(new Event('change', { bubbles: true }))
    await tick()
    expect(value.textContent).toBe('Cress')
    expect(new FormData(c.querySelector('form')!).get('f')).toBe('d')
  })
  test('a controlled value that does not move stands, on the trigger and the carrier', async () => {
    const { trigger, carrier, value } = await mount(() => (
      <Select label="Fruit" value="a" options={fruit} />
    ))
    key(trigger, 'ArrowDown')
    key(trigger, 'ArrowDown')
    key(trigger, 'Enter')
    await tick()
    expect(value.textContent).toBe('Apple')
    expect(carrier.value).toBe('a')
  })
}

function registerAHandlerThatWritesEl() {
  test('a handler that writes el.value back wins, and a late write shows on focus', async () => {
    const { trigger, carrier, value } = await mount(() => (
      <Select
        label="Fruit"
        onChange={(e) => {
          e.currentTarget.value = 'a'
        }}
        options={fruit}
      />
    ))
    key(trigger, 'ArrowDown')
    key(trigger, 'ArrowDown')
    key(trigger, 'Enter')
    await tick()
    expect(value.textContent).toBe('Apple')
    carrier.value = 'd'
    trigger.dispatchEvent(new FocusEvent('focus'))
    await tick()
    expect(value.textContent).toBe('Cress')
  })
  test('a State binds both ways', async () => {
    const v = state<string | null>('a')
    const { trigger, value } = await mount(() => <Select label="Fruit" value={v} options={fruit} />)
    v.value = 'c'
    await tick()
    expect(value.textContent).toBe('Corn')
    key(trigger, 'ArrowDown')
    key(trigger, 'ArrowUp')
    key(trigger, 'Enter')
    await tick()
    expect(v.value).toBe('a')
  })
  test('an empty required Select shows the message in the field, on the trigger, with no bubble', async () => {
    const { container: c } = render(() => (
      <form>
        <Select label="Fruit" placeholder="Pick" required options={fruit} />
        <Input label="After" required />
      </form>
    ))
    document.body.append(c)
    await tick()
    const { trigger, carrier } = parts(c)
    const e = new Event('invalid', { cancelable: true })
    carrier.dispatchEvent(e)
    await tick()
    expect(e.defaultPrevented).toBe(true)
    expect(c.querySelector('[data-part="error"]')).not.toBeNull()
    expect(trigger.getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(trigger)
    carrier.value = 'a'
    carrier.dispatchEvent(new Event('change', { bubbles: true }))
    await tick()
    expect(c.querySelector('[data-part="error"]')).toBeNull()
  })
}

export function registerTheForm() {
  describe('the form', () => {
    registerResetGoesBackToThe()
    registerAHandlerThatWritesEl()
  })
}
