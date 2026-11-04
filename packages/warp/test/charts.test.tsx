// Every chart form through SSR + hydrate (0 misses, 0 writes), then the one interaction model on the adopted markup.
import { fireEvent } from '@testing-library/dom'
import { resetIds } from '@weft-js/warp-core'
import { state } from '@weft-js/core'
import { hydrate } from '@weft-js/core/dom'
import { renderToString } from '@weft-js/core/ssr'
import { flush, render } from '@weft-js/core/test'
import { hydration } from '../../weft/src/hydrate'
import { BarChart, LineChart, Sparkline, StreamChart } from '../src/Charts'
import { revenue, seats } from './fixtures/ChartData'
// @ts-expect-error: query imports (@weft-js/core/vite)
const server = await import('./fixtures/ChartCases.tsx?weft-ssr')
// @ts-expect-error: query imports (@weft-js/core/vite)
const client = await import('./fixtures/ChartCases.tsx?weft-hydrate')

test.each(Object.keys(server).filter((n) => !n.endsWith('$shape')))(
  '%s: SSR + hydrate, 0 misses, 0 writes',
  async (name) => {
    resetIds()
    const html = renderToString(() => server[name]())
    expect(html).not.toMatch(/undefined|NaN|Infinity/)
    const root = document.body.appendChild(document.createElement('div'))
    root.innerHTML = html
    const writes: MutationRecord[] = []
    const observer = new MutationObserver((r) => writes.push(...r))
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    resetIds()
    const dispose = hydrate(() => client[name](), root)
    writes.push(...observer.takeRecords())
    observer.disconnect()
    expect(warn.mock.calls.join()).toBe('')
    warn.mockRestore()
    expect(hydration.misses).toBe(0)
    expect(
      writes.map(
        (w) => `${w.type} ${w.attributeName} on ${(w.target as Element).outerHTML?.slice(0, 80)}`,
      ),
    ).toEqual([])
    await flush()
    const fig = root.querySelector('figure')
    const marks = fig?.querySelector('[data-mark]')
    if (marks) {
      expect(root.querySelectorAll('[data-mark][tabindex="0"]')).toHaveLength(1)
      expect(fig!.querySelector('svg[data-part="svg"]')!.getAttribute('aria-labelledby')).toBe(
        fig!.querySelector('h3')!.id,
      )
      expect(fig!.querySelector('[data-part="summary"]')!.textContent).not.toBe('')
      expect(
        fig!.querySelectorAll('[data-part="table"] tbody tr').length + Number(name === 'Stream'),
      ).toBeGreaterThan(0)
    }
    dispose()
    root.remove()
  },
)

const chartOf = (c: HTMLElement) => c.querySelector('figure')!
const figure = (rows = revenue) =>
  render(() => <LineChart title="Revenue" data={rows} x="month" series={['subs', 'usage']} />)
    .container
const key = (el: Element, k: string) => fireEvent.keyDown(el, { key: k })

test('one tab stop; arrows walk x and series, Home and End jump, Escape closes the tooltip', async () => {
  const c = figure()
  await flush()
  const marks = [...c.querySelectorAll<SVGElement>('[data-mark]')]
  expect(marks.filter((m) => m.getAttribute('tabindex') === '0')).toHaveLength(1)
  const at = () => {
    const a = document.activeElement!
    return [a.getAttribute('data-xi'), a.getAttribute('data-si')]
  }
  marks[0]!.focus()
  key(marks[0]!, 'ArrowRight')
  expect(at()).toEqual(['1', '0'])
  key(document.activeElement!, 'ArrowDown')
  expect(at()).toEqual(['1', '1'])
  key(document.activeElement!, 'ArrowUp')
  expect(at()).toEqual(['1', '0'])
  key(document.activeElement!, 'End')
  expect(at()).toEqual(['11', '1'])
  key(document.activeElement!, 'Home')
  expect(at()).toEqual(['0', '0'])
  const tip = c.querySelector('[data-part="chart-tip"]')!
  expect(tip.hasAttribute('data-open')).toBe(true)
  expect(tip.getAttribute('aria-hidden')).toBe('true')
  expect(tip.textContent).toContain('Jan')
  key(document.activeElement!, 'Escape')
  expect(tip.hasAttribute('data-open')).toBe(false)
})

test('a data change rewrites attributes on the same nodes', async () => {
  const cheaper = revenue.map((r) => Object.assign({}, r, { subs: r.subs * 0.9 }))
  const rows = state(revenue)
  const { container: c } = render(() => (
    <LineChart
      title="Revenue"
      data={rows.value}
      x="month"
      series={['subs']}
      direct={false}
      area={false}
    />
  ))
  await flush()
  const mark = c.querySelector('[data-mark][data-xi="3"]')!,
    before = c.querySelector('.s-line')!.getAttribute('d')
  rows.value = cheaper
  await flush()
  await new Promise((r) => {
    setTimeout(r, 30)
  })
  expect(c.querySelector('[data-mark][data-xi="3"]')).toBe(mark)
  expect(c.querySelector('.s-line')!.getAttribute('d')).not.toBe(before)
  expect(c.querySelector('[data-part="table"] tbody td')!.textContent).toBe(
    (revenue[0]!.subs * 0.9).toLocaleString('en-US'),
  )
})

test('the legend hides a series, and the last one stays', async () => {
  const c = figure()
  await flush()
  const [subs, usage] = c.querySelectorAll<HTMLButtonElement>('[data-scope="legend"] button')
  subs!.click()
  expect(subs!.getAttribute('aria-pressed')).toBe('false')
  expect(c.querySelector('[data-series="0"]')).toBeNull()
  usage!.click()
  expect(usage!.getAttribute('aria-pressed')).toBe('true')
  subs!.click()
  expect(c.querySelector('[data-series="0"]')).not.toBeNull()
})

test('the view toggle swaps plot for table', async () => {
  const c = figure()
  await flush()
  c.querySelector<HTMLElement>('[data-part="view-toggle"] [data-view="table"]')!.click()
  expect(chartOf(c).dataset.view).toBe('table')
  expect(c.querySelector('[data-view="table"][aria-pressed]')!.getAttribute('aria-pressed')).toBe(
    'true',
  )
})

test('layout is reactive: same bars, new geometry', async () => {
  const layout = state<'grouped' | 'stacked'>('grouped')
  const { container: c } = render(() => (
    <BarChart
      title="Seats"
      data={seats}
      x="quarter"
      series={['free', 'team']}
      layout={layout.value}
    />
  ))
  await flush()
  const bar = c.querySelector('[data-mark][data-xi="1"][data-si="1"]')!,
    d = bar.getAttribute('d')
  layout.value = 'stacked'
  await flush()
  expect(c.querySelector('[data-mark][data-xi="1"][data-si="1"]')).toBe(bar)
  expect(bar.getAttribute('d')).not.toBe(d)
})

test('a stream writes only what moved, and Pause holds the window and shows the table', async () => {
  const rows = state([50, 52, 51, 55])
  const { container: c } = render(() => (
    <StreamChart title="RPS" data={rows.value} domain={[0, 100]} />
  ))
  await flush()
  const line = c.querySelector('.s-line')!
  const writes: MutationRecord[] = []
  const seen = new MutationObserver((r) => writes.push(...r))
  seen.observe(c.querySelector('svg[data-part="svg"]')!, {
    subtree: true,
    attributes: true,
    childList: true,
  })
  rows.value = [52, 51, 55, 54]
  await flush()
  seen.disconnect()
  expect(writes.filter((w) => w.attributeName === 'd')).toHaveLength(1)
  expect(writes.filter((w) => w.type === 'childList' && w.target.nodeName !== 'text')).toHaveLength(
    0,
  )
  expect(c.querySelector('.s-line')).toBe(line)
  const pause = [...c.querySelectorAll('button')].find((b) => b.textContent === 'Pause')!
  pause.click()
  await flush()
  expect(c.querySelector('[data-part="summary"]')!.textContent).toContain('Paused. Latest 54')
  expect(c.querySelectorAll('[data-part="table"] tbody tr')).toHaveLength(4)
  const held = line.getAttribute('d')
  rows.value = [1, 2, 3, 4]
  await flush()
  expect(line.getAttribute('d')).toBe(held)
})

test('a sparkline is hidden from the tree and needs its labelled parent', () => {
  const { container: c } = render(() => (
    <div aria-label="Rising">
      <Sparkline values={[1, 3, 2]} />
    </div>
  ))
  expect(c.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true')
  expect(c.querySelector('.ln')).not.toBeNull()
})

test('no listener or timer outlives the chart', async () => {
  const add = vi.spyOn(document, 'addEventListener'),
    remove = vi.spyOn(document, 'removeEventListener')
  const { unmount } = render(() => (
    <LineChart title="R" data={revenue} x="month" series={['subs']} />
  ))
  await flush()
  unmount()
  await flush()
  const on = add.mock.calls.filter((c) => c[0] === 'pointerdown'),
    off = remove.mock.calls.filter((c) => c[0] === 'pointerdown')
  expect(off.length).toBeGreaterThanOrEqual(on.length)
  add.mockRestore()
  remove.mockRestore()
})
