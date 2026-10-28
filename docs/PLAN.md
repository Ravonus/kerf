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
7. **Small.** Target ≤ 6 KB gz runtime, Solid/Marko-class speed. A goal, not a v0 gate.

## 3. The language: TSX with weft semantics

### 3.1 Primitives (the whole reactive API)

| Primitive | Job |
|---|---|
| `state(init)` → `State<T>` | Writable box. Read/write `.value`. Deep updates: `.set(draft => { draft.push(x) })`. |
| `state.linked(() => expr)` | Writable, but resets whenever `expr` changes. For "local copy of a prop" (editable form defaults, optimistic values). |
| `derived(() => expr)` → `Derived<T>` | B = f(A). Pure, lazy, cached, read-only. **The default tool.** Async functions are rejected; use `resource`. |
| `resource(async (signal) => …)` → `Resource<T>` | Async derived: `.value .pending .error .refresh()`, cancels via AbortSignal. Server queries return these. |
| `watch(() => source, (value, prev) => cleanup?)` | Side effects only (DOM APIs, logging, imperative libraries). Source phase tracked, callback not. |
| `onMount(fn)` / `onCleanup(fn)` | Element access and teardown. |
| `context<T>()` | Typed dependency injection. |
| `flush()` | Apply pending DOM updates now (`open.value = true; flush(); input.focus()`). Also used by tests. |
| `untrack`, `batch` | Rare escape hatches. |

There's no separate `store`. One box type holds everything, including arrays and objects; lists are fine-grained
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

`class`/`className`, `for`/`htmlFor`, and `style` as object or string are all accepted.

### 3.6 Compiler, runtime, tooling

- **Compiler:** fork Solid's JSX compiler (`babel-plugin-jsx-dom-expressions`, MIT; keep NOTICE, track upstream).
  It already does template cloning, fine-grained bindings, getter props and hydration keys. weft adds: §3.3
  props rewriting, §3.4 lowering, §3.5 diagnostics, dev graph naming. Port to oxc only if build speed demands it.
- **Runtime:** signals core, DOM bindings, keyed reconciler, SSR string renderer, hydration (dom-expressions keys).
- **Async/errors in markup:** `<Boundary pending={…} error={(e, retry) => …}>`.
- **Types:** a `JSX` namespace for weft (intrinsics, `key`, typed `currentTarget` on events, box/value assignability).
- **HMR:** state preserved across edits by the compiler-assigned names (the solid-refresh approach).
- **Testing:** `weft/test` gives `render()`, `flush()`, and DOM queries for vitest.
- **Vite plugin:** one `weft()` plugin runs the compiler and, when present, the server-function and token transforms.

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
- **`create-weft`:** flag-driven CLI (db, auth, deploy target, styling). Writes AGENTS.md and MCP config.
- Later: ISR/static routes, `updateTag`, per-user cache scope.

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

## 7. Agent layer (ships with the core, not after)

- **AGENTS.md** docs index under 8 KB, always present. Vercel measured passive docs beating skills (100% vs 79%).
- **`weft check --json`:** every W/D diagnostic plus mapped TS errors, with code, location, why, fix.
- **MCP server** (`weft mcp`): `docs`, `check`/`fix`, `catalog`. Later: `inspect` (live dev graph), `scaffold`.

## 7b. Testing, browser control, and one project CLI

Details and sources: [05](research/05-testing-browser-cli.md). The principle: one binary (`weft`), one manifest
(`weft.config.ts`), and one query vocabulary (role/label/text) shared by tests and the agent browser. Diagnostics go
into the same catalog: `T0xx` for tests and `P0xx` for project hygiene.

**`weft test`: tests that can't be junk.**

- **Authoring:** `weft/test` gives `render`, user-level queries only (`getByRole/Label/Text`), and `user.click/type`.
  Every action ends in `flush()`, so there's no `waitFor` guessing. A deterministic `clock` drives timers, `resource`
  and rAF. Snapshots are off; opt-in aria snapshots are allowed. `test.prop` comes from fast-check for property tests.
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
  weft        runtime + compiler + vite plugin + test utils + CLI (check, test, browser, tasks, mcp, create)
              subpaths: weft, weft/compiler, weft/vite, weft/test, weft/config
  start       routing, server functions, cache, Nitro integration   (weft/server, weft/db)
  ds          tokens, layout primitives, components, Tailwind adapter
  surface     defineSurface, canvas2d, webgl2; keel subpath
evals/        agent eval harness
```

## 9. Phases

| Phase | Ships | Exit check |
|---|---|---|
| **0. Eval** | 6 tasks, one per root cause (stale snapshot, effect-as-derivation, invisible tracking, context-dependent magic, scheduling, silent failure). PROMPT.md + hidden vitest. Baselines in React 19 and Solid, 5 samples each. | Baseline pass@1 and failures tagged by cause. |
| **1. Core + agent layer** | Client-only runtime, compiler, §3.5 diagnostics, `weft/test` + T001–T009, HMR, `weft.config.ts` + `weft tasks --json` + P-codes, generated AGENTS.md, `weft check --json`, MCP `docs`/`check`/`tasks`. | Agent pass@1 on weft beats both baselines. Every eval failure maps to a W-code, or becomes a new one. |
| **1b. Verify loop** | `weft browser` daemon + graph overlay + recorder, test gate (fail-before, diff-scoped mutation, T020). | The gate accepts every eval reference test and catches planted junk tests (tautologies, implementation-detail, no-fail-before). |
| **2. Surfaces** | `defineSurface`, canvas2d, webgl2, Keel port. | A Keel demo ported; an agent adds a surface to a page from a one-line request. |
| **3. Start** | SSR + hydration, routing, `query`/`mutation`, tagged cache, Drizzle, Better Auth, `create-weft`. | A T3-equivalent todo + auth app scaffolded and extended by an agent. |
| **4. Design** | `weft/ds` tokens, primitives, Tailwind adapter, D-checks. | weft/ds vs raw Tailwind on consistency and a11y. |

Performance (js-framework-benchmark, bundle size) is tracked from Phase 1 but isn't a gate until after Phase 3.

## 10. Out of v0

Server components, partial prerendering, resumability, a custom file format or new syntax, GraphQL, local-first
sync, native targets, Zag/headless library adapters, ISR, automatic cache tags, our own CSS engine.

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

## 11. Open questions

- **`.value` in JSX:** required everywhere (current) or auto-read? Settle with the eval.
- **Solid compiler fork vs fresh oxc transform.** Fork first.
- **Nitro v3 is beta.** Pin it; h3 v2 is the fallback.
- **Name.** "weft" is a placeholder.

## 12. Decision log

- **Getter props over Ripple-style plain props.** Research 01 recommended Ripple 0.4's plain props with `Live<T>`
  types. We chose compiler-made live props because agents will write `count={count.value}`, and only live props make
  that correct without type-directed compilation. The holes this opens are closed by §3.3 and W001/W005/W006.
- **TSX, not new syntax** (`@if`, `.tsrx`). Training-data volume dominates agent accuracy (Web-Bench). We take the
  cost of React-shaped bugs and pay it in diagnostics (rule 2).
- **No `store`.** `state` + `.set(draft)` covers deep updates; two containers broke "one way".
- **Explicit cache tags first**, with a dev check, instead of instrumenting Drizzle (joins, raw SQL and transactions
  make auto-tags silently wrong).
