# Styling

:::learn
- How `class` and `style` work in weft
- Which UI choices a new app offers
- Where style groups and Tailwind fit
:::

`class` and `style` are attributes like any other. They can read state, and they update when it changes.

:::demo styled

## `class` and `style`

- `class` and `className` are the same. Give it a string.
- `style` takes an object with camelCase or kebab-case names and custom properties. Numbers get `px` unless the property
  has no unit, as in React. `null` and booleans leave a property out, so `color: on && 'red'` works.
- Plain CSS files import from a component: `import './card.css'`.

## Pick a starting point

A new app asks which UI to start with (`--ui`):

| `--ui` | You get |
|---|---|
| `warp` | warp's components, tokens and themes. The default. |
| `headless` | warp-core: warp's keyboard, focus and motion behaviour on your own markup |
| `tailwind` | Tailwind v4, set up. `weft add tailwind` adds the same to an existing app. |
| `none` | Plain CSS |

## Style groups

For your own components, `@weft-js/core/style` lets you name a thing and its variations, in tokens, instead of writing
class lists:

```tsx
import { group } from '@weft-js/core/style'

export const orderCard = group('order-card', {
  base: { surface: 'raised', pad: 'group', radius: 'surface' },
  axes: { status: { open: { tone: 'info' }, late: { tone: 'critical' } } },
  defaults: { status: 'open' },
})

export function Order(props: { status: 'open' | 'late'; number: string }) {
  return <article {...orderCard({ status: props.status })}>Order {props.number}</article>
}
```

`weft style find` shows the groups that fit what you're making. The [Style groups reference](/reference/style) has the full
format.

## Recap

- `class` and `style` take expressions and follow state.
- `--ui` picks warp, headless warp-core, Tailwind or plain CSS.
- Style groups name a thing's look in tokens.
