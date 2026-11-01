// What claiming leaves behind and what it does when it can't claim: markers, keys, and a key that isn't there.
// weft-allow T005: framework test of hydration; server markup and node identity are the subject
import { hydrate } from 'weft/dom'
import { renderToString } from 'weft/ssr'
import { createRoot, derived, effect, flush, mergeProps, rt, state } from 'weft'
import { hydration } from '../src/hydrate'
// @ts-expect-error: query imports (vite.mjs)
import * as Server from './fixtures/ssr/Claims.tsx?weft-ssr'
// @ts-expect-error
import * as Client from './fixtures/ssr/Claims.tsx?weft-hydrate'

afterEach(() => { document.body.textContent = ''; vi.restoreAllMocks() })

const put = (html: string) => {
  const c = document.body.appendChild(document.createElement('div'))
  c.innerHTML = html
  return c
}
const settle = () => new Promise(ok => setTimeout(ok))
const comments = (c: Element) => {
  const w = document.createTreeWalker(c, 128), out: string[] = []
  while (w.nextNode()) out.push((w.currentNode as Comment).data)
  return out
}

test('a root fragment around a conditional, in a Boundary, claims every row', () => {
  const c = put(renderToString(() => <Server.InBoundary lines={['a', 'b']} />))
  const link = c.querySelector('a')
  hydrate(() => <Client.InBoundary lines={['a', 'b']} />, c)
  expect(hydration.misses).toBe(0)
  expect(c.querySelector('a')).toBe(link)
})

test('a row whose root is a fragment around a conditional claims too', () => {
  const c = put(renderToString(() => <Server.Rows lines={['a', 'b']} />))
  const row = c.querySelector('li')
  hydrate(() => <Client.Rows lines={['a', 'b']} />, c)
  expect(hydration.misses).toBe(0)
  expect(c.querySelector('li')).toBe(row)
})

test('an empty hole is one marker, and a later value goes where it stood', async () => {
  const on = state(false)
  const html = renderToString(() => <Server.Nothing on={on} />)
  expect(html).toContain('<b>a</b><!----><u>c</u>')
  const c = put(html)
  hydrate(() => <Client.Nothing on={on} />, c)
  expect(hydration.misses).toBe(0)
  on.value = true
  flush()
  expect(c.innerHTML).toMatch(/<b>a<\/b><i[^>]*>b<\/i><!----><u>c<\/u>/)
})

test('a hole that read nothing gives its marker up', async () => {
  const c = put(renderToString(() => <Server.Nothing on={{ value: true }} />))
  hydrate(() => <Client.Nothing on={{ value: true }} />, c)
  await settle()
  expect(comments(c)).toEqual([])
})

test('a hole that reads something keeps it', async () => {
  const on = state(true)
  const c = put(renderToString(() => <Server.Nothing on={on} />))
  hydrate(() => <Client.Nothing on={on} />, c)
  await settle()
  expect(comments(c)).toEqual([']'])
  on.value = false
  flush()
  expect(c.querySelector('i')).toBeNull()
})

test('a function that returns a function keeps its marker through the inner read', async () => {
  const n = state(1)
  const c = put(renderToString(() => <Server.Twice n={n} />))
  hydrate(() => <Client.Twice n={n} />, c)
  await settle()
  n.value = 2
  flush()
  expect(c.textContent).toBe('a2c')
})

test('a derived that read nothing is a constant: its readers have nothing to follow', () => {
  const n = state(1)
  const fixed = derived(() => 1)
  const seen = derived(() => fixed.value + 1)
  const live = derived(() => n.value + fixed.value)
  expect(seen.value).toBe(2)
  expect(live.value).toBe(2)
  n.value = 2
  flush()
  expect(live.value).toBe(3)
})

test('row keys stay short: a place and a check, not the key', () => {
  const id = '56073491-ac3c-9075-b1b6-a00a646d99e2'
  const html = renderToString(() => <Server.Lines lines={[id]} />)
  expect((/wk="[^"]*\/0"/.exec(html.replace(`href="/${id}"`, '')) ?? [''])[0]).not.toContain(id)
})

test('a list that moved on since the server rendered builds its rows, with their attributes', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const c = put(renderToString(() => <Server.Lines lines={['a', 'b']} />))
  hydrate(() => <Client.Lines lines={['b', 'a']} />, c)
  expect(hydration.misses).toBeGreaterThan(0)
  expect([...c.querySelectorAll('a')].map(a => [a.textContent, a.getAttribute('href')])).toEqual([['b', '/b'], ['a', '/a']])
  warn.mockRestore()
})

test('a key miss writes what the server would have: attributes and handlers, and production hears about it', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const on = vi.fn()
  const c = put(renderToString(() => <Server.Wrong title="x" on={on} />))
  for (const el of c.querySelectorAll('button')) el.removeAttribute('wk')
  hydrate(() => <Client.Wrong title="x" on={on} />, c)
  expect(hydration.misses).toBe(1)
  const b = c.querySelector('button')!
  expect(b.getAttribute('aria-label')).toBe('x')
  expect(b.textContent).toBe('x')
  b.click()
  expect(on).toHaveBeenCalledOnce()
  expect(c.querySelector('span')!.getAttribute('title')).toBe('x') // what's after the miss still claims
  expect(warn.mock.calls.some(a => /rendered fresh \(`hydration.misses`\)/.test(a[0]))).toBe(true)
})

describe('a view of a getter', () => {
  const sourced = () => {
    const n = state(1)
    const get = vi.fn(() => ({ a: n.value, b: 2 }))
    return { n, get, v: mergeProps(get) }
  }

  test('on the client it stays live: every read asks the source, and an effect follows it', () => {
    const { n, get, v } = sourced()
    expect([v.a, v.b]).toEqual([1, 2])
    expect(get.mock.calls.length).toBeGreaterThanOrEqual(2)
    const seen: number[] = []
    createRoot(() => effect(() => v.a, x => void seen.push(x)))
    n.value = 5
    flush()
    expect(v.a).toBe(5)
    expect(seen).toEqual([1, 5])
  })

  test('on the server the source runs once, however many reads', () => {
    const { get, v } = (() => { rt.server = true; try { return sourced() } finally { rt.server = false } })()
    expect([v.a, v.b, 'a' in v, Object.keys(v)]).toEqual([1, 2, true, ['a', 'b']])
    expect(get).toHaveBeenCalledOnce()
  })
})
