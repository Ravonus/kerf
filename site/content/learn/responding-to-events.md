# Responding to events

:::learn
- How to handle clicks, typing and keys
- What a handler receives
- How `onChange` behaves
:::

Handlers are functions you pass as `on` attributes: `onClick`, `onInput`, `onKeyDown` and the rest. A handler usually
changes some state, and the page follows.

:::demo events

## Passing a handler

Pass a function, not a call: `onClick={add}` or `onClick={() => add()}`, never `onClick={add()}`.

The handler gets the browser's event. `e.currentTarget` is typed as the element the handler is on, so
`e.currentTarget.value` on an `<input>` is a string with no cast.

```tsx
<input value={draft.value} onInput={e => (draft.value = e.currentTarget.value)} />
```

Multi-word events use camelCase: `onKeyDown`, `onPointerEnter`, `onDoubleClick`. A `Capture` suffix, as in
`onClickCapture`, listens in the capture phase.

## `onChange` fires on every edit

As in React, `onChange` on a text field fires on each keystroke, not when the field loses focus. On a checkbox, radio,
select or file input it fires when the value changes. To act when the user is done, use `onBlur`.

## Handlers can be async

A handler can `await`. State you change after the `await` updates the page like any other write:

:::demo async

## Recap

- Pass a function to `onClick`, `onInput`, `onKeyDown` and friends.
- `e.currentTarget` is the element, already typed.
- `onChange` fires per edit. Use `onBlur` for "done".

## Try it

:::challenge Clear with Escape
Make Escape in the notes input clear the draft.
:::solution
```tsx
onKeyDown={e => {
  if (e.key === 'Enter') add()
  if (e.key === 'Escape') draft.value = ''
}}
```
:::
