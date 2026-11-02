// Select and CompactSelect: warp's list on every device, a real <select> behind it for the form.
import { flush, render } from 'weft/test'
import { state } from 'weft'
import { CompactSelect, Input, Select } from '../src/index'

const tick = async () => { await new Promise(r => setTimeout(r)); await flush() }
const key = (el: Element, k: string, init: KeyboardEventInit = {}) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }))
const fruit = [{ value: 'a', label: 'Apple' }, { value: 'b', label: 'Bean', disabled: true }, { value: 'c', label: 'Corn' }, { value: 'd', label: 'Cress' }]
const parts = (c: Element) => ({ trigger: c.querySelector<HTMLButtonElement>('[role="combobox"]')!, carrier: c.querySelector<HTMLSelectElement>('select')!, value: c.querySelector('[data-part="value"]')! })
const list = (c: Element) => c.querySelector('[role="listbox"]')!
const active = (t: Element) => document.getElementById(t.getAttribute('aria-activedescendant') ?? '')?.textContent
async function mount(ui: () => any) {
  const { container: c } = render(ui)
  document.body.append(c)
  await tick()
  return { c, ...parts(c) }
}
afterEach(() => { document.body.innerHTML = ''; window.innerWidth = 1024 })

describe('the trigger', () => {
  test('a button role=combobox named by the label alone, and no list until it opens', async () => {
    const { c, trigger } = await mount(() => <Select label="Fruit" options={fruit} />)
    expect(trigger.localName).toBe('button')
    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(trigger.getAttribute('aria-controls')).toBeNull()
    expect(document.getElementById(trigger.getAttribute('aria-labelledby')!)!.textContent).toContain('Fruit')
    expect(c.querySelector('label')!.getAttribute('for')).toBeNull()
    expect(list(c)).toBeNull()
  })

  test('with no value the first enabled option shows, on the trigger and in the select', async () => {
    const { value, carrier } = await mount(() => <Select label="Fruit" options={[{ value: 'x', label: 'X', disabled: true }, ...fruit]} />)
    expect(value.textContent).toBe('Apple')
    expect(carrier.value).toBe('a')
  })

  test('a placeholder is an empty value, and required holds on the carrier', async () => {
    const { value, carrier, trigger } = await mount(() => <Select label="Fruit" placeholder="Pick one" required options={fruit} />)
    expect(value.textContent).toBe('')
    expect(value.getAttribute('data-placeholder')).toBe('Pick one')
    expect(carrier.required).toBe(true)
    expect(carrier.validity.valid).toBe(false)
    expect(trigger.getAttribute('aria-required')).toBe('true')
  })

  test('the carrier is out of the tab order and the tree, and disabled reaches both', async () => {
    const { carrier, trigger } = await mount(() => <Select label="Fruit" name="f" disabled options={fruit} />)
    expect(carrier.getAttribute('tabindex')).toBe('-1')
    expect(carrier.getAttribute('aria-hidden')).toBe('true')
    expect(carrier.name).toBe('f')
    expect(trigger.disabled && carrier.disabled).toBe(true)
    trigger.click()
    await tick()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })
})

describe('keyboard', () => {
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
    const { trigger, value } = await mount(() => <Select label="Fruit" onChange={e => seen.push(e.currentTarget.value)} onValueChange={(v, r) => heard.push([v, r])} options={fruit} />)
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
    const { trigger } = await mount(() => <Select label="Fruit" onValueChange={v => seen.push(v)} options={fruit} />)
    key(trigger, 'ArrowDown')
    key(trigger, 'ArrowDown')
    expect(key(trigger, 'Tab')).toBe(true)
    await tick()
    expect(seen).toEqual(['c'])
  })

  test('Escape closes and keeps the value, ahead of a dialog around it', async () => {
    const seen: string[] = []
    const { trigger } = await mount(() => <Select label="Fruit" onValueChange={v => seen.push(v)} options={fruit} />)
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
    const { trigger } = await mount(() => <Select label="City" options={[{ value: 'b', label: 'Boston' }, { value: 'n', label: 'New Haven' }, { value: 'y', label: 'New York' }, { value: 'c', label: 'Cairo' }]} />)
    key(trigger, 'n')
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(active(trigger)).toBe('New Haven')
    key(trigger, 'n')
    expect(active(trigger)).toBe('New York')
    key(trigger, 'n')
    expect(active(trigger)).toBe('New Haven')
    key(trigger, 'Escape')
    await new Promise(r => setTimeout(r, 520))
    key(trigger, 'n'); key(trigger, 'e'); key(trigger, 'w'); key(trigger, ' '); key(trigger, 'y')
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(active(trigger)).toBe('New York')
  })

  test('IME composition is left alone', async () => {
    const { trigger } = await mount(() => <Select label="Fruit" options={fruit} />)
    key(trigger, 'a', { isComposing: true })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })
})

describe('the list', () => {
  test('options carry aria-selected and aria-disabled; groups are named', async () => {
    const { c, trigger } = await mount(() => <Select label="Food" value="c" options={[{ value: 'a', label: 'Apple' }, { group: 'Veg', options: [{ value: 'c', label: 'Corn', hint: 'sweet' }, { value: 'p', label: 'Pea', disabled: true }] }]} />)
    trigger.click()
    await tick()
    const opts = [...c.querySelectorAll('[role="option"]')]
    expect(opts.map(o => o.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false'])
    expect(opts[2].getAttribute('aria-disabled')).toBe('true')
    expect(c.querySelector('[role="group"]')!.getAttribute('aria-label')).toBe('Veg')
    expect(list(c).getAttribute('aria-label')).toBe('Food')
    expect(opts[1].textContent).toContain('sweet')
  })

  test('a press on a row picks with reason pointer and focus never leaves the trigger', async () => {
    const heard: string[] = []
    const { c, trigger } = await mount(() => <Select label="Fruit" onValueChange={(v, r) => heard.push(`${v}:${r}`)} options={fruit} />)
    trigger.click()
    await tick()
    expect(document.activeElement).toBe(trigger)
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    const row = c.querySelectorAll<HTMLElement>('[role="option"]')[2]
    row.dispatchEvent(down)
    expect(down.defaultPrevented).toBe(true)
    row.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
    await tick()
    expect(heard).toEqual(['c:pointer'])
    expect(document.activeElement).toBe(trigger)
  })

  test('a disabled row does not pick', async () => {
    const heard: string[] = []
    const { c, trigger } = await mount(() => <Select label="Fruit" onValueChange={v => heard.push(v)} options={fruit} />)
    trigger.click()
    await tick()
    c.querySelectorAll<HTMLElement>('[role="option"]')[1].click()
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
})

describe('a long list', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ value: `v${i}`, label: `Item ${i}` }))
  test('past 15 options it searches: focus in the input, arrows and Enter still work, misses say so', async () => {
    const heard: string[] = []
    const { c, trigger } = await mount(() => <Select label="Long" onValueChange={v => heard.push(v)} options={many} />)
    trigger.click()
    await tick()
    const find = c.querySelector<HTMLInputElement>('input[type="search"]')!
    expect(find.getAttribute('aria-controls')).toBe(list(c).id)
    find.value = 'item 1'
    find.dispatchEvent(new Event('input', { bubbles: true }))
    expect(c.querySelectorAll('[role="option"]:not([hidden])')).toHaveLength(11)
    key(find, 'ArrowDown')
    expect(active(find)).toBe('Item 10')
    key(find, 'Enter')
    await tick()
    expect(heard).toEqual(['v10'])
    expect(document.activeElement).toBe(trigger)
    trigger.click()
    find.value = 'nothing'
    find.dispatchEvent(new Event('input', { bubbles: true }))
    expect(c.querySelector<HTMLElement>('[data-part="empty"]')!.hidden).toBe(false)
  })

  test('searchable says so either way', async () => {
    const { c, trigger } = await mount(() => <Select label="Long" searchable={false} options={many} />)
    trigger.click()
    expect(c.querySelector('input[type="search"]')).toBeNull()
  })
})

describe('on a phone', () => {
  test('a modal sheet with a title and Done; focus lands on the selected row and comes back', async () => {
    window.innerWidth = 390
    const { c, trigger } = await mount(() => <Select label="Fruit" value="c" options={fruit} />)
    trigger.focus()
    trigger.click()
    await tick()
    const box = c.querySelector<HTMLElement>('dialog')!
    expect(box.dataset.presentation).toBe('sheet')
    expect(box.getAttribute('aria-modal')).toBe('true')
    expect(c.querySelector('[data-part="sheet-head"]')!.textContent).toContain('Fruit')
    expect(trigger.getAttribute('aria-activedescendant')).toBeNull()
    const rows = c.querySelectorAll<HTMLElement>('[role="option"]')
    expect(document.activeElement).toBe(rows[2])
    key(rows[2], 'ArrowDown')
    expect(document.activeElement).toBe(rows[3])
    key(rows[3], 'Enter')
    await tick()
    expect(document.activeElement).toBe(trigger)
  })

  test('Done closes with the value kept', async () => {
    window.innerWidth = 390
    const heard: string[] = []
    const { c, trigger } = await mount(() => <Select label="Fruit" onValueChange={v => heard.push(v)} options={fruit} />)
    trigger.click()
    await tick()
    c.querySelector<HTMLElement>('[data-part="done"]')!.click()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(heard).toEqual([])
  })
})

describe('the form', () => {
  test('reset goes back to the first value, on the trigger too', async () => {
    const { container: c } = render(() => <form><Select label="Fruit" name="f" defaultValue="c" options={fruit} /></form>)
    document.body.append(c)
    await tick()
    const { trigger, carrier, value } = parts(c)
    key(trigger, 'ArrowDown'); key(trigger, 'ArrowDown'); key(trigger, 'Enter')
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
    const { container: c } = render(() => <form><Select label="Fruit" name="f" options={fruit} /></form>)
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
    const { trigger, carrier, value } = await mount(() => <Select label="Fruit" value="a" options={fruit} />)
    key(trigger, 'ArrowDown'); key(trigger, 'ArrowDown'); key(trigger, 'Enter')
    await tick()
    expect(value.textContent).toBe('Apple')
    expect(carrier.value).toBe('a')
  })

  test('a handler that writes el.value back wins, and a late write shows on focus', async () => {
    const { trigger, carrier, value } = await mount(() => <Select label="Fruit" onChange={e => { e.currentTarget.value = 'a' }} options={fruit} />)
    key(trigger, 'ArrowDown'); key(trigger, 'ArrowDown'); key(trigger, 'Enter')
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
    key(trigger, 'ArrowDown'); key(trigger, 'ArrowUp'); key(trigger, 'Enter')
    await tick()
    expect(v.value).toBe('a')
  })

  test('an empty required Select shows the message in the field, on the trigger, with no bubble', async () => {
    const { container: c } = render(() => <form><Select label="Fruit" placeholder="Pick" required options={fruit} /><Input label="After" required /></form>)
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
})

describe('CompactSelect', () => {
  test('its label is the accessible name; no select, and no option until it opens', async () => {
    const { c, trigger } = await mount(() => <CompactSelect label="Rows per page" value="a" options={fruit} />)
    expect(trigger.getAttribute('aria-label')).toBe('Rows per page')
    expect(c.querySelector('select, option, [role="option"]')).toBeNull()
  })

  test('picks through onValueChange, with the same keys', async () => {
    const v = state('a')
    const { trigger, value } = await mount(() => <CompactSelect label="F" value={v.value} options={fruit} onValueChange={x => (v.value = x)} />)
    key(trigger, 'ArrowDown'); key(trigger, 'ArrowDown'); key(trigger, 'Enter')
    await tick()
    expect(v.value).toBe('c')
    expect(value.textContent).toBe('Corn')
  })

  test('name puts it in a form', async () => {
    const { container: c } = render(() => <form><CompactSelect label="F" name="f" defaultValue="c" options={fruit} /></form>)
    await tick()
    expect(new FormData(c.querySelector('form')!).get('f')).toBe('c')
  })
})
