# Writing to a parent with bind:

:::learn
- How a child changes its parent's state with `bind:`
- Why only the call site decides whether a write leaves a component
- How `bind:` is typed, and the `bind(box)` form plain `tsc` accepts
- When to pass a box typed `State<T>` instead
- Patterns: an input inside a child, reusable controls, warp's own controls
:::

On [Passing props](/learn/passing-props) a child could change its own copy of a prop with `let` or `props.x =`, but the
parent never saw it: the write stayed in the child until the parent's value next changed. Sometimes the child's change
*should* reach the parent. A stepper changes how many guests are booked; a name field changes the name. To let a write
leave the component, the parent passes its box with `bind:`.

:::demo bind

## The call site decides

```tsx
<Stepper bind:value={guests} />   // writes reach `guests`
<Stepper value={guests.value} />  // writes stay in Stepper
```

`Stepper` is the same in both. It writes `value` with `let`:

```tsx
function Stepper(props: { value?: number }) {
  let { value = 0 } = props
  return <Button onClick={() => value++}>{value}</Button>
}
```

Only `bind:` at the call site decides whether that write leaves the component. So reading a parent tells you everything
that may change its state: if no call site in the parent says `bind:`, no child can write its boxes. You never have to
open a child to find out whether it writes something it was given.

### What `bind:` passes

A prop normally passes a value: `value={guests.value}` gives the child a live read of the number. `bind:value={guests}`
gives the child the same live read, plus a way back. The compiler turns it into a prop with a getter and a setter:

```js
{
  get value() { return guests.value },
  set value(v) { guests.value = v },
}
```

Reading `value` in the child reads the box. Writing it, through `let`, `props.value =`, `++` or `+=`, calls the setter,
which writes the box. The child's code doesn't change between the two: what changes is whether the prop has a setter.

## Writing in the child

Any of these writes a prop. Without `bind:`, each holds in the child until the parent's value changes; with it, each
writes the parent's box:

| In the child | Parent passed `n={x}` | Parent passed `bind:n={box}` |
|---|---|---|
| Read `n` or `props.n` | Live | Live |
| `let { n } = props; n = 5` | Holds in the child until the parent's value next changes | Writes `box` |
| `let n = props.n; n++` | The same | Writes `box` |
| `props.n = 5` | The same | Writes `box` |
| `const n = props.n; n = 5` | **W001**: use `let` or `props.n =` | **W001** |

Both behaviours are in this demo. The first two fields are bound; the nickname gets `value={first.value}`, a plain value:

:::demo interact-bind-input

Type in First name: the greeting follows, because the write reached `first`. Type in Nickname: only the nickname field
changes, because its write has nowhere to go. Then press Clear: `first` changes, and the nickname field takes the
parent's value again, dropping your local edit. The parent's value always wins when it changes.

Only a whole prop can be written this way. `let n = props.user.name; n = 1` is **W001**. `props.user.name = 1` is plain
JavaScript: it changes the `user` object, which is the mutation [Updating objects and arrays](/learn/updating-objects-and-arrays)
warns against.

## `bind:` takes a box, on a component

`bind:` has two requirements, and breaking either is **W061**:

- **It goes on a component**, not on a built-in element. `<input bind:value={name} />` is an error. A built-in input takes
  `value` and an `onInput` (or `onChange`) handler, as on [Forms and inputs](/learn/forms-and-inputs).
- **It takes a box.** `bind:value={guests}` or `bind:value={cart.note}` or `bind:value={props.box}`, never
  `bind:value={guests.value}` or `bind:value={3}`.

```tsx
// W061: a built-in element
<input bind:value={name} />
// Use a value and handler instead.
<input
  value={name.value}
  onInput={e => (name.value = e.currentTarget.value)}
/>
```

## Types: `weft tsc` and `bind(box)`

TypeScript doesn't know that `bind:value` means the prop `value`. To plain `tsc`, `bind:value` is an unrelated
namespaced attribute, so a component with a required `value` prop would be reported as missing it.

`weft tsc`, `weft check` and the editor plugin know better: they read `bind:value={box}` as `value` with the box's value
type. A required prop is satisfied, and a box of the wrong type is an error. Run `weft tsc` in CI rather than `tsc`, and
you can make the prop required:

```tsx
import { state } from '@weft-js/core'
import { Button } from '@weft-js/warp'

function Stepper(props: { value: number }) {
  let { value } = props
  return (
    <p>
      <Button
        size="sm"
        emphasis="outline"
        onClick={() => value--}
      >
        −
      </Button>
      <strong> {value} </strong>
      <Button
        size="sm"
        emphasis="outline"
        onClick={() => value++}
      >
        +
      </Button>
    </p>
  )
}

export function Booking() {
  const guests = state(2)
  return <Stepper bind:value={guests} />
}
```

Where something only runs plain `tsc`, keep the prop optional, as the demo at the top does, or use the other form. `bind`
from `@weft-js/core` wraps the box in the attribute's value:

```tsx
import { bind, state } from '@weft-js/core'
import { Button } from '@weft-js/warp'

function Stepper(props: { value: number }) {
  let { value } = props
  return <Button onClick={() => value++}>{value}</Button>
}

export function Booking() {
  const guests = state(2)
  return <Stepper value={bind(guests)} />
}
```

`value={bind(guests)}` is the same binding as `bind:value={guests}`: the compiler gives the prop the same getter and
setter. To TypeScript, `bind(guests)` is a call that returns a `number`, which every `tsc` accepts. Outside a component's
prop, `bind(box)` is **W061** too.

## Passing a box instead

You can also pass the box itself and type the prop as `State<T>`:

```tsx
import { type State } from '@weft-js/core'
import { Input } from '@weft-js/warp'

export function Coupon({ code }: { code: State<string> }) {
  return (
    <Input
      label="Coupon"
      value={code.value}
      onInput={e => (code.value = e.currentTarget.value)}
    />
  )
}
```

The parent writes `<Coupon code={coupon} />`, with no `.value`. Passing a box gives write access just as `bind:` does,
and it's just as visible at the call site: the parent passes the box itself.

Which to choose:

- **`bind:`** when the child edits a value. The child stays simple, it reads and writes a plain prop, and it works with or
  without a parent box: with `value={x}` it keeps its own edits, with `bind:value={box}` it writes the parent's.
- **A `State<T>` prop** when the child needs the box itself: to read one entry with `.get` in a list row (see
  [Keyed state and entries](/learn/entries)), to pass it on to a warp control, or to call `.set` on it.

Mixing them up is **W008** in the catalog (this weft doesn't report it yet): a box where the child's prop type wants a
value, or a value where it wants a box.

## Patterns

### A field in a child

The demo above is the most common use: a component that wraps an input, with its own label and checks, edits a value the
parent owns. The child writes its own `let`:

```tsx
import { state } from '@weft-js/core'
import { Input } from '@weft-js/warp'

function EmailField(props: { value?: string }) {
  let { value = '' } = props
  const ok = () => value === '' || value.includes('@')
  return (
    <Input
      label="Email"
      type="email"
      value={value}
      error={ok() ? undefined : 'An email has an @ in it'}
      onInput={e => (value = e.currentTarget.value)}
    />
  )
}

export function Settings() {
  const email = state('')
  return (
    <section>
      <EmailField bind:value={email} />
      <p>
        {email.value
          ? `Receipts go to ${email.value}`
          : 'No receipts'}
      </p>
    </section>
  )
}
```

### warp's controls take the box

warp's own controls that hold a value, such as `Select`, `NumberField` and the date and time fields, take the box
directly as `value`. They write it, and you don't need `bind:`:

```tsx
import { state } from '@weft-js/core'
import { NumberField } from '@weft-js/warp'

export function Guests() {
  const guests = state<number | null>(2)
  return (
    <section>
      <NumberField
        label="Guests"
        min={1}
        value={guests}
      />
      <p>Table for {guests.value ?? 0}</p>
    </section>
  )
}
```

They also take a plain value with `onValueChange`, or a `defaultValue` when you don't need the value at all. `Modal` takes
its `open` state the same way, as a box. Pass the box: `bind:value` on these would give them a plain value, which they'd show
but never write back. [Forms and inputs](/learn/forms-and-inputs) has each control.

### Callbacks still work

You don't have to use `bind:`. The React pattern, a value and a handler prop, works in weft as it does in React:

```tsx
import { state } from '@weft-js/core'
import { Button } from '@weft-js/warp'

function Stepper(
  { value, onChange }: {
    value: number
    onChange: (n: number) => void
  },
) {
  return <Button onClick={() => onChange(value + 1)}>{value}</Button>
}

export function Booking() {
  const guests = state(2)
  return (
    <Stepper
      value={guests.value}
      onChange={n => (guests.value = n)}
    />
  )
}
```

Use it when the parent wants to decide what a change means: to refuse it, adjust it or do something else as well. When it
just wants the value, `bind:` says that with less code.

:::note Islands
On a server-rendered page, a component that runs in the browser as an island gets its props from the server as data. A
write to a prop there always stays local: there's no parent box in the browser to reach. Put the state the island edits
inside the island, or in a [`defineState`](/learn/app-wide-state) scope.
:::

:::deepdive Why weft does it this way
In React, data flows one way. A child that wants to change the parent's state calls a function the parent passed it, and
you can read the parent to see every way its state can change. Svelte's `bind:` and Vue's `v-model` let a child write a
parent's value with less code, at the cost that the child alone may decide to write.

weft keeps React's guarantee and drops the boilerplate. A child can always write its own props, so a reusable component
needs no `value`/`onChange`/`defaultValue` trio to work both controlled and uncontrolled. Whether a write goes further is
decided only where the parent uses the child, written in the parent's file. Reading the parent still tells you every way its
state can change: look for `bind:`, and for boxes passed as props.
:::

## Recap

- A child's writes to its props, through `let`, `props.x =`, `++` and the rest, stay in the child unless the parent says
  `bind:`.
- `bind:x={box}` at the call site gives the prop a setter that writes the box. The child's code doesn't change.
- `bind:` takes a box, on a component. Anything else is **W061**.
- `weft tsc` types `bind:x` as `x`. `x={bind(box)}` is the same binding in a form plain `tsc` accepts.
- A prop typed `State<T>` passes the box itself, for children that need `.get`, `.set` or to pass it on.
- warp's value controls take the box as `value={box}`. Callback props work too, when the parent wants a say.

## Try it

:::challenge Keep it in range
Stop the `Stepper` in the demo at the top from going below 1.
:::solution
```tsx
<Button
  size="sm"
  emphasis="outline"
  disabled={value <= 1}
  onClick={() => value--}
>
  −
</Button>
```

`value` is the live alias, so `disabled` follows it, whether the write came from the child or the parent.
:::

:::challenge Fix W061
This form doesn't compile: the compiler reports **W061** on the input. Fix it so typing updates `title`.

<!-- example: skip deliberately broken: the challenge is to fix the W061 -->
```tsx
import { state } from '@weft-js/core'

export function Post() {
  const title = state('')
  return (
    <label>
      Title <input bind:value={title} />
      <p>{title.value.length} characters</p>
    </label>
  )
}
```
:::solution
`bind:` is for component props. A built-in input takes `value` and a handler:

```tsx
import { state } from '@weft-js/core'
import { Input } from '@weft-js/warp'

export function Post() {
  const title = state('')
  return (
    <section>
      <Input
        label="Title"
        value={title.value}
        onInput={e => (title.value = e.currentTarget.value)}
      />
      <p>{title.value.length} characters</p>
    </section>
  )
}
```

Here the built-in input is swapped for warp's `Input`, which takes the same `value` and `onInput`.
:::

:::challenge A rating that works both ways
Write a `Rating` component with five star buttons that sets its `value` prop from 1 to 5. Use it twice: once bound to a
box the parent shows, and once with a plain starting value that it keeps to itself.
:::solution
```tsx
import { state } from '@weft-js/core'
import { Button } from '@weft-js/warp'

function Rating(props: { value?: number }) {
  let { value = 0 } = props
  return (
    <p>
      {[1, 2, 3, 4, 5].map(n => (
        <Button
          key={n}
          size="sm"
          emphasis={n <= value ? 'solid' : 'outline'}
          onClick={() => (value = n)}
        >
          {n <= value ? '★' : '☆'}
        </Button>
      ))}
    </p>
  )
}

export function Review() {
  const stars = state(3)
  return (
    <section>
      <Rating bind:value={stars} />
      <p>You gave it {stars.value} of 5</p>
      <Rating value={4} />
    </section>
  )
}
```

`Rating` only writes its own `value`. The first one writes `stars` because of `bind:`; the second keeps its own edits,
because nothing at its call site says otherwise.
:::
