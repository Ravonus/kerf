// Runtime checks for the compiler items in research 16 §9: children memoisation, defaults that read other props,
// `{...rest}` on a native element (the `spread` helper), keyed fragment and conditional rows, and the W016 trap.
// weft-allow T005: framework test of compiled output; it checks the exact DOM and classes the compiler writes
import { screen } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { state } from '@weft-js/core'
import { flush, render, touches } from '@weft-js/core/test'
import { seen, seenRef } from './fixtures/refs'

test('children are built once, however often and wherever the component reads them', async () => {
  let built = 0
  function Child() {
    built++
    return <i>child</i>
  }
  const open = state(true)
  function Box({ children }: { children?: unknown }) {
    return <div>{open.value ? <p>{children}</p> : <span>{children}</span>}</div>
  }
  render(() => (
    <Box>
      <Child />
    </Box>
  ))
  const child = screen.getByText('child')
  open.value = false
  await flush()
  open.value = true
  await flush()
  expect(built).toBe(1)
  expect(screen.getByText('child')).toBe(child)
})

test('a default that reads another prop stays live', async () => {
  const live = state('x')
  function A({ a, b = a }: { a: string; b?: string }) {
    return <p>{b}</p>
  }
  render(() => <A a={live.value} />)
  live.value = 'y'
  await flush()
  expect(screen.getByText('y')).toBeTruthy()
})

test('rest props spread on a native element stay live', async () => {
  const title = state('one')
  let clicks = 0
  function Button({ label, ...rest }: { label: string; [k: string]: unknown }) {
    return <button {...rest}>{label}</button>
  }
  render(() => <Button label="go" title={title.value} class="b" onClick={() => clicks++} />)
  const button = screen.getByRole('button')
  expect(button.getAttribute('title')).toBe('one')
  expect(button.className).toBe('b')
  expect(button.textContent).toBe('go')
  await expect(() => {
    title.value = 'two'
  }).toTouchAtMost(1)
  expect(button.getAttribute('title')).toBe('two')
  await userEvent.setup().click(button)
  expect(clicks).toBe(1)
})

test('a rest parameter held in a variable is the same live view as the parameter', async () => {
  const title = state('one')
  function Box({ label, ...rest }: { label: string; [k: string]: unknown }) {
    const attrs = rest // not a setup-time read (W001 no longer fires here)
    return (
      <p {...attrs} data-n={Object.keys(rest).length}>
        {label}
        {rest.label === undefined ? '' : '!'}
      </p>
    )
  }
  render(() => <Box label="x" title={title.value} />)
  const p = screen.getByText('x')
  expect(p.title).toBe('one')
  expect(p.dataset.n).toBe('1')
  await expect(() => {
    title.value = 'two'
  }).toTouchAtMost(1)
  expect(p.title).toBe('two')
})

test('ref to an imported or const function calls it; ref to a let beside a spread assigns it', () => {
  const local: Element[] = []
  const keep = (el: Element) => local.push(el)
  // oxlint-disable-next-line no-unassigned-vars -- the compiler assigns it through ref
  let mine: HTMLElement | undefined
  function A(props: { title: string }) {
    return (
      <div>
        <p ref={seenRef}>a</p>
        <i ref={keep}>b</i>
        <b ref={mine} {...props}>
          c
        </b>
      </div>
    )
  }
  render(() => <A title="t" />)
  expect(seen).toEqual([screen.getByText('a')])
  expect(local).toEqual([screen.getByText('b')])
  expect(mine).toBe(screen.getByText('c'))
  expect(mine!.title).toBe('t')
})

test('key={index} keys rows by position', async () => {
  const items = state(['a', 'b'])
  render(() => (
    <ul>
      {items.value.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  ))
  const first = screen.getByText('a')
  items.value = ['c', 'b', 'd']
  await flush()
  expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['c', 'b', 'd'])
  expect(screen.getByText('c')).toBe(first) // the row at position 0 stayed and took the new item
})

test('fragment rows are keyed: a reorder moves them', async () => {
  const items = state([
    { id: 'a', v: 1 },
    { id: 'b', v: 2 },
  ])
  render(() => (
    <dl>
      {items.value.map((x) => (
        <>
          <dt key={x.id}>{x.id}</dt>
          <dd>{x.v}</dd>
        </>
      ))}
    </dl>
  ))
  const before = screen.getByText('a')
  const t = await touches(() => {
    items.value = [items.value[1]!, { id: 'a', v: 9 }]
  })
  expect(screen.getByText('a')).toBe(before)
  expect(screen.getByText('9')).toBeTruthy()
  expect(t.added).toBeLessThanOrEqual(2) // one row moved (dt + dd), none rebuilt
})

test('conditional rows are keyed by the key on either branch', async () => {
  const items = state([
    { id: 'a', on: true },
    { id: 'b', on: false },
  ])
  render(() => (
    <ul>
      {items.value.map((x) =>
        x.on ? <li key={x.id}>on {x.id}</li> : <li key={x.id}>off {x.id}</li>,
      )}
    </ul>
  ))
  const b = screen.getByText('off b')
  items.value = [items.value[1]!, items.value[0]!]
  await flush()
  expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['off b', 'on a'])
  expect(screen.getByText('off b')).toBe(b)
})

// The evidence for W016 over hoisting: the trap is real (a call in a prop runs on every read), and the compiler
// can't tell it from a call that must re-run because it reads state inside the callee.
test('W016: a call in a component prop runs on every read', async () => {
  let made = 0
  const make = () => ({ id: ++made })
  function App({ api }: { api: { id: number } }) {
    return <p title={String(api.id)}>{api.id}</p>
  }
  const p = render(() => <App api={make()} />).container.querySelector('p')!
  expect(made).toBe(2) // two reads, two different `api` objects in one component
  expect([p.textContent, p.title].sort()).toEqual(['1', '2'])

  const locale = state('en')
  const t = (k: string) => `${locale.value}:${k}`
  function Label({ text }: { text: string }) {
    return <span>{text}</span>
  }
  render(() => <Label text={t('hi')} />)
  locale.value = 'fr'
  await flush()
  expect(screen.getByText('fr:hi')).toBeTruthy() // hoisting `t('hi')` would freeze it at 'en:hi'
})
