# Writing to a parent with `bind:`

:::learn
- How a child changes its parent's state
- Why only the call site decides that
- When to pass a box instead
:::

On [Passing props](/learn/passing-props) a child could change its own copy of a prop with `let` or `props.x =`, but the
parent never saw it. To let a write leave the component, the parent passes its box with `bind:`.

:::demo bind

## The call site decides

```tsx
<Stepper bind:value={guests} />   // writes reach `guests`
<Stepper value={guests.value} />  // writes stay in Stepper
```

`Stepper` is the same in both: it writes `value` with `let`. Only `bind:` at the call site decides whether that write
leaves the component. So reading the parent tells you everything that may change its state.

`bind:` takes a box, and only on a component. On an HTML element, or with something that isn't a box, it's **W061**.

The prop is optional in `Stepper` (`value?: number`) because plain `tsc` can't connect `bind:value` to `value`. Run
`weft tsc`, which reads `bind:value={box}` as `value` with the box's type. `value={bind(box)}` is the same binding in a form
plain `tsc` accepts.

## Passing a box

You can also pass the box itself and type the prop as `State<T>`:

```tsx
function Coupon(props: { code: State<string> }) {
  return <input value={props.code.value} onInput={e => (props.code.value = e.currentTarget.value)} />
}
```

Use this when the child needs the box, for example to read one entry with `.get` (see
[Reading one entry](/learn/entries)). For "a child that edits a value", `bind:` keeps the child simpler: it works with or
without a parent box.

## Recap

- `let x = props.x; x = …` and `props.x = …` change the child only, until the parent's value changes.
- `bind:x={box}` at the call site sends those writes to the parent's box.
- Passing a box typed `State<T>` also works when the child needs the box itself.

## Try it

:::challenge Keep it in range
Stop `Stepper` from going below 1.
:::solution
```tsx
<Button size="sm" emphasis="outline" disabled={value <= 1} onClick={() => value--}>−</Button>
```
`value` is the live alias, so `disabled` follows it, whether the write came from the child or the parent.
:::
