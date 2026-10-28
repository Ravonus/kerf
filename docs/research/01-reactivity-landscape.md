# 01: Reactivity landscape (late Oct 2026)

Research date: 2026-10-28. Versions were checked against the npm registry (`npm view <pkg> dist-tags`) on that date, not taken from memory. Benchmark numbers were computed from the raw js-framework-benchmark data committed on 2026-10-25 ("Chrome 156 results").

> **Framing:** weft is its own reactive system. It does not depend on React and is not built on it. React is covered here only as the system we are replacing: we study its failure modes, and nothing in it is a base. The other frameworks are sources of primitives and syntax to borrow, and of pitfalls to remove by design.

---

## 0. Version snapshot (npm, 2026-10-28)

| Package | latest | prerelease | Notes |
|---|---|---|---|
| react / react-dom | **19.3.1** | canary 19.3.0-canary-…20261027 | No React 20 exists. |
| babel-plugin-react-compiler | **1.0.0** | experimental | 1.0 shipped 2025-10-07. |
| solid-js | 1.9.17 | **2.0.0-rc.19** (`next`, 2026-10-27) | 2.0 is not stable yet. |
| svelte | **5.57.3** | | Runes era. |
| vue | 3.5.44 | **3.6.0-rc.13** (Vapor) | Vapor is still not in a stable release. |
| marko | **6.4.6** | | Marko 6 (Tags API) is stable. |
| @qwik.dev/core (Qwik 2) | 2.0.0-rc.4 | | Qwik 1.x is `@builder.io/qwik` 1.20.3. |
| ripple | **0.5.8** (published today) | | 0.4.0 on 2026-09-15 and 0.5.0 on 2026-10-26 both changed the syntax. |
| @tsrx/core | 0.5.5 | | The TSRX language, extracted from Ripple. |
| @preact/signals-core / @preact/signals | 1.14.5 / 2.11.4 | | |
| alien-signals | 3.2.1 | | Its algorithm was ported into Vue 3.6. |
| @angular/core | **22.2.3** | 22.3.0-next.2 | |
| remix | **3.1.0** | | Remix 3 dropped React. |
| signal-polyfill (TC39) | 0.2.2 (last publish Jan 2025) | | The proposal is stalled. |
| @sveltejs/mcp | 0.1.28 | | Official Svelte MCP server. |

---

## 1. React: the failure modes we are replacing

### React Compiler
- 1.0 has been stable since **2025-10-07**. Meta says it is production-tested. New Expo, Vite and Next.js apps can start with it enabled, and the compiler's lint rules now ship in `eslint-plugin-react-hooks` (recommended preset). It supports React 17+ through `react-compiler-runtime`. Sources: https://react.dev/blog/2025/10/07/react-compiler-1 , https://www.infoq.com/news/2025/12/react-compiler-meta
- No adoption percentage has been published. The evidence of uptake is qualitative.
- Tooling has churned: `@vitejs/plugin-react` v6 (Vite 8) replaced Babel with oxc, so the old `babel: { plugins }` config no longer works. https://recca0120.github.io/en/2026/04/14/react-compiler-vite-v6/
- **Limits, and what they mean for weft.** The compiler **silently bails out** of any component that breaks the Rules of React, such as mutation during render, side effects in render, reading refs in render, or conditional hooks. When it bails, the build and tests stay green and the component just goes unoptimized. Dynamic `obj[key]` reads cause partial bailouts. Libraries that rely on interior mutability, such as react-hook-form's `watch()` and `useWatch`, need `"use no memo"`. Sources: https://blog.logrocket.com/react-compiler-memoization-what-actually-broke , https://github.com/reactjs/react.dev/pull/7953
  - **Lesson:** a compiler that *silently degrades* on invalid input is the worst case for agents, because they never get a signal. weft must make invalid patterns **compile errors**, not silent de-optimizations.
- The compiler does nothing for the core model. Components still re-execute on every change, `useEffect` dependency arrays still exist, and stale closures are still possible. It memoizes the problem; it does not remove it.

### React 19.x features (each one is a patch over the re-render model)
- **19.2** (Oct 2025) added `<Activity>` (hide a subtree while keeping its state, with effects cleaned up while hidden), `useEffectEvent` (read the latest values inside an effect without re-triggering it, a patch for stale closures and dependency-array pain), `cacheSignal` for RSC, and partial pre-rendering. https://makerkit.dev/blog/tutorials/react-19-2 , https://certificates.dev/blog/whats-new-in-react-192
- **19.3** (2026-09-09, per changelog aggregators): ViewTransition and Fragment refs became stable, plus `addTransitionType` and Context rendering directly in RSC. No breaking changes. https://www.gitclear.com/open_repos/facebook/react/release/v19.3.0 (I found no official react.dev post; this comes from secondary sources.)
- **Next.js 16**: Cache Components, `"use cache"` behind the `cacheComponents: true` opt-in, and PPR. https://nextjs.org/blog/next-16
- **Security:** CVE-2025-55182 (RSC) affected React 19.0.0–19.2.2. https://makerkit.dev/blog/tutorials/react-19-2
- **React 20:** not announced. Pages that predicted mid-2026 were wrong.

### The "ban useState/useEffect" discourse is now packaged for agents
- A cluster of agent skills and lint configs bans `useEffect` outright. Factory AI's `no-use-effect` skill says never to call `useEffect` and to use derived state, event handlers, a fetching library or `useMountEffect` instead, enforced with `no-restricted-syntax`. Tessl's `react-ban-use-effect` and skills.sh's `useeffect-ban` (aimed at AGENTS.md and Cursor rules) take the same line. All of them build on React's own "You Might Not Need an Effect" page. Sources: https://mcpservers.org/agent-skills/factory-ai/no-use-effect , https://tessl.io/registry/uinaf/react-ban-use-effect , https://www.skills.sh/tylergibbs1/useeffectban/useeffect-ban , https://react.dev/learn/you-might-not-need-an-effect
- **Interpretation:** the ecosystem has concluded on its own that agents reach for effects to sync derived state. This supports the weft thesis, and React's fix is a ban written in prose. weft should make the wrong thing *unexpressible*.
- **Remix 3** (now `remix@3.1.0`) **left React** for its own component model. It is built on web primitives such as EventTarget, has no virtual DOM, and replaces hooks with explicit updates through a `Handle` API. This is a major ex-React team concluding that the hooks model is the problem. https://betterstack.com/community/guides/scaling-nodejs/remix-3-beyond-react.md , https://en.wikipedia.org/wiki/React_Router

---

## 2. Fine-grained alternatives

### SolidJS 2.0 (`2.0.0-rc.19`, 2026-10-27, not stable)
Beta was announced around May 2026 (InfoQ) and reached RC on 13 Aug. Sources: https://github.com/solidjs/solid/releases , https://github.com/solidjs/solid/releases/tag/v2.0.0-beta.0 , https://www.infoq.com/news/2026/05/solidjs-2-async/
- **Async is first-class.** Computations can return Promises or async iterables. `<Loading>` replaces Suspense for the initial load, `isPending(() => expr)` reports background refreshes, and `<Errored>` handles errors. A new diagnostic, `ASYNC_MEMO_ELEMENT`, rejects memos that resolve to JSX: return data and render JSX from it.
- **`createEffect` is split** into a tracked *compute* function and an untracked *apply* function. The single-argument form is gone. This structurally prevents "read signal inside effect → accidental dependency". Users asked whether conditional logic now has to be duplicated across the two phases (discussion #2425). https://github.com/solidjs/solid/discussions/2425
- **Microtask batching:** "reads don't update until the batch flushes." After `setCount(1)`, `count()` still returns 0 until `flush()` runs. **This is an agent footgun**, because agents assume read-after-write consistency.
- `onMount` became `onSettled`. `createComputed` is removed. `Index` became `<For keyed={false}>`, and `For` children receive accessors (`item()`).
- **Stores use draft-first setters** (immer-like). `storePath(...)` is an opt-in for the old path API. `createSignal(fn)` and `createStore(fn)` give writable derived state. `createProjection` exists. `action`, `createOptimistic` and `refresh()` handle mutations.
- **Dev warnings** flag top-level signal reads in component bodies and writes inside reactive scopes. Solid is adding guard rails because these mistakes are common.
- SolidStart has been retired in favor of a "Start mode" inside Solid.

### Svelte 5 runes (`5.57.3`)
- `$state`, `$derived`, `$derived.by`, `$effect`, `$props`, `$state.raw`, `$state.snapshot` and `$state.eager`. Since 5.25, `$derived` can be reassigned temporarily, for optimistic UI.
- **Documented gotchas** (https://svelte.dev/docs/svelte/$state):
  - `$state` objects and arrays become **deep Proxies**. Updating the proxy doesn't mutate the original object, so `structuredClone` and third-party APIs need `$state.snapshot`.
  - **Destructuring `$state` loses reactivity**: values are "evaluated at the point of destructuring". Destructuring `$derived` *does* stay reactive. This asymmetry trips up agents.
  - Passing state into functions passes a value, so callees need getters.
  - You can't export reassigned `$state` from `.svelte.ts` (the `state_invalid_export` error). Importers otherwise see stale values, and `typeof` returns `'object'`.
  - Class methods lose `this` when used as handlers.
  - Module-level `$state` is shared across SSR requests, which leaks data.
  - Runes are compiler keywords: they can't be aliased, imported, or called conditionally.
  - The most common misuse is `$effect` used to compute derived values.
  - Sources: https://glama.ai/mcp/servers/@spences10/mcp-svelte-docs/blob/909b07be5559ceff08e00415f72acf1918e9b587/definitions/common-mistakes.md , https://github.com/sveltejs/svelte/issues/13948 , https://blog.openreplay.com/state-management-svelte-5-runes/

### Vue Vapor mode (`vue@3.6.0-rc.13`, stable is still 3.5.44)
- 3.6 entered RC once the Vapor feature set was complete. Vapor is opt-in per component (`<script setup vapor>`). It doesn't support the Options API or features that need VNodes or the instance proxy. Vue 3.6 also ports the **alien-signals** algorithm into `@vue/reactivity` (vuejs/core PR 12349). Sources: https://newreleases.io/project/github/vuejs/core/release/v3.6.0-rc.1 , https://github.com/stackblitz/alien-signals
- Vue's `ref().value` versus `reactive()` split is the classic agent confusion: losing reactivity by destructuring `reactive`, and forgetting `.value` in script but not in templates.

### Preact Signals (`@preact/signals-core` 1.14.5)
A mature `signal`, `computed`, `effect`, `batch` core, with `.value` access and a double-linked-list dependency graph. alien-signals borrowed that dependency-tracking design.

### Angular signals (`@angular/core` 22.2.3)
- v21 (2025-11-20): new apps are **zoneless by default**, and Signal Forms arrived as experimental. v22 (mid-2026) made Signal Forms and `resource()`, `rxResource()` and `httpResource()` **stable**. Sources: https://www.infoq.com/news/2025/11/angular-21-released , https://www.angular.love/angular-21-whats-new , https://www.bacancytechnology.com/blog/angular-22
- `signal`, `computed`, `effect`, `linkedSignal` and `resource` together make the most "boring", explicit signal API among the big frameworks, read by calling `count()`.
- The Angular CLI ships an MCP server (`npx @angular/cli mcp`) with `get_best_practices`, `find_examples`, `modernize` and `ai_tutor`. angular.dev has a "Build with AI" section. https://v21.angular.dev/ai/mcp

### Qwik / resumability
Qwik 2 is in RC (`@qwik.dev/core@2.0.0-rc.4`). Qwik 1.20.x performs worst of all signal frameworks on the client benchmark (§5). Resumability is an SSR and TTI strategy, not an authoring model. Its `$` boundaries and serialization rules are a well-known source of agent errors (closures that can't be serialized). **For weft, leave it out of v1.**

### Marko 6 (`marko@6.4.6`, stable)
Tags API: `<let/count = 0>`, `<const/doubled = count * 2>`, and `<effect>`. Reactivity is resolved at compile time, down to the expression. On the benchmark it has the **best CPU and bundle combination of any full framework** (1.12× CPU, 4.8 KB gz). It is HTML-first, with a niche syntax that has little LLM training data. It shows that compile-time-scoped reactivity with *no runtime signal objects in user code* is viable. https://markojs.com/docs/guide/marko-5-interop

### TC39 Signals
**Still Stage 1** (accepted April 2024). It hasn't appeared on any 2026 TC39 agenda summaries I found, and `signal-polyfill` was last published in January 2025. **Don't design around native Signals arriving.** Keep the semantics compatible with the proposal (`State`, `Computed`, a watcher-based effect scheduler) so a later swap is possible. Sources: https://github.com/tc39/proposal-signals , https://scrapbox.io/petamoriken/2026-07_%E3%81%AE_TC39_meeting

### alien-signals / reactively
alien-signals 3.x is a push-pull hybrid. It combines Vue's propagation, Preact's linked lists, Svelte's effect scheduling and Reactively's graph coloring, and avoids Array, Set and Map in the hot path. It leads js-reactivity-benchmark, and its standalone keyed entry in js-framework-benchmark scores **1.04×** (vanilla is 1.02×). **Recommendation:** adopt the algorithm (MIT), or depend on it directly for weft's core graph. Sources: https://github.com/stackblitz/alien-signals , https://github.com/johnsoncodehk/signals (I found no recent cross-library numbers; run js-reactivity-benchmark ourselves.)

---

## 3. TS-first UI languages compiled to JS

### Ripple (`ripple@0.5.8`) and TSRX (`@tsrx/core@0.5.5`)
By Dominic Gannaway (Inferno, Lexical, React core, Svelte 5 core). Repo: https://github.com/Ripple-TS/ripple . Docs: https://www.ripple-ts.com/docs/introduction (the old ripplejs.com redirects there). Agent docs: https://www.ripple-ts.com/llms.txt
- **The language moved out** into **TSRX** ("TypeScript Render Extensions"), announced as alpha around 2026-06-19. TSRX parses `.tsrx` into a framework-neutral AST, and plugins emit **React, Preact, Solid, Vue, Hono and Ripple** code. A `.tsrx` file compiles to an equivalent `.tsx`, so it can be adopted one file at a time. It ships a `@tsrx/language-server`, VS Code and Zed extensions, Prettier, ESLint and `tsrx-tsc` for CI type-checking. **I found no evidence that it uses Volar.** Sources: https://github.com/tsrx-org/tsrx , https://www.infoq.com/news/2026/06/tsrx-alternative-jsx , https://blog.logrocket.com/tsrx-typescript-render-extensions-for-react-beyond-jsx/
- **Syntax today:**
  - Components are plain TS functions. A `@{ setup; …; <single output/> }` statement container keeps setup and markup in one scope.
  - Control flow is statement-based: `@if`, `@for (const x of xs; index i; key x.id) {…} @empty {…}`, `@switch` with `@case` (no fall-through), and `@try {…} @pending {…} @catch (e, reset) {…}`.
  - `<style>` blocks are scoped.
  - `break`, `continue` and `return` are banned inside template `@for` and `@if` bodies.
- **Reactivity has been revised three times, and that history is the main thing to learn from:**
  1. 2025: a sigil, `let count = track(0); @count++`.
  2. Then lazy destructuring: `let &[count] = track(0); count++`.
  3. **0.4.0 (2026-09-15) removed the sigil and lazy destructuring.** State is now a plain box: `const count = track(0); count.value++`. `track(() => …)` returns a read-only `Derived<V>`, and `track(fn, get, set)` returns a `WritableDerived`. Collections are `RippleArray`, `RippleObject`, `RippleMap` and `RippleSet`. Other APIs: `effect`, `untrack`, `snapshot` and `isTracked`.
  - **Props became plain objects, evaluated once** (0.4.x, PR #1470): "no getters, no props class, no Proxy for spreads". A live prop must be passed *as a box*: `<Child {count} />` or `title={track(() => label + count.value)}`. `count={count.value}` deliberately passes a snapshot. This removes the "destructuring props breaks reactivity" bug **by construction**: props are ordinary values, and liveness is visible in the type (`Tracked<number>` versus `number`).
  - The stated benefit is that the compiler "stops re-implementing destructuring by hand". Native JS semantics come back, and the runtime gets smaller. Source: https://cdn.jsdelivr.net/npm/ripple@0.5.8/CHANGELOG.md (0.4.0 entry, PR #1472, tsrx RFC #106)
- The "common mistakes" list in its llms.txt is effectively a list of agent errors: raw `if` instead of `@if`, passing `.value` and expecting it to stay live, writing to a Derived, `className` instead of `class`, assuming plain array mutation updates the UI, and creating `new Context()` in several modules.
- SSR is now supported, buffered and streaming, with hydration (it was SPA-only in 2025). `trackAsync` handles hydration and RPC transport. Activity-style effect pausing exists.
- The repo ships `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` and per-agent skill folders. Gannaway's framing: in a world of LLM-written logic, "we're going to be doing a lot more reading". https://thenewstack.io/?p=22809345
- **Perf:** `ripple-v0.3.112` (pre-0.4) scores **1.15× CPU and 9.6 KB gz** on js-framework-benchmark, about equal to Solid and ahead of Svelte 5.
- Criticism: Ryan Carniato noted that TSRX suits people escaping hook rules but is at odds with Solid's transparency. A Medium review's advice: "experiment, do not migrate".

### Others in this space
- **Svelte as a language:** the `.svelte` and `.svelte.ts` rune files are a TS dialect with compiler keywords. TS support comes from svelte2tsx (it generates virtual TSX) and the Svelte language server. I didn't check whether it has moved to Volar.
- **Vue SFC:** the reference **Volar** implementation (Vue Language Tools). This is the most mature path for "custom file format with full TS". **Volar.js is the obvious choice for weft's LSP** unless we keep the syntax a strict TSX superset.
- **Marko 6:** its own `.marko` language with a TS language server.
- **Remix 3:** plain TSX on its own runtime.
- **Octane:** appears as an external TSRX target and as a js-framework-benchmark entry (`octane-v0.2.7`, 1.17× CPU but a 25 KB gz bundle). I couldn't find more detail.
- No other notable new UI languages appeared in 2025–26. TSRX is the main one.

---

## 4. Agent-friendly and LLM-friendly evidence

- **No framework explicitly markets itself as "for agents".** Ripple and TSRX come closest in rhetoric (llms.txt, AGENTS.md, per-agent skills). Searches for "LLM-friendly UI framework" return only chat-UI kits (CopilotKit, assistant-ui, Chainlit). **This niche is open.**
- **Cross-framework codegen benchmarks:**
  - **Web-Bench** (arXiv 2505.07473) covers React, Vue, Angular and Svelte, but not Solid. **React scores higher than Svelte** for most models. Claude-3.7 scores about 65 vs about 25 at pass@2, GPT-4o 35 vs 20, and Claude-3.7 with thinking 60 vs 55. The authors attribute React's lead to training-data volume. https://arxiv.org/pdf/2505.07473
  - **WebApp1K** (arXiv 2409.05177) covers React only. Failures there come from mistakes models make, not missing knowledge. https://arxiv.org/html/2409.05177v1
  - **SvelteBench** (khromov) measures pass@k for Svelte 5 only. It can run with a docs-context file to measure how much docs help. https://tomevault.io/tome/khromov/svelte-bench
  - A token-cost study of the same snippets: Svelte 1.00, Vue 1.115, **Solid 1.196**, React 1.254, Angular 1.381. https://hackernoon.com/we-measured-the-llm-token-cost-of-5-frontend-frameworks-angular-costs-38percent-more-than-svelte
  - **No Solid error-rate data exists.** **Nobody has measured stale-closure or effect-loop error rates directly.** weft's thesis is currently unmeasured, and **we should build the eval ourselves** (see §6).
- **Next.js Evals** (https://nextjs.org/evals , harness: next-evals-oss) gives each task a PROMPT.md and a hidden EVAL.ts vitest suite. In the March 2026 run, base success was 67–86%. Adding an AGENTS.md with bundled docs pushed several agents to **100%**. https://benchlm.ai/benchmarks/nextjsevals
- **Vercel's "AGENTS.md outperforms skills"** (Jan 2026): an 8 KB compressed docs index in AGENTS.md scored **100%**. Skills peaked at **79%** even when the agent was explicitly told to use them, and by default **the skill was never invoked in 56%** of cases, scoring 53%, the same as no docs. **Passive, always-present context wins.** https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals
- **Official MCP servers and agent docs:**
  - **Svelte:** `@sveltejs/mcp` (remote at `https://mcp.svelte.dev/mcp`). Its `list-sections` and `get-documentation` tools are joined by **static analysis of generated code with fix suggestions** (an autofixer), and `npx sv add mcp` writes the AGENTS.md or CLAUDE.md prompt. There is also a Claude Code plugin. Sources: https://svelte.dev/docs/ai/mcp , https://svelte.dev/docs/ai/llms.txt
  - **Angular:** a CLI MCP server, covered in §2.
  - **Ripple:** llms.txt plus AGENTS.md and skill folders.
  - React itself ships no official MCP. Next.js ships evals and an AGENTS.md docs bundle.
- **Conventions:** `/llms.txt` (index) plus `/llms-full.txt` or per-page `.../llms.txt` (Svelte publishes one per docs section), `AGENTS.md` at the repo root, and `CLAUDE.md` and `GEMINI.md` symlinks.

---

## 5. Bundle size & runtime perf (js-framework-benchmark, Chrome 156, data committed 2026-10-25)

Method: I computed these from `webdriver-ts-results/src/results.ts` (https://github.com/krausest/js-framework-benchmark). The CPU and memory figures are the geometric mean, over the 9 CPU benchmarks and the 3 memory benchmarks, of each framework's mean time divided by the fastest keyed implementation. This closely tracks the official "weighted geomean" but **is not identical**, so check against https://krausest.github.io/js-framework-benchmark/current.html before quoting externally. Sizes are KB for the benchmark app.

| Framework (version in benchmark) | CPU geomean | Mem geomean | gz KB | first paint ms |
|---|---|---|---|---|
| vanillajs | 1.02 | 1.06 | 2.5 | 40.7 |
| alien-signals 3.1.2 (raw) | 1.04 | 1.10 | 2.9 | 58.0 |
| **vue-vapor 3.6.0-rc.5** | **1.12** | 1.63 | 18.7 | 90.2 |
| **marko 6.3.28** | **1.12** | 1.29 | 4.8 | 49.4 |
| vue-jsx-vapor 3.6.0-beta.17 | 1.13 | 1.61 | 17.3 | 84.8 |
| inferno 10 | 1.14 | 1.32 | 9.3 | 66.9 |
| **ripple 0.3.112** | **1.15** | 1.34 | 9.6 | 66.1 |
| **solid 1.9.3** | **1.16** | 1.28 | 4.5 | 53.5 |
| ivi 5.1 | 1.17 | 1.23 | 4.0 | 42.1 |
| octane 0.2.7 | 1.17 | 1.70 | 25.1 | 113.3 |
| solid-store 1.9.3 | 1.22 | 1.40 | 5.5 | 48.5 |
| **svelte 5.42.1** | **1.25** | 1.48 | 9.7 | 65.5 |
| lit-html 3.2 | 1.30 | 1.31 | 4.5 | 51.7 |
| vue 3.5.39 (VDOM) | 1.31 | 1.92 | 23.3 | 95.8 |
| preact-signals 11 + 2.3.1 | 1.42 | 3.74 | 8.3 | 61.6 |
| angular-cf-signals-nozone 22.2.2 | 1.69 | 2.31 | 33.8 | 128.0 |
| preact-hooks 11 | 1.83 | 1.43 | 5.9 | 56.7 |
| react-hooks 19.2.0 | 1.87 | 2.62 | 51.4 | 228.1 |
| **react-compiler-hooks 19.0.0** | **1.95** | 2.64 | 50.0 | 223.6 |
| qwik 1.20.2 | 3.34 | 4.67 | 30.5 | 97.9 |

Takeaways:
- Every fine-grained compiled framework lands within **1.12–1.25×** of vanilla. React is about **1.9×**, and **React Compiler does not help on this benchmark** (1.95 vs 1.87; that entry uses an old React 19.0 build). The compiler addresses re-render waste in *app* code, not the cost of the runtime model.
- On size, Solid, Marko and ivi weigh about **4–5 KB gz**, Ripple and Svelte about **10 KB**, and Vue Vapor about **19 KB** (it still ships the Vue runtime). React is about **50 KB**.
- **Target for weft: ≤1.15× CPU and ≤6 KB gz for the benchmark app**, which puts it in Solid and Marko territory. With an alien-signals-class core that is achievable.
- Missing from the benchmark: Solid 2.0, Ripple ≥0.4, Svelte 5.57, and React 19.3 + Compiler 1.0.

---

## 6. Opinion: what weft should be

### 6.1 Root causes of agent errors, ranked
1. **Stale or snapshotted values.** A reactive value turns into a plain value without anyone noticing. Examples: React closures, destructuring Solid props or Svelte `$state`, Vue `reactive` destructuring, Ripple `count={count.value}`, Svelte passing state into a function.
2. **Effects used for derivation.** This is the useEffect-sync antipattern, also seen as Svelte `$effect` computing values and Solid 1.x `createEffect` + `setX`.
3. **Invisible tracking boundaries.** It isn't obvious which reads subscribe, for example top-level reads in a Solid component body, or reads inside effect callbacks.
4. **Magic that differs by context.** Vue `.value` in script but not in templates. Svelte runes that are keywords and can't be imported. Svelte's asymmetric destructuring rules. React hooks' call-order rules.
5. **Scheduling surprises.** Solid 2's batched reads return the old value until a flush, and effect timing differs across frameworks.
6. **Silent failure modes.** React Compiler's bailouts, and Svelte proxies silently changing identity.

**Design principle:** each of these must be either *unexpressible* or a **compile-time or type error with a fix-it message**. A runtime warning or a lint rule is not enough.

### 6.2 Minimal primitive set (6 functions plus 1 boundary)
Keep the surface tiny and orthogonal, and give every primitive exactly one job.

| Primitive | Semantics | Why it is shaped this way |
|---|---|---|
| `state<T>(init)` → `State<T>` | A writable box: `.value` get and set, plus `.update(fn)`. | **Explicit `.value` boxes** (Ripple 0.4, Preact, Vue `ref`). Ripple tried a sigil and then lazy destructuring, and **abandoned both** for `.value`. A box survives destructuring, passing through functions and module export *because it is an object*, and liveness shows up in the type. |
| `derived<T>(fn)` → `Derived<T>` | A pure, lazy, cached, read-only `.value`. Writing to it is a **type error**. | "B = f(A)" maps directly to code. This is the primitive agents should reach for 90% of the time. Optionally offer `derived.writable(fn)` for linked or optimistic state (Angular `linkedSignal`, Solid `createSignal(fn)`). |
| `effect(track, apply)` | **Two phases, Solid 2-style.** `track` runs pure and reactive and returns a value. `apply(value, prev)` is untracked and may return a cleanup. | Structurally prevents accidental dependencies and "set state in effect". **Compile error if `apply` writes a `State` that `track` reads** (a cycle), and a lint-level error for any `State` write in `apply` with the message "use derived". |
| `resource(fn)` → `Resource<T>` | An async derived: `.value`, `.pending`, `.error`, `.refresh()`. It is cancelable through an AbortSignal passed to `fn`. | Async is the second-biggest effect misuse (fetch in useEffect). Solid 2 and Angular `resource` / `httpResource` show that making async a *derived* value is the right model. |
| `store<T>(init)` | A deep reactive object or array with **draft-function writes only**: `todos.set(d => { d.push(x) })`. Reads go through plain property access. | Solid 2 draft-first setters. **No mutable proxy writes** (Svelte `$state` proxies, Solid `createMutable`): writes are explicit and greppable. `snapshot()` is built in. |
| `untrack(fn)` / `batch(fn)` | Escape hatches. | Keep them, but make them rare. |
| Boundary: `@try / @pending / @catch` | Async and error boundaries in markup. | Comes from TSRX and Solid 2 `Loading`/`Errored`. |

Deliberately **left out**: lifecycle hooks (use `effect` with an empty track phase, or `onCleanup` only), refs as a separate concept (use `State<Element | null>` via `ref={el}`), context *classes* (one `context<T>()` function whose identity is checked at compile time), and `memo` versus `computed` naming variants.

**Read-after-write consistency:** unlike Solid 2, a `state.value` read immediately after a write must return the new value (pull-based reads, push-based effect scheduling), while effects and DOM updates are batched to a microtask. Agents reason sequentially, so they should never see a stale read in imperative code.

### 6.3 Syntax features that reduce agent errors most
1. **Live versus snapshot is visible in types.** A prop typed `State<T>` / `Derived<T>` (written as `Live<T>`) is reactive, and a plain `T` is a constant. Props are a plain object, evaluated once (as in Ripple 0.4), so **destructuring props is always safe**. The compiler warns when a `.value` read is passed to a prop whose child reads it inside a reactive context, with the fix-it "pass `count`, not `count.value`".
   - Offer markup sugar: `<Child count={derived(() => a.value + 1)} />` can be written as `<Child count={a.value + 1} />`, which the compiler auto-wraps in a derived **only when the target prop is typed `Live<T>`**. Type-directed, this removes the most common Ripple mistake.
2. **Components run once, and there are no hooks.** `state()` and `derived()` work anywhere: component setup, module scope or inside functions. There is no call-order rule. Module-level state has an explicit SSR scope (`state.perRequest`, or a compile error for module `state` in server bundles).
3. **Statement-based control flow** (`@if`, `@for … key …`, `@switch`, `@try`), from TSRX. Agents write `if` and `for` correctly far more often than nested ternaries and `.map` with keys. **Make `key` mandatory in `@for`** over non-primitive items.
4. **Text interpolation auto-reads.** Inside markup, `{count}` where `count: State<number>` renders the live value, and the compiler inserts `.value`. In script, `.value` is required. This rule is *consistent*: markup is always live and script is always explicit. (Vue's inconsistency was the opposite: auto-unwrap in templates, but `.value` required in script for *some* refs.) Decide this after an eval; requiring `.value` everywhere is also defensible, and Ripple chose that.
5. **Errors as teaching material.** Every diagnostic carries a stable code (`WEFT0xx`), a one-line why, and a fix-it. The same catalog is served by the MCP autofixer and `weft check` (like Svelte MCP's static analysis, but for every error).
6. **Stay a strict TSX superset where possible**, so the TS language service mostly "just works". Where we add syntax (`@if` and friends), use **Volar.js** virtual code like Vue and Svelte do, or reuse TSRX's approach. Consider **targeting TSRX directly** as a frontend, since its plugin model is designed for exactly this, and that would give us its parser, LSP, Prettier and ESLint support.

### 6.4 What to take from where
- **alien-signals:** the core graph algorithm (push-pull, graph coloring, linked lists). Fastest measured, MIT, and battle-tested in Vue 3.6.
- **Ripple 0.4 / TSRX:** `.value` boxes, plain-object props evaluated once, statement-based `@` control flow, `@try/@pending/@catch`, scoped `<style>`, and the "common mistakes" section in llms.txt. Also its *history*: it spent a year learning that sigils and destructuring magic lose to boxes.
- **Solid 2:** the split `effect(track, apply)`, async as derived (`resource`, `isPending`), draft-first stores, `refresh` / `action` / optimistic updates, and dev diagnostics with codes (`ASYNC_MEMO_ELEMENT`). **Do not** copy its stale-read batching.
- **Marko 6:** compile-time-scoped reactivity and tiny output (4.8 KB). Prove weft can reach that size.
- **Angular:** `linkedSignal` (writable derived), `httpResource`, and the CLI MCP tool set (`get_best_practices`, `find_examples`, `modernize`).
- **Svelte:** the MCP server with **static-analysis autofix** and `npx sv add mcp` writing AGENTS.md. Also its list of documented gotchas as a negative checklist.
- **Vercel / Next.js:** an always-on **≤8 KB compressed docs index in AGENTS.md** (it beats skills), and an evals harness (PROMPT.md plus a hidden vitest EVAL.ts).
- **From React, failure modes only:** silent compiler bailouts, dependency arrays, `useEffectEvent`-style patches, and hook call-order rules. All are the things weft must make impossible.

### 6.5 Pitfalls weft must remove structurally (checklist)
| Pitfall (source) | weft's structural fix |
|---|---|
| Destructuring props loses reactivity (Solid) | Props are plain objects; liveness lives in `State`/`Derived` boxes. |
| Destructuring `$state` loses reactivity, while `$derived` keeps it (Svelte) | One rule: boxes are objects, so destructure freely. |
| Deep `$state` proxies: identity, `structuredClone`, `this` (Svelte) | No implicit proxies. `store` writes only through drafts, and reads return plain frozen snapshots outside tracking. |
| `$effect` / `useEffect` used to derive values | `derived` is the obvious path. Writing state in an effect's apply phase is a diagnostic, and a cycle is a compile error. |
| Stale closures and dependency arrays (React) | Components run once, and `.value` always reads current. There are no dependency arrays. |
| Top-level signal read in a component body has no effect (Solid) | Compile warning when a `.value` read in setup flows only into a non-live prop or text. Use a `derived` or markup instead. |
| Passing `.value` to a child that needs it live (Ripple) | Type-directed auto-derive for `Live<T>` props, or an error. |
| Batched reads return stale values (Solid 2) | Read-after-write is always consistent; only effects are batched. |
| Exporting reassigned module state (Svelte) | Modules export boxes, which are const objects. |
| Module state shared across SSR requests (Svelte) | Module `state` in a server graph is a compile error unless marked `state.global`. |
| Runes are keywords and can't be imported (Svelte) | The primitives are ordinary imported functions, so autocomplete and go-to-definition work. |
| Silent compiler bailouts (React Compiler) | No silent fallback. Every unsupported pattern is an error with a code and a fix-it. |
| Missing or incorrect list keys | `key` is required in `@for` over objects. |
| Async in effects (fetch in `useEffect`) | `resource()` and `@try/@pending`, with a cancellation signal passed in. |

### 6.6 Immediate next steps
1. **Build `weft-evals` first.** It should hold 20–30 tasks in the PROMPT.md + hidden vitest EVAL.ts style, implemented in React 19.3, Solid 2 RC, Svelte 5 and Ripple 0.5, and later in weft. Measure pass@1 with and without an AGENTS.md docs index, and categorize failures by the six root causes in §6.1. No such cross-framework error-rate data exists today, and it would both validate the thesis and serve as a launch artifact.
2. Prototype the core on alien-signals and check it against js-reactivity-benchmark and js-framework-benchmark (target ≤1.15× CPU, ≤6 KB gz).
3. Decide between a TSRX frontend and our own Volar-based TSX superset. Spike both for a week.
4. Ship `llms.txt`, an AGENTS.md docs index under 8 KB, and an MCP server with a static autofixer from day one.

---

## Sources (consolidated)
- React Compiler 1.0: https://react.dev/blog/2025/10/07/react-compiler-1 · https://www.infoq.com/news/2025/12/react-compiler-meta · https://recca0120.github.io/en/2026/04/14/react-compiler-vite-v6/ · https://blog.logrocket.com/react-compiler-memoization-what-actually-broke · https://github.com/reactjs/react.dev/pull/7953
- React 19.2 / 19.3 / Next 16: https://makerkit.dev/blog/tutorials/react-19-2 · https://certificates.dev/blog/whats-new-in-react-192 · https://www.gitclear.com/open_repos/facebook/react/release/v19.3.0 · https://nextjs.org/blog/next-16 · https://react.dev/learn/you-might-not-need-an-effect
- useEffect bans: https://mcpservers.org/agent-skills/factory-ai/no-use-effect · https://tessl.io/registry/uinaf/react-ban-use-effect · https://www.skills.sh/tylergibbs1/useeffectban/useeffect-ban
- Remix 3: https://betterstack.com/community/guides/scaling-nodejs/remix-3-beyond-react.md · https://appwrite.io/blog/post/remix-3-whats-changing-and-why-it-matters.md · https://en.wikipedia.org/wiki/React_Router
- Solid 2: https://github.com/solidjs/solid/releases · https://github.com/solidjs/solid/releases/tag/v2.0.0-beta.0 · https://www.infoq.com/news/2026/05/solidjs-2-async/ · https://github.com/solidjs/solid/discussions/2425 · https://www.stork.ai/blog/solid-2-killed-its-own-meta-framework
- Svelte: https://svelte.dev/docs/svelte/$state · https://svelte.dev/docs/svelte/$derived/llms.txt · https://github.com/sveltejs/svelte/issues/13948 · https://blog.openreplay.com/state-management-svelte-5-runes/ · https://svelte.dev/docs/ai/mcp · https://svelte.dev/docs/ai/llms.txt
- Vue Vapor / alien-signals: https://newreleases.io/project/github/vuejs/core/release/v3.6.0-rc.1 · https://blog.openreplay.com/vue-vapor-mode/ · https://github.com/stackblitz/alien-signals · https://github.com/johnsoncodehk/signals
- Angular: https://www.infoq.com/news/2025/11/angular-21-released · https://www.angular.love/angular-21-whats-new · https://www.bacancytechnology.com/blog/angular-22 · https://v21.angular.dev/ai/mcp
- Marko: https://markojs.com/docs/guide/marko-5-interop
- TC39 Signals: https://github.com/tc39/proposal-signals · https://scrapbox.io/petamoriken/2026-07_%E3%81%AE_TC39_meeting
- Ripple / TSRX: https://github.com/Ripple-TS/ripple · https://www.ripple-ts.com/docs/introduction · https://www.ripple-ts.com/llms.txt · https://cdn.jsdelivr.net/npm/ripple@0.5.8/CHANGELOG.md · https://github.com/tsrx-org/tsrx · https://www.infoq.com/news/2026/06/tsrx-alternative-jsx · https://blog.logrocket.com/tsrx-typescript-render-extensions-for-react-beyond-jsx/ · https://thenewstack.io/?p=22809345 · https://blog.openreplay.com/ripple-typescript-ui-framework
- LLM evals: https://arxiv.org/pdf/2505.07473 · https://arxiv.org/html/2409.05177v1 · https://tomevault.io/tome/khromov/svelte-bench · https://hackernoon.com/we-measured-the-llm-token-cost-of-5-frontend-frameworks-angular-costs-38percent-more-than-svelte · https://nextjs.org/evals · https://benchlm.ai/benchmarks/nextjsevals · https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals
- Benchmarks: https://github.com/krausest/js-framework-benchmark (webdriver-ts-results/src/results.ts, commit "Chrome 156 results", 2026-10-25) · https://krausest.github.io/js-framework-benchmark/current.html
