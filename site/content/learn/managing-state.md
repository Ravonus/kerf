# Managing state

:::learn
- How to think about UI as states rather than steps
- How to choose a good shape for state
- How to compute values instead of storing them
- How to share state between components, near and far
- How to keep state for rows, for hover and focus, and for the whole app
:::

As your app grows, it pays to be deliberate about where state lives, what shape it has, and how it flows between
components. Redundant or duplicated state is a common source of bugs. This chapter shows how to structure state well,
how to keep update logic easy to maintain, and how to share state between components that are close together, far
apart, or in different tabs.

If you know React's "Managing State" chapter, much of this will be familiar: the data advice is the same. What differs is
that Kerf components run once, so state is never "preserved between renders" or "reset by position". It lives with the
component that made it, and a box tells exactly the places that read it when it changes.

## Reacting to input with state

You don't change the page step by step. You describe what it shows in each state, and handlers change only the state.
This quiz has one `status` box, and every screen comes from it:

:::demo manage-quiz

Read **[Reacting to input with state](/learn/reacting-to-input)** to learn how to list the visual states of a component,
model them with one status box, and why Kerf branches in JSX instead of returning early.

## Choosing the state structure

Good state is small and can't contradict itself. Two booleans that must never both be true are one status; a selected
item is an id, not a copy:

```tsx
import { derived, state } from '@kerf-js/core'

type Snack = { id: number; title: string }

export function Menu(props: { snacks: Snack[] }) {
  const { snacks } = props
  const chosenId = state<number | null>(null)
  const chosen = derived(() =>
    snacks.find(s => s.id === chosenId.value),
  )
  const label = derived(() => chosen.value
    ? `You picked ${chosen.value.title}`
    : 'Pick a snack',
  )
  const choose = (id: number) => (chosenId.value = id)
  return (
    <section>
      {snacks.map(s => (
        <button
          key={s.id}
          type="button"
          onClick={() => choose(s.id)}
        >
          {s.title}
        </button>
      ))}
      <p>{label.value}</p>
    </section>
  )
}
```

Read **[Choosing the state structure](/learn/choosing-state-structure)** to learn when to use one box or several, why
you never copy a prop into state, and how to flatten nested data.

## Derived values

Anything you can work out from other values is `derived`. You say how once, and it can't go stale:

:::demo rules

Read **[Derived values](/learn/derived)** to learn when a derived value runs, how chains of them stay consistent, and why
you never keep a copy in sync with `watch`.

## Sharing state between components

To make two components change together, move their state to their closest common parent and pass it down. Only one of
these panels can be open, because the parent holds which:

:::demo manage-accordion

Read **[Sharing state between components](/learn/sharing-state)** to learn about lifting state up, `bind:`, passing a
box, and how to reset state when the subject changes.

## Passing data deeply

A context gives a value to everything built inside a part of the tree, without passing it through each layer. The button
below reads a box that a component two levels up provided:

:::demo manage-theme

Read **[Passing data deeply](/learn/passing-data-deeply)** to learn how `context`, `provide` and `use` work, where to read
a context, and when a module box or `defineState` is the better tool.

## Keyed state and entries

A row can read one entry of an object box with `.get(key)`. Then only a change to that entry re-runs it, however long the
list:

:::demo entries

Read **[Keyed state and entries](/learn/entries)** to learn how `get` and `set` work, how to pass a box to row
components, and how long a row's own state lasts.

## Hover, focus and shared UI state

`interaction()` turns hover, focus and press into boxes, and a `share` key makes one row shared between components, tabs
and people:

:::demo manage-interaction

Read **[Hover, focus and shared UI state](/learn/ui-state)** to learn how Veneer draws a row, how far sharing reaches, and
how to keep other UI state the same in every tab.

## App-wide state with defineState

`defineState` is a named scope of state that any component imports. Its actions keep update logic in one place, and it
can persist, sync across tabs and undo:

:::demo manage-undo

Read **[App-wide state with defineState](/learn/app-wide-state)** to learn how to define and use a scope, add history and
persistence, and how scopes behave on the server.

## Recap

- Describe states, not steps, and keep each piece of state small and free of contradictions.
- Derive what can be computed.
- Lift state to the closest common parent; use context for values that depend on where you are in the tree.
- Read one entry per row with `.get`; use `interaction()` for hover and focus.
- Put app-wide state in a `defineState` scope.

## What's next

Head to [Reacting to input with state](/learn/reacting-to-input) to start the chapter page by page.
