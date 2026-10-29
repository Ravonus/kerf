# weft — plan v0.1

> Working name. A reactive UI system built for how agents reason: **B = f(A)**, written once, always true.
> Not React, not built on React. React is studied only for its failure modes.
> Research behind the decisions: [`research/`](research/). Review that shaped v0.1: [`REVIEW.md`](REVIEW.md).

## 1. The bet

React re-runs a whole component function on every change, so correctness depends on *timing*: dependency
arrays, stale closures, effects that sync state into other state. Agents reason in equations, not timelines, and
burn tokens fighting that model. The React Compiler tries to reconstruct a dependency graph after the fact and
silently skips code it can't handle ([01 §1](research/01-reactivity-landscape.md)).

weft gives the graph by construction:

- **Components run once.** They are setup functions that wire a graph, not render functions.
- **Updates land at the DOM leaf** that reads the changed value. No re-render, no VDOM.
- **Derived values are pure equations** (`derived`), never effects that copy state around.
- **Every way to get it wrong is a compile error with a code and a fix.** No silent fallbacks, no lint-only warnings.

Nobody owns "the framework built for agents" yet, and no one has measured agent error rates across frameworks
([01 §4](research/01-reactivity-landscape.md)). So we measure first and treat the eval as part of the product.

## 2. Design rules (the filter for every later decision)

1. **Meet agents where their training is.** Files are plain **TSX** (`.tsx`, `jsxImportSource: "weft"`). There's no new
   syntax and no new editor tooling: the TS language service, Prettier, ESLint and model priors all work on day one.
   We keep React's *shape* and change the *semantics*.
2. **Because it looks like React, diagnostics are the product.** Looking like React makes React-shaped bugs *more*
   likely. Every React habit that would be silently wrong in weft must be a hard compile error with a fix. Coverage
   of that catalog is what we test.
3. **One way to do each thing.** One state primitive, one derivation primitive, one way to write lists.
4. **Liveness is explicit in your own code.** Local values are live only if they're a `state`/`derived` box and you
   write `.value`. The one place the compiler adds liveness is **props**, where it can't change meaning (§3.3).
5. **Errors teach.** Each diagnostic has a stable code, one line of why, and an autofix when the fix can't change
   meaning. One catalog serves the compiler, `weft check --json` and the MCP server. TypeScript errors that matter
   (e.g. assigning to a `Derived`) are mapped into the same codes.
6. **Inspectable as JSON** in dev: the reactive graph with real variable names, routes, server functions, tokens,
   surfaces. Agents *ask* the app what's true. (Names are dev-only and stripped in prod builds.)
7. **Small.** Target ≤ 6 KB gz runtime, Solid/Marko-class speed. A goal, not a v0 gate. Being bigger than Solid
   is fine when it buys weft's design: aim for about 10 KB br per app, with 50 KB br as the ceiling (§3.7).

## 3. The language: TSX with weft semantics

### 3.1 Primitives (the whole reactive API)

| Primitive | Job |
|---|---|
| `state(init)` → `State<T>` | Writable box. Read/write `.value`. Deep updates: `.set(draft => { draft.push(x) })`. |
| `state.linked(() => expr)` | Writable, but resets whenever `expr` changes. For "local copy of a prop" (editable form defaults, optimistic values). |
| `derived(() => expr)` → `Derived<T>` | B = f(A). Pure, lazy, cached, read-only. **The default tool.** Async functions are rejected; use `resource`. |
| `resource(async (signal) => …)` → `Resource<T>` | Async derived: `.value .pending .error .refresh()`, cancels via AbortSignal. Server queries return these. A superseded fetch is aborted and ignored; a refetch keeps the value; hydrated, it starts with the server's value. |
| `watch(() => source, (value, prev) => cleanup?)` | Side effects only (DOM APIs, logging, imperative libraries). Source phase tracked, callback not. |
| `onMount(fn)` / `onCleanup(fn)` | Element access and teardown. |
| `context<T>()` | Typed dependency injection. |
| `defineState(name, setup)` | Shared app state. A named setup scope returning ordinary boxes and actions, one instance per tab, per server request and per test. Adds names, `persist`, tab `sync`, `history` and `$reset`; never a second container (§4.5). |
| `flush()` | Apply pending DOM updates now (`open.value = true; flush(); input.focus()`). Also used by tests. |
| `untrack`, `batch` | Rare escape hatches. |

There's no separate `store`, and `defineState` is not one: it only gives boxes a name and a lifetime. One box type holds everything, including arrays and objects; lists are fine-grained
because the keyed list tracks each item by key (§3.4).

Reads are consistent: `.value` straight after a write returns the new value. Effects and DOM writes are batched to a
microtask, and `flush()` is how you force them. Core graph algorithm: adapted from **alien-signals** (MIT).

### 3.2 What an agent needs to know (one screen of AGENTS.md)

```tsx
import { state, derived } from 'weft'

export function Cart({ items, taxRate }: { items: Item[]; taxRate: number }) {
  const coupon = state<string | null>(null)
  const subtotal = derived(() => items.reduce((s, i) => s + i.price, 0))
  const total = derived(() => subtotal.value * (1 + taxRate) - discount(coupon.value))

  return (
    <Stack gap="related">
      {items.map(item => <Row key={item.id} item={item} />)}
      {coupon.value && <Badge tone="good">{coupon.value}</Badge>}
      <Text role="title">{format(total.value)}</Text>
      <CouponInput value={coupon} />
    </Stack>
  )
}
```

1. **State is a box. Read and write `.value`.** Everywhere.
2. **Anything computed from other values is `derived`.** Never compute it in a `watch` or in the component body.
3. **JSX is always live.** Every `{expr}` and every attribute re-evaluates when what it reads changes.
4. **Props are always current.** Destructure them freely. Use them inside `derived`, `watch`, JSX or event handlers.
5. **The component body runs once.** No early returns on state, no `let` counters. Branch in JSX.
6. **Pass a box only to give write access** (`value={coupon}`, child prop typed `State<string | null>`).
7. **Lists and conditionals the way you know them**: `.map` with `key`, `&&`, ternaries.

### 3.3 Props spec

The compiler rewrites the component's props into live getters, so a parent writing `count={count.value}` (what
agents will write anyway) is correct.

| Form | Behaviour |
|---|---|
| `({ a, b }) =>` | Each name compiles to a live read of `props.a`. |
| `(props) =>` | `props.a` is a live getter. |
| `({ size = 'md' }) =>` | Default applied on every read when the prop is `undefined`. |
| `({ a, ...rest }) =>` | `rest` is a live object; `<div {...rest}>` stays live. |
| `({ user: { name } }) =>` | **W006** nested destructuring can't stay live. Fix: `user.name` at the use site. |
| `children` | Resolved once and memoized by the compiler; reading it twice returns the same nodes. |
| Props built outside JSX (`Cart({...})`, tests) | Plain values = constants. `render()` in `weft/test` wraps them correctly. |

Box vs value is checked by types: passing a `State<T>` where `T` is expected, or a `T` where `State<T>` is
expected, is a type error mapped to **W008** with the fix ("pass `count.value`" / "pass `count`").

### 3.4 Lists and conditionals (lowering spec)

- `xs.map(x => …)` in JSX → keyed list. Each key gets its own live `item`, so a new object under the same key
  updates the row in place rather than recreating it. The index param is a live accessor (stays right after
  reorder).
- `xs.filter(…).sort(…).map(…)` → one `derived` for the chain plus a keyed list over its result.
- Nested maps, fragment returns and `null` returns are supported. Block-body callbacks are allowed if they end in a
  single `return`. Early returns inside the callback are **W013**.
- Over primitives, the value is the key. Over objects, missing `key` is **W010**.
- `cond && <X/>`: a number on the left is **W011** (the `0` bug), fix `cond > 0 &&`.

### 3.5 Diagnostic catalog v0 (each with autofix where mechanical)

| Code | Catches | Fix |
|---|---|---|
| W001 | Any read of a prop or `.value` in the component body outside `derived`/`watch`/JSX/handlers, including passing it to a helper (`makeChart(items)`) and `.map` in setup | Wrap in `derived`, move into `watch`, or `untrack()` if a snapshot is intended |
| W002 | Writing state inside `derived` | Move to a handler or make the target `derived` |
| W003 | `watch` writes state that its own source reads (cycle) | Use `derived` |
| W004 | `watch` that only copies one value into another | Replace with `derived` (autofix) |
| W005 | `state(prop)` (React's `useState(prop)` bug) | `state.linked(() => prop)` or `untrack` |
| W006 | Nested prop destructuring | Read at use site |
| W007 | Assigning to a `Derived` (maps TS2540) | Make it `state` or `state.linked` |
| W008 | Box/value mismatch at a prop | Pass `.value` / pass the box |
| W010 | `.map` over objects without `key` | `key={item.id}` |
| W011 | Number on the left of `&&` | `> 0` |
| W012 | `derived(async …)`, or reads after `await` in `resource` (untracked) | Use `resource`; read before the `await` |
| W013 | Early return inside a JSX `.map` callback | Filter first |
| W020–W029 | React-isms: `useState`, `useEffect`, `useMemo`, `useRef`, `useCallback`, `useX()` custom hooks, dependency arrays | `state`, `watch`, `derived`, `ref={el}`, plain functions (autofix where mechanical) |
| W030 | Module-level `state` reachable from the server entry graph (leaks across requests) | `context`, or mark `state.global` |
| W040 | Early `return` in a component body that depends on state (runs once, never re-checked) | Branch in JSX |
| W041 | `let` variable mutated in a handler and read in JSX (never updates) | Make it `state` |
| W042 | `onChange` on text inputs (React fires per keystroke, DOM on blur) | `onInput` (autofix) |
| W014 | Identity-breaking `.map(p => ({ ...p, … }))` feeding a keyed list (error in-file, warning when the list leaves the file) | Keep items stable and read the changing field live, or replace only the changed item |
| W015 | A box rendered without `.value` in JSX (a child, or a native element's attribute) | `.value` (autofix) |
| W050 | Raw `addEventListener` / `setInterval` / `new WebSocket` / `new EventSource` in a component with no cleanup (§4.2) | `on` / `interval` from `weft/browser` (suggested edit), or clean up in `onCleanup` |
| W051 | A `weft/browser` value, `on` or `interval` created outside an owner: module scope, a timer or promise callback, an event handler, after `await` | Create it in setup, or inside `createRoot` |
| W054 | `media(q)` without `ssr` in a server-rendered file (error; a warning when `weft check` can't tell, off in client-only builds) | `media(q, { ssr: false })` (suggested edit) |
| W056 | `watch` that copies a live value (a `weft/browser` value, `.live()`) into `state` | Read `.value` directly, or `derived` |

`class`/`className`, `for`/`htmlFor`, and `style` as object or string are all accepted.

### 3.6 Compiler, runtime, tooling

- **Compiler: Rust/Oxc, and weft owns all of it** ([08](research/08-builder-and-compiler.md), decided 2026-10-29).
  - One crate, `weft-compiler`: `pre` (§3.3 props, §3.4 lists, naming) → `diag` (W-codes with spans and autofix) →
    weft's own back end (templates, bindings, SSR output, hydration keys, dev names). One Oxc parse and one source map
    per file. Oxc is the parser toolkit; no framework's compiler is in the build.
  - The back end is designed for agents: a small helper set that weft defines and versions, one lowering per
    construct, output an agent can read and `weft explain` can map back to source, and hydration keys derived from
    source position so a mismatch names the component and line. Design: [19](research/19-own-back-end.md).
  - **Transition (done 2026-10-29):** the Phase 1 spike ran weft's pre-pass on Solid 2's `solidjs-compiler` crate
    ([16](research/16-compiler-spike.md)). weft's back end passed the same checks and replaced it
    ([19 §5.5](research/19-own-back-end.md)); the crate is gone from the build. Solid remains a benchmark comparison,
    and its recorded output is the corpus oracle's reference, never a dependency.
  - Shipped through napi-rs as prebuilt binaries plus a WASI fallback. Text goes in; code, map and diagnostics come
    out. ASTs never cross JS↔Rust.
  - **Decision rule:** a 2-week spike must pass all four checks:
    1. upstream's fixtures,
    2. props, lists, W001/W006/W010 with autofix,
    3. 6 binary targets built in CI in ≤ 15 min,
    4. 1k components compiled in ≤ 0.5 s.

    If any fails, fork `@solidjs/babel-plugin` 2.x instead. Never ship two compilers.
- **Runtime:** signals core, DOM bindings, keyed reconciler, SSR string renderer on the same reactive core (effects
  off), hydration by source-path keys (` wk="0.1/0"`, from weft's own back end, [19 §5.3](research/19-own-back-end.md)),
  `renderToStringAsync` (render, await resources, re-render), page data in `<script data-weft>`; streaming in
  Phase 3 ([18](research/18-ssr-and-boundaries.md)).
- **Async/errors in markup:** `<Boundary pending={…} error={(e, retry) => …}>`. The fallback shows after 150 ms and
  is held ≥ 400 ms; refetches never flash; errors during render and failed resources reach `error(e, retry)`, errors
  in later updates don't yet ([18](research/18-ssr-and-boundaries.md)).
- **Types:** a `JSX` namespace for weft (intrinsics, `key`, typed `currentTarget` on events, box/value assignability).
- **HMR:** state preserved across edits by the compiler-assigned names (the solid-refresh approach). Built
  2026-10-29 ([21](research/21-hmr.md)): dev output registers each top-level component under `file#Name` and keys
  body-level `state()` by name + initializer hash; a new module version re-renders only the edited components, and
  children keep their state by position. Dev only, 0 bytes in production. Hydratable dev builds reload instead.
- **Testing:** `weft/test` gives `render()`, `flush()`, and DOM queries for vitest.
- **Vite plugin:** one `weft()` plugin, filtered to `.[jt]sx` so Rolldown never calls into JS for other files.
  It runs the compiler and, when present, the server-function and token transforms. Vite 8 is used everywhere;
  Bun's and Deno's bundlers are not build paths.
- **`weft check`:** `tsc` 7 (Go) `--noEmit` runs in parallel with the compiler's check mode (cached by content hash).
  The two outputs are merged, and TS errors that matter are mapped to W-codes (TS2540 → W007). Types are never on the
  HMR path.

### 3.7 Performance budgets (gates from Phase 1)

Measured on a quiet runner and gated on ratios, not on wall-clock from a busy laptop.

**Size stance (2026-10-29).** weft doesn't have to match Solid's bytes. About 10 KB br for a whole app is the goal,
and 50 KB br is the ceiling. The runtime's gate is 10 KB br, with 6 KB as the target to keep working toward; the
other budgets below stay as they are. When a design choice costs bytes but makes weft clearer for agents, say what
it costs and take it, as long as it stays inside those numbers.

| Metric | Budget |
|---|---|
| Runtime (benchmark app) | ≤ 10 KB brotli (gate), aiming for ≤ 6 KB; hello world ≤ 3 KB |
| v3 shop app, total JS | ≤ 10 KB brotli |
| DOM work | every eval scenario has a `toTouchAtMost(n, { runs })`; v3 price-push ≤ 1 mutation and ≤ 10 re-runs, add-one ≤ 3 |
| js-framework-benchmark | ≤ 1.10× Solid's geomean in the same run. 2026-10-29, weft's own back end: 1.063×, pass ([19 §5.5](research/19-own-back-end.md)); after the memory pass 1.08× (two runs), pass; memory 1.02× (1k rows) and 1.03× (after clear), pass ([19 §5.8](research/19-own-back-end.md)) |
| Compiler | ≤ 0.5 s per 1k files, single-threaded, diagnostics included |
| `weft check`, 1k files | ≤ 3 s cold, ≤ 0.5 s warm (weft's own diagnostics pass) |
| HMR, 1k components | ≤ 50 ms p95, from Vite's change event to DOM updated (the watcher's latency before that event is the OS's and Vite's, not weft's; reported, not gated). 2026-10-29, Vite 8 + Chromium on macOS: **13.3 ms p95, pass** (6.9 ms on a second run); file write → DOM 106 ms, ~90 ms of it the watcher ([21 §3](research/21-hmr.md)) |
| Prod build, 1k components | ≤ 5 s (client + SSR) |
| Prod output | no dev names in the bundle; identical bytes with dev naming on or off |

Server size and cold-start budgets are set from the first Phase 3 measurement and then ratcheted.

## 4. Full stack: `weft/start` (T3-style, no Next.js, no React)

T3 is a set of *patterns*: Zod at every boundary, typed client↔server calls, Drizzle, typed env, auth. We copy the
patterns. Details: [02](research/02-fullstack-and-t3.md).

**Build on:** Vite 8 · Nitro v3 (pinned beta; fallback h3 v2) · `@tanstack/router-core` · Drizzle · Zod 4 (any
Standard Schema) · Better Auth · `@t3-oss/env-core`.

**weft owns:** the server-function transform, the tagged cache, the client data cache, and the router + SSR glue.

```ts
// server/todos.ts
export const listTodos = query({
  input: z.object({ done: z.boolean().optional() }),
  cache: { life: 'minutes', tags: ['todos'] },          // omit cache → never cached on the server
  run: ({ input, ctx }) => ctx.db.select().from(todos).where(…),
})

export const addTodo = mutation({
  input: schemas.todos.insert.pick({ title: true }),    // the same schema validates the form
  invalidates: ['todos'],                               // listTodos refreshed in the same response
  run: ({ input, ctx }) => ctx.db.insert(todos).values({ ...input, userId: ctx.user!.id }),
})
```

From one declaration: a validated endpoint, a typed client call returning a `Resource`, form validation
(`<Form of={addTodo}>` works without JS), a cache key, tags.

- **v0 caching:** `cache.life`, `cache.tags`, `invalidates`, `revalidateTag`. Tags are **explicit**. In dev, weft
  records which tables each function actually touched and `weft check` warns when declared tags miss one. That gives
  the safety of auto-tagging (Wasp's idea) without silent staleness when instrumentation guesses wrong. Promote to
  automatic later if the dev check proves reliable.
- **Security defaults:** mutations are POST with CSRF protection; queries are GET and must be side-effect free;
  `ctx.user` is typed nullable; reading request cookies inside a cached query is a type error.
- **`create-weft`:** flag-driven CLI (db, auth, runtime, deploy target, styling, UI kit). Writes AGENTS.md and MCP
  config.
- Later: ISR/static routes, `updateTag`, per-user cache scope.
- **Page metadata and OG images** ([20](research/20-metadata-and-og.md)): metadata is plain data on the route
  (`export const meta = ({ params, data }) => …`), awaited before the first byte and written as static tags, because
  link-preview crawlers don't run JS and frameworks that streamed or patched the head broke previews. Never reactive,
  never set from components. Defaults (site name, URL, title template, description, `image: 'auto'`) come from the
  config, and canonical, `og:*` and `twitter:*` are derived. Share cards are `.og.tsx` files rendered server-side to
  PNG at `/_weft/og/<path>.png?v=<hash>`: at build for static routes, on demand (immutable cache) for param routes,
  locally in dev, as a function on Vercel/Netlify. Renderer: Takumi (Rust, takes HTML) vs Satori, decided by a spike.

### 4.1 Runtimes: Node, Bun, Deno built in

Nitro presets give `node` (the default), `bun`, `deno_server` and edge targets from the same code
([06](research/06-runtimes-and-rust.md)).

- `create-weft --runtime node|bun|deno` picks the preset and a DB driver that works on that runtime. No single SQLite
  driver works on all three, so `weft/db` picks one per runtime.
- **Dev always runs on Node**, so dev never catches a Bun or Deno break. CI therefore runs the e2e suite on all
  three.
- `weft build` writes **`.weft/contract.json`**: JSON Schema for every `query`/`mutation`, with input, output,
  errors, cache and auth scope. The OpenAPI export, the MCP server and Rust codegen all read it.

### 4.2 Real-time and browser events

Server pushes and browser events become ordinary reactive values, owned and cleaned up like everything else
([07](research/07-realtime-and-events.md)). Subscriptions belong to the **client cache**, not the component:
- they're keyed by function plus args and shared by every reader,
- they stay alive for `keep: '30s'` after the last reader unmounts.

That design removes the v3 eval's planted bug (a subscription opened inside a tab that unmounts).

```ts
// live queries: no new server code, tags are the contract
const todos = listTodos.live({ listId: props.listId })   // Resource + .live status; refetches on tag pokes

// typed topics → streams (SSE), with resume built in
export const priceTopic = topic('prices', { key: z.string(), message: Price })
export const prices = stream({
  input: z.object({ symbols: z.array(z.string().max(12)).max(50) }),
  message: Price,
  async *run({ input, signal, lastEventId }) { yield* priceTopic.subscribe(input.symbols, { signal, after: lastEventId }) },
})
const board = prices({ symbols }, { fold: (acc, m) => ({ ...acc, [m.symbol]: m }), initial: {}, keep: '30s' })

// channels (WebSocket): named messages each way, authorize is required
export const room = channel({
  params: z.object({ roomId: z.uuid() }),
  authorize: ({ ctx, params }) => isMember(ctx.user, params.roomId),
  client: { say: z.object({ text: z.string().min(1).max(2000) }) },
  server: { said: schemas.messages.select },
  on: { say: async ({ msg, ctx, params, room }) => room.publish('said', await insertMessage(ctx, params.roomId, msg.text)) },
})
const chat = room.connect({ roomId: props.roomId }); const messages = chat.collect('said', { max: 200 })

// browser values: one shared listener per document, removed with the owner, explicit SSR value
import { online, visible, lifecycle, media, tabs, on, interval } from 'weft/browser'
const density = state<'compact' | 'cozy'>('cozy', { persist: { in: 'local', schema: z.enum(['compact', 'cozy']), version: 1 } })   // §4.5
```

**How it works:**
- `.live` **pokes and refetches**: the server sends tag names, and the client refetches through the normal `query`.
  Auth, the tagged cache and single-flight therefore work unchanged. No diffs and no sync engine in v0.
- One multiplexed SSE connection per tab carries `.live` and `stream`. One multiplexed WebSocket per tab (crossws)
  carries `channel`.

**Defaults:**
- **Validation:** inputs and client→server messages are always validated. Outputs and server→client messages are
  validated in dev and tests.
- **Resume:** `<epoch>:<seq>` cursors with a 256-event / 60 s ring buffer. When a client falls outside that window,
  it gets `reset`.
- **Connection health:** a 20 s heartbeat, and full-jitter reconnect from 0.5 s to 30 s.
- **Limits:**
  - message size caps (64 KiB client→server, 1 MiB server→client),
  - 20 msg/s rate limit,
  - an exact Origin allowlist,
  - a session re-check every 5 min.
- **Serverless:** streams end 10 s before the platform's limit, then resume.
- **Fan-out bus:** `memory` by default. The build fails on multi-instance presets until `postgres` (LISTEN/NOTIFY),
  `redis`, `nats` or `durable-object` is set.
- **Stale tabs:** a schema hash is checked at connect, so an old tab talking to a new deploy is flagged as stale.

**Diagnostics:**
- W050–W056: raw sockets, listeners or intervals without cleanup; subscriptions outside an owner; hand-rolled folds
  in conditional components; `.live` without tags; browser values without an SSR value; `watch` copying a stream into
  `state`.
- R001–R006: `channel` without `authorize`; the memory bus on multi-instance presets; live-query and mutation tags
  that don't intersect; wildcard origins; unbounded client schemas; reading a backlog before subscribing.
- T012: a test that leaves subscriptions open.
- T013: a real socket in the fast test lane.
- P007: `ws`, `socket.io-client` and the like as dependencies.

**Phase 1 status (2026-10-29):** `weft/browser` ships `online`, `visible`, `lifecycle`, `media`, `on` and `interval`
(≈1 KB br with every export, paid only where imported), with W050, W051, W054, W056 and T012. Each value subscribes on
first read, shares one listener per (target, type), goes with its owner, and throws W051 in dev outside one. Server
values: `online`/`visible` `true`, `lifecycle` `'active'`; `media` has none, so W054 covers only `media`. `tabs` is
Phase 3b (`tabs.channel`), and research 07's `storage` is `state(…, { persist })` in `defineState` (§4.5). `weft/test`
fakes the page (`net.offline()`, `page.hide()`, `page.freeze()`, `page.media(q, true)` …) and runs T012 after each test.
`interval` uses the platform timer (vi fake timers in tests) until the test clock owns it.

### 4.3 Rust, opt-in and as far as you want

Zod stays the single source of truth. `.weft/contract.json` → typify generates Rust types in `build.rs`. Rust never
defines the schema; schemars output from Rust is used only to detect drift. A server function swaps `run` for `impl`:

```ts
// server/rust.ts: the only place Rust targets are named
export const media = native('media')            // napi-rs addon (+ WASM fallback): one hot function, in-process
export const search = remote('rust://search')   // a Rust sidecar implementing many functions
export const core = remote('rust://core')       // "mostly Rust": every function points at core

export const thumbnail = mutation({ input: Thumb, output: ThumbOut, invalidates: ['uploads'], impl: media })
export const world = channel({ ticket: z.object({ room: z.string() }), impl: remote('rust://game') }) // Rust owns the socket
```

**How the boundary works:**
- One crossing per server function. The JSON envelope carries:
  - the input, already validated by TS,
  - the user's claims (never cookies), HMAC-signed for sidecars,
  - `traceparent` and a deadline.
- TS validates Rust's output. Typed errors become a Rust enum.
- Rust may *add* cache tags and reports the tables it touched through `ctx.touch`.
- TS always keeps the public edge, sessions, CSRF and the cache.

**When it pays:** Rust only wins at ≥ ~1 ms of CPU per call, or on byte payloads such as images, search, parsing,
crypto and game ticks. It never wins on IO-bound CRUD; Prisma 7 dropped its Rust engine for this reason. Measured
call costs:
- a 100-object payload costs 176 µs into napi as JS objects, 58 µs as a JSON string, and ~0.2 µs as a `Buffer`;
- loopback HTTP to a sidecar costs 43–81 µs.

No native binary is ever required for a default app. On Deno and edge, `native()` falls back to WASM or `remote()`.
R101–R105: unrepresentable schemas (add a codec), plain unions, impl/contract drift, `native()` on a preset without
WASM, and a cached Rust query that reports no touched tables.

### 4.4 Payments: `weft/pay`

Products are declared once, `checkout()` is called once, and entitlements are read everywhere
([10](research/10-payments.md)). App code never names a rail.

- **Rail per build.** Physical goods and services use Stripe on every platform, with Apple Pay and Google Pay inside
  it. Digital goods used in the app use StoreKit 2 / Play Billing on native, and Stripe on web.
- **Store rules are dated data.** Link-out to web checkout is an explicit per-storefront opt-in, because the US rules
  are still being litigated (2026-10-28). `weft pay explain` prints the decision with its source and date.
- **One entitlement model.** Stripe webhooks, App Store Server Notifications V2 and Play RTDN are verified and
  normalised server-side into `purchases`/`entitlements`, so a purchase on iPhone unlocks the web.
  - Server: `ctx.entitlements.has('pro')`.
  - Client: `entitlements.live()`, refreshed by tag pokes.
  - `checkout()` never grants anything itself.
- **PAY-codes:** Stripe for digital goods in a store build, client-side grants, secret keys in the client graph,
  hardcoded store prices, missing Restore Purchases, float money.
- **Testing:** `fakePay` in `weft/test` plays renewals, failures, refunds and revocations on the deterministic clock.

### 4.5 App state: `defineState` (zustand ergonomics, no second container)

Details: [14](research/14-app-state.md).

```ts
// app/state/cart.ts
export const cart = defineState('cart', () => {
  const open = state(false, { history: false })                 // UI only
  const note = state('', { persist: 'session' })                // draft, survives reloads
  const server = getCart.live()                                 // server state: referenced, never copied
  const lines = derived(() => server.value?.lines ?? [])
  const count = derived(() => lines.value.reduce((n, l) => n + l.qty, 0))
  const qtyOf = (id: string) => lines.value.find(l => l.productId === id)?.qty ?? 0
  return {
    open, note, lines, count, saving: setLine.pending,
    add(id: string) { return setLine({ productId: id, qty: qtyOf(id) + 1 }) },  // optimistic on the mutation
    toggle() { open.value = !open.value },
  }
})
// anywhere: cart.count.value · cart.add(id) · no provider, no selectors
```

- **Server data never becomes state.** It stays in the query cache, and copying it into a box is S001 (autofix:
  reference the query and derive from it).
  - Every v3 eval session did this, and it caused the one measured defect: 300 DOM writes per price push instead of
    1.
  - **Optimistic updates** are declared on the `mutation` (`optimistic: (args, cache) => cache.update(…)`). Each
    call adds its own overlay, re-applied on top of every fresh server value until it settles. A failure rolls back
    only its own change, so concurrent rollbacks don't clobber each other.
- **What zustand's middleware does, built in as options:**
  - `persist` (`local | session | cookie | idb`), with a required Zod schema, versions and migrations (S003 autofix
    adds the migration). The `cookie` backend lets SSR render persisted values.
  - `sync: 'tabs'`, `history` (undo/redo, one step per action call), devtools names (`cart.count` in
    `weft browser state` and the recorder), `$reset` and `$snapshot`, and a fresh instance per test.
- **Fine-grained updates mean no selectors.** Typing in the cart note re-runs nothing in the 150 product rows.
  - **Keyed reads:** `box.get(key)` reads one entry of an object box, and its reader re-runs only when that entry
    changes. On the v3 app with the cart in a scope, add-one went from 452 re-runs to 5, still 1 DOM write
    (research 14 §11).
- **One instance per request on the server.** Reaching a scope with no owner on the server throws S002, so state
  can't leak between users.
- **Size:** the same cart is 24 lines and 7 concepts, against 91 lines and 23 concepts in zustand + TanStack Query.
  Measured in Phase 1 on top of a rendered app (brotli): `defineState` 0.77 KB, `persist` +0.67 KB, `history`
  +0.47 KB, 0 KB when unused. `persist` and `history` are their own modules, which the `weft()` plugin imports only
  into files that use the option (research 14 §11).
- **Diagnostics S001–S013,** seven with autofixes. The AGENTS.md block is 7 lines.
- **Plugins:** `state.persist@1` (opfs, native device storage). `cache.sync@1` is reserved for sync engines, which
  feed the query cache, never state.
- **Evals:** `v4-cart-persist`, `v4-optimistic` and `v4-ssr-isolation`.

## 5. Surfaces: canvas and WebGL as first-class layout children

This ports the Keel React driver ([04](research/04-keel-react-driver.md)). The frame loop, store, tokens and WebGL
renderer are framework-free and carry over; the React glue (three effects, stale-closure refs, rebuilding the GL
context every render) disappears because setup runs once.

```tsx
export const Starfield = defineSurface({
  name: 'starfield',
  kind: 'webgl2',                                   // 'canvas2d' | 'webgl2' | 'keel-pixel'
  props: z.object({ density: z.number().min(0).max(1) }),   // TS prop types are inferred from this
  setup(s, props) {                                 // runs once; props are live
    const prog = makeProgram(s.gl)
    s.frame(t => draw(s.gl, prog, props.density, s.tokens.accent.linear, t))
    return () => prog.dispose()
  },
})

<Grid cols={2}><Card /><Surface use={Starfield} density={level.value} aspect="16/9" /></Grid>
```

- `s` gives `canvas`, `gl`/`ctx`, live `size` and `dpr` (ResizeObserver; Keel's `integerFit` for pixel art), a shared
  `clock` (pause/seek for deterministic capture), and live `tokens` (CSS strings + linear floats for shaders).
- One schema: props types come from the Zod object; validation runs in dev only.
- SSR renders an aspect-ratio placeholder; the canvas mounts on the client.
- Surfaces are listed by the MCP catalog, so an agent can find and drop one into any layout by name.
- `weft/surface/keel` registers `keel-pixel` and accepts Keel theme recipes. (Check Keel's license before it ships
  inside weft.)

## 5b. Native: iOS and Android from the same TSX

Details: [09](research/09-native-targets.md). This uses real platform views, not a webview and not drawn pixels. One
codebase and one pipeline produce three outputs.

- **One graph, three hosts.** The compiler gets a `native` backend next to `dom` and `ssr`, with the same pre-pass
  and W-codes.
  - Logic runs in Hermes bytecode on a JS thread.
  - Each `flush()` sends one op batch to a thin Swift (UIKit) or Kotlin host.
  - Layout is one Rust crate (`weft-layout`, on Taffy) linked into both hosts and into Node, so `weft test` computes
    the phone's frames headless.
  - `toTouchAtMost` counts host ops, so one budget covers all three targets.
- **Shared by default.** warp's closed vocabulary (`Stack Row Grid …`, intent props, tokens) is what maps to native.
  HTML intrinsics or CSS classes in a shared file are N001/N002.
- **Platform resolution is a table, not a guess.** One app dial, `idiom: 'system' | 'blend' | 'brand'`, decides it.
  - `blend` is the default: system chrome (navigation, sheets, alerts, pickers) and warp content (fields keep the
    sweep).
  - `weft design explain <C> --platform ios` prints the chain that produced a result.
- **Split on a ladder:** token → `platform.select` → `platform.os ===` branch → `X.ios.tsx` variant → route layout.
  - Variants must keep the base's props type (N020).
  - `weft split`/`splits --json`/`unsplit` manage them.
  - A base change that a variant didn't follow is flagged on the diff (N022).
- **Capabilities:** `weft/device` holds typed reactive values (haptics, camera, biometrics, push, secure storage,
  links…) with per-target support.
  - Unguarded use on a target that lacks one is N031.
  - Undeclared permissions are N030.
  - Native modules are one Zod contract that generates Swift, Kotlin and TS bindings.
- **Generated projects.** `ios/` and `android/` are generated from `weft.config.ts` into `.weft/native/` and never
  hand-edited (P010).
- **Agents:** `weft device` = `weft browser` for the simulator and emulator. Its snapshot carries the accessibility
  tree, laid-out frames, the resolution each component took, and the reactive graph.
- **Spike status (2026-10-28):** the iOS half of 6a runs ([`spikes/native/`](../spikes/native/README.md)). A price
  push is 1 host op on the phone, and Node's layout matches the phone's to 0pt over 769 nodes. Android is next.

## 6. Design language: `weft/ds`

Details: [03](research/03-design-language.md). Works *with* any styling system; ships its own vocabulary that an
agent can't drift outside of.

- **Tokens:** a ~6-value seed, Zod-validated, expands to DTCG 2025.10 tokens, then plain CSS variables in cascade
  layers. Text colors are computed to pass contrast; the build fails if they can't. A Keel theme recipe
  (`{seed, culture, pins}`) is accepted as a seed.
- **Vocabulary:** 8 layout primitives (`Stack Row Split Switch Grid Center Surface Frame`), a small component set,
  intent props with closed values (`tone`, `emphasis`, `size`, `density`, `gap`/`pad` like `related`/`section`, text
  `role`). No raw pixel values.
- **v0 interactivity** uses native `<dialog>`, popover and form controls. Zag.js adapter comes later.
- **Interop:** a Tailwind v4 adapter (`@theme inline` pointing at weft variables). Any other CSS works as-is.
- **Checks:** design rules join `weft check --json` as `D0xx` (arbitrary values, off-scale spacing, missing labels,
  contrast).
- **Style groups** ([23](research/23-style-groups.md), design): app styles as named groups with typed axes, parts and
  accents (`orderCard({ status: 'late' })` → `data-g="order-card" data-status="late"`), on warp's data-attribute
  contract. Values are intent tokens; Tailwind can feed the theme and utilities. The compiler emits readable CSS for
  the combinations actually used, and a reactive axis is one attribute write. Agents get `.weft/styles.json` (every
  group, axis, part, resolved CSS and use site) and D020–D025.

### 6.1 warp: the default toolkit

Design: [docs/design/warp/](design/warp/) (spec `00`–`09`, [SIGNATURE.md](design/warp/SIGNATURE.md),
[COVERAGE.md](design/warp/COVERAGE.md), specimens). Research: [agorix 01–04](research/agorix/).

warp is the rebuild of the Agorix kit for weft. It keeps the base idea and rebuilds everything underneath.

- **One dial, not a theme zoo.** `data-expression="quiet|balanced|vivid"` moves type, shape, temperature, depth and
  motion together, from B2B-quiet to creative-vivid. A seed recolours everything; contrast is checked at every stop
  (`scripts/contrast-check.mjs`, build-failing).
- **The signature is non-negotiable** (SIGNATURE.md): the left-to-right sweep border on every field and control, the
  frame button, the rail fill sweep, and the floating border label with a background-matched notch and per-character
  tint. Fields toggle globally with `warp({ fields: 'floating' | 'classic' })`, per form with `<Form fields>`, and per
  field with `variant`. The behaviour ships as `sweep()` and `floatingLabel()`, usable on any element.
- **Coverage:** every original component plus the use cases other kits cover (COVERAGE.md): inputs and rich inputs,
  overlays, toasts and notifications, calendars and scheduling, data and charts, app shells and flows, marketing.
- **Responsive by token:** phone, tablet and desktop from the same components; coarse pointers get ≥ 44px targets
  and ≥ 16px input text with no consumer patches.
- **Three ways to use it** (agorix 04 §3). Every skin sits on three public contracts: CSS variables, `data-state`
  attributes and `data-part` names. Styles live in `@layer warp.*` behind `:where()`, so any app CSS wins without
  `!important`.
  - **Default:** `@weft/warp` (skin) on `@weft/ui-core` (headless behaviour).
  - **Other kit or styling:** `ui-core` getters with your markup, or `weft add <name> --style plain|tailwind`, which
    copies the skin only and upgrades with `--diff`.
  - **Fully custom:** install nothing above `weft`. Data and real-time still work.
  - `create-weft --ui warp|headless|none`.
- **Server pieces:** Agorix's data and real-time breadth merges into `weft/start` on weft's protocol (§4.2;
  agorix 03 §7). warp components bind to `query`/`.live`/`channel` boxes and never own transport.

### 6.2 Text, type and smart skeletons: `weft/text`, `weft/skeleton`

Details: [11](research/11-text-and-type.md) (measured in Chrome and WebKit).

- **Type is CSS first and costs 0 KB.**
  - Display and title sizes are fluid on container units: `clamp(rem, rem + cqi, rem)`, with a max/min ratio of at
    most 2.5 so 200% zoom still works. Body text stays in `rem`.
  - `text-wrap: balance` for headings and `pretty` for prose, plus `text-box` trims and a `--warp-measure` of 45–75ch.
  - The dial picks optical sizing and axes.
- **Fonts are a build step,** provided by `@weft/plugin-text` (§7c) through the `font.build` slot. It subsets each
  face by `unicode-range` and generates a metric-matched fallback face (`size-adjust`) and preloads. Fonts are declared
  once, in `text({ fonts })`; without the plugin they are plain `@font-face`.
  - Every role has an explicit unitless `line-height`, so the font swap has CLS 0 even in Safari, which lacks
    `ascent-override`.
- **`weft/text`** reads the `text.measure` slot. `@weft/plugin-text` fills it with a slim Pretext fork
  (`packages/text-engine`, [12](research/12-text-engine-slim.md)) or pinned upstream Pretext (33.9 KB br), always as a
  **lazy chunk**.
  - **The slim engine is tiered.** A base "lite" chunk handles Latin, symbols and emoji with the browser's own line
    breaking: 8.2 KB br on Chrome and 9.3 KB br on Safari. An exact tier (8.9–10.5 KB) and per-script packs load
    lazily for other text.
  - **Measured accuracy:** it gives the same line count as upstream Pretext on 7 corpora × 1k paragraphs × 11 widths
    in Chrome and WebKit.
  - **Open items:** Firefox has no lite tier yet (15.3 KB base). On Chrome, Arial's space kerning keeps only 65–78% of
    plain Latin in the lite tier, so most pages load about 18–19 KB in total.
  - **Upstream:** the fork tracks a pinned version, merges only when the corpus diff is zero, and offers upstream
    three PRs that would let it shrink. Only routes that
  measure text load it.
  - **API:** `measure()`, `lines()` and `fit()` return `derived` boxes over text, role and width. `<Text reserve>`
    knows its height before layout; `<Text stream>` grows downward only, for agent output.
  - **Speed:** layout is 0.1–0.3 ms per 1k paragraphs on resize, against ~3 ms for DOM re-reads. Measurement uses the
    fallback face first and re-measures once when the real font loads.
- **Canvas text in Surfaces** uses `s.text()`: Pretext line breaks plus `fillText`, with an always-on **DOM mirror**.
  - The canvas reads its text from the mirror, so selection, find, translation, screen readers, forced colours and
    print all work.
  - Each change costs one DOM write.
  - Raw `fillText` is X010. Flutter Web's opt-in semantics is the anti-pattern.
- **Smart skeletons are never hand-written.**
  - The compiler emits a *shape* variant of each component. Text becomes measured line bars, media keeps its aspect
    ratio and lists keep their count.
  - **Size sources,** in order: the last-seen payload's per-key heights from the client cache; shape from the
    query's Zod output; server hints; estimates.
  - **Behaviour:** the skeleton swaps for the content (it doesn't morph into it) and fills the viewport. Show nothing
    for 150 ms, then hold it at least 400 ms.
  - `.live` refetches never flash a skeleton.
  - **Measured CLS:** 0 for last-seen and shape skeletons, against 0.47–0.85 for naive bars. Undimensioned media is
    the remaining source (X030).
- **Diagnostics `X001`–`X041`:** measure/render drift, zoom-breaking clamps, canvas text without a mirror,
  undimensioned media, skeleton size drift, lists with no count hint, skeleton flash on refetch, and streamed text
  without `<Text stream>`.

### 6.3 Media: `<Media>` and `@weft/plugin-media`

Details: [15](research/15-assets.md) (measured: Chrome 156 and WebKit 26, real KEEL assets).

- **One source, everything automatic.** You write `<Media src={hero} alt="…" />` or `import hero from './hero.gif?media'`.
- **Build optimizer (always on).**
  - **Format search:** every format is searched for the smallest file at a target SSIMULACRA2 score (80 by default),
    never a fixed quality.
  - **Stills:** AVIF plus a fallback in the source's own format. AVIF won every lossy case, 49–77% smaller than JPEG.
    WebP is a fallback only, and JPEG XL is opt-in.
  - **GIFs:** become a muted looping `<video>` with a poster and pause control (VP9 was −94% on a UI spinner), or
    stay GIFs when nothing is at least 15% smaller (noisy content was 70–180% larger as video).
  - **Video:** already web-encoded video is kept as is. Ladders apply "mean at target, worst frame within 5", and VMAF
    is not used for flat UI (it misjudges it).
  - **Audio sync:** `timeline()` exposes `currentTime`/`playing` as boxes, with cue callbacks driven by
    `requestVideoFrameCallback`, and audio can be muxed into converted GIFs.
- **Layout-driven variants.**
  - **Widths and `sizes`:** solved from each element's warp primitive chain through `weft-layout`. `sizes="auto"` is
    the fallback, and a dev sampler catches drift.
  - **Every asset gets:** a focus/saliency `object-position`, dimensions (so X030 can't fire), the dominant colour and
    a 16 px WebP placeholder (about 120 characters, 0 B decoder, sharper than BlurHash/ThumbHash).
  - **ThumbHash** is kept for native, Surfaces and skeleton shape records.
- **Smart encoder: `media({ encoder: 'off' | 'background' | 'server' })`, off by default because it adds bytes.**
  - **Delivery:** each viewer gets the efficient file their client decodes (`Accept`, `MediaCapabilities`), sized to
    the view.
  - **Compatible copy for saving:** a compatible copy (the original JPEG/PNG/GIF, or an H.264 MP4) swaps in so
    right-click "Save as" gives a file that opens anywhere. It swaps on right-click, long-press or drag, or on idle if
    the copy is at most 1.5× the size.
  - **Images:** decode, then swap in the same frame. Measured 0 blank frames and CLS 0.
  - **Video:** a second muted `<video>` starts at a matched frame and flips within one frame. Measured 0 blank
    frames, against 3/6 for a naive `src` swap.
  - **Live video:** a server remux of the H.264 rung as the download.
  - **Runtime:** 454 B br.
  - **Where encoding happens:** at build by default; a content-hashed server route (plus the Rust sidecar) for
    uploads; the client only as an escape hatch.
- **Plugin slots:** `media.analyze@1`, `media.encode@1` (keyed by codec), `media.quality@1` and `media.cdn@1`.
  sharp, SVGO and SSIMULACRA2 are bundled. ffmpeg is an opt-in provider (`@weft/plugin-media-ffmpeg`), with licence
  and patent notes for LGPL/GPL, x264/x265 and the H.264/HEVC/AAC pools.
- **Diagnostics M001–M016 with autofixes,** plus a 7-line AGENTS block.
- **Unverified:** whether every browser's "Save as" honours a URL swapped inside `contextmenu` (a headful test gates
  `background` in 3c), and Firefox.

## 7. Agent layer (ships with the core, not after)

- **AGENTS.md** docs index under 8 KB, always present. Vercel measured passive docs beating skills (100% vs 79%).
- **`weft check --json`:** every W/D diagnostic plus mapped TS errors, with code, location, why, fix.
- **MCP server** (`weft mcp`): `docs`, `check`/`fix`, `catalog`. Later: `inspect` (live dev graph), `scaffold`.

## 7c. Plugins: typed slots, not hooks

Details: [13](research/13-plugins.md).

- **Model.** Core defines typed, versioned **slots**: `text.measure@1`, `font.build@1`, `surface.renderer`,
  `realtime.bus`, `db.adapter`, `pay.rail`, `device.*`. A plugin *provides* an implementation, and core, warp and app
  code *consume* the slot.
  - Consumers import a generated file you can open, `.weft/slots/<id>.ts`. Installing `text()` makes every measured
    text use go through it, with nothing hidden and no per-call-site changes.
- **Configuration** goes in `weft.config.ts`: `plugins: [text({ fonts }), warp()]`, with an optional `slots: {}` to
  pick a winner.
  - **No provider:** the slot's declared default is used. `text.measure` has none, so text stays CSS-only. Using
    something that needs a missing provider is P101, reported at your own line with an autofix.
  - **Two providers:** P100. It is never settled by array order, and output is byte-identical for any order of
    `plugins: []`.
- **What a plugin can touch:**
  - **Compiler:** the Rust compiler stays closed. Plugins switch on built-in passes and feed them data; they never run
    code inside them.
  - **Vite:** third-party hooks must be filtered (P107). They are timed per plugin, with each plugin getting at most
    5 ms of the 50 ms HMR budget (P108).
  - **Runtime:** provider code is reached only through a lazy `load()`, so an installed but unused plugin costs 0 KB
    (P114).
  - **Server:** server code enters only through server-side slots (P118). No plugin can add request middleware or
    routes behind the app's back.
- **Agent surface:**
  - `weft plugins list|explain|add|verify|audit|approve --json`, plus a `slots` block in `weft check --json`.
  - Each plugin adds at most 1 KB to AGENTS.md.
  - Each plugin's diagnostics live in its own namespace.
- **Trust:** each plugin declares the permissions it needs, and `.weft/plugins.lock.json` records them. This makes any
  change visible; it is not a sandbox.
- **Testing:** every slot ships a conformance suite in `weft/test/plugins`, and any provider must pass it. For
  example, every `text.measure` engine must pass the accuracy corpus.
- **Which packages become plugins:**
  - **Plugins:** realtime buses, db adapters, pay rails, surface kinds, device modules and the Tailwind adapter.
  - **Partly:** warp, for its config, tokens, catalog and AGENTS section only. Its components stay normal imports.
  - **Not plugins:** `weft/start`, `native()`/`remote()` and multiplayer.
- **What "every font uses it" means:**
  - **Global:** font loading, fallbacks, preloads and role strings.
  - **Automatic** wherever a height is needed before render: virtual lists, shape skeletons, `s.text()`,
    `<Text stream>` and `fit()`.
  - **Opt-in:** `<Text reserve>`.
  - **Never:** plain flow text. CSS already lays it out.

## 7b. Testing, browser control, and one project CLI

Details and sources: [05](research/05-testing-browser-cli.md). The principle: one binary (`weft`), one manifest
(`weft.config.ts`), and one query vocabulary (role/label/text) shared by tests and the agent browser. Diagnostics go
into the same catalog: `T0xx` for tests and `P0xx` for project hygiene.

**`weft test`: tests that can't be junk.**

- **Authoring:** `weft/test` gives `render`, user-level queries only (`getByRole/Label/Text`), and `user.click/type`.
  Every action ends in `flush()`, so there's no `waitFor` guessing. A deterministic `clock` drives timers, `resource`
  and rAF. Snapshots are off; opt-in aria snapshots are allowed. `test.prop` comes from fast-check for property tests.
- **Work budgets:** `await expect(interaction).toTouchAtMost(n, { runs })` bounds the DOM mutations and the reactive
  re-runs one interaction causes; `touches(interaction)` returns both counts. DOM mutations alone miss identity bugs
  that re-run every row but write the DOM once (research 16 §4), so eval scenarios set both.
- **Lanes:** a fast lane (Vitest + happy-dom), `--browser` (Vitest Browser Mode + Playwright, the same files), and
  `--e2e` (Playwright against `weft dev`).
- **Static T-codes:**
  - T001: no assertion
  - T002: tautology
  - T003: asserting a value the test just set
  - T004: sleeps or real timers
  - T005: implementation queries (container, classes, test ids, internal state)
  - T006: mocking weft or the unit under test
  - T007: unapproved snapshot
  - T008: conditional `expect`
  - T009: `.only` or `.skip`
  - **Status (2026-10-29):** T001–T009 are in `weft check` (`packages/cli/src/tests.mjs`, TypeScript parser, syntax
    only), on the test files named by `test.include` (default `**/*.{test,spec}.*`). The rules are weft's own, not
    re-emitted ESLint rules, so the CLI needs no ESLint. T005 is a warning, the rest are errors. T009 autofixes
    `.only` (safe) and `.skip` (suggested); T004 suggests `flush()` for a zero-delay sleep. `weft/test` also fails a
    test that ends with no assertion (runtime T001), and ships `screen` (role/label/text only), `user` (each action
    ends in `flush()`) and `clock`. A test that needs a finding on purpose keeps it with
    `// weft-allow T00x: <reason>`; the framework's own DOM-level tests do. Not built yet: `test.prop`, opt-in aria
    snapshots.
- **The gate** (`weft test --gate`, run by `weft check` on a diff). This is what stops junk tests: a test has to
  prove it tests something.
  1. **Fail-before:** every new or changed test must fail against the old code (T010).
  2. **Mutation on changed lines:** Stryker with time-capped mutation (sampled when over budget); each new test must
     kill at least one mutant (T011). Surviving mutants come back as JSON with a suggested assertion.
  3. **No silent weakening:** deleting, skipping or loosening an existing assertion is T020 and needs a written reason.

  The eval harness already uses fail-before ("reference passes, buggy variant fails"). The gate makes that the rule
  for every test.

**`weft browser` (CLI) = `weft mcp` browser tools: full programmatic control of the running app.**

- Built on Playwright (as a library), as a daemon attached to `weft dev`, with named sessions.
- Commands:
  - `open <route>`
  - `act <role> <name> click|fill|press|select`
  - `assert …`, with the same matchers as `weft/test`
  - `screenshot` (to a file, returns the path)
  - `console`, `network`, `errors` (source-mapped to component names)
  - `time pause|advance|resume` (the same clock as tests)
  - `set <Component.box> <json>` (jump to a state in dev)
- `snapshot`: a compact accessibility tree with refs and deltas, **plus weft's live reactive graph** (`Cart.total =
  42.5 ← Cart.subtotal ← props.items`). This is the part no generic agent browser can do. Large payloads go to a file.
- `record` turns an exploration session into a role-query test, which then has to pass the gate.
- Every command supports `--json`. Chrome DevTools MCP stays the recommendation for performance traces.

**One manifest, one CLI.**

- **`weft.config.ts`** (Zod-validated):
  - `scope`: where agents may write, may read, and may never touch
  - `tasks`: each with a description, args schema, side effects and allowed environments
  - `environments`, `test` lanes and gate budget
- **`weft` is the only CLI:** `dev build test check fix browser mcp tasks run create`. Project-specific commands
  exist only as `tasks` and run via `weft run <name>`; `package.json` scripts may only alias `weft …`.
- **`weft tasks --json`:** the single source of what can be run. It is also exposed as MCP tools and used to generate
  the commands section of AGENTS.md, so docs can't drift from reality.
- **Every command:** JSON on stdout, human text on stderr, stable exit codes and `code` fields.
- **P-codes:**
  - P001: stray script file
  - P002: non-weft `package.json` script
  - P003: duplicate task
  - P004: task without description or side effects
  - P005: write outside `scope.write`
  - P006: unreferenced one-off script

**Build vs reuse.**

- **Reuse:** Vitest (both lanes), Playwright, StrykerJS, fast-check, existing lint rules (re-emitted as T-codes), Zod.
- **Build:** `render`/`flush`/`clock`, the gate, T002/T003/T006, the browser daemon with the graph overlay and
  recorder, the manifest, `weft tasks`/`run`, the P-codes, and AGENTS.md generation.

## 8. Packages

```
packages/
  weft        runtime + compiler binding + vite plugin + test utils + CLI (check, test, browser, tasks, mcp, create)
              subpaths: weft, weft/compiler, weft/vite, weft/test, weft/config, weft/browser
  start       routing, server functions, cache, Nitro integration, real-time   (weft/server, weft/db, weft/realtime)
  rust        weft/rust (native, remote) + the `weft` crate (codegen, Ctx, axum router), opt-in
crates/
  weft-compiler   pre + diag + weft's own back end (Solid's crate until it's replaced); napi + WASI builds
  ds          tokens, layout primitives, components, Tailwind adapter
  ui-core     headless behaviours + prop getters, /motion (Presence, presets → WAAPI), @weft/zag binding
  warp        the default skin: tokens, sweep()/floatingLabel(), components, styles.css, tailwind.css, registry
  multiplayer presence, cursors, interaction relay (from Agorix)
  surface     defineSurface, canvas2d, webgl2; keel subpath
  text        weft/text + weft/skeleton consumer APIs (measure, lines, fit, <Text>, s.text() + mirror); no engine
  text-engine slim Pretext fork (MIT, credited), no weft dependency
  media       weft/media: <Media>, timeline(), z.media(), swap + chooser runtime (lazy); encoders live in plugin-media(-ffmpeg|-rust|…)
  plugin-*    @weft/plugin-text (text.measure + font.build), -bus-*, -db-*, -pay-*, -surface-keel, -device-*, -tailwind
              (weft itself adds weft/plugin, weft/slots, weft/test/plugins and the `weft plugins` CLI)
crates/weft-fonts   font metrics + subsetting (napi), used by plugin-text's font.build
crates/weft-media   SSIMULACRA2, ThumbHash, header probes, optional ravif/rav1e (napi + WASI)
  native      native compiler target runtime, weft/device, Swift + Kotlin hosts, project generation, `weft device`
  pay         weft/pay: catalog, resolver + policy table, Stripe/StoreKit/Play adapters, entitlements (+ @weft/db-pay)
crates/weft-layout  Taffy-based layout shared by the iOS host, the Android host and Node
evals/        agent eval harness
```

## 9. Phases

| Phase | Ships | Exit check |
|---|---|---|
| **0. Eval** | 6 tasks, one per root cause (stale snapshot, effect-as-derivation, invisible tracking, context-dependent magic, scheduling, silent failure). PROMPT.md + hidden vitest. Baselines in React 19 and Solid, 5 samples each. | Baseline pass@1 and failures tagged by cause. |
| **1. Core + agent layer** | 2-week compiler spike, then the Rust compiler with weft's own back end (replacing the spike's Solid crate). Client-only runtime, `weft/browser` values + W050/W051/W054/W056 + T012, §3.5 diagnostics, §3.7 gates (size, DOM work, compiler speed), `weft/test` + T001–T009, HMR, `defineState` (client instance, `persist` local/session, `history`, names, `$reset`) + S003–S010, `weft.config.ts` (with reserved `plugins`/`slots` keys and P100–P120) + `weft tasks --json` + P-codes, generated AGENTS.md, `weft check --json`, MCP `docs`/`check`/`tasks`. | Agent pass@1 on weft beats both baselines. Every eval failure maps to a W-code, or becomes a new one. |
| **1b. Verify loop** | Name-keyed state-preserving HMR (flagged), 1k-component perf gates, `weft browser` daemon + graph overlay + recorder + network/time control for reconnects, test gate (fail-before, diff-scoped mutation, T020). | The gate accepts every eval reference test and catches planted junk tests (tautologies, implementation-detail, no-fail-before). |
| **2. UI (warp tier 1)** | The minimal plugin API (§7c: `definePlugin`, slots, generated slot modules, `weft plugins`), with `@weft/plugin-text`'s `font.build` as the first provider. `<Media>` for stills and `@weft/plugin-media` (sharp + SVGO, AVIF + fallback, SSIMULACRA2 search, placeholders, layout-solved `sizes`), M001–M013. `ui-core` + `/motion` + `@weft/zag`, warp tokens and the signature (`sweep()`, `floatingLabel()`, floating/classic fields), ~20 tier-1 components (Button, Card, Badge, Stat, Kbd, Alert, Input/Search/Textarea, Switch, Segmented, Tabs, Select, Tooltip, Popover, Modal, Drawer, Toast, Skeleton), `create-weft --ui`, the font build step (subsets, matched fallbacks, preloads), fluid `cqi` type tokens, skeleton shapes for `<Boundary pending>` (the timing landed in Phase 1), X005–X008, X020–X031. | The v3 shop app rebuilt on weft + warp passes its hidden tests within the §3.7 budget plus a measured kit allowance; contrast and a11y suites green at every dial stop. |
| **2. Surfaces** | `defineSurface`, canvas2d, webgl2, Keel port. the `text.measure` slot (slim engine and pretext) with conformance, `s.text()` with the DOM mirror, X001–X012, X040/X041. | A Keel demo ported; an agent adds a surface to a page from a one-line request. |
| **3. Start** | Streaming SSR (the string renderer and hydration landed in Phase 1), routing, route `meta` and OG images ([20](research/20-metadata-and-og.md)), `query`/`mutation`, tagged cache, Drizzle, Better Auth, `create-weft`. Node/Bun/Deno presets with a CI matrix, `.weft/contract.json`. `.live`, `topic`, `stream`, `memory` + `postgres` buses, fake transport in `weft/test`. `z.media()`, the media server route with `Accept` negotiation (`encoder: 'server'`). The `defineState` SSR state payload (per-request instances landed in Phase 1), `cookie` persist, `mutation({ optimistic })` overlays, S001/S002/S011–S013. `query.shape`, last-seen shapes in the cache, compiler shape variants, `<Text reserve>`, X032–X036. | A T3-equivalent todo + auth app scaffolded and extended by an agent; the same app passes e2e on Node, Bun and Deno. |
| **3b. Channels** | `sync: 'tabs'` and `sharedState.connect()` as a box. `channel` over crossws, Origin + `authorize` + session re-check, `redis`/`nats`/`durable-object` buses, `tabs.channel`. | A chat room built by an agent passes the R-code checks and a reconnect/resume test. |
| **3c. warp tier 2 + Agorix packs** | Plugin trust tooling first (permissions audit, lockfile, `approve`), then `@weft/plugin-media-ffmpeg` (GIF → video, ladders, audio, `timeline()`) and `encoder: 'background'` behind a headful save test, Virtualised chat, feed, kanban and grid on exact text heights, `<Text stream>`. Rich inputs, date/time pickers, calendars, data table, charts, app shells, flows, `@weft/multiplayer`, `@weft/realtime-*` and `@weft/db-*` packs, `@weft/agorix-compat`, codemods. | A Velatis page slice and its live sessions run on weft + warp, passing the conformance and security suites. |
| **4. Design** | `weft/ds` tokens, primitives, Tailwind adapter, D-checks. | weft/ds vs raw Tailwind on consistency and a11y. |
| **5a. Rust: remote** | `remote()`, the `weft` crate (typify codegen, `Ctx`, envelope, `touch`, tracing, `weft::router()`), sidecar supervisor + dev reload, R101–R103. | A search sidecar replaces a TS `query` with no client change. |
| **5b. Rust: native** | `native()` via napi-rs + WASM fallback, R104/R105. | A CPU-bound demo beats its TS `run` by ≥ 5× on Node and Bun. |
| **6a. Native spike (3 weeks)** | Hermes + op buffer + `weft-layout` + Swift/Kotlin hosts for `Stack Row Text Button Input Scroll`, `weft dev --ios/--android`, HMR. | The v3 list screen runs on both platforms; price push ≤ 1 host op; Node layout matches device within 1pt for non-text boxes. Stop and revisit if a mid-range Android can't hold 60 Hz. |
| **6b. warp native + device** | Tier-1 resolution table, `idiom`, `weft/device` core, generated projects, `weft device`, N-codes, split tooling. | An agent takes a shared web app to TestFlight and the Play internal track with ≤ 3 variant files. |
| **6c. Payments** | `weft/pay`: web half (Stripe, entitlements, `fakePay`) can land with Phase 3; native half (StoreKit 2, Play Billing, Stripe native, policy table, `weft pay sync`). | One `pro` product bought in the iOS sandbox unlocks on web and Android with no app-code branch. |
| **6d. Native extensions** | Native-module codegen, widget TSX subset → WidgetKit + Glance. | One TSX widget ships on both platforms. |

Performance is gated from Phase 1 (§3.7). The v3 eval showed that efficiency, not correctness, is where frameworks
differ.

## 10. Out of v0

Server components, partial prerendering, resumability, a custom file format or new syntax, GraphQL, local-first
sync, native targets (they follow in Phase 6, §5b), Zag/headless library adapters, ISR, automatic cache tags, our own CSS engine.

Also out of v0:
- **Real-time:**
  - diff-based or sync-engine live queries,
  - an offline mutation queue,
  - WebTransport,
  - cross-tab socket sharing,
  - presence.
- **Build and Rust:**
  - our own bundler or minifier, SWC plugins, a Babel default path,
  - Rust-first schemas,
  - Rust owning the public edge or the cache,
  - mandatory native binaries.

## 10b. Phase 0 status (2026-10-28)

- **Harness built:** [`evals/`](../evals/README.md), with v1 (6 fresh tasks, explicit specs) and v2 (5 tasks, edits,
  implicit traps, two traps each). Every reference passes, and every classic-bug variant fails.
- **Result:** 40/40 agent runs pass in both React and Solid with Haiku and Sonnet
  ([v2 findings](../evals/results/v2-FINDINGS.md)). On small components, current models don't fall into the classic
  traps.
- **v3 app-scale run** ([v3 findings](../evals/results/v3-FINDINGS.md)):
  - Setup: one 8-file app and three sequential tickets per session.
  - Correctness: 12/12 checkpoints green with no regressions. Tool counts and times are similar for React and Solid.
  - Efficiency is where the frameworks differ:
    - a ~7× bundle gap (68 KB vs 9–10 KB gz),
    - React re-rendering the whole list on each price tick,
    - Sonnet's Solid app rebuilding all 150 rows per tick (300 DOM mutations, versus 1 in the reference), caused by
      React-style `{...p}` spreads. No test caught it.
- **Consequence for Phase 1:** lead with performance, size and the verify loop, not correctness. Two additions:
  - a compile-time diagnostic for identity-breaking spreads into keyed lists,
  - a first-class work-budget assertion in `weft test` (`toTouchAtMost(n)`), promoted from the eval probe into §7b.
- **Compiler spike (2026-10-28,** [16](research/16-compiler-spike.md)**):** weft keys rows by key, so the v3 spread
  habit costs 1 DOM write instead of 300. W014 and the `runs` budget catch the per-row CPU cost that remains (756
  re-runs against 10). The v3 app on weft passes 23/23 at 3.5 KB br, with 1 DOM write per price push.

## 11. Open questions

- **`.value` in JSX: settled, required everywhere** ([16 §5](research/16-compiler-spike.md)). Auto-read only works
  for boxes declared in the same file, so it would be a partial rule. W015 catches bare boxes; the agent eval only
  confirms the error rate.
- **Compiler spike outcome: settled, then superseded.** The spike passed on Solid 2's crate; weft now owns its back
  end and removes the crate once its own passes the same checks (§3.6, §12).
- **Event replay before hydration:** a capture script like Solid's `_$HY`, or nothing?
- **Partial hydration** (`<NoHydration>`, islands): needed before Phase 3's routing?
- **Hydrated resources:** trust the server's value (today), or revalidate in the background?
- **Style groups:** spread (`{...orderCard()}`) or a `g=` prop, and CSS-file groups as a second input format? The [23 §4](research/23-style-groups.md) spike decides.
- **OG renderer:** Takumi (Rust, HTML in, native + wasm) or Satori + resvg? The [20 §7](research/20-metadata-and-og.md) spike decides.
- **Keyed reads of record boxes: settled, `box.get(key)`** ([14 §11](research/14-app-state.md)). One method on
  every box, no new primitive, no proxies: v3 add-one goes from 452 re-runs to 5. A compiler hint that suggests it
  when a keyed list's row reads `box.value[expr]` is a proposed follow-up.
- **Native addons on Bun and Deno.** napi-rs doesn't test addons on Deno, and Bun support is best-effort. Native
  addons also can't be unloaded in dev, so dev reload means restarting the server worker. Spike before Phase 5b.
- **Nitro v3 is beta.** Pin it; h3 v2 is the fallback.
- **Native host on Android:** Views for the core (finer recycling control), Compose for system components through
  interop? And Hermes everywhere, or JSC on iOS for binary size? Both are settled by the 6a spike.
- **Default `idiom`:** `blend` for every app, or should `create-weft` ask?
- **Store payment rules** change with US litigation. Who owns refreshing the policy table, and how often?
- **Names (settled 2026-10-28):** weft is the framework and warp is its default UI toolkit (the rebuild of Agorix).

## 12. Decision log

- **Getter props over Ripple-style plain props.** Research 01 recommended Ripple 0.4's plain props with `Live<T>`
  types. We chose compiler-made live props because agents will write `count={count.value}`, and only live props make
  that correct without type-directed compilation. The holes this opens are closed by §3.3 and W001/W005/W006.
- **TSX, not new syntax** (`@if`, `.tsrx`). Training-data volume dominates agent accuracy (Web-Bench). We take the
  cost of React-shaped bugs and pay it in diagnostics (rule 2).
- **No `store`.** `state` + `.set(draft)` covers deep updates; two containers broke "one way".
- **Explicit cache tags first**, with a dev check, instead of instrumenting Drizzle (joins, raw SQL and transactions
  make auto-tags silently wrong).
- **Rust/Oxc compiler from day one** (2026-10-28). Solid 2 already ships a native Oxc compiler with dev names, server
  extraction and refresh, so forking the Babel plugin would mean building on the path upstream is leaving. The 2-week
  spike is the fallback gate.
- **Compiler spike passed** (2026-10-28). weft is a pre-pass on Solid 2's crate, used unmodified; 193 ms per 1k
  components; v3 app 3.5 KB br with 1 DOM write per price push ([16](research/16-compiler-spike.md)).
- **weft owns its code generator** (2026-10-29). The spike proved the design on Solid 2's crate, but keeping it
  would let another framework decide weft's helper set, markers and hydration keys, the opposite of a system built
  for agents. weft writes its own back end; the crate leaves the build once that passes the same gates. Forking was
  ruled out for the same reason. Solid stays as a benchmark comparison only.
- **Performance gates start in Phase 1** (2026-10-28). The v3 eval showed efficiency is the differentiator.
- **Real-time is poke + refetch over tags, owned by the client cache** (2026-10-28). It reuses auth and the tagged
  cache. Subscriptions outlive the components that read them, which fixes the v3 bug class by design.
- **Rust is opt-in per server function, with Zod as the contract** (2026-10-28). TS keeps the edge, sessions and
  cache; Rust can implement anything behind them. One crossing per function, and never a mandatory binary.
- **warp moves ahead of Surfaces** (2026-10-28). The apps that would prove weft all need a kit, none needs a surface
  first, and the token work overlaps `weft/ds` (agorix 04 §5). The sweep signature is mandatory at every dial stop,
  and fields toggle between floating and classic.
- **Native means real platform views, with layout shared in Rust** (2026-10-28). Drawn-pixel toolkits (Flutter,
  Compose Multiplatform on iOS) fail the requirement because they re-implement accessibility, IME and the system
  look. Source translation to SwiftUI/Compose can't carry general TS logic. weft's run-once graph makes a host-op
  backend cheap, and Taffy gives identical, headless-testable layout ([09](research/09-native-targets.md)).
- **Payments pick the rail; app code never does** (2026-10-28). Store rules are dated data with opt-ins, because
  they are being decided in court right now ([10](research/10-payments.md)).
- **Text measurement is a lazy Pretext chunk, and type stays CSS first** (2026-10-28). Pretext's win is re-layout
  (10–30× cheaper than DOM re-reads), not first measurement, and it is 34.5 KB, so only routes that measure pay for it.
  Canvas text always has a DOM mirror. Skeletons come from the last-seen payload and the output schema, never by hand
  ([11](research/11-text-and-type.md)).
- **Plugins fill typed slots; they don't hook into everything** (2026-10-28). Installing a plugin changes behaviour
  only through a slot whose generated module you can open. The compiler stays closed to plugin code. Plugins have
  budgets, cost 0 KB at runtime until used, and must pass conformance tests. The text engine is the first
  plugin ([13](research/13-plugins.md)).
- **No `store`, and `defineState` is not one** (2026-10-28). Shared client state is `defineState(name, setup)`: a
  named setup scope that returns ordinary `state`/`derived` boxes and functions. It adds a lifetime (per tab, per
  request, per test) and a name (devtools, persistence keys, undo), never a second way to hold a value. Server data
  stays in the query cache, where copying it into state is S001, and optimistic updates are overlay layers declared
  on the `mutation` ([14](research/14-app-state.md)).
- **Media is optimised by measured quality, not by format fashion** (2026-10-28). Every asset is searched to a
  SSIMULACRA2 target, sized from layout, and always gets dimensions and a placeholder. The save-compatible swap is an
  opt-in encoder mode, because it costs bytes and one behaviour (`contextmenu` save) is still unverified
  ([15](research/15-assets.md)).
