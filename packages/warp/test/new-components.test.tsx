// Menu, Accordion, Slider, RadioGroup, Ticker, the Select menu and toast.promise: roles, keyboard, state.
import { flush, render } from '@weft-js/core/test'
import * as F from './fixtures/NewParts'

const tick = () =>
  new Promise((r) => {
    setTimeout(r)
  })
const key = (el: Element, k: string) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))

describe('Accordion', () => {
  const items = [
    { value: 'a', title: 'One', content: 'first' },
    { value: 'b', title: 'Two', content: 'second' },
    { value: 'c', title: 'Three', content: 'third', disabled: true },
  ]
  const heads = (c: Element) => [
    ...c.querySelectorAll<HTMLButtonElement>('[role="heading"] button'),
  ]

  test('headings carry the level, and each button names its panel', async () => {
    const { container: c } = render(() => <F.Acc items={items} level={4} defaultOpen={['a']} />)
    await tick()
    expect(c.querySelector('[role="heading"]')!.getAttribute('aria-level')).toBe('4')
    const [a, b] = heads(c)
    expect(a!.getAttribute('aria-expanded')).toBe('true')
    expect(b!.getAttribute('aria-expanded')).toBe('false')
    expect(document.getElementById(a!.getAttribute('aria-controls')!)).not.toBeNull()
  })

  test('one open at a time unless multiple', async () => {
    const seen: string[][] = []
    const { container: c } = render(() => (
      <F.Acc items={items} defaultOpen={['a']} onChange={(o) => seen.push(o)} />
    ))
    await tick()
    heads(c)[1]!.click()
    await flush()
    expect(seen.at(-1)).toEqual(['b'])
    expect(heads(c)[0]!.getAttribute('aria-expanded')).toBe('false')
    const { container: m } = render(() => <F.Acc multiple items={items} defaultOpen={['a']} />)
    await tick()
    heads(m)[1]!.click()
    await flush()
    expect(
      heads(m)
        .slice(0, 2)
        .map((h) => h.getAttribute('aria-expanded')),
    ).toEqual(['true', 'true'])
  })

  test('arrows and Home/End move between headers', async () => {
    const { container: c } = render(() => <F.Acc items={items} />)
    await tick()
    document.body.append(c)
    const [a, b] = heads(c)
    a!.focus()
    key(a!, 'ArrowDown')
    expect(document.activeElement).toBe(b)
    key(b!, 'Home')
    expect(document.activeElement).toBe(a)
  })
})

describe('Slider', () => {
  test('one thumb: role, values, keyboard', async () => {
    const v = F.volume
    const { container: c } = render(() => <F.Volume />)
    await tick()
    const thumb = c.querySelector<HTMLElement>('[role="slider"]')!
    expect(thumb.getAttribute('aria-valuenow')).toBe('40')
    expect(c.querySelector(`[id="${thumb.getAttribute('aria-labelledby')}"]`)!.textContent).toBe(
      'Volume',
    )
    key(thumb, 'ArrowRight')
    await flush()
    expect(v.value).toBe(41)
    expect(thumb.getAttribute('aria-valuetext')).toBe('41%')
    key(thumb, 'End')
    await flush()
    expect(v.value).toBe(100)
    key(thumb, 'Home')
    await flush()
    expect(v.value).toBe(0)
  })

  test('a range renders two named thumbs', async () => {
    const { container: c } = render(() => <F.Price />)
    await tick()
    const thumbs = c.querySelectorAll('[role="slider"]')
    expect(thumbs).toHaveLength(2)
    expect(thumbs[0]!.getAttribute('aria-valuetext')).toBe('Minimum, 10')
  })

  test('disabled leaves the tab order', async () => {
    const { container: c } = render(() => <F.Off />)
    await tick()
    const thumb = c.querySelector('[role="slider"]')!
    expect(thumb.getAttribute('tabindex')).toBe('-1')
    expect(thumb.getAttribute('aria-disabled')).toBe('true')
  })
})

test('RadioGroup: native radios, one name, the choice reports', async () => {
  const v = F.plan
  const { container: c } = render(() => <F.Plan />)
  await tick()
  expect(c.querySelector('[role="radiogroup"]')).not.toBeNull()
  const [a, b] = c.querySelectorAll<HTMLInputElement>('input[type="radio"]')
  expect(a!.name).toBe(b!.name)
  expect(a!.checked).toBe(true)
  b!.click()
  await flush()
  expect(v.value).toBe('pro')
})

test('Ticker: the real value is readable, the columns are hidden, only moved digits write', async () => {
  const v = F.count
  const { container: c } = render(() => <F.Count />)
  await tick()
  expect(c.querySelector('[data-part="sr"]')!.textContent).toBe('1,234')
  expect(c.querySelector('[aria-hidden="true"]')).not.toBeNull()
  const digits = () => [...c.querySelectorAll<HTMLElement>('[data-part="digit"]')]
  expect(digits()).toHaveLength(4)
  const last = digits().at(-1)!
  const first = digits()[0]!
  const before = first.getAttribute('style')
  v.value = 1239
  await flush()
  expect(c.querySelector('[data-part="sr"]')!.textContent).toBe('1,239')
  expect(digits().at(-1)).toBe(last)
  expect(last.style.getPropertyValue('--_d')).toBe('9')
  expect(first.getAttribute('style')).toBe(before)
  v.value = 11239
  await flush()
  expect(digits()).toHaveLength(5)
  expect(digits().at(-1)).toBe(last)
})

test('Menu: a menu button names its panel; closed, it is not expanded', async () => {
  const { container: c } = render(() => <F.Actions />)
  await tick()
  const button = c.querySelector('[aria-haspopup="menu"]')!
  expect(button.getAttribute('aria-expanded')).toBe('false')
  const panel =
    document.getElementById(button.getAttribute('aria-controls')!) ??
    c.querySelector('[role="menu"]')!
  expect(panel.getAttribute('role')).toBe('menu')
  expect(panel.querySelectorAll('[role="menuitem"]')).toHaveLength(3)
  expect(panel.querySelector('[role="separator"]')).not.toBeNull()
  expect(panel.querySelector('[role="menuitem"][aria-disabled="true"]')!.textContent).toContain(
    'Gone',
  )
})

describe('Select', () => {
  test('a real select carries the value: first option shows when nothing is chosen', async () => {
    const { container: c } = render(() => <F.Sort />)
    await tick()
    expect(c.querySelector('select')!.value).toBe('a')
  })

  test('no list until it opens, on any pointer', async () => {
    const { container: c } = render(() => <F.Sort />)
    await tick()
    expect(c.querySelector('[role="listbox"]')).toBeNull()
    c.querySelector<HTMLElement>('[role="combobox"]')!.click()
    expect(c.querySelector('[role="listbox"]')).not.toBeNull()
  })
})

test('toast.promise: one toast through its life', async () => {
  const { container: c } = render(() => <F.Toasts />)
  await tick()
  document.body.append(c)
  let finish!: (v: string) => void
  const p = F.toast.promise(
    new Promise<string>((r) => {
      finish = r
    }),
    { pending: 'Deploying', done: (v) => `Deployed ${v}`, error: 'Failed' },
  )
  await flush()
  const items = () =>
    [...document.querySelectorAll('[data-scope="toast"]:not([data-part="region"])')].filter((n) =>
      n.textContent.includes('Deploy'),
    )
  expect(items()).toHaveLength(1)
  expect(items()[0]!.textContent).toContain('Deploying')
  finish('v2')
  await p
  await Promise.resolve()
  await flush()
  expect(items()).toHaveLength(1)
  expect(items()[0]!.textContent).toContain('Deployed v2')
})
