# JavaScript in TSX with braces

:::learn
- How to pass strings with quotes
- How to put a JavaScript value or expression in markup with braces
- Where braces can go, and what "double braces" are
- Why a `.value` read inside braces stays up to date by itself
:::

TSX lets you write markup in a JavaScript file, and braces let you reach back into JavaScript from the markup: to show a
variable, call a function, or pick a class. In Weft, braces do one more thing. An expression in braces is live: when
something it reads changes, it is worked out again and only that spot in the page is written.

:::demo describe-braces

## Passing strings with quotes

To pass a fixed string as an attribute, put it in single or double quotes, as in HTML:

```tsx
export function Avatar() {
  return <img
    class="avatar"
    src="https://i.imgur.com/7vQD0fPs.jpg"
    alt="Gregorio Y. Zara"
  />
}
```

To pass a value from JavaScript instead, replace the quotes with braces:

```tsx
export function Avatar() {
  const avatar = 'https://i.imgur.com/7vQD0fPs.jpg'
  const description = 'Gregorio Y. Zara'
  return (
    <img
      class="avatar"
      src={avatar}
      alt={description}
    />
  )
}
```

`class="avatar"` is the string `"avatar"`. `src={avatar}` reads the variable `avatar`.

## Using braces: a window into JavaScript

Inside braces you can write any JavaScript expression: a variable, a property, arithmetic, a call.

```tsx
export function TodoList() {
  const name = 'Gregorio Y. Zara'
  return <h1>{name}'s To Do List</h1>
}
```

A function call works too. Here the heading shows today's weekday:

```tsx
const today = new Date()

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long' })
    .format(date)
}

export function Today() {
  return <h1>To do on {formatDate(today)}</h1>
}
```

### Where to use braces

Braces can go in two places in TSX:

1. **As text** inside a tag: `<h1>{name}'s To Do List</h1>` works, and `<{tag}>Gregorio</{tag}>` doesn't. A tag name
   isn't an expression.
2. **As an attribute value**, straight after `=`: `src={avatar}` reads `avatar`, while `src="{avatar}"` passes the
   string `"{avatar}"` with the braces in it.

Expressions only, not statements: braces can hold `a ? b : c`, but not `if (a) { … }`. Ways to branch are on
[Conditional rendering](/learn/conditional-rendering).

:::note What braces render
A string or a number in braces becomes text, escaped, so `{'<b>'}` shows those three characters rather than bold text.
`null`, `undefined`, `true` and `false` render nothing, which is what makes `{cond && <Tag />}` work. An array renders
each of its items in order, which is how lists work (see [Rendering lists](/learn/rendering-lists)). An element or a
component in braces renders as itself.
:::

## Double braces: objects in markup

Objects in JavaScript are written with braces too, such as `{ name: 'Hedy Lamarr', inventions: 5 }`. To pass an object
in TSX, put it inside another pair of braces: `person={{ name: 'Hedy Lamarr', inventions: 5 }}`. The outer pair says
"JavaScript here", and the inner pair is the object.

You'll see this most with `style`:

```tsx
export function TodoList() {
  return (
    <ul style={{
      background: 'var(--warp-color-surface-raised)',
      color: 'var(--warp-color-accent-text)',
    }}>
      <li>Improve the videophone</li>
      <li>Prepare aeronautics lectures</li>
      <li>Work on the alcohol-fuelled engine</li>
    </ul>
  )
}
```

There's nothing special about it: `{{` and `}}` are an object inside braces. In Weft, `style` also takes a plain string
(`style="padding: 0"`), so you only need the object form when the values come from JavaScript.

:::pitfall CSS names in the object
In a style object, write property names in camelCase: `backgroundColor`, not `background-color`, because a key with a
dash needs quotes in JavaScript. Weft also accepts the dashed name in quotes, `{ 'background-color': … }`, and custom
properties such as `{ '--gap': '8px' }`. A number means pixels unless the property has no unit (`opacity`, `zIndex`,
`lineHeight`), as in React.
:::

## More fun with objects and braces

You can keep several values in one object and read them from it in your markup:

```tsx
const person = {
  name: 'Gregorio Y. Zara',
  theme: {
    background: 'var(--warp-color-surface-raised)',
    color: 'var(--warp-color-accent-text)',
  },
}

export function TodoList() {
  return (
    <div style={person.theme}>
      <h1>{person.name}'s Todos</h1>
      <ul>
        <li>Improve the videophone</li>
        <li>Prepare aeronautics lectures</li>
      </ul>
    </div>
  )
}
```

`style={person.theme}` passes an object already made, so there's one pair of braces. `{person.name}` reads a string.

## Braces are live

So far every value has been fixed. Here's the difference Weft makes: when an expression in braces reads a piece of state
(a box, read with `.value`) or a prop, the compiler turns that spot in the page into a binding. The binding remembers what
it read, and runs again when one of those values changes.

```tsx
import { state } from '@weft-js/core'

export function Counter() {
  const count = state(0)
  return (
    <button
      type="button"
      onClick={() => count.value++}
      title={`Clicked ${count.value} times`}
    >
      Clicked {count.value} times
    </button>
  )
}
```

The button's text and its `title` both read `count.value`. Each click changes `count`, and those two bindings run
again: one writes the text node, the other the attribute. The `Counter` function doesn't run again, and nothing else on
the page is touched. In the demo at the top of the page, dragging the slider writes the list's `font-size` and nothing
more.

This is true of every brace in TSX: a text hole, an attribute, a style object, a class object, a prop you pass to a
child. There is no list of dependencies to keep up to date: whatever an expression reads while it runs is what it
follows, and that can differ from one run to the next. `{loggedIn.value ? user.value.name : 'Guest'}` follows `user`
only while someone is logged in.

:::pitfall Read `.value` in the braces, not before them
The body of a component runs once, so a value read there is read once. This shows `0` for ever, and the compiler
stops you with **W001**:

<!-- example: skip deliberately wrong: reports W001 -->
```tsx
export function Counter() {
  const count = state(0)
  // Read once, when the component is set up.
  const text = `Clicked ${count.value} times`
  return <button onClick={() => count.value++}>{text}</button>
}
```

Put the read inside the braces, or make the value `derived` if other code needs it too:

```tsx
import { derived, state } from '@weft-js/core'

export function Counter() {
  const count = state(0)
  const text = derived(() => `Clicked ${count.value} times`)
  return (
    <button type="button" onClick={() => count.value++}>
      {text.value}
    </button>
  )
}
```

The same goes for the box itself: `{count}` without `.value` would render the box, not the number, and the compiler
reports that as **W015**.
:::

:::deepdive How big is a binding?
Each brace that can change gets its own binding, so the unit of update is one expression, not one component. A
component with twenty holes and one that changes does one piece of work per change. Braces that can't change, such as a
string, a number or a module-level constant, cost nothing: the compiler writes them into the HTML template at build
time.

A binding over a conditional is a little smarter. In `{count.value > 0 && <Badge />}` the condition is tracked on its
own, so when `count` goes from 3 to 4 the condition is still `true` and the badge isn't rebuilt. Only a change of the
condition's result swaps what's shown. [Conditional rendering](/learn/conditional-rendering) shows why that matters.
:::

## Recap

- Quotes pass a fixed string: `class="avatar"`. Braces pass JavaScript: `src={avatar}`.
- Braces go inside a tag's content or straight after `=` in an attribute, and hold expressions, not statements.
- `{{ … }}` is an object inside braces, most often for `style`.
- An expression in braces that reads `.value` or a prop is live: it runs again when what it read changes, and only its
  own spot in the page is written.
- Read state inside the braces or in `derived`, not in the component body (W001), and don't forget `.value` (W015).

## Try it

:::challenge Fix the mistake
This code is meant to show "Gregorio Y. Zara's Todos" in a heading, but it shows "[object Object]'s Todos". Find the
problem.

<!-- example: skip the starting point, deliberately broken -->
```tsx
const person = {
  name: 'Gregorio Y. Zara',
  theme: { color: 'var(--warp-color-accent-text)' },
}

export default function TodoList() {
  return (
    <div style={person.theme}>
      <h1>{person}'s Todos</h1>
    </div>
  )
}
```
:::solution
`{person}` renders the whole object, and an object turned into text is `[object Object]`. Render one of its fields:

```tsx
const person = {
  name: 'Gregorio Y. Zara',
  theme: { color: 'var(--warp-color-accent-text)' },
}

export default function TodoList() {
  return (
    <div style={person.theme}>
      <h1>{person.name}'s Todos</h1>
    </div>
  )
}
```
:::

:::challenge Move the information into an object
The image URL is written into the markup. Move it into the `person` object as `imageUrl`, and read it from there.

```tsx
const person = { name: 'Gregorio Y. Zara' }

export default function Avatar() {
  return <img
    class="avatar"
    src="https://i.imgur.com/7vQD0fPs.jpg"
    alt={person.name}
  />
}
```
:::solution
```tsx
const person = {
  name: 'Gregorio Y. Zara',
  imageUrl: 'https://i.imgur.com/7vQD0fPs.jpg',
}

export default function Avatar() {
  return <img
    class="avatar"
    src={person.imageUrl}
    alt={person.name}
  />
}
```
:::

:::challenge Write an expression inside braces
Build the image URL from parts: a base URL, the `imageId`, then the size `s` and `.jpg`. Do it inside the braces.

<!-- example: skip the starting point for the solution below -->
```tsx
const baseUrl = 'https://i.imgur.com/'
const person = {
  name: 'Gregorio Y. Zara', imageId: '7vQD0fP', imageSize: 's',
}

export default function Avatar() {
  return <img
    class="avatar"
    src="https://i.imgur.com/7vQD0fPs.jpg"
    alt={person.name}
  />
}
```
:::solution
```tsx
const baseUrl = 'https://i.imgur.com/'
const person = {
  name: 'Gregorio Y. Zara', imageId: '7vQD0fP', imageSize: 's',
}

export default function Avatar() {
  return (
    <img
      class="avatar"
      src={baseUrl + person.imageId + person.imageSize + '.jpg'}
      alt={person.name}
    />
  )
}
```
A template literal works as well: ``src={`${baseUrl}${person.imageId}${person.imageSize}.jpg`}``.
:::

:::challenge Make the size live
Add a `big` box to the avatar. When it's `true` the image URL should use size `b` instead of `s`, and a button should
flip it. The image must follow without the component running again.
:::solution
```tsx
import { state } from '@weft-js/core'

const person = { name: 'Gregorio Y. Zara', imageId: '7vQD0fP' }

export default function Avatar() {
  const big = state(false)
  return (
    <>
      <img
        src={`https://i.imgur.com/${person.imageId}${
          big.value ? 'b' : 's'
        }.jpg`}
        alt={person.name}
      />
      <button type="button" onClick={() => (big.value = !big.value)}>
        {big.value ? 'Smaller' : 'Bigger'}
      </button>
    </>
  )
}
```
The `src` expression reads `big.value`, so it's a binding: each click writes the attribute, and `Avatar` doesn't run
again.
:::
