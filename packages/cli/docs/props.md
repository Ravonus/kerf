# Props

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
