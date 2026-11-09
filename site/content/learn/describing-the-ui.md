# Describing the UI

:::learn
- How to write your first Weft component
- When and how to split components into files
- How to add markup to JavaScript with TSX, and JavaScript to markup with braces
- How to configure components with props, and show things conditionally or as lists
- Why a Weft component runs only once, and how to picture your UI as a tree
:::

Weft is a TypeScript framework for building user interfaces. A user interface is made of small pieces, such as buttons,
text and images, and Weft lets you combine them into reusable, nestable components. From web sites to apps, everything
on the screen can be broken down into components. In this chapter you'll learn to write, configure and show Weft
components. If you know React, most of this will look familiar, with one important difference, which has a page of its
own: a Weft component runs once.

## Your first component

A Weft app is built from isolated pieces of UI called components. A component is a TypeScript function whose name
starts with a capital letter and which returns markup. Components can be as small as a button or as large as a page.
Here `Gallery` renders three `Profile` components:

:::demo describe-gallery

Read **[Your first component](/learn/your-first-component)** to learn how to define and use components, and what
Weft's compiler does with them.

## Importing and exporting components

You can declare many components in one file, but large files get hard to navigate. To fix that, export a component into
its own file, and import it from another:

```tsx
// src/components/Scientist.tsx
export function Scientist() {
  return <p>Katherine Johnson, mathematician</p>
}
```

```tsx
// src/routes/hall-of-fame.tsx
import { Scientist } from '#/components/Scientist'

export default function HallOfFame() {
  return (
    <section>
      <h1>Amazing scientists</h1>
      <Scientist />
      <Scientist />
    </section>
  )
}
```

Read **[Importing and exporting components](/learn/importing-and-exporting)** to learn how to split components into
their own files, and what Weft's tools look for in your exports.

## Writing markup with TSX

Each component is a function that may contain markup the browser shows. That markup is TSX: an HTML-like syntax inside
TypeScript. It's stricter than HTML: there's one root, and every tag is closed. Weft accepts HTML's attribute names and
React's, so `class` and `className` both work:

:::demo describe-markup

Read **[Writing markup with TSX](/learn/writing-markup-with-tsx)** to learn how to write valid markup, convert HTML to
TSX, and use the attributes Weft adds, such as `ref`.

## JavaScript in TSX with braces

Braces open a window from markup back into JavaScript. Use them to show a variable, call a function, or pass an object.
In Weft, braces are also live: an expression in braces that reads state runs again, by itself, when that state changes.
Drag the slider and only the list's font size is written:

:::demo describe-braces

Read **[JavaScript in TSX with braces](/learn/javascript-in-tsx)** to learn where braces go, what double braces are,
and why a `.value` read inside braces stays up to date.

## Passing props to a component

Components use props to talk to each other. A parent passes information to its children as props, which look like
HTML attributes but can hold any value: objects, arrays, functions, and markup as `children`. In Weft, props are never
stale: the child runs once, and every read of a prop gets the parent's current value.

:::demo props

Read **[Passing props](/learn/passing-props)** to learn how to pass and read props, and the rules for writing them:
`const` is a live alias, `let` writes locally, and only `bind:` writes back to the parent.

## Conditional rendering

Your components will often show different things in different situations. In Weft you use JavaScript's `? :` and `&&`
inside the markup, where they stay live. Because the body runs once, an `if` with an early `return` would only check
once, so the compiler asks you to branch in the markup instead:

:::demo describe-packing

Read **[Conditional rendering](/learn/conditional-rendering)** to learn the ways to show things conditionally, and what
happens to the markup and its state when a condition flips.

## Rendering lists

You'll often show several components from a collection of data. Use `filter` and `map` in the markup, and give each row
a `key` that identifies its item, so Weft can move rows instead of rebuilding them when the list changes:

:::demo describe-people

Read **[Rendering lists](/learn/rendering-lists)** to learn how to render lists, where keys come from, and how to keep
large lists fast.

## Components run once

This is the idea that makes Weft different from React. A React component runs again on every change. A Weft component
runs once: its body sets things up, and the compiler wires each expression in its markup straight to the DOM node it
fills. A change runs only the bindings that read it. So there are no hook rules, no dependency arrays and no `memo`,
and a local variable lives as long as the component:

:::demo describe-runs

Read **[Components run once](/learn/components-run-once)** to learn the mental model, what it means for your code, and
the mistakes the compiler catches.

## Your UI as a tree

Weft sees your app as trees. The render tree is your components nested inside each other. The ownership tree has the
same shape and decides what is cleaned up when part of the page goes away. The module tree is your imports, and Weft
reads it to decide which components need JavaScript in the browser at all:

:::demo describe-tree

Read **[Your UI as a tree](/learn/your-ui-as-a-tree)** to learn how these trees work and how islands and hydration
follow from them.

## What's next

Head to [Your first component](/learn/your-first-component) to start reading this chapter page by page. Or, if you're
already comfortable with these topics, read about [Adding interactivity](/learn/adding-interactivity).
