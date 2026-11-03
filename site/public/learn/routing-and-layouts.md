# Routing and layouts

:::learn
- How files in `src/routes` become pages, including `[param]` and `[...rest]` segments
- How `_layout.tsx` wraps the pages below it, and why a layout keeps its state when you navigate
- How to link and navigate, and how a page answers 404, an error or a redirect
- What a route module can export: `default`, `load`, `meta` and `prerender`
:::

So far every component you wrote lived on one page. A real app has many: a home page, a list, one page per item, a
settings section with its own menu. In `@weft-js/start` you don't configure a router for that. You make files, and the
folder they're in is the URL they answer.

This page is about where pages come from and how you move between them. The next one, [Loading data](/learn/loading-data),
is about what goes in them.

## Routes are files

Every file in `src/routes` is a route. Its path inside that folder is its URL:

```
src/routes/index.tsx            /
src/routes/about.tsx            /about
src/routes/todos/index.tsx      /todos
src/routes/todos/[id].tsx       /todos/42, /todos/abc…
src/routes/docs/[...rest].tsx   /docs/a, /docs/a/b/c…
src/routes/_layout.tsx          wraps every page
src/routes/todos/_layout.tsx    wraps every page under /todos
src/routes/404.tsx              the not-found page
src/routes/_error.tsx           the error page
```

A route's page is the file's default export, an ordinary component. Here is the `/about` page a new app starts with,
with a `meta` added so the tab and search results say what it is:

```tsx
// src/routes/about.tsx
import type { Meta } from '@weft-js/start'

export const meta: Meta = { title: 'About', description: 'Who makes this app, and why.' }

export default function About() {
  return (
    <main>
      <h1>About</h1>
      <p>A small app for keeping track of what to do next.</p>
    </main>
  )
}
```

`index.tsx` is the folder's own page, so `todos/index.tsx` answers `/todos`. Files and folders whose names start with `_`
are left out of the URL table (other than `_layout` and `_error`), and so are test files, so you can keep a
`todos/_parts.tsx` of helpers next to the pages that use it.

`weft routes` prints the table it found, which is handy when a page isn't where you expected:

```bash
npx weft routes
```

:::note No configuration
If you've used Next.js's app router, this will feel familiar: `_layout.tsx` is its `layout.tsx`, `[id]` and
`[...rest]` are the same, and `404.tsx` is its `not-found`. There are no route groups, parallel routes or `loading.tsx`:
a waiting state is a [`<Boundary>`](/learn/loading-data), placed where you want it.
:::

## Pages with parameters

A segment in square brackets matches any one segment of the URL and hands it to the page as a parameter.
`todos/[id].tsx` answers `/todos/42`, with `params.id` set to `'42'`.

A page usually loads something by that id. It does that in `load`, which runs on the server before the page renders, and
it can say "there is no such page" by returning `notFound()`. This pair of files is a page for one todo. The query comes
first, in a server module:

```ts
// src/server/todo.ts
import { query } from '@weft-js/start'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { todos } from '#/db/schema'

export const getTodo = query({
  input: z.object({ id: z.string() }),
  auth: 'user',
  tags: ({ id }) => ['todos', `todos:${id}`],
  run: async ({ input, ctx }) => {
    const [row] = await ctx.db.select().from(todos).where(and(eq(todos.id, input.id), eq(todos.userId, ctx.user.id)))
    return row ?? null
  },
})
```

Then the route reads the parameter, loads the row, and shows it:

```tsx
// src/routes/todos/[id].tsx
import { notFound, type LoadArgs, type Meta, type RouteProps } from '@weft-js/start'
import { getTodo } from '#/server/todo'

export const load = async ({ params }: LoadArgs<'/todos/[id]'>) => (await getTodo.fetch({ id: params.id })) ?? notFound()

export const meta: Meta<typeof load> = ({ data }) => ({ title: data.title, description: `A todo: ${data.title}.` })

export default function Todo(props: RouteProps<typeof load, '/todos/[id]'>) {
  return (
    <article>
      <h1>{props.data.title}</h1>
      <p>{props.data.done ? 'Done.' : 'Still to do.'}</p>
    </article>
  )
}
```

The string you pass to `LoadArgs` and `RouteProps` is the route's file path, and it types `params`: here `params.id` is a
`string`, and `params.idd` is an error. `RouteProps<typeof load>` types `props.data` from what `load` returns, with
`notFound()` taken out, so `props.data.title` needs no check. weft writes `.weft/routes.d.ts` with every route path, so
an editor can complete them.

`load` and `meta` never reach the browser: the build strips them from the client's copy of the file. [Loading
data](/learn/loading-data) covers both in depth, and [Server functions](/learn/server-functions) covers `query`.

### Catch-all segments

`[...rest]` matches the rest of the path, however many segments it has. It must be the last segment. The parameter
holds the whole remainder, slashes included:

```tsx
// src/routes/docs/[...rest].tsx
import type { RouteProps } from '@weft-js/start'

export default function Docs(props: RouteProps<undefined, '/docs/[...rest]'>) {
  return <p>You asked for the page at {props.params.rest}.</p>
}
```

`/docs/guides/setup` shows "guides/setup". When two routes could match, the more specific one wins: a fixed segment
beats a `[param]`, and a `[param]` beats a `[...rest]`. So `todos/new.tsx` and `todos/[id].tsx` can sit side by side,
and `/todos/new` goes to the first.

:::pitfall A parameter is a whole segment
`post-[id].tsx` or `[year]-[month].tsx` don't work: a segment that mixes text and brackets is reported and left out of
the table. Use a folder per parameter (`posts/[id].tsx`), or one parameter you split yourself in `load`.
:::

## Layouts

A layout is a component that wraps every page in its folder and the folders below it. It renders `props.children`
where the page goes. The root `_layout.tsx` wraps the whole app, so it is the place for the navigation every page shares.
This is the one a new app starts with:

```tsx
// src/routes/_layout.tsx
import { Link, type RouteProps } from '@weft-js/start'

export default function Root(props: RouteProps) {
  return (
    <>
      <nav>
        <Link href="/">Home</Link>
        <Link href="/about">About</Link>
        <Link href="/todos">Todos</Link>
      </nav>
      <main>{props.children}</main>
    </>
  )
}
```

Layouts nest. A `_layout.tsx` in `src/routes/settings` wraps only the settings pages, inside the root layout. A page under
`/settings/profile` is then three levels: the root layout, the settings layout, and the page:

```tsx
// src/routes/settings/_layout.tsx
import { Link, type RouteProps } from '@weft-js/start'

export default function Settings(props: RouteProps) {
  return (
    <div class="settings">
      <aside>
        <Link href="/settings">General</Link>
        <Link href="/settings/profile">Profile</Link>
      </aside>
      <section>{props.children}</section>
    </div>
  )
}
```

### A layout stays while its pages change

When you go from `/settings` to `/settings/profile`, the root layout and the settings layout don't change, so weft keeps
them. They don't run again and nothing inside them is rebuilt: only the page level below them switches. That has a useful
consequence. State in a layout survives navigation between its pages. A search box in the settings sidebar keeps what you
typed while you click between settings pages, and a video playing in the root layout keeps playing.

It also means a layout gets new `params` and `data` in place. If a layout reads `props.params.id`, the bindings that read
it update when you go from `/teams/1/members` to `/teams/2/members`; the layout itself doesn't run again. This is the same
"components run once" rule you met in [Components run once](/learn/components-run-once): compute from `props.params` and
`props.data` in JSX or a `derived`, not in the component body, where it would run once (W001).

:::deepdive How navigation works
A page is a chain of levels, outer to inner: the root layout, any nested layouts, the page. Each level holds three
things: which route it shows, its params and its data.

When you click a link, the browser fetches the new route's data from the server as JSON (`/_weft/data/<path>`), along with
the code for any route it hasn't loaded yet. Then weft walks the chain. A level that keeps its route gets the new params
and data, written only if they changed. The first level whose route changed renders its new component, and everything
inside it goes with the old one.

So weft never re-renders a page to find out what changed. It knows from the route table, and the work is proportional to
what is different. A level with no client code at all (a layout that is only markup) arrives as HTML and is swapped in.
:::

### Layouts with data

A layout can export `load` too. Its data arrives as its own `props.data`, separate from the page's. A layout's `load`
runs before the `load` of anything below it, which makes it the place for a check every page in the folder needs. The
`/todos` section of a new app with sign-in does exactly that:

```tsx
// src/routes/todos/_layout.tsx
import { redirect, type LoadArgs, type RouteProps } from '@weft-js/start'

// A layout's `load` runs before its pages', so nothing under /todos runs for a visitor who isn't signed in.
export const load = ({ ctx }: LoadArgs) => {
  if (!ctx.user) redirect('/login')
}

export default function TodosLayout(props: RouteProps) {
  return <>{props.children}</>
}
```

[Auth](/learn/auth) has more on guards like this one.

## Linking between pages

Use `<Link href>` for links inside the app:

```tsx
import { Link } from '@weft-js/start'

export function Footer() {
  return (
    <footer>
      <Link href="/about">About</Link> · <Link href="/todos" class="cta">Your todos</Link>
    </footer>
  )
}
```

Any same-origin `<a href>` already navigates without a full page load: weft listens for clicks on the page. What `Link`
adds is `aria-current="page"` while its `href` is the page you're on, so a menu can show where you are with one CSS rule
(`a[aria-current="page"] { font-weight: 600 }`), and screen readers announce it. It passes every other attribute through.

To navigate from code, for example after a save, call `navigate`:

```tsx
import { navigate } from '@weft-js/start'
import { Button } from '@weft-js/warp'
import { addTodo } from '#/server/todos'

export function QuickAdd() {
  const add = async () => {
    await addTodo({ title: 'Call the plumber' })
    await navigate('/todos')
  }
  return <Button onClick={() => void add()}>Add and go to the list</Button>
}
```

`navigate(href, { replace: true })` replaces the history entry instead of pushing one, and `{ scroll: false }` keeps
the scroll position instead of going to the top (or to the URL's `#hash`). Before the app's code has started, or for
another origin, `navigate` does a full page load.

:::note A mutation can navigate too
A server function can end with `redirect('/somewhere')`, and the browser goes there when the call returns. That keeps
"where to go next" with the code that decided it. [Server functions](/learn/server-functions#redirecting) shows it.
:::

## Not found, errors and redirects

`404.tsx` at the root of `src/routes` is the page for any URL that matches nothing, and for any `load` that returns (or
throws) `notFound()`. It renders inside the root layout, with status 404. Its data is the path that missed:

```tsx
// src/routes/404.tsx
import { Link, type Meta } from '@weft-js/start'

export const meta: Meta = { title: 'Page not found', description: 'There is no page at this address.' }

export default function NotFound(props: { data: { path: string } }) {
  return (
    <main>
      <h1>Nothing at {props.data.path}</h1>
      <p><Link href="/">Back to the start</Link></p>
    </main>
  )
}
```

`_error.tsx` is the page for a `load` or `meta` that throws. It also renders inside the root layout, with status 500
(or 503 when the database is down). Its data is the status and a message. In development the message is the error's
own; in production it is "Something went wrong.", so nothing about your server leaks to a visitor:

```tsx
// src/routes/_error.tsx
import type { Meta } from '@weft-js/start'

export const meta: Meta = { title: 'Something went wrong' }

export default function Failed(props: { data: { status: number; message: string } }) {
  return (
    <main>
      <h1>Error {props.data.status}</h1>
      <p>{props.data.message}</p>
    </main>
  )
}
```

Without these files the status is still right, but the page is only the root layout with nothing where the page
goes, titled "Not found" or "Error", so it's worth writing both. Both are read only at the root of
`src/routes` for now; one in a subfolder is reported and ignored.

An error thrown while a component renders is different: it goes to the nearest [`<Boundary error>`](/learn/async-and-loading),
not to `_error.tsx`, because by then the page has started.

`redirect(href)` sends the visitor somewhere else. Called in `load`, the server answers 307 with a `Location` header
before any HTML is sent; on a client navigation the router follows it. You can pass another status:
`redirect('/new-home', 308)` for a page that moved for good. `redirect` throws, so code after it doesn't run, and
TypeScript knows it:

```tsx
import { redirect, type LoadArgs } from '@weft-js/start'
import { getTodo } from '#/server/todo'

export const load = async ({ params }: LoadArgs<'/old-todos/[id]'>) => {
  const todo = (await getTodo.fetch({ id: params.id })) ?? redirect('/todos')
  return { todo }
}
```

Here `todo` is typed as the row, never `null`: if there was no row, `redirect` already left.

## What a route module exports

| Export | Runs | What it's for |
|---|---|---|
| `default` | server and browser | The page or layout component. |
| `load` | server only | Data for this level, before the first byte. [Loading data](/learn/loading-data). |
| `meta` | server only | Title, description and the rest of the head. [Metadata and share images](/learn/metadata-and-share-images). |
| `prerender` | build only | The params of a `[param]` route that `weft build` knows ahead of time. |

`prerender` lists the pages of a parameter route that exist at build time. `weft build` draws their share cards
ahead of time, and `weft check` checks their metadata. A static host, with no server to draw a card on request, needs it
(H002). A route without parameters is always covered:

```tsx
import type { Prerender, RouteProps } from '@weft-js/start'

export const prerender: Prerender<'/guides/[slug]'> = [{ slug: 'setup' }, { slug: 'deploying' }]

export default function Guide(props: RouteProps<undefined, '/guides/[slug]'>) {
  return <h1>{props.params.slug}</h1>
}
```

It can also be a function, sync or async, when the list comes from somewhere else.

A file next to a route named `<route>.og.tsx`, such as `todos/[id].og.tsx`, draws that route's share card, the image a
link preview shows. `_default.og.tsx` replaces the built-in card for every route. [Metadata and share
images](/learn/metadata-and-share-images) covers both.

## Recap

- Files in `src/routes` are pages. `index.tsx` is a folder's own page, `[id]` is one segment as a parameter, and
  `[...rest]` is the rest of the path. Names starting with `_` stay out of the URL table.
- `_layout.tsx` wraps every page below it and renders `props.children`. Layouts nest, and a layout that stays across a
  navigation keeps its state.
- A layout's `load` runs before its pages', so it is where a guard goes.
- `<Link href>` links and marks the current page; `navigate(href)` moves from code; any same-origin `<a>` already
  navigates without a reload.
- `notFound()` renders `404.tsx`, a throw in `load` renders `_error.tsx`, and `redirect()` answers 307 before anything is
  sent.
- A route module exports `default`, and when it needs them `load`, `meta` and `prerender`.

The [Full stack reference](/reference/start#routes) has the exact rules.

## Try it

:::challenge Mark where the reader is
The root layout's links all look the same. Make the link to the page you're on bold, without any JavaScript of your own.
:::solution
`Link` already sets `aria-current="page"` on the link whose `href` is the current path, so it's one CSS rule, in the
app's stylesheet:

```css
nav a[aria-current='page'] {
  font-weight: 600;
}
```

It follows client navigations too, because `Link` reads the current path as state.
:::

:::challenge A docs section that knows its pages
Write `src/routes/docs/[...rest].tsx` so that `/docs/setup` and `/docs/guides/deploying` show a title, and any other
path under `/docs` answers 404 with your `404.tsx`.
:::solution
Look the path up in `load`, and return `notFound()` when it isn't there:

```tsx
import { notFound, type LoadArgs, type Meta, type RouteProps } from '@weft-js/start'

const PAGES: Record<string, string> = { setup: 'Setting up', 'guides/deploying': 'Deploying' }

export const load = ({ params }: LoadArgs<'/docs/[...rest]'>) => {
  const title = PAGES[params.rest]
  return title ? { title } : notFound()
}

export const meta: Meta<typeof load> = ({ data }) => ({ title: data.title })

export default function Doc(props: RouteProps<typeof load, '/docs/[...rest]'>) {
  return <h1>{props.data.title}</h1>
}
```

Because `notFound()` is decided in `load`, before the first byte, the status really is 404, which is what search
engines go by.
:::

:::challenge Keep visitors out of a section
Add a `/settings` section whose pages are only for signed-in users. A visitor who isn't signed in should land on `/login`
before any settings page runs.
:::solution
Give the section a layout whose `load` checks `ctx.user`:

```tsx
import { redirect, type LoadArgs, type RouteProps } from '@weft-js/start'

export const load = ({ ctx }: LoadArgs) => {
  if (!ctx.user) redirect('/login')
}

export default function Settings(props: RouteProps) {
  return <div class="settings">{props.children}</div>
}
```

Saved as `src/routes/settings/_layout.tsx`, it covers every page under `/settings`, including ones you add later. A
layout's `load` runs before its pages' loaders, so none of them runs for a visitor. The guard decides what the page shows;
the queries those pages call still need `auth: 'user'` of their own, because anyone can call a server function directly.
:::
