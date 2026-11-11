// A component tag rooted at a name the pre-pass rewrites (`<g.icon />` in a row, `<ui.Icon />` from a prop) is read
// like any other use of that name, on the server, on the client and through hydration.
// kerf-allow T005: framework test of SSR and hydration; server markup and node identity are the subject
import { renderToString } from '@kerf-js/core/ssr'
import { hydrate } from '@kerf-js/core/dom'
import { flush, render } from '@kerf-js/core/test'
import { hydration } from '../src/hydrate'
import { groups, reverse, Rows, swap } from './fixtures/ssr/MemberTags'
import { Rows as ServerRows } from './fixtures/ssr/MemberTags.tsx?kerf-ssr'
import { Rows as ClientRows } from './fixtures/ssr/MemberTags.tsx?kerf-hydrate'

const parts = (root: Element | Document) =>
  [...root.querySelectorAll('i')].map((i) => `${i.dataset.part}:${i.className}:${i.textContent}`)
const FIRST_ROW = ['solid:x:a', 'line::0', 'solid::', 'solid:kids:', 'ns::', 'local::', 'box::']
const REST = [
  'line:x:b',
  'solid::1',
  'line::',
  'line:kids:',
  'ns::',
  'local::',
  'box::',
  'line::a',
  'solid::a',
  'solid::b',
  'line::b',
  'solid::prop',
  'line::bare',
  'line::default',
  'solid::rest',
]

afterEach(() => {
  document.body.innerHTML = ''
})

test('client render: row, destructured row, prop, rest and plain local tags', async () => {
  const initial = groups.value
  const { container } = render(() => <Rows />)
  expect(parts(container)).toEqual([...FIRST_ROW, ...REST])

  reverse()
  await flush()
  expect(parts(container).slice(0, 2)).toEqual(['line:x:b', 'solid::0'])
  groups.value = initial
  await flush()
})

test('a tag is read when the row mounts: a new item under the same key keeps the mounted component', async () => {
  const initial = groups.value
  const { container } = render(() => <Rows />)
  swap()
  await flush()
  expect(parts(container)[0]).toBe('solid:x:a')
  groups.value = initial
  await flush()
})

test('server render and hydration: 0 misses, 0 DOM writes', () => {
  const html = renderToString(() => ServerRows({}))
  const container = document.body.appendChild(document.createElement('div'))
  container.innerHTML = html
  expect(parts(container)).toEqual([...FIRST_ROW, ...REST])

  const before = [...container.querySelectorAll('*')]
  const misses = hydration.misses
  const writes: MutationRecord[] = []
  const mo = new MutationObserver((r) => writes.push(...r))
  mo.observe(container, { subtree: true, childList: true, characterData: true, attributes: true })
  const dispose = hydrate(() => ClientRows({}), container)
  writes.push(...mo.takeRecords())
  mo.disconnect()
  expect(hydration.misses - misses).toBe(0)
  expect(writes).toEqual([])
  expect([...container.querySelectorAll('*')]).toEqual(before)
  dispose()
})
