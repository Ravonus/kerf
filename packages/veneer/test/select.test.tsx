// Select and CompactSelect: veneer's list on every device, a real <select> behind it for the form.
import { registerKeyboard } from './select/keyboard'
import { active, fruit, key, list, mount, tick } from './select/support'
import { registerTheForm } from './select/the-form'
import { registerTheList } from './select/the-list'
import { state } from '@kerf/core'
import { hydrate } from '@kerf/core/dom'
import { renderToString } from '@kerf/core/ssr'
import { render } from '@kerf/core/test'
import { resetIds } from '@kerf/veneer-core'
// @ts-expect-error: query imports (@kerf/core/vite)
import { Picked as server } from './fixtures/Picked.tsx?kerf-ssr'
import { Grid } from '../src/Layout'
import { CompactSelect, NumberField, Select } from '../src/index'
// @ts-expect-error: query imports (@kerf/core/vite)
import { Picked as client } from './fixtures/Picked.tsx?kerf-hydrate'

afterEach(() => {
  document.body.innerHTML = ''
  window.innerWidth = 1024
})

describe('the trigger', () => {
  test('a button role=combobox named by the label alone, and no list until it opens', async () => {
    const { c, trigger } = await mount(() => <Select label="Fruit" options={fruit} />)
    expect(trigger.localName).toBe('button')
    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(trigger.getAttribute('aria-controls')).toBeNull()
    expect(
      document.getElementById(trigger.getAttribute('aria-labelledby')!)!.textContent,
    ).toContain('Fruit')
    expect(c.querySelector('label')!.getAttribute('for')).toBeNull()
    expect(list(c)).toBeNull()
  })

  test('with no value the first enabled option shows, on the trigger and in the select', async () => {
    const { value, carrier } = await mount(() => (
      <Select label="Fruit" options={[{ value: 'x', label: 'X', disabled: true }, ...fruit]} />
    ))
    expect(value.textContent).toBe('Apple')
    expect(carrier.value).toBe('a')
  })

  test('a placeholder is an empty value, and required holds on the carrier', async () => {
    const { value, carrier, trigger } = await mount(() => (
      <Select label="Fruit" placeholder="Pick one" required options={fruit} />
    ))
    expect(value.textContent).toBe('')
    expect(value.getAttribute('data-placeholder')).toBe('Pick one')
    expect(carrier.required).toBe(true)
    expect(carrier.validity.valid).toBe(false)
    expect(trigger.getAttribute('aria-required')).toBe('true')
  })

  test('the carrier is out of the tab order and the tree, and disabled reaches both', async () => {
    const { carrier, trigger } = await mount(() => (
      <Select label="Fruit" name="f" disabled options={fruit} />
    ))
    expect(carrier.getAttribute('tabindex')).toBe('-1')
    expect(carrier.getAttribute('aria-hidden')).toBe('true')
    expect(carrier.name).toBe('f')
    expect(trigger.disabled && carrier.disabled).toBe(true)
    trigger.click()
    await tick()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })
})

registerKeyboard()

registerTheList()

describe('a long list', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ value: `v${i}`, label: `Item ${i}` }))
  test('past 15 options it searches: focus in the input, arrows and Enter still work, misses say so', async () => {
    const heard: string[] = []
    const { c, trigger } = await mount(() => (
      <Select label="Long" onValueChange={(v) => heard.push(v)} options={many} />
    ))
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
    const { c, trigger } = await mount(() => (
      <Select label="Long" searchable={false} options={many} />
    ))
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
    key(rows[2]!, 'ArrowDown')
    expect(document.activeElement).toBe(rows[3])
    key(rows[3]!, 'Enter')
    await tick()
    expect(document.activeElement).toBe(trigger)
  })

  test('Done closes with the value kept', async () => {
    window.innerWidth = 390
    const heard: string[] = []
    const { c, trigger } = await mount(() => (
      <Select label="Fruit" onValueChange={(v) => heard.push(v)} options={fruit} />
    ))
    trigger.click()
    await tick()
    c.querySelector<HTMLElement>('[data-part="done"]')!.click()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(heard).toEqual([])
  })
})

registerTheForm()

describe('CompactSelect', () => {
  test('its label is the accessible name; no select, and no option until it opens', async () => {
    const { c, trigger } = await mount(() => (
      <CompactSelect label="Rows per page" value="a" options={fruit} />
    ))
    expect(trigger.getAttribute('aria-label')).toBe('Rows per page')
    expect(c.querySelector('select, option, [role="option"]')).toBeNull()
  })

  test('picks through onValueChange, with the same keys', async () => {
    const v = state('a')
    const { trigger, value } = await mount(() => (
      <CompactSelect
        label="F"
        value={v.value}
        options={fruit}
        onValueChange={(x) => (v.value = x)}
      />
    ))
    key(trigger, 'ArrowDown')
    key(trigger, 'ArrowDown')
    key(trigger, 'Enter')
    await tick()
    expect(v.value).toBe('c')
    expect(value.textContent).toBe('Corn')
  })

  test('name puts it in a form', async () => {
    const { container: c } = render(() => (
      <form>
        <CompactSelect label="F" name="f" defaultValue="c" options={fruit} />
      </form>
    ))
    await tick()
    expect(new FormData(c.querySelector('form')!).get('f')).toBe('c')
  })
})

describe('NumberField', () => {
  const spin = (c: Element) => c.querySelector<HTMLInputElement>('[role="spinbutton"]')!
  test('real text with spinbutton keys, kept inside its bounds', async () => {
    const v = state<number | null>(5)
    const { container: c } = render(() => <NumberField label="Seats" min={1} max={20} value={v} />)
    await tick()
    const i = spin(c)
    expect(i.type).toBe('text')
    expect(i.getAttribute('inputmode')).toBe('numeric')
    expect([
      i.getAttribute('aria-valuenow'),
      i.getAttribute('aria-valuemin'),
      i.getAttribute('aria-valuemax'),
    ]).toEqual(['5', '1', '20'])
    key(i, 'ArrowUp')
    expect(v.value).toBe(6)
    key(i, 'PageUp')
    expect(v.value).toBe(16)
    key(i, 'PageUp')
    expect(v.value).toBe(20)
    key(i, 'Home')
    expect(v.value).toBe(1)
    key(i, 'ArrowDown')
    expect(v.value).toBe(1)
  })

  test('typing clamps, junk waits for blur, and the steppers stop at the bound', async () => {
    const v = state<number | null>(8)
    const { container: c } = render(() => <NumberField label="Seats" min={1} max={9} value={v} />)
    await tick()
    const i = spin(c)
    const type = (t: string) => {
      i.value = t
      i.dispatchEvent(new Event('input', { bubbles: true }))
    }
    type('12')
    expect(v.value).toBe(9)
    type('abc')
    expect(v.value).toBe(9)
    i.dispatchEvent(new FocusEvent('blur'))
    expect(i.value).toBe('9')
    await tick()
    const [up, down] = [...c.querySelectorAll<HTMLButtonElement>('[data-part="step"]')] as [
      HTMLButtonElement,
      HTMLButtonElement,
    ]
    expect(up.disabled).toBe(true)
    down.click()
    expect(v.value).toBe(8)
  })
})

// The value on the server and through hydration: the carrier and the trigger both carry it from the first byte.
describe('server and hydration', () => {
  const hydrated = async (
    value: string | undefined,
    before?: (select: HTMLSelectElement) => void,
  ) => {
    resetIds()
    const root = document.body.appendChild(document.createElement('div'))
    root.innerHTML = renderToString(() => server({ value }))
    const select = root.querySelector('select')!
    before?.(select)
    const heard: string[] = []
    root.addEventListener('change', () => heard.push(select.value))
    resetIds()
    const dispose = hydrate(() => client({ value }), root)
    await tick()
    return { root, select, heard, dispose }
  }

  test('the server marks the chosen option, in a group too', () => {
    resetIds()
    const root = document.createElement('div')
    root.innerHTML = renderToString(() => server({ value: 'b' }))
    expect(root.querySelector('select')!.value).toBe('b')
    expect(root.querySelector('option[selected]')!.getAttribute('value')).toBe('b')
    expect(root.querySelector('[data-part="value"]')!.textContent).toBe('B')
  })

  test('hydration keeps the chosen option', async () => {
    const { root, select, dispose } = await hydrated('c')
    expect(select.value).toBe('c')
    expect(root.querySelector('[data-part="value"]')!.textContent).toBe('C')
    dispose()
  })

  test("what Back restored is nobody's pick: the server's value stands and nothing is heard", async () => {
    const spy = vi
      .spyOn(performance, 'getEntriesByType')
      .mockReturnValue([{ type: 'back_forward' }] as unknown as PerformanceEntryList)
    const { select, heard, dispose } = await hydrated('c', (s) => {
      s.value = 'a'
    })
    expect(select.value).toBe('c')
    expect(heard).toEqual([])
    dispose()
    spy.mockRestore()
  })

  test('nothing is heard when no one picked', async () => {
    for (const value of [undefined, 'c']) {
      const { heard, dispose } = await hydrated(value)
      expect(heard).toEqual([])
      dispose()
    }
  })

  test('options that arrive after the value show it', async () => {
    const opts = state<typeof fruit>([])
    const { carrier, value } = await mount(() => (
      <Select label="Fruit" options={opts.value} value="c" />
    ))
    opts.value = fruit
    await tick()
    expect(carrier.value).toBe('c')
    expect(value.textContent).toBe('Corn')
  })
})

test('Grid takes a step or a length', () => {
  const step = render(() => <Grid min="sm" />).container.firstElementChild!
  expect(step.getAttribute('data-min')).toBe('sm')
  expect(step.getAttribute('style')).toBeNull()
  const length = render(() => <Grid min="12rem" />).container.firstElementChild!
  expect(length.getAttribute('data-min')).toBeNull()
  expect((length as HTMLElement).style.getPropertyValue('--_min').trim()).toBe('12rem')
})
