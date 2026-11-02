# Hover, focus and press

:::learn
- How `interaction()` turns hover, focus and press into state
- How warp components fill and draw it
- How to share it across tabs and visitors
:::

Hover, focus and press are usually event handlers. `interaction()` from `@weft-js/core/interaction` makes them values you
can read like any other state.

:::demo ui-state

## A row of interaction state

```tsx
const row = interaction()
<Checkbox ui={row}>Pack</Checkbox>
{row.hover.value && <small>here</small>}
```

Pass the row to a warp component with `ui`. The component fills it from real events and draws from it. You read
`row.hover.value`, `row.focus.value` and `row.pressed.value`.

## Sharing it

Give `interaction` a `share` key and other tabs and other visitors see it too:

```tsx
const row = interaction({ share: () => `todo:${todo.id}` })
row.remote.value.hover   // how many others hover it: a count, never who
```

Your own hover and theirs never mix. Someone else's hover can't set your `row.hover`, so a `watch` on it can't run for them
or echo back. warp marks a row lit from anywhere with `data-hold`, and with `data-remote` when only others are on it.

Sharing across visitors needs the realtime server from `@weft-js/start`. The
[Shared UI state reference](/reference/ui-state) covers who may see what.

## Recap

- `interaction()` gives you `hover`, `focus` and `pressed` as state.
- `ui={row}` on a warp component fills and draws it.
- `share` adds `remote`: what others are doing, as counts.
