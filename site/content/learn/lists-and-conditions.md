# Lists and conditions

:::learn
- How to render a list with `.map` and `key`
- How to show something only sometimes
- The mistakes the compiler catches here
:::

Lists and conditionals work as they do in React: `.map` with a `key`, `&&` and ternaries.

:::demo lists

## Keys

`tasks.value.map(t => <Checkbox key={t.id}>…</Checkbox>)` is a keyed list. Each key keeps its row, so when the order
changes weft moves rows instead of rebuilding them, and what's inside a row, such as a tick, survives.

Over objects, a missing `key` is **W010**. Over strings and numbers, the value is the key.

## Filtering

To show part of a list, filter it first. The filter can be a `derived` value so other code can read it too:

:::demo search

Don't `return` early inside the `.map` callback (**W013**). Filter, then map.

## Conditions

Use `&&` or a ternary in JSX:

```tsx
{count.value > 0 && <Badge>{count.value}</Badge>}
{loggedIn.value ? <Profile /> : <SignIn />}
```

With a number on the left, `count.value && …` renders `0` when it's zero. The compiler reports that as **W011**: write
`count.value > 0 &&`.

Branch in JSX, not with an early `return` in the component body. The body runs once, so a `return` based on state would
never be checked again (**W040**).

## Recap

- `.map` with `key` keeps each row; rows move instead of being rebuilt.
- Filter first, then map. Put shared filters in `derived`.
- `&&` and ternaries go in JSX. Write `n > 0 &&`, not `n &&`.

## Try it

:::challenge Say when nothing matches
In the search demo, show "No cities match" when the filter finds nothing.
:::solution
```tsx
{found.value.length === 0 && <p>No cities match</p>}
```
:::
