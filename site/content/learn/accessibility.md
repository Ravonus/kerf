# Accessibility

:::learn
- What Warp does for you: native elements, names, keyboard support and focus management
- What you still own: structure, words, and anything you build from plain elements
- Which diagnostics catch accessibility mistakes, and how to read them
- How to test it: role and label queries, the keyboard, and a screen reader
:::

An accessible app is one that works for someone using a keyboard, a screen reader, a switch, voice control, 200% zoom,
forced colours or reduced motion. Most of that is decided by small things: whether a control is a real `<button>`,
whether a field has a name, where focus goes when a dialog closes.

Weft splits the work. Warp's components handle the parts that are hard to get right and easy to get wrong, like
keyboard patterns and focus, and `weft check` catches the common mistakes in the markup you write yourself. What's left
is what no library can do for you: the words, the structure, and the order things happen in.

:::demo style-keyboard

## What Warp does for you

### Real elements

A Warp `Button` is a `<button>`. `Input` is an `<input>` with a `<label>`. `Modal` is a native `<dialog>` opened with
`showModal()`. `Switch` and `Checkbox` are real checkboxes. Building on native elements means the browser and assistive
technology already know what each thing is: Enter and Space press a button, a disabled control leaves the tab order,
and a form posts its fields with no script. This is why, in a Warp app, `weft check` suggests the Warp component when it
finds a bare `<button>` or `<select>` (D005): the component gives you the same element with the behaviour around it
finished.

### Names

Every control needs an accessible name, the words a screen reader says for it. Warp makes the name part of the API, so
you can't forget it:

- Fields take a required `label`. TypeScript reports a field without one.
- An icon-only `Button` or `Toggle` takes `label`, which becomes its `aria-label`.
- `Table` requires a `caption`; `captionHidden` hides it on screen but keeps it for screen readers.
- `Tabs`, `Segmented` and `RadioGroup` require a `label` for the group.
- `<Surface>` requires a `label`, or `decorative` if the canvas is only ornament (X009).

A field's `hint` and `error` are tied to it with `aria-describedby`, and `error` sets `aria-invalid`, so a screen reader
hears the message with the field instead of having to find it.

:::demo style-labels

### Keyboard

Composite widgets follow the WAI-ARIA Authoring Practices patterns, so they work the way screen reader and keyboard
users expect:

| Component | Keys |
|---|---|
| `Menu` | Enter, Space or ↓ opens at the first item, ↑ at the last; ↑/↓ wrap; Home/End jump; typing a letter jumps to an item; Escape closes and returns to the trigger; Tab closes and moves on |
| `Tabs` | ←/→ move between tabs and show each one; Home/End jump; one tab stop for the whole list; right-to-left flips the arrows |
| `Segmented`, `RadioGroup` | the arrows move the choice; one tab stop |
| `Modal`, `Drawer` | Tab stays inside; Escape closes |
| `Table` | sortable headers are buttons; the filter is a labelled search field |

Each component's page on the site has its own keyboard table, for example [Menu](/components/menu) and
[Tabs](/components/tabs).

The "one tab stop" pattern is **roving focus**: Tab enters the group once, the arrow keys move inside it, and Tab leaves.
A toolbar of twelve buttons costs a keyboard user one Tab, not twelve. warp-core exports it as `roving` for your own
markup, as [Using Warp](/learn/warp#warp-core-on-its-own) shows.

### Focus management

Where focus goes after something opens or closes is the part most often missed:

- `Modal` moves focus inside when it opens: to the element with `autofocus`, or else to the title. When it closes, by
  any path (Escape, the backdrop, a `data-close` button, or your code setting the box to `false`), focus goes back to
  whatever opened it.
- `Menu` puts focus on the first or last item when it opens, and back on its trigger when it closes.
- Overlays stack. Escape closes the topmost one only, so a menu inside a dialog closes before the dialog does.
- Toasts from a mounted `Toaster` are announced through a live region (`role="status"`, or `role="alert"` for a
  critical one) without stealing focus.

### The look

- **Contrast.** Every text and fill pair in Warp's tokens meets WCAG contrast at every dial stop, light and dark, and a
  seed or token override that breaks one fails the build (D010).
- **Focus ring.** Every interactive component draws a visible focus ring from `--warp-color-focus`, on `:focus-visible`.
- **Targets.** On a touch screen, controls are at least 44 pixels tall.
- **Forced colours.** Warp redraws its parts in system colours when Windows' high-contrast mode is on.
- **Motion.** Under `prefers-reduced-motion` (or `data-motion="reduce"`), an animation runs at most once, nothing loops
  but an opacity pulse, and the action icons hold still.

Warp's own test suite runs axe-core over every component in a real browser at all twelve combinations of expression,
theme and motion, so these hold for the components you import.

:::note React developers
In React you'd usually reach for a headless library like React Aria or Radix for the keyboard and focus work, and
`eslint-plugin-jsx-a11y` for the markup checks. In Weft, the first is warp-core (and Warp on top of it), and the second
is built into `weft check` as the D-codes below. There is nothing to install or configure.
:::

## What you still own

### Structure

Screen reader users move through a page by its headings and landmarks, so those have to be right:

- **Headings in order.** One `h1` per page, then `h2` for sections, `h3` inside those. A jump from `h1` to `h3` is D035.
  `Heading` takes `level` for the outline and picks the look from it, so you never choose a level for its size.
- **Landmarks.** Put the page's main content in `<main>`, navigation in `<nav>` with an `aria-label` if there's more
  than one, and use `<header>`, `<footer>` and `<aside>` for what they are. `Stack as="main"` and the other layout
  primitives' `as` prop give you these elements.
- **Language.** `<html lang>` tells a screen reader which voice to use. Weft writes it from your config's
  `site.locale`; a hand-written `<html>` without one is D039.

```tsx
import { Heading, Stack, Text } from '@weft-js/warp'

export function OrdersPage() {
  return (
    <Stack as="main" gap="section">
      <Heading level={1}>Orders</Heading>
      <Stack
        as="section"
        gap="related"
        aria-labelledby="today"
      >
        <Heading level={2} id="today">Today</Heading>
        <Text>12 orders to ship.</Text>
      </Stack>
    </Stack>
  )
}
```

### Words

No component can write these for you:

- **Labels that say what.** "Email" not "Input 1"; "Delete project" not "Delete" when there are several things to delete.
- **Errors that say how to fix it.** "Enter an email address, like ana@example.com" beats "Invalid".
- **Alt text that says why the image is there.** A product photo's `alt` names the product; a decorative swirl gets
  `alt=""` so it's skipped. An `<img>` with no `alt` at all is D032, because a screen reader then reads the file name.
- **Link text that makes sense alone.** Screen reader users often list a page's links. Ten links that say "here" are
  no help.

### Your own markup

Whatever you build from plain elements is yours to get right. The commonest mistake is a click handler on something
that isn't a control:

```tsx
import { state } from '@weft-js/core'
import { Button, Text } from '@weft-js/warp'

export function Reveal() {
  const open = state(false)
  return (
    <>
      <Button
        emphasis="link"
        aria-expanded={open.value}
        onClick={() => (open.value = !open.value)}
      >
        Shipping details
      </Button>
      {open.value && (
        <Text>Roasted on Monday, shipped on Tuesday.</Text>
      )}
    </>
  )
}
```

A `<div onClick>` in its place works with a mouse and with nothing else: it can't be focused, Enter does nothing, and a
screen reader doesn't say it's clickable. That's D033. A real button gets all three, and `aria-expanded` tells a screen
reader whether the details are showing.

:::pitfall `role="button"` isn't a button
Adding `role="button"` to a `<div>` changes what a screen reader *says*, not what the element *does*. You'd still have to
add `tabindex="0"`, handle Enter and Space yourself, and handle the disabled state. Use `Button`, or a `<button>` in an app
without Warp, and get all of it from the browser.
:::

### What happens after an action

When something on the page changes because of what the user did, think about where their focus and attention are:

- After deleting a row, focus shouldn't vanish with it. Move it to the next row, or to the list's heading.
- After saving, a toast (`toast.show({ title: 'Saved' })`) announces the result without moving focus.
- After loading more results, keep focus where it was; announce the count if it matters.

## The diagnostics

`weft check` reads your markup and CSS for the mistakes it can see. These run in every app, Warp or not:

| Code | Catches |
|---|---|
| D030 | An `<input>`, `<select>` or `<textarea>` with no label |
| D031 | A button or link with no accessible name: an icon only, or empty |
| D032 | An `<img>` with no `alt` |
| D033 | `onClick` on an element that isn't interactive: mouse only |
| D034 | A control inside a control, like a `<button>` in an `<a>` |
| D035 | A heading level that jumps (h1 to h3) |
| D036 | The focus ring removed with nothing in its place (`outline: none`) |
| D037 | A positive `tabindex`, which reorders the page's Tab order |
| D039 | `<html>` with no `lang` |
| D011 | A literal text and background colour pair below 4.5:1 |

A few more catch accessibility problems in other places: X005, X006 and X008 are text that doesn't grow with zoom or a
viewport that blocks pinch zoom; X009 is an unnamed canvas surface; X041 is per-character spans a screen reader would
spell out letter by letter. Each code has a page under [Diagnostics](/reference/diagnostics) with the fix.

Each message names the WCAG criterion it's about:

```
D031 6: <Button> has no name a screen reader can read:
  only an icon, or nothing (WCAG 4.1.2).
```

`weft fix` applies the ones with a safe fix, like turning a positive `tabindex` into `0`. A fix that changes an element,
like a `<div onClick>` into a button, comes back as a suggested edit.

:::pitfall A clean `weft check` isn't an accessible app
These checks catch what can be seen in the source: a missing name, a removed focus ring. They can't tell whether the
name is *right*, whether the tab order makes sense, or whether focus lands somewhere useful after a delete. Treat them as
the floor, and test the rest by using the app the way your users do.
:::

## Testing it

### Query by role and name

`@weft-js/core/test` has role, label and text queries and nothing else: no test ids, no CSS selectors. That's on
purpose. A test that finds a button by its role and name fails when the button loses its name, so every test you write
checks accessibility a little:

```tsx
import { state } from '@weft-js/core'
import { render, screen, user } from '@weft-js/core/test'
import { Button, Text } from '@weft-js/warp'
import { expect, test } from 'vitest'

function Favourite() {
  const on = state(false)
  return (
    <>
      <Button
        emphasis="ghost"
        icon="star"
        label="Favourite"
        aria-pressed={on.value}
        onClick={() => (on.value = !on.value)}
      />
      <Text>{on.value ? 'Saved to favourites' : 'Not saved'}</Text>
    </>
  )
}

test('the star is a named toggle', async () => {
  render(Favourite)
  const star = screen.getByRole('button', { name: 'Favourite' })
  expect(star.getAttribute('aria-pressed')).toBe('false')
  await user.click(star)
  expect(star.getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByText('Saved to favourites')).toBeTruthy()
})
```

If someone drops `label="Favourite"`, `getByRole('button', { name: 'Favourite' })` finds nothing and the test fails,
which is exactly what a screen reader user would have found.

### Test the keyboard path

`user.tab()` and `user.keyboard()` drive the keyboard. Check that Tab reaches each control in a sensible order and that
the keys do what they say:

```tsx
import { render, screen, user } from '@weft-js/core/test'
import { Button, Input, Stack } from '@weft-js/warp'
import { expect, test } from 'vitest'

function SignIn() {
  return (
    <form>
      <Stack gap="related">
        <Input label="Email" type="email" />
        <Input label="Password" type="password" />
        <Button type="submit">Sign in</Button>
      </Stack>
    </form>
  )
}

test('Tab goes email, password, then the button', async () => {
  render(SignIn)
  await user.tab()
  expect(document.activeElement).toBe(
    screen.getByRole('textbox', { name: 'Email' }),
  )
  await user.tab()
  expect(document.activeElement).toBe(
    screen.getByLabelText('Password'),
  )
  await user.tab()
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: 'Sign in' }),
  )
})
```

[Testing](/learn/testing) covers `render`, `user` and the rest.

### Use it yourself

Automated tests can't hear a page. Before a release, spend five minutes on each of these:

- **Keyboard only.** Unplug the mouse. Can you reach and use everything? Can you always see where focus is?
- **A screen reader.** VoiceOver (⌘F5 on a Mac), NVDA on Windows, or TalkBack on Android. Move by headings, then by
  form controls. Does each thing say what it is?
- **200% zoom** and a narrow window. Does the text grow, and does anything get cut off?
- **The dials.** `?theme=dark&motion=reduce&expression=quiet` in the address bar sets them for one page (with
  `dialsFromUrl` from `@weft-js/warp-core`, if your app calls it), or set them with the
  [dial attributes](/learn/theming).

## Recap

- Warp's components are native elements with names, keyboard patterns and focus management built in, and their tokens
  pass contrast at every dial stop.
- You own the structure (headings, landmarks, `lang`), the words (labels, errors, alt text) and anything built from plain
  elements.
- `weft check` reports the mistakes it can see as D030–D039 and D011, each with its WCAG criterion.
- Find elements by role and name in tests, so a lost name fails a test. Then use the app with a keyboard and a screen
  reader.

## Try it

:::challenge A clickable card
This card opens a product when clicked, but `weft check` reports D033 and a keyboard user can't open it. Fix it without
changing how it looks to a mouse user.

<!-- example: skip the challenge's starting code, which has D033 on purpose -->
```tsx
export function ProductCard(
  props: { name: string; onOpen: () => void },
) {
  return (
    <div class="product" onClick={props.onOpen}>
      {props.name}
    </div>
  )
}
```
:::solution
```tsx
import { Card } from '@weft-js/warp'

export function ProductCard(
  props: { name: string; onOpen: () => void },
) {
  return <Card title={props.name} onClick={props.onOpen} />
}
```

A `Card` with `onClick` renders as a real `<button>`, so it's focusable, Enter and Space open it, and a screen reader
announces it as a button named after its title. If the card goes to another page, give it `href` instead, and it
becomes a link.
:::

:::challenge Name the search
This search field has a placeholder but no label, so a screen reader announces only "search field".

<!-- example: skip the challenge's starting code, which has D030 on purpose -->
```tsx
export function SiteSearch() {
  return (
    <form role="search">
      <input type="search" placeholder="Search products" />
    </form>
  )
}
```
:::solution
```tsx
import { Search } from '@weft-js/warp'

export function SiteSearch() {
  return (
    <form role="search">
      <Search label="Search products" />
    </form>
  )
}
```

`label` is required on Warp's fields, so the name can't be left out. A placeholder isn't a name: it disappears as soon
as you type, and many screen readers don't read it.
:::

:::challenge Prove the dialog gives focus back
Write a test for this component: open the dialog with the button, close it with Done, and check that focus is back on
the button that opened it.

```tsx
import { state } from '@weft-js/core'
import { Button, Modal, Text } from '@weft-js/warp'

export function Terms() {
  const open = state(false)
  return (
    <>
      <Button
        emphasis="outline"
        tone="neutral"
        onClick={() => (open.value = true)}
      >
        Read the terms
      </Button>
      <Modal
        open={open}
        title="Terms"
        footer={<Button data-close="">Done</Button>}
      >
        <Text>Be kind.</Text>
      </Modal>
    </>
  )
}
```
:::solution
```tsx
import { state } from '@weft-js/core'
import { render, screen, user } from '@weft-js/core/test'
import { Button, Modal, Text } from '@weft-js/warp'
import { expect, test } from 'vitest'

function Terms() {
  const open = state(false)
  return (
    <>
      <Button
        emphasis="outline"
        tone="neutral"
        onClick={() => (open.value = true)}
      >
        Read the terms
      </Button>
      <Modal
        open={open}
        title="Terms"
        footer={<Button data-close="">Done</Button>}
      >
        <Text>Be kind.</Text>
      </Modal>
    </>
  )
}

test('closing the terms puts focus back on the button', async () => {
  render(Terms)
  const opener = screen.getByRole('button', {
    name: 'Read the terms',
  })
  await user.click(opener)
  await user.click(screen.getByRole('button', { name: 'Done' }))
  expect(document.activeElement).toBe(opener)
})
```

The test reads like what a keyboard user does, and it finds both buttons by role and name. If a later change broke
focus return, or dropped the button's text, this test would say so.
:::
