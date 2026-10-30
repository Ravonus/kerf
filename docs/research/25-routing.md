# 25. Routing, streaming SSR and share cards: `@weft/start` (Phase 3, first slice)

Status: **built 2026-10-29** in `packages/start`, with streaming in `packages/weft/src/ssr.ts` and the CLI commands
in `packages/cli`. Inputs: PLAN §4, research 02 (full stack), 18 (SSR and Boundaries) and 20 (metadata and OG,
whose §1 rule binds everything here: **metadata is static, awaited before the first byte, never reactive and never
set from components**).

This note records what was built, the decisions behind it, sizes, and gaps.

## 1. Shape

```
src/routes/
  _layout.tsx            root layout (optional); `meta` merges under every route
  index.tsx              /
  about.tsx              /about
  users/_layout.tsx      layout for /users/** (kept across /users/1 → /users/2)
  users/index.tsx        /users
  users/[id].tsx         /users/:id   (typed params: { id: string })
  users/[id].og.tsx      its share card
  docs/[...rest].tsx     splat
  404.tsx  _error.tsx    special routes (root only for now), rendered inside the root layout
  _default.og.tsx        default card (else the built-in one)
```

A route module exports any of:

| Export | Runs | Notes |
|---|---|---|
| `default` | server and client | The component. Props: `params`, `data`, `children` (layouts). |
| `load({ params, request })` | server only | Plain async. Returns data or `notFound()`. Top-level promise fields are **deferred** (streamed, §4). |
| `meta` | server only | Object or `({ params, data }) => object`. `data` is the awaited part only. |
| `prerender` | server only (build) | Param sets to build pages' cards for: `[{ id: '1' }]` or an async function. |

`load`, `meta` and `prerender` are stripped from client builds (AST pass in `vite.mjs`, `stripServerExports`, which
also drops imports left unused), so loaders, their imports and secrets never ship. The build test checks the client
JS for a marker string from the fixture's db module.

Types: `RouteProps<typeof load, '/users/[id]'>` and `Meta<typeof load, '/users/[id]'>` give `params: { id: string }`
(template-literal parsing of `[id]` and `[...rest]`) and `data` as `load`'s result minus `NotFound`. The scanner also
writes `.weft/routes.d.ts` (a `RouteFiles` augmentation listing every route), the base for typed `Link` hrefs.

## 2. Server: RouterCore, non-reactive

`@tanstack/router-core` (1.171.39) matches and loads on the server. One `RouterCore` per request, built from the
manifest (`routeTree()`: layouts become path prefixes, children are added innermost first), with
`createNonReactiveMutableStore`/`createNonReactiveReadonlyStore` as its store config (its second constructor
argument) and `createMemoryHistory`. `context: { request }` reaches loaders. `isNotFound` maps to 404.

- No leaf match, or `load` returning `notFound()`: the 404 route with status 404, rendered as the root layout plus
  the 404 level (when the root layout loaded). The route's own `meta` never runs.
- A loader throws: the error route with status 500, same shape.
- `meta` merges `site` (weft.config.ts) → layouts (outer to inner) → route via `mergeMeta` (research 20 §2); the
  head layer writes it (`metaTags`, every tag `data-wm`). `image: 'auto'` becomes
  `{ url: /_weft/og/<path>.png?v=<hash>, width: 1200, height: 630 }`, for status 200 only.

**Why not RouterCore on the client:** RouterCore plus history is 18.6 KB brotli. Its matcher alone is 3.0 KB brotli,
and it isn't exported on its own. The client needs much less (§3), because the server decides.

## 3. Client router: the server decides, levels update in place

The client gets a generated **route table** (pattern, layout ids, chunk loader per route) and asks the server for
the truth:

1. A click on a same-origin `<a>` (delegated; modifier keys, `target`, `download`, `rel=external`, in-page anchors
   and `/_weft/*` pass through) or `navigate(href)`.
2. Chunk loads start from a guess against the table, in parallel with `GET /_weft/data/<path>`, which returns
   `{ m: matches, p: path, s: status, h: merged head }` (the server matched, ran the loaders and merged `meta`).
3. Wait for the chunks the answer names, push history, `applyMatches`, `setHead(h)`, scroll (top or `#hash`).
   `popstate` does the same without the push. Abort on a newer navigation; a failed fetch falls back to a full load.

**Route state is levels of boxes.** Each depth (root layout, nested layouts, page) is
`{ id, params, data }` (three `state` boxes). `applyMatches` writes only what changed (JSON comparison for params
and data). A level whose route id stays the same keeps its component; only the bindings that read the new params or
data re-run. The first level whose id changes renders its new route, and everything inside it goes. Measured in
Chrome on the fixture: `/users/1 → /users/2` is **exactly 5 DOM writes** (two `aria-current` attributes and three
text nodes). The users layout's `<section>` stays connected, and its mount counter stays 1.

The route state reaches levels **as a prop, not a context**. A component that returns a function is evaluated later,
under the hole's owner, so a context set by `App` was gone by the time the nested `Level` read it. `active.route`
holds the state of the render in progress for `Link` (server passes are synchronous).

`setHead` runs on client navigation for the tab title and history. Crawlers only ever read the server's HTML.
`notFound()` on navigation shows the app's 404 route with its tags. The built-in 404 and error pages are used only
when the app has no route file for them.

## 4. Streaming SSR

`weft/ssr` gains `renderToStream(code, { timeout? })` → `{ shell, chunks, data() }`:

- **Shell first.** The page response writes, in order: the whole `<head>` (every meta tag, from awaited data only),
  CSS and modulepreload links, the entry script, `<div id="app">shell</div>` (pending Boundaries render their
  fallback between `<!--wb:KEY-->…<!--/wb:KEY-->` markers), and the `#weft-route` payload.
- **Then each Boundary as its resources resolve,** in resolve order: `<template>content</template><script>$wb("KEY")</script>`.
  `$wb` (one inline script, sent once) swaps the content between the markers. The renderer re-renders the tree per
  settle (`Promise.race` over pending resources plus a macrotask tick). `rt.flight` dedupes in-flight resources, so
  each fetch runs once per request. `rt.stream` collects resolved Boundaries' HTML.
- **Then `#weft-data`** (resolved resource values and Boundary states), last. `hydrate(code, container, { data })`
  reads it, so the client never refetches. Module scripts run after the document finishes parsing, so hydration sees
  the final DOM. On timeout, `$wb()` removes leftover markers and the fallback stays (the client resolves it).
- **Deferred loader data.** Top-level promise fields of `load`'s result are deferred: the server renders with the
  promises (resources read them and suspend inside Boundaries) and lists the field names in the match's `d`. `meta`
  and cards get a Proxy that throws **H007** on reading a deferred field. The request fails with 500 instead of
  serving a page with missing tags. `/_weft/data` awaits deferred fields, and the client revives them as resolved
  promises, so the same component code works after navigation.

Tests: in `packages/weft/test/stream.test.tsx` (chunk order, one fetch per resource, 0/0 hydration after the swap,
timeout cleanup) and in `packages/start/test/serve.test.mjs` (byte order and timing on a real response: the first
chunk has every tag, the shell and both fallbacks; stock at 20 ms arrives before reviews at 60 ms; the data comes
last). In Chrome, `/slow` hydrates with **0 key misses and 0 DOM writes**, and no `wb:` comments remain.

## 5. Share cards

`.og.tsx` per route (`users/[id].og.tsx`), `_default.og.tsx` as the app default, otherwise the built-in card
(`og/DefaultCard.tsx`, from the OG spike). A card gets `{ params, data, meta, site, title, description }` and is
rendered with `renderToString(hydratable: false)` → `renderCard(html, size, fonts)` (Takumi native
`@takumi-rs/core` 2.16.2, promoted from `spikes/og/card`; one renderer cached per fonts array). Fonts:
`@fontsource` WOFF2 files, embedded in the server bundle, default Inter 400/700. A card's `fonts` export picks
others.

- **URL:** `/_weft/og/<path>.png?v=<hash>`. The hash is FNV-1a over the build id, the card file, its size, the
  merged head without its image, and the leaf data. A change to any of them gives a new URL, so cards are immutable.
- **Dev:** rendered on each request, `cache-control: no-store`.
- **Build mode:** prerender starts at `/_weft/og-routes`, an HTML page of links plus the `x-nitro-prerender` header.
  Nitro follows both only from HTML responses. It lists static routes' cards and each `prerender` param set's.
  Nitro writes those PNGs into `public/`. The build adds one exact `immutable` routeRule per prerendered card (a
  `prerender:done` hook, which runs before Nitro bundles the server). A `/_weft/og/**` wildcard would also override
  the handler's `no-cache` for a stale `?v=`.
- **On demand** (param routes, any params without `prerender`): the handler resolves the route first. Only params
  the route's own `load` accepts get a card, and anything else is a 404. A matching `v` is cached `immutable`; a
  stale or missing `v` gets `no-cache`.
- **H005** (unsupported style, dropped) and **H008** (a card image didn't load) go to the server log.

Fixture timings (M4 Max): about 25 ms for the first card (font load), 3–10 ms after that.

## 6. Nitro, `weft dev`, `weft build`

`@weft/start/vite` exports the Vite plugin `weftStart({ root, site, routesDir, timeout, fonts })`. It provides the
virtual modules `virtual:weft/routes` (server or client half, by environment consumer), `virtual:weft/app` (site,
build id, fonts), `virtual:weft/entry-server` (exports `{ fetch }` for Nitro) and `virtual:weft/entry-client` (or the
app's `src/entry.client.ts`). It also sets `server.fs.allow`, and a watcher re-scans routes when a route file is
added or removed. `@weft/start/app` composes `weft({ hydratable: true })`, `weftStart` and Nitro's Vite plugin
(`nitro/vite`, pinned `3.0.260903-beta`), and merges any user `vite.config`.

- `weft dev [--port n]`: Vite dev server, SSR through Nitro's dev worker.
- `weft build [--preset node|bun|deno_server|…]`: client and server into `.output/`, prerendering cards.
- **Verified:** node end to end. The built server serves pages with every tag, 404/500 statuses, prerendered and
  on-demand cards with the right cache headers, and hydrates 0/0 and navigates in Chrome. Bun builds and serves a
  page and a card. `deno_server` builds; Deno isn't installed here, so it hasn't run. Nothing was deployed.
- The tests run each build in a child process: Nitro's build stalls inside vitest's module runner. Nitro's logger is
  silent under `NODE_ENV=test`, so the tests poll the port.

Server output: 7.5 MB including Takumi's native binary. JS chunks: router-core 117.5 KB (29.9 KB gzip), history
13 KB (3.8 KB gzip), ssr 133 KB (71.9 KB gzip).

## 7. `weft routes --meta`

`weft routes` lists the route table. `weft routes --meta [--json] [--preset p]` prints every route's merged
metadata, so an agent can review every page's tags without a browser or a running server (Vite in middleware mode,
about 1 s on the fixture):

- **Static routes** run their real `load` (one GET each, as a crawler's request would) and report the real status.
- **Param routes** run `meta` on placeholders: `params.id` is `<id>`, `data.name` is `<data.name>`, the URL is
  `/users/<id>`. The output shows where each value comes from.
- **Per route:** `path`, `kind`, `file`, `layouts`, `params`, `url`, `status`, `data` (`loaded`, `placeholder` or
  `none`), `card` (file or `built-in`), `image` (`build`, `on-demand`, `prerender+on-demand`, `url` or `none`),
  merged `meta`, and `tags` (the exact `[tag, attrs, text]` list the head writes).
- **Diagnostics** in the CLI's shape, with the span at the file's `meta` export.

The fixture's output is a snapshot (`packages/start/test/__snapshots__/inspect.test.mjs.snap`), so a change to any
route's tags shows in review.

## 8. Diagnostics H001–H008

Renumbered from research 20's M001–M008 (M001–M016 are media, research 15).

| Code | Where it's reported |
|---|---|
| H001 relative image, no `site.url` | `weft check` (from `site`); `weft routes --meta` per route |
| H002 param route, generated card, static-only preset, no `prerender` | `weft routes --meta --preset static` |
| H003 no description after merging | `weft check` (`site`); `weft routes --meta` per route (status 200 pages) |
| H004 title > 60 / description > 160 | `weft check` (`site`); `weft routes --meta` for routes with real data |
| H005 unsupported card style | card render (server log; `renderCard({ strict: true })` throws) |
| H006 `meta` reads a box or calls a hook | `weft routes --meta`, statically: `.value`, `state(`/`derived(`/`resource(`/`watch(`/`use*(` inside the `meta` export's source range |
| H007 `meta` or a card reads a deferred field | at request time (500, server log) and `weft routes --meta` |
| H008 a card image didn't load | card render (server log) |

The catalog (`packages/cli/src/catalog.mjs`) has all eight, with `by: 'start'` for those reported while serving.

## 9. Sizes against the 10 KB-per-app goal

Brotli, minified, measured with Vite 8:

| What | brotli |
|---|---|
| Hydrate-only page (weft/dom + one component) | 1.96 KB |
| The same page through `start()` (router, levels, `Link`, navigation, `setHead`, built-in 404/error) | 5.20 KB |
| **Router + navigation, the difference** | **3.25 KB** |
| The whole fixture client (every chunk: entry, dom, 9 route and layout chunks, streaming page) | 10.4 KB |
| First load of `/users/1` (entry + dom + root layout + users layout + page) | about 7.8 KB |
| For comparison: RouterCore + history on the client | 18.6 KB |

The router fits the goal with room to spare. The fixture's total is slightly over 10 KB, but route chunks load on
demand, so no single page downloads all of it.

## 10. Tests

| Package | File | What |
|---|---|---|
| weft | `test/stream.test.tsx` | Streaming order, single fetch, 0/0 after the swap, timeout cleanup |
| start | `test/routes.test.mjs` | Scanner: match order, layouts, cards, 404/error, splats, bad names, `routes.d.ts` |
| start | `test/serve.test.mjs` | No-JS fetch: all 15 tags for `/users/42` in order, escaping, hash follows data; layouts; 404/notFound/500/H007; stream byte order and timing; `/_weft/data`; cards (1200×630 PNG, 404 for bad params, default card, prerender list) |
| start | `test/browser.test.mjs` | Chrome: 0/0 hydration (plain and streamed), navigation writes exactly 5 nodes and keeps layouts, head updates, back/forward, client 404, client navigation to a streamed page |
| start | `test/build.test.mjs` | Node build end to end (files, tags, statuses, cache headers, Chrome 0/0 and navigation, no server code in client JS); bun builds and serves; deno builds |
| start | `test/inspect.test.mjs` | `routes --meta` snapshot; H002 on a static preset; H006 static check |

## 11. Gaps

- **No `redirect()`.** The payload has an `r` field and the client follows it, but `load` can't return one yet.
- **404 and error routes only at the routes root.** Nested ones are ignored, and the scanner says so.
- **Navigation awaits deferred data:** `/_weft/data` resolves everything before answering, so client navigation
  doesn't stream. That's fine for meta correctness, but slower for slow fields.
- **Inline scripts have no CSP nonce** (`$wb`, the route payload, the data).
- **No edge or wasm card path.** Takumi native only. The spike's wasm build was dropped from the package.
- **Deno is build-only here.** A CI matrix (PLAN §4.1) should run the e2e suite on Bun and Deno.
- **`query`/`mutation`, the tagged cache, Drizzle, Better Auth, `create-weft` and `.weft/contract.json`** are later
  Phase 3 steps.
- **Typed `Link` hrefs** aren't checked yet (`routes.d.ts` has the data for it). The start package also has no
  tsc run (the repo has no package tsconfig), so its types are exercised only through the editor and the fixture.
- **`weft routes --meta` doesn't render cards,** so H005/H008 show only at serve time.
- **Compiler bug (not fixed here):** `r.value?.map(t => …)` isn't lowered to `For`, but `t` inside the callback is
  still rewritten to `t()`, which throws "t is not a function". The fixture uses `(r.value ?? []).map`.
