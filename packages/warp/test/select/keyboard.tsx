import { Select } from '../../src/index'
import { active, fruit, key, list, mount, tick } from './support'

function registerOpensOnTheSelectedRow() {
  test('↓ opens on the selected row, then moves past disabled rows and stops at the end', async () => {
    const { c, trigger } = await mount(() => <Select label="Fruit" value="c" options={fruit} />)
    key(trigger, 'ArrowDown')
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(trigger.getAttribute('aria-controls')).toBe(list(c).id)
    expect(active(trigger)).toBe('Corn')
    key(trigger, 'ArrowUp')
    expect(active(trigger)).toBe('Apple')
    key(trigger, 'ArrowUp')
    expect(active(trigger)).toBe('Apple')
    key(trigger, 'End')
    expect(active(trigger)).toBe('Cress')
    key(trigger, 'ArrowDown')
    expect(active(trigger)).toBe('Cress')
  })
  test('Home and End open at that end', async () => {
    const { trigger } = await mount(() => <Select label="Fruit" options={fruit} />)
    key(trigger, 'End')
    expect(active(trigger)).toBe('Cress')
  })
  test('Enter and Space pick; change fires once with the value on e.currentTarget', async () => {
    const seen: string[] = []
    const heard: [string, string][] = []
    const { trigger, value } = await mount(() => (
      <Select
        label="Fruit"
        onChange={(e) => seen.push(e.currentTarget.value)}
        onValueChange={(v, r) => heard.push([v, r])}
        options={fruit}
      />
    ))
    key(trigger, 'Enter')
    key(trigger, 'ArrowDown')
    key(trigger, 'Enter')
    await tick()
    expect(seen).toEqual(['c'])
    expect(heard).toEqual([['c', 'keyboard']])
    expect(value.textContent).toBe('Corn')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(trigger.getAttribute('aria-activedescendant')).toBeNull()
    key(trigger, ' ')
    key(trigger, 'ArrowUp')
    key(trigger, ' ')
    await tick()
    expect(seen).toEqual(['c', 'a'])
  })
  test('Tab commits the active row and leaves the default alone', async () => {
    const seen: string[] = []
    const { trigger } = await mount(() => (
      <Select label="Fruit" onValueChange={(v) => seen.push(v)} options={fruit} />
    ))
    key(trigger, 'ArrowDown')
    key(trigger, 'ArrowDown')
    expect(key(trigger, 'Tab')).toBe(true)
    await tick()
    expect(seen).toEqual(['c'])
  })
}

function registerEscapeClosesAndKeepsThe() {
  test('Escape closes and keeps the value, ahead of a dialog around it', async () => {
    const seen: string[] = []
    const { trigger } = await mount(() => (
      <Select label="Fruit" onValueChange={(v) => seen.push(v)} options={fruit} />
    ))
    key(trigger, 'ArrowDown')
    key(trigger, 'ArrowDown')
    const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    trigger.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(seen).toEqual([])
    const shut = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    trigger.dispatchEvent(shut)
    expect(shut.defaultPrevented).toBe(false) // closed, Escape goes on to whatever holds it
  })
  test('a letter opens and jumps; a repeated letter cycles; a prefix narrows; Space stays in a prefix', async () => {
    const { trigger } = await mount(() => (
      <Select
        label="City"
        options={[
          { value: 'b', label: 'Boston' },
          { value: 'n', label: 'New Haven' },
          { value: 'y', label: 'New York' },
          { value: 'c', label: 'Cairo' },
        ]}
      />
    ))
    key(trigger, 'n')
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(active(trigger)).toBe('New Haven')
    key(trigger, 'n')
    expect(active(trigger)).toBe('New York')
    key(trigger, 'n')
    expect(active(trigger)).toBe('New Haven')
    key(trigger, 'Escape')
    await new Promise((r) => {
      setTimeout(r, 520)
    })
    key(trigger, 'n')
    key(trigger, 'e')
    key(trigger, 'w')
    key(trigger, ' ')
    key(trigger, 'y')
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(active(trigger)).toBe('New York')
  })
  test('IME composition is left alone', async () => {
    const { trigger } = await mount(() => <Select label="Fruit" options={fruit} />)
    key(trigger, 'a', { isComposing: true })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })
}

export function registerKeyboard() {
  describe('keyboard', () => {
    registerOpensOnTheSelectedRow()
    registerEscapeClosesAndKeepsThe()
  })
}
