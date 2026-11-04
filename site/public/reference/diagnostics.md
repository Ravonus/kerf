# Diagnostics

Every code weft reports, 274 in all. `weft docs <code>` prints the same page.

## Compiler

| Code | Catches |
|---|---|
| `W000` | Syntax error; nothing else in the file is checked |
| `W080` | A component with an untyped parameter that nothing renders: its props have nothing to be inferred from |
| `W081` | An exported component with no written prop type |
| `W082` | A generated `/*inferred*/` prop type no longer matches the callers |
| `W083` | An `any` weakens an inferred prop; names where the `any` came from |
| `W084` | One caller passes a type the component body can't handle, and the others agree |
| `W085` | An inferred prop names a type the component's scope can't see |
| `W001` | A prop or `.value` used to compute something in the component body outside `derived`/`watch`/JSX/handlers (the body runs once). `const x = props.y` and destructuring only name the prop and stay live |
| `W002` | Writing state inside `derived` |
| `W003` | `watch` writes state that its own source reads (cycle) |
| `W004` | `watch` that only copies one value into another |
| `W005` | `state(prop)`: React's `useState(prop)` bug, the box never follows the prop |
| `W006` | Nested prop destructuring (`({ user: { name } })`) can't stay live |
| `W007` | Assigning to a `Derived` (maps TS2540) |
| `W008` | Box/value mismatch at a prop (a `State<T>` where `T` is expected, or the reverse) |
| `W010` | `.map` over objects without `key` |
| `W011` | A number on the left of `&&` (renders `0`) |
| `W012` | `derived(async …)`, or reads after `await` in `resource` (untracked) |
| `W013` | Early `return` inside a JSX `.map` callback |
| `W014` | Identity-breaking `.map(p => ({ ...p, … }))` feeding a keyed list: every row re-runs on every change (in-file, and across files via props in `weft check`) |
| `W015` | A box rendered without `.value` in JSX (a child, or a native attribute) |
| `W017` | One entry of a whole object read per row (`cart[p.id]`, `cart.value[p.id]` in a keyed-list row or its props, `box.value[prop]` in a row component): every change re-runs every row |
| `W018` | `const x = untrack(() => …reactive…)` in a component body that only the JSX reads: it renders the setup-time value and never updates |
| `W019` | Unsupported row pattern |
| `W020` | React-isms (W020–W029): `useState`, `useEffect`, `useMemo`, `useRef`, `useCallback`, custom `useX()` hooks, dependency arrays |
| `W030` | Module-level `state` reachable from the server entry graph (leaks across requests) |
| `W040` | Early `return` in a component body that depends on state (runs once, never re-checked) |
| `W041` | `let` variable mutated in a handler and read in JSX (never updates) |
| `W044` | A `key` read from `crypto.randomUUID()`, `Date.now()`, `Math.random()` or `performance.now()`: it differs between server and client, so the row is rebuilt on hydration and on every render. At runtime the same miss logs `a key differs between server and client` |
| `W043` | `data-x={true}` or `data-x={false}` on a native element: `data-*` booleans are presence flags, so these write `data-x=""` or nothing, not React's `"true"` and `"false"` |
| `W050` | Raw `addEventListener`, `setInterval`, `new WebSocket` or `new EventSource` in a component with no cleanup (it outlives the component) |
| `W051` | A @weft-js/core/browser value, `on` or `interval` created outside an owner: module scope, a timer or promise callback, an event handler, after `await` |
| `W052` | `watch` folding a stream by hand |
| `W053` | `.live()` on a query with no `tags` (dev): no mutation can ever poke it |
| `W054` | `media(query)` without `ssr` in a server-rendered component (hydration mismatch); a warning when `weft check` cannot tell |
| `W056` | `watch` that copies a live value (a @weft-js/core/browser value, `.live()`) into `state` |
| `W060` | A `group()` from @weft-js/core/style that can't be evaluated at build: a value that isn't a literal (named with its path), a `group()` outside a top-level `const`, or an accent that isn't literal tokens |
| `W061` | `bind:x` on a native element, or `bind:x`/`bind(box)` with something that isn't a box or that isn't a component prop |

## Design

| Code | Catches |
|---|---|
| `D001` | A raw colour in `style`, app CSS, or a Tailwind arbitrary or palette class, in an app with warp's tokens: it won't follow the theme, the dials or dark mode |
| `D002` | Spacing off the scale, or a scale step written by hand (`padding: 16px`, `p-[13px]`, `gap-3`) |
| `D003` | Raw type, radius or shadow (`font-size`, `text-lg`, `rounded-[7px]`, `box-shadow`) |
| `D004` | Layout spelled out on an element (`display: flex`, `flex flex-col gap-4`) where a primitive says it |
| `D040` | The style gate (`data-weft="styled"`) on the main content or a page heading: the first paint hides what it should show |
| `D041` | `aria-label` or `aria-labelledby` on a `<div>`, `<span>` or other element whose role may not be named: screen readers drop it (axe aria-prohibited-attr) |
| `D005` | A browser-painted control in a warp app: `<button>`, `<select>`, `<textarea>`, an input type like `date`, `number` or `range`, or a `title` tooltip |
| `D006` | One heading level at two roles across an app (`h1` as both `title` and `display`), or a bare `<hN>` beside `<Heading>` |
| `D007` | A bare `<a href>` in a warp app |
| `D011` | A literal text and background colour pair on one element below 4.5:1 |
| `D012` | A Content-Security-Policy that blocks inline styles, or every script a page could switch its deferred sheets on with, in an app that inlines its CSS; as a warning, one that refuses only inline scripts |
| `D030` | An `<input>`, `<select>` or `<textarea>` with no label |
| `D031` | A button or link with no accessible name (icon only, or empty) |
| `D032` | `<img>` with no `alt` |
| `D033` | `onClick` on a non-interactive element with no role: mouse only |
| `D034` | A control inside a control (`<a><button>`) |
| `D035` | A heading level that jumps (h1 to h3) |
| `D036` | The focus ring removed with nothing in its place (`outline: none`, `outline-none`) |
| `D037` | A positive `tabindex` |
| `D038` | Two solid Buttons side by side |
| `D039` | `<html>` with no `lang` |
| `D020` | Class soup: a static `class`/`className` with more than 8 classes, or the same class list (4+ classes) in two or more places |
| `D021` | Two style groups resolve to 90% or more of the same CSS (`similar` in .weft/styles.json) |
| `D022` | The same accent (`accent: { … }` at a call site) on one group at 3 or more sites |
| `D023` | A `css: { … }` escape (raw CSS) in a style group |
| `D024` | Styles that fight with no order: two group roots spread on one element; two compounds that can match at once and set one property differently, or an accent that sets what the site's own axis value sets (`weft check`) |
| `D025` | Unknown name in a style group: an axis value, axis, state or part a call site uses that the group doesn't have, or an intent or token that isn't in the vocabulary (also a type error) |

## Tests

| Code | Catches |
|---|---|
| `T001` | A test with no assertion (or an `expect(x)` with no matcher): it passes as long as nothing throws. `@weft-js/core/test` also fails such a test at runtime |
| `T002` | Tautology: `expect` on a literal, or a value compared with itself |
| `T003` | Asserting a value the test just set (`n.value = 5; expect(n.value).toBe(5)`) without going through the UI or the graph |
| `T004` | Sleeps, real timers or `waitFor` polling in a test |
| `T005` | Implementation query: `container`, CSS selectors, classes, `innerHTML`, test ids, or app state read directly in a component test |
| `T006` | Mocking weft (`vi.mock('@weft-js/core')`) or the unit under test, so the test checks the mock |
| `T007` | Snapshot without approval: it records today's output and passes against it |
| `T008` | Conditional `expect` (`if`, `?:`, `&&`, `catch`), or a test whose only `expect`s are in a loop |
| `T009` | `.only` or `.skip` committed (also `fit`, `xit`, `xdescribe`) |
| `T010` | A new or changed test passes on the code before the change (fail-before), so it does not test the change |
| `T011` | A new test kills none of the mutants of the changed lines: it would still pass if that code were wrong (a warning when the mutants were sampled) |
| `T012` | A test ends with @weft-js/core/browser listeners, intervals or subscribed values still open (checked by @weft-js/core/test after each test) |
| `T013` | A real `WebSocket` or `EventSource` in a fast test |
| `T020` | An existing test deleted, skipped, marked `.fails`, or with an assertion removed or loosened (`toBe(3)` → `toBeTruthy()`) |

## Plugins and config

| Code | Catches |
|---|---|
| `P001` | Stray top-level script file outside a declared task |
| `P002` | `package.json` script that is not a `weft …` alias |
| `P003` | Task duplicates a built-in command or another task (same name or same command) |
| `P004` | Task without `description` or `sideEffects` |
| `P005` | Write outside `scope.write` |
| `P006` | Unreferenced one-off script |
| `P007` | weft.config.ts fails to load or fails the schema (the Zod path is given) |
| `P008` | `slots` names a slot id weft does not define |
| `P009` | `slots` picks a winner that is not in `plugins` (or does not provide that slot) |
| `P010` | More than one weft.config file |
| `P100` | Two providers for a `one` slot (or the same key in a `keyed` slot) |
| `P101` | A slot consumer is used but nothing provides it |
| `P102` | Provider implements no slot interface version this weft supports (P102w: bound through an adapter) |
| `P103` | Plugin's `weft` peer range doesn't include the installed weft |
| `P104` | `requires` names a slot that nothing provides |
| `P105` | Cycle in `order.before`/`after` |
| `P106` | Two plugins' `transform` filters matched one module with no declared order |
| `P107` | Unfiltered `resolveId`/`load`/`transform`, or a `config` hook |
| `P108` | Plugin over its HMR budget share |
| `P109` | Undeclared permission used, or permissions widened since the lock |
| `P110` | Installed plugin integrity differs from `.weft/plugins.lock.json` |
| `P111` | Diagnostic code outside the plugin's namespace, or a namespace collision |
| `P112` | Plugin AGENTS section over 1 KB |
| `P113` | Token, catalog, compiler-data or Vite-config key collision |
| `P114` | Provider runtime code in an entry chunk (eager import) |
| `P115` | Invalid plugin options (Zod path given) |
| `P116` | Same plugin twice, or `name`/`version` does not match `package.json` |
| `P117` | `contribute()` is not pure |
| `P118` | Server code registered outside a server-side slot |
| `P119` | Provider failed its slot's conformance suite |
| `P120` | A weft plugin's `vite` part registered directly in `vite.config.ts` |

## Head and metadata

| Code | Catches |
|---|---|
| `H009` | A prop of an island is something JSON can't carry (a function, a Date, a class instance), found as the server renders |
| `H010` | An island has to load with the page for a reason its code could avoid: work that reaches past it, a module that runs as it loads, a box at module level, code the compiler can't see into. `.weft/hydration.json` says why for every island |
| `H017` | A prop on a component holds a function over local names, which can't cross to an island, so the component around it hydrates whole |
| `H001` | No `site.url`: a build has no absolute canonical, og:url or og:image, and a server takes them from the request's Host header |
| `H002` | Param route with an `auto` image on a static-only preset and no `prerender` (`weft routes --meta --preset static`) |
| `H003` | No description after merging the config, layouts and route (`weft check`, per route and on `site`) |
| `H004` | Title over 60 characters or description over 160 (search results and cards cut them) |
| `H011` | A page sets no `meta`, or leaves out its title or description: they come from what it renders (its `h1`, its first paragraph) or the site default |
| `H012` | Two routes have the same title |
| `H013` | Two routes have the same description, usually the site default |
| `H014` | A param route whose `meta` ignores `data` and `params`, or whose real pages all have the same title or description |
| `H015` | A written description that reads like code, a markdown fragment or a cut-off sentence |
| `H016` | A route `weft check` couldn't fully check: it failed here, or a param route with no page to sample |
| `H005` | `.og.tsx` uses a style or element the card renderer does not support (an error in dev; production drops the declaration) |
| `H006` | `meta` reads a box or calls a hook (metadata is plain data); found statically by `weft check` |
| `H007` | `meta` (or a card) reads a deferred (streamed) field of the loader's data: the request fails with 500 instead of a page with missing tags |
| `H008` | A card's `<img>` didn't load (timeout, HTTP error, not an image, too large, host not allowed); the card renders without it |

## Queries

| Code | Catches |
|---|---|
| `Q001` | `q()` (a live query, a Resource) called with no owner: in `load`, a handler, a timer or module scope |
| `Q002` | A query's or mutation's input failed its schema (400, with the issues and their paths) |
| `Q003` | `query`/`mutation` defined outside a server module: its `run` and imports would ship to the client (the build fails) |
| `Q004` | A mutation called while the server handles a GET (`load`, a page render, a query's `run`) |
| `Q005` | A server function's result doesn't survive JSON (`Date`, `Map`, `Set`, a class, `undefined` in an array, a function, `NaN`): the client sees another value |
| `Q006` | A cached (`cache: { life }`) query reads `ctx.request`, `ctx.response` or `ctx.user`: its value is shared by every user |
| `Q007` | `redirect()` after the page started streaming (a component's query): the status is already sent |
| `Q008` | A mutation `invalidates` a tag no query declares (`todo:*` covers `todo:${id}`): nothing refreshes |
| `Q009` | `/_weft/fn/<id>` names no function: the page is older than the server, or the module isn't a server module |
| `Q010` | A mutation request without the CSRF proof (POST, JSON, `x-weft: 1`, same origin): 403 |
| `Q011` | A function read or wrote a table its `tags`/`invalidates` don't name (dev): a mutation of that table won't refresh it |
| `Q012` | `@weft-js/start/db*` or `@weft-js/start/auth` reached the client graph |
| `Q013` | A database URL the driver can't open (a `postgres://` URL given to the SQLite entry, or the reverse) |
| `Q014` | The database doesn't match the schema: a table or column is missing |
| `Q015` | `src/db/schema.ts` changed since the last `weft db generate` |
| `Q016` | A request used the database while it was down, or a migration it needs failed (503; the server log has the driver's error). Pages that run no statements still serve |

## State

| Code | Catches |
|---|---|
| `S011` | `mutation({ optimistic })` updated a query its invalidated tags didn't cover: the prediction has no fresh value to land on (held until a refetch) |
| `S001` | A server object or array (`q().value`, `await q.fetch()`, or a map, filter or spread of one) copied into `state`: it goes stale and its rows lose their identity |
| `S002` | A `defineState` scope reached on the server outside a render (module scope, `load`, a server function, a timer): it would be shared by every request |
| `S012` | `state.linked` over a query value with no `key`: a refetch resets what someone is typing |
| `S013` | A `local` or `session` persisted box read in a server render: the page shows `init`, then flashes to the stored value |

## Forms

| Code | Catches |
|---|---|
| `F001` | `<Form of>` was given something that isn't a mutation |
| `F002` | A form POST without the same-origin proof (`Origin`, or `Sec-Fetch-Site: same-origin`): 403 |
| `F003` | A form POST naming no known mutation: the page is older than the server |

## Icons

| Code | Catches |
|---|---|
| `I001` | `<Icon name="as">`, or `Icons.As`, where no such icon exists |
| `I002` | An icon name only known at runtime, so that use loads the pack |
| `I003` | The icon pack used as a value, so all of it ships with the page |

## Auth

| Code | Catches |
|---|---|
| `A001` | The auth secret is missing or under 32 characters on a production server |
| `A002` | A function with `auth: 'user'` was called with no session (401) |
| `A003` | `auth: 'user'`, but `ctx` has no `user`: the context file never asked for the session |
| `A004` | A mutation changed the session cookie without a redirect: the tab keeps what the last session cached |
| `A005` | The database provider has no Better Auth adapter |

## Contracts

| Code | Catches |
|---|---|
| `C001` | A function's `input` or `output` schema can't become JSON Schema: the contract says `{}` |
| `C002` | A function's value failed its `output` schema (dev and tests) |

## Realtime

| Code | Catches |
|---|---|
| `R001` | `channel` or `sharedState` without `authorize` (`weft check`, `weft build`, and thrown at definition) |
| `R002` | The memory bus on a multi-instance preset, or `durableObjectBus` outside `cloudflare_durable` (`weft build` fails): a message reaches one instance's clients |
| `R003` | A mutation wrote a table a live query reads, and their tags don't intersect (dev): open pages won't update |
| `R004` | A wildcard in `realtime({ origins })`, or a hand-written WebSocket handler (`crossws`, `defineWebSocketHandler`) that skips the Origin check: any site could join with a visitor's cookies |
| `R005` | A stream's `input`, a channel's `params` or client messages, or a shared key or value has an unbounded string or array (`weft build`): a client decides how much the server holds |
| `R006` | A stream's `run` read the database before it subscribed to a topic (dev): what's published in between is lost |
| `R007` | `ws`, `socket.io-client`, `reconnecting-websocket` or `@microsoft/fetch-event-source` in dependencies: weft owns the connection |
| `R008` | A message over 1 MiB, a request or socket frame over 64 KiB, or a client over the channel rate limit (20 messages a second) |
| `R009` | Over 100 subscriptions or joins on a connection, or 10 connections or sockets for a user |
| `R010` | An origin that isn't the app's own or in `realtime({ origins })` tried to open a connection |
| `R011` | A channel's `authorize` refused a join or a write (the status is `unauthorized`), at the join or a session re-check |
| `R012` | A live query reads a table `changes` reports and no tag names it, or a table `changes` doesn't list (dev): writes from outside the app won't refresh it |
| `R013` | A query marked `live: { required: true }` on a target that can't deliver a change feed: a functions preset with no external listener, or no `changes` at all (`weft check`, `weft build`, `weft doctor`) |
| `R014` | `changes` on a preset with no long-running process: writes from outside the app won't reach `.live()`, which shows `degraded` |
| `R015` | A required live query, and the server's startup probe found no real change feed (a pooler, no trigger, no trigger permission, a Mongo without a replica set): the server stops rather than serve stale data, and dev answers 503 |
| `R016` | The server settled on a degraded live mode (`poll` or `off`), or a working feed went down: `.live()` shows `degraded` or `reconnecting` |
| `R017` | `dbChanges` on a client it can't watch or something that isn't a table, or `weft db listen` on the memory bus, which stops at that process |
| `R019` | A query's `live: { verify }` round trip failed against its target (`weft check`, `weft build`): the message names the link that broke, from `trigger` to `cleanup` |
| `R020` | A connection string with a password in source, in a `verify` or a target: it would be committed |
| `R021` | A `verify` target isn't available here: fails `weft build`, and `weft check` warns and skips |
| `R022` | A `verify` target that looks like production, or that nothing marks as not: a round trip writes rows |
| `R023` | A `verify` passed with only one kind of target, so some links went untested |
| `R024` | A `channel` or `sharedState` built for a target that can't hold a WebSocket (Netlify, Vercel, AWS Lambda): `weft build` fails, and where it is let through the page never dials, the channel's `status` is `unavailable` and a send rejects with R024 |
| `R018` | A table in `changes` that no migration gives a change trigger (`weft check`, `weft build`): the server would fall back to polling |
| `R101` | A function with `impl` has no `output`, a type JSON can't carry (`z.date()`, `z.bigint()`, `z.void()`, `z.custom()`), or a one-way `.transform()` on its input (`weft build`, `weft check`, `weft dev`) |
| `R102` | A plain `z.union` of objects in a function with `impl`: it has no tag, so Rust can't tell its arms apart reliably. Scalar unions and `.nullable()` are fine |
| `R103` | A sidecar doesn't match the contract: cargo stops where a generated type or method no longer fits (with the function's id), a binary built from another contract, an output the `output` schema rejects, or input serde refuses |
| `R104` | `native()` on a preset that can't run it (no file system for an addon or a `.wasm`), on a preset with no WASM when `wasm: false` is set, or a `.wasm` that won't build (a warning on a preset the addon runs on). At run time, a build with neither for this platform (503) |
| `R105` | A cached Rust query with `tags` that reports no table (`weft check` reads the method; `weft dev` sees the call): Q011 can't see into Rust, so nothing checks that the tags cover what it reads |
| `R106` | A `remote()` call can't be made: no address, no `WEFT_RUST_SECRET`, or the sidecar refused the signature (503) |
| `R107` | A sidecar didn't answer, or ran past the deadline (503, 504). Only that function fails |
| `R108` | A sidecar function panicked or returned an undeclared error (500). The detail stays in the sidecar's log, under the request id |
| `R109` | A sidecar doesn't build for a reason no contract function explains: a compile error, no crate, or no `cargo` |

## Surfaces and fonts

| Code | Catches |
|---|---|
| `X001` | `s.text()` predicted one height and its DOM mirror renders another: `font`, `lineHeight` or `width` differs from the CSS |
| `X002` | `system-ui`, `-apple-system` or a generic-only family on a measured `s.text()`: canvas and CSS can resolve it differently (also checked in dev, for fonts that come from CSS) |
| `X003` | `s.text()` prepared while its font isn't loaded and no `"<Family> Fallback"` face exists: it's measured on another font until the swap |
| `X004` | A surface text mirror uses a style line breaking can't predict: `text-wrap: balance\|pretty`, `hyphens: auto`, `word-spacing`, `letter-spacing`, `font-feature-settings`, `font-variant-numeric`, `font-variation-settings` |
| `X005` | `font-size` in `vw`/`vi`/`cqi`/`cqw` with no `rem` term: zoom and the user's font size don't change it (WCAG 1.4.4) |
| `X006` | A fluid `clamp()` font size whose max/min is over 2.5: 200% zoom no longer doubles it |
| `X008` | Viewport meta with `user-scalable=no` or `maximum-scale` under 2: blocks pinch zoom |
| `X009` | `<Surface>` with neither `label` nor `decorative`: a screen reader finds an unnamed image |
| `X010` | `fillText` or `strokeText` in a surface: text only the canvas knows, with no selection, find, translation or screen reader |
| `X011` | A surface text mirror hidden from assistive tech: `aria-hidden` on `<Surface>` or `s.el`, or `display: none`/`visibility: hidden` on `[data-surface-text]` (also checked in dev) |
| `X012` | CSS that defeats a surface's text fallback: `forced-color-adjust: none`, or a print rule hiding `[data-surface-text]` |
| `X020` | A hand-written `@font-face` for a local file with no `"<Family> Fallback"` face: the font swap shifts layout |
| `X021` | `font-display: block` or `auto`: text is invisible while the font loads |
| `X022` | A local `@font-face` without `unicode-range` (not subset), or the font build's preloads over the 100 KB budget |
| `X023` | A `<link rel="preload" as="font">` whose file no `@font-face` uses |
| `X030` | `<img>`, `<video>` or `<iframe>` without `width`/`height` or `aspect-ratio` inside a `<Boundary>`: it lands at 0 px and pushes content down |
| `X031` | A `pending` fallback whose box differs from the content's by more than 1 px at the swap (measured by `<Boundary>` in dev) |
| `X032` | A skeleton repeats a list with no count hint: no `limit` input, no `.max()` on the array, nothing seen yet. It shows 5 rows, so the swap can shift |
| `X033` | `x.pending` renders a skeleton or spinner with no check that `x` has no value: every refetch flashes it |
| `X034` | A `pending` fallback with its own `setTimeout`/`setInterval`: `<Boundary>` already owns the 150 ms / 400 ms timing |
| `X040` | Per-grapheme DOM spans over a string known to exceed 200 graphemes |
| `X041` | Per-character spans without `aria-hidden`, or a parent with no accessible name: a screen reader spells the word out |
| `X035` | Streamed text written straight into a scroll container: a reflowing tail moves the lines above it |
| `X036` | A skeleton shows a string from `output` with no length hint, so its bar is a guess |
| `X037` | A `resource` or query made in the component that renders the `<Boundary>` meant to wait for it, and read inside it: the Boundary only waits for what its children make, so no fallback shows |

## Media

| Code | Catches |
|---|---|
| `M001` | Raw `<img>`/`<video>` without `width`/`height` or `aspect-ratio`, outside a `<Boundary>` (inside it is X030) |
| `M002` | An image rendered through a `?url` import or a string path, bypassing the optimizer |
| `M003` | A raw `<img>` whose file is wider than its `width` × 2 (DPR) × 1.25: bytes nobody sees |
| `M004` | A GIF over 256 KB rendered raw |
| `M005` | `<video autoplay>` without `muted`: browsers block it, and sound before a gesture is hostile |
| `M006` | `<video>` without `poster`: a blank box until the first frame decodes |
| `M007` | Missing `alt` on `<Media>`/`<img>`, `<Media alt="">` without `decorative`, or `alt` equal to the file name |
| `M008` | A route's first media is `loading="lazy"`, or `priority` media is lazy: the likely LCP image loads late |
| `M009` | `priority` on more than 2 media in one route: they compete for the first bytes |
| `M010` | A `priority` `<Media>` without `width` or `sizes`: eager images can't use `sizes="auto"`, so the browser assumes 100vw |
| `M011` | `<video autoplay loop>` without `controls`, or a GIF in a raw `<img>`: endless motion with no pause (WCAG 2.2.2) |
| `M012` | An SVG with `<script>`, `foreignObject`, `on*=` handlers or external references, used as an image |
| `M013` | A file in `public/` referenced by string: untracked, unoptimised, no dimensions |
| `M014` | What `encoder: 'compatible'` adds to the build for compatible copies |
| `M015` | An HDR or over-8-bit video that comes out 8-bit SDR |
| `M016` | `<Media src>` given a string: nothing knows its size before it loads, so the page shifts |
| `M017` | `ctx.media` or a `/_weft/m/` URL used with no `media.server` provider |
| `M019` | ffmpeg did not run, is not the pinned binary, or has no encoder for a codec |
| `M018` | An upload refused: it isn't an image weft can read, or it's over the size limit (422) |
