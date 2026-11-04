# Your first component

:::learn
- What a component is, and what it's for
- How to write one, and how to use it inside another
- Why a component's body runs only once, and what that changes
- What the compiler does with the TSX you write
:::

Components are the pieces you build a weft interface from. A button, a product card, a whole page: each is a component,
and bigger components are made of smaller ones. If you've written React, you already know how they look, because a weft
component is the same thing on the surface: a function that returns TSX. What happens underneath is different, and this
page shows you both.

:::demo hello

## Components: pieces of UI you can reuse

On the web, HTML gives you tags such as `<article>`, `<h1>` and `<ul>` to build a page from:

```html
<article>
  <h1>My first component</h1>
  <ol>
    <li>Components: UI building blocks</li>
    <li>Defining a component</li>
    <li>Using a component</li>
  </ol>
</article>
```

That markup is a page's structure: the article, its heading, a short table of contents. As a site grows, the same
structures appear again and again: a card for every product, a row for every message, the same header on every page. A
component lets you write a piece of markup once, with the logic that belongs to it, give it a name, and use it wherever
you need it.

You can mix your own components with plain HTML tags and with components other people wrote. weft comes with
[warp](/learn/warp), a set of ready components such as `Button`, `Card` and `Input`, and the demos on these pages use them
alongside plain tags.

## Defining a component

A component is a JavaScript function whose name starts with a capital letter and which returns markup. Here is one:

```tsx
export default function Profile() {
  return (
    <img
      src="https://i.imgur.com/MK3eW3As.jpg"
      alt="Katherine Johnson"
    />
  )
}
```

You build it in three steps.

### Step 1: Export the component

`export default` makes the function the file's main export, so another file can import it. A route file in
`src/routes` must export its page this way. The next page,
[Importing and exporting components](/learn/importing-and-exporting), covers exports in full.

### Step 2: Define the function

`function Profile() { }` defines a function called `Profile`.

:::pitfall Capitalise the name
A component's name must start with a capital letter. In TSX, `<profile />` means an HTML tag called `profile`, and
`<Profile />` means your function. The weft compiler uses the same rule to find components in a file: it treats a
function whose name starts with a capital letter as a component, and gives its props and body the handling the rest of
this chapter describes.
:::

### Step 3: Add the markup

The function returns `<img />` with `src` and `alt` attributes. It looks like HTML, but it is TSX: markup inside
TypeScript. The return can fit on one line, or span several inside parentheses:

```tsx
export default function Profile() {
  return (
    <div>
      <img
        src="https://i.imgur.com/MK3eW3As.jpg"
        alt="Katherine Johnson"
      />
    </div>
  )
}
```

:::pitfall Parentheses around multi-line markup
Without the parentheses, a `return` followed by a line break returns nothing: JavaScript ends the statement at the
line break and ignores what follows. Put the opening `(` on the same line as `return`.
:::

## Using a component

Once `Profile` exists, other components can use it. Here `Gallery` uses it three times, with a different name and field
each time. Values you hand a component like this are called props, and [Passing props](/learn/passing-props) covers them.

:::demo describe-gallery

### What the browser sees

Notice the difference in case:

- `<figure>` and `<strong>` are lowercase, so they are HTML tags.
- `<Profile />` starts with a capital `P`, so it is the `Profile` component.

`Profile` itself contains more HTML: a `<figure>`, a `<span>`, a `<figcaption>`. In the end the browser sees only HTML
elements. There is no `<Profile>` element in the page; the component has done its work and left its markup behind.

### Nesting and organising components

Components are ordinary functions, so you can keep several in one file. That's handy while they are small and related.
When a file gets crowded, move a component to its own file and import it. Because `Profile` is used inside `Gallery`,
`Gallery` is called the parent and `Profile` the child: this parent and child relationship is the shape of your UI, and
[Your UI as a tree](/learn/your-ui-as-a-tree) looks at it closely.

:::pitfall Define components at the top level
Write every component at the top level of a module. Don't define one inside another:

<!-- example: skip deliberately the wrong way round, to show the mistake -->
```tsx
export default function Gallery() {
  // Don't: a component defined inside another
  function Profile() {
    return <p>Katherine Johnson</p>
  }
  return <Profile />
}
```

In React this is slow and buggy because the inner function is a new component type on every render. In weft the outer
body runs only once, so it wouldn't be redefined, but it still hides `Profile` from the rest of the file, from hot
reload (which swaps top-level components by name) and from the analysis that decides which parts of a page need
JavaScript in the browser. Move it out, and pass it what it needs as props:

```tsx
function Profile() {
  return <p>Katherine Johnson</p>
}

export default function Gallery() {
  return <Profile />
}
```
:::

## TSX is markup with expressions

Inside TSX, curly braces open a window back into JavaScript. Any expression can go there: `{props.name}`, a ternary, a
function call. Attributes take expressions the same way:

```tsx
export function Greeting(props: { name: string }) {
  return <p class="greeting">Hello, {props.name}.</p>
}
```

Both `class` and `className` work, and so do React's camelCase names such as `tabIndex` and `htmlFor`. The rules of TSX
have their own page, [Writing markup with TSX](/learn/writing-markup-with-tsx), and braces get theirs in
[JavaScript in TSX with braces](/learn/javascript-in-tsx).

## The body runs once

This is the one big difference from React. weft calls a component function once, when that part of the page first
appears, and never calls it again. When a value changes later, nothing re-renders: the compiler has already wired each
`{expression}` and each attribute to the DOM node it fills, so that one node is written and nothing else runs.

That's why there are no hook rules and no dependency arrays in weft. Code in the body runs once, top to bottom, and sets
things up. The live parts are the expressions in your markup, plus anything you put in `derived` or `watch`.

It also means that a value computed in the body is computed once:

```tsx
import { derived } from '@weft-js/core'

export function Total(
  { price, qty }: { price: number; qty: number },
) {
  // const total = price * qty runs once: W001.
  const total = derived(() => price * qty)
  return <p>Total: {total.value}</p>
}
```

Work values out in the markup itself (`{price * qty}`) or with `derived` (see
[Derived values](/learn/derived)). If you compute from a prop or a piece of state in the body, the compiler stops you with
**W001** and offers the `derived` version as a fix. [Components run once](/learn/components-run-once) is the page on this
idea, with the mistakes it catches.

:::deepdive What the compiler does with a component
weft compiles each `.tsx` file ahead of time with its own compiler (written in Rust, and shipped as WebAssembly too, so
you never need Rust installed). For a component it does roughly this:

1. The static markup becomes an HTML template, parsed by the browser once and cloned for each use. Cloning a template is
   far cheaper than building elements one at a time.
2. Each `{expression}` in the markup becomes a small binding attached to the exact text node or attribute it fills.
   The binding records what it read (`props.name`, `count.value`) and runs again when one of those changes.
3. Each prop you pass becomes a getter on the props object, unless it is a plain literal.
   `<Price dollars={bill.value / 2} />` hands `Price` an object whose `dollars` works out `bill.value / 2` when it's read, so `Price` sees the new value
   without running again.
4. The component itself is called once, with nothing tracked while it runs. Reads in the body don't subscribe the body
   to anything, which is why a read there can't update and why the compiler flags it.

React does the opposite: it calls your component again on every change, compares the new markup with the old, and
writes the difference. Both give you a page that follows your data. weft gets there without running your component
again or comparing anything, so an update costs the same however big the component is.
:::

## Recap

- A component is a function whose name starts with a capital letter and which returns TSX.
- Use it as a tag, `<Profile />`, inside other components. Define every component at the top level of a file.
- `export default` makes it the file's main export, and a route file in `src/routes` exports its page that way.
- The body runs once. `{expressions}` and attributes in TSX stay up to date by themselves.
- Compute in the markup or with `derived`, not in the body (W001).

## Try it

:::challenge Add a third greeting
In the first demo on this page, add a `Greeting` for Cy, on their second visit.
:::solution
```tsx
<Greeting name="Cy" visits={2} />
```
`visits` is more than 1, so it reads "Visit 2."
:::

:::challenge Export the component
This file defines a component but nothing else can use it, and a route file must export its page. Fix it.

<!-- example: skip the starting point, deliberately missing its export -->
```tsx
function Profile() {
  return (
    <img
      src="https://i.imgur.com/lICfvbD.jpg"
      alt="Aklilu Lemma"
    />
  )
}
```
:::solution
```tsx
export default function Profile() {
  return (
    <img
      src="https://i.imgur.com/lICfvbD.jpg"
      alt="Aklilu Lemma"
    />
  )
}
```
`export default` makes `Profile` the file's main export, so another file can write `import Profile from './Profile'`.
:::

:::challenge Fix the return statement
This component shows nothing. Why?

<!-- example: skip the starting point, deliberately broken -->
```tsx
export default function Profile() {
  return
    <img
      src="https://i.imgur.com/jA8hHMpm.jpg"
      alt="Katsuko Saruhashi"
    />
}
```
:::solution
JavaScript ends a `return` at the line break, so the function returns `undefined` and the `<img>` below is never
reached. Keep the markup on the `return` line, or wrap it in parentheses that open on that line:

```tsx
export default function Profile() {
  return (
    <img
      src="https://i.imgur.com/jA8hHMpm.jpg"
      alt="Katsuko Saruhashi"
    />
  )
}
```
:::

:::challenge Your own component
Write a `Congratulations` component from scratch that shows an `<h1>` saying "Good job!", and export it.
:::solution
```tsx
export default function Congratulations() {
  return <h1>Good job!</h1>
}
```
:::
