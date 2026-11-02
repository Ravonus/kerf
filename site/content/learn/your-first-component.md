# Your first component

:::learn
- What a weft component is
- How TSX turns into the page
- Why a component body runs only once
:::

A component is a function that returns TSX. You write it the way you would in React: plain functions, plain JSX, props as
an argument. Here `Greeting` is used twice, with different props each time.

:::demo hello

## TSX is HTML with expressions

Inside TSX, curly braces hold any JavaScript expression: `{props.name}`, a ternary, a call. Attributes take expressions
the same way. Both `class` and `className` work, and so do React's camelCase names such as `tabIndex` and `htmlFor`.

```tsx
<p class="greeting">Hello, {props.name}.</p>
```

A component's name starts with a capital letter, so `<Greeting />` is your component and `<p>` is the HTML tag.

## The body runs once

This is the one big difference from React. weft calls a component function once, when it first appears. It never calls it
again. When a value changes later, the compiler has already wired each `{expression}` and attribute to the DOM node it
fills, so only that node is written.

So there are no hook rules and no dependency lists. It also means code in the body that computes something runs only
once. Work out values in JSX, or with `derived` (see [Derived values](/learn/derived)), and the compiler stops you with
**W001** if you compute in the body.

## Export it

A component in its own file is an ordinary export. A route's page is the file's `export default`:

```tsx
// src/routes/index.tsx
import { Greeting } from '../components/Greeting'

export default function Home() {
  return <Greeting name="Ana" visits={1} />
}
```

## Recap

- A component is a function that returns TSX, called once.
- `{expressions}` and attributes in TSX stay up to date by themselves.
- Compute in JSX or `derived`, not in the body.

## Try it

:::challenge Add a third greeting
Add a `Greeting` for Cy, on their second visit.
:::solution
```tsx
<Greeting name="Cy" visits={2} />
```
`visits` is more than 1, so it reads "Visit 2."
:::
