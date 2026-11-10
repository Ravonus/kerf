# Passing props

:::learn
- How to pass props to a component, and how to read them
- How to give a prop a default value, forward props with a spread, and pass markup as `children`
- Why props stay current without the child running again
- The prop rules: `const` is a live alias, `let` and `props.x =` write locally, `bind:` writes out
- When to pass a box instead of its value, and how prop types are worked out for you
:::

Components talk to each other with props. A parent passes information to a child by giving it props, as in React: the
same attribute syntax, the same `props` argument. What's different is time. A Weft child runs once, yet its props are
never stale: every read of a prop gets the parent's value as it is now.

:::demo props

Here `Tip` owns the bill and `Price` only shows the number it's given. `Price` never runs a second time, yet the number
changes. That's the idea this page builds on.

## Familiar props

Props are what you pass to a tag. In HTML, you pass `class`, `src`, `alt` and the rest to an `<img>`:

```tsx
export function Avatar() {
  return (
    <img
      class="avatar"
      src="https://i.imgur.com/1bX5QH6.jpg"
      alt="Lin Lanying"
      width={100}
      height={100}
    />
  )
}
```

The props an HTML tag takes are fixed by HTML. Your own components can take any props you like, and use them to decide
what to render.

## Passing props to a component

### Step 1: Pass props to the child

Give the child its props as attributes. Here `LinProfile` passes `person`, an object, and `size`, a number:

```tsx
// src/components/Avatar.tsx
export function Avatar(props: {
  person: { name: string; imageId: string }
  size: number
}) {
  return (
    <img
      class="avatar"
      src={`https://i.imgur.com/${props.person.imageId}s.jpg`}
      alt={props.person.name}
      width={props.size}
      height={props.size}
    />
  )
}
```

```tsx
// src/components/LinProfile.tsx
import { Avatar } from './Avatar'

export function LinProfile() {
  return (
    <Avatar
      person={{ name: 'Lin Lanying', imageId: '1bX5QH6' }}
      size={100}
    />
  )
}
```

The double braces after `person=` are an object in braces, as on [JavaScript in TSX](/learn/javascript-in-tsx).

### Step 2: Read props inside the child

The child gets every prop on one object, its first argument, usually called `props`. Read each with `props.name`. Or
destructure them in the parameter list, which is shorter and works the same:

```tsx
export function Avatar({
  person,
  size,
}: {
  person: { name: string; imageId: string }
  size: number
}) {
  return (
    <img
      src={`https://i.imgur.com/${person.imageId}s.jpg`}
      alt={person.name}
      width={size}
      height={size}
    />
  )
}
```

Both forms stay live. In React, destructuring copies each prop into a local variable for that render. In Weft the
compiler rewrites every use of `person` into a read of `props.person`, so `person` always means the parent's current
value. You write the short form and get the live one.

Props let you think about the parent and the child separately. `LinProfile` can change what it passes without looking
inside `Avatar`, and `Avatar` can change how it draws the image without looking at its callers.

:::pitfall Destructure one level only
`({ person, size })` stays live. `({ person: { name } })`, a pattern inside a pattern, can't: `name` would be read once
from the first `person`, and a new `person` from the parent would never reach it. The compiler reports this as
**W006**, and its fix rewrites it to destructure `person` and read `person.name` where you use it.
:::

## Default values

To give a prop a value when the parent leaves it out, put a default in the pattern, as in JavaScript:

```tsx
export function Avatar({
  name,
  size = 100,
}: {
  name: string
  size?: number
}) {
  return (
    <span class="avatar" style={{ width: size, height: size }}>
      {name[0]}
    </span>
  )
}
```

Now `<Avatar name="Lin" />` is 100 pixels wide. The default applies whenever the prop is `undefined`: when it's left
out, and also when the parent passes `size={undefined}`, or a value that later becomes `undefined`. It is checked on
every read, so a prop that goes from `undefined` to a number and back follows along. `null` and `0` are values, so they
don't use the default.

## Forwarding props with the spread syntax

Some components pass all their props on to a child:

```tsx
// src/components/ProfileCard.tsx
import { Avatar } from './Avatar'

export function ProfileCard(props: {
  person: { name: string; imageId: string }
  size: number
}) {
  return (
    <div class="card">
      <Avatar {...props} />
    </div>
  )
}
```

`{...props}` forwards every prop. It stays live too: if the parent changes `size`, `Avatar` sees it.

More often, a component uses a few props itself and forwards the rest. The rest pattern does that:

:::demo describe-children

`Panel` takes `title`, `tone` and `children` for itself, and `...rest` collects everything else (`aria-label`,
`data-low`) and puts it on the `<section>`. `rest` isn't a copy taken when `Panel` was made: it's a live view of the
props minus the named ones, so `data-low` follows the stock count. Under the hood it is `omit(props, ['title', 'tone',
'children'])`; `omit` is exported from `@weft-js/core` for the rare helper that needs the same thing outside a parameter
list.

Use spreading with restraint. A component that forwards everything is harder to read and to type. Often it's clearer to
pass `children`, which is next.

## Passing markup as children

Markup nested inside a component's tags arrives as its `children` prop:

```tsx
export function Card({ children }: { children?: unknown }) {
  return <div class="card">{children}</div>
}

export function Profile() {
  return (
    <Card>
      <h2>Lin Lanying</h2>
      <p>Semiconductor scientist</p>
    </Card>
  )
}
```

`Card` doesn't need to know what's inside it. It could hold a heading, a form, or another component. Think of a component
with a `children` prop as having a hole that its parent fills: panels, dialogs, layouts and grids all work this way.
`Card` from Warp, used throughout these pages, is one.

The compiler gives each component one memoised read of its children, so `{children}` placed in the markup is built once
and moved into place, and a live expression inside it (`{stock.value} bags left` in the demo above) updates itself
where it is. You can type `children` as `unknown`, which takes anything TSX can render.

## How props change over time

In React, a component re-runs with new props each time its parent renders. In Weft the child runs once, and there's no
"new props" moment. Instead, the compiler makes each prop a getter. When `Tip` writes
`<Price dollars={bill.value / 2} />`, `Price` gets an object whose `dollars` works out `bill.value / 2` each time it's
read. Every place `Price` reads `props.dollars` (a text hole, an attribute, a `derived`, a handler) gets the current
value, and the holes that read it update when `bill` changes.

So props are read-only windows onto the parent's values. Read them where the reading should stay current: in JSX, in
`derived`, in `watch`, or in an event handler. A handler reads them when it runs, which is always now.

## Naming a prop: `const`, `let` and `props.x =`

You can give a prop another name in the component body. What you get depends on whether you use `const` or `let`.

:::demo alias

- **`const item = props.item`** is a live, read-only alias. It isn't a copy: every use of `item`, closures included,
  reads the prop as it is at that moment. It costs nothing, since the compiler replaces `item` with `props.item`.
  Assigning to it is **W001**, which tells you to use `let` or `props.x =`.
- **`let qty = props.qty`** is a writable local alias. The child can change it, and the change holds until the parent's
  value next changes. Then the parent wins.
- **`props.qty = 2`** works the same as writing a `let` alias.

Destructuring in the body works like destructuring the parameter: `const { item, qty = 1, ...rest } = props` gives you
live names, with defaults and a live rest. `let { qty } = props` makes `qty` writable. A path off a prop is live too:
`const n = props.items.length` reads the current length every time you use `n`.

What none of these writes does is reach the parent. `let` and `props.x =` change what this child shows; the parent's
value is untouched.

:::deepdive How a local write works
When the compiler sees a component write to one of its props, it wraps that prop in a small linked box: reads return the
local value if there is one, and the parent's otherwise. A write sets the local value and remembers which parent value
it was made against. When the parent's value changes, that local edit is dropped and the parent's value shows again. The
code is `localProps` and `linked` in `@weft-js/core`, and it is only included in an app that writes a prop somewhere.

Only a whole prop can be written this way. `let n = props.user.name; n = 'Ana'` is **W001**: nothing says where that
write should go. `props.user.name = 'Ana'` is ordinary JavaScript: it changes the `user` object itself, which the parent
owns, so be careful with it.
:::

## Writing to the parent: `bind:`

Sometimes a child should change the parent's value: a stepper that sets a count, a field that edits a name. In Weft the
parent decides that, at the call site, with `bind:`:

:::demo bind

`<Stepper bind:value={guests} />` passes the box `guests` instead of its value. Inside `Stepper`, nothing changes: it
reads `value` and writes it with `let`, exactly as before. But because the parent bound the prop, the write goes into
`guests`, and the parent's `Booked for … people` follows.

| In the child | Parent passed `n={x}` | Parent passed `bind:n={box}` |
|---|---|---|
| Read `n` or `props.n` | Live | Live |
| `let n = props.n; n = 5` | Holds in the child until the parent's value next changes | Writes `box` |
| `props.n = 5` | The same | Writes `box` |
| `const n = props.n; n = 5` | **W001**: use `let` or `props.n =` | **W001** |

`bind:` at the call site alone decides whether a write leaves a component. `<Card n={box.value} />` can never write
`box`, whatever `Card` does. That keeps data flow plain to follow: to find every place that can change `guests`, look for
`guests.value =` and `bind:…={guests}` in the file that owns it.

`bind:` takes a box, and only on a component: on an HTML element it's **W061**. [Writing to a parent with
bind:](/learn/bind) covers it in depth, including `n={bind(box)}`, the same binding written in a form that plain `tsc`
accepts.

## Copying a prop into state

A common React habit is `useState(props.value)`: start from the prop, then edit locally. The Weft translation,
`state(props.value)`, has the same bug React's has: the box takes the prop once and never follows it. The compiler
reports it as **W005**. Use `state.linked` instead, which starts from the prop, takes local edits, and resets when the
prop changes:

```tsx
import { state } from '@weft-js/core'

export function Rename(props: { name: string }) {
  const draft = state.linked(() => props.name)
  return (
    <label>
      Name{' '}
      <input
        value={draft.value}
        onInput={e => (draft.value = e.currentTarget.value)}
      />
    </label>
  )
}
```

Often you don't need a box at all: `let name = props.name` gives you a writable local that resets in the same way.
Reach for `state.linked` when you need a box to pass on or to watch. If you really want a copy that never follows the
prop, say so with `untrack(() => props.name)`.

## Computing from a prop

A value worked out from a prop in the body is worked out once:

<!-- example: skip deliberately wrong: reports W001 -->
```tsx
export function Price(props: { dollars: number }) {
  // W001: read once, when Price was set up.
  const cents = props.dollars * 100
  return <span>{cents}¢</span>
}
```

The compiler reports **W001** and offers a fix that makes it `derived`. Compute in the markup if only the markup needs
it, or with `derived` if other code reads it too:

```tsx
import { derived } from '@weft-js/core'

export function Price(props: { dollars: number }) {
  const { dollars } = props
  const cents = derived(() => Math.round(dollars * 100))
  return (
    <span title={`${cents.value} cents`}>
      ${dollars.toFixed(2)}
    </span>
  )
}
```

The rule to remember: `const x = props.y` names a prop and stays live. Anything that does more than name it (arithmetic,
`??`, a call) belongs in `derived`, JSX, `watch` or a handler.

## Passing a box

Usually you pass a value: `count={count.value}`. The child reads it, and it stays current. Pass the box itself
(`value={coupon}`) only in two cases:

1. **The child must write it**, and you want that visible in the child's type. The child types the prop as
   `State<T>` and reads and writes `.value`. (For most cases `bind:` is the lighter way.)
2. **A list row reads one entry of a shared object**: passing the box lets each row read `cart.get(id)` and re-run alone.
   [Rendering lists](/learn/rendering-lists) explains this one.

```tsx
import { state, type State } from '@weft-js/core'

function CouponField(props: { value: State<string | null> }) {
  return (
    <input
      aria-label="Coupon"
      value={props.value.value ?? ''}
      onInput={e =>
        (props.value.value = e.currentTarget.value || null)
      }
    />
  )
}

export function Checkout() {
  const coupon = state<string | null>(null)
  return (
    <>
      <CouponField value={coupon} />
      <p>{coupon.value ? `Using ${coupon.value}` : 'No coupon'}</p>
    </>
  )
}
```

Passing a box where a value is expected, or a value where a box is expected, is **W008**: the fix is `count.value` or
`count`.

## Prop types

You can write prop types yourself, as every example on this page does. You can also leave a component's props
unannotated: Weft infers them from the places that use the component and from what its body does with them, in the
editor, in `weft check` and in `weft tsc`.

```tsx
import { derived } from '@weft-js/core'

function Row(props) {
  const { label, onPick } = props
  const upper = derived(() => label.toUpperCase())
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
      >
        {upper.value}
      </button>
    </li>
  )
}

export default function List() {
  return (
    <ul>
      <Row
        label="One"
        onPick={() => console.log('picked one')}
      />
    </ul>
  )
}
```

`Row` gets `{ label: string; onPick: () => void }` from its one caller. A few rules keep this honest:

- An **exported** component writes its type down (**W081**), because any file may import it. `weft dev` and `weft fix`
  write the inferred type with an `/*inferred*/` comment, and **W082** tells you when callers have moved on.
- A component with **no caller** has nothing to infer from (**W080**): render it, delete it, or annotate it.
- When one caller passes a type the body can't handle, **W084** points at that caller.
- Plain `tsc` can't infer these and reports `TS7006`. Run `weft tsc` in CI instead.

To name another component's props, use `Props<typeof X>`:

```tsx
import type { Props } from '@weft-js/core'
import { Button } from '@weft-js/warp'

type ButtonProps = Props<typeof Button>

export function SaveButton(props: ButtonProps) {
  return <Button {...props}>Save</Button>
}
```

The full table of what inference covers is in [Props](/reference/props).

## Recap

- Pass props as attributes; read them as `props.x` or destructure one level in the parameter list.
- Props are always current: the compiler makes each one a live read, so the child never needs to run again.
- `size = 100` in the pattern is a default, applied whenever the prop is `undefined`.
- `{...props}` forwards; `({ a, ...rest })` gives a live rest to spread on an element.
- Nested markup arrives as `children`.
- `const x = props.y` is a live read-only alias. `let x = props.y` and `props.y =` write locally, until the parent's
  value next changes. Only `bind:` at the call site sends a write to the parent.
- Not `state(prop)` (W005) but `state.linked(() => prop)`; not a computation in the body (W001) but `derived` or JSX.
- Pass `.value` unless the child must write the box or read one entry of it.

## Try it

:::challenge Show the tip too
In the first demo, give `Price` a second use in `Tip` that shows a 15% tip on the whole bill.
:::solution
```tsx
<p>Tip <Price dollars={bill.value * 0.15} /></p>
```
Compute in the parent's markup: the expression is worked out again when `bill` changes, and `Price` reads the new number.
:::

:::challenge Extract a component
This gallery repeats the same markup for each scientist. Extract a `Profile` component that takes `name`, `imageId` and
`awards` as props, and use it twice.

```tsx
export default function Gallery() {
  return (
    <div>
      <section>
        <h2>Maria Skłodowska-Curie</h2>
        <img
          src="https://i.imgur.com/szV5sdGs.jpg"
          alt="Maria Skłodowska-Curie"
        />
        <p>Awards: 4</p>
      </section>
      <section>
        <h2>Katsuko Saruhashi</h2>
        <img
          src="https://i.imgur.com/YfeOqp2s.jpg"
          alt="Katsuko Saruhashi"
        />
        <p>Awards: 2</p>
      </section>
    </div>
  )
}
```
:::solution
```tsx
function Profile({
  name,
  imageId,
  awards,
}: {
  name: string
  imageId: string
  awards: number
}) {
  return (
    <section>
      <h2>{name}</h2>
      <img src={`https://i.imgur.com/${imageId}s.jpg`} alt={name} />
      <p>Awards: {awards}</p>
    </section>
  )
}

export default function Gallery() {
  return (
    <div>
      <Profile
        name="Maria Skłodowska-Curie"
        imageId="szV5sdGs"
        awards={4}
      />
      <Profile
        name="Katsuko Saruhashi"
        imageId="YfeOqp2s"
        awards={2}
      />
    </div>
  )
}
```
Each `Profile` reads its own props. Destructuring keeps them live, so if a parent later passed `awards` from state, the
number would follow.
:::

:::challenge Fix the stale label
`Line` should show the quantity with "item" or "items", but after the parent's count changes the word is wrong. The
compiler also reports W001. Fix it.

<!-- example: skip the starting point, which reports W001 -->
```tsx
export function Line(props: { qty: number }) {
  const word = props.qty === 1 ? 'item' : 'items'
  return <p>{props.qty} {word}</p>
}
```
:::solution
`const word = …` does more than name a prop, so it's worked out once. Move the expression into the markup, or into
`derived`:

```tsx
export function Line(props: { qty: number }) {
  return (
    <p>
      {props.qty} {props.qty === 1 ? 'item' : 'items'}
    </p>
  )
}
```
:::

:::challenge Let the parent decide
`Rating` lets the reader pick a score with `let`. Make the parent's `score` box follow the pick, without changing
`Rating` at all.

```tsx
import { state } from '@weft-js/core'

function Rating(props: { value?: number }) {
  let { value = 0 } = props
  return (
    <p>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          type="button"
          key={n}
          aria-pressed={n <= value}
          onClick={() => (value = n)}
        >
          {n}
        </button>
      ))}
    </p>
  )
}

export default function Review() {
  const score = state(3)
  return (
    <>
      <Rating value={score.value} />
      <p>Saved score: {score.value}</p>
    </>
  )
}
```
:::solution
Bind the prop at the call site. `Rating` still writes `value` locally; with `bind:` that write goes into `score`.

```tsx
import { state } from '@weft-js/core'

function Rating(props: { value?: number }) {
  let { value = 0 } = props
  return (
    <p>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          type="button"
          key={n}
          aria-pressed={n <= value}
          onClick={() => (value = n)}
        >
          {n}
        </button>
      ))}
    </p>
  )
}

export default function Review() {
  const score = state(3)
  return (
    <>
      <Rating bind:value={score} />
      <p>Saved score: {score.value}</p>
    </>
  )
}
```
Without `bind:`, the write stays in `Rating`, and "Saved score" never moves.
:::
