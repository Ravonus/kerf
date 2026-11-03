# Theming

:::learn
- What warp's six dials are, and how they set the look through `data-*` attributes
- How dark mode works, and how to add a theme switch that remembers the choice
- How to scope a theme to part of a page
- What the `--warp-*` tokens are, and how to set your brand colour and override a token safely
:::

[Using warp](/learn/warp) said that warp's look comes from tokens, so it follows the theme and the dials with no change
to your code. This page is about those dials and tokens: what they are, how to set them for a whole app or one corner of
a page, and how your own CSS and canvases can follow them too.

:::demo style-dials

Nothing in the card above knows about themes. The three controls write three attributes on the `<div>` around it, and
every token inside re-resolves.

## The six dials

A **dial** is a setting the whole look reads. Each one is a `data-*` attribute, on `<html>` for the page or on any
element for what's inside it:

| Dial | Values | With no attribute |
|---|---|---|
| `theme` | `light`, `dark` | follows the system's `prefers-color-scheme` |
| `expression` | `quiet`, `balanced`, `vivid` | `balanced` |
| `density` | `compact`, `cozy`, `comfortable` | `cozy` |
| `motion` | `full`, `reduce` | follows the system's `prefers-reduced-motion` |
| `fields` | `floating`, `classic` | `floating` |
| `flair` | `sweep`, `none` | warp's own choice per component |

- **theme** is light or dark.
- **expression** is how much personality the page has. `quiet` is plain and calm, `balanced` is the default, and `vivid`
  is bolder: different faces (Space Grotesk and Instrument Serif in place of Inter), stronger motion, and pixel-art icons.
- **density** scales the space steps and control heights, for a dense admin table or a roomy marketing page.
- **motion** turns animation down. Under `reduce`, an animation runs at most once and spinners become an opacity pulse.
- **fields** puts every field's label in the border (`floating`) or above it (`classic`).
- **flair** turns warp's signature sweep on for buttons and surfaces too, or off.

Because they are attributes, CSS does all the work. Switching a dial writes one attribute; no component runs again, and
there is no theme object passed through your tree.

:::note React developers
In React a theme is often a context provider and a hook in every component that reads it. weft has no theme context. The
dials are attributes and the tokens are CSS custom properties, so the browser resolves them per element, on the server's
HTML as much as on the client, and changing one never re-runs a component.
:::

## Dark mode

With no `data-theme` anywhere, warp follows the system: a reader with a dark OS gets the dark theme, and it changes the
moment they switch. Most apps can stop there.

To let people choose, write the dial with `setDial` from `@weft-js/warp`. `persist: true` remembers the choice in
`localStorage`, and `auto` removes the attribute so the system decides again:

```tsx
import { onMount, state } from '@weft-js/core'
import { getDial, Segmented, setDial } from '@weft-js/warp'

type Theme = 'auto' | 'light' | 'dark'

const THEMES = [
  { value: 'auto' as const, label: 'System' },
  { value: 'light' as const, label: 'Light' },
  { value: 'dark' as const, label: 'Dark' },
]

export function ThemeSwitch() {
  const theme = state<Theme>('auto')
  // The page's dial lives on <html>, which only the browser has: read it once mounted.
  onMount(() => {
    theme.value = getDial('theme')
  })
  const pick = (next: Theme) => {
    theme.value = next
    setDial('theme', next, { persist: true })
  }
  return <Segmented label="Theme" value={theme.value} options={THEMES} onChange={pick} />
}
```

`setDial` checks the value (a wrong one throws a `RangeError`), writes the attribute, and fires a `warp:dial` event on
the document with `{ name, value }` so other parts of the page can follow. It also takes `url: true` to put the dial in
the address (`?theme=dark`), which is handy for sharing a screenshot's settings.

### No flash on load

A persisted choice lives in the browser, but the server renders the page before any script runs. Without help, a reader
who chose dark would see the light page for a moment. `dialScript` from `@weft-js/warp/plugin` is a tiny inline script
that restores the saved dials before the first paint. Put it in `site.head`:

```ts
import { defineConfig } from '@weft-js/core/config'
import { dialScript, warp } from '@weft-js/warp/plugin'

export default defineConfig({
  site: { name: 'Roastery', title: '%s · Roastery', head: dialScript },
  plugins: [warp()],
})
```

:::pitfall Reading a dial while rendering
`getDial` and `setDial` read `document`, which the server doesn't have. Called in a component's body, they throw during
server rendering. Read the dial in `onMount`, as above, or in an event handler. The server's HTML then renders the
default, and `dialScript` has already set the right attribute by the time anyone sees it.
:::

## Scoped dials

Dials nest. An attribute on any element applies to everything inside it, and the nearest one wins:

```tsx
import { Card, Split, Stack, Text } from '@weft-js/warp'

export function Layout() {
  return (
    <Split side="start" width="nav">
      <nav data-theme="dark" data-density="compact" aria-label="Main">
        <Text>Orders</Text>
        <Text>Customers</Text>
      </nav>
      <Stack as="main" gap="section">
        <Card title="Today">
          <Text subtle>12 orders to ship.</Text>
        </Card>
      </Stack>
    </Split>
  )
}
```

The sidebar is dark and compact whatever the page is; the main area follows the page. An element with `data-theme` also
paints the page background for its theme, so the dark sidebar doesn't show the light page through it.

To set a dial on an element from code, pass it as `root`: `setDial('expression', 'vivid', { root: el })`. In JSX, the
attribute itself is simpler, as in the demo: `data-theme={theme.value}`.

## Tokens

Every value warp draws with is a CSS custom property named `--warp-*`. A few of the families:

| Family | Examples |
|---|---|
| Surfaces | `--warp-color-page`, `--warp-color-surface`, `--warp-color-surface-raised`, `--warp-color-surface-sunken` |
| Text | `--warp-color-text`, `--warp-color-text-subtle`, `--warp-color-text-faint` |
| Tones | `--warp-color-<tone>-solid`, `-soft`, `-text`, `-border`, `-on-solid`, for each of `neutral`, `accent`, `positive`, `caution`, `critical`, `info` |
| Space | `--warp-space-hair` … `--warp-space-page` |
| Shape | `--warp-radius-control`, `--warp-radius-surface`, `--warp-radius-round`, `--warp-elevation-1` … `-3` |
| Type | `--warp-text-<role>-size`, `-leading`, `-weight`; `--warp-font-sans`, `--warp-font-display`, `--warp-font-mono` |
| Motion | `--warp-duration-fast`, `--warp-duration-base`, `--warp-ease-out`, `--warp-ease-spring` |

The dials change their values, so your own CSS that reads them follows the theme for free:

```css
/* src/app.css */
.receipt {
  background: var(--warp-color-surface-sunken);
  color: var(--warp-color-text-subtle);
  border-radius: var(--warp-radius-surface);
  padding: var(--warp-space-group);
  transition: background var(--warp-duration-base) var(--warp-ease-out);
}
```

That rule is right in light and dark, at every density, and under reduced motion. The same rule with `#f6f6f6` and
`16px` would be D001 and D002, and would stay light in dark mode.

`weft tokens` writes the resolved tokens to `.weft/tokens/` as DTCG 2025.10, one file per theme and expression, for
Figma, Style Dictionary or Terrazzo.

## Your brand: the seed

warp's colours are derived from a **seed**. Give `warp()` your brand accent and every accent token, in both themes and
at every expression, is worked out from it:

```ts
import { defineConfig } from '@weft-js/core/config'
import { warp } from '@weft-js/warp/plugin'

export default defineConfig({
  plugins: [warp({ seed: { accent: '#0a7d4f' } })],
})
```

The build runs warp's contrast check on the result: every text and fill pair, and the focus ring, at every dial stop.
warp fits the seed so that it passes; what can still fail is a token you override yourself.

## Overriding a token

`tokens` in `warp()` sets any `--warp-*` token for the whole app, and `radius` and `fonts` are shortcuts for the common
ones:

```ts
import { defineConfig } from '@weft-js/core/config'
import { warp } from '@weft-js/warp/plugin'

export default defineConfig({
  plugins: [
    warp({
      radius: 'round',
      fonts: { display: 'Fraunces' },
      tokens: { '--warp-color-page': 'oklch(0.98 0.01 85)' },
    }),
  ],
})
```

Each override goes through the same contrast check. If a page colour leaves body text below 4.5:1 at some stop, the build
fails with D010 and lists each failing pair, so a brand tweak can't quietly make the app unreadable in dark mode.

:::deepdive How the overrides land
The plugin writes your overrides into `@layer warp.base`, a later layer than `warp.tokens`, on `:root` and on every
element that carries a dial. That last part matters: each dial scope recomputes the tokens below it, so an override set
only on `:root` would be undone inside a `data-expression` scope. Writing it on every scope root keeps your value
everywhere, and keeping it in a layer means your own unlayered CSS can still change it locally.
:::

## Canvas and surfaces follow too

A canvas has no CSS, so it can't read a custom property by itself. A surface from `@weft-js/core/surface` gets the
tokens on `s.tokens`, by camelCase name, as `{ css, linear }`. Reading one inside `s.draw` makes the drawing repaint when
the theme changes:

```tsx
import { defineSurface, Surface } from '@weft-js/core/surface'

export const Fill = defineSurface<{ ratio: number }, 'canvas2d'>({
  name: 'fill',
  kind: 'canvas2d',
  setup(s, props) {
    s.draw(() => {
      const { width, height } = s.size.value
      const accent = s.tokens['colorAccentSolid']
      if (accent) s.ctx.fillStyle = accent.css
      s.ctx.fillRect(0, 0, width * props.ratio, height)
    })
  },
})

export function Progress() {
  return <Surface use={Fill} ratio={0.6} aspect="8/1" label="60% roasted" />
}
```

`s.tokens.colorAccentSolid` reads `--color-accent-solid` if your page defines it, else `--warp-color-accent-solid`. The
[Surfaces reference](/reference/surface) covers the rest of `s`.

## Recap

- Six dials set the look: `theme`, `expression`, `density`, `motion`, `fields`, `flair`. Each is a `data-*` attribute on
  `<html>` or any element, and the nearest one wins.
- With no `data-theme`, warp follows the system. `setDial('theme', …, { persist: true })` plus `dialScript` in
  `site.head` gives a remembered choice with no flash.
- Read and write dials in `onMount` or handlers, never while rendering on the server.
- Tokens are `--warp-*` custom properties. Use them in your own CSS and it follows every dial.
- `warp({ seed, radius, fonts, tokens })` sets the brand; every override is contrast-checked, and a failing one is D010.

## Try it

:::challenge A dark-mode toggle
Write a `DarkToggle` component: a `Switch` labelled "Dark mode" that sets the page's theme to `dark` when on and back
to the system's choice when off, and remembers it across visits.
:::solution
```tsx
import { onMount, state } from '@weft-js/core'
import { getDial, setDial, Switch } from '@weft-js/warp'

export function DarkToggle() {
  const dark = state(false)
  onMount(() => {
    dark.value = getDial('theme') === 'dark'
  })
  const flip = (e: Event & { currentTarget: HTMLInputElement }) => {
    dark.value = e.currentTarget.checked
    setDial('theme', dark.value ? 'dark' : 'auto', { persist: true })
  }
  return <Switch checked={dark.value} onChange={flip}>Dark mode</Switch>
}
```

`auto` removes the attribute, so turning it off hands the choice back to the system rather than forcing light. Add
`dialScript` to `site.head` so a saved `dark` is applied before the first paint.
:::

:::challenge A quiet panel in a vivid page
Your marketing page is `vivid`, but its pricing table should read calmly. Without touching the page's own dial, make the
section below quiet and compact.

```tsx
import { Card, Grid, Text } from '@weft-js/warp'

export function Pricing() {
  return (
    <section aria-label="Pricing">
      <Grid min="sm" gap="group">
        <Card title="Starter"><Text>$9 a month</Text></Card>
        <Card title="Team"><Text>$29 a month</Text></Card>
      </Grid>
    </section>
  )
}
```
:::solution
```tsx
import { Card, Grid, Text } from '@weft-js/warp'

export function Pricing() {
  return (
    <section aria-label="Pricing" data-expression="quiet" data-density="compact">
      <Grid min="sm" gap="group">
        <Card title="Starter"><Text>$9 a month</Text></Card>
        <Card title="Team"><Text>$29 a month</Text></Card>
      </Grid>
    </section>
  )
}
```

Dials nest, so the two attributes apply to everything inside the section and nothing outside it.
:::

:::challenge CSS that survives dark mode
This stylesheet looks right in light mode and wrong in dark. Rewrite it with tokens.

```css
.note { background: #fff8e1; color: #5d4037; border: 1px solid #ffe082; border-radius: 8px; }
```
:::solution
```css
.note {
  background: var(--warp-color-caution-soft);
  color: var(--warp-color-caution-text);
  border: var(--warp-border-hairline) solid var(--warp-color-caution-border);
  border-radius: var(--warp-radius-surface);
}
```

The pale yellow was a caution note, so the caution tone's soft fill, text and border say what it is. Each has a dark
value that keeps its contrast, which is what the raw colours lacked.
:::
