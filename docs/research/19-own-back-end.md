# 19 — weft's own compiler back end (design)

Research date: 2026-10-29. Status: **built** (§5.1–§5.7). weft's back end is the only one; `solidjs-compiler` is gone from the build. Decision: PLAN §3.6 and §12 ("weft owns its code
generator"). Numbers marked **(measured)** were run for this doc.

**The task.** Replace Solid 2's `solidjs-compiler` crate, which turns the pre-pass's AST into DOM and SSR code, with
a back end weft designs and owns. Done means:

- the v3 hidden tests and every `packages/weft` test pass on the new back end;
- the SSR round trip still makes 0 mismatches and 0 DOM writes;
- the §3.7 size and js-framework-benchmark gates still hold;
- then `solidjs-compiler` is removed from `Cargo.toml`.

Solid can stay as a benchmark comparison and as a test oracle during the switch. It is never a dependency.

---

## 1. What we're replacing, measured

- **Solid's crate:** 40,463 lines of Rust. Its DOM and SSR emitters (`src/dom`, `src/ssr`) are 10,092 lines.
  Upstream's fixture corpus has 101 cases **(measured)**.
- **weft's crate:** 1,213 lines. `analyze`, `transform`, `diag` and the binding are weft's; `lib.rs` hands the AST
  to `compile_program` **(measured)**.
- **What weft code actually uses.** Compiling all 23 `.tsx` files in the repo (the v3 app, the test fixtures and
  the bench fixtures) gives **(measured)**:
  - **DOM, 12 helpers:** `template insert createComponent delegateEvents memo effect setAttribute For render
    setProperty addEvent hydrate`;
  - **SSR, 11 helpers:** `ssr ssrHydrationKey escape scope memo ssrAttribute ssrGroup For render ssrSelectValues
    hydrate`.
  - Solid's full surface is about 30 DOM helpers and 19 SSR helpers. The gap is mostly features weft doesn't have or
    want yet: spreads in several forms, link claims, `textContent` props, wrapperless modes and the `prop:`/`attr:`
    namespaces.

## 2. Design goals (agent-first)

1. **weft defines and versions the helper set.** It is one module that both emitters target, with an ABI version
   that the compiled output checks in dev. No contract test against someone else's output.
2. **One lowering per construct,** listed in a table that is also the docs (§3). An agent, or `weft explain
   file:line`, can say what any JSX line becomes.
3. **One IR, two emitters.** JSX lowers once to a template IR: static HTML, plus typed holes for text, attributes,
   properties, events, children, components, lists and conditionals. A DOM emitter and an SSR emitter print it. The
   server and the client can't drift, because they come from the same holes in the same order.
4. **Hydration keys from source position, not from the runtime's owner tree.** Today a key depends on how many
   memos and roots exist at runtime (research 18 §3). Wrapping a hole in a memo shifts every key after it, and a
   mismatch can only report `_hk=2A3`. Instead:
   - A key is a path. Each step is the component instance's slot (a compile-time index within its parent's
     template), plus the list item's `key` for rows.
   - Example in dev: `App:3/ProductList:0/row:apple/1`. In prod it's the same path, hashed to short ids.
   - Memos, effects and `scope()` no longer matter, so the runtime drops `childKey`, `rt.ids`, the transparent flag
     and `scope`.
   - A mismatch reports "ProductList.tsx:29, row `apple`, slot 1: server `<span>`, client `<em>`".
5. **Markers weft chooses.** Text and child holes need boundaries for hydration. Use one comment pair per dynamic
   child range (`<!--[-->` … `<!--]-->`), and nothing where a hole is an element's only child. The format is
   documented and owned by weft.
6. **Readable output.** Dev output names its helpers in full and carries a `// src/App.tsx:12 <li>` comment per
   template. Prod output is minified by the bundler, not by the compiler.
7. **No speed regression.** Templates are still cloned, bindings are still grouped per element, and events are still
   delegated: the ideas that make this design fast. These are general techniques (Solid uses them, as do Svelte,
   Vue Vapor and Ripple), not borrowed code.

## 3. Lowering table (v1)

| JSX | IR | DOM | SSR |
|---|---|---|---|
| element tree | `Template { html, slots }` | `const t = tpl("<li>…")`, `clone(t)` + walk path | static string parts |
| static attribute | inlined in `html` | — | — |
| dynamic attribute, `class`, `style` | `Attr(el, name, expr)` | one `bind(el, () => [a, b], apply)` per element | `attr(name, v)` |
| DOM property (`value`, `checked`) | `Prop(el, name, expr)` | inside the element's `bind` | `attr` (first paint) |
| `onX={fn}` | `Event(el, name, expr, delegated)` | `on(el, name, fn)` (delegated list in the runtime) | — |
| `{expr}` text or child | `Child(range, expr)` | `child(parent, () => expr, marker)` | `esc(v)` + markers |
| `<Comp …/>` | `Component(slot, props)` | `component(Comp, props, slot)` | same call |
| `xs.map(x => <Row key={x.id}/>)` (pre-pass) | `List(range, each, key, row)` | `list(parent, each, key, row, marker)` | `list(...)` resolving rows |
| `cond ? <A/> : <B/>`, `&&` | `Child` with a memoised condition | `child` | `esc` |
| `{...spread}` | `Spread(el, sources)` | `spread(el, sources)` | `spreadAttrs(sources)` |
| `ref={fn}` | `Ref(el, expr)` | `ref(el, fn)` | — |
| `<select value>` | `Prop` + select hint | in `bind` | `select(...)` marks the option |
| SVG / MathML | `Template { ns }` | `tpl(html, ns)` | same |

That's 14 helpers, about the size of what weft uses today, and every one has a single job. Anything that isn't in
the table is a compile error with a W-code. It doesn't silently fall back.

## 4. Runtime changes

- `weft/dom` gets the helpers in §3. The current names (`insert`, `effect`, `template`, `getNextElement`,
  `getNextMarker`…) are dropped at the switch, along with `ssr-contract.test.ts`.
- `weft/ssr` gets the same helpers in string form. `renderToString`, `renderToStringAsync`, the page-data script,
  `resource` and `Boundary` keep their research 18 behaviour.
- Hydration claims by path key (§2.4). Boundary's two reserved ids become two fixed slots: content and fallback.
- The reactive core loses its id hooks (`rt.ids`, `childKey`, `hk`/`hc`, transparent flags). That gives back about
  0.2 KB br.

## 5. Plan and gates

| Step | What | Done when |
|---|---|---|
| 1 | IR and DOM emitter for templates, attributes, events, text and components | hello, counter and the bench entry run on it; `?weft-next` imports select it in tests |
| 2 | Lists, conditionals, spreads, refs, select, SVG; the pre-pass emits IR holes instead of Solid-shaped JSX | the v3 app passes 23/23 hidden tests and every work-budget test on the new back end |
| 3 | SSR emitter, path keys, hydration | `ssr.test.ts` and `async.test.tsx` pass: 0 misses, 0 DOM writes |
| 4 | Dev comments, `weft explain` | the corpus oracle (below) passes |
| 5 | Switch the default, delete `solidjs-compiler`, update PLAN §3.6 / research 16 | every gate in §3.7, js-framework-benchmark ≤ 1.10× Solid in the same run |

### 5.1 Step 1, done (2026-10-29)

- **Compiler:** `crates/weft-compiler/src/emit.rs`, about 700 lines. Select it with `backend: "weft"` (napi
  options), `weftc --backend weft`, `weft({ backend: 'weft' })`, or a `?weft-next` import. After the pre-pass, the
  program is printed with `oxc_codegen` and parsed again. Each outermost JSX node is then replaced by its lowering,
  and JSX inside expressions is lowered the same way. There's no IR type yet: this step emits straight from the
  JSX. The IR gets its own type in step 3, when the SSR emitter needs to share it.
- **Runtime:** `src/dom-next.ts` has `tpl bind attr cls css on delegate child component`. For now they're thin
  wrappers over the dom.ts machinery (`insert`, `addEvent`); they get their own bodies when hydration by path key
  lands (step 3).
- **Tests:** `test/next.test.tsx` renders hello, counter, a construct panel (attributes, class and style objects,
  properties, events, text with entities, components with getters and children, fragments, a ternary over JSX) and
  the js-framework-benchmark app. It renders each with both back ends, runs the same interactions, and checks that
  the DOM matches after every step (comments, attribute order and class order excluded). 61/61 package tests pass.
- **Size (br), Solid's back end → weft's:**

  | App | Solid's | weft's |
  |---|---|---|
  | hello | 1.17 KB | 1.17 KB |
  | counter | 1.93 KB | 2.03 KB |
  | benchmark app | 3.22 KB | 3.27 KB |

  The extra comes from the per-template IIFE and from walk variables that are declared and never used. Step 2
  trims both.
- **Not yet:** element spreads, namespaced attributes and SVG fail with a weft-back-end diagnostic rather than
  falling back silently. There's no source map and no SSR output. js-framework-benchmark has not been run on this
  back end; that's step 5's gate.

### 5.2 Step 2, done (2026-10-29)

- **Gate met:** the v3 reference app passes 23/23 hidden tests on weft's back end, and the probe shows 1 DOM
  mutation for add-one and for price-push (`evals/results/v3-next`). All 66 package tests pass on both back ends
  (`WEFT_BACKEND=weft npx vitest run`), including every v3 work-budget test.
- **Added:**
  - conditionals over JSX read their condition through a memo, so a branch rebuilds only when the condition
    flips;
  - element spreads go through one `mergeProps` object and the `spread` helper. Later attributes win, sources stay
    live, and handlers become listeners that are swapped when they change;
  - `ref={el}` assigns the variable and `ref={fn}` (or an array) calls it;
  - `<select value>` is applied after its options are inserted;
  - an SVG element outside an `<svg>` gets its own template mode, and `xlink:`/`xml:` attributes keep their
    namespace;
  - `value={x}` writes `x ?? ""`;
  - walk variables are declared only for nodes that something uses.
- **Lists** need nothing new. The pre-pass's `<For each by>` lowers as a component. Changing the pre-pass to hand
  over a `List` hole instead of Solid-shaped JSX moves to step 3, where the IR gets its own type.
- **A trap found along the way:** Vitest's on-disk module cache (`node_modules/.vitest-cache`) keys on the lockfile
  only. It served stale output after native rebuilds, and served one back end's output to the other.
  `packages/weft` and `evals/frameworks/weft` now key it on the back end and the compiler binary's build time.
- **Size (br):**

  | App | Solid's | weft's |
  |---|---|---|
  | hello | 1.17 KB | 1.19 KB |
  | counter | 1.93 KB | 2.05 KB |
  | benchmark app | 3.22 KB | 3.37 KB |

  "Runtime (every export)" is 5.73 KB against its 6 KB target (the gate is 10 KB) while both helper sets ship. Step 5 removes the
  Solid-shaped set.

### 5.3 Step 3, done (2026-10-29)

SSR and hydratable output now come only from weft's back end. Solid's crate is left only for plain DOM output, until
step 5.

**Keys (`src/keys.ts`).** A template instance's key is its place in the source tree:

| Key | What it names |
|---|---|
| `<scope><n>` | the n-th template, Boundary or resource created directly in a scope |
| `<key>.<slot>/` | the scope of hole `slot` (a compile-time index) of the template keyed `key` |
| `<scope><row>/` | the scope of a `For` row, by its own key (escaped) |
| `<key>c/`, `<key>f/` | a Boundary's content and fallback |

For example, `0.1/0.1/apple/0` is the first template of row `apple`, in hole 1 of the template in hole 1 of the
root. Keys are computed only during a server render and during `hydrate()`'s synchronous pass. Memos, effects and
owners take no part. A test (`client-only watchers and extra memos shift no key`) adds a watcher and memos on the
client only and still hydrates with 0 misses.

**Server output.** A template renders as `ssr((_k) => "<li" + key(_k) + … + hole(_k, 2, () => …) + "</li>")`. The
root gets ` wk="<key>"` when the output is hydratable. A hole that shares its parent with other content is wrapped
in `<!--[-->…<!--]-->`; a hole that is its element's only content has no markers. Adjacent texts in one hole get a
`<!--,-->` between them, so the client finds one text node per value. `<select value>` keeps research 18's
post-pass, which marks the matching `<option selected>`.

**Client (hydratable output).**
- `tpl()` claims the server element with the next key (checking its tag). A miss is counted, warned about in dev,
  and rendered fresh.
- The walk uses `first`/`next`, which step over a server range as if it were the template's single `<!>`.
- `child` takes the nodes in its range. It reuses claimed elements and server text nodes, and keeps separators.
- `bind` and `spread` skip their first write, because the server wrote it; handlers and refs are still attached.
- Structure in a hole (elements, components) is passed as `() => …`, built once inside the hole's scope.

**Removed from the core:** `rt.ids`, `childKey`, `hk`/`hc`, the transparent flag, `createRoot`'s key, `scope()`,
`runWith`, the `getNext*` helpers, Solid's SSR helper set and `ssr-contract.test.ts`.

**Tests.**
- `ssr.test.ts` and `async.test.tsx` pass with 0 misses and 0 DOM writes. Only their format-specific assertions
  changed (`wk="…"` for `_hk=…`, `<!--[-->` for `<!--$-->`).
- New round trips cover the step 1–2 constructs: adjacent texts, fragments, class and style objects, conditionals,
  element spreads, refs, `<select value>` over a list, and SVG.
- 69/69 package tests pass on both back ends, and v3 passes 23/23 hidden tests on both.

**Size (br).**

| Bundle | Size |
|---|---|
| v3 shop app (hydrate) | 4.71 KB (was 4.30 KB on Solid's back end) |
| hello, Solid's back end | 0.99 KB (the old hydration code left dom.ts) |
| counter, weft's back end | 2.39 KB |
| benchmark app, weft's back end | 3.80 KB |

weft's back-end bundles gained about 0.4 KB: `child`'s claim path ships in client-only builds too. It could be
split out to tree-shake. "Runtime (every export)" is 5.90 KB against the 6 KB target (10 KB gate) while both helper sets ship; step 5
removes Solid's.

**Not yet:**
- a spread's `children` on the server;
- `textContent`/`innerHTML` props on the server (the client writes them);
- mismatch messages that name the source line (done in step 4, §5.4).

### 5.4 Step 4, done (2026-10-29)

**Source lines.** The pre-pass reprints the program, so printed spans no longer point at the author's file. Before
printing, the compiler records each JSX node's authored line and column in pre-order. After re-parsing it pairs them
with the printed nodes in the same order, and uses them only when the counts match; otherwise nothing is mapped.
Paths are shown relative to the working directory.

**Dev output** (`dev: true`; Vite's dev server turns it on).
- Each template gets a comment, and `tpl` gets its place:
  ```js
  // test/fixtures/next/Basics.tsx:12 <button>
  const _t2 = _$tpl("<button><!> × 2 = <!></button>", false, "test/fixtures/next/Basics.tsx:12 <button>")
  ```
- Server output prefixes each template with `/* file:line <tag> */`.
- Production output has neither.

**Hydration warnings** name that place:
> weft: hydration mismatch at test/fixtures/next/Basics.tsx:12 \<button> (wk=0): the client renders \<button>, the
> server rendered \<p>; rendering it fresh

A key with no server element gets a "key miss" warning in the same form. Server elements nobody claimed are counted
in one warning at the end.

**`weftc --explain file.tsx:LINE`** prints what each JSX node starting on that line becomes, template included:
```
test/fixtures/next/Basics.tsx:12:10 <button> becomes:
  const _t2 = _$tpl("<button><!> × 2 = <!></button>");
  (() => { const _e2 = _t2(); … _$on(_e2, "click", () => count.value++, true); _$child(_e2, () => (count.value), _e3); … })()
```
`--json` gives the same entries as `{ line, column, node, code }`, and `Options::explain` returns them from the
library. This is for agents asking "what does this line cost": one template clone, one listener and two text holes
here.

**Corpus oracle** (`test/oracle.test.tsx`). Each case is rendered three ways:
1. Solid's DOM back end;
2. weft's DOM back end (`?weft-next`);
3. weft's server render, hydrated (`?weft-ssr` + `?weft-hydrate`).

Hydration must give 0 misses, 0 DOM writes and no warnings. The three DOMs must then match after mounting, and again
after each scripted step (click each button, type into each input, flush). The comparison ignores comments, `wk`,
attribute order, class order and style whitespace, and reads form values as properties.

The cases are:
- the repo's fixtures (Basics, Step2, the benchmark app, the v3 shop with a cart);
- 40 generated components (`scripts/gen-corpus.mjs`, run by `test/oracle.setup.ts` into a git-ignored folder).

48/48 pass on both back ends. The benchmark app's `Math.random` is seeded per root, and its "10,000 rows" button is
skipped for time.

**One case where Solid is wrong.** A component that returns `<circle>` outside `<svg>` (Step2 `Icon`): Solid's DOM
output nests it as `<svg r="2"><circle>`. weft's is correct (`tpl(html, true)`). That case compares weft's two renders
only.

**Tests.** 118 package tests pass on both back ends, and the compiler's 32 integration tests pass. New tests cover
`explain`, dev comments (and their absence in production) and the source-line warning.

**Size.** No runtime change beyond the warning text, which dev builds only. Runtime is 5.90 KB br (gate 10 KB, target
6 KB). v3 hydrate is 4.71 KB and hello is 0.99 KB.

**Corpus oracle (test only).** Built in step 4 (§5.4). Since step 5 it checks against Solid's recorded output
(§5.5).

**Estimate (unverified):** 3–5k lines of Rust for the IR and both emitters, since they cover weft's constructs only.
Two to three weeks of focused work.

### 5.5 Step 5, done (2026-10-29): the switch

**What changed.**
- `solidjs-compiler` is removed from `Cargo.toml` and the lockfile. `compile()` has one path: pre-pass → print →
  `emit`. The `backend` option, `weftc --backend`, `weft({ backend })`, `WEFT_BACKEND` and `?weft-next` imports are
  gone.
- `Options::source_names` is gone. Dev builds pass each component's name and `file:line` to `component()`, which is
  what `<Boundary>`'s "caught an error in <Comp> (file:line)" reads.
- `weft/dom` no longer exports Solid's helper set (`template`, `setProperty`, `setStatefulProperty`, `readShallow`,
  `setStyleProperty`, `addEventListener`, and the `effect`/`untrack` re-exports). `insert` lost its dev-names option.
- `test/next.test.tsx` became `test/back-end.test.tsx`. Its side-by-side comparisons with Solid became direct
  assertions; for example, the benchmark test now checks each operation's effect (1,000 rows, the selected row, every
  10th label, the swapped rows, the removed row, the appended rows, an empty table).

**Source maps.** Solid's crate wrote the source maps, so weft's back end needed its own. `emit` builds its output from
slices of the printed program. `splice`, the only function that copies printed text, wraps each slice in
private-use markers that record where it came from:
- a verbatim copy maps every position through oxc_codegen's printed → authored map;
- a lowered JSX node maps each of its generated lines to the node.

One pass (`src/srcmap.rs`) strips the markers and writes the composed map. A Rust test checks five positions
(a module-level binding, a setup call, a handler body, a text hole and the lowered element) against their authored
lines.

**The oracle without Solid.** Before deleting the crate, I recorded Solid's normalized DOM for every oracle case after
mount and after each scripted step: 47 cases, 147 snapshots, with long ones stored as SHA-256 hashes. The file is
`test/oracle.golden.json` (100 KB). The oracle now checks four things for each case:
- weft's DOM output matches that recording, step for step;
- the hydrated server render matches weft's DOM output;
- hydration has 0 misses;
- hydration makes 0 DOM writes.

A change to a fixture or to the script needs a reviewed edit of the golden file; Solid can't re-record it.

**Gates (PLAN §3.7), measured 2026-10-29** on this Mac (1-minute load 7–9):

| Gate | Budget | Now | Before (Solid's back end) |
|---|---|---|---|
| Runtime, every export | ≤ 10 KB br, aim 6 KB | 5.77 KB | 5.90 KB (both helper sets) |
| hello world | ≤ 3 KB br | 1.16 KB | 0.99 KB |
| v3 shop app | ≤ 10 KB br | 4.49 KB | 3.80 KB |
| v3 shop app (defineState) | ≤ 10 KB br | 5.17 KB | 4.53 KB |
| v3 shop app (hydrate) | ≤ 10 KB br | 4.70 KB | 4.71 KB |
| benchmark app | — | 3.79 KB | 3.80 KB (already weft's) |
| v3 hidden tests | 23/23 | 23/23 | 23/23 |
| v3 price-push / add-one | ≤ 1 mutation / ≤ 3 | 1 / 1 | 1 / 1 |
| Compiler, 1k files | ≤ 0.5 s | 158 ms native, 178 ms napi | 193 ms, 236 ms (research 16) |
| `weft check`, 1k files | ≤ 3 s cold | 20 ms native, 23 ms napi | 20 ms |
| Prod build, 1k components | ≤ 5 s | 0.8 s (client 0.46–0.52 s + SSR 0.34 s) | not measured |
| Prod output | no dev names | none (`tsx:` and markers absent from the benchmark bundle) | — |
| HMR, 1k components | ≤ 50 ms p95 | not built | not built |
| js-framework-benchmark | ≤ 1.10× Solid | **1.063×** CPU geomean (below) | 1.067× (research 18) |

**js-framework-benchmark (measured).** `krausest/js-framework-benchmark` at `ca8715d`, Chrome headless, default
iteration counts. weft's entry is `frameworks/keyed/weft`, a production build of this branch; Solid's is the
official keyed entry, `solid-js` 1.9.3. Both ran in one run, and both passed the keyed check. Ratio is weft's mean
÷ Solid's; below 1 means weft is faster.

| Benchmark | weft (ms) | Solid (ms) | ratio |
|---|---|---|---|
| 01 create 1k rows | 24.40 | 22.21 | 1.098 |
| 02 replace 1k | 27.55 | 25.36 | 1.086 |
| 03 update every 10th ×16 | 16.19 | 15.69 | 1.032 |
| 04 select row | 5.44 | 6.54 | 0.832 |
| 05 swap rows | 18.38 | 16.73 | 1.099 |
| 06 remove row | 13.29 | 12.59 | 1.056 |
| 07 create 10k rows | 249.46 | 236.95 | 1.053 |
| 08 append 1k to 1k ×2 | 29.61 | 25.50 | 1.161 |
| 09 clear 1k ×8 | 15.07 | 12.68 | 1.189 |
| **CPU geomean (01–09)** | | | **1.063** |
| run memory, 1k rows (MB) | 4.02 | 2.68 | 1.501 |
| run + clear memory (MB) | 1.14 | 0.77 | 1.469 |
| bundle, compressed (KB) | 4.0 | 4.5 | 0.889 |
| first paint (ms) | 26.8 | 32.4 | 0.827 |

This is the same as research 18 (1.067×) within noise: the benchmark app was already on weft's back end then.
Clear and append are still the slowest (1.16–1.19×), and memory is still 1.5× Solid's. Both are runtime work (row
creation, `place()`), not compiler work. One run on a shared machine (load 7–9), so treat differences under ~5% as
noise.

Client-only apps grew 0.2–0.7 KB, mostly because weft's `tpl`/`child` carry the hydration claim path in every
build. Splitting it out (a hydratable build imports claiming helpers; a client-only build doesn't) is the next size
item. Every number is still inside its budget.

**Still open.**
- ~~A spread's `children`, and `textContent`/`innerHTML` props, aren't rendered on the server.~~ Fixed in §5.7.
- Source maps for lowered JSX are per line, not per expression inside a hole.
- HMR.

### 5.6 Hydration claims split out of client builds (2026-10-29)

Client-only apps grew 0.2–0.7 KB with the switch (§5.5) because `tpl` and `child` carried the claim path in every
build. Now the claiming halves live in `src/claim.ts`:
- `htpl`: `tpl`, plus key lookup, claiming the server element, and dev mismatch warnings;
- `hchild`: `child`, plus the hole's key scope and adopting the server's nodes;
- `first`/`next`: stepping over server ranges.

Only hydratable output imports them; client-only output imports the lean `tpl(html, svg?)` and `child`, which is
just `insert`. The dev `file:line` place goes only to `htpl`. Client-only dev output keeps the comment above each
template but doesn't pass the place on.

| Bundle (br) | §5.5 | Now |
|---|---|---|
| hello world | 1.16 KB | 1.01 KB (Solid's back end: 0.99 KB) |
| counter | 2.38 KB | 1.86 KB |
| v3 shop app | 4.49 KB | 4.00 KB |
| v3 shop app (defineState) | 5.17 KB | 4.68 KB |
| benchmark app | 3.79 KB | 3.30 KB |
| Boundary + resource | 3.71 KB | 3.23 KB |
| v3 shop app (hydrate) | 4.70 KB | 4.71 KB |
| runtime, every export | 5.77 KB | 5.81 KB |

A test checks that client-only output imports none of `htpl`, `hchild` or `first`, and that hydratable output does.
The helper contract checks that both sets are exported. `bind`, `spread` and `For` still read the small `keys`
object while hydrating. The benchmark wasn't re-run: the change removes branches from `tpl` and `child` and adds none.

### 5.7 Content properties and spread children on the server (2026-10-29)

Both were bugs once hydrating, not just gaps. Hydration skips a binding's first write, because the server wrote it.
The server wrote nothing for `textContent`/`innerHTML`, so a hydrated `<p textContent={x}>` stayed empty until `x`
changed. A spread's `children` were inserted fresh on top of the server's nodes.

- **`textContent={x}`** renders `escape(String(x ?? ""))` inside the element on the server, and **`innerHTML={x}`**
  renders `String(x ?? "")`, unescaped as on the client. An element with either one and JSX children is a compile
  error ("can't also have children"), since the property replaces them.
- **`<div {...rest} />` with no JSX children:** `children` is the element's one hole.
  - Client: `const _p = mergeProps(…); spread(el, _p); child(el, () => _p.children)` (`hchild` when hydratable).
  - Server: `hole(_k, 0, () => mergeProps(…).children)`.
  - `spread` itself no longer touches `children`.
- **Tests:**
  - a round trip of `Step2.Content` (0 misses, 0 DOM writes, then live updates of all three);
  - a client-only test that spread children render and update;
  - a Rust test for the server output and the error.

## 6. What PR #2 (compiler hardening) brings

The inventory comes from the compiler-hardening session (branch `claude/blissful-khorana-d4aaf1` at `60a5543`).

**Carries over unchanged:**
- `analyze.rs` (the Plan, and W001/W005/W006/W010/W013–W016, row roots, children memo planning);
- `project.rs` (cross-file facts, W014);
- the Oxc node construction in `transform.rs`;
- the behaviour tests in `test/compiler-items.test.tsx`. These check what happens at runtime, not the text of the
  output, so they become specs for the new back end.

Once Solid's crate is gone, weft can update Oxc on its own schedule instead of following Solid's pinned version.

**Shaped for Solid, to replace:**
- **The pre-pass emits Solid-shaped JSX:** `<For each by>{x => …}</For>`, `x()` accessors, `_$omit`, and a
  children memo statement. It relies on Solid compiling props to getters and children to `insert()`. With weft's own
  back end, the pre-pass should hand over the IR (§3) directly: a `List` hole and `Prop` getters, rather than JSX that
  another compiler re-reads.
- **Tests that match Solid's output text** (`_$createComponent(_$For`, `get each()`) are rewritten against the new
  output.
- **W016's rationale** (props compile to getters, `new X()` passed as a static value) is restated as a rule of
  weft's own lowering.
- **`tests/helper_contract.rs`** stops compiling Solid's fixtures. Its import-versus-export check stays, pointed at
  weft's own output.
- **The `weft/dom` helpers added to match Solid's output** go at the switch. `spread` is weft's only implementation
  of `<div {...rest}>` on a native element, so `Spread` moves into step 2 of §5, not step 4.

**Merged (2026-10-29).** PR #2 landed on `main`, and `main` was merged into this branch after step 5:
- `analyze.rs`, `project.rs`, `transform.rs` and `compiler-items.test.tsx` came over unchanged and pass on weft's back
  end. The pre-pass still hands over JSX, not the §3 IR; that rework is still open.
- `helper_contract.rs` now compiles the repo's own components in four modes: DOM, DOM dev, hydratable DOM and SSR. It
  checks every helper they import from `weft`, `weft/dom` or `weft/ssr` against the runtime's exports, ignoring type
  imports.
- Five helpers PR #2 added to `weft/dom` were only needed by Solid's output, and are dropped: `claimElement`,
  `applyRef`, `setAttributeNS`, `setStyleProperty`, and a Solid-shaped `spread`. Its `ref` fix (untracked, nested
  arrays flattened) is kept.
- W016's test now checks that the two reads differ, not which comes first: weft reads attributes before text.

## 7. Open questions

- Keyed rows in path keys use the user's `key`. A `key` the server and the client compute differently (dates,
  random ids) would be a mismatch with a clear message rather than a silent shift. Is that enough, or should W-codes
  catch non-deterministic keys?
- Prod key length: hashed path segments against a per-render counter. Measure the HTML bytes on the v3 app.
- Bindings: one `bind` per element keeps the effect count down. Is that cheaper than per-attribute bindings for
  memory, the current weak spot (research 18 §6)? Measure both on js-framework-benchmark before fixing the IR.
