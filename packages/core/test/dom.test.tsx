// kerf-allow T005: framework test of keyed rows; it reads the row nodes and the key attribute the runtime writes
import { screen } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { createRoot, onCleanup, onMount, state, untrack } from '@kerf/core'
import { flush, render, touches } from '@kerf/core/test'

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
  const items = state([
    { id: 'a', n: 1 },
    { id: 'b', n: 2 },
  ])
  function List() {
    return (
      <ul>
        {items.value.map((i) => (
          <li key={i.id}>{i.n}</li>
        ))}
      </ul>
    )
  }
  render(List)
  const [first] = screen.getAllByRole('listitem')
  const t = await touches(() => {
    items.value = items.value.map((i) => (i.id === 'a' ? { ...i, n: 9 } : i))
  })
  expect(t.mutations).toBe(1)
  expect(screen.getAllByRole('listitem')[0]).toBe(first)
  expect(first!.textContent).toBe('9')
})

test('keyed list: reorder moves rows instead of rebuilding them', async () => {
  const items = state(['a', 'b', 'c'])
  render(() => (
    <ul>
      {items.value.map((x) => (
        <li>{x}</li>
      ))}
    </ul>
  ))
  const before = screen.getAllByRole('listitem')
  const t = await touches(() => {
    items.value = ['c', 'a', 'b']
  })
  const after = screen.getAllByRole('listitem')
  expect(after.map((li) => li.textContent)).toEqual(['c', 'a', 'b'])
  expect(new Set(after)).toEqual(new Set(before))
  expect(t.added).toBe(1)
})

test('keyed list: rows keep their nodes through removal at any place, insertion, and the two ends trading places', async () => {
  const items = state(['a', 'b', 'c', 'd', 'e'])
  render(() => (
    <ul>
      {items.value.map((x) => (
        <li>{x}</li>
      ))}
    </ul>
  ))
  const [a, b, c, d, e] = screen.getAllByRole('listitem')
  const shown = () => screen.getAllByRole('listitem')
  const t = await touches(() => {
    items.value = ['a', 'b', 'd', 'e']
  })
  expect(shown()).toEqual([a, b, d, e])
  expect(t.added + t.removed).toBe(1)
  items.value = ['e', 'b', 'd', 'a']
  await flush()
  expect(shown()).toEqual([e, b, d, a])
  items.value = ['x', 'e', 'b', 'y', 'd', 'a', 'z']
  await flush()
  expect(shown().map((n) => n.textContent)).toEqual(['x', 'e', 'b', 'y', 'd', 'a', 'z'])
  expect(shown()[1]).toBe(e)
  items.value = ['c']
  await flush()
  expect(shown().map((n) => n.textContent)).toEqual(['c'])
  expect(shown()[0]).not.toBe(c)
})

test('keyed list: a row that stops being one element keeps every later pass in order', async () => {
  const items = state(['a', 'b', 'c'])
  render(() => (
    <ul>
      {items.value.map((x) =>
        x === 'f' ? (
          <>
            <li>{x}1</li>
            <li>{x}2</li>
          </>
        ) : (
          <li>{x}</li>
        ),
      )}
    </ul>
  ))
  const shown = () => screen.getAllByRole('listitem').map((n) => n.textContent)
  items.value = ['c', 'b', 'a', 'f']
  await flush()
  expect(shown()).toEqual(['c', 'b', 'a', 'f1', 'f2'])
  items.value = ['f', 'a', 'b', 'c']
  await flush()
  expect(shown()).toEqual(['f1', 'f2', 'a', 'b', 'c'])
  items.value = []
  await flush()
  expect(screen.queryAllByRole('listitem')).toEqual([])
  items.value = ['z', 'y']
  await flush()
  expect(shown()).toEqual(['z', 'y'])
})

test('keyed list: rows are found by key in a short middle and a long one, NaN keys included', async () => {
  const items = state([{ k: 1 }, { k: NaN }, { k: 3 }])
  render(() => (
    <ul>
      {items.value.map((x) => (
        <li key={x.k}>{String(x.k)}</li>
      ))}
    </ul>
  ))
  const [a, b, c] = screen.getAllByRole('listitem')
  const [x, y, z] = untrack(() => items.value)
  items.value = [y!, z!, x!]
  await flush()
  expect(screen.getAllByRole('listitem')).toEqual([b, c, a])
  const long = Array.from({ length: 12 }, (_, k) => ({ k: k + 10 }))
  items.value = [...long, y!]
  await flush()
  expect(screen.getAllByRole('listitem').at(-1)).toBe(b)
  const lis = screen.getAllByRole('listitem')
  items.value = [y!, ...long.toReversed()]
  await flush()
  expect(screen.getAllByRole('listitem')).toEqual([lis[12], ...lis.slice(0, 12).reverse()])
})

test("a text hole that is its parent's only child: empty, then text, then a node, then text", async () => {
  const v = state<unknown>('')
  render(() => <p data-testid="p">{v.value}</p>)
  const p = screen.getByTestId('p')
  expect(p.childNodes.length).toBe(1)
  v.value = 'hi'
  await flush()
  expect(p.textContent).toBe('hi')
  v.value = 0
  await flush()
  expect(p.textContent).toBe('0')
  v.value = <b>x</b>
  await flush()
  expect(p.innerHTML).toBe('<b>x</b>')
  v.value = 'back'
  await flush()
  expect(p.innerHTML).toBe('back')
})

test('keyed list: keys that repeat stay shown, and rows that went run their cleanups once', async () => {
  const items = state([1, 1, 2, 1])
  const gone: number[] = []
  function Row(props: { n: number }) {
    onCleanup(() => gone.push(props.n))
    return <li>{props.n}</li>
  }
  render(() => (
    <ul>
      {items.value.map((n) => (
        <Row n={n} />
      ))}
    </ul>
  ))
  const shown = () => screen.getAllByRole('listitem').map((n) => n.textContent)
  expect(shown()).toEqual(['1', '1', '2', '1'])
  items.value = [2, 1, 1]
  await flush()
  expect(shown()).toEqual(['2', '1', '1'])
  items.value = [3]
  await flush()
  expect(shown()).toEqual(['3'])
  expect(gone).toHaveLength(5)
})

test('keyed list: a repeated key is rebuilt on every pass, and the first row of it is kept', async () => {
  const items = state([1, 1, 2])
  const mounts: number[] = []
  function Row(props: { n: number }) {
    const shown = untrack(() => props.n) // read when the row mounts, so a kept row would show it stale
    mounts.push(shown)
    return <li>{shown}</li>
  }
  render(() => (
    <ul>
      {items.value.map((n) => (
        <Row n={n} />
      ))}
    </ul>
  ))
  const [first] = screen.getAllByRole('listitem')
  mounts.length = 0
  items.value = [...items.value]
  await flush()
  expect(mounts).toEqual([1])
  expect(screen.getAllByRole('listitem')[0]).toBe(first)
  expect(screen.getAllByRole('listitem').map((n) => n.textContent)).toEqual(['1', '1', '2'])
})

test('keyed list: one removal adds nothing to the list of keys and keeps every other row', async () => {
  const items = state([1, 2, 3, 4, 5])
  render(() => (
    <ul>
      {items.value.map((n) => (
        <li key={n}>{n}</li>
      ))}
    </ul>
  ))
  const [a, b, , d, e] = screen.getAllByRole('listitem')
  const set = vi.spyOn(Map.prototype, 'set')
  items.value = [1, 2, 4, 5]
  await flush()
  const sets = set.mock.calls.length
  set.mockRestore()
  expect(sets).toBeLessThan(2) // the row search's own, for the one node between
  expect(screen.getAllByRole('listitem')).toEqual([a, b, d, e])
})

test('a plain object with a nodeType field is a value, not a node', async () => {
  const v = state<unknown>({ nodeType: 1 })
  render(() => <p>a{v.value}b</p>)
  await flush()
  expect(document.querySelector('p')!.textContent).toBe('a[object Object]b')
})

test('keyed list: nothing is re-placed when a new array has the same rows', async () => {
  const items = state([{ id: 1 }, { id: 2 }])
  render(() => (
    <ul>
      {items.value.map((i) => (
        <li key={i.id}>{i.id}</li>
      ))}
    </ul>
  ))
  const t = await touches(() => {
    items.value = [...items.value]
  })
  expect(t.mutations).toBe(0)
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
  render(() => (
    <ul>
      {items.value.map((x) => (
        <li>{x}</li>
      ))}
    </ul>
  ))
  await expect(
    expect(() => {
      items.value = [4, 5, 6]
    }).toTouchAtMost(1),
  ).rejects.toThrow(/expected ≤ 1 DOM mutations, got 4 mutations \(3 added, 3 removed/)
})

test('a keyed row with an index reads it live; its key is written once', async () => {
  const items = state([
    { id: 'a', n: 1 },
    { id: 'b', n: 2 },
  ])
  const { container } = render(() => (
    <ul>
      {items.value.map((x, i) => (
        <li key={x.id} data-id={x.id}>
          {i}:{x.id}:{x.n}
        </li>
      ))}
    </ul>
  ))
  const text = () =>
    [...container.querySelectorAll('li')].map((li) => `${li.dataset.id} ${li.textContent}`)
  expect(text()).toEqual(['a 0:a:1', 'b 1:b:2'])
  items.value = [{ id: 'b', n: 3 }, items.value[0]!]
  await flush()
  expect(text()).toEqual(['b 0:b:3', 'a 1:a:1'])
})

test('a fragment holding children with live parts updates them; a spread of an undefined prop is empty', async () => {
  const n = state(0)
  function Wrap({ children, attrs }: { children?: unknown; attrs?: Record<string, unknown> }) {
    // oxlint-disable no-constant-binary-expression -- a constant false in a fragment is the case under test
    return (
      <b {...attrs}>
        <>
          {false && <i />}
          {children}
        </>
      </b>
    ) /* oxlint-enable no-constant-binary-expression */
  }
  const { container } = render(() => <Wrap>Added {n.value}</Wrap>)
  n.value++
  await flush()
  expect(container.textContent).toBe('Added 1')
})

test('children with a live part: one text write when the part changes (the list reuses its text nodes)', async () => {
  const n = state(0)
  function Label({ children }: { children?: unknown }) {
    return <b>{children}</b>
  }
  const { container } = render(() => <Label>Cart ({n.value})</Label>)
  await expect(async () => {
    n.value++
    await flush()
  }).toTouchAtMost(1)
  expect(container.textContent).toBe('Cart (1)')
})

test('ARIA booleans are written as true/false; other booleans add or remove the attribute', async () => {
  const on = state(false)
  render(() => (
    <button aria-pressed={on.value} aria-expanded={false} disabled={on.value}>
      x
    </button>
  ))
  const button = screen.getByRole('button')
  expect([
    button.getAttribute('aria-pressed'),
    button.getAttribute('aria-expanded'),
    button.hasAttribute('disabled'),
  ]).toEqual(['false', 'false', false])
  on.value = true
  await flush()
  expect([button.getAttribute('aria-pressed'), button.hasAttribute('disabled')]).toEqual([
    'true',
    true,
  ])
})

test('onMount runs once the nodes are placed: refs assigned, the element in the document', async () => {
  const seen: string[] = []
  function Field({ name }: { name: string }) {
    // oxlint-disable-next-line no-unassigned-vars -- the compiler assigns it through ref
    let input!: HTMLInputElement
    onMount(() => {
      seen.push(`${name}:${input?.isConnected}`)
      input.focus()
    })
    return <input aria-label={name} ref={input} />
  }
  const open = state(false)
  render(() => (
    <div>
      <Field name="first" />
      {open.value && <Field name="later" />}
    </div>
  ))
  expect(seen).toEqual(['first:true'])
  expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'first' }))
  open.value = true
  await flush()
  expect(seen).toEqual(['first:true', 'later:true'])
  expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'later' }))
})

test('onMount is skipped when its owner is disposed before it mounts', async () => {
  const seen: string[] = []
  createRoot((dispose) => {
    onMount(() => seen.push('mounted'))
    dispose()
  })
  await flush()
  expect(seen).toEqual([])
})

test('an optional .map is a keyed list, and a nullish list renders no rows', async () => {
  const items = state<{ id: string; n: number }[] | null>(null)
  const { container } = render(() => (
    <ul>
      {items.value?.map((i) => (
        <li key={i.id}>{i.n}</li>
      ))}
    </ul>
  ))
  const text = () => [...container.querySelectorAll('li')].map((li) => li.textContent)
  expect(text()).toEqual([])
  items.value = [
    { id: 'a', n: 1 },
    { id: 'b', n: 2 },
  ]
  await flush()
  expect(text()).toEqual(['1', '2'])
  const first = container.querySelector('li')
  items.value = [
    { id: 'b', n: 2 },
    { id: 'a', n: 3 },
  ]
  await flush()
  expect(text()).toEqual(['2', '3'])
  expect(container.querySelectorAll('li')[1]).toBe(first)
  items.value = null
  await flush()
  expect(text()).toEqual([])
})

test('a ?. link before .map stays in the list source', async () => {
  const q = state<{ data: { id: string; on: boolean }[] } | undefined>(undefined)
  const { container } = render(() => (
    <ul>
      {q.value?.data
        .filter((x) => x.on)
        .map((x) => (
          <li key={x.id}>{x.id}</li>
        ))}
    </ul>
  ))
  expect(container.querySelectorAll('li').length).toBe(0)
  q.value = {
    data: [
      { id: 'a', on: true },
      { id: 'b', on: false },
    ],
  }
  await flush()
  expect(container.textContent).toBe('a')
})
