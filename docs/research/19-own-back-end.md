# 19 — weft's own compiler back end (design)

Research date: 2026-10-29. Status: **design, not built.** Decision: PLAN §3.6 and §12 ("weft owns its code
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

**Corpus oracle (test only).** For every `.tsx` in the repo plus a generated corpus (`scripts/gen-corpus.mjs`),
render with the old and new back ends in jsdom. Compare the resulting DOM and the DOM after scripted interactions.
Solid's crate stays a dev-dependency only for this test, and leaves with step 5.

**Estimate (unverified):** 3–5k lines of Rust for the IR and both emitters, since they cover weft's constructs only.
Two to three weeks of focused work.

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

## 7. Open questions

- Keyed rows in path keys use the user's `key`. A `key` the server and the client compute differently (dates,
  random ids) would be a mismatch with a clear message rather than a silent shift. Is that enough, or should W-codes
  catch non-deterministic keys?
- Prod key length: hashed path segments against a per-render counter. Measure the HTML bytes on the v3 app.
- Bindings: one `bind` per element keeps the effect count down. Is that cheaper than per-attribute bindings for
  memory, the current weak spot (research 18 §6)? Measure both on js-framework-benchmark before fixing the IR.
