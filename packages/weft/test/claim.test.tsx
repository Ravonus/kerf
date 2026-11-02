// What claiming leaves behind and what it does when it can't claim: markers, keys, and a key that isn't there.
// weft-allow T004, T005: framework test of hydration; server markup and node identity are the subject
import { hydrate } from 'weft/dom'
import { renderToString } from 'weft/ssr'
import { createRoot, derived, effect, flush, rt, state, view } from 'weft'
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

const row = (id: any, t = String(id)) => ({ id, href: `/${t}`, t })
const links = (c: Element) => [...c.querySelectorAll('a')].map(a => [a.textContent, a.getAttribute('href')])

test('two keys are two rows, whatever their hash: `Aa` and `BB` at one index share nothing', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const c = put(renderToString(() => <Server.Keyed rows={[row('Aa', 'one')]} />))
  const server = c.querySelector('a')
  hydrate(() => <Client.Keyed rows={[row('BB', 'two')]} />, c)
  expect(hydration.misses).toBe(1)
  expect(links(c)).toEqual([['two', '/two']])
  expect(c.querySelector('a')).not.toBe(server)
})

test('a row put in before hydration builds that row alone: those after it keep their nodes', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const c = put(renderToString(() => <Server.Keyed rows={['a', 'b', 'c'].map(k => row(k))} />))
  const [a, b, last] = c.querySelectorAll('a')
  ;(last as any).typed = 'still here'
  hydrate(() => <Client.Keyed rows={['a', 'b', 'n', 'c'].map(k => row(k))} />, c)
  expect(hydration.misses).toBe(1)
  expect(links(c).map(l => l[0])).toEqual(['a', 'b', 'n', 'c'])
  expect([...c.querySelectorAll('a')].filter((_, i) => i !== 2)).toEqual([a, b, last])
  expect((last as any).typed).toBe('still here')
})

test('a row that moved keeps its node, wherever it went', () => {
  const c = put(renderToString(() => <Server.Keyed rows={['a', 'b', 'c'].map(k => row(k))} />))
  const [a, b, last] = c.querySelectorAll('a')
  hydrate(() => <Client.Keyed rows={['c', 'a', 'b'].map(k => row(k))} />, c)
  expect(hydration.misses).toBe(0)
  expect([...c.querySelectorAll('a')]).toEqual([last, a, b])
})

test('a key can hold anything: nothing in it ends the attribute, a step, or another row', () => {
  const ids = ['a"><img src=x onerror=1>', 'a/b', 'a.b', 'a%2Fb', 'a&amp;b', 'a&b', '0c', '<b>']
  const c = put(renderToString(() => <Server.Keyed rows={ids.map(k => row(k))} />))
  expect(c.querySelector('img')).toBeNull()
  const nodes = [...c.querySelectorAll('a')]
  expect(new Set(nodes.map(n => n.getAttribute('wk'))).size).toBe(ids.length)
  hydrate(() => <Client.Keyed rows={ids.map(k => row(k))} />, c)
  expect(hydration.misses).toBe(0)
  expect([...c.querySelectorAll('a')]).toEqual(nodes)
})

test('keys that read the same, and objects with no key to speak of, claim by place and never share a scope', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const rows = () => [{ id: 1, href: '/n', t: 'n' }, { id: '1', href: '/s', t: 's' }, { id: 'x', href: '/x', t: 'x' }, { id: 'x', href: '/y', t: 'y' }, { id: {}, href: '/o', t: 'o' }, { id: {}, href: '/p', t: 'p' }]
  const c = put(renderToString(() => <Server.Keyed rows={rows()} />))
  const nodes = [...c.querySelectorAll('a')]
  expect(new Set(nodes.map(n => n.getAttribute('wk'))).size).toBe(rows().length)
  hydrate(() => <Client.Keyed rows={rows()} />, c)
  expect(hydration.misses).toBe(0)
  expect([...c.querySelectorAll('a')]).toEqual(nodes)
  expect(links(c)).toEqual(rows().map(r => [r.t, r.href]))
})

test('an empty hole in a range takes nothing from what is before it', () => {
  const b = state('')
  const on = { value: true }
  const c = put(renderToString(() => <Server.Holes on={on} b={{ value: '' }} />))
  const i = c.querySelector('i')
  hydrate(() => <Client.Holes on={on} b={b} />, c)
  expect(c.textContent).toBe('oneic')
  expect(c.querySelector('i')).toBe(i)
  b.value = 'y'
  flush()
  expect(c.textContent).toBe('oneiyc')
})

test('a list that moved on since the server rendered puts its rows in order, with their attributes', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const c = put(renderToString(() => <Server.Lines lines={['a', 'b']} />))
  hydrate(() => <Client.Lines lines={['b', 'a']} />, c)
  expect(hydration.misses).toBe(0)
  expect([...c.querySelectorAll('a')].map(a => [a.textContent, a.getAttribute('href')])).toEqual([['b', '/b'], ['a', '/a']])
  warn.mockRestore()
})

test('a key miss writes what the server would have: attributes and handlers, and production hears about it', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const on = vi.fn()
  const c = put(renderToString(() => <Server.Wrong title="x" on={on} />))
  for (const el of c.querySelectorAll('button')) el.removeAttribute('wk')
  const after = c.querySelector('span')
  hydrate(() => <Client.Wrong title="x" on={on} />, c)
  expect(hydration.misses).toBe(1)
  const b = c.querySelector('button')!
  expect(b.getAttribute('aria-label')).toBe('x')
  expect(b.textContent).toBe('x')
  b.click()
  expect(on).toHaveBeenCalledOnce()
  expect(c.querySelector('span')).toBe(after) // what's after the miss still claims
  expect(warn.mock.calls.some(a => /1 hydration miss\(es\), first wk=/.test(a[0]))).toBe(true)
})

test('a miss in one hole ends with it: the next hole still claims', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const c = put(renderToString(() => <Server.Beside on={() => {}} />))
  const [first, last] = c.querySelectorAll('button')
  first.removeAttribute('wk')
  hydrate(() => <Client.Beside on={() => {}} />, c)
  expect(hydration.misses).toBe(1)
  expect(c.querySelectorAll('button')[1]).toBe(last)
})

describe('a view of a getter', () => {
  const sourced = () => {
    const n = state(1)
    const get = vi.fn(() => ({ a: n.value, b: 2 }))
    return { n, get, v: view([get]) }
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

  test('a key in two sources is listed once', () => {
    const v = view([{ a: 1, b: 2 }, () => ({ b: 3, c: 4 }), { a: 5 }])
    expect(Object.keys(v)).toEqual(['a', 'b', 'c'])
    expect({ ...v }).toEqual({ a: 5, b: 3, c: 4 })
    expect(Object.keys(view([{ a: 1, b: 2 }, { a: 3 }], ['b']))).toEqual(['a'])
  })

  test('on the server, a source that throws is asked again', () => {
    const v = (() => { rt.server = true; try { let n = 0; return view([() => { if (!n++) throw new Error('late'); return { a: 1 } }]) } finally { rt.server = false } })()
    expect(() => v.a).toThrow('late')
    expect(v.a).toBe(1)
  })

  test('on the server the source runs once, however many reads', () => {
    const { get, v } = (() => { rt.server = true; try { return sourced() } finally { rt.server = false } })()
    expect([v.a, v.b, 'a' in v, Object.keys(v)]).toEqual([1, 2, true, ['a', 'b']])
    expect(get).toHaveBeenCalledOnce()
  })
})
