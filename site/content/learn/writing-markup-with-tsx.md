# Writing markup with TSX

:::learn
- Why Kerf puts markup and logic together in TSX
- How TSX differs from HTML: one root, closed tags, attribute names
- Which names Kerf accepts: `class` and `className`, `for` and `htmlFor`, events, `style`
- The kerf-specific attributes: `ref`, `bind:`, `textContent` and `innerHTML`
- How to turn a piece of HTML into TSX
:::

TSX is TypeScript with markup in it. It lets you write HTML-like tags inside a `.tsx` file, right next to the logic that
fills them in. Most of what you write is HTML you already know; this page covers the few rules that differ, and the
handful of attributes Kerf adds.

:::demo describe-markup

## Markup and logic together

The web grew up with content in HTML, design in CSS and logic in JavaScript, each in its own file. As pages became more
interactive, logic came to decide much of the content: whether a message shows, what a button says, which rows a table
has. So TSX puts them together. A component's markup and the logic that drives it live in the same function, and a
change to one is next to the other.

A sidebar component and a form component each keep their markup and logic together, and you can still keep their
styles where you like: see [Styling and style groups](/learn/styling).

TSX looks like HTML but it is stricter, and it can hold live values. Kerf's compiler reads it at build time and turns it
into the code that builds and updates the page (see [Your first component](/learn/your-first-component)). There is no
`React.createElement` and no virtual DOM: the tags you write become real DOM nodes, built once from a template.

## Converting HTML to TSX

Say you have this HTML and want it in a component:

```html
<h1>Hedy Lamarr's Todos</h1>
<img
  src="https://i.imgur.com/yXOvdOSs.jpg"
  alt="Hedy Lamarr"
  class="photo"
>
<ul>
    <li>Invent new traffic lights
    <li>Rehearse a movie scene
    <li>Improve the spectrum technology
</ul>
```

Pasting it into a component as it is doesn't compile:

<!-- example: skip deliberately invalid TSX, to show the error -->
```tsx
export default function TodoList() {
  return (
    // This doesn't compile
    <h1>Hedy Lamarr's Todos</h1>
    <img
      src="https://i.imgur.com/yXOvdOSs.jpg"
      alt="Hedy Lamarr"
      class="photo"
    >
    <ul>
      <li>Invent new traffic lights
      <li>Rehearse a movie scene
      <li>Improve the spectrum technology
    </ul>
  )
}
```

HTML forgives an unclosed `<li>` and two elements side by side. TSX doesn't. The compiler reports a syntax error as
**W000**, and nothing else in the file is checked until it's fixed, so fix these first. The rules below are what
change, and the fixed version is at the end of this section.

## The rules of TSX

### 1. Return a single root element

To return several elements from a component, wrap them in one parent. A `<div>` works:

```tsx
export function Todos() {
  return (
    <div>
      <h1>Hedy Lamarr's Todos</h1>
      <ul>
        <li>Invent new traffic lights</li>
      </ul>
    </div>
  )
}
```

If you don't want an extra `<div>` in the page, use a fragment, written `<>` and `</>`:

```tsx
export function Todos() {
  return (
    <>
      <h1>Hedy Lamarr's Todos</h1>
      <ul>
        <li>Invent new traffic lights</li>
      </ul>
    </>
  )
}
```

A fragment groups things without leaving any element of its own in the page.

:::deepdive Why one root?
A tag in TSX is an expression: it produces one value, as `1 + 2` does. A function can't return two values without
putting them in something, in the same way that `return 1 2` isn't JavaScript. A parent element or a fragment is that
something. In Kerf the value is the DOM nodes themselves: a fragment hands back its children as a list, and the place it
lands in puts them all in order.
:::

### 2. Close all the tags

Every tag must be closed. Tags that are empty in HTML, such as `<img>`, `<input>` and `<br>`, close themselves:
`<img />`, `<br />`. Tags that wrap content need their end tag: `<li>oranges</li>`.

### 3. Attribute names: both spellings work

HTML attributes are written in TSX as they are in HTML, and most are one lowercase word: `src`, `alt`, `href`,
`placeholder`. Where React renamed an attribute to suit JavaScript, Kerf accepts React's name as well, so code written
either way works:

| HTML | React's name | Kerf accepts |
|---|---|---|
| `class` | `className` | both |
| `for` | `htmlFor` | both |
| `tabindex` | `tabIndex` | both |
| `readonly`, `maxlength`, `colspan` | `readOnly`, `maxLength`, `colSpan` | both |
| `stroke-width` (SVG) | `strokeWidth` | both |

The compiler turns React's names into the real attribute at build time, so they cost nothing when the page runs. On SVG
elements, the camelCase presentation names (`strokeWidth`, `fillOpacity`, `clipPath`) become their dashed attributes,
and names that SVG itself spells in camelCase, such as `viewBox`, stay as written. The full list is in
[React prop names](/reference/react).

Two kinds of attribute keep their dashes: `aria-*` and `data-*`. Write `aria-label="Close"` and `data-tone="warn"`, as in
HTML.

:::pitfall `data-*` booleans are presence flags
`data-open={true}` writes `data-open=""`, and `data-open={false}` leaves the attribute off. React writes the strings
`"true"` and `"false"` instead. So in Kerf you select it with `[data-open]` in CSS, and `[data-open="true"]` never
matches. If you want React's output, pass a string: `data-open={String(open.value)}`. `kerf check` reports a literal
`{true}` or `{false}` here as **W043**, and its fix rewrites it to what it renders.
:::

### Booleans and missing values

A boolean attribute with no value, such as `<input disabled />`, is `true`. With braces, `disabled={false}` leaves the
attribute off entirely, and so do `null` and `undefined`. That's how you turn an attribute on and off:

```tsx
import { state } from '@kerf-js/core'

export function Send() {
  const sending = state(false)
  return (
    <button
      type="button"
      disabled={sending.value}
      onClick={() => (sending.value = true)}
    >
      {sending.value ? 'Sending…' : 'Send'}
    </button>
  )
}
```

A few attributes take the words `true` and `false` as values rather than meaning on or off: `aria-*`, `contentEditable`,
`spellCheck`, `draggable`. For those, Kerf writes `false` as the word, so `aria-pressed={false}` is
`aria-pressed="false"`.

### The fixed version

With one root, closed tags and the attribute names above, the HTML from the start of the page becomes:

```tsx
export default function TodoList() {
  return (
    <>
      <h1>Hedy Lamarr's Todos</h1>
      <img
        src="https://i.imgur.com/yXOvdOSs.jpg"
        alt="Hedy Lamarr"
        class="photo"
      />
      <ul>
        <li>Invent new traffic lights</li>
        <li>Rehearse a movie scene</li>
        <li>Improve the spectrum technology</li>
      </ul>
    </>
  )
}
```

:::note Pro tip: convert with your editor or an agent
Converting a large block of HTML by hand is tedious. Any HTML-to-JSX converter's output works in Kerf, since Kerf accepts
React's attribute names. An AI agent with `kerf check` in its loop will fix what's left: see
[Working with AI agents](/learn/working-with-agents).
:::

## Comments

HTML's `<!-- comment -->` isn't valid TSX. Inside markup, put a JavaScript comment in braces:

```tsx
export function Note() {
  return (
    <p>
      {/* This comment never reaches the page. */}
      Ship on Friday.
    </p>
  )
}
```

## Events

An attribute that starts with `on` and a capital letter is an event listener: `onClick`, `onInput`, `onKeyDown`,
`onPointerMove`. The compiler takes the part after `on`, lowercases it, and listens for that event, so `onKeyDown`
listens to `keydown`. A handler is a function, and its event's `currentTarget` is typed as the element it's on:

```tsx
import { state } from '@kerf-js/core'

export function Name() {
  const name = state('')
  return (
    <label>
      Your name{' '}
      <input
        value={name.value}
        onInput={(e) => (name.value = e.currentTarget.value)}
      />
    </label>
  )
}
```

A few names follow React rather than the DOM: `onDoubleClick` listens to `dblclick`, an `on…Capture` name such as
`onClickCapture` listens in the capture phase, and `onChange` fires on every edit, as it does in React, rather than when
the field loses focus. Common events such as clicks and key presses are delegated: one listener on the document serves
every element, so a list of a thousand buttons doesn't add a thousand listeners.
[Responding to events](/learn/responding-to-events) covers events in depth.

:::pitfall Pass the function, don't call it
`onClick={save}` passes the function, and the browser calls it on each click. `onClick={save()}` calls `save` once, while
the markup is being built, and passes whatever it returns. When you need an argument, wrap it:
`onClick={() => save(id)}`.
:::

## `style`

`style` takes a string, as in HTML, or an object, as in React:

```tsx
export function Swatch() {
  return (
    <>
      <p style="color: var(--veneer-color-accent-text)">
        A string, as in HTML
      </p>
      <p
        style={{
          color: 'var(--veneer-color-accent-text)',
          paddingInline: 'var(--veneer-space-group)',
        }}
      >
        An object
      </p>
    </>
  )
}
```

In the object, write names in camelCase (`paddingInline`) or kebab-case in quotes (`'padding-inline'`), and custom
properties as `'--name'`. A number gets `px` unless the property has no unit, such as `opacity` or `zIndex`, as in React.
`null`, `undefined` and booleans mean "no declaration", so `color: urgent && 'red'` sets the colour only when `urgent` is
true. When a value in the object reads state, only the declarations that changed are written.

:::note Styles in a Veneer app
In an app that uses Veneer, `kerf check` asks for Veneer's tokens (`var(--veneer-color-…)`, `var(--veneer-space-…)`) instead of
raw colours and lengths, so a theme or dark mode follows everywhere. [Styling and style groups](/learn/styling) shows the
better tool for most styling: style groups, which compile to class names.
:::

## `class` as a string or an object

`class` (or `className`) takes a string. It also takes an object whose keys are class names and whose values say
whether each is on, which saves building strings by hand:

```tsx
import { state } from '@kerf-js/core'

export function Tab(props: { label: string }) {
  const active = state(false)
  return (
    <button
      type="button"
      class={{ tab: true, active: active.value }}
      onClick={() => (active.value = !active.value)}
    >
      {props.label}
    </button>
  )
}
```

With the object form, Kerf adds and removes only the classes that changed, and leaves any other class on the element
alone.

## Attributes Kerf adds

### `ref`: the element itself

Sometimes you need the DOM element: to focus it, measure it or hand it to a library. `ref` gives it to you. Assign it to
a variable, or pass a function that receives it:

```tsx
import { onMount } from '@kerf-js/core'

export function Search() {
  let input!: HTMLInputElement
  onMount(() => input.focus())
  return <input ref={input} aria-label="Search" />
}
```

`ref={input}` assigns the element to `input` when it's made. There is no `useRef` and no `.current`: the variable is
the element. [Refs and the DOM](/learn/refs-and-the-dom) has more.

### `bind:` on a component prop

`<Stepper bind:value={guests} />` passes a box to a component prop so the child's writes reach it. It works on
components only: on an HTML element such as `<input bind:value={…}>` it's **W061**. For a field, read the value and
write it in a handler, as the `Name` example above does. [Writing to a parent with bind:](/learn/bind) explains the
whole idea.

### `textContent` and `innerHTML`

`textContent={text}` sets an element's text in one write. `innerHTML={html}`, and React's spelling
`dangerouslySetInnerHTML={{ __html: html }}`, set its HTML. An element with either can't have children too, because
they would replace them; the compiler reports it.

:::pitfall `innerHTML` isn't escaped
Text in braces is always escaped: `{comment}` shows `<script>` as those characters. `innerHTML` is the one way around
that: whatever string you give it is parsed as markup, so a value that came from a user can run script in your page.
Use it only for HTML you made or cleaned yourself. Kerf's own code bans it outright with a lint rule (`no-html-sink`)
unless a comment says why the HTML is safe, and these pages' demos follow that rule. To show formatted text from users,
build the elements, or use Veneer's `Markdown`.
:::

### `key`

`key` marks which item of a list an element belongs to, so the list can move rows instead of rebuilding them. It isn't
written to the page. [Rendering lists](/learn/rendering-lists) is where it matters.

## Types

TSX in Kerf is checked by TypeScript with Kerf's own JSX types. Each HTML element knows its events, so `e.currentTarget`
in `onInput` on an `<input>` is an `HTMLInputElement`. Other attributes are left open: any name with any value is
accepted, because HTML has hundreds of attributes and custom ones are common. So TypeScript won't catch a misspelt
attribute such as `palceholder`; the browser ignores it and so would you, until you look.

## Recap

- TSX keeps markup and the logic that fills it in one place, and compiles to real DOM nodes.
- Return one root: an element, or a fragment `<>…</>`.
- Close every tag; empty ones close themselves (`<br />`).
- HTML and React attribute names both work: `class` or `className`, `for` or `htmlFor`.
- `aria-*` and `data-*` keep their dashes; `data-*` booleans are presence flags (W043).
- `onX` attributes are events, `style` takes a string or an object, `class` takes a string or an object of flags.
- `ref` gives you the element, `bind:` works on component props only (W061), and `innerHTML` isn't escaped.

## Try it

:::challenge Convert some HTML to TSX
This was pasted from an HTML page and doesn't compile. Fix it.

<!-- example: skip the starting point, deliberately invalid -->
```tsx
export default function Bio() {
  return (
    <div class="intro">
      <h1>Welcome to my website!</h1>
    </div>
    <p class="summary">
      You can find my thoughts here.
      <br><br>
      <b>And <i>pictures</b></i> of scientists!
    </p>
  )
}
```
:::solution
There are three problems: two roots, unclosed `<br>` tags, and `<b>` and `<i>` closed in the wrong order.

```tsx
export default function Bio() {
  return (
    <>
      <div class="intro">
        <h1>Welcome to my website!</h1>
      </div>
      <p class="summary">
        You can find my thoughts here.
        <br />
        <br />
        <b>
          And <i>pictures</i>
        </b>{' '}
        of scientists!
      </p>
    </>
  )
}
```
`class` stays as it is: Kerf accepts it as well as `className`.
:::

:::challenge Fix the click handler
This button logs "Saved" once when the page loads, and never again. Why?

<!-- example: skip the starting point, deliberately wrong -->
```tsx
export function Save() {
  const save = () => console.log('Saved')
  return <button type="button" onClick={save()}>Save</button>
}
```
:::solution
`onClick={save()}` calls `save` while the button is being made and passes its result, `undefined`, as the handler. Pass
the function itself:

```tsx
export function Save() {
  const save = () => console.log('Saved')
  return (
    <button type="button" onClick={save}>
      Save
    </button>
  )
}
```
:::

:::challenge A flag CSS can select
This menu should be styled by `.menu[data-open]` while it's open, but the rule never matches when it's closed either
way, and `kerf check` warns about the attribute. Make `data-open` follow the `open` box.

<!-- example: skip the starting point, which reports W043 -->
```tsx
import { state } from '@kerf-js/core'

export function Menu() {
  const open = state(false)
  return (
    <div class="menu" data-open={true}>
      <button
        type="button"
        onClick={() => (open.value = !open.value)}
      >
        Menu
      </button>
    </div>
  )
}
```
:::solution
A literal `{true}` is always on, which is what W043 points out. Read the box instead: `true` writes `data-open=""` and
`false` removes it, which is what `[data-open]` selects.

```tsx
import { state } from '@kerf-js/core'

export function Menu() {
  const open = state(false)
  return (
    <div class="menu" data-open={open.value}>
      <button
        type="button"
        onClick={() => (open.value = !open.value)}
      >
        Menu
      </button>
    </div>
  )
}
```
:::
