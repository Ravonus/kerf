// Fixes from the toolkit pages. jsdom has no layout, so a CSS fix is held by its rule; the behaviour ones are driven.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { flush, render } from '@kerf-js/core/test'
import { BubbleChart } from '../src/Charts'
import { DataGrid } from '../src/DataGrid'
import { Feed } from '../src/Feed'
import { CountrySelect, PhoneField } from '../src/RichSelect'
import { Select } from '../src/Select'

const settle = async () => {
  for (let i = 0; i < 4; i++) {
    await flush()
    await new Promise((r) => {
      setTimeout(r)
    })
  }
}
const css = (file: string) =>
  readFileSync(join(process.cwd(), '../veneer-core/styles', file), 'utf8')
const flat = (file: string) => css(file).replace(/\s+/g, ' ')
const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
]

describe('readonly', () => {
  test('Select keeps its value and shows no list, by press or by key', async () => {
    const { container: c } = render(() => (
      <Select label="Region" options={OPTIONS} defaultValue="a" readonly />
    ))
    document.body.append(c)
    await settle()
    const trigger = c.querySelector<HTMLButtonElement>('[role="combobox"]')!
    expect(trigger.getAttribute('aria-readonly')).toBe('true')
    expect(trigger.hasAttribute('readonly')).toBe(false)
    trigger.click()
    for (const key of ['ArrowDown', 'b'])
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    await settle()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(trigger.textContent).toContain('Alpha')
    expect(c.closest('[data-readonly]') ?? c.querySelector('[data-readonly]')).toBeTruthy()
  })

  test('PhoneField: the input is read-only and the country list stays shut', async () => {
    const { container: c } = render(() => (
      <PhoneField label="Mobile" defaultValue="+14155550123" readonly />
    ))
    await settle()
    const input = c.querySelector<HTMLInputElement>('input[type="tel"]')!
    expect(input.readOnly).toBe(true)
    const country = c.querySelector<HTMLButtonElement>('[data-part="country"]')!
    country.click()
    await settle()
    expect(country.getAttribute('aria-expanded')).toBe('false')
    expect(c.querySelector('[data-readonly]')).toBeTruthy()
  })

  test('the list selects stay shut with no open={false}', async () => {
    const { container: c } = render(() => (
      <CountrySelect label="Country" defaultValue="DE" readonly />
    ))
    await settle()
    const pick = c.querySelector<HTMLButtonElement>('[data-part="pick"]')!
    pick.click()
    await settle()
    expect(pick.getAttribute('aria-expanded')).toBe('false')
  })
})

test('DataGrid: an open group counts its rows once in the footer', async () => {
  const rows = [
    { id: 'a', region: 'x', cost: 1 },
    { id: 'b', region: 'x', cost: 2 },
    { id: 'c', region: 'y', cost: 4 },
  ]
  const columns = [
    { id: 'region', header: 'Region' },
    { id: 'cost', header: 'Cost', numeric: true, aggregate: 'sum' as const },
  ]
  const { container: c } = render(() => (
    <DataGrid
      caption="Costs"
      rows={rows}
      columns={columns}
      groupBy="region"
      views={{ Grouped: { order: ['region', 'cost'], hidden: [], filters: {}, group: true } }}
      view="Grouped"
    />
  ))
  await settle()
  ;[...c.querySelectorAll('button')]
    .find((b) => b.textContent === 'Group')
    ?.getAttribute('aria-pressed') === 'false' &&
    [...c.querySelectorAll('button')].find((b) => b.textContent === 'Group')!.click()
  await settle()
  const foot = c.querySelector('[data-part="aggregate"]')!
  expect(foot.textContent).toContain('3 rows')
  expect(foot.textContent).toContain('7')
  expect(foot.textContent).not.toContain('14')
})

test('Feed: a tone on the knot reaches the rule that colours it', async () => {
  const { container: c } = render(() => (
    <Feed label="Activity" items={[{ id: 1, what: 'Shipped', tone: 'critical' }]} />
  ))
  await settle()
  expect(c.querySelector('[data-part="knot"]')!.getAttribute('data-tone')).toBe('critical')
  expect(flat('data/timeline.css')).toContain(
    '[data-scope="timeline"] [data-part="knot"][data-tone])',
  )
})

test('BubbleChart: the biggest bubble fits whatever unit size comes in', async () => {
  const data = [
    {
      name: 'All',
      points: [
        { name: 'a', x: 1, y: 1, size: 40000 },
        { name: 'b', x: 2, y: 2, size: 10000 },
      ],
    },
  ]
  const { container: c } = render(() => (
    <BubbleChart title="Cost" data={data} xName="X" yName="Y" />
  ))
  await settle()
  const radii = [...c.querySelectorAll('circle[data-mark]')]
    .map((m) => Number(m.getAttribute('r')))
    .sort((a, b) => b - a)
  expect(radii).toHaveLength(2)
  expect(radii[0]).toBeLessThanOrEqual(18)
  expect(radii[1]! - 3).toBeCloseTo((radii[0]! - 3) / 2, 0) // area, not radius, follows the value
})

describe('rules with no jsdom layout to prove them', () => {
  test("SignaturePad: the pad takes the control's width", () => {
    expect(flat('rich/signature.css')).toMatch(
      /\[data-part="pad"\]\) \{ position: relative; flex: 1; min-inline-size: 0;/,
    )
  })
  test("RichTextEditor: its toolbar can't widen the frame", () => {
    expect(flat('rich/rich-text.css')).toContain(
      ':where([data-scope="rte"]) { display: grid; grid-template-columns: minmax(0, 1fr);',
    )
  })
  test('ControlBar: wraps in a narrow box', () => {
    const rule = flat('app/call-controls.css')
    expect(rule).toMatch(
      /:where\(\[data-scope="call-controls"\]\) \{ grid-column: 1 \/ -1; display: flex; flex-wrap: wrap;/,
    )
    expect(rule).toMatch(/\[data-part="group"\][^{]*\) \{ display: flex; flex-wrap: wrap;/)
  })
  test("ScrollGrid: padding stays inside a head's width", () => {
    expect(flat('data/scroll-grid.css')).toMatch(
      /\[data-part="corner"\][^{]*\) \{ position: absolute; inset-block-start: 0; inset-inline-start: 0; box-sizing: border-box;/,
    )
  })
  test('Center: fills a flex parent up to its max', () => {
    expect(flat('layout/center.css')).toContain('inline-size: stretch;')
  })
  test("the event calendar's month rule leaves the date picker's month alone", () => {
    expect(flat('app/calendar.css')).toContain(
      '[data-part="month"][role="grid"]) { display: grid; grid-template-columns: repeat(7',
    )
    expect(flat('app/calendar.css')).not.toContain('[data-part="month"]) { display: grid;')
  })
})
