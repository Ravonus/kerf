# 43. Prop locals

W001 used to reject `const amount = props.amount`. The rule existed because a component body runs once, so a copy of
a prop silently stopped updating, and agents hit that in every eval. The fix for the bug didn't need to forbid the
form: the compiler already turned `({ amount })` into live reads, by symbol.

## What it does

A body declarator whose initialiser is a plain path off the props (`props.a`, `props.a.b`, a destructured prop, a
`rest` member, casts ignored) disappears, and each use of the local reads the path. There's no binding, no derived and
no runtime cost. It's the same rewrite as the parameter's, keyed on symbols, so shadowing is correct by construction.
A closure above the declaration also sees it, default included, because aliases are collected before the block is walked.

Solid's destructure plugins and Svelte's `$props` work the same way: rewriting at the use, not copying at the
declaration. The pitfalls they document decided the edges:

| Case | Outcome |
|---|---|
| Inner scope binds the same name as `props` | Refused (W001): the rewritten read would resolve to the wrong binding |
| Default value | Applied per read, as for parameters; a `{}` default is a new object each read |
| Array pattern, computed key | W001 |
| `props.a ?? 1`, `props.f()`, arithmetic | W001: computation, so `derived` |
| Passing a local to a helper in the body | W001: that call runs once |
| `state(local)` | W005: `state` takes a value once; use `state.linked` |
| A handler or timer reading the local | Reads the current prop. The one difference from a JS copy, and the reason `untrack(() => props.x)` is the way to keep a first value |

## Writes

`let` assignment and `props.x =` compile to one thing: `props = localProps(props, [...])` at the top of the component,
with each written key read through a `state.linked` of the parent's value. That's the override, and resetting when the
parent's value changes is what `linked` already does. Components that never write pay nothing.

Leaving the component takes `bind:x={box}` at the call site, which gives that prop a setter. `x={bind(box)}` lowers to
the same thing; TypeScript reports a required `x` as missing with `bind:x`, and `bind` types as the box's value. No
existing idiom covered this (`bind` in @weft-js/core/dom is an internal helper). Inferring setters from `n={box.value}` was
rejected: a prop that looks one-way mustn't write parent state.
