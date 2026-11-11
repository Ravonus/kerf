// The chart math, the scene, and the behaviour on plain DOM: nothing here needs a framework.
import { esc as canonicalEsc } from '@kerf-js/core/markup'
import type * as Markup from '@kerf-js/core/markup'
import { esc as chartEsc } from '../src/charts/scene'

import {
  type BarConfig,
  type Form,
  type Scene,
  bar,
  chart,
  labelWindow,
  line,
  monotone,
  niceTicks,
  patch,
  quantile,
  s,
  sparkScene,
  squarify,
  toHTML,
} from '../src/charts'

vi.mock('@kerf-js/core/markup', async (importOriginal) => {
  const original = await importOriginal<typeof Markup>()
  return { ...original, esc: vi.fn(original.esc) }
})

test('niceTicks lands on round steps around the data', () => {
  expect(niceTicks(0, 98, 4)).toEqual([0, 20, 40, 60, 80, 100])
  expect(niceTicks(5, 5, 3)).toEqual([5, 5.2, 5.4, 5.6, 5.8, 6])
})

test('labelWindow keeps both ends and never crowds the last', () => {
  expect([...labelWindow(5, 8)]).toEqual([0, 1, 2, 3, 4])
  const w = [...labelWindow(12, 5)].sort((a, b) => a - b)
  expect(w[0]).toBe(0)
  expect(w[w.length - 1]).toBe(11)
  for (let i = 1; i < w.length; i++) expect(w[i]! - w[i - 1]!).toBeGreaterThanOrEqual(2)
})

test('a monotone line never overshoots the data', () => {
  const pts = [
    [0, 10],
    [10, 10],
    [20, 40],
    [30, 40],
    [40, 5],
  ]
  const ys = [...monotone(pts).matchAll(/,(-?[\d.]+)/g)].map((m) => Number(m[1]))
  expect(Math.max(...ys)).toBeLessThanOrEqual(40)
  expect(Math.min(...ys)).toBeGreaterThanOrEqual(5)
})

test('squarify fills the box exactly', () => {
  const cells = squarify([{ a: 500 }, { a: 300 }, { a: 150 }, { a: 50 }], 0, 0, 50, 20)
  expect(cells.reduce((n, c) => n + c.w * c.h, 0)).toBeCloseTo(1000)
  for (const c of cells) {
    expect(c.x + c.w).toBeLessThanOrEqual(50.001)
    expect(c.y + c.h).toBeLessThanOrEqual(20.001)
  }
})

test('quantile', () => expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3))

test('toHTML escapes and drops what is off', () => {
  expect(
    toHTML([
      s('text', { x: 1.256, hidden: false, 'data-mark': true, 'aria-label': 'a"<b' }, 'x & y'),
    ]),
  ).toBe('<text x="1.26" data-mark="" aria-label="a&quot;&lt;b">x &amp; y</text>')
})

test('chart escaping delegates to the full markup policy', () => {
  const canonical = vi.mocked(canonicalEsc)
  canonical.mockClear()
  expect(chartEsc(`&<>"'`)).toBe(`&amp;&lt;&gt;&quot;'`)
  expect(canonical).toHaveBeenCalledExactlyOnceWith(`&<>"'`, 'full')
  const chars = ['a', '&', '<', '>', '"', "'", '', 'é']
  for (const a of chars)
    for (const b of chars) expect(chartEsc(a + b)).toBe(canonicalEsc(a + b, 'full'))
  for (const value of [null, undefined, 42])
    expect(() => chartEsc(value as unknown as string)).toThrow(TypeError)
})

function host(body: Scene[]) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.innerHTML = toHTML(body)
  return svg
}

test('patch keeps nodes, writes only what changed and removes what left', () => {
  const svg = host([
    s(
      'g',
      { 'data-series': 0 },
      s('path', { class: 'a', d: 'M0,0' }),
      s('path', { class: 'b', d: 'M1,1' }),
    ),
    s('text', { x: 1 }, 'old'),
  ])
  const [a, b] = svg.querySelectorAll('path'),
    g = svg.querySelector('g')
  const seen: MutationObserver = new MutationObserver(() => {})
  seen.observe(svg, { subtree: true, attributes: true, childList: true, characterData: true })
  patch(svg, [
    s(
      'g',
      { 'data-series': 0 },
      s('path', { class: 'a', d: 'M2,2' }),
      s('path', { class: 'b', d: 'M1,1' }),
    ),
    s('text', { x: 1 }, 'new'),
  ])
  const log = seen.takeRecords()
  expect(log.filter((r) => r.type === 'attributes')).toHaveLength(1)
  expect(svg.querySelector('g')).toBe(g)
  expect(svg.querySelectorAll('path')[0]).toBe(a)
  expect(svg.querySelectorAll('path')[1]).toBe(b)
  expect(svg.querySelector('text')!.textContent).toBe('new')
  patch(svg, [s('g', { 'data-series': 0 }, s('path', { class: 'a', d: 'M2,2' }))])
  expect(svg.querySelectorAll('path')).toHaveLength(1)
  expect(svg.querySelector('text')).toBeNull()
})

test('patch leaves what the running chart wrote', () => {
  const svg = host([s('circle', { 'data-mark': true, 'data-xi': 0, r: 1 })])
  svg.firstElementChild!.setAttribute('tabindex', '0')
  patch(svg, [s('circle', { 'data-mark': true, 'data-xi': 0, r: 2 })])
  expect(svg.firstElementChild!.getAttribute('tabindex')).toBe('0')
})

const data = ['Jan', 'Feb', 'Mar'].map((m, i) => ({ m, a: i + 1, b: 3 - i }))
const cfg = { title: 'T', data, x: 'm', series: ['a', 'b'] }
function mount<C>(form: Form<C>, c: C) {
  const ctx = { id: 'c', hidden: new Set<number>(), r: 3 },
    p = form.plot(c, 640, ctx)
  const fig = document.body.appendChild(document.createElement('figure'))
  fig.innerHTML = `<ul data-scope="legend">${form.legend!(c)
    .map((_: unknown, i: number) => `<li><button aria-pressed="true" data-si="${i}"></button></li>`)
    .join(
      '',
    )}</ul><div data-part="plot"><div data-part="chart-tip"></div><svg data-part="svg" width="640" height="${p.h}"></svg></div>`
  fig.querySelector('svg')!.innerHTML = toHTML(p.body)
  return { fig, action: chart(fig, { form, cfg: c, id: 'c' }) }
}

test('the action runs on plain DOM: one tab stop, walk, tooltip, legend', () => {
  const { fig, action } = mount(line, cfg)
  const marks = () => [...fig.querySelectorAll<SVGElement>('[data-mark]')]
  expect(marks().filter((m) => m.getAttribute('tabindex') === '0')).toHaveLength(1)
  marks()[0]!.focus()
  expect(fig.querySelector('[data-part="chart-tip"]')!.textContent).toContain('Jan')
  marks()[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
  expect(document.activeElement!.getAttribute('data-xi')).toBe('2')
  fig.querySelector<HTMLElement>('[data-si="1"]')!.click()
  expect(fig.querySelector('[data-series="1"]')).toBeNull()
  action.destroy()
  fig.remove()
})

test('bars stay the same nodes across a layout swap', () => {
  const { fig, action } = mount<BarConfig>(bar, { ...cfg, layout: 'grouped' })
  const m = fig.querySelector('[data-xi="1"][data-si="1"]')!
  action.update({ form: bar, cfg: { ...cfg, layout: 'stacked' as const }, id: 'c' })
  expect(fig.querySelector('[data-xi="1"][data-si="1"]')).toBe(m)
  action.destroy()
  fig.remove()
})

test('a sparkline ends on its last value', () => {
  const [, , dot] = sparkScene([1, 2, 3], 100)
  expect(dot!.a.cx).toBe('96.0')
})
