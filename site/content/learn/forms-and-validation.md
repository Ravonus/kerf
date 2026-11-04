# Forms and validation

:::learn
- How `<Form of={mutation}>` sends a form to a server function, with or without JavaScript
- How schema errors and `invalid()` land next to the right field
- How to show pending states, results and form-level messages
- How to give feedback as someone types, without moving the rules off the server
:::

Most writes in an app start in a form: sign up, add a todo, send feedback, check out. You've already called mutations
from handlers ([Server functions](/learn/server-functions)). That works, but a form has more to it: the values have to be
collected and turned into the right types, each error has to appear next to its field, the button should show that
something is happening, and ideally the whole thing works even before the page's JavaScript has loaded.

`<Form>` from `@weft-js/start` does all of that for one mutation. You write the mutation and its schema once, and the
form takes its input, its rules and its errors from them.

## A form for a mutation

Start with a mutation that has an input schema. The messages in the schema are the ones the reader will see:

```ts
// src/server/feedback.ts
import { invalid, mutation } from '@weft-js/start'
import { z } from 'zod'

export const sendFeedback = mutation({
  input: z.object({
    email: z.email('Enter an email address.'),
    rating: z.int('Pick a number from 1 to 5.')
      .min(1, 'Pick a number from 1 to 5.')
      .max(5, 'Pick a number from 1 to 5.'),
    message: z.string().trim()
      .min(10, 'Tell us a little more: 10 characters at least.'),
    reply: z.boolean().default(false),
  }),
  run: ({ input }) => {
    if (input.email.endsWith('@example.invalid')) {
      invalid({ email: 'We can\'t send mail to that address.' })
    }
    return { thanks: input.email }
  },
})
```

Then a route with a `<Form of={sendFeedback}>`. Its child is a function that gets the form's state, `form`, and returns
the fields. warp's field components take an `error` and show it under the field, with the right ARIA wiring:

```tsx
// src/routes/feedback.tsx
import { Form, type FormApi, type Meta } from '@weft-js/start'
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Input,
  Textarea,
} from '@weft-js/warp'
import { sendFeedback } from '#/server/feedback'

export const meta: Meta = {
  title: 'Feedback',
  description: 'Tell us what works and what doesn\'t.',
}

export default function Feedback() {
  return (
    <Card title="Send feedback">
      <Form of={sendFeedback}>
        {(form: FormApi) => (
          <>
            <Input
              label="Email"
              type="email"
              name="email"
              error={form.error('email')}
            />
            <Input
              label="Rating, 1 to 5"
              type="number"
              name="rating"
              error={form.error('rating')}
            />
            <Textarea
              label="Message"
              name="message"
              error={form.error('message')}
            />
            <Checkbox name="reply">Reply to me</Checkbox>
            {form.message.value && (
              <Alert tone="critical" live>
                {form.message.value}
              </Alert>
            )}
            {form.result.value && (
              <Alert tone="positive">
                Thanks. We'll write to you if you asked us to.
              </Alert>
            )}
            <Button
              type="submit"
              loading={form.pending.value}
            >Send</Button>
          </>
        )}
      </Form>
    </Card>
  )
}
```

That's a complete form. Here is what each part of `form` is for:

| | What it gives you |
|---|---|
| `form.error('email')` | The error for that field, or `undefined`. |
| `form.value('email')` | What was typed, when a submit without JavaScript came back with errors. |
| `form.message.value` | A failure that names no field, such as an `FnError`'s message. |
| `form.pending.value` | `true` while this form's submit is in flight. |
| `form.result.value` | What the mutation returned, after a success. |
| `form.field('email')` | Props to spread on a plain `<input>`: `name`, the typed value, and `aria-invalid`/`aria-describedby` when it's wrong. |
| `<form.Error name="email" />` | The field's error text, in an element the `aria-describedby` points at. |

On the path without JavaScript (below), `form.field(name)` puts what was typed back into a plain input by itself. warp's
fields take a plain string `value`, so the example above leaves it out, and they start empty on that path. The field
names are the input's keys. Nested objects use dots (`address.city`), and a name ending in `[]` collects
every field with that name into an array (`tags[]`).

## What happens when you submit

`<Form>` renders a real `<form method="post">`, with a hidden field that names the mutation. What happens next depends
on whether the page's JavaScript is running yet.

**With JavaScript**, which is almost always, the submit is caught. The fields become the mutation's input, and the
mutation is called as from a handler: `optimistic` applies, the queries it invalidates come back in the same response,
and the page doesn't reload. On success the fields are emptied (pass `reset={false}` to keep them), `form.result` is set,
and `onSuccess(result)` runs if you passed one. On failure the errors appear and focus moves to the first field that's
wrong.

**Without JavaScript**, because it hasn't loaded yet, failed to load or is turned off, the browser posts the form to the
page's own URL, and the server runs the mutation. On success it answers with a redirect back to the page (303), or to
wherever the mutation's `redirect()` said, so a reload doesn't send it twice. On failure it renders the same page again,
with the errors next to the fields, and what was typed available as `form.value(name)`. Passwords and anything named like a secret, token
or card number aren't put back.

You write the form once and both paths work. This is what "progressive enhancement" means here: the form works with
plain HTML, and JavaScript makes it nicer, not possible.

:::deepdive Why it's safe without a token
A form that posts to your server could be posted from someone else's page, the attack called cross-site request
forgery. Many frameworks put a secret token in every form to tell real submits from forged ones.

weft checks the browser's own headers instead. A real submit from your page carries `Origin` with your address, or
`Sec-Fetch-Site: same-origin`, and a page on another site can't forge either. A post without that proof is refused with
**F002** (status 403). Behind a proxy, make sure the proxy forwards the original host, so the origins match.

Calls from JavaScript have their own proof (**Q010**): a mutation's stub sends a header a plain form can't, which a
browser won't send cross-site without asking first.
:::

## Validation

Every check runs on the server, in the mutation's input schema, before `run` starts. A field that fails comes back with
its message and its path, and `<Form>` puts each message by the field it names. You don't map errors to fields
yourself.

The demo below shows the experience, with a timer standing in for the server and the same rules as a schema and an
`invalid()` would give. Try submitting it empty, then try `taken@example.com`:

:::demo stack-form

### Strings become numbers and booleans

A form sends strings: `rating` arrives as `"4"`, and a ticked checkbox as `"on"`. A schema shared with the database
wants a number and a boolean. `<Form>` bridges the two: when a field fails the schema and its text has an obvious
reading, it tries that and validates again. `"4"` becomes `4`, `"on"`, `"true"` and `"false"` become booleans, and an
empty field counts as missing, so you get the schema's "required" message, not "expected a number". You don't write
`z.coerce` for forms.

An unticked checkbox sends nothing at all, so a boolean field needs a default (`z.boolean().default(false)`, as `reply`
has above) or `.optional()`. This coercion applies only to a form's submit; a plain `sendFeedback({ … })` call is
validated strictly.

### Errors only the server can find

Some rules can't be in a schema, because they need the database: "that email already has an account", "that slot is
booked". Check them in `run` and refuse with `invalid()`, naming the field:

```ts
import { invalid, mutation } from '@weft-js/start'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { user } from '#/db/schema'

export const checkEmail = mutation({
  input: z.object({ email: z.email() }),
  run: async ({ input, ctx }) => {
    const [taken] = await ctx.db.select({ id: user.id })
      .from(user)
      .where(eq(user.email, input.email))
    if (taken) {
      invalid({ email: 'That email already has an account.' })
    }
    return { free: true }
  },
})
```

`invalid({ field: message })` has exactly the shape of a schema error, so the form can't tell them apart and shows it
the same way. It can name several fields at once, and a dotted name (`'address.city'`) reaches a nested one.

A failure that isn't about one field, such as `throw new FnError({ message: 'Feedback is closed for today.' }, 503)`,
shows in `form.message`. An unexpected error shows there too, as "Server function failed." in production.

:::pitfall Validation in the browser is a courtesy
Anyone can send anything to your server, so the server's schema is the rule. That's why the form's stub carries no
schema: the browser sends, and the server judges. Checks you add in the browser make the form friendlier, but never
replace the ones in `input`.
:::

### Feedback as someone types

The server's answer comes after a submit. For feedback before that, you have two options that keep one set of rules.

The browser's own constraints are free: `required`, `minlength`, `type="email"`, `min` and `max` stop a submit and say
why, and warp's fields show the browser's message in the same place as a server error. They run before the request is
sent, so most mistakes never reach the server at all.

For anything richer, put the schema in a plain module that both sides import, and check one field as it changes:

```ts
// src/lib/feedback.ts
import { z } from 'zod'

export const email = z.email('Enter an email address.')
```

```tsx
import { state } from '@weft-js/core'
import { Input } from '@weft-js/warp'
import { email } from '#/lib/feedback'

export function EmailField() {
  const problem = state<string | undefined>(undefined)
  const check = (value: string) => {
    const r = email.safeParse(value)
    problem.value = r.success || value === ''
      ? undefined
      : r.error.issues[0]?.message
  }
  const onBlur = (e: FocusEvent) => {
    check((e.currentTarget as HTMLInputElement).value)
  }
  return (
    <Input
      label="Email"
      name="email"
      error={problem.value}
      onBlur={onBlur}
    />
  )
}
```

The mutation's `input` uses the same `email` schema, so the message on blur and the message after a submit can't drift
apart. Zod then ships to the browser for this page, which is the cost of this option.

## Pending, results and what comes next

`form.pending` is this form's own. `sendFeedback.pending` exists too, but it's shared by every caller of the mutation, so
on a page with two forms for one mutation it would be true for both. Use the form's. While pending, `<Form>` also sets
`aria-busy` on the `<form>`, and a second submit is ignored until the first settles.

After a success you usually want one of three things:

- **Stay, and say so.** Read `form.result.value`, as the feedback form does.
- **Go somewhere.** End `run` with `redirect('/thanks')`. It works on both paths: the router follows it, or the server
  answers 303 to it.
- **Do something in the page.** Pass `onSuccess`, which gets the result: close a dialog, focus the next input.

```tsx
import { Form, type FormApi } from '@weft-js/start'
import { Button, Input } from '@weft-js/warp'
import { addTodo } from '#/server/todos'

export function AddTodo(props: { onAdded: () => void }) {
  return (
    <Form of={addTodo} onSuccess={() => props.onAdded()}>
      {(form: FormApi) => (
        <>
          <Input
            label="New todo"
            name="title"
            error={form.error('title')}
          />
          <Button
            type="submit"
            loading={form.pending.value}
          >Add</Button>
        </>
      )}
    </Form>
  )
}
```

`addTodo` is a new app's own mutation, with an `optimistic` update: the new row shows in the list the moment the form
is submitted, before the server answers.

### Plain markup

Without warp, or for your own field components, spread `form.field(name)` on the input and put `<form.Error>` near it.
The error element is in the page from the start, so a screen reader announces the message when it appears:

```tsx
import { Form, type FormApi } from '@weft-js/start'
import { addTodo } from '#/server/todos'

export function PlainAdd() {
  return (
    <Form of={addTodo} class="add">
      {(form: FormApi) => (
        <>
          <label>
            Title <input {...form.field('title')} />
          </label>
          <form.Error name="title" class="error" />
          <button
            type="submit"
            disabled={form.pending.value}
          >Add</button>
        </>
      )}
    </Form>
  )
}
```

Any other attribute on `<Form>`, such as `class`, goes on the `<form>` element.

### Two forms, one mutation

A page can have two forms for the same mutation, say "add to this list" at the top and the bottom. With JavaScript each
`<Form>` keeps its own state already. Without it, the server needs to know which form came back with errors: give each
one an `id`, as in `<Form of={addTodo} id="top">`.

### Files

A form with a file input sends `multipart/form-data`, and the mutation's schema takes the file (`z.file()`).
[Uploads and media](/learn/uploads-and-media) covers storing it.

### Without `<Form>`

A form is still allowed to be a plain `<form onSubmit>` that calls a mutation, as a new app's `/todos` page and login
page are. You lose the no-JavaScript path and the field mapping. Field errors are still there, on the error's `issues`,
each with a `path` and a `message`, if you want to place them yourself.

## Diagnostics

| Code | What it means |
|---|---|
| F001 | `<Form of>` was given something that isn't a mutation. |
| F002 | A form post without the same-origin proof (403). |
| F003 | A form post names a mutation the server doesn't have: the page is older than the server. Reload. |
| Q002 | The input failed its schema, or `invalid()` refused a field. In a form, that's the field errors. |

## Recap

- `<Form of={mutation}>` renders a real form. With JavaScript it calls the mutation in place; without, the server runs it
  and answers 303, or the page with the errors.
- Its child gets `form`: `error(name)`, `value(name)`, `message`, `pending`, `result`, `field(name)` and `Error`.
- Validation is the mutation's input schema, on the server. Form strings are read as numbers and booleans when the schema
  wants them; an unticked checkbox needs a default.
- `invalid({ field: message })` refuses a value only the server can judge, shown like a schema error.
- `form.pending` is per form; `redirect()`, `form.result` and `onSuccess` decide what follows a success.
- Browser checks (`required`, a shared Zod schema) are for feedback; the server's schema is the rule.

The [Full stack reference](/reference/start#server-functions) covers mutations and their errors.

## Try it

:::challenge How many?
Add a quantity to this order form's mutation: a whole number from 1 to 10, with a message the reader understands. The
form already has `<Input label="Quantity" type="number" name="qty" error={form.error('qty')} />`.

```ts
import { mutation } from '@weft-js/start'
import { z } from 'zod'

export const order = mutation({
  input: z.object({ item: z.string().min(1) }),
  run: ({ input }) => ({ ordered: input.item }),
})
```
:::solution
A plain number schema is enough: `<Form>` reads `"3"` as `3` for you.

```ts
import { mutation } from '@weft-js/start'
import { z } from 'zod'

export const order = mutation({
  input: z.object({
    item: z.string().min(1),
    qty: z.int('Enter a whole number.')
      .min(1, 'At least 1.')
      .max(10, 'At most 10.'),
  }),
  run: ({ input }) => ({ ordered: `${input.qty} × ${input.item}` }),
})
```

An empty field counts as missing, so it gets the "required" message rather than "expected a number". Adding `min="1"`
and `max="10"` to the input lets the browser catch it before sending, too.
:::

:::challenge One booking per slot
Make `book` refuse a slot that's already taken, with "That slot is booked." shown under the `slot` field.

```ts
import { mutation } from '@weft-js/start'
import { z } from 'zod'

const booked = new Set(['09:00'])

export const book = mutation({
  input: z.object({ slot: z.string().min(1) }),
  run: ({ input }) => {
    booked.add(input.slot)
    return { slot: input.slot }
  },
})
```
:::solution
Check in `run`, and refuse with `invalid()`:

```ts
import { invalid, mutation } from '@weft-js/start'
import { z } from 'zod'

const booked = new Set(['09:00'])

export const book = mutation({
  input: z.object({ slot: z.string().min(1) }),
  run: ({ input }) => {
    if (booked.has(input.slot)) {
      invalid({ slot: 'That slot is booked.' })
    }
    booked.add(input.slot)
    return { slot: input.slot }
  },
})
```

A schema can't know what's booked, but the error it produces looks exactly like a schema's, so `form.error('slot')` shows
it, with JavaScript or without.
:::

:::challenge Thank them on another page
After a successful feedback submit, the reader should land on `/thanks`, whether or not the page's JavaScript was
running. Change only the mutation.
:::solution
End `run` with `redirect()`:

```ts
import { mutation, redirect } from '@weft-js/start'
import { z } from 'zod'

export const sendThanks = mutation({
  input: z.object({ email: z.email(), message: z.string().min(10) }),
  run: () => {
    redirect('/thanks')
  },
})
```

With JavaScript, the router follows the redirect when the call returns. Without, the server answers the form's post with a
303 to `/thanks`. Either way a reload on `/thanks` doesn't send the form again.
:::
