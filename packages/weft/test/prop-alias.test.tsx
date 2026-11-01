// `const x = props.y` names the prop: client, server and hydration all read it live, and it costs no binding of its own.
// weft-allow T005: framework test of compiled props; it reads the exact text and attribute the compiled child writes
import { screen } from '@testing-library/dom'
import { bind, derived, state, untrack } from 'weft'
import { renderToString } from 'weft/ssr'
import { hydrate } from 'weft/dom'
import { flush, render } from 'weft/test'
import { Price as ServerPrice } from './fixtures/ssr/Alias.tsx?weft-ssr'
import { Price as ClientPrice } from './fixtures/ssr/Alias.tsx?weft-hydrate'
import { Price } from './fixtures/ssr/Alias'

const start = () => ({ amount: 1, label: undefined as string | undefined, user: { name: 'Ada' }, items: [{ id: 1, t: 'a' }], title: 't' })

test('every form stays live on the client', async () => {
  const v = state(start())
  render(() => <Price amount={v.value.amount} label={v.value.label} user={v.value.user} items={v.value.items} title={v.value.title} />)
  const text = () => document.querySelector('section')!.textContent
  const row = screen.getByRole('listitem')
  expect(text()).toBe('Total: 1Ada1a')
  v.value = { ...v.value, amount: 2, label: 'Sum', user: { name: 'Lin' }, items: [{ id: 1, t: 'a' }, { id: 2, t: 'b' }], title: 'u' }
  await flush()
  expect(text()).toBe('Sum: 2Lin2ab')
  expect(document.querySelector('section')!.title).toBe('u')
  expect(screen.getAllByRole('listitem')[0]).toBe(row)
})

test('a local reads the prop as it is when used, in a handler too; `untrack` keeps the first one', async () => {
  function Log(props: { n: number }) {
    const n = props.n
    const first = untrack(() => props.n)
    return <button onClick={e => ((e.currentTarget as HTMLElement).title = `${first} ${n}`)}>go</button>
  }
  const v = state(1)
  render(() => <Log n={v.value} />)
  v.value = 5
  await flush()
  const b = screen.getByRole('button')
  b.click()
  expect(b.title).toBe('1 5')
})

test('it hydrates 0/0 and stays live', async () => {
  const v = state(start())
  const tree = (C: any) => () => C({ get amount() { return v.value.amount }, get label() { return v.value.label }, get user() { return v.value.user }, get items() { return v.value.items }, get title() { return v.value.title } })
  const html = renderToString(tree(ServerPrice))
  expect(html.replace(/<!--.*?-->/g, '')).toContain('Total: 1')
  expect(html).toContain('Ada')
  const box = document.createElement('div')
  box.innerHTML = html
  document.body.append(box)
  const seen: MutationRecord[] = []
  const watching = new MutationObserver(r => seen.push(...r))
  watching.observe(box, { subtree: true, childList: true, characterData: true, attributes: true })
  const dispose = hydrate(tree(ClientPrice), box)
  seen.push(...watching.takeRecords())
  expect(seen).toEqual([])
  v.value = { ...v.value, amount: 9 }
  await flush()
  expect(box.textContent).toContain('Total: 9')
  dispose()
})

// The table in the docs (props.md): where a write goes, by how the child writes and what the parent passed.
function ByLet(props: { n: number }) {
  let n = props.n
  return <button onClick={() => n++}>{n}|{props.n}</button>
}
function ByProps(props: { n: number }) {
  const n = props.n
  return <button onClick={() => (props.n = props.n + 1)}>{n}|{props.n}</button>
}
function ByPattern(props: { n?: number }) {
  let { n = 10 } = props
  return <button onClick={() => (n += 1)}>{n}|{n}</button>
}
const text = () => screen.getByRole('button').textContent
const press = async () => { screen.getByRole('button').click(); await flush() }

describe.each([['let', ByLet], ['props.x =', ByProps]])('a write through %s', (_, Child: any) => {
  test('without bind: stays in the child, until the parent changes; the parent is never written', async () => {
    const v = state(1)
    render(() => <Child n={v.value} />)
    await press()
    expect(text()).toBe('2|2')
    expect(untrack(() => v.value)).toBe(1)
    v.value = 7
    await flush()
    expect(text()).toBe('7|7')
  })

  test('a derived value: the same, and the derived keeps its own value', async () => {
    const v = state(1)
    const d = derived(() => v.value * 2)
    render(() => <Child n={d.value} />)
    await press()
    expect(text()).toBe('3|3')
    expect(untrack(() => d.value)).toBe(2)
    v.value = 2
    await flush()
    expect(text()).toBe('4|4')
  })

  test('a literal: the override lasts', async () => {
    render(() => <Child n={1} />)
    await press()
    await press()
    expect(text()).toBe('3|3')
  })

  test('spread props: the same as any other, and the source object is left alone', async () => {
    const source = { n: 1 }
    render(() => <Child {...source} />)
    await press()
    expect(text()).toBe('2|2')
    expect(source.n).toBe(1)
  })

  test('plain data, as an island gets its props: local', async () => {
    const data = JSON.parse('{"n":1}')
    render(() => Child(data))
    await press()
    expect(text()).toBe('2|2')
  })

  test('with bind: the write reaches the box, and the box back', async () => {
    const v = state(1)
    render(() => <Child n={bind(v)} />)
    await press()
    expect(untrack(() => v.value)).toBe(2)
    expect(text()).toBe('2|2')
    v.value = 9
    await flush()
    expect(text()).toBe('9|9')
    await press()
    expect(untrack(() => v.value)).toBe(10)
  })
})

test('bind:count on the tag: a child\'s count++ updates the parent, and the parent the child', async () => {
  function AddButton(props: { count?: number }) {
    let count = props.count!
    return <button onClick={() => count++}>{count}</button>
  }
  const count = state(1)
  render(() => <AddButton bind:count={count} />)
  await press()
  expect(untrack(() => count.value)).toBe(2)
  expect(text()).toBe('2')
  count.value = 8
  await flush()
  expect(text()).toBe('8')
})

test('a default applies until something is written, and a written default counts from it', async () => {
  const v = state<number | undefined>(undefined)
  render(() => <ByPattern n={v.value} />)
  expect(text()).toBe('10|10')
  await press()
  expect(text()).toBe('11|11')
  v.value = 3
  await flush()
  expect(text()).toBe('3|3')
})
