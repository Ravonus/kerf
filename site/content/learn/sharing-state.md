# Sharing state between components

:::learn
- How to share state between components by lifting it up to their parent
- How `bind:` and passing a box let a child write to shared state
- What "a single source of truth" means for each piece of state
- Where a component's state lives, and how to reset it for a new subject
:::

Sometimes two components need to change together. Keep the state in one place, their closest common parent, and pass it
down to both. This is called *lifting state up*, and it works in Kerf the same way it does in React, with one extra tool:
`bind:`, which lets a child write to its parent's state without a callback.

## Lifting state up by example

Here a parent shows two panels. Only one should be open at a time: opening the second closes the first.

:::demo manage-accordion

If each panel kept its own `open` box, they couldn't know about each other. Opening one would leave the other open too.
To coordinate them, take three steps.

### Step 1: remove the state from the children

A panel that owns its own state looks like this:

```tsx
import { state } from '@kerf/core'

export function Panel(
  props: { title: string; children?: unknown },
) {
  const open = state(false)
  return (
    <section>
      <h3>{props.title}</h3>
      {open.value
        ? <p>{props.children}</p>
        : (
          <button
            type="button"
            onClick={() => (open.value = true)}
          >
            Show
          </button>
        )}
    </section>
  )
}
```

Replace the box with a prop that the parent sets: `active: boolean`. The panel no longer decides whether it's open.

### Step 2: pass the value from the parent

The parent now says which panel is active. Try it with a constant first: `<Panel active={true}>` and
`<Panel active={false}>`. Each panel shows what it's told.

### Step 3: add state to the parent

Lifting state up often changes what the state *is*. Two booleans become one number: the index of the open panel. The
parent holds it, and gives each panel a way to ask to be opened:

```tsx
import { state } from '@kerf/core'

function Panel(
  props: {
    title: string
    active: boolean
    onShow: () => void
    children?: unknown
  },
) {
  return (
    <section>
      <h3>{props.title}</h3>
      {props.active
        ? <p>{props.children}</p>
        : (
          <button type="button" onClick={props.onShow}>
            Show
          </button>
        )}
    </section>
  )
}

export function Accordion() {
  const open = state(0)
  return (
    <>
      <Panel
        title="About"
        active={open.value === 0}
        onShow={() => (open.value = 0)}
      >
        Seven hills.
      </Panel>
      <Panel
        title="Getting around"
        active={open.value === 1}
        onShow={() => (open.value = 1)}
      >
        Yellow trams.
      </Panel>
    </>
  )
}
```

`open.value === 0` is an expression in JSX, so it's live: when `open` changes, each panel's `active` prop follows, and
only the parts of each panel that read `props.active` update. Neither `Panel` runs again.

:::note Props are live in Kerf
In React, a new prop value means the child renders again. In Kerf the child ran once, and its props are live reads: the
expression `open.value === 0` is evaluated where the panel reads `props.active`. That's why a prop needs no special
treatment to stay current, and why you shouldn't copy one into `state` (W005).
:::

## Letting a child write: `bind:`

The accordion passes a callback, `onShow`, which is often right: the child reports an event, and the parent decides what
it means. When the child simply edits a value, there's a shorter way. The parent passes its box with `bind:`, and the
child writes its prop as if it were its own:

```tsx
import { state } from '@kerf/core'

function Stepper(props: { value?: number }) {
  let { value = 1 } = props
  return (
    <button type="button" onClick={() => value++}>
      {value}
    </button>
  )
}

function Summary(props: { qty: number }) {
  return <p>{props.qty} in the basket</p>
}

export default function Checkout() {
  const qty = state(1)
  return (
    <>
      <Stepper bind:value={qty} />
      <Summary qty={qty.value} />
    </>
  )
}
```

`Stepper` and `Summary` never talk to each other. They share `qty` because `Checkout` owns it.

`let { value = 1 } = props` makes a local you can write. Without `bind:`, a write stays inside `Stepper` until the parent
passes a new value. With `bind:value={qty}` at the call site, the write goes to `qty`, and `Summary` follows. The child is
the same in both cases; only the parent decides whether its writes leave. [Writing to a parent with
bind:](/learn/bind) covers it in full.

:::deepdive Controlled and uncontrolled, in Kerf
React distinguishes *controlled* components, driven by props, from *uncontrolled* ones, which keep their own state, and a
component author usually picks one.

In Kerf one component can be both. `Stepper` above keeps its own value when used alone (`<Stepper />`), starts from the
parent's value and then goes its own way when given one (`<Stepper value={2} />`), and is fully controlled when bound
(`<Stepper bind:value={qty} />`). The author writes it once, with `let`, and the caller chooses.
:::

### Passing a box

You can also pass the box itself, typed `State<T>`:

```tsx
import { state, type State } from '@kerf/core'

function Coupon(props: { code: State<string> }) {
  return (
    <input
      aria-label="Coupon"
      value={props.code.value}
      onInput={(e) => (props.code.value = e.currentTarget.value)}
    />
  )
}

export function Pay() {
  const code = state('')
  return (
    <form>
      <Coupon code={code} />
      <p>{code.value ? `Using ${code.value}` : 'No coupon'}</p>
    </form>
  )
}
```

Pass the box when the child needs the box itself: to read one entry with `.get` (see [Keyed state and
entries](/learn/entries)), or to hand it on further. For a child that edits one value, `bind:` keeps the child simpler,
because it works with or without a parent box.

## A single source of truth for each piece of state

In a Kerf app, each piece of state has one owner. Some state lives in a leaf component, like whether a tooltip is open.
Some lives near the top, like which page you're on. A few things live in a module or a [`defineState`
scope](/learn/app-wide-state) that the whole app can import.

For each piece of state, ask which components read it and which write it, and put it in their closest common owner. You
don't copy it between components or keep two versions in sync. You lift it up, or pass it down.

Your app will change as you work on it. It's common to move a box down because only one child uses it after all, or up
because a sibling now needs it. Both moves are small, because the code that reads it doesn't change: it reads `.value`
from wherever the box comes from.

### Sharing a box from a module

A box doesn't have to live in a component. Made in a module, any component that reads it follows it. Here two panes read
one list of tasks:

:::demo shared

This is the lightest way to share state across distant components, and fine for state only the browser touches. For
app-wide state, prefer a named scope, which the next pages cover: [Passing data deeply](/learn/passing-data-deeply) for a
value scoped to part of the tree, and [App-wide state with defineState](/learn/app-wide-state) for state the whole app
shares, with persistence, tab sync and undo.

:::pitfall A module box is one box per server
On the server, a module is loaded once and serves every request. A box made in a module is therefore shared by every
visitor whose page the server renders. If server-rendered code ever writes it, one visitor's value shows up in another's
page. State that belongs to a user, such as a basket, goes in a `defineState` scope, which the server makes fresh for
each request.
:::

## Where state lives, and how to reset it

React has a page on "preserving and resetting state" because its state is attached to a position in the render tree,
and the rules for when that position counts as the same are subtle. Kerf has no such rules. State belongs to the
component instance that made it:

- A component is made once, and its boxes live as long as it does.
- A component inside a branch (`{open.value && <Panel />}`) is made when the branch shows and disposed of, with its
  state, when the branch goes. Showing it again makes a new one, with fresh state.
- A row in a keyed list lives as long as its key is in the list, even when the list is reordered. See [State lives with
  the row](/learn/entries#state-lives-with-the-row).
- A component never runs again because its parent's state changed, so it never loses state that way.

### Resetting state when the subject changes

A messenger shows a chat with one contact at a time. The chat has a draft. Switch contacts, and the draft should start
empty: a message meant for Ana shouldn't be sent to Ben.

In React you'd give the chat a `key` of the contact's id, so it's rebuilt for each contact. In Kerf, `key` belongs to
list rows; on a single component it does nothing. Instead, make the draft *linked* to the contact:

:::demo manage-reset

```tsx
import { state } from '@kerf/core'

type Contact = { id: number; name: string }

export function Chat(props: { contact: Contact }) {
  const draft = state.linked(() => '', {
    key: () => props.contact.id,
  })
  return (
    <textarea
      aria-label={`Message to ${props.contact.name}`}
      value={draft.value}
      onInput={(e) => (draft.value = e.currentTarget.value)}
    />
  )
}
```

`state.linked(source, { key })` is a box that holds your edits while the key stays the same, and goes back to `source`
when the key changes. Here the source is always `''`, so a new contact means an empty draft. Only the draft resets: the
`Chat` component and anything else in it stay as they are.

Without `key`, `state.linked(() => props.value)` resets whenever the source value itself changes. That's the form to use
for an editable copy of a prop.

:::note Keeping a draft per contact
If you want each contact to keep their own draft as you switch back and forth, the drafts are data, not one box: keep
them in the parent, in an object keyed by contact id (`state<Record<number, string>>({})`), and read and write one entry
with `.get` and `.set`. That's [Keyed state and entries](/learn/entries).
:::

## Recap

- To coordinate two components, move their state to their closest common parent and pass it down.
- Pass values as props, callbacks for events, and `bind:` when a child edits the value.
- Pass a box typed `State<T>` when the child needs the box itself.
- Each piece of state has one owner. Lift it up or pass it down; never keep two copies in sync.
- A module box is shared by everyone, the server's visitors included. Use `defineState` for per-user app state.
- State lives with the component that made it. Reset part of it for a new subject with `state.linked(…, { key })`.

## Try it

:::challenge Synced inputs
Make two text inputs that always show the same text: typing in either changes both. Use one box in the parent.
:::solution
```tsx
import { state } from '@kerf/core'

function TextField(props: { label: string; value?: string }) {
  let { value = '' } = props
  return (
    <input
      aria-label={props.label}
      value={value}
      onInput={(e) => (value = e.currentTarget.value)}
    />
  )
}

export function SyncedInputs() {
  const text = state('')
  return (
    <>
      <TextField label="First" bind:value={text} />
      <TextField label="Second" bind:value={text} />
    </>
  )
}
```
Both fields write to one box, so each shows what either wrote. Without `bind:`, each would keep its own copy.
:::

:::challenge Filter a list from a sibling
`SearchBar` and `List` are siblings. Make typing in the search bar filter the list of cities.

```tsx
function SearchBar() {
  const query = state('')
  return (
    <input
      aria-label="Search"
      value={query.value}
      onInput={(e) => (query.value = e.currentTarget.value)}
    />
  )
}
function List(props: { cities: string[] }) {
  const { cities } = props
  return <ul>{cities.map((c) => <li key={c}>{c}</li>)}</ul>
}
```
:::solution
Lift `query` into the parent, bind it to the search bar, and derive the filtered list there:

```tsx
import { derived, state } from '@kerf/core'

const CITIES = ['Lisbon', 'Oslo', 'Osaka', 'Lima', 'Lagos']

function SearchBar(props: { query?: string }) {
  let { query = '' } = props
  return (
    <input
      aria-label="Search"
      value={query}
      onInput={(e) => (query = e.currentTarget.value)}
    />
  )
}

function List(props: { cities: string[] }) {
  const { cities } = props
  return <ul>{cities.map((c) => <li key={c}>{c}</li>)}</ul>
}

export function Cities() {
  const query = state('')
  const found = derived(() =>
    CITIES.filter((c) =>
      c.toLowerCase().includes(query.value.toLowerCase())
    )
  )
  return (
    <>
      <SearchBar bind:query={query} />
      <List cities={found.value} />
    </>
  )
}
```
:::

:::challenge Close the panel again
In the accordion, let a second press on an open panel's title close it, so no panel is open.
:::solution
Let the index be `null` for "none", and toggle:

```tsx
import { state } from '@kerf/core'

function Panel(
  props: {
    title: string
    active: boolean
    onToggle: () => void
    children?: unknown
  },
) {
  return (
    <section>
      <button
        type="button"
        aria-expanded={props.active}
        onClick={props.onToggle}
      >
        {props.title}
      </button>
      {props.active && <p>{props.children}</p>}
    </section>
  )
}

export function Accordion() {
  const open = state<number | null>(0)
  const toggle = (
    i: number,
  ) => (open.value = open.value === i ? null : i)
  return (
    <>
      <Panel
        title="About"
        active={open.value === 0}
        onToggle={() => toggle(0)}
      >
        Seven hills.
      </Panel>
      <Panel
        title="Getting around"
        active={open.value === 1}
        onToggle={() => toggle(1)}
      >
        Yellow trams.
      </Panel>
    </>
  )
}
```
The panels didn't change much: they still report an event. The parent's state and what it does with the event did.
:::
