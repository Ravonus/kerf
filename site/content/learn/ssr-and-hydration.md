# SSR, islands and hydration

:::learn
- What the server sends for a page, and how it streams the slow parts
- How weft works out which components need JavaScript at all, with nothing to annotate
- When each island's code loads, and how a click before then isn't lost
- How to read `.weft/hydration.json`, and when a `@weft` hint helps
- How to prerender pages at build time
:::

Every page in a weft app is rendered on the server first. The browser gets real HTML it can paint at once, a crawler
gets the same HTML, and a visitor on a slow phone can read the page before any script has arrived. Then the page has to
become interactive, which is *hydration*: code runs in the browser, finds the HTML the server made, and attaches to it
without rebuilding it.

React hydrates the whole page: every component's code ships and runs again in the browser, even a footer that will
never change. Frameworks that avoid that usually ask you to mark the interactive parts yourself, as islands or client
components. weft does neither. Its compiler already knows which components read state, handle events or start effects,
so it works out the islands for you, and the rest of the page ships no JavaScript at all.

:::demo server-replay

## What the server sends

A request for a page runs the route's layouts' and route's `load` functions, then `meta`, then renders the component
tree to HTML. Because components run once (see [Components run once](/learn/components-run-once)), rendering on the
server is the same code running in a different place: the body runs, boxes get their first values, and the JSX becomes
a string.

Code that needs the browser, such as measuring an element or reading `localStorage`, belongs in `onMount` or a browser
value from `@weft-js/core/browser`, which don't run on the server. A browser value like `online()` reads as its server
value during SSR (`true`), so the HTML is the same for everyone, then becomes the real one after hydration.
`media(query)` has no sensible default, so in a server-rendered component it needs `{ ssr }` (**W054**).

### Streaming the slow parts

A page doesn't have to wait for its slowest data. A query created inside a `<Boundary pending={…}>` is streamed: the
server sends everything outside the Boundary, with the `pending` view in its place, and then sends the real content in
the same response when the data arrives. A query created outside any Boundary holds the first byte until it's ready.

```tsx
import { Boundary } from '@weft-js/core'
import { listTodos } from '#/server/todos'

function Todos() {
  const todos = listTodos()
  return (
    <ul>
      {(todos.value ?? []).map(t => (
        <li key={t.id}>{t.title}</li>
      ))}
    </ul>
  )
}

export function TodoPage() {
  return (
    <main>
      <h1>Your todos</h1>
      <Boundary pending={<p>Loading your list…</p>}>
        <Todos />
      </Boundary>
    </main>
  )
}
```

The heading paints immediately; the list follows in the same response. (On a client navigation there's no HTML to
stream: the route's data arrives as JSON, and the Boundary shows `pending` until it's there.) A loader can do the same
with a field it leaves as a promise. [Loading data](/learn/loading-data) shows both, and [Async and loading
states](/learn/async-and-loading) covers `Boundary` itself.

## Partial hydration: only what needs code ships code

Look at a product page:

```tsx
import { state } from '@weft-js/core'

function Specs(props: { weight: string; volume: string }) {
  return (
    <dl>
      <dt>Weight</dt>
      <dd>{props.weight}</dd>
      <dt>Volume</dt>
      <dd>{props.volume}</dd>
    </dl>
  )
}

function AddToCart(props: { name: string }) {
  const count = state(0)
  return (
    <button type="button" onClick={() => count.value++}>
      Add {props.name} ({count.value})
    </button>
  )
}

export default function Kettle() {
  return (
    <main>
      <h1>Pour-over kettle</h1>
      <p>A gooseneck kettle that holds its heat for an hour.</p>
      <Specs weight="1.1 kg" volume="0.9 l" />
      <AddToCart name="kettle" />
    </main>
  )
}
```

`Specs` takes props and returns markup. Nothing in it can change after the server rendered it, so its code never needs
to reach the browser. `AddToCart` makes a box and handles a click: it needs the client. `Kettle` itself only arranges
the two, so the route is a *static level*, and `<AddToCart name="kettle" />` is an *island*: the one place on the page
where code runs.

The compiler decides this from what each top-level binding does, followed across files:

- A component **needs the client** when it has a handler or a `ref` on an element, a side effect at the top of its
  module, or reads anything that does: weft's reactive API, a query, a binding that made a box.
- A call to such a component from code that doesn't need the client is an **island**.
- Everything else is **static**: its HTML comes from the server, on the first load and on client navigation too, and its
  code isn't sent.

Each island's props travel with it. Literal props, like `name="kettle"`, stay in the island's code; the rest go as JSON
in the page. A prop JSON can't carry (a function, a `Date`, a class instance) is **H009** when the server renders it.
Children passed to an island stay the server's HTML.

:::note Wrong only in the cheap direction
What the compiler can't see through, such as a component from a package, a spread of props, or a function prop built
from local names, keeps its caller on the client. The failure mode is shipping a few bytes too many, never a button
that doesn't work. A route that can't be split falls back to hydrating whole, as every route did before.
:::

:::deepdive Why weft infers this instead of asking
Other frameworks have `"use client"`, `client:load` or `<NoHydration>`. Each is one more thing to get right on every
component, and getting it wrong in the cheap direction (never annotating) quietly costs the whole performance budget.
weft's compiler already reports what each binding reads for its own reasons, so the project-level pass that follows
those facts across files is a small step, and it's exact where an annotation would be a guess.

On the home page of a real shop measured while building it, this took the JavaScript from 34.1 KB to 26.3 KB and the
DOM's hydration markers from about a thousand to 73. Static regions get no keys or markers at all.
:::

## When an island loads

Being an island says *whether* code is needed. weft also works out *when*, from what the island does. There are three
answers:

| `when` | Means | Chosen when |
|---|---|---|
| `interaction` | Load on the first event in the island | It has handlers and nothing else: every change starts with an event |
| `visible` | Load when it comes near the viewport | It starts work by itself, but the work stays inside it, or it reads server data |
| `load` | Load with the page | Anything else: it moves focus or scroll, has `autofocus`, runs code as its module loads, keeps a box at module level, or does something the compiler can't see into |

`AddToCart` above only has a handler, so it waits for `interaction`. A page where every island waits starts with almost
nothing to run: weft's runtime and a tiny inline script.

A guess is still involved for fetching. Islands in roughly the first screen of the page (blocks and text before them,
against 900 px) are preloaded, so their code is in the cache by the time anyone touches them; islands further down
aren't fetched until they're needed. Under `Save-Data` or `prefers-reduced-data` nothing is preloaded, and nothing loads
until interaction.

### A click before the code arrives

An island that waits for interaction has a problem to solve: the click that wakes it happens before its code exists.
weft solves it with a capture script, about half a kilobyte, inline in every page of an app with lazy islands. It holds
events on islands that aren't running yet, starts loading their code, and replays the events in order once they're
claimed. The demo at the top of the page shows the difference.

- Clicks, submits and resets are held, and their replay is what acts, so a default action runs once. If the code never
  comes, they run anyway, and the page behaves as it would with no JavaScript.
- Typing and focus already happened in the DOM, so they replay only to catch the island's state up. A control that
  changed with no event (autofill, a form the browser restored) gets one after the claim.
- There's one queue, so an event on an island still loading holds up the events behind it. A click can't overtake the
  typing before it.

A link outside any island is a plain link until the client starts. That's safe: a page with no code running has no
state to lose, so a full page load loses nothing.

:::pitfall Inline scripts and a strict CSP
The capture script is inline. If your content security policy blocks inline scripts, nothing can hold events or wake
an island, so islands stop waiting and load with the page, as they would with `hydration: 'partial'`. Nothing breaks;
the page just loads more up front.
:::

## Reading `.weft/hydration.json`

Every `weft dev` and `weft build` writes `.weft/hydration.json`: the islands, when each loads and why, and for every
file which of its components need the client. For the kettle page it says something like:

```json
{
  "islands": ["src/routes/kettle.tsx#0"],
  "loads": [
    {
      "id": "src/routes/kettle.tsx#0",
      "tag": "AddToCart",
      "line": 33,
      "when": "interaction",
      "why": "handlers only: nothing happens before an event"
    }
  ]
}
```

When an island has to load with the page for a reason its code could avoid, `weft check` says so as **H010**, an info
diagnostic with the fix. Typical causes: work in `onMount` that reaches past the island (a `document` listener, say), a
module that runs code as it's imported, or a box created at module level. The fix is usually to move that work into the
island, or into a function the island calls.

## Hints, for what the compiler can't prove

Sometimes you know something the compiler can't. A comment directly above a component's declaration overrules the
inference for that component:

- `/* @weft visible */`: this does nothing that matters until it's on screen, so it may wait for `visible` even though
  the compiler saw work it couldn't prove harmless.
- `/* @weft client */`: always ship this, and load it with the page.
- `/* @weft static */`: this never needs code in the browser.

```tsx
import { onMount, state } from '@weft-js/core'

/* @weft visible */
export function Weight(props: { grams: number }) {
  const { grams } = props
  const imperial = state(false)
  onMount(() => {
    imperial.value = localStorage.getItem('units') === 'imperial'
  })
  return (
    <p>
      {imperial.value
        ? `${(grams / 28.35).toFixed(1)} oz`
        : `${grams} g`}
    </p>
  )
}
```

Here `onMount` reads `localStorage`, which reaches past the island, so on its own the compiler would load `Weight` with
the page and report H010. But reading a saved preference is harmless to put off until the weight is on screen, so
`@weft visible` says so.

Use hints rarely. `@weft static` on a component that does handle events gives you a button that doesn't work, which is
exactly the failure the inference is designed to avoid; `@weft client` gives up the savings for that component and
everything that loads with it. `Link` from `@weft-js/start` is marked `@weft static`: it's a plain `<a>`, and the router
handles navigation from outside it.

### Turning it off

`hydration` in `weft.config.ts` sets how far this goes:

- `'lazy'` (the default): partial hydration, with islands that wait.
- `'partial'`: partial hydration, with every island loaded with the page.
- `'full'`: every route hydrates whole, as in React.

You'd reach for `'partial'` or `'full'` while chasing a bug you suspect is in the inference, or for a page that's
interactive almost everywhere anyway. A custom client entry (`src/entry.client.ts`) whose `await start(routes)` must
resolve after everything has hydrated can pass `start(routes, { eager: true })`.

## Prerendering

Some pages are the same for every visitor: a landing page, a blog post, the docs. Rendering them on every request is
wasted work. Export `prerender` from the route and `weft build` writes them as static HTML files, with their share cards:

```tsx
// src/routes/guides/[topic].tsx
import {
  notFound,
  type LoadArgs,
  type Meta,
  type Prerender,
  type RouteProps,
} from '@weft-js/start'

const GUIDES = [
  {
    topic: 'install',
    title: 'Installing',
    intro: 'From an empty folder to a running app in two commands.',
  },
  {
    topic: 'deploy',
    title: 'Deploying',
    intro: 'Building for Node, Bun or Deno, and what a host needs.',
  },
]

export const load = ({ params }: LoadArgs<'/guides/[topic]'>) =>
  GUIDES.find(g => g.topic === params.topic) ?? notFound()

export const meta: Meta<typeof load, '/guides/[topic]'> = ({
  data,
}) => ({ title: data.title, description: data.intro })

export const prerender: Prerender<'/guides/[topic]'> = () =>
  GUIDES.map(g => ({ topic: g.topic }))

export default function Guide(
  props: RouteProps<typeof load, '/guides/[topic]'>,
) {
  const { data } = props
  return (
    <article>
      <h1>{data.title}</h1>
      <p>{data.intro}</p>
    </article>
  )
}
```

`prerender` is a list of params, or a function (it can be `async`) that returns one. On a route with no params,
`export const prerender = true` prerenders the page itself. Only pages that render with status 200 are written. A
prerendered page is still a weft page: its islands hydrate and its links navigate on the client like any other.

A prerendered page has no request, so it can't read cookies or `ctx.user`, and it's only as fresh as the last build. Keep
it for pages that are truly the same for everyone, and keep anything personal in a query on the client. Its absolute
URLs come from `site.url` ([Metadata and share images](/learn/metadata-and-share-images)).

## Recap

- Every page is rendered on the server and painted before any script runs. Queries inside a `<Boundary pending>` stream
  in later in the same response; outside one, they hold the first byte.
- Hydration is partial and inferred: the compiler finds the components that need the client, and only their call sites
  become islands. Static routes ship no route code.
- Islands load on `interaction`, when `visible`, or with the page (`load`), whichever the compiler can prove safe. An
  inline capture script holds and replays events that arrive before an island's code.
- `.weft/hydration.json` says what's an island, when it loads and why; **H010** names islands that load early for an
  avoidable reason, and **H009** an island prop JSON can't carry.
- `/* @weft visible */`, `/* @weft client */` and `/* @weft static */` overrule the inference; `hydration` in
  `weft.config.ts` turns it down or off.
- `prerender` writes pages as static HTML at build time.

## Try it

:::challenge Which of these ship code?
For each component, say whether it needs the client, and if it's an island, when it loads.

```tsx
import { onMount, state } from '@weft-js/core'

export function Price(props: { cents: number }) {
  return <p>${(props.cents / 100).toFixed(2)}</p>
}

export function Like() {
  const liked = state(false)
  return (
    <button
      type="button"
      onClick={() => (liked.value = !liked.value)}
    >
      {liked.value ? 'Liked' : 'Like'}
    </button>
  )
}

export function Clock() {
  const now = state(new Date().toLocaleTimeString())
  onMount(() => {
    const t = setInterval(
      () => (now.value = new Date().toLocaleTimeString()),
      1000,
    )
    return () => clearInterval(t)
  })
  return <time>{now.value}</time>
}
```
:::solution
- `Price` is static: props in, markup out. No code ships for it.
- `Like` is an island that loads on `interaction`: it has a handler and nothing else, so nothing can change before
  someone clicks, and the click is held and replayed.
- `Clock` is an island that loads when `visible`: it starts work by itself (an interval in `onMount`), but that work
  only touches its own box and `setInterval`, which stays inside the island. Off screen, there's nothing to see tick.
:::

:::challenge The island that loads too early
`weft check` reports H010 on this component: it "has to load with the page" because its `onMount` reaches `document`.
The menu only matters once it's open. Fix it without a hint.

<!-- example: skip the starting code of a challenge, wrong on purpose: weft check also reports W050 on it -->
```tsx
import { onMount, state } from '@weft-js/core'

export function Menu() {
  const open = state(false)
  onMount(() => {
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') open.value = false
    })
  })
  return (
    <div>
      <button
        type="button"
        onClick={() => (open.value = !open.value)}
      >
        Menu
      </button>
      {open.value && (
        <ul>
          <li>Settings</li>
        </ul>
      )}
    </div>
  )
}
```
:::solution
Listen on the menu itself instead of the whole document. Then the only work is a handler, and the island can wait for
`interaction`:

```tsx
import { state } from '@weft-js/core'

export function Menu() {
  const open = state(false)
  return (
    <div
      onKeyDown={e => {
        if (e.key === 'Escape') open.value = false
      }}
    >
      <button
        type="button"
        onClick={() => (open.value = !open.value)}
      >
        Menu
      </button>
      {open.value && (
        <ul>
          <li>Settings</li>
        </ul>
      )}
    </div>
  )
}
```

Escape works while focus is inside the menu, which is where it should. The original also leaked a listener every time
the component mounted, which `weft check` reports as **W050**; `on(document, 'keydown', …)` from
`@weft-js/core/browser` would have fixed the leak, but not the early load.
:::

:::challenge Prerender the docs
A docs route `src/routes/docs/[page].tsx` reads its pages from a `PAGES` array. Make `weft build` write every page as
static HTML. What happens to a page added to `PAGES` after the build?
:::solution
```tsx
// src/routes/docs/[page].tsx
import {
  notFound,
  type LoadArgs,
  type Prerender,
  type RouteProps,
} from '@weft-js/start'

const PAGES = [
  { slug: 'intro', title: 'Introduction' },
  { slug: 'routing', title: 'Routing' },
]

export const load = ({ params }: LoadArgs<'/docs/[page]'>) =>
  PAGES.find(p => p.slug === params.page) ?? notFound()

export const prerender: Prerender<'/docs/[page]'> = () =>
  PAGES.map(p => ({ page: p.slug }))

export default function DocPage(
  props: RouteProps<typeof load, '/docs/[page]'>,
) {
  const { data } = props
  return <h1>{data.title}</h1>
}
```

The one new line is `prerender`, which returns a params object for each page. A page added after the build isn't in the
static files. If the app runs on a server, that page still renders on request, like any route; on a static host, it
doesn't exist until the next build lists it.
:::
