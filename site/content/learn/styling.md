# Styling and style groups

:::learn
- How `class` and `style` work in weft, and how they follow state
- Where plain CSS files fit, and how cascade layers keep warp out of your way
- How to name a thing's look with a style group from `@weft-js/core/style`
- What tokens and the spacing and type scales are, and why weft asks for them
- What the D-codes in `weft check` catch, and how to answer them
:::

In weft, styling is attributes. `class` and `style` are attributes like `href` or `disabled`: they take expressions, and
when an expression reads state, the compiler wires that one attribute to it. Nothing re-renders to change a colour.

On top of that sits a design language. An app made with warp (the default) has tokens for colour, space, type, radius
and motion, and `weft check` tells you when a value leaves them. This page starts with the plain attributes and builds
up to style groups, which are how you give your own components a named, token-only look.

:::demo styled

## `class` and `style`

`class` takes a string. `className` is the same attribute, there for React habits. Both can read state:

```tsx
import { state } from '@weft-js/core'
import { Switch } from '@weft-js/warp'

export function Banner() {
  const urgent = state(false)
  return (
    <section class={urgent.value ? 'banner urgent' : 'banner'}>
      <Switch checked={urgent.value} onChange={(e: Event & { currentTarget: HTMLInputElement }) => (urgent.value = e.currentTarget.checked)}>
        Urgent
      </Switch>
    </section>
  )
}
```

`class` also takes an object whose true keys are the classes, which saves the ternary when classes come and go on
their own:

```tsx
import { state } from '@weft-js/core'

export function Row(props: { done: boolean }) {
  const hovered = state(false)
  return (
    <li class={{ row: true, done: props.done, hot: hovered.value }} onPointerEnter={() => (hovered.value = true)} onPointerLeave={() => (hovered.value = false)}>
      Grind the beans
    </li>
  )
}
```

`style` takes a string or an object, in React's shape:

- Names are camelCase (`fontWeight`) or kebab-case (`'font-weight'`), and custom properties (`'--gap'`) pass through.
- A number gets `px`, unless the property has no unit (`opacity`, `zIndex`, `lineHeight`, `flexGrow` and the rest), as in
  React.
- `null`, `undefined` and booleans leave the property out, so `{ fontWeight: bold.value && 600 }` works.
- An object is diffed: when one value changes, only that property is written.

```tsx
import { state } from '@weft-js/core'
import { Slider } from '@weft-js/warp'

export function Meter() {
  const level = state(40)
  return (
    <>
      <Slider label="Level" value={level.value} onChange={(v: number) => (level.value = v)} />
      <div style={{ inlineSize: `${level.value}%`, opacity: level.value / 100, '--level': level.value }} data-meter />
    </>
  )
}
```

:::note React developers
This is the same `className` and `style` you know, with two differences. `class` is the preferred spelling, and the
element is never rebuilt when it changes: the compiler emits one attribute write per change. There is no `styled()` or
CSS-in-JS runtime. Plain CSS, style groups and warp's components cover what those are used for.
:::

## Plain CSS files

Import a stylesheet from the component that needs it:

<!-- example: skip imports a stylesheet that only exists in the reader's app -->
```tsx
import './receipt.css'

export function Receipt(props: { total: string }) {
  return <p class="receipt-total">{props.total}</p>
}
```

The build bundles it, and a page loads it only when a component that imports it is on that page. The CSS is global, as
it is anywhere: `.receipt-total` matches every element with that class. weft's types declare `.css` imports as side
effects, so there is no CSS-modules object to import. When you want a name that can't collide, use a style group (below).

### Cascade layers

warp puts all of its CSS in cascade layers (`@layer warp.tokens`, `warp.base`, `warp.components` and so on), and its
component rules use `:where()`, which has no specificity. Style groups go in `@layer app.groups`. CSS you write without
a layer comes after every layer, so it wins:

```css
/* src/app.css: no @layer, so this beats warp's own rule for the same element */
[data-scope="button"] { letter-spacing: 0.02em; }
```

You never need `!important` to change something warp drew. If you use Tailwind, its layers are declared after warp's,
so a utility wins in the same way.

:::deepdive Why layers and not specificity
A component library that styles with ordinary selectors forces you into a specificity contest: your `.card .title`
loses to its `.lib-card > .lib-card__title`, so you add a class, then `!important`. Cascade layers settle the order up
front. The browser compares layers before it compares specificity, and unlayered rules come last. warp also wraps its
selectors in `:where()`, so even inside a layer it never outranks a plain selector of yours. The practical rule is
short: write normal CSS, and it wins.
:::

## Pick a starting point

A new app asks which UI to start with (`--ui`). You can change your mind later, since each is a set of packages and a
config line.

| `--ui` | You get |
|---|---|
| `warp` | warp's components, tokens and themes, with `warp()` in `weft.config.ts`. The default. |
| `headless` | warp-core: warp's keyboard, focus and motion behaviour, and its token CSS, under your own markup |
| `tailwind` | Tailwind v4, set up. `weft add tailwind` adds the same to an existing app. |
| `none` | Plain CSS in `src/app.css` |

In an app with warp, `weft add tailwind` also imports `@weft-js/warp/tailwind.css`, which turns warp's tokens into
Tailwind theme values: `bg-surface`, `text-accent`, `rounded-control`. Each utility stays a `var()`, so it follows the
theme and the dials like a component does. [Theming](/learn/theming) covers those.

## Style groups

Class lists work, but they don't say what a thing is. `class="rounded-lg border p-4 bg-white text-sm shadow"` is a
card, or a toast, or a callout; the next person (or agent) to make one writes a slightly different list. A **style
group** names the thing and its variations once, in tokens, and every use says which variation it is:

:::demo style-order

A group comes from `group(name, definition)` in `@weft-js/core/style`:

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
      <p {...orderCard.title}>{props.order.name}</p>
      <p {...orderCard.meta}>{props.order.date}</p>
    </article>
  )
}
```

The definition has five parts, all optional:

- **`base`**: what every order card has.
- **`axes`**: the ways one can differ. Here `status` is an axis with three values, each setting a `tone`.
- **`parts`**: the named pieces inside it. `orderCard.title` is a set of attributes you spread on the piece.
- **`states`**: on or off conditions. ARIA ones (`selected`, `pressed`, `checked`, `expanded`, `current`, `invalid`,
  `busy`) become `aria-*` attributes; `hover`, `focus`, `active` and `disabled` are read from the element, so you never
  pass them.
- **`defaults`**: the axis values a call leaves out.

Each key in those objects is an **intent** (`surface`, `pad`, `gap`, `radius`, `tone`, `emphasis`, `text`, `ink`,
`layout`, `align`, `justify`, `ring`, `border`, `elevation` …) and each value is one of that intent's token names.
`pad: '13px'` is a type error. The [Style groups reference](/reference/style) has the whole vocabulary.

### What it compiles to

The compiler lowers each call site to plain attributes, and the build writes the CSS:

```html
<article data-g="order-card" data-status="late" aria-selected="false">
  <p data-part="title">…</p>
</article>
```

So changing `props.order.status` is one attribute write. No class string is rebuilt and nothing is diffed. The CSS lands
in `@layer app.groups` as readable rules keyed on those attributes, and only for the values your call sites can produce.

:::pitfall A group definition must be literal data
The compiler reads the definition at build time, so it has to be an object literal: no spreads from a variable, no
function calls, no values computed at runtime. A definition it can't read is W060. Put the variation in an axis and
choose the value at the call site from state, which is where it can be dynamic.
:::

### A one-off: the accent

Sometimes one card needs a rounder corner and nothing else. That is an **accent**, tokens only, at the call site:

```tsx
import { group } from '@weft-js/core/style'

const promo = group('promo', {
  base: { surface: 'raised', pad: 'group', radius: 'surface' },
  axes: { size: { normal: {}, wide: { pad: 'section' } } },
  defaults: { size: 'normal' },
})

export function Promo() {
  return <aside {...promo({ accent: { radius: 'round' } })}>Free shipping this week</aside>
}
```

An accent can't use `css`. The same accent on one group at three or more sites is D022: it has become a variation, so
make it an axis value. An accent that sets what the site's axis value already sets is D024.

### The escape hatch: `css`

When no intent covers a property, a group can take raw CSS in `css: { … }`. It works, and `weft check` counts each one as
D023 so the escapes stay visible. Reach for it for something like `aspectRatio` or a grid template, not for a colour or a
padding the tokens already have.

### Finding a group before you write one

Two groups that resolve to nearly the same CSS are D021. Before you make one, ask what exists:

```bash
weft style find card                       # groups that fit, best first, with axes, parts and how often each is used
weft style explain order-card[status=late] # every declaration on the root and parts, and where each came from
```

`weft dev`, `weft build` and `weft check` keep `.weft/styles.json` current: every group, its values and resolved CSS,
and which groups are similar. Agents read it through MCP (`style_find`, `style_explain`). Read it; don't edit it.

:::deepdive Style groups compared with Tailwind and CSS-in-JS
Tailwind names properties at the call site; CSS-in-JS names a component's styles in JavaScript and usually injects them
at runtime. A style group names the *thing* and its *variations*, and leaves the properties to tokens. The result is
closer to a design system's component spec than to either: `orderCard({ status: 'late' })` reads like the design
review said it. It also costs nothing at runtime: the call compiles away, and a reactive axis is the same single
attribute write as any other binding. Tailwind is still a fine choice in weft (`--ui tailwind`), and the D-codes apply
to its classes too.
:::

## Tokens and the scales

warp's look is a set of CSS custom properties, the **tokens**, all named `--warp-*`: `--warp-color-surface-raised`,
`--warp-space-group`, `--warp-radius-control`, `--warp-text-heading-size`. Themes and dials change their values, so
anything drawn from them changes with the theme. A raw `#fff` or `16px` doesn't.

The two scales you meet most are space and type.

**Space** is seven steps, named by relationship, not size: `none`, `hair`, `tight`, `related`, `group`, `section`,
`page`. `related` is the space inside one thing, `group` the space between things, `section` between sections. warp's
layout primitives take these as `gap`, and style groups take them as `pad` and `gap`. The density dial scales the whole
set.

**Type** is a set of roles: `display`, `title`, `heading`, `body`, `label`, `caption`, `eyebrow`, `code`. A role sets size,
weight and leading together, and the expression dial changes the faces. `Heading` picks its role from its `level`
(`title` for h1, `heading` for h2 and h3, `label` below), so a page's outline and its look stay in step.

:::demo style-scale

```tsx
import { Card, Heading, Row, Stack, Tag, Text } from '@weft-js/warp'

export function Roasts() {
  return (
    <Card title="Roasts">
      <Stack gap="related">
        <Heading level={3}>This week</Heading>
        <Text subtle>Roasted on Monday, shipped on Tuesday.</Text>
        <Row gap="tight" wrap>
          <Tag>Light</Tag>
          <Tag>Medium</Tag>
        </Row>
        <Text role="caption" faint>Prices include shipping.</Text>
      </Stack>
    </Card>
  )
}
```

The names are also exported as constants and types from `@weft-js/core/ds` (`SPACE`, `TONE`, `EMPHASIS`, `TEXT_ROLE` and
their types `Space`, `Tone` …), so your own components can take a `gap: Space` prop and stay on the scale.

:::note Your own CSS can use the tokens too
`var(--warp-color-text-subtle)` in a stylesheet follows the theme like warp does. That is the right way to write CSS by
hand in a warp app: the D-codes below look for raw values, not for CSS.
:::

## The D-codes

In an app with warp, `weft check` reads your markup, `style` objects, CSS and Tailwind classes, and reports values that
leave the design language. Each code says what to use instead:

| Code | Catches | Instead |
|---|---|---|
| D001 | A raw colour, or a palette class like `bg-red-500` | A token, or a component's `tone` |
| D002 | Spacing off the scale, or a step written by hand (`padding: 16px`) | A space step; `weft fix` rewrites an exact step |
| D003 | Raw type, radius or shadow (`font-size`, `rounded-[7px]`) | `Heading`, `Text`, radius and elevation tokens |
| D004 | Layout spelled out (`display: flex`, `flex flex-col gap-4`) | `Stack`, `Row`, `Grid` |
| D005 | A browser-painted control: `<button>`, `<select>`, `<textarea>`, a `date` or `range` input, a `title` tooltip | The warp component |
| D006 | One heading level at two looks across the app | Match the level's main role |
| D007 | A bare `<a href>` | `Link`, or `Shell`'s nav |

Another group runs in every app, warp or not, and catches accessibility mistakes: a field with no label (D030), a
button with no name (D031), an image with no `alt` (D032), focus rings removed (D036) and more. They have their own
section on [Accessibility](/learn/accessibility). D020–D025 are the style-group codes above.

When a value really must stay, say why on the line above it:

```css
/* weft-allow D001: the partner's brand colour, fixed by contract */
.partner-logo { color: #d40000; }
```

The reason is required. `check: { design: false }` in `weft.config.ts` turns the D-codes off for an app that has its own
system. `weft fix` applies the safe fixes (an exact space step, a positive `tabindex`); a fix that changes an element,
like swapping a `<button>` for `Button`, comes back as a suggested edit for you or your agent to apply.

:::pitfall A raw colour has no autofix
A token follows the theme and the raw value didn't, so there is no exact replacement to apply. `#1a7f37` might mean
"positive" or might mean "your brand". Pick the token that says what you mean: `tone="positive"` on a component, or
`var(--warp-color-positive-text)` in CSS.
:::

## Recap

- `class` takes a string or an object of class names; `style` takes a string or a React-shaped object. Both follow state,
  one attribute write per change.
- Import plain CSS from a component. warp sits in cascade layers with zero specificity, so your unlayered CSS wins.
- A style group names a thing, its axes, parts and states in tokens; call sites compile to `data-*` attributes.
- Tokens are `--warp-*` custom properties. Space is a scale of relationships, type a set of roles.
- `weft check` reports off-system values as D-codes. Answer with a token, or keep a value with a `weft-allow` reason.

## Try it

:::challenge Turn a ternary into an object
This button row builds its class string by hand. Rewrite `class` as an object, so each class depends on one condition.

```tsx
import { state } from '@weft-js/core'

export function Chip(props: { label: string }) {
  const on = state(false)
  const hot = state(false)
  return (
    <span
      class={'chip' + (on.value ? ' on' : '') + (hot.value ? ' hot' : '')}
      onPointerEnter={() => (hot.value = true)}
      onPointerLeave={() => (hot.value = false)}
    >
      {props.label}
    </span>
  )
}
```
:::solution
```tsx
import { state } from '@weft-js/core'

export function Chip(props: { label: string }) {
  const on = state(false)
  const hot = state(false)
  return (
    <span class={{ chip: true, on: on.value, hot: hot.value }} onPointerEnter={() => (hot.value = true)} onPointerLeave={() => (hot.value = false)}>
      {props.label}
    </span>
  )
}
```

Each key is added or removed on its own when its value changes, so there is no string to rebuild and no stray spaces.
:::

:::challenge Add an axis to a group
Here is a callout group with one look. Give it a `tone` axis with `info`, `caution` and `critical` values (each setting the
intent `tone`), default it to `info`, and make `Callout` take the tone as a prop.

```tsx
import { group } from '@weft-js/core/style'

const callout = group('callout', {
  base: { surface: 'raised', pad: 'group', radius: 'surface', border: 'tone' },
})

export function Callout(props: { text: string }) {
  return <aside {...callout()}>{props.text}</aside>
}
```
:::solution
```tsx
import { group } from '@weft-js/core/style'

const callout = group('callout', {
  base: { surface: 'raised', pad: 'group', radius: 'surface', border: 'tone' },
  axes: { tone: { info: { tone: 'info' }, caution: { tone: 'caution' }, critical: { tone: 'critical' } } },
  defaults: { tone: 'info' },
})

export function Callout(props: { text: string; tone: 'info' | 'caution' | 'critical' }) {
  return <aside {...callout({ tone: props.tone })}>{props.text}</aside>
}
```

The axis is named `tone` and so is the intent each value sets; they live in different places, so that is fine. The
call compiles to `data-tone={props.tone}`, one attribute that follows the prop.
:::

:::challenge Answer the D-codes
`weft check` reports D002 twice and D001 on this component. Rewrite it with warp's primitives and tokens so it
reports none, and replace the hand-made flex row while you're there.

<!-- example: skip the challenge's starting code, which has its D-codes on purpose -->
```tsx
export function Total(props: { amount: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, padding: 16, color: '#0a7d4f' }}>
      <span>Total</span>
      <strong>{props.amount}</strong>
    </div>
  )
}
```
:::solution
```tsx
import { Row, Text } from '@weft-js/warp'

export function Total(props: { amount: string }) {
  return (
    <Row gap="related" justify="between">
      <Text inline>Total</Text>
      <Text inline tone="positive">{props.amount}</Text>
    </Row>
  )
}
```

`Row` says the layout, `gap="related"` is a step on the scale (D002), and `tone="positive"` is the colour by
meaning (D001), so it follows the theme in light and dark. If the padding mattered, wrap it in `Inset pad="group"` or
give the thing a style group with `pad: 'group'`.
:::
