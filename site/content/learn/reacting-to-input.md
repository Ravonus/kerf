# Reacting to input with state

:::learn
- How declarative UI differs from changing the page step by step
- How to list the visual states a component can be in
- How to model those states with one status box instead of several booleans
- Why a component branches in JSX rather than returning early
:::

You don't tell weft "disable this button, then show that message". You describe what the screen looks like in each state
the component can be in, and change the state when the user or the network does something. This page walks through
building a small form that way, from a list of states to working code.

:::demo manage-quiz

## Declarative UI compared to imperative

Picture the form above written with plain DOM calls. When the user submits, you disable the field, disable the button,
show a spinner. When the server answers, you either hide the form and show the success message, or re-enable everything
and show the error. Each event has a list of things to change, and each list has to know about every element.

```ts
// The imperative version: each event edits the page by hand.
function handleSubmit() {
  textarea.disabled = true
  button.disabled = true
  spinner.hidden = false
  check(textarea.value).then(
    () => { form.hidden = true; success.hidden = false },
    err => { textarea.disabled = false; button.disabled = false; spinner.hidden = true; errorText.textContent = err.message },
  )
}
```

This works for a small form. Add a step, or a new element, and you have to find every place that touches it. Forget one,
and the page gets into a state no one meant: a spinner over a success message, a button that never comes back.

In weft, as in React, you work the other way round. You say what the page shows for each state, and the handlers change
only the state. weft updates the page from it. Because a component runs once and the compiler wires each read to the
place that shows it, "updates the page" means: changes exactly the attributes and text that read the state that changed.

## Step 1: list the visual states

Start from what the user sees, not from the code. The quiz can be:

- **Empty**: nothing typed yet. The submit button is off.
- **Typing**: there's an answer. The button is on.
- **Submitting**: the field and button are off, and the button shows it's busy.
- **Success**: the form is gone, and a message says the answer was right.
- **Error**: like typing, with the server's message under the field.

A good way to check the list is to draw every state at once, with no logic. Here is a component that takes the status as
a prop and nothing else:

:::demo manage-states

Designers call a page like this a living style guide. Each card is one state, so you can check them side by side before
writing a single handler.

## Step 2: find what changes the state

Two kinds of thing move the form between states:

- **The person**: typing, pressing Submit.
- **The computer**: the server answering, with success or with an error.

Write them down as arrows between the states: typing turns *empty* into *typing*; Submit turns *typing* into
*submitting*; the answer turns *submitting* into *success* or *error*; typing again turns *error* back into *typing*.
Every arrow is a handler, or the end of an `await` inside one.

## Step 3: hold the state in boxes

Now pick the boxes. A first try often gives every visual state its own boolean:

```ts
const isEmpty = state(true)
const isTyping = state(false)
const isSubmitting = state(false)
const isSuccess = state(false)
const isError = state(false)
```

That works, but it allows nonsense. Nothing stops `isSubmitting` and `isSuccess` from both being true, and every handler
has to remember to switch off the others. Five booleans have 32 combinations, and the form has five states.

## Step 4: remove what isn't essential

Go through the boxes and ask of each one:

- **Can two of them contradict each other?** `isSubmitting` and `isSuccess` can. Fold such booleans into one `status`
  whose type lists the states that can actually happen.
- **Is it already in another box?** `isEmpty` is `answer.value === ''`. That's a [derived value](/learn/derived), not
  state.
- **Is it the same as another box, inverted?** `isError` is `error.value !== null`. Keep the message and derive the
  boolean.

What's left is three boxes:

```tsx
import { derived, state } from '@weft-js/core'

type Status = 'typing' | 'submitting' | 'success'

export function quizState() {
  const answer = state('')
  const status = state<Status>('typing')
  const error = state<string | null>(null)
  const empty = derived(() => answer.value.trim() === '')
  return { answer, status, error, empty }
}
```

`empty` and "has an error" are gone from the state, and the status can only be one thing at a time. TypeScript now checks
every comparison: `status.value === 'sucess'` is a type error.

:::note A function like this isn't a hook
The function above only groups four boxes. There are no hook rules in weft: a function that makes state can be called
from a component body in any order, even inside an `if`. Don't name it `useSomething`, though: weft reads a `useX()`
call as a React habit and reports it (W020–W029). See [Reusing logic](/learn/reusing-logic).
:::

## Step 5: connect the handlers

The handlers only change state. They don't touch the page:

```tsx
import { derived, state } from '@weft-js/core'

type Status = 'typing' | 'submitting' | 'success'

declare function check(answer: string): Promise<void>

export function Quiz() {
  const answer = state('')
  const status = state<Status>('typing')
  const error = state<string | null>(null)
  const empty = derived(() => answer.value.trim() === '')

  const submit = async (e: SubmitEvent) => {
    e.preventDefault()
    status.value = 'submitting'
    try {
      await check(answer.value)
      status.value = 'success'
    } catch (err) {
      status.value = 'typing'
      error.value = err instanceof Error ? err.message : String(err)
    }
  }

  return (
    <section>
      {status.value === 'success' ? (
        <h2>That's right!</h2>
      ) : (
        <form onSubmit={e => void submit(e)}>
          <textarea
            aria-label="Your answer"
            value={answer.value}
            disabled={status.value === 'submitting'}
            onInput={e => {
              answer.value = e.currentTarget.value
              error.value = null
            }}
          />
          <button type="submit" disabled={empty.value || status.value === 'submitting'}>Submit</button>
          {error.value !== null && <p role="alert">{error.value}</p>}
        </form>
      )}
    </section>
  )
}
```

Read the JSX and you can see every state: which element is disabled when, when the error shows, what replaces the form.
The handlers say nothing about any of that.

Two weft details make this work:

- **Writes after an `await` are fine.** A handler is ordinary code, and a box can be written at any time. The page
  follows on the next microtask.
- **Writes are batched.** `status.value = 'typing'` and `error.value = …` happen together, so the page never shows
  "typing" without the message, even for a frame.

## Branch in JSX, not with an early return

In React you might write the success screen as an early return:

```tsx
if (status === 'success') return <h2>That's right!</h2>
```

In weft that's a bug. The component body runs **once**, when the component is made. The `if` is checked once, while the
status is still `'typing'`, and never again: the success message would never appear. The compiler reports an early
`return` that depends on state as **W040**.

Put the branch inside the JSX instead, as the example does with a ternary. Every `{expression}` in JSX is live: when
`status` changes, weft re-evaluates the branch and swaps what's on screen.

:::pitfall State stays in the branch it was made in
A component inside a branch is made when its branch is shown, and disposed of when the branch goes, together with its
state. In the quiz, the `<form>` is built again if you ever went back from success to typing, with whatever `answer`
holds. Here `answer` lives in the parent, so nothing is lost. If the field kept its own box inside the branch, a round
trip through success would empty it. Keep state that must survive a branch in a component outside it.
:::

:::deepdive Why weft doesn't need "same type, same position"
React decides whether to keep a component's state by comparing the tree before and after a render: the same component
type at the same position keeps its state. weft doesn't compare trees, because it doesn't render again. What exists is
what was made: a component in a branch lives as long as its branch is shown, and a row in a keyed list lives as long as
its key is in the list. There are no rules about positions to remember, and a component never loses its state because a
sibling above it appeared. See [Keyed state and entries](/learn/entries#state-lives-with-the-row) for lists.
:::

## Recap

- Declarative UI: describe each state, and let handlers change only the state.
- List the visual states first. A page that draws them all at once is a cheap way to check them.
- Find what moves between states: the person, and the computer.
- Prefer one `status` box with a union type to several booleans that can contradict each other.
- Derive what can be derived (`empty`, "has an error").
- Branch in JSX. An early `return` on state runs once and is W040.

## Try it

:::challenge Edit a profile
Build a profile card that shows a first and last name as text with an Edit button. Pressing Edit turns the text into two
inputs and the button into Save. Saving turns them back into text, with the new names.
:::solution
```tsx
import { state } from '@weft-js/core'

export function Profile() {
  const editing = state(false)
  const first = state('Ana')
  const last = state('Silva')
  return (
    <form onSubmit={e => { e.preventDefault(); editing.value = !editing.value }}>
      {editing.value ? (
        <>
          <input aria-label="First name" value={first.value} onInput={e => (first.value = e.currentTarget.value)} />
          <input aria-label="Last name" value={last.value} onInput={e => (last.value = e.currentTarget.value)} />
        </>
      ) : (
        <p>{first.value} {last.value}</p>
      )}
      <button type="submit">{editing.value ? 'Save' : 'Edit'}</button>
    </form>
  )
}
```
One boolean is enough here: the card is either editing or not. The names live outside the branch, so switching modes
never loses them.
:::

:::challenge Three booleans into one status
This send button can show "Sending…" and "Sent" at once. Replace the booleans with one status.

```tsx
const isSending = state(false)
const isSent = state(false)
const isError = state(false)
```
:::solution
```tsx
import { state } from '@weft-js/core'

declare function send(text: string): Promise<void>

type Status = 'idle' | 'sending' | 'sent' | 'error'

export function Feedback() {
  const text = state('')
  const status = state<Status>('idle')
  const submit = async () => {
    status.value = 'sending'
    try {
      await send(text.value)
      status.value = 'sent'
    } catch {
      status.value = 'error'
    }
  }
  return (
    <section>
      {status.value === 'sent' ? (
        <p>Thanks for the feedback.</p>
      ) : (
        <>
          <textarea aria-label="Feedback" value={text.value} disabled={status.value === 'sending'} onInput={e => (text.value = e.currentTarget.value)} />
          <button type="button" disabled={status.value === 'sending'} onClick={() => void submit()}>
            {status.value === 'sending' ? 'Sending…' : 'Send'}
          </button>
          {status.value === 'error' && <p role="alert">That didn't go through. Try again.</p>}
        </>
      )}
    </section>
  )
}
```
The type lists the four states that can happen, so "sending and sent" can no longer be written.
:::

:::challenge Fix the success screen
This component never shows "Saved", even after the save finishes. Why, and how do you fix it?

```tsx
function Save() {
  const saved = state(false)
  if (saved.value) return <p>Saved</p>
  return <button type="button" onClick={() => (saved.value = true)}>Save</button>
}
```
:::solution
The body runs once, so the `if` is checked once, while `saved` is false (W040). Branch in the JSX:

```tsx
import { state } from '@weft-js/core'

export function Save() {
  const saved = state(false)
  return <>{saved.value ? <p>Saved</p> : <button type="button" onClick={() => (saved.value = true)}>Save</button>}</>
}
```
:::
