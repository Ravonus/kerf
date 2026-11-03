// Regressions from the Kobalte audit that jsdom can see; layout, stacking and Escape are in overlays.browser.test.mjs.
import { flush, render } from '@weft-js/core/test'
import type { Address, IsoDate } from '@weft-js/warp-core'
import type { Place } from '../src/PlaceField'
import { Boundary, resource, state } from '@weft-js/core'
import type { SignatureValue } from '../src/SignaturePad'
import { AddressField, Card, CodeInput, DateField, DateRangeField, DateTimeField, DurationField, Input, JsonEditor, KeyValueEditor, MarkdownEditor, MentionsInput, Menu, MonthPicker, PhoneField, PlaceLookupInput, RecurrenceField, SignaturePad, Slider, TimeField, TimeZoneSelect } from '../src/index'
import { ComboField } from '../src/Combobox'

const tick = (ms = 0) => new Promise(r => { setTimeout(r, ms) })
const settle = async () => { await tick(); await flush(); await tick(); await flush() }
const key = (el: Element, k: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))

function inForm(ui: () => unknown) {
  const { container } = render(() => <form>{ui()}</form>)
  document.body.append(container)
  return container.querySelector('form')!
}

describe('a late error shows', () => {
  test('on an Input with no hint, and is what the input is described by', async () => {
    const err = state<string | undefined>(undefined)
    const { container: c } = render(() => <Input label="Email" error={err.value} />)
    await settle()
    expect(c.querySelector('[data-part="message"]')).toBeNull()
    expect(c.querySelector('input')!.hasAttribute('aria-describedby')).toBe(false)
    err.value = 'Bad email'
    await settle()
    const msg = c.querySelector('[data-part="message"]')!
    expect(msg.textContent).toContain('Bad email')
    expect(c.querySelector('input')!.getAttribute('aria-describedby')).toBe(msg.id)
    err.value = undefined
    await settle()
    expect(c.querySelector('[data-part="message"]')).toBeNull()
    expect(c.querySelector('input')!.hasAttribute('aria-describedby')).toBe(false)
  })

  test('on a control that destructures its shell (ComboField)', async () => {
    const err = state<string | undefined>(undefined)
    const { container: c } = render(() => <ComboField label="Fruit" error={err.value} text={() => ''} find={() => Promise.resolve([])} row={(f: string) => ({ main: f })} onPick={() => {}} />)
    await settle()
    err.value = 'Nope'
    await settle()
    const msg = c.querySelector('[data-part="message"]')!
    expect(msg.textContent).toContain('Nope')
    expect(c.querySelector('input')!.getAttribute('aria-describedby')).toBe(msg.id)
    expect(c.querySelector('input')!.getAttribute('aria-invalid')).toBe('true')
  })

  test("DateField's own message, 02/31 with no hint", async () => {
    const { container: c } = render(() => <DateField label="D" locale="en-US" today="2026-01-15" />)
    await settle()
    const s = [...c.querySelectorAll<HTMLElement>('[data-part="segment"]')]
    key(s[0]!, '0'); key(s[0]!, '2'); await flush()
    key(s[1]!, '3'); key(s[1]!, '1'); await flush()
    for (const d of '2026') key(s[2]!, d)
    await settle()
    expect(c.querySelector('[data-part="error"]')!.textContent).toContain('February 2026 has 28 days')
    expect(c.querySelector('[data-part="body"]')!.getAttribute('aria-describedby')).toBe(c.querySelector('[data-part="message"]')!.id)
  })
})

describe('Menu href', () => {
  test('an item with href is a link in the menu; a disabled one is not', async () => {
    const { container: c } = render(() => <Menu label="M" items={[{ label: 'Go', href: '/x' }, { label: 'Off', href: '/y', disabled: true }, { label: 'Act' }]} />)
    await settle()
    const go = c.querySelector<HTMLAnchorElement>('a[role="menuitem"]')!
    expect(go.getAttribute('href')).toBe('/x')
    expect(go.textContent).toBe('Go')
    expect(c.querySelectorAll('a')).toHaveLength(1)
    expect(c.querySelectorAll('[role="menuitem"]')).toHaveLength(3)
  })
})

describe('required on a composite', () => {
  const cases: [string, () => unknown, string | null][] = [
    ['DateField', () => <DateField label="X" required today="2026-01-15" locale="en-US" />, 'spinbutton'],
    ['DateRangeField', () => <DateRangeField label="X" required today="2026-01-15" locale="en-US" />, 'spinbutton'],
    ['TimeField', () => <TimeField label="X" required today="2026-01-15" locale="en-US" />, 'spinbutton'],
    ['DateTimeField', () => <DateTimeField label="X" required today="2026-01-15" locale="en-US" />, 'spinbutton'],
    ['DurationField', () => <DurationField label="X" required today="2026-01-15" locale="en-US" />, 'spinbutton'],
    ['MonthPicker', () => <MonthPicker label="X" required today="2026-01-15" locale="en-US" />, null],
    ['TimeZoneSelect', () => <TimeZoneSelect label="X" required today="2026-01-15" locale="en-US" />, null],
  ]
  test.each(cases)('%s blocks the form while empty', async (_, ui, role) => {
    const form = inForm(ui)
    await settle()
    expect(form.checkValidity()).toBe(false)
    expect(form.querySelector(':required')).not.toBeNull() // the mark hangs off this
    if (role) for (const s of form.querySelectorAll(`[role="${role}"]`)) expect(s.getAttribute('aria-required')).toBe('true')
    form.parentElement!.remove()
  })

  test('a filled one passes, and the proxy never posts', async () => {
    const form = inForm(() => <DateField label="X" name="d" required defaultValue="2026-02-03" today="2026-01-15" locale="en-US" />)
    await settle()
    expect(form.checkValidity()).toBe(true)
    expect([...new FormData(form).entries()]).toEqual([['d', '2026-02-03']])
    form.parentElement!.remove()
  })

  test('a half-chosen range is still missing', async () => {
    const form = inForm(() => <DateRangeField label="X" required defaultValue={{ start: '2026-02-03', end: null }} today="2026-01-15" locale="en-US" />)
    await settle()
    expect(form.checkValidity()).toBe(false)
    form.parentElement!.remove()
  })

  test('failing validation draws the message in the field, moves focus in, and it clears when filled', async () => {
    const v = state<IsoDate | null>(null)
    const form = inForm(() => <DateField label="X" required value={v} today="2026-01-15" locale="en-US" />)
    await settle()
    form.querySelector<HTMLInputElement>(':required')!.setCustomValidity('Fill this in')
    form.checkValidity()
    await settle()
    expect(form.querySelector('[data-part="error"]')!.textContent).toContain('Fill this in')
    expect(document.activeElement!.getAttribute('role')).toBe('spinbutton')
    v.value = '2026-02-03'
    await settle()
    expect(form.querySelector('[data-part="error"]')).toBeNull()
    form.parentElement!.remove()
  })

  test('optional composites render no proxy', async () => {
    const form = inForm(() => <DateField label="X" today="2026-01-15" locale="en-US" />)
    await settle()
    expect(form.querySelector('[data-part="sr-only"]')).toBeNull()
    form.parentElement!.remove()
  })

  test('PhoneField puts it on its real input', async () => {
    const form = inForm(() => <PhoneField label="X" required locale="en-US" />)
    await settle()
    expect(form.querySelector<HTMLInputElement>('input[type="tel"]')!.required).toBe(true)
    form.parentElement!.remove()
  })
})

describe('form.reset()', () => {
  const up = async (form: Element, type: string) => { key(form.querySelector(`[data-type="${type}"]`)!, 'ArrowUp'); await settle() }
  const hidden = (form: Element) => form.querySelector<HTMLInputElement>('input[type="hidden"]')!.value

  test('DateField goes back: segments, hidden value and State', async () => {
    const v = state<IsoDate | null>('2026-02-03')
    const form = inForm(() => <DateField label="D" name="d" value={v} locale="en-US" today="2026-01-15" />)
    await settle()
    await up(form, 'year')
    expect(hidden(form)).toBe('2027-02-03')
    ;(form).reset()
    await settle()
    expect(v.value).toBe('2026-02-03')
    expect(hidden(form)).toBe('2026-02-03')
    expect(form.querySelector('[data-type="year"]')!.textContent).toBe('2026')
    form.parentElement!.remove()
  })

  test('a half-typed date and its message go too', async () => {
    const form = inForm(() => <DateField label="D" locale="en-US" today="2026-01-15" />)
    await settle()
    const s = form.querySelector<HTMLElement>('[data-type="month"]')!
    key(s, '0'); key(s, '2')
    await settle()
    expect(form.querySelector('[data-part="control"]')!.hasAttribute('data-filled')).toBe(true)
    form.reset()
    await settle()
    expect(form.querySelector('[data-type="month"]')!.hasAttribute('data-placeholder')).toBe(true)
    expect(form.querySelector('[data-part="control"]')!.hasAttribute('data-filled')).toBe(false)
    form.parentElement!.remove()
  })

  test('TimeField, DateTimeField and DurationField go back', async () => {
    for (const [ui, type, want] of [
      [() => <TimeField label="T" name="v" defaultValue="10:30" locale="en-US" today="2026-01-15" />, 'hour', '10:30'],
      [() => <DateTimeField label="T" name="v" defaultValue="2026-02-03T10:30" locale="en-US" today="2026-01-15" />, 'hour', '2026-02-03T10:30'],
    ] as const) {
      const form = inForm(ui)
      await settle()
      await up(form, type)
      expect(hidden(form)).not.toBe(want)
      form.reset()
      await settle()
      expect(hidden(form)).toBe(want)
      expect(form.querySelector(`[data-type="${type}"]`)!.textContent).toBe('10')
      form.parentElement!.remove()
    }
    const form = inForm(() => <DurationField label="T" name="v" defaultValue="PT1H" locale="en-US" />)
    await settle()
    key(form.querySelector('[data-u="h"]')!, 'ArrowUp')
    await settle()
    expect(hidden(form)).toBe('PT2H')
    form.reset()
    await settle()
    expect(hidden(form)).toBe('PT1H')
    form.parentElement!.remove()
  })

  test('PhoneField, CodeInput and MentionsInput go back', async () => {
    const form = inForm(() => <div><PhoneField label="P" name="p" defaultValue="+14155550123" locale="en-US" /><CodeInput label="C" name="c" defaultValue="one" /><MentionsInput label="M" name="m" defaultValue="hi" triggers={{}} /></div>)
    await settle()
    const tel = form.querySelector<HTMLInputElement>('input[type="tel"]')!
    const shown = tel.value
    tel.value = '415'
    tel.dispatchEvent(new Event('input', { bubbles: true }))
    for (const a of form.querySelectorAll('textarea')) { a.value = 'edited'; a.dispatchEvent(new Event('input', { bubbles: true })) }
    await settle()
    expect(new FormData(form).get('p')).toBe('')
    expect(new FormData(form).get('c')).toBe('edited')
    form.reset()
    await settle()
    expect(tel.value).toBe(shown)
    expect(new FormData(form).get('p')).toBe('+14155550123')
    expect(new FormData(form).get('c')).toBe('one')
    expect(new FormData(form).get('m')).toBe('hi')
    expect(form.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('one')
    form.parentElement!.remove()
  })

  test('MarkdownEditor goes back', async () => {
    const form = inForm(() => <MarkdownEditor label="M" defaultValue="# one" />)
    await settle()
    const a = form.querySelector('textarea')!
    a.value = 'two'
    a.dispatchEvent(new Event('input', { bubbles: true }))
    await settle()
    form.reset()
    await settle()
    expect(a.value).toBe('# one')
    expect(form.querySelector('[data-scope="markdown"]')!.innerHTML).toContain('one')
    expect(form.querySelector('[data-scope="markdown"]')!.innerHTML).not.toContain('two')
    form.parentElement!.remove()
  })

  test('JsonEditor drops its validation at once', async () => {
    const form = inForm(() => <JsonEditor label="J" name="j" defaultValue="{}" />)
    await settle()
    const a = form.querySelector('textarea')!
    a.value = '{oops'
    a.dispatchEvent(new Event('input', { bubbles: true }))
    await tick(300); await flush()
    expect(form.querySelector('[data-part="error"]')).not.toBeNull()
    form.reset()
    await settle()
    expect(form.querySelector('[data-part="error"]')).toBeNull()
    expect(a.value).toBe('{}')
    form.parentElement!.remove()
  })

  test('KeyValueEditor goes back to its rows', async () => {
    const form = inForm(() => <KeyValueEditor label="K" defaultValue={[{ key: 'a', value: '1' }]} />)
    await settle()
    form.querySelector<HTMLElement>('[data-part="add"]')!.click()
    await settle()
    expect(form.querySelectorAll('tbody tr')).toHaveLength(2)
    form.reset()
    await settle()
    expect(form.querySelectorAll('tbody tr')).toHaveLength(1)
    expect(form.querySelector<HTMLInputElement>('tbody input')!.value).toBe('a')
    form.parentElement!.remove()
  })

  test('RecurrenceField goes back', async () => {
    const v = state<string | null>('FREQ=DAILY')
    const form = inForm(() => <RecurrenceField label="R" name="r" value={v} dtstart="2026-01-15" locale="en-US" />)
    await settle()
    v.value = 'FREQ=MONTHLY'
    await settle()
    expect(new FormData(form).get('r')).toBe('FREQ=MONTHLY')
    form.reset()
    await settle()
    expect(v.value).toBe('FREQ=DAILY')
    expect(new FormData(form).get('r')).toBe('FREQ=DAILY')
    form.parentElement!.remove()
  })

  test('PlaceLookupInput goes back, text and all', async () => {
    const place = { displayName: 'Lisbon', lat: 38.7, lng: -9.1 } as Place
    const form = inForm(() => <PlaceLookupInput label="P" defaultValue={place} search={() => Promise.resolve([])} />)
    await settle()
    const i = form.querySelector('input')!
    i.value = 'Por'
    i.dispatchEvent(new Event('input', { bubbles: true }))
    await settle()
    form.reset()
    await settle()
    expect(i.value).toBe('Lisbon')
    i.value = 'x'
    form.reset() // nothing changed in state: the native reset still mustn't win
    await settle()
    expect(i.value).toBe('Lisbon')
    form.parentElement!.remove()
  })

  test('AddressField goes back', async () => {
    const start = { country: 'US', lines: ['1 Main St'], city: 'Springfield' } as unknown as Address
    const form = inForm(() => <AddressField name="a" defaultValue={start} locale="en-US" />)
    await settle()
    const line = () => form.querySelector<HTMLInputElement>('input[autocomplete="address-line1"]')!
    expect(line().value).toBe('1 Main St')
    line().value = '2 Side St'
    line().dispatchEvent(new Event('input', { bubbles: true }))
    await settle()
    expect(JSON.parse(new FormData(form).get('a') as string).lines[0]).toBe('2 Side St')
    form.reset()
    await settle()
    expect(JSON.parse(new FormData(form).get('a') as string).lines[0]).toBe('1 Main St')
    expect(line().value).toBe('1 Main St')
    form.reset()
    await settle()
    expect(line().value).toBe('1 Main St')
    form.parentElement!.remove()
  })

  test('SignaturePad goes back to nothing', async () => {
    const seen: (SignatureValue | null)[] = []
    const form = inForm(() => <SignaturePad label="S" onValueChange={x => seen.push(x)} />)
    await settle()
    form.querySelector<HTMLInputElement>('input[type="radio"]:not(:checked)')!.click()
    await settle()
    const t = form.querySelector<HTMLInputElement>('[data-part="typed"]')!
    t.value = 'Ada'
    t.dispatchEvent(new Event('input', { bubbles: true }))
    await settle()
    expect((seen.at(-1) as { text?: string } | undefined)?.text).toBe('Ada')
    form.reset()
    await settle()
    expect(seen.at(-1)).toBeNull()
    expect(t.value).toBe('')
    expect(form.querySelector<HTMLInputElement>('input[type="radio"]:checked')!.parentElement!.textContent).toBe('Draw')
    form.parentElement!.remove()
  })

  test('a required field stays valid after a reset that changed nothing', async () => {
    const form = inForm(() => <DateField label="D" required defaultValue="2026-02-03" locale="en-US" today="2026-01-15" />)
    await settle()
    form.reset()
    await settle()
    expect(form.checkValidity()).toBe(true)
    form.parentElement!.remove()
  })

  test('a field outside the form stays', async () => {
    const form = document.createElement('form')
    document.body.append(form)
    const { container: c } = render(() => <DateField label="D" name="d" defaultValue="2026-02-03" locale="en-US" today="2026-01-15" />)
    document.body.append(c)
    await settle()
    await up(c, 'year')
    form.reset()
    await settle()
    expect(hidden(c)).toBe('2027-02-03')
    form.remove()
  })

  test('an Input whose value the app holds keeps showing it', async () => {
    const v = state('kept')
    const form = inForm(() => <Input label="N" value={v.value} />)
    await settle()
    form.reset()
    await settle()
    expect(form.querySelector('input')!.value).toBe('kept')
    form.parentElement!.remove()
  })

  test('a counter recounts', async () => {
    const form = inForm(() => <Input label="N" counter={10} />)
    await settle()
    const i = form.querySelector('input')!
    i.value = 'abc'
    i.dispatchEvent(new Event('input', { bubbles: true }))
    expect(form.querySelector('[data-part="counter"]')!.textContent).toBe('3/10')
    form.reset()
    await settle()
    expect(form.querySelector('[data-part="counter"]')!.textContent).toBe('0/10')
    form.parentElement!.remove()
  })
})

describe('Slider in a form', () => {
  test('posts its value, or one entry a thumb, and follows it', async () => {
    const v = state(30)
    const form = inForm(() => <div><Slider label="S" name="s" value={v.value} onChange={x => (v.value = x)} /><Slider label="R" name="r" value={[1, 2]} onChange={() => {}} /></div>)
    await settle()
    expect(new FormData(form).get('s')).toBe('30')
    expect(new FormData(form).getAll('r')).toEqual(['1', '2'])
    v.value = 40
    await settle()
    expect(new FormData(form).get('s')).toBe('40')
    form.parentElement!.remove()
  })

  test('form.reset() goes back through onChange', async () => {
    const v = state(30)
    const form = inForm(() => <Slider label="S" name="s" value={v.value} onChange={x => (v.value = x)} />)
    await settle()
    key(form.querySelector('[data-part="thumb"]')!, 'End')
    await settle()
    expect(v.value).toBe(100)
    form.reset()
    await settle()
    expect(v.value).toBe(30)
    expect(new FormData(form).get('s')).toBe('30')
    form.parentElement!.remove()
  })
})

describe('Card', () => {
  test('a direct child that switches to a Boundary shows the new branch', async () => {
    const day = state(0)
    function Today(props: { day: number }) {
      const w = resource(() => new Promise<string>(ok => { setTimeout(() => ok(`Day ${props.day}`), 20) }))
      return <p id="today">{w.value}</p>
    }
    const { container: c } = render(() => (
      <Card title="Forecast">
        {day.value === 0 ? <p id="zero">Press</p> : <Boundary pending={<span>Loading</span>}><Today day={day.value} /></Boundary>}
        <button type="button">Next</button>
      </Card>
    ))
    day.value = 1
    await flush()
    await tick(40)
    await settle()
    expect(c.querySelector('#zero')).toBeNull()
    expect(c.querySelector('#today')?.textContent).toBe('Day 1')
  })
})
