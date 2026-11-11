import { state } from '@kerf/core'
import { Select } from '../../src/index'
import { fruit, list, mount, tick } from './support'

function registerOptionsCarryAriaSelectedAnd() {
  test('options carry aria-selected and aria-disabled; groups are named', async () => {
    const { c, trigger } = await mount(() => (
      <Select
        label="Food"
        value="c"
        options={[
          { value: 'a', label: 'Apple' },
          {
            group: 'Veg',
            options: [
              { value: 'c', label: 'Corn', hint: 'sweet' },
              { value: 'p', label: 'Pea', disabled: true },
            ],
          },
        ]}
      />
    ))
    trigger.click()
    await tick()
    const opts = [...c.querySelectorAll('[role="option"]')]
    expect(opts.map((o) => o.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false'])
    expect(opts[2]!.getAttribute('aria-disabled')).toBe('true')
    expect(c.querySelector('[role="group"]')!.getAttribute('aria-label')).toBe('Veg')
    expect(list(c).getAttribute('aria-label')).toBe('Food')
    expect(opts[1]!.textContent).toContain('sweet')
  })
  test('a press on a row picks with reason pointer and focus never leaves the trigger', async () => {
    const heard: string[] = []
    const { c, trigger } = await mount(() => (
      <Select label="Fruit" onValueChange={(v, r) => heard.push(`${v}:${r}`)} options={fruit} />
    ))
    trigger.click()
    await tick()
    expect(document.activeElement).toBe(trigger)
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    const row = c.querySelectorAll<HTMLElement>('[role="option"]')[2]!
    row.dispatchEvent(down)
    expect(down.defaultPrevented).toBe(true)
    row.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
    await tick()
    expect(heard).toEqual(['c:pointer'])
    expect(document.activeElement).toBe(trigger)
  })
  test('a disabled row does not pick', async () => {
    const heard: string[] = []
    const { c, trigger } = await mount(() => (
      <Select label="Fruit" onValueChange={(v) => heard.push(v)} options={fruit} />
    ))
    trigger.click()
    await tick()
    c.querySelectorAll<HTMLElement>('[role="option"]')[1]!.click()
    expect(heard).toEqual([])
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
  })
  test('a press outside closes it; a press on the trigger toggles', async () => {
    const { trigger } = await mount(() => <Select label="Fruit" options={fruit} />)
    trigger.click()
    await tick()
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    trigger.click()
    trigger.click()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })
}

function registerThePanelIsBuiltOnce() {
  test('the panel is built once and kept', async () => {
    const { c, trigger } = await mount(() => <Select label="Fruit" options={fruit} />)
    trigger.click()
    const first = list(c)
    trigger.click()
    trigger.click()
    expect(list(c)).toBe(first)
  })
  test('new options reach the list and the label', async () => {
    const opts = state(fruit)
    const { c, trigger, value } = await mount(() => <Select label="Fruit" options={opts.value} />)
    trigger.click()
    trigger.click()
    opts.value = [{ value: 'z', label: 'Zucchini' }]
    await tick()
    expect(value.textContent).toBe('Zucchini')
    trigger.click()
    expect(c.querySelector('[role="option"]')!.textContent).toContain('Zucchini')
  })
}

export function registerTheList() {
  describe('the list', () => {
    registerOptionsCarryAriaSelectedAnd()
    registerThePanelIsBuiltOnce()
  })
}
