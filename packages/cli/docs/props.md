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
| `({ user: { name } }) =>` | **W006**: nested destructuring can't stay live. Read `user.name` at the use site (autofix) |

- Read a prop in the body only inside `derived`, `watch`, JSX or a handler. `const n = items.length` in the body is
  a one-time snapshot (**W001**).
- `state(prop)` never follows the prop (**W005**). Use `state.linked(() => prop)` for an editable local copy.
- Pass a box (`value={coupon}`) only when the child must write it; otherwise pass `.value`.
