# Passing props

:::learn
- How to pass data to a component
- Why props stay current without the child running again
- The prop rules: `const`, `let`, `props.x =` and `bind:`
:::

A parent passes data to a child as props, as in React. The child reads them from its argument. Here `Tip` owns the bill
and `Price` only shows the number it is given.

:::demo props

`Price` never runs a second time, yet the number changes. The compiler turns each prop into a live read, so the parent can
write `dollars={bill.value / 2}` and the child sees the new value every time it changes.

## Reading props

Use `props.name`, or destructure in the parameter list. Both stay live:

```tsx
function Price(props: { dollars: number }) {
  return <strong>${props.dollars.toFixed(2)}</strong>
}

function Label({ text, tone = 'neutral' }: { text: string; tone?: string }) {
  return <span data-tone={tone}>{text}</span>
}
```

A default such as `tone = 'neutral'` applies whenever the prop is `undefined`. Destructure one level only: nested patterns
like `({ user: { name } })` can't stay live, and the compiler reports **W006**.

## Naming a prop: `const` and `let`

You can give a prop another name in the body. What you get depends on `const` or `let`.

:::demo alias

- **`const item = props.item`** is a live, read-only alias. Every use reads the prop as it is now. Assigning to it is
  **W001**, which tells you to use `let` or `props.x =`.
- **`let qty = props.qty`** is a writable local alias. The child can change it, and it holds until the parent's value next
  changes. Then the parent wins.
- **`props.qty = 2`** works the same as writing a `let` alias.

None of these writes reaches the parent. The next page, [Writing to a parent with bind:](/learn/bind), shows the one way
that does.

A value computed from a prop is different: `const half = props.dollars / 2` runs once and goes stale, so it's **W001**.
Compute it in JSX or with `derived`.

## Copying a prop into state

`state(props.value)` takes the prop once and never follows it, which is **W005**. To start from a prop and then edit
locally, use `state.linked`:

```tsx
const draft = state.linked(() => props.value)
```

## Recap

- Props are always current: read them in JSX, `derived`, `watch` or handlers.
- `const x = props.y` is a live read-only alias. `let x = props.y` is a writable local alias, and so is `props.x =`.
- Writes stay in the child unless the parent passes `bind:`.

## Try it

:::challenge Show the tip too
Give `Price` a second use in `Tip` that shows a 15% tip on the whole bill.
:::solution
```tsx
<p>Tip <Price dollars={bill.value * 0.15} /></p>
```
Compute in the parent's JSX: the expression re-runs when `bill` changes, and `Price` gets the new number.
:::
