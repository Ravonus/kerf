# Quick start

:::learn
- How to create and nest components
- How to write markup with TSX, add styles and display data
- How to show things conditionally and render lists
- How to respond to events and keep state in a box
- How to compute values, share data between components, and call the server
:::

Welcome to Weft. This page is a tour of the ideas you will use every day: about four fifths of what you need to build
an app. Each section has a small live example, and its source beside it is the real code that runs. Every section ends
with a link to the page that goes deeper, so you can stop at anything that looks new.

If you have written React, most of this will read right straight away. The differences are few, and they are worth
watching for: a component runs **once**, state is a **box** you read and write through `.value`, and values you compute
from state are **derived**. Those three ideas carry most of what makes Weft different.

:::note Running the examples on your own machine
`npm create @weft-js my-app` makes an app, and `npx weft dev` runs it. [Installation](/learn/installation) has every
option. You don't need an app to read this page: the examples run right here.
:::

## Creating and nesting components

A Weft app is made of components. A component is a piece of the page with its own markup and logic: as small as a
button, or as large as a whole screen.

A component is a JavaScript function that returns markup:

```tsx
import { Button } from '@weft-js/warp'

export function OrderButton() {
  return <Button>Order a coffee</Button>
}
```

Once you have declared `OrderButton`, you can put it inside another component:

:::demo start-components

`<OrderButton />` starts with a capital letter. That is how you tell a component of your own from an HTML tag such as
`<p>`, which is always lower case. The page shows `OrderButton` twice because the markup uses it twice: each use is a
separate copy.

`Button` and `Card` here come from **warp**, Weft's UI toolkit. They are ordinary components too, written the same way
as yours. A new app starts with Warp unless you choose otherwise.

The `export default` in front of `Cafe` marks the file's main component. In a Weft app, the default export of a file in
`src/routes` is a page. [Your first component](/learn/your-first-component) and
[Importing and exporting components](/learn/importing-and-exporting) go further.

## Writing markup with TSX

The markup above is **TSX**: TypeScript with HTML-like tags in it. It looks like HTML, and most HTML you paste works,
but it is a little stricter. You close every tag, including ones like `<br />`. A component returns one thing, so to
return several elements side by side, wrap them in a parent or in an empty `<>…</>` wrapper, a *fragment*:

```tsx
export function About() {
  return (
    <>
      <h1>About the café</h1>
      <p>
        We roast on Mondays.
        <br />
        We pour every day.
      </p>
    </>
  )
}
```

TSX in Weft is close to HTML in its attribute names too. `class` works, and so does React's `className`; `for` works, and
so does `htmlFor`. You can copy markup from a web page or from a React component and it will usually work as is.

Read [Writing markup with TSX](/learn/writing-markup-with-tsx) for the rest of the rules.

## Adding styles

You give an element a CSS class with `class`, and write the rules for it in a CSS file that the component imports:

<!-- example: skip imports a CSS file the example doesn't create -->
```tsx
import './menu.css'

export function Title() {
  return <h2 class="menu-title">Today's menu</h2>
}
```

For one-off values, `style` takes an object. Names are camelCase or kebab-case, and a number becomes pixels unless the
property has no unit, the same as in React. The braces around it are explained under [Displaying data](#displaying-data):

:::demo start-styles

The colour in that border is a Warp token, `var(--warp-color-accent-solid)`, not a raw colour such as `teal`, and the
padding is a step of Warp's spacing scale, `var(--warp-space-related)`, not `12px`. A token follows the theme and dark
mode. In an app with Warp, `weft check` flags a raw colour as **D001** and spacing off the scale as **D002**, so the look
stays consistent. `Text role="title"` is Warp's way to size type: you pick a role, and the theme decides the size.

For the look of your own components, Weft has **style groups**: you name a thing and its variations, written in your
design tokens, and the markup says which variation an element is in. You don't need them on day one, but here is the
shape of one:

```tsx
import { group } from '@weft-js/core/style'

export const ticket = group('ticket', {
  base: { surface: 'raised', pad: 'group', radius: 'surface' },
  axes: {
    status: {
      open: { tone: 'info' },
      late: { tone: 'critical' },
    },
  },
  defaults: { status: 'open' },
})

export function Ticket(
  { status, number }: { status: 'open' | 'late'; number: string },
) {
  return (
    <article {...ticket({ status })}>Order {number}</article>
  )
}
```

Most of the time you won't style a button or a field at all: Warp's components come with their look, their keyboard
support and their themes. You choose among them with props such as `tone` and `emphasis`, as the demo does.

Read [Styling and style groups](/learn/styling) and [Using Warp](/learn/warp) for more.

## Displaying data

Curly braces let you step out of markup and back into JavaScript. Inside the text of an element, `{barista.name}` shows
the value. In an attribute, write braces instead of quotes: `aria-label={…}` reads a variable, where
`aria-label="…"` is a fixed string.

:::demo start-data

Anything that is a JavaScript expression goes in braces: a variable, a property, a call such as
`barista.favourite.toLowerCase()`, a sum such as `barista.size / 2`, or a template string. In
`style={{ width: barista.size }}` there is nothing special about the double braces: the outer pair says "JavaScript
here", and the inner pair is an object.

Read [JavaScript in TSX with braces](/learn/javascript-in-tsx) for more.

## Conditional rendering

There is no special syntax for conditions. You use the JavaScript you know, inside braces: a ternary (`? :`) picks one of
two things, and `&&` shows something only when the left side is true.

:::demo start-conditional

The button uses **state**, which comes a few sections down. For now, read `signedIn.value` as "whether the person is
signed in".

:::pitfall Branch in the markup, not in the body
In React you might write `if (!signedIn) return <SignIn />` at the top of a component. In Weft the body of a component
runs only once, so an early `return` that depends on state would be checked once and never again. The compiler stops
you with **W001**. Put the condition in the markup with `? :` or `&&`, where it stays live.

A number on the left of `&&` is the other trap: `{count && <Badge />}` shows `0` when the count is zero. Write
`{count > 0 && <Badge />}` (**W011**).
:::

Read [Conditional rendering](/learn/conditional-rendering) for more.

## Rendering lists

To show a list, you `.map` an array to elements, as in React:

:::demo start-list

Each item gets a `key`: a string or number that tells it apart from its neighbours. Usually it is an id from your data.
Weft uses the key to keep each row when the list changes, so when items are added, removed or reordered, rows move
instead of being rebuilt, and anything inside a row, such as a ticked box or half-typed text, stays with it. Leaving out
the key on a list of objects is **W010**.

Read [Rendering lists](/learn/rendering-lists) for more.

## Responding to events

You respond to events by passing a function, a *handler*, to an attribute such as `onClick`:

:::demo start-events

Write `onClick={ring}`, not `onClick={ring()}`. You pass the function, and Weft calls it when the button is pressed. A
short handler can be written in place, as the second button does: `onClick={() => (rang.value = false)}`.

Event names are the DOM's, written in camelCase: `onClick`, `onInput`, `onKeyDown`, `onSubmit`. A handler receives the
browser's own event, and `e.currentTarget` is typed as the element it is on.

Read [Responding to events](/learn/responding-to-events) for more.

## Updating the screen

Often you want a component to remember something and show it: how many cups have been poured, say. For that, add
**state**. Import `state` from `@weft-js/core` and create a box with its first value:

```tsx
import { state } from '@weft-js/core'

export function CupCounter() {
  const cups = state(0)
  return (
    <button type="button" onClick={() => cups.value++}>
      Poured {cups.value} cups
    </button>
  )
}
```

`state(0)` makes a **box** holding `0`. You read the box with `cups.value` and write it the same way, with `=`, `++` or
any other assignment. When you write it, every place that read it updates.

:::demo start-counter

The page uses `CupCounter` twice, and each one keeps its own count. State belongs to the copy of the component that
made it.

### The component runs once

This is the one big difference from React, so it is worth slowing down for.

In React, pressing the button would call `CupCounter` again to work out the new markup. In Weft, `CupCounter` ran once,
when it first appeared, and it never runs again. While compiling, Weft saw that the text `{cups.value}` reads the box,
and wired that one text node to it. A write to `cups.value` updates that text node and nothing else.

Because the body runs once:

- There are no hook rules and no dependency lists. `state` is a plain function call.
- A plain `let` that a handler changes won't update the page, because the markup that read it was set up once. Make it
  `state`. The compiler reports it as **W041**.
- You always write `.value`, in markup too. `{cups}` without it renders the box itself, which is **W015**.

:::deepdive How is this different from useState?
`const [cups, setCups] = useState(0)` in React gives you a *snapshot*: a plain number for this render, and a setter that
schedules the next render. The component function is the unit that updates.

`const cups = state(0)` in Weft gives you the box itself. Reading `.value` inside markup subscribes that one spot in the
page; writing `.value` updates the spots that read it. The function is never the unit that updates: the reads are. So
there's nothing to memoise, no stale closure (a handler always reads the box as it is now) and no re-render to skip.

Writes are batched: if a handler writes several boxes, the page is updated once, after the handler. See
[How an update reaches the DOM](/learn/how-updates-reach-the-dom).
:::

Read [State: a box with .value](/learn/state) and [Components run once](/learn/components-run-once) for more.

## Computing values with derived

Some values can be worked out from others: a total from a quantity, a label from a count. Don't store those in state of
their own and keep them in step by hand. Say how to compute them once, with `derived`:

:::demo start-derived

`derived(() => cups.value * price)` reads `cups`, so it follows `cups`. You never list what it depends on: Weft sees what
it read. It computes when something reads it, and again only after what it read has changed.

The body runs once, so `const total = cups.value * price` in the body would be computed once and never again. The
compiler reports that as **W001** and offers `derived`. For a one-off, computing inside the markup works too:
`{cups.value * price}` stays live, as every expression in braces does.

Where React reaches for `useMemo`, Weft uses `derived`, and it's never a question of performance: it is how you name a
value that follows other values.

Read [Derived values](/learn/derived) for more.

## Sharing data between components

In the counter above, each `CupCounter` had its own count. Often you want two components to show and change the same
data. To do that, keep the state in the parent that holds both, and pass it down as **props**:

:::demo start-shared

There are two ways the data travels here.

**Down, with props.** `<CupButton cups={cups.value} />` passes the current number. The child reads it as `props.cups`,
and it stays current: when the parent's box changes, the child sees the new number, though the child never runs again.

**Up, with `bind:`.** A component may write its own props: `let { cups = 0 } = props` makes a local name you can assign
to, and `cups++` changes it. On its own, that change stays inside the child. When the parent writes
`bind:cups={cups}`, passing the box itself, the child's writes go into the parent's box. That is why the first two
buttons move together, and the sentence with them.

The third button gets `cups={cups.value}` without `bind:`. Press it: its own number changes, but the shared count
doesn't. When the shared count next changes, the parent's value wins again. Only `bind:` at the call site lets a write
leave a component, so reading the parent tells you everything that can change its state.

In React you would pass a callback such as `onIncrement` for the child to call. You can do that in Weft too, and it is
right for events that aren't "change this value". For a child that edits a value, `bind:` is shorter, and the child
works the same with or without a parent box.

Read [Passing props](/learn/passing-props), [Writing to a parent with bind:](/learn/bind) and
[Sharing state between components](/learn/sharing-state) for more.

## A peek at the server

Everything so far runs in the browser. With `@weft-js/start`, Weft's full-stack part, a component can also call code that
runs on the server. You write a **query** in `src/server/`:

```ts
// src/server/menu.ts
import { query } from '@weft-js/start'

export const listDrinks = query({
  run: () => [
    { id: 'espresso', name: 'Espresso', price: 3 },
    { id: 'latte', name: 'Latte', price: 4.5 },
  ],
})
```

and call it from a component like a function:

```tsx
// src/routes/menu.tsx
import type { Meta } from '@weft-js/start'
import { listDrinks } from '#/server/menu'

export const meta: Meta = {
  title: 'Menu',
  description: 'What the café pours today.',
}

export default function Menu() {
  const drinks = listDrinks()
  return (
    <ul>
      {(drinks.value ?? []).map(d => (
        <li key={d.id}>{d.name}, ${d.price}</li>
      ))}
    </ul>
  )
}
```

`run` never reaches the browser: the browser gets a small stub that asks the server. In a component, calling the query
gives you a **resource**, a box-like value that is `undefined` until the answer arrives, so `drinks.value ?? []` covers
the moment before. A real query reads a database through `ctx.db`, and a **mutation** writes, with its input checked by
a schema. The [tutorial](/learn/tutorial) builds both, and [Full-stack apps](/learn/full-stack) covers the rest.

## Recap

- A component is a function that returns TSX. Its name starts with a capital letter, and it runs once.
- TSX is HTML-like markup with `{expressions}` in text and attributes. `class` and `style` work as in HTML and React.
- Conditions are `? :` and `&&` in the markup; lists are `.map` with a `key`.
- Handlers are functions passed to `onClick` and its friends.
- `state(initial)` makes a box: read and write `.value`, and only what reads it updates.
- `derived(() => …)` names a value computed from others, and keeps it right.
- Props carry data down and stay current. `bind:` at the call site carries a child's writes back up.
- Queries and mutations in `src/server/` run on the server and are called like functions.

## Next steps

You now know the basics of writing Weft. Two pages put them to work:

- [Tutorial: a shop with a server](/learn/tutorial) builds a small shop step by step, then moves its data and its
  checkout to the server.
- [Thinking in Weft](/learn/thinking-in-weft) shows how to go from a mockup to components, and how to decide where
  state lives.

When you want to build on your own machine, [Installation](/learn/installation) has the steps.
