# Auth

:::learn
- What a new app's sign-in is made of, and how a request learns who is signed in
- How sign-up, sign-in and sign-out work as mutations
- How to protect server functions with `auth: 'user'`, and pages with a guard in `load`
- How to bring your own auth provider instead of Better Auth
:::

Until now, every visitor to your app has been the same person. As soon as data belongs to someone, you need to know who
is asking: who may see this list, who may delete this row. That's authentication (who you are) and authorisation (what
you may do), and this page covers both.

An app made with a database gets sign-in by default ([Better Auth](https://www.better-auth.com), with email and
password), wired through everything you've seen so far. `ctx.user` is the signed-in user in every server function and
`load`, `auth: 'user'` refuses anyone else, and the session is a cookie, so pages rendered on the server know who it is
too.

## What sign-in is made of

A new app made with `--auth` (the default when you choose a database) has these files for it:

```
src/auth.server.ts          Better Auth on your database
src/db/schema.ts            Better Auth tables: user, session,
                            account, verification
src/context.server.ts       puts user and session on ctx
src/server/session.ts       me, signUp, signIn and signOut
src/routes/login.tsx        the sign-in and sign-up page
src/routes/todos/_layout.tsx  guards /todos for signed-in users
.env                        BETTER_AUTH_SECRET and BETTER_AUTH_URL
```

An app made without it gets the same with `kerf add auth`, as long as it has a database (`kerf add db` first). Run
`kerf db generate` afterwards, because it adds tables.

The provider is a few lines. `createAuth` makes a Better Auth instance with Kerf's defaults (email and password on,
telemetry off), stored through Drizzle in your own database:

```ts
// src/auth.server.ts
import { createAuth } from '@kerf/start/auth/better-auth'
import { drizzleAuth } from '@kerf/start/auth/drizzle'
import { db } from '#/db/index.server'
import * as schema from '#/db/schema'
import { env } from '#/env.server'

export default createAuth({
  db,
  secret: env.BETTER_AUTH_SECRET,
  options: { database: drizzleAuth(db, schema) },
})
```

Kerf serves Better Auth's own routes under `/api/auth/*`. Anything in `options` goes to Better Auth as is, and wins over
the defaults, so its plugins and settings (social sign-in, email verification, session length) are configured here, as its
docs describe. A provider with no store is **A005**.

## How a request knows who it is

Every request runs `src/context.server.ts` once, before any server function or `load`:

```ts
// src/context.server.ts
import { session } from '@kerf/start/auth'
import auth from '#/auth.server'
import { db } from '#/db/index.server'

export default async ({ request }: { request: Request }) => ({
  db,
  ...(await session(auth, request)),
})

type Session = Awaited<ReturnType<typeof auth.session>>

declare module '@kerf/start' {
  interface Context {
    db: typeof db
    user: Session['user']
    session: Session['session']
  }
}
```

`session(auth, request)` reads the session cookie and returns `{ user, session }`, which is spread onto `ctx`. For a
visitor who isn't signed in both are `null`. The `declare module` block types them, so `ctx.user.email` is checked
everywhere.

A request with no session cookie costs nothing: Kerf answers `{ user: null, session: null }` without asking the
database. Pages for visitors stay as cheap as pages without auth.

## Signing up, in and out

Sign-in is a mutation, like any other write. This is the one a new app has:

```ts
// src/server/session.ts
import { mutation, query, redirect } from '@kerf/start'
import { forward } from '@kerf/start/auth'
import { z } from 'zod'
import auth from '#/auth.server'

const credentials = z.object({
  email: z.email(),
  password: z.string().min(8),
})

/** Who is signed in, or null. */
export const me = query({
  tags: ['session'],
  run: ({ ctx }) => ctx.user
    ? { id: ctx.user.id, name: ctx.user.name, email: ctx.user.email }
    : null,
})

export const signUp = mutation({
  auth: 'public',
  input: credentials.extend({ name: z.string().trim().min(1) }),
  run: async ({ input, ctx }) => {
    const response = auth.api.signUpEmail({
      body: input,
      headers: ctx.request.headers,
      asResponse: true,
    })
    await forward(ctx, response)
    redirect('/todos')
  },
})

export const signIn = mutation({
  auth: 'public',
  input: credentials,
  run: async ({ input, ctx }) => {
    const response = auth.api.signInEmail({
      body: input,
      headers: ctx.request.headers,
      asResponse: true,
    })
    await forward(ctx, response)
    redirect('/todos')
  },
})

export const signOut = mutation({
  auth: 'public',
  run: async ({ ctx }) => {
    const response = auth.api.signOut({
      headers: ctx.request.headers,
      asResponse: true,
    })
    await forward(ctx, response)
    redirect('/login')
  },
})
```

Each one calls Better Auth's API, and `forward` finishes the job: it copies Better Auth's cookies onto this response,
and when Better Auth says no ("Invalid email or password"), it throws an `FnError` with that message, which the
caller can show. Then `redirect()` sends the browser on.

Because these are ordinary mutations, everything from [Server functions](/learn/server-functions) applies: the input is
validated on the server, and no Better Auth code reaches the browser. The sign-in page calls them like any mutation. With
[`<Form>`](/learn/forms-and-validation) it even works before the page's JavaScript has loaded:

```tsx
// src/routes/signin.tsx
import {
  Form,
  redirect,
  type FormApi,
  type LoadArgs,
  type Meta,
} from '@kerf/start'
import { Alert, Button, Card, Input } from '@kerf/veneer'
import { signIn } from '#/server/session'

// Someone already signed in has nothing to do here.
export const load = ({ ctx }: LoadArgs) => {
  if (ctx.user) redirect('/todos')
}

export const meta: Meta = {
  title: 'Sign in',
  description: 'Sign in to see your todos.',
}

export default function SignIn() {
  return (
    <Card title="Sign in">
      <Form of={signIn}>
        {(form: FormApi) => (
          <>
            <Input
              label="Email"
              type="email"
              name="email"
              autocomplete="email"
              error={form.error('email')}
            />
            <Input
              label="Password"
              type="password"
              name="password"
              autocomplete="current-password"
              error={form.error('password')}
            />
            {form.message.value && (
              <Alert tone="critical" live>
                {form.message.value}
              </Alert>
            )}
            <Button type="submit" loading={form.pending.value}>
              Sign in
            </Button>
          </>
        )}
      </Form>
    </Card>
  )
}
```

To show who is signed in, read `me`. The root layout is a good place, since every page has it:

```tsx
import { Link, type RouteProps } from '@kerf/start'
import { Button } from '@kerf/veneer'
import { me, signOut } from '#/server/session'

export const load = () => me.fetch()

export default function Root(props: RouteProps<typeof load>) {
  const { data, children } = props
  return (
    <>
      <nav>
        <Link href="/">Home</Link>
        {data ? (
          <>
            <span>{data.name}</span>
            <Button emphasis="ghost" onClick={() => void signOut()}>
              Sign out
            </Button>
          </>
        ) : (
          <Link href="/login">Sign in</Link>
        )}
      </nav>
      <main>{children}</main>
    </>
  )
}
```

:::pitfall Always redirect after the session changes
After someone signs in or out, the tab still holds what the last session loaded: the last user's todos sit in the query
cache. The `redirect()` at the end of each mutation above is what clears it. A redirect after a session change is a full
page load, so the tab starts again with nothing cached. A mutation that changes the session cookie without one gets
**A004** in development.
:::

## Protecting server functions

Every server function has a URL, and anyone can call it with anything: hiding a button doesn't stop a request. So the
protection goes on the function. `auth: 'user'` refuses a call with no signed-in user before `run` starts, with **A002**
(status 401), and narrows `ctx.user` to non-null:

```ts
import { query } from '@kerf/start'
import { eq } from 'drizzle-orm'
import { todos } from '#/db/schema'

export const myTodos = query({
  tags: ['todos'],
  auth: 'user',
  run: ({ ctx }) => ctx.db
    .select()
    .from(todos)
    .where(eq(todos.userId, ctx.user.id)),
})
```

That answers "is someone signed in?". It doesn't answer "may they see this row?", which depends on the row. The usual
way is to put the rule in the query's `where`, so rows that aren't theirs never come back. For a rule that isn't about
rows, check in `run` and refuse with an `FnError`:

```ts
import { FnError, query } from '@kerf/start'
import { count } from 'drizzle-orm'
import { user } from '#/db/schema'

const ADMINS = ['ada@example.com']

export const userCount = query({
  tags: ['user'],
  auth: 'user',
  run: async ({ ctx }) => {
    if (!ADMINS.includes(ctx.user.email)) {
      throw new FnError({ message: 'Only admins can see this.' }, 403)
    }
    const [row] = await ctx.db.select({ n: count() }).from(user)
    return row?.n ?? 0
  },
})
```

:::note A003
`auth: 'user'` needs `ctx.user` to exist, even as `null`. If `src/context.server.ts` doesn't spread the session onto
`ctx`, every call to such a function fails with **A003**, which says what to add.
:::

## Protecting pages

A page is protected by its `load`. A guard redirects before anything renders:

```tsx
import {
  redirect,
  type LoadArgs,
  type RouteProps,
} from '@kerf/start'

export const load = ({ ctx }: LoadArgs) => {
  if (!ctx.user) redirect('/login')
}

export default function Account(props: RouteProps) {
  return <section>{props.children}</section>
}
```

Put it in a `_layout.tsx` and it covers every page in that folder, because a layout's `load` runs before the `load` of
anything below it. That's what a new app's `src/routes/todos/_layout.tsx` is. The login page does the reverse: its
`load` sends someone already signed in to `/todos`.

A guard is about what the page shows, not about the data. The page's queries need `auth: 'user'` too, because they can
be called without the page.

## Settings that matter

Two values in `.env`:

- **`BETTER_AUTH_SECRET`** signs sessions. A new app gets a random one. A production server with a missing secret, or
  one under 32 characters, refuses to start (**A001**); make one with `openssl rand -base64 32` and set it in the host's
  environment, not in the repository.
- **`BETTER_AUTH_URL`** is the address the app runs at, `http://localhost:5173` by default. If the app runs somewhere
  else, such as `kerf dev --port 3000` or a deployed domain, change it to match, or sign-in answers `INVALID_ORIGIN`.

## Your own auth provider

Better Auth is the default, not a requirement. A provider is anything with two functions: `session(request)`, which says
who a request is, and `handler(request)`, which serves the provider's own routes under `/api/auth`. Write one with
`defineAuth` as `src/auth.server.ts`'s default export, and `ctx.user` and `auth: 'user'` work with whatever it returns:

```ts
import { defineAuth } from '@kerf/start/auth'

type User = { id: string; name: string }

const tokens = new Map<string, User>([
  ['demo-token', { id: 'u1', name: 'Demo' }],
])

export default defineAuth<User, { token: string }>({
  async session(request) {
    const cookie = request.headers.get('cookie') ?? ''
    const token = /(?:^|;\s*)token=([^;]+)/.exec(cookie)?.[1]
    const user = token ? tokens.get(token) : undefined
    return user && token
      ? { user, session: { token } }
      : { user: null, session: null }
  },
  async handler() {
    return new Response('Not found', { status: 404 })
  },
})
```

`--auth-provider custom` makes a new app with a stub like this one in place of Better Auth. A real provider would check
the token against a store, or verify a signed one; this sketch keeps a map to show the shape.

## Recap

- With `--auth` or `kerf add auth`, Better Auth runs on your database; its routes are under `/api/auth`.
- `src/context.server.ts` puts `ctx.user` and `ctx.session` on every request. With no session cookie, they're `null` and
  no query runs.
- Sign-up, sign-in and sign-out are mutations that `forward` Better Auth's response and then `redirect()`. Without the
  redirect, the tab keeps the last session's cache (A004).
- `auth: 'user'` refuses calls with no user (A002) and makes `ctx.user` non-null. Rules about rows go in the `where`.
- A guard in a layout's `load` keeps visitors out of a section. It protects the page, not the data.
- `BETTER_AUTH_SECRET` must be 32+ characters in production (A001); `BETTER_AUTH_URL` must match where the app runs.

The [Full stack reference](/reference/start#auth) has the rest.

## Try it

:::challenge A sign-in that leaves the old user behind
After signing in as a second user, the page still shows the first user's todos until a reload, and the dev server warns
with A004. What's missing?

```ts
import { mutation } from '@kerf/start'
import { forward } from '@kerf/start/auth'
import { z } from 'zod'
import auth from '#/auth.server'

export const quickSignIn = mutation({
  auth: 'public',
  input: z.object({ email: z.email(), password: z.string().min(8) }),
  run: async ({ input, ctx }) => {
    const response = auth.api.signInEmail({
      body: input,
      headers: ctx.request.headers,
      asResponse: true,
    })
    await forward(ctx, response)
    return { ok: true }
  },
})
```
:::solution
A redirect after the session changes:

```ts
import { mutation, redirect } from '@kerf/start'
import { forward } from '@kerf/start/auth'
import { z } from 'zod'
import auth from '#/auth.server'

export const quickSignIn = mutation({
  auth: 'public',
  input: z.object({ email: z.email(), password: z.string().min(8) }),
  run: async ({ input, ctx }) => {
    const response = auth.api.signInEmail({
      body: input,
      headers: ctx.request.headers,
      asResponse: true,
    })
    await forward(ctx, response)
    redirect('/todos')
  },
})
```

When a mutation changes the session cookie and redirects, the browser does a full page load, so nothing cached for the
last user survives. Returning normally keeps the tab and its cache as they were.
:::

:::challenge Keep visitors out of the account pages
Make every page under `/account` redirect to `/login` for a visitor who isn't signed in, including pages added later.
:::solution
A layout for the folder, `src/routes/account/_layout.tsx`, with a guard in its `load`:

```tsx
import {
  redirect,
  type LoadArgs,
  type RouteProps,
} from '@kerf/start'

export const load = ({ ctx }: LoadArgs) => {
  if (!ctx.user) redirect('/login')
}

export default function AccountLayout(props: RouteProps) {
  return <>{props.children}</>
}
```

A layout's `load` runs before its pages' loaders, so none of them runs for a visitor, and a new page in the folder is
covered without a change. The queries those pages read still carry `auth: 'user'`.
:::

:::challenge Only the author may edit
`editTodo` checks that someone is signed in, but any signed-in user can change any todo whose id they know. Fix it so
only the todo's owner can, and anyone else gets "Not yours." with status 403.

```ts
import { mutation } from '@kerf/start'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { todos } from '#/db/schema'

export const editTodo = mutation({
  input: z.object({ id: z.string(), title: z.string().min(1) }),
  auth: 'user',
  invalidates: ['todos'],
  run: ({ input, ctx }) => ctx.db
    .update(todos)
    .set({ title: input.title })
    .where(eq(todos.id, input.id))
    .returning(),
})
```
:::solution
Add the owner to the `where`, and refuse when nothing matched:

```ts
import { FnError, mutation } from '@kerf/start'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { todos } from '#/db/schema'

export const editTodo = mutation({
  input: z.object({ id: z.string(), title: z.string().min(1) }),
  auth: 'user',
  invalidates: ['todos'],
  run: async ({ input, ctx }) => {
    const [row] = await ctx.db
      .update(todos)
      .set({ title: input.title })
      .where(and(
        eq(todos.id, input.id),
        eq(todos.userId, ctx.user.id),
      ))
      .returning()
    if (!row) throw new FnError({ message: 'Not yours.' }, 403)
    return row
  },
})
```

The check and the write are one statement, so there's no moment between them where things could change.
:::
