# Diagnostics and weft check

:::learn
- What a Weft diagnostic is: a code, a place, a reason and a fix
- What each family of codes covers, from W to X
- How to run `weft check` and `weft fix`, and what their output means
- How to look up any code with `weft docs`
- The handful of codes you'll meet first, and how to fix each
:::

Weft's compiler reads every component before it runs, and it knows the mistakes that are easy to make in a framework
where components run once. When it sees one, it doesn't only fail: it tells you which mistake, where, why it's wrong, and
what to write instead. That message is a **diagnostic**. This page teaches you to read one, run the commands that find
them, and fix the ones you'll meet in your first week.

## Anatomy of a diagnostic

Here's a component with a habit from React:

```tsx
function Price(props: { value: number }) {
  const draft = state(props.value)
  return <b>{draft.value}</b>
}
```

`weft check` says (wrapped here to fit):

```text
src/components/Price.tsx:2:23  W005 error
  `state(props.value)` copies `props.value` once;
  later changes are ignored.
    fix: Use `state.linked(() => …)` to reset when it changes,
    or `untrack()` if a snapshot is intended. (autofix)
weft check: 14 files, 1 errors, 0 warnings (812 ms)
```

Every diagnostic, from every part of Weft, has the same parts:

| Part | Here | What it tells you |
|---|---|---|
| Place | `src/components/Price.tsx:2:23` | The file, line and column. Editors and terminals make it a link |
| Code | `W005` | Which mistake. Look it up any time with `weft docs W005` |
| Severity | `error` | `error`, `warning` or `info`. Only errors fail the command |
| Why | ``state(props.value)` copies…`` | What goes wrong, in terms of this code |
| Fix | `Use state.linked(…)…` | What to write instead |
| Edit | `(autofix)` | The diagnostic carries the exact edit, so a tool can apply it |

The code is the stable part. The words can improve between versions; `W005` will always mean "`state` of a prop". That
makes a code something you can search for, put in a commit message, or tell an agent.

Here's the fix it asks for:

```tsx
// src/components/Price.tsx
import { state } from '@weft-js/core'
import { Button } from '@weft-js/warp'

export function Price(props: { value: number }) {
  const draft = state.linked(() => props.value)
  return <Button onClick={() => draft.value++}>{draft.value}</Button>
}
```

`draft` starts at the prop's value, can be changed locally, and resets when the parent passes a new value. The original
was a box that never heard about the prop again.

:::note Why "copies once"
A component body runs once. `state(props.value)` reads the prop at that moment and puts the number in a box. Nothing
reads the prop again, so the box keeps the first value for good. React's `useState(props.value)` has the same bug, and
it's a common one there too; the difference is that Weft can see it and stop you.
:::

## Families of codes

The letter says what part of Weft found the problem, and so roughly what it's about. You don't need to learn these:
the code and its message are enough to act on. This is a map for when you wonder where one came from.

| Family | About | Found by |
|---|---|---|
| **W** | Components and reactivity: reads that won't update, lists, `bind:`, React habits, prop types | The compiler, as you save and in `weft check` |
| **D** | Design and accessibility: raw colours and spacing, labels, alt text, focus, heading order | `weft check` |
| **T** | Tests that don't test: no assertion, sleeps, snapshots, `.only`; and the test gate's T010, T011, T020 | `weft check` on test files, and `weft test --gate` |
| **P** | The project: `weft.config.ts`, tasks, scripts, plugins and their permissions | `weft check`, and `weft dev` and `weft build` for P109 and P110 |
| **H** | Page metadata and share cards: titles, descriptions, images | `weft check` and `weft routes --meta` |
| **Q** | Server functions and the database | `@weft-js/start` as it serves, and `weft check` |
| **A**, **C**, **F** | Auth, the server contract, forms | `@weft-js/start` as it serves, and `weft check` |
| **R** | Realtime (R001–R024) and Rust server functions (R101–R109) | `weft check`, `weft doctor` and the server |
| **S**, **U** | State that crosses to the server; shared hover and focus | `weft check`, and the runtime in dev |
| **X**, **I**, **M** | Text, fonts and surfaces; icons; media | `weft check`, the runtime in dev, and plugins |
| **E** | Deploys: which hosts fit, the CDN in front, uploads (E001–E014) | `weft deploy hosts`, `weft deploy` and `weft doctor` |
| **L** | Built pages: axe's WCAG rules, console errors, the head, sideways scroll, layout shift | `weft build` and `weft audit` |

A plugin can add codes of its own, under its own name, such as `<short-name>/<CODE>`. They read the same way.

Most of what you'll see as a beginner is **W**, with some **D** if your app uses Warp. The
[diagnostics reference](/reference/diagnostics) lists every code, and each one has its own page at
`/reference/codes/<CODE>`, such as [W005](/reference/codes/W005).

## Where you see them

### While you work: `weft dev`

`weft dev` compiles each file when you save it. A compiler **error** stops that file: the page shows the error over
the app, and the terminal prints it. A **warning** prints in the terminal and the page carries on. Fix the error and
save, and the page comes back.

The editor shows TypeScript's errors and the prop-inference codes (W080–W085), but not the compiler's others.
[Editor and TypeScript setup](/learn/setup) explains why, and how to set the editor up.

### Before you commit: `weft check`

```bash
npx weft check
```

`weft check` compiles every `.tsx` and `.jsx` file in check mode, then adds what needs the whole project: the D-codes,
your tests, the config, your routes' metadata, and anything that spans files. A W014 that starts in one file and lands
in another's list, for example, only shows here.

It ends with a summary line, and its exit code says how it went:

| Exit | Means |
|---|---|
| `0` | No errors. There may be warnings |
| `1` | At least one error |
| `2` | A usage error, such as an unknown flag, or Weft itself failed |

So `weft check` in CI fails the build on errors and lets warnings through.

Give it files to check only those:

```bash
npx weft check src/routes/index.tsx src/components/Price.tsx
```

The flags:

| Flag | What it does |
|---|---|
| `--json` | The whole result as JSON on stdout, for tools and agents. The text still goes to stderr |
| `--verbose` | Adds which compiler build ran (`weft doctor` explains the two) |
| `--root <dir>` | Checks the app in `<dir>` instead of the current folder |
| `--preset <p>` | Checks against a deploy preset, for codes that depend on the host |

### In JSON

With `--json`, each diagnostic is an object, and the same shape comes from every command and the MCP server.
The text values below are shortened:

```json
{
  "code": "W005",
  "severity": "error",
  "owner": "core",
  "file": "src/components/Price.tsx",
  "span": [2, 23, 2, 34],
  "offset": [65, 76],
  "why": "`state(props.value)` copies `props.value` once; …",
  "fix": {
    "text": "Use `state.linked(() => …)` to reset …",
    "description": "Make it a linked state …",
    "safe": false,
    "edits": [
      {
        "file": "src/components/Price.tsx",
        "span": [2, 17, 2, 35],
        "offset": [59, 77],
        "text": "state.linked(() => props.value)"
      }
    ]
  },
  "docs": "weft docs W005"
}
```

`span` is start line, start column, end line, end column, counting from 1. `offset` is the same range as character
positions in the file. You'll rarely read this yourself; it's what lets an agent fix the code without guessing.

## Fixing: `weft fix`

```bash
npx weft fix
```

`weft fix` applies every edit marked **safe**: an edit that can't change what the app does, only make it correct. It
runs `weft check`, applies the safe edits, and checks again, up to five passes, until nothing safe is left. Then it lists
what it changed:

```text
src/routes/index.tsx:8:12  W015
src/components/Card.tsx:4:7  D037
```

Like `weft check`, it takes files to limit it to those, and `--json`.

Not every edit is safe. W005's edit turns `state(x)` into `state.linked(() => x)`, which changes behaviour: maybe you
wanted a snapshot, and `untrack` was the fix. So `weft fix` leaves it, and in `--json` it's `"safe": false`. The text
output marks both kinds `(autofix)`, because both carry an edit; the difference is who applies it. A safe one, `weft fix`
does. Any other, you or your agent decide.

Some codes with safe fixes: W015 (add `.value`), W006 (read a nested prop at the use site), W043 (`data-x={true}`),
W081 and W082 (write the inferred prop type), D037 (a positive `tabindex`), and D002 when a spacing value is exactly a
step of the scale.

:::pitfall Don't run `weft fix` to make errors go away
`weft fix` only applies what it can prove safe, so after it runs, the errors left are the ones that need a decision.
Read each one. A fix you apply without reading, such as wrapping a value in `untrack` to silence W001, can hide the bug
the diagnostic was pointing at.
:::

## Looking up a code: `weft docs`

Every code has a page, in the terminal (wrapped below to fit):

```bash
npx weft docs W005
```

```text
# W005 (error)

`state(prop)`: React's `useState(prop)` bug,
the box never follows the prop.

**Fix:** `state.linked(() => prop)`, or `untrack` for a one-time copy.

**Status in weft@0.1.1:** reported, suggested edit.

Triggers it:

…

More: `weft docs props`.
```

It says what the code catches, the fix, whether the Weft you have installed reports it yet, a short example that
triggers it, and which topic to read next. The same text is on the site at `/reference/codes/W005`.

`weft docs` with no topic lists every topic, and `weft docs diagnostics` prints the table of every code with its status
in your install.

## Severities, and turning things off

**Errors** are code that doesn't do what it says: a value that never updates, a list that rebuilds every row, a button
nobody can reach with a keyboard. They fail `weft check`, and a compiler error stops that file in `weft dev`.

**Warnings** are likely mistakes that can be right: a `watch` that could be a `derived` (W004), two solid buttons side by side (D038). They're reported, and nothing fails.

**Info** is something you might want to know, such as an icon name only known when the app runs (I002).

Weft has no comment that turns off a W-code. Each one marks code that behaves differently from how it reads, and there
is always a way to write what you meant, often the one in the fix (`untrack` when you really want a snapshot). For the
other families, there are switches where a real exception exists:

| To turn off | Write |
|---|---|
| One D-code at one place | `// weft-allow D001: <reason>` on the line above, or at the end of the line |
| One T-code in a test | `// weft-allow T004: <reason>` on the line above, or in the file's header for the whole file |
| Every D-code | `check: { design: false }` in `weft.config.ts` |
| The route metadata pass (H-codes) | `check: { routes: false }` |
| Prop inference (W080–W085) | `check: { props: false }`, or `'manual'` to leave writing types to `weft fix` |
| Some files | `check: { exclude: ['src/legacy/**'] }` |
| Plugin permission errors P109 and P110 | `trust: 'warn'` makes them warnings |

Write a reason after the colon. It's for the next person, and for the agent that would
otherwise "fix" it.

## The ones you'll meet first

These are the codes beginners hit most, roughly in the order you'll hit them. Each is an error.

### W015: a box rendered without `.value`

```tsx
const count = state(0)
return <p>{count}</p>
```

`count` is the box; JSX needs what's in it: `{count.value}`. It's a safe fix, so `weft fix` adds `.value` for you.

### W001: computing in the body

```tsx
function Total(props: { count: number }) {
  const total = props.count * 5
  return <b>{total}</b>
}
```

The body runs once, so `total` is worked out once and never again. Wrap it in `derived` and read `.value`, or do the
sum in the JSX:

```tsx
// src/components/Total.tsx
import { derived } from '@weft-js/core'

export function Total(props: { count: number }) {
  const total = derived(() => props.count * 5)
  return <b>{total.value}</b>
}
```

`const n = props.count` on its own is fine: it only names the prop, and stays live. It's doing more with it, such as
arithmetic, a call or `??`, that needs `derived`. [Derived values](/learn/derived) goes deeper.

### W005: a box made from a prop

The one at the top of this page. `state(props.value)` never follows the prop. Use `state.linked(() => props.value)` for
an editable copy that resets, or `untrack(() => props.value)` for a value that should stay as it was.

### W010: a list without keys

```tsx
function TodoList(props: {
  todos: { id: string; title: string }[]
}) {
  const { todos } = props
  return (
    <ul>
      {todos.map((t) => (
        <li>{t.title}</li>
      ))}
    </ul>
  )
}
```

A row needs `key`, from a stable id in the data: `<li key={t.id}>`. With it, Weft moves and reuses rows instead of
rebuilding them. [Rendering lists](/learn/rendering-lists) has more.

### W020–W029: React hooks

```tsx
const [open, setOpen] = useState(false)
```

There are no hooks. `useState` is `state`, `useMemo` is `derived`, `useEffect` is `watch` or `onMount`, `useRef` is
`ref={el}`, and `useCallback` is a plain function. `weft check` reports a hook, a hook import or a dependency array as
W020, and an empty dependency array on `derived` has a safe autofix.

### W061: `bind:` in the wrong place

```tsx
<input bind:value={name} />
```

`bind:` gives a component's prop write access to a box in its parent, so it only goes on a component, and only takes a
box. A form element takes `value` and `onChange`:

```tsx
// src/components/NameField.tsx
import { state } from '@weft-js/core'

export function NameField() {
  const name = state('')
  return (
    <label>
      Name{' '}
      <input
        value={name.value}
        onChange={(e) => (name.value = e.currentTarget.value)}
      />
      <span>Hello, {name.value}</span>
    </label>
  )
}
```

A component of your own can take `bind:value`, because there `value` is a prop. [Writing to a parent with bind:](/learn/bind) covers when to
use it.

### W041: a `let` that should be state

```tsx
let clicks = 0
return <button onClick={() => clicks++}>{clicks}</button>
```

A plain variable changes, but nothing re-reads it, so the button shows `0` forever. Make it `state(0)` and read
`clicks.value`.

:::deepdive Diagnostics written for agents
Weft was built with AI agents writing much of its code, and the diagnostics are designed for them as much as for you.
Every one has a stable code an agent can look up with `weft docs`, a reason written about the code in front of it, and a
fix it can apply: the exact edit, marked safe or not. `weft check --json` gives the whole list in one shape, so an agent
can run it after every change, read what's wrong, fix it and run it again, without a person translating a stack trace.
The same messages are what you read, which is why they're plain and specific. [Working with AI
agents](/learn/working-with-agents) shows that loop.
:::

## Recap

- A diagnostic has a place, a code, a severity, a reason and a fix, often with the exact edit.
- The letter is the family: W for components and reactivity, D for design and accessibility, T for tests, P for the
  project, and so on.
- `weft dev` shows compiler diagnostics as you save. `weft check` checks everything, and exits 1 on errors.
- `weft fix` applies the safe edits; the rest need you to decide.
- `weft docs <CODE>` explains any code, as does `/reference/codes/<CODE>`.
- W-codes have no off switch, because each has a correct way to write it. D- and T-codes take `// weft-allow` with a
  reason, and `check` in the config turns whole passes off.

Next, [Working with AI agents](/learn/working-with-agents): how an agent uses all of this.

## Try it

:::challenge Fix a W015
`weft check` reports `W015 error  \`total\` is a box; JSX needs its value.` on this component. Fix it.

```tsx
function Cart() {
  const total = state(0)
  return <p>Total: {total}</p>
}
```
:::solution
```tsx
// src/components/Cart.tsx
import { state } from '@weft-js/core'

export function Cart() {
  const total = state(0)
  return <p>Total: {total.value}</p>
}
```

`{total}` would render the box itself. `{total.value}` reads what's in it, and the compiler wires that read to the
text, so it updates when `total` does. `weft fix` makes this exact edit.
:::

:::challenge A code you haven't met
This component shows a `0` on the page when there are no messages. Run `weft docs W011` (or open
[W011](/reference/codes/W011)), then fix it.

```tsx
function Inbox(props) {
  const { messages } = props
  return (
    <section>
      {messages.length && (
        <ul>
          {messages.map((m) => (
            <li key={m.id}>{m.subject}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
```
:::solution
W011 is a number on the left of `&&`. When the length is `0`, `0 && …` is `0`, and `0` renders as text. Compare it so
the left side is a boolean:

```tsx
// src/components/Inbox.tsx
export function Inbox(
  props: { messages: { id: string; subject: string }[] },
) {
  const { messages } = props
  return (
    <section>
      {messages.length > 0 && (
        <ul>
          {messages.map((m) => (
            <li key={m.id}>{m.subject}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
```
:::

:::challenge Decide on a suggested edit
`weft check` reports W001 on `const label = props.name.toUpperCase()`, and its edit would make it
`derived(() => props.name.toUpperCase())`. `weft fix` won't apply it. Why not, and when would `untrack` be the right fix
instead?
:::solution
The edit isn't safe because it changes what the code does: today `label` is computed once, and after the edit it follows
`name`. That's almost always what you meant, so apply it and read `label.value` in the JSX:

```tsx
// src/components/Shout.tsx
import { derived } from '@weft-js/core'

export function Shout(props: { name: string }) {
  const label = derived(() => props.name.toUpperCase())
  return <strong>{label.value}</strong>
}
```

`untrack(() => props.name.toUpperCase())` is right only when you want the first name and never a later one, such as the
name a form started with. Then the code says so on purpose, and a reader knows it isn't a mistake.
:::
