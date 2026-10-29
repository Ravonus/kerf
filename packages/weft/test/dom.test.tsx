// weft-allow T005: framework test of keyed rows; it reads the row nodes and the key attribute the runtime writes
import { screen } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { state } from 'weft'
import { flush, render, touches } from 'weft/test'

function Counter({ step = 1 }: { step?: number }) {
  const n = state(0)
  return <button onClick={() => (n.value += step)}>Count {n.value}</button>
}

test('a click updates one text node', async () => {
  render(Counter, { step: 2 })
  const user = userEvent.setup()
  const button = screen.getByRole('button')
  await expect(() => user.click(button)).toTouchAtMost(1)
  expect(button.textContent).toBe('Count 2')
})

test('props stay live through the parent', async () => {
  const step = state(1)
  function Parent() {
    return <Counter step={step.value} />
  }
  render(Parent)
  const user = userEvent.setup()
  step.value = 10
  await flush()
  await user.click(screen.getByRole('button'))
  expect(screen.getByRole('button').textContent).toBe('Count 10')
})

test('keyed list: a new object under the same key updates the row in place', async () => {
  const items = state([{ id: 'a', n: 1 }, { id: 'b', n: 2 }])
  function List() {
    return <ul>{items.value.map(i => <li key={i.id}>{i.n}</li>)}</ul>
  }
  render(List)
  const [first] = screen.getAllByRole('listitem')
  const t = await touches(() => { items.value = items.value.map(i => (i.id === 'a' ? { ...i, n: 9 } : i)) })
  expect(t.mutations).toBe(1)
  expect(screen.getAllByRole('listitem')[0]).toBe(first)
  expect(first.textContent).toBe('9')
})

test('keyed list: reorder moves rows instead of rebuilding them', async () => {
  const items = state(['a', 'b', 'c'])
  render(() => <ul>{items.value.map(x => <li>{x}</li>)}</ul>)
  const before = screen.getAllByRole('listitem')
  const t = await touches(() => { items.value = ['c', 'a', 'b'] })
  const after = screen.getAllByRole('listitem')
  expect(after.map(li => li.textContent)).toEqual(['c', 'a', 'b'])
  expect(new Set(after)).toEqual(new Set(before))
  expect(t.added).toBe(1)
})

test('conditional branches are built once per switch', async () => {
  const on = state(false)
  const n = state(0)
  render(() => <div>{on.value ? <p>on {n.value}</p> : <span>off</span>}</div>)
  on.value = true
  await flush()
  const p = screen.getByText(/on/)
  n.value = 1
  await flush()
  expect(screen.getByText('on 1')).toBe(p)
})

test('toTouchAtMost fails with a breakdown when the budget is exceeded', async () => {
  const items = state([1, 2, 3])
  render(() => <ul>{items.value.map(x => <li>{x}</li>)}</ul>)
  await expect(expect(() => { items.value = [4, 5, 6] }).toTouchAtMost(1)).rejects.toThrow(/expected ≤ 1 DOM mutations, got 6 mutations \(3 added, 3 removed/)
})

test('a keyed row with an index reads it live; its key is written once', async () => {
  const items = state([{ id: 'a', n: 1 }, { id: 'b', n: 2 }])
  const { container } = render(() => <ul>{items.value.map((x, i) => <li key={x.id} data-id={x.id}>{i}:{x.id}:{x.n}</li>)}</ul>)
  const text = () => [...container.querySelectorAll('li')].map(li => `${li.dataset.id} ${li.textContent}`)
  expect(text()).toEqual(['a 0:a:1', 'b 1:b:2'])
  items.value = [{ id: 'b', n: 3 }, items.value[0]]
  await flush()
  expect(text()).toEqual(['b 0:b:3', 'a 1:a:1'])
})
