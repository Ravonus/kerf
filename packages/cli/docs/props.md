# Props

## Types

Leave a component's props unannotated. weft infers them from its callers and its body, in the editor (the plugin in
`tsconfig.json`), `weft check`, `weft tsc` and `weft dev`. Nothing is left at run time.

```tsx
function Row(props) { return <li onClick={props.onPick}>{props.label.toUpperCase()}</li> }
export default function List() { return <Row label="One" onPick={() => go(1)} /> }
```

| Case | What you get |
|---|---|
| Several callers | A union if the body handles it; if not, **W084** at the odd caller |
| Some callers omit a prop | Optional; a default value also types it |
| `<Button {...props} />` | `Button`'s props |
| A component in a variable, map or prop | Its sites count, and prop sets merge |
| Callers that differ by a string prop | A union of shapes the body can narrow |
| `src/routes` default export | `RouteProps` |
| An export | `weft dev` or `weft fix` writes the type with an `/*inferred*/` comment, so it shows in a diff. **W082** when callers move on; delete the comment to keep the type |
| An `any` from a caller | The body's use, or `any`, with **W083** naming where it came from |
| No caller | **W080**, with what to do |
| `bind:x={box}` | Typed as the value, but it doesn't compile: **W086**, and `weft fix` writes `x={bind(box)}` |

Write a type yourself when two props must agree (a type parameter), when the file is `.jsx`, or for a public API with no
caller in this repository. `Props<typeof Button>` names another component's props. `tsc` alone reports TS7006 on an
inferred parameter; run `weft tsc` in CI. `check: { props: false }` turns this off; `'manual'` leaves writing to `weft fix`.

## Reactivity

The compiler turns a component's props into live reads, so a parent writing `count={count.value}` is correct.

| Form | Behaviour |
|---|---|
| `({ a, b }) =>` | Each name is a live read of `props.a` |
| `(props) =>` | `props.a` is a live getter |
| `({ size = 'md' }) =>` | Default applied on every read when the prop is `undefined` |
| `({ a, ...rest }) =>` | `rest` is a live object; `<div {...rest}>` stays live |
| `const x = props.y` in the body | `x` is another name for the prop: each use reads it live, at no cost |
| `const { a: b, c = 1, ...rest } = props` in the body | The same as in the parameter: renames, defaults and rest stay live |
| `const n = props.items.length` in the body | A path off a prop is live too |
| `({ user: { name } }) =>` | **W006**: nested destructuring can't stay live. Read `user.name` at the use site (autofix) |

- The local isn't a copy: every use, closures included, reads the prop as it is at that moment. For a value that must
  stay as it was, write the snapshot out: `const first = untrack(() => props.x)`.
- Computing in the body runs once: `const n = items.length + 1`, `const a = props.a ?? 1` or `makeChart(items)` is
  **W001**. Use `derived`, `watch`, JSX or a handler.
- Array patterns and computed keys (`const [a] = props.pair`, `const { [k]: a } = props`) are **W001**: read them at
  the use site.
- `const` stays read-only: assigning to a `const` alias is **W001**, which says to use `let` or `props.x =`.
- `state(prop)` never follows the prop (**W005**). Use `state.linked(() => prop)` for an editable local copy.
- Pass a box (`value={coupon}`) only when the child must write it; otherwise pass `.value`.

## Writing a prop

A component can write its own props. `let` makes a local writable; `+=`, `++` and `let { a } = props` work too.

| In the child | Parent passed `n={x}` | Parent passed `bind:n={box}` |
|---|---|---|
| Read `n` or `props.n` | Live | Live |
| `let n = props.n; n = 5` | Holds in the child until the parent's value next changes, then the parent wins | Writes `box` |
| `props.n = 5` | The same | The same: writes `box` |
| `const n = props.n; n = 5` | **W001**: use `let` or `props.n =` | **W001** |

`bind:` at the call site alone decides whether a write leaves the component. `<Card n={box.value} />` never writes
`box`, whatever `Card` does. It takes a box, on a component (**W061** otherwise). `n={bind(box)}` is the same binding,
and types as the box's value, so use it if `n` is a required prop: TypeScript doesn't connect `bind:n` to `n`. An
island's props arrive as data, so a write there is always local.

Only a whole prop can be written this way. `let n = props.user.name; n = 1` is **W001**; `props.user.name = 1` writes
that object, as in any JavaScript.
