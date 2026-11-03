# Styling: style groups

Style with **groups** from `@weft-js/core/style`, not class lists. A group is a named thing (`order-card`), its variations
(axes), its pieces (parts) and its states, all written in tokens. The markup says what an element is and which
variation it's in: `<article data-g="order-card" data-status="late">`.

```tsx
import { group } from '@weft-js/core/style'

/** A summary card for one order in a list. */
export const orderCard = group('order-card', {
  base: { surface: 'raised', pad: 'group', radius: 'surface', layout: 'stack', gap: 'related' },
  axes: { status: { open: { tone: 'info' }, shipped: { tone: 'positive' }, late: { tone: 'critical' } } },
  parts: { title: { text: 'title' }, meta: { text: 'caption', ink: 'subtle' } },
  states: { selected: { ring: 'accent' } },
  defaults: { status: 'open' },
})

type Order = { name: string; date: string; status: 'open' | 'shipped' | 'late' }

export function OrderCard(props: { order: Order; selected: boolean }) {
  return (
    <article {...orderCard({ status: props.order.status, selected: props.selected })}>
      <h3 {...orderCard.title}>{props.order.name}</h3>
      <p {...orderCard.meta}>{props.order.date}</p>
    </article>
  )
}
```

## Rules

1. **Find before you write.** `weft style find card` (MCP `style_find`) lists the groups that fit. Reuse one, or
   add an axis value to it. A second group for the same thing is D021.
2. **Values are tokens.** Each key is an intent (`surface pad gap radius tone emphasis text ink layout align justify
   ring …`) and each value one of its tokens. `pad: '13px'` is a type error and D025. Raw CSS goes in
   `css: { … }`, which is counted (D023): use it only where no intent sets the property.
3. **Variation is an axis value**, set from state: `orderCard({ status: order.status })`. A reactive axis is one
   attribute write; no class string is rebuilt.
4. **A one-off is an accent**: `orderCard({ status: 'late', accent: { radius: 'round' } })`. Tokens only. The same
   accent three times means it's an axis value (D022). An accent that sets what the site's axis value sets is D024.
5. **One group per element** (D024). For a second look, nest an element or make it an axis.
6. **States are ARIA or data attributes** (`selected` → `aria-selected`), and `hover`/`focus`/`active`/`disabled`
   are read from the element, not passed.
7. **No class soup.** More than 8 classes on an element, or the same class list in two places, is D020.

## Tools

- `weft style find <query>`: groups that fit, best first, with axes, parts, states and how often each is used.
- `weft style explain order-card --status late` (or `order-card[status=late]`, `order-card.title`, or a DOM selector
  copied from devtools): every declaration on the root and parts, in cascade order, with the token, axis, state,
  compound or accent it came from, and the CSS that variation emits. MCP `style_explain`.
- `.weft/styles.json`: the generated matrix (every group's axes, values, parts, accents, resolved CSS, uses and
  `similar` groups). `weft dev`/`build` and `weft check` keep it current; `weft style matrix` writes it. Read it;
  never edit it.

Codes: D020 class soup, D021 near-duplicate groups, D022 a repeated accent, D023 the `css` escape, D024 styles that
fight (two groups on one element, overlapping compounds, an accent against an axis), D025 an unknown name, W060 a
group that isn't literal data.