# Forms and inputs

:::learn
- How to tie a text field, number, checkbox, radio, select and textarea to state
- When to keep an input's value in a box, and when to let the browser keep it
- Which Veneer control takes which props, and which ones take the box itself
- How to submit a form in the browser, and where server forms come in
:::

Most interactivity ends in a form: a search box, a settings page, a checkout. You already have the pieces: a box holds
the value, the input reads it, and a handler writes it. This page goes through each kind of input, first as the browser's
own element and then as its Veneer control, and ends with submitting.

:::demo interact-controls

## A field tied to a box

The pattern for every input is the same two halves: the input shows the box with `value`, and a handler writes the box
when the user changes it.

```tsx
import { state } from '@kerf-js/core'

export function Search() {
  const query = state('')
  return (
    <label>
      Search <input
        value={query.value}
        onInput={e => (query.value = e.currentTarget.value)}
      />
      <p>
        {query.value
          ? `Looking for “${query.value}”`
          : 'Type to search'}
      </p>
    </label>
  )
}
```

Now the box always holds what's in the field, so anything else can read it: the paragraph, a `derived` that filters a
list, a button that's only enabled when the field isn't empty. And a write from anywhere else, `query.value = ''` in a
Clear button, shows in the field.

`value`, `checked` and `selected` are written as DOM properties, not attributes. The attribute is only the starting
value: after someone types, setting the attribute no longer changes what the field shows, and the property does. Kerf
handles that for you.

In React this is a *controlled input*. One difference to know: React puts the field back to the state's value after
every keystroke, so an input with a `value` and no handler can't be typed in. Kerf writes the field only when the box
changes. That matters in one case, covered in the pitfall below.

:::pitfall A handler that refuses a change
Kerf writes `value` to the field when the box changes, and not otherwise. A handler that *rejects* an edit, by not
writing or by writing what the box already held, leaves the user's typing on screen:

```tsx
onInput={e => {
  const digits = e.currentTarget.value.replace(/\D/g, '')
  // "12" again after typing "12a": the box didn't change.
  code.value = digits
  e.currentTarget.value = code.value // put the field back yourself
}}
```

When the handler always accepts what was typed, or changes it into something new, you don't need the last line.
:::

### Letting the browser keep the value

Not every field needs a box. If nothing reads the value until the form is submitted, let the field keep it and read it
then, with `FormData` (see Submitting a form, below). Give such a field a starting value with
`defaultValue`, or `defaultChecked` for a checkbox: those set the initial value and leave the field alone after.

Keep a value in a box when something on the page reacts to it as it changes: a character count, a filtered list, a
button that enables, another field that depends on it. Otherwise the browser holding it is fine, and less code.

## Each kind of input

The browser's own elements work as below. In an app that uses Veneer, `kerf check` suggests Veneer's control instead of a
browser-drawn `<select>`, `<textarea>`, number input and the like (**D005**): Veneer's draw the same in every browser, with
the focus ring and touch targets of the rest of the app. Each section shows both.

### Text and textarea

`value` and `onInput`, as above. `e.currentTarget.value` is a string. A `<textarea>` works the same way: in TSX it takes a
`value` like an input, not children.

Veneer's `Input` and `Textarea` take the same two props, plus a `label`, which they need:

```tsx
import { state } from '@kerf-js/core'
import { Input, Textarea } from '@kerf-js/veneer'

export function Note() {
  const title = state('')
  const body = state('')
  return (
    <form>
      <Input
        label="Title"
        value={title.value}
        onInput={e => (title.value = e.currentTarget.value)}
      />
      <Textarea
        label="Note"
        rows={4}
        value={body.value}
        onInput={e => (body.value = e.currentTarget.value)}
      />
      <p>{body.value.length} characters</p>
    </form>
  )
}
```

Every other attribute you give them, such as `type="email"`, `name`, `required` or `autocomplete`, goes to the real
`<input>` or `<textarea>` inside.

### Numbers

A field's value is always a string, even for `type="number"`. Convert it as you read it. `valueAsNumber` gives a number,
or `NaN` when the field is empty or not a number:

```tsx
import { state } from '@kerf-js/core'

export function Quantity() {
  const qty = state(1)
  const updateQuantity = (
    e: Event & {
      currentTarget: HTMLInputElement
    },
  ) => {
    const n = e.currentTarget.valueAsNumber
    if (!Number.isNaN(n)) qty.value = n
  }
  return (
    <label>
      Quantity{' '}
      <input
        type="number"
        min={1}
        value={qty.value}
        onInput={updateQuantity}
      />
      <p>Total ${qty.value * 12}</p>
    </label>
  )
}
```

Veneer's `NumberField` holds a `number | null`, with `null` for empty, and takes the box itself as `value`. It writes the box
as the user types, steps or presses the arrow keys:

```tsx
import { state } from '@kerf-js/core'
import { NumberField } from '@kerf-js/veneer'

export function Quantity() {
  const qty = state<number | null>(1)
  return (
    <section>
      <NumberField
        label="Quantity"
        min={1}
        max={20}
        value={qty}
      />
      <p>Total ${(qty.value ?? 0) * 12}</p>
    </section>
  )
}
```

`Slider` takes a number and an `onChange` that receives the new number: `value={volume.value} onChange={v => (volume.value = v)}`.

### Checkboxes and switches

A checkbox's value is `checked`, a boolean, and `onChange` fires when it flips:

```tsx
import { state } from '@kerf-js/core'

export function Terms() {
  const agreed = state(false)
  return (
    <label>
      <input
        type="checkbox"
        checked={agreed.value}
        onChange={e => (agreed.value = e.currentTarget.checked)}
      />
      I agree
      <p>{agreed.value ? 'Thanks!' : 'Please tick the box.'}</p>
    </label>
  )
}
```

Veneer's `Checkbox` and `Switch` are a real checkbox inside, and pass `checked` and `onChange` to it. Their extra props are
typed loosely, so give the handler's event a type:

```tsx
import { state } from '@kerf-js/core'
import { Checkbox, Switch } from '@kerf-js/veneer'

type Toggle = Event & { currentTarget: HTMLInputElement }

export function Prefs() {
  const agreed = state(false)
  const dark = state(false)
  return (
    <section>
      <Checkbox
        checked={agreed.value}
        onChange={(e: Toggle) =>
          (agreed.value = e.currentTarget.checked)}
      >
        I agree to the terms
      </Checkbox>
      <Switch
        checked={dark.value}
        onChange={(e: Toggle) =>
          (dark.value = e.currentTarget.checked)}
      >
        Dark mode
      </Switch>
    </section>
  )
}
```

Use a switch for a setting that applies at once, and a checkbox for a choice that's submitted with a form.

### Radio buttons

Radio buttons that share a `name` form a group. Each one is `checked` when the box holds its value:

```tsx
import { state } from '@kerf-js/core'

const sizes = ['small', 'medium', 'large'] as const

export function SizePicker() {
  const size = state<(typeof sizes)[number]>('medium')
  return (
    <fieldset>
      <legend>Size</legend>
      {sizes.map(s => (
        <label key={s}>
          <input
            type="radio"
            name="size"
            value={s}
            checked={size.value === s}
            onChange={() => (size.value = s)}
          /> {s}
        </label>
      ))}
    </fieldset>
  )
}
```

Veneer's `RadioGroup` does that wiring for you. It takes the current `value`, an `onChange` that receives the picked value
(not an event), and the `options`. `Segmented` takes the same props and draws them as a row of segments:

```tsx
import { state } from '@kerf-js/core'
import { RadioGroup } from '@kerf-js/veneer'

type Size = 'small' | 'medium' | 'large'

export function SizePicker() {
  const size = state<Size>('medium')
  return (
    <RadioGroup
      label="Size"
      value={size.value}
      onChange={v => (size.value = v)}
      options={[
        { value: 'small', label: 'Small' },
        { value: 'medium', label: 'Medium' },
        { value: 'large', label: 'Large' },
      ]}
    />
  )
}
```

### Select

A `<select>` takes `value` and `onChange`, like a text field:

```tsx
import { state } from '@kerf-js/core'

export function Milk() {
  const milk = state('oat')
  return (
    <label>
      Milk{' '}
      <select
        value={milk.value}
        onChange={e => (milk.value = e.currentTarget.value)}
      >
        <option value="oat">Oat</option>
        <option value="whole">Whole</option>
        <option value="none">None</option>
      </select>
    </label>
  )
}
```

The compiler writes a select's `value` after its options exist, so the right option is selected even when the options
come from a list.

Veneer's `Select` takes `options` as data and, like `NumberField`, the box itself as `value`. A real `<select>` stays inside
it, so a form posts, resets and validates as it would with the browser's:

```tsx
import { state } from '@kerf-js/core'
import { Select } from '@kerf-js/veneer'

export function Milk() {
  const milk = state<string | null>('oat')
  return (
    <section>
      <Select
        label="Milk"
        value={milk}
        options={[
          { value: 'oat', label: 'Oat' },
          { value: 'whole', label: 'Whole' },
          { value: 'none', label: 'None' },
        ]}
      />
      <p>
        {milk.value === 'none'
          ? 'Black'
          : `With ${milk.value ?? 'no'} milk`}
      </p>
    </section>
  )
}
```

### Which Veneer control takes what

| Control | Value | How it writes |
|---|---|---|
| `Input`, `Textarea`, `Search` | `value={box.value}` (a string) | `onInput={e => …}`, an event |
| `Checkbox`, `Switch` | `checked={box.value}` | `onChange={e => …}`, an event |
| `RadioGroup`, `Segmented` | `value={box.value}` | `onChange={v => …}`, the value |
| `Slider` | `value={box.value}` (a number, or two) | `onChange={v => …}`, the value |
| `Select`, `NumberField`, the date and time fields | `value={box}`, the box itself | Writes the box. Or `value` plus `onValueChange`, or `defaultValue` |

The last row is Veneer's `Bindable` props: a control that takes the box writes it, so there's no handler to write. `bind:`
isn't needed for them, and isn't what they expect: see [Writing to a parent with bind:](/learn/bind).

## Submitting a form

A `<form>` gives you three things for free: Enter in a field submits it, the browser checks `required`, `type="email"`,
`min`, `pattern` and the rest before it does, and a reset button empties it. Handle `onSubmit` on the form, not `onClick`
on the button, and you get all three:

:::demo interact-submit

The handler does three things:

1. **`e.preventDefault()`.** Without it, the browser posts the form to the page's URL and loads the answer as a new page.
2. **Reads the fields with `FormData`.** `new FormData(e.currentTarget)` collects every named field in the form. No boxes
   needed: the browser kept the values.
3. **Holds state for the request**, `sending` and `joined`, so the page can show progress and the result.

The browser checks `required` and `type="email"` before `onSubmit` runs: press Join with the field empty and the handler
never runs. Veneer's fields show the browser's message in their own error style.

Nothing waits for a promise an event handler returns, and a rejected one goes unhandled. So keep the submit handler
itself synchronous, as the demo does: call `preventDefault()` first, then start the async work with `void join(email)`,
and handle failure inside `join`.

:::note Disable while sending
Disabling the button while a request is out stops a second submit. Disabling the *fields* too, as the demo does, shows
that the form is busy, but read `FormData` before you disable them: disabled fields aren't part of the form's data.
:::

### Server forms

A form that saves to your own server doesn't need any of this by hand. With `@kerf-js/start`, `<Form of={addTodo}>` posts
to a server mutation: it validates the input with the mutation's schema, shows errors next to each field, tracks
`pending`, resets after a success, and still works before the page's JavaScript has loaded or with it turned off.
[Forms and validation](/learn/forms-and-validation) covers it.

The browser-side handling on this page is for everything else: a form that filters a list, talks to a third-party API,
or never leaves the page.

## Recap

- Tie an input to a box with two halves: `value={box.value}` to show it, a handler to write it.
- Kerf writes the field only when the box changes. A handler that rejects an edit puts the field back itself.
- Let the browser keep a value, with `defaultValue` and `FormData`, when nothing reads it before submit.
- Checkboxes use `checked` and `onChange`; radios share a `name` and compare with the box; a select takes `value`.
- In a Veneer app, use Veneer's controls (**D005**). Text and choice controls take a value and a handler; `Select`,
  `NumberField` and the date fields take the box itself.
- Submit with `onSubmit` on the form, `e.preventDefault()`, and `FormData`. For server forms, use `Form` from
  `@kerf-js/start`.

## Try it

:::challenge A live character limit
Add a counter under this textarea that shows how many of 140 characters are left, turns into an error past the limit,
and disables the Post button when the text is empty or too long.

```tsx
import { state } from '@kerf-js/core'
import { Button, Textarea } from '@kerf-js/veneer'

export function Compose() {
  const text = state('')
  return (
    <form>
      <Textarea
        label="What's happening?"
        value={text.value}
        onInput={e => (text.value = e.currentTarget.value)}
      />
      <Button type="submit">Post</Button>
    </form>
  )
}
```
:::solution
```tsx
import { derived, state } from '@kerf-js/core'
import { Button, Textarea } from '@kerf-js/veneer'

export function Compose() {
  const text = state('')
  const left = derived(() => 140 - text.value.length)
  return (
    <form>
      <Textarea
        label="What's happening?"
        value={text.value}
        hint={`${left.value} left`}
        error={left.value < 0 ? `${-left.value} too many` : undefined}
        onInput={e => (text.value = e.currentTarget.value)}
      />
      <Button
        type="submit"
        disabled={!text.value.trim() || left.value < 0}
      >
        Post
      </Button>
    </form>
  )
}
```

`left` is worked out from the box, so it can't go stale. The hint, the error and the button all read it.
:::

:::challenge Read a form on submit
This sign-up form keeps nothing in state. Make it show "Welcome, <name>!" in place of the form after it's submitted,
reading the name from the form itself.

```tsx
import { Button, Input } from '@kerf-js/veneer'

export function SignUp() {
  return (
    <form>
      <Input
        label="Name"
        name="name"
        required
      />
      <Button type="submit">Sign up</Button>
    </form>
  )
}
```
:::solution
```tsx
import { state } from '@kerf-js/core'
import { Button, Input } from '@kerf-js/veneer'

export function SignUp() {
  const name = state<string | null>(null)
  const submit = (
    e: SubmitEvent & { currentTarget: HTMLFormElement },
  ) => {
    e.preventDefault()
    const given = new FormData(e.currentTarget).get('name')
    if (typeof given === 'string') name.value = given
  }
  return (
    <section>
      {name.value
        ? <p>Welcome, {name.value}!</p>
        : (
          <form onSubmit={submit}>
            <Input
              label="Name"
              name="name"
              required
            />
            <Button type="submit">Sign up</Button>
          </form>
        )}
    </section>
  )
}
```

The field keeps its own value until submit; only the result needs a box. `required` means the handler never sees an empty
name.
:::

:::challenge Digits only
Make this field accept digits only: typing a letter should leave the field as it was.

```tsx
import { state } from '@kerf-js/core'
import { Input } from '@kerf-js/veneer'

export function Pin() {
  const pin = state('')
  return <Input
    label="PIN"
    inputmode="numeric"
    value={pin.value}
    onInput={e => (pin.value = e.currentTarget.value)}
  />
}
```
:::solution
```tsx
import { state } from '@kerf-js/core'
import { Input } from '@kerf-js/veneer'

export function Pin() {
  const pin = state('')
  const updatePin = (
    e: Event & {
      currentTarget: HTMLInputElement
    },
  ) => {
    pin.value = e.currentTarget.value.replace(/\D/g, '')
    e.currentTarget.value = pin.value
  }
  return (
    <Input
      label="PIN"
      inputmode="numeric"
      value={pin.value}
      onInput={updatePin}
    />
  )
}
```

Stripping the letter leaves the box as it was, so Kerf has nothing to write to the field. The handler puts the field back
to the box itself.
:::
