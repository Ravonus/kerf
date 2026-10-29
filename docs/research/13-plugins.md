# 13 — Plugins: typed slots, declared contributions, and the text engine as plugin #1

Research date: 2026-10-28. Prior-art facts come from each project's own docs, read on that date (sources at the end).
Statements marked **(unverified)** could not be confirmed from a primary source. Numbers marked **(derived)** are my
arithmetic on a cited figure. Numbers marked **(guess)** are starting budgets to replace after the first measurement.
Nothing here was benchmarked for this doc.

> Numbering: there is no `12-*.md` yet. The number 13 was given in the brief, so it is kept.

**The ask (from the user):** "create a plugin system and make pretext the first plugin and make it so it ties in easy
right so plugin now all font uses it sort of shit". In other words, adding **one entry** to `weft.config.ts` should
route every text use in the app through the plugin: warp components, `<Text>`, Surfaces' `s.text()`, skeleton line
bars and the font build. No call site should change.

**Constraints from PLAN:**
- §2 rules: no context-dependent magic, one way to do things, every failure gets a diagnostic, agent-first.
- §3.6: one Rust compiler, and ASTs never cross JS↔Rust.
- §3.7: HMR p95 ≤ 50 ms, runtime ≤ 6 KB.
- §6.2 and [11](11-text-and-type.md): Pretext is a 34.5 KB lazy chunk, fonts are a build step, X-codes.
- §7 and §7b: AGENTS.md, `weft check --json`, MCP, `weft.config.ts`, P-codes.

---

## TL;DR

1. **The plugin system is a typed slot registry, not a hook bus.**
   - Core defines **slots**: named, versioned TypeScript interfaces such as `text.measure@1`, `font.build@1` and
     `realtime.bus@1`.
   - A plugin **provides** an implementation for a slot. Core and warp **consume** the slot through a generated,
     readable module (`.weft/slots/text.measure.ts`).
   - That is how "install it and every font uses it" works without magic. The consumers already exist and already
     ask for the slot, and `weft plugins explain text.measure` prints exactly who answers.
2. **Resolution is static and has three outcomes**, all visible in `weft check --json`:
   - **One provider:** it is bound.
   - **Zero providers:** the slot's declared default is used. `text.measure` has none, so the app is CSS-only text.
     Using a consumer that needs measurement is **P101** at the user's own line, with an autofix that adds `text()`.
   - **Two providers for a `one` slot:** **P100**, an error that names both. It is resolved explicitly in
     `slots: {}`, never by array order.
3. **Plugins contribute data, and code only through slots.**
   - `contribute(options)` is a pure function that runs once and returns a frozen manifest: providers, compiler
     feature data, diagnostics, AGENTS section, catalog entries, namespaced tokens and permissions.
   - There is no `updateConfig`, no `injectScript`, no global hook into every request, no AST access and no array-order
     semantics.
4. **The Rust compiler stays closed.** A plugin can switch on and parameterize **built-in** compiler passes (the
   `text.reserve` pass, say) with JSON data. It cannot run code inside the Rust pass.
   - Third-party transforms go in an optional `vite` field. Those hooks **must** be filtered (P107).
   - Each hook is timed per plugin, and the plugin gets a share of the HMR budget (P108).
   - `@weft/plugin-text` needs **no** Vite hooks at all.
5. **Runtime cost is 0 KB when unused, by construction.**
   - Provider runtime code can only be reached through a slot module, whose `load()` is a dynamic `import()`.
   - The size gate fails if a provider module lands in an entry chunk (P114).
6. **What "all fonts use it" means, precisely:**
   - **Global, with no call-site change:** font subsetting, metric-matched fallback faces, preloads, role strings and
     the font epoch apply to every role and every `@font-face`.
   - **Automatic wherever layout needs a height before render:** virtual lists, `pending="shape"` skeleton bars,
     `s.text()`, `<Text stream>` and `fit()`.
   - **Opt-in per node:** `<Text reserve>`, for ordinary flow text.
   - **Never:** plain `<p>` text in normal flow. CSS lays it out correctly for free, and measuring it would cost
     34.5 KB plus a `prepare` that is no cheaper than the DOM ([11 §1.6](11-text-and-type.md)).
7. **Agent surface:**
   - `weft plugins [list|explain|add|verify|audit|approve] --json`.
   - A `slots` block in `weft check --json`.
   - Per-plugin AGENTS.md sections (≤ 1 KB each, P112).
   - MCP catalog entries.
   - Diagnostics in an owned namespace with autofixes.
   - Plugin-system codes are **P100–P120**. P-codes are project hygiene, and P100+ follows the R101 precedent of a
     sub-range.
8. **Trust is a manifest plus a lockfile, not a sandbox.**
   - Node's permission model is stable but is "a seat belt", not a security boundary.
   - Plugins declare `permissions`. weft-mediated APIs (`ctx.fs`, `ctx.emit`) enforce them, and a static audit
     flags undeclared `node:fs`, `child_process`, network or `process.env` use.
   - `.weft/plugins.lock.json` pins integrity and permissions, and any widening needs `weft plugins approve` (P109,
     P110).
9. **Which existing packages become plugins:**
   - **Yes:** realtime buses, db list adapters, pay rails, surface kinds, `weft/device` modules, the Tailwind adapter
     and the text engine.
   - **warp is a plugin for its config, catalog, tokens and AGENTS section only.** Its components stay ordinary
     imports.
   - **No:** `weft/start`, `native()`/`remote()` and `@weft/multiplayer`.
10. **Phasing:**
    - Phase 1 reserves P100–P120 and the `plugins` key, at no cost.
    - The minimum API lands at the **start of Phase 2**, together with `font.build`, its first provider.
    - `text.measure` and the conformance harness land with Phase 2 Surfaces.
    - Server slots land in Phase 3, and the permissions audit and lockfile before the 3c packs.
11. **Verdict: worth it, if it stays this small.** The estimate is about 1.5–2.5k LOC of core TypeScript
    **(guess)**. It replaces four ad-hoc config switches that PLAN already has: `realtime.bus`, the pay rail
    adapters, surface `kind` registration and the font build. It also gives agents one place to ask "what provides
    X".

---

## 1. Prior art

Each row covers the mechanism, what helps an agent, and what breaks PLAN rule 2 ("no context-dependent magic"). "Breaks"
means one of three things: implicit global mutation, behaviour that depends on order, or invisible changes of meaning.

### 1.1 Bundler plugins: Rollup, Vite 8 / Rolldown, unplugin

| | Rollup / Rolldown | Vite 8 | unplugin |
|---|---|---|---|
| Shape | Plain object with a `name` and hooks. Hook kinds are `first`, `sequential` and `parallel`. Object form takes `order: 'pre'\|'post'\|null`, `sequential` and `filter` | Rollup hooks plus `config`, `configResolved`, `configureServer`, `transformIndexHtml`, `handleHotUpdate`. Takes `enforce: 'pre'\|'post'` and `apply: 'build'\|'serve'\|fn` | One `createUnplugin` factory compiled for Vite, Rollup, Rolldown, webpack, Rspack, Rsbuild, esbuild, Farm and Bun |
| Filters | `filter` on `resolveId`/`load`/`transform` (`id`, plus `code` for transform). Evaluated in Rust in Rolldown | The same. Rolldown's benchmark: 10 unfiltered JS plugins cost **3.74×** build time, and filtered ones cost ~1% ([08 §1](08-builder-and-compiler.md)) | `filter` on the same three hooks. `transformInclude` is deprecated |
| Plugin↔plugin | `this.resolve(…, { custom })` keyed by plugin name, module `meta` merged shallowly, and an `api` property found by name | The same | Per-host escape hatches (`vite:`, `webpack:` …) |
| **Works for agents** | Objects, not strings. Filters are declarative and checkable. `name` is mandatory | `apply` is a declared condition, not an `if` inside a hook | One definition, many hosts |
| **Breaks rule 2** | **Three ordering mechanisms stack:** array position, `enforce` and per-hook `order`. A `transform` can change the meaning of any module with nothing in the source to say so. `meta` merging is last-write-wins | `config` returns a partial config that is **deep-merged**, which is invisible mutation. The docs warn that "injecting other plugins inside the `config` hook will have no effect" | Semantics differ per host: `enforce` is unsupported on Rollup, Rolldown and esbuild, and Bun lacks `watchChange`. The same plugin orders differently on different hosts |

**Take:** object hooks, mandatory `name` and Rust-side filters. **Reject:** array order as semantics, `config`
deep-merge, and finding plugins by name through `api`. weft targets Vite 8 only (PLAN §3.6), so unplugin's breadth buys
nothing. A plugin's `vite` part is a plain Vite plugin.

### 1.2 Framework module systems: Nuxt, Astro, SvelteKit

| | Nuxt modules (`defineNuxtModule`) | Astro integrations | SvelteKit adapters |
|---|---|---|---|
| Shape | `meta: { name, configKey, compatibility: { nuxt: semver } }`, `defaults`, `hooks`, `setup`, and `moduleDependencies` with semver `version`, `optional`, `defaults` and `overrides` | Named object of typed lifecycle hooks: `astro:config:setup` → `…:done` → `server:*` / `build:*`. `config:setup` gets `updateConfig`, `addRenderer`, `injectScript`, `injectRoute`, `addMiddleware`, `addClientDirective`, `createCodegenDir` and a per-integration `logger`. `config:done` has `setAdapter`, `injectTypes` | `{ name, adapt(builder), emulate?, supports?: { read, instrumentation }, vite? }`. Exactly **one** `kit.adapter` |
| **Works for agents** | A semver compatibility check on the host. Options live under a `configKey` and are typed. Dependencies carry a version range, and a mismatch errors at startup | **Typed hooks** (`HookParameters<'astro:config:setup'>`). A **codegen dir per integration** (`.astro/integrations/<name>`), so generated files are on disk and attributable. A per-integration logger prefix. The `astro:` prefix is reserved | **The capability-provider model in miniature.** One slot (the adapter) with one provider, plus `supports.*()` that "throws a descriptive error" when a feature can't work on the target |
| **Breaks rule 2** | `setup` mutates `nuxt.options` freely. A dependency's `overrides` "override `nuxt.options`", so a module can silently beat user config. Declaring a dependency "does not ensure the module runs before your module". Auto-imports (`addImports`) make names appear from nowhere, which is context-dependent magic | "All integrations are run in the order that they are configured", and authors are asked to document whether they must go first or last. `updateConfig` merges into shared config. `injectScript` adds JS to **every** page, a global runtime cost. Custom hooks are typed by **global namespace augmentation** | Little. The model is too narrow (one slot) to cover weft's needs |

**Take:** Nuxt's compatibility range and versioned dependencies, Astro's typed hooks, codegen dir and logger prefix,
SvelteKit's single-provider slot with a `supports` check. **Reject:** options mutation, `overrides` over user config,
auto-imports, `injectScript`, and order-dependent integration arrays.

### 1.3 Compiler plugins: Babel, SWC, Oxc

| | Babel | SWC (Wasm plugins) | Oxc |
|---|---|---|---|
| Model | Visitor objects. **All plugins' visitors run merged in one traversal.** "Plugins run before Presets. Plugin ordering is first to last. Preset ordering is reversed (last to first)" | A Rust plugin compiled to Wasm. The AST is serialized into the plugin and back | No JS transformer plugin API **(unverified absence, [08 §1](08-builder-and-compiler.md))**. Oxlint JS plugins are alpha (2026-03-11) over raw transfer. `oxc_transformer_plugins` is a Rust crate of **built-in** transforms, not a third-party API |
| **Works for agents** | Visitors are easy to write and to read | Fast core | Fast, one parse |
| **Breaks rule 2** | Order is semantics (and reversed for presets). Two plugins on the same node interact through traversal order. ASTs cross a boundary, which is slow | **ABI coupling:** before @swc/core 1.15 a plugin generally had to be rebuilt per host release. Since 1.15 it is compatible "to some extent", but field deletions still break | — |

**Lesson for weft** (it matches [08 §9.5](08-builder-and-compiler.md)): don't expose the compiler's AST to plugins.
There is no stable Oxc AST API to expose, and Solid's crate is `publish = false`. Every bridge that has been tried
lost most of its gain to serialization. **The compiler takes plugin *data*, not plugin *code*** (§2.4).

### 1.4 Config-level plugins: Tailwind v4, ESLint flat config

| | Tailwind v4 | ESLint flat config |
|---|---|---|
| Model | **CSS-first, declarative:** `@theme` tokens, `@utility`, `@custom-variant`. JS plugins load through `@plugin`, which exists "solely for compatibility with Tailwind CSS v3.x". "Things defined in CSS will be merged where possible and otherwise take precedence over" plugins | One `eslint.config.js` array. **Plugins are imported objects**, keyed in `plugins`, and rules are namespaced as `plugin/rule`. The team called eslintrc's name-based resolution, "recreating the Node.js `require` resolution in a custom way", "a significant source of complexity" |
| **Works for agents** | Declarative contributions are inspectable and conflicts are local. The direction of travel is away from imperative plugin APIs | Objects, not strings. A namespace per plugin. One file |
| **Breaks rule 2** | "Merged where possible" is a silent merge | "The last matching config always wins", so order is semantics (although it is explicit and local) |

**Take:** declarative contributions, objects not strings, and a namespace per plugin. **Reject:** silent merge and
last-wins.

### 1.5 Server middleware: Hono, Fresh 2

| | Hono | Fresh 2 |
|---|---|---|
| Model | "The order in which Middleware is executed is determined by the order in which it is registered" (onion). Typed context: `createMiddleware<{ Variables: … }>`, `c.set` / `c.var`. Each `.use()` returns a new instance carrying the merged type | `app.use(…)` chain on an `App<State>` builder, `define.middleware()` for typing, `ctx.next()`, and file-based `_middleware.ts` per route folder |
| **Works for agents** | **Types follow the composition.** A handler can see exactly which variables are available | Typed state |
| **Breaks rule 2** | Order is semantics. That is right for middleware, which is a pipeline, and wrong for plugins, which are a set | `_middleware.ts` makes behaviour depend on file location, which is context-dependent |

**Take:** typed context accumulation as a model for typed slot availability (§2.3). **Reject:** a plugin system
where order matters. Middleware in weft stays explicit user code in `weft/start` and is not a plugin hook.

### 1.6 Trust: Node, Deno, pnpm

- **Node permission model:** `--permission` is stable since 23.5 / 22.13. It takes `--allow-fs-read/write` with paths,
  `--allow-child-process`, `--allow-worker`, `--allow-net` and `--allow-addons`. The docs say it "does not provide
  security guarantees in the presence of malicious code"; it is a "seat belt". Symlinks escape it, and existing file
  descriptors bypass it.
- **Deno:** scoped `--allow-read=./data`, `--allow-net=host` and so on. It warns to "treat `--allow-run` and
  `--allow-ffi` as equivalent to `--allow-all`".
- **pnpm 10:** dependency lifecycle scripts are **off by default**. An allowlist goes in `onlyBuiltDependencies`. The
  allowlist was bypassed for git-hosted deps in CVE-2025-69264, fixed in 10.26.

**Lesson:** in-process JS cannot be sandboxed cheaply. Make trust **visible and diffable** (a manifest and a lockfile),
enforce it where weft mediates, and offer a real process sandbox only as an opt-in CI seat belt (§2.9).

### 1.7 Summary: what weft takes

| Property | From | In weft |
|---|---|---|
| A slot with exactly one provider and a `supports` check | SvelteKit adapters | Slots with `cardinality: 'one'`, a conformance suite per slot |
| Host semver range and versioned dependencies | Nuxt `compatibility`, `moduleDependencies` | `weft: '^0.4'` peer range, slot interface versions (P102, P103) |
| Typed hooks, codegen dir, logger prefix | Astro | Typed `contribute()`, `.weft/plugins/<name>/`, diagnostics carry `owner` |
| Plugins as imported objects, namespaced rules | ESLint flat config | Slots referenced by object, diagnostics in owned namespaces |
| Declarative over imperative | Tailwind v4 | Compiler contributions are data, tokens are namespaced data |
| Rust-side filters | Rolldown | `vite` hooks must be filtered (P107) |
| Types follow composition | Hono | `.weft/slots.d.ts` types only the slots that are provided |
| **Rejected** | Babel, Vite `config`, Nuxt `setup`, Astro `updateConfig`/`injectScript`, Hono order | No config mutation, no global injection, no order semantics, no AST access |

---

## 2. The weft plugin model

### 2.1 Changes to the suggested shape

The brief's sketch was
`definePlugin({ name, version, requires, provides: { 'text.measure': … }, compiler?, vite?, runtime?, server?, diagnostics?, catalog?, tokens? })`.
Nine changes, each tied to a rule:

1. **Slots are referenced by object, not by string** (ESLint's lesson). `provide(textMeasure, …)` imports the slot
   definition, so a typo is a type error and the implementation is typed against `TextMeasureV1` without global
   augmentation. The string id (`'text.measure'`) still exists, for config, JSON output and file names.
2. **`contribute(options)` is pure and runs once.** It gets the validated options and a read-only `env` (`command`,
   `mode`, `root`, `targets`). It returns a manifest, which weft deep-freezes. It cannot see other plugins or the user
   config. This removes `updateConfig`-style mutation outright.
3. **No free-form `runtime` field.** Runtime code enters the app **only** through a slot provider's module specifier.
   It is therefore always named, always lazy and always attributable (§2.6). Astro's `injectScript` has no equivalent.
4. **No free-form `server` field either.** Server code is a provider of a server-side slot (`realtime.bus`,
   `pay.rail`, `db.adapter`). A plugin cannot add arbitrary request middleware (P118).
5. **`compiler` is data only** (§2.4).
6. **`requires` names slots, not plugins.** `requires: [fontBuild]` means "some `font.build` provider", not "the
   vendor X". Depending on a capability, not a vendor, keeps alternatives possible.
7. **`permissions` is new** (§2.9).
8. **`skeleton.shape` is dropped as a slot.** The skeleton system is core (`weft/skeleton`) and *consumes*
   `text.measure` for its line bars. A second slot for the same capability would give two ways to measure a skeleton
   bar (rule 3).
9. **`tokens` are namespaced.** A plugin may only add `--<namespace>-*` variables and `theme.<namespace>.*` values.
   Collisions are P113.

### 2.2 Slots

A slot is defined once, in core or in a package that owns a domain:

| Field | Meaning |
|---|---|
| `id` | `'<domain>.<name>'`, for example `text.measure`. Third-party slots must use their package name as the domain |
| `version` | Integer interface version. A provider declares the versions it implements |
| `cardinality` | `'one'` (exactly one binding) or `'keyed'` (one provider per key, e.g. `pay.rail` keyed by rail, `surface.renderer` keyed by `kind`) |
| `sides` | Where implementations run: `build`, `client`, `worker`, `server`, `native` |
| `default` | A built-in provider used when nobody provides one, or `null` |
| `consumers` | Informational: which packages read it (for `weft plugins explain`) |
| `conformance` | The test suite every provider must pass (§2.11) |
| `diagnostics` | The contract codes the slot owns, which fire whichever provider is bound |

**Initial slot table:**

| Slot | Card. | Sides | Default when no provider | Providers (first-party) | Phase |
|---|---|---|---|---|---|
| `font.build@1` | one | build | `null`: fonts ship as written in CSS (CSS-only). X020 warns on faces without a matched fallback | `@weft/plugin-text` | 2 |
| `text.measure@1` | one | client, worker | `null`: CSS-only text. Measured contexts are P101 | `@weft/plugin-text` (`slim` or `pretext` engine) | 2 (Surfaces) |
| `surface.renderer@1` | keyed by `kind` | client | built in: `canvas2d`, `webgl2` | `@weft/plugin-surface-keel` (`keel-pixel`) | 2 (Surfaces) |
| `realtime.bus@1` | one | server | built in: `memory` (R002 on multi-instance presets) | `@weft/plugin-bus-postgres`, `-redis`, `-nats`, `-durable-object` | 3 / 3b |
| `db.adapter@1` | keyed by name | server | built in: `drizzle` | `@weft/plugin-db-kysely`, `-prisma`, `-sql`, `-mongo` … (agorix 03) | 3c |
| `pay.rail@1` | keyed by rail | server, client, native | `null`; `weft/pay` without a rail is PAY-coded | `@weft/plugin-pay-stripe`, `-storekit`, `-play` | 6c |
| `device.<capability>@1` | keyed by target | native, client | `null`; unguarded use is N031 | `@weft/plugin-device-*` (native-module codegen) | 6b |

**Binding rules** (resolved once, at config load):

| Providers found | `one` slot | `keyed` slot |
|---|---|---|
| 0, `default` set | default bound and **reported** as `"provider": "weft:default:<name>"` | default keys bound |
| 0, `default: null` | unbound. Static consumers are **P101** (§2.6) | unbound for that key |
| 1 | bound | bound per key |
| 2+ (non-default) | **P100**, unless `slots: { 'text.measure': '@weft/plugin-text' }` names the winner | P100 for a duplicate key |

A plugin always beats the default, and that is reported, never silent. The array order of `plugins` never decides
anything. weft sorts plugins by `name` for every output, so `[a(), b()]` and `[b(), a()]` produce byte-identical
builds (tested).

### 2.3 The definition API (`weft/plugin`)

```ts
// packages/weft/src/plugin/types.ts — the whole authoring surface
import type { ZodType } from 'zod'

export interface SlotDef<Id extends string, Impl, V extends number = number> {
  readonly id: Id
  readonly version: V
  readonly cardinality: 'one' | 'keyed'
  readonly sides: readonly Side[]
  readonly default: ProviderRef<Impl> | null
  readonly __impl?: Impl                 // phantom: carries the interface type
}
export type Side = 'build' | 'client' | 'worker' | 'server' | 'native'

/** Where an implementation lives. Specifiers are resolved at config load (P101 if missing). */
export interface ModuleRef { module: string; export: string; options?: Json }   // options must be JSON (it is codegen'd)
export interface ProviderRef<Impl> {
  slot: SlotDef<string, Impl>
  versions: readonly number[]            // slot interface versions implemented
  key?: string                           // for keyed slots
  sides: Partial<Record<Side, ModuleRef>>
}

export interface Permissions {
  fs?: { read?: string[]; write?: string[] }   // globs relative to root; write is always inside .weft/plugins/<name>/
  net?: string[]                               // hosts; build-time network is denied when omitted
  env?: string[]                               // env var names readable at build/server time
  spawn?: string[]                             // executables
  native?: boolean                             // loads a napi/ffi addon (treated as "all", per Deno's guidance)
}

export interface Contributions {
  provides?: ProviderRef<unknown>[]
  requires?: SlotDef<string, unknown>[]
  compiler?: CompilerData                      // §2.4: data only
  vite?: FilteredVitePlugin[]                  // §2.5: optional, budgeted
  viteConfig?: AllowedViteConfig               // §2.5: data, merged by weft; collisions are P113
  check?: CheckHook                            // runs in `weft check` only, never on HMR
  diagnostics?: DiagnosticCatalog              // codes in the plugin's namespace (§2.8)
  agents?: { title: string; file: URL }        // ≤ 1 KB (P112)
  catalog?: CatalogEntry[]                     // MCP catalog entries
  tokens?: { namespace: string; values: Record<string, Json> }
  order?: { before?: string[]; after?: string[] }   // only for vite hooks (§2.7)
}

export interface PluginDef<O> {
  name: string                                 // must equal package.json name (P116)
  version: string                              // must equal package.json version
  weft: string                                 // semver peer range on weft (P103)
  options: ZodType<O>
  permissions: Permissions
  contribute(options: O, env: Readonly<PluginEnv>): Contributions   // pure; result frozen
}

export declare function definePlugin<O>(def: PluginDef<O>): (options?: z.input<ZodType<O>>) => PluginInstance
export declare function defineSlot<Impl>() : <Id extends string, V extends number>(s: Omit<SlotDef<Id, Impl, V>, '__impl'>) => SlotDef<Id, Impl, V>
export declare function provide<Impl>(slot: SlotDef<string, Impl>, p: Omit<ProviderRef<Impl>, 'slot'>): ProviderRef<Impl>
```

```ts
// weft.config.ts — the only place plugins are named
import { defineConfig } from 'weft/config'
import { text } from '@weft/plugin-text'
import { warp } from '@weft/warp/plugin'

export default defineConfig({
  plugins: [text({ fonts: { body: { family: 'Inter', src: './fonts/InterVariable.woff2', fallback: 'Arial' } } }), warp()],
  slots: {},            // empty unless P100 forces a choice
})
```

Putting a weft plugin's `vite` part straight into `vite.config.ts` bypasses the manifest, so it is **P120**. The
autofix moves it to `plugins`. There is one way to register a plugin.

### 2.4 Compiler: data in, never code

**Decision:** nothing from a plugin runs inside `weft-compiler`. The Rust crate owns a fixed set of **feature
passes**. A plugin's `compiler` field turns them on and passes them tables as JSON, through the same options string
the napi call already takes ([08 §9.1](08-builder-and-compiler.md): text in, code, map and diagnostics out).

```ts
interface CompilerData {
  features?: {
    'text.reserve'?: {                       // §3.3: height reservation in measured contexts
      measuredContexts: { module: string; export: string; slot: 'children' | 'row' }[]
      textComponents: { module: string; export: string; roleProp: string }[]
    }
    'skeleton.shape'?: { placeholders: Record<string, number> }   // field-name length heuristics (11 §7.1)
  }
}
```

Why only data:
- **Speed is preserved.** One parse and one `VisitMut` per file. The §3.7 compiler budget (≤ 0.5 s per 1k files) is
  unaffected by how many plugins are installed.
- **Determinism.** A feature table is hashed into the compile cache key. A plugin that changes its data invalidates
  exactly the files that pass touches.
- **No ABI.** The SWC lesson (§1.3) does not apply, because there is no AST contract to version.
- **Contexts are bound by import, not by name.** `{ module: '@weft/warp', export: 'VirtualList' }` matches an
  identifier only when `oxc_semantic` says it is bound to that import. A local `VirtualList` or an alias is handled
  correctly, so there is no name-based magic.

A third party that needs a real transform uses `vite` (§2.5). A pass worth having for everyone goes upstream into
`weft-compiler` as a new feature. That is the same rule Oxc applied to the React Compiler (08 §1: kept out of the
core binary, shipped as its own package).

### 2.5 Vite hooks: filtered, timed, budgeted

- **Only object-form hooks with `filter`** are accepted for `resolveId`, `load` and `transform`. A bare function is
  **P107** at config load. Global hooks (`configureServer`, `handleHotUpdate`) are allowed but listed in `weft plugins`.
- **The `config` hook is forbidden** (P107). It is the deep-merge mutation path from §1.1. A plugin that needs Vite
  config (an alias, say) declares it as data in `viteConfig`. weft merges it, and any key collision between plugins is
  P113. **(Design proposal: the exact allowed key set is TBD; start with `resolve.alias`, `optimizeDeps.include` and
  `assetsInclude`.)**
- **Timing:** weft wraps each hook handler with `performance.now()`, roughly 1 µs per call **(guess)**. During
  `weft dev` it writes p50/p95/p99 per plugin and per hook to `.weft/plugins/timing.json`.
- **Where timing shows up:**
  - `weft plugins --json` (`timing` field) and the dev inspector.
  - `weft tasks --json` lists the built-in `plugins bench` task, which runs the 1k-component HMR scenario per plugin.
  - The brief asked for timing *in* `weft tasks --json`. That command's contract is "what can be run" (§7b), so the
    numbers live in `weft plugins` and the runnable bench lives in `tasks`.
- **Budget:**
  - Each plugin's share of an HMR update is ≤ **5 ms p95** on the 1k-component app **(guess)**.
  - All plugins together are ≤ 10 ms, leaving 40 ms of the §3.7 50 ms for weft itself.
  - Over budget is **P108**: a warning in `weft dev` and an error in the CI bench gate.

### 2.6 Runtime: generated slot modules, lazy by construction

At config load, weft writes one module per slot to `.weft/slots/` (Astro's codegen-dir idea), plus
`.weft/slots.d.ts`. Consumers import `weft:slot/<id>`, which weft's own Vite plugin resolves with a Rust-side
`filter: { id: /^weft:slot\// }`.

```ts
// .weft/slots/text.measure.ts — generated from weft.config.ts. Do not edit (P010).
// provider: @weft/plugin-text@0.1.0 · implements text.measure@1 · engine: slim · sides: client, worker
export const provider = { plugin: '@weft/plugin-text', version: '0.1.0', interface: 1 } as const
export const load = () =>
  import('@weft/plugin-text/runtime/measure').then(m => m.createMeasure({ engine: 'slim' }))
```

```ts
// .weft/slots/text.measure.ts when nothing provides it
export const provider = null
export const load = (): never => { throw weftError('P101', 'text.measure', import.meta.url) }
```

- **0 KB when unused.** The slot module costs about 150 bytes **(guess)** and lands only in chunks that import a
  consumer. The provider's code arrives through `import()`, so it is its own chunk.
- **P114:** the prod size gate fails when a provider module lands in an entry chunk, for example because a plugin
  imported its runtime eagerly.
- **P101 is reported at the user's line, not deep in a library.**
  - Consumer packages declare which of their exports need which slot, in `package.json`:
    `"weft": { "consumes": { "text.measure": ["VirtualList", "Chat", "Feed", "Kanban"] } }`. That can be read without
    executing code.
  - The compiler's semantic pass already knows which imported bindings a file uses.
  - So `weft check` reports `src/routes/chat.tsx:14 <Chat> needs text.measure; nothing provides it`, with the autofix
    "add `text()` to `plugins`" (plus the install command).
  - In dev, the runtime throw is a fallback that names the same code.
  - In prod, the bundle check fails if the throwing stub survives tree-shaking.
- **No runtime registry or global.** The binding is a module edge decided at build time, so there is nothing to
  mutate and nothing order-dependent at runtime. `weft/test` overrides a slot per `render()` (§2.11), not by
  monkey-patching.
- **Types follow the composition** (the Hono idea). `.weft/slots.d.ts` declares only the bound slots, so importing
  `weft:slot/text.measure` without a provider is also a TypeScript error, mapped to P101.

### 2.7 Ordering and determinism

- **Declarative contributions are sets:** providers, tokens, diagnostics, catalog entries, AGENTS sections and
  compiler data. Merge is a union keyed by name. Any collision is an error (P100, P111, P113), never last-wins.
- **Imperative hooks** (`vite`, `check`) run in a topological order built from `order.before` / `order.after`, which
  name other plugins. Ties are broken by plugin name, which is deterministic but **never relied on**.
  - A cycle is **P105**, and the message prints it.
  - **Ambiguity is detected, not assumed away.** When two plugins' `transform` filters both match the same module
    id in one build and neither declares an order relative to the other, that is **P106**. The message names the
    module, both plugins and the fix (`order: { after: [...] }`). Overlapping regexes can't be decided statically, so
    the check runs on real module ids during dev and build.
- **`contribute()` purity is tested.** weft calls it twice in dev and compares the frozen results by structural hash.
  A difference (time, randomness, environment reads outside `env`) is **P117**.

### 2.8 Agent surface

- **`weft plugins`** (JSON on stdout, as every command):

  | Subcommand | Does |
  |---|---|
  | `list` (default) | Plugins, versions, slots provided and bound, permissions, timing, diagnostic namespaces |
  | `explain <slot>` | Binding chain: config entry → plugin → module → the generated file path, plus consumers found in the project |
  | `add <pkg>` | Installs, adds to `plugins` with default options, prints permissions and slots, and asks for `approve` |
  | `verify [plugin]` | Runs the conformance suite of every slot that the plugin provides (§2.11) |
  | `audit` | Static scan of each plugin's entry graph for undeclared fs, net, spawn, env and native use (P109) |
  | `approve` | Writes `.weft/plugins.lock.json` after showing the permission and integrity diff |

  ```json
  { "plugins": [{ "name": "@weft/plugin-text", "version": "0.1.0", "weft": "^0.4.0",
      "provides": [{ "slot": "font.build", "interface": 1, "bound": true },
                   { "slot": "text.measure", "interface": 1, "bound": true, "options": { "engine": "slim" } }],
      "permissions": { "fs": { "read": ["fonts/**"], "write": [".weft/plugins/@weft/plugin-text/**"] }, "native": true },
      "diagnostics": ["X003", "X004", "X022", "X023", "X050-X053"],
      "timing": { "hmr.p95_ms": 0, "build.fonts_ms": 212 } }],
    "slots": { "text.measure": "@weft/plugin-text", "font.build": "@weft/plugin-text",
               "surface.renderer": { "canvas2d": "weft:default", "webgl2": "weft:default" },
               "realtime.bus": "weft:default:memory" } }
  ```
- **`weft check --json`** gets a top-level `slots` block with the same shape, and every diagnostic carries an
  `owner` (`core`, `slot:text.measure` or `@weft/plugin-text`), so an agent knows whose docs to read.
- **AGENTS.md:** each plugin contributes one section, which may be at most 1 KB (P112). `weft agents-md` concatenates
  the sections in name order under "Plugins" and keeps the whole file under PLAN §7's 8 KB.
- **MCP:** the `catalog` tool lists plugin-contributed components, surfaces and slots. `docs` serves the plugin's
  section. `check` and `fix` include plugin diagnostics and autofixes.
- **Diagnostic namespaces:**
  - First-party plugins own letter ranges reserved in core's catalog (X for text, PAY for payments).
  - Third-party plugins use `<short-name>/<CODE>`, ESLint style (`charts/C001`). The short name is declared in the
    manifest and must be unique within the project. A code outside the plugin's namespace is **P111**.
  - Autofixes are edit lists (`{ file, span, replacement }`), the same shape as W-code fixes. They are applied only
    by `weft fix` and are rejected when they touch files outside `scope.write`.

### 2.9 Security and trust

What a plugin can do, by side:

| Side | Runs | Mediated by weft | Enforced |
|---|---|---|---|
| Config load (`contribute`) | In the `weft` process | `env` only | Purity check (P117). It must not do IO; the audit flags imports of `node:*` in the contribute graph |
| Build (`font.build`, `check`, `vite`) | In the `weft` process | `ctx.fs.read(glob)`, `ctx.emit(path)` (always under `.weft/plugins/<name>/`), `ctx.fetch` (denied unless `net` is declared) | Mediated APIs enforce `permissions`. Direct `node:fs`, `child_process`, `net`, `fetch` or `process.env` in the plugin's entry graph is P109 unless declared |
| Client | In the browser | Only through slot modules | The CSP, the secret-in-client-graph checks (PAY-codes, env) and P114 |
| Server | In the Nitro bundle | Only through server-side slots (`realtime.bus.publish`, `pay.rail.verify`) | No request middleware (P118). The slot interface decides which data it sees: `realtime.bus` sees topics and payloads, never cookies or `ctx.user`'s session |

Supply chain:
- **`.weft/plugins.lock.json`** records each plugin's name, version, tarball integrity, declared permissions and
  provided slots, and is committed.
  - `weft check` fails with **P110** when an installed plugin's integrity changed without a lock update.
  - It fails with **P109** when a new version widens `permissions`, until `weft plugins approve` shows the diff and
    rewrites the lock. A dependency upgrade can't quietly gain network access at build time.
- **Provenance:** first-party `@weft/*` plugins publish with npm provenance. `weft plugins audit` reports third-party
  plugins without it (info, not an error).
- **No install scripts.** Native parts ship as napi-rs `optionalDependencies` per platform, as `weft/compiler` does, so
  pnpm 10's default script blocking just works.
- **Seat belt for CI:** `weft build --sandbox` runs plugin build hooks in a worker under
  `node --permission --allow-fs-read=<declared> --allow-fs-write=.weft/plugins/<name>`. The docs are explicit that this
  is not a boundary against malicious code, and `native: true` defeats it (Deno's `--allow-ffi` rule). It catches
  honest mistakes and makes undeclared IO fail loudly in CI.

### 2.10 Versioning

- **Host range:** `weft: '^0.4.0'` is checked at config load. A mismatch is **P103** and names the installed weft.
- **Slot interface versions:** `text.measure@1`. Core supports a set of versions per slot. During a deprecation window
  it binds a v1 provider to a v2 consumer through a core-owned adapter, and reports that as a warning (P102w).
  A provider with no supported version is **P102**.
- **Plugin options** are Zod-validated. An invalid option is **P115** with the Zod path.
- Slots are versioned separately from weft, so warp and plugin-text can move independently as long as `@1` holds.

### 2.11 Testing: harness and conformance (`weft/test/plugins`)

```ts
import { pluginHarness, conformance } from 'weft/test/plugins'
import { textMeasure, fontBuild } from 'weft/slots'
import { text } from '@weft/plugin-text'

test('plugin-text manifest and build', async () => {
  const h = await pluginHarness(text({ fonts: fixtureFonts }), { fixture: 'fixtures/blog' })
  expect(h.diagnostics).toEqual([])                       // config-time P-codes
  expect(h.slots['text.measure'].provider).toBe('@weft/plugin-text')
  expect(h.emitted('.weft/plugins/@weft/plugin-text/fonts.css').brotli).toBeLessThan(1536)
  expect(h.timing.hmr.p95).toBeLessThan(5)
})

conformance(textMeasure, text({ engine: 'slim' }))       // the slot's own suite, browser lane
conformance(textMeasure, text({ engine: 'pretext' }))
conformance(fontBuild, text({ fonts: fixtureFonts }))
```

- **The conformance suite ships with the slot, not with the provider.** Any provider, first- or third-party, must
  pass it. `weft plugins verify` runs it in the browser lane (§7b). A failure is **P119**.
- **`text.measure@1` suite:**
  - **Accuracy corpus:** 0 height mismatches on Latin, emoji and Arabic, and ≤ 0.5% on CJK, per pinned Chrome and
    WebKit ([11 §8.4](11-text-and-type.md)). Firefox and the Android emulator lane are added when they exist.
  - **Purity:** `layout()` is called under a proxy that throws on layout-forcing DOM reads (`offsetHeight`,
    `getBoundingClientRect` …).
  - **Speed:** `layout` over 1k ≤ 0.5 ms, `prepare` over 1k ≤ 15 ms.
  - **Fonts:** after `clear()` and a font epoch bump, results match the real face.
- **`font.build@1` suite:**
  - The swap gives CLS 0 with the generated fallback.
  - The generated CSS is ≤ 1.5 KB br.
  - `fonts.json` advance tables give SSR estimates within one line for ≥ 96% of the corpus (11 §5).
- **Unit tests override a slot explicitly:** `render(<Chat />, { slots: { 'text.measure': fakeMeasure() } })`. The
  happy-dom fast lane has no canvas, so `fakeMeasure()` measures deterministically from the advance tables. The
  override is listed in the test's output, so it is visible, not ambient.

### 2.12 Rust providers (`native()` and friends)

A slot provider may be backed by a Rust crate. The TS interface stays the contract, and Rust sits behind a JS module
reference:

| Side | How | Fits? |
|---|---|---|
| build | napi-rs addon called from the provider module (bytes in, bytes out), as `weft-compiler` does | **Yes.** `font.build` in `@weft/plugin-text` is the first: metrics via `skrifa`, subsetting via a Rust subsetter (`klippa` or `subsetter`; **(unverified: maturity for variable fonts)**). `fontaine` is the JS fallback if the crate slips ([11 §6](11-text-and-type.md)) |
| server | `native()` / `remote()` from PLAN §4.3, wrapped by the provider module | **Yes, for coarse calls.** `realtime.bus` over a Rust NATS client, or `db.adapter` for a Rust store. The 06 rule holds: ≥ ~1 ms of CPU or bytes per call |
| client / worker | A WASM module loaded by the provider's `load()` | **Only if batched.** `text.measure.layout` takes ~0.2 µs per paragraph ([11 §1.6](11-text-and-type.md)). A JS↔WASM crossing per call would cost more than the work, so a Rust text provider must expose batch `layoutMany(buffer)`. A full shaper in WASM (rustybuzz/cosmic-text class) would also blow the 36 KB chunk budget **(unverified size)**. Not in v0 |
| compiler | — | **No.** §2.4. The compiler takes data |

### 2.13 Which existing weft packages become plugins

| Package | Becomes | Why |
|---|---|---|
| Realtime buses (`postgres`, `redis`, `nats`, `durable-object`) | **Plugins** for `realtime.bus` | Today this is a config string (`realtime.bus: 'redis'`). As a slot, the bus code is only installed when used, R002 becomes "default bound on a multi-instance preset", and every bus passes one conformance suite (ordering, resume, listener-before-backlog) |
| `@weft/db-*` list/cursor adapters (agorix 03) | **Plugins** for `db.adapter` (keyed) | Seven adapters with one contract. The H6 identifier pass-through bug (agorix 03) is exactly what a conformance suite catches |
| Pay rails (Stripe, StoreKit, Play, RevenueCat) | **Plugins** for `pay.rail` (keyed) | The resolver and the dated policy table stay in core `weft/pay`; a rail is an adapter. App code still never names a rail (PLAN §4.4) |
| Surface kinds (`keel-pixel`) | **Plugin** for `surface.renderer` | `weft/surface/keel` becomes `@weft/plugin-surface-keel`, which isolates the Keel licence question (PLAN §5) |
| `weft/device` capabilities and native modules | **Plugins** for `device.*` | The per-target support table already exists (N031). Native-module codegen produces the provider |
| Tailwind v4 adapter | **Plugin** (tokens and a filtered CSS hook, no slot) | It is optional styling interop |
| Text engine and font build | **Plugin** (§3) | — |
| **warp** | **Plugin for metadata only:** `warp()` contributes options (`fields: 'floating'\|'classic'`), tokens, catalog entries, AGENTS section, D-codes and `measuredContexts` compiler data | Its **components stay ordinary imports.** Making a component library a slot provider would hide where `<Button>` comes from, which is context-dependent magic. `create-weft --ui none` must keep working |
| `weft/start` (router, server functions, cache) | **No** | It is the framework. Two routers or two caches would break "one way" |
| `native()` / `remote()` | **No** | Already explicit per server function (`impl: media`). A slot would add indirection with no gain |
| `@weft/multiplayer` | **No** | A library users import. It consumes `realtime.bus` like any other code |
| `ui-core`, `weft/text` API, `weft/skeleton` | **No** | Consumer APIs that read slots. They must exist without any plugin installed |

---

## 3. The first plugin, end to end: `@weft/plugin-text`

### 3.1 Layers

```
weft (core)          weft/slots: textMeasure, fontBuild slot defs + conformance suites
                     weft-compiler: built-in 'text.reserve' and 'skeleton.shape' passes (off until fed data)
packages/text        weft/text, weft/skeleton: measure(), lines(), fit(), fonts.role(), <Text>, s.text() glue,
                     the estimator over fonts.json. Imports weft:slot/text.measure. No engine. ≤ 2 KB br
packages/text-engine the slim Pretext fork (another agent): prepare / layout / lines / clear. No weft dependency
packages/plugin-text @weft/plugin-text: provides text.measure (slim | pretext) and font.build (napi: metrics, subset,
                     fallback faces, preloads, fonts.json). Contributes compiler data, X-codes, AGENTS, catalog
```

warp, Surfaces and skeletons depend on `weft/text` (the consumer API) and **never** on `@weft/plugin-text`. That is
what makes "install it and everything uses it" true: every consumer already reads the slot.

### 3.2 What "every text use goes through it" means

| Use | Goes through the plugin? | How | Call-site change |
|---|---|---|---|
| Every `@font-face` for a role in `text({ fonts })` | **Always** (`font.build`) | Subset by `unicode-range`, generated `"<Family> Fallback"` face with `size-adjust` and overrides, preloads for the above-the-fold faces at the current dial stop, `fonts.json` (metrics plus advance tables) | none |
| Hand-written `@font-face` in app CSS pointing at a local file | **Always** | The plugin's `check` hook finds it. X020 with an autofix that moves it into `text({ fonts })` | autofix |
| Role strings for canvas and measurement (`400 16px Inter`) | **Always** | Emitted as tokens in the `text` namespace (`--text-body-canvas`), so CSS and measurement can't drift (X001) | none |
| Font epoch (re-measure when the real face loads) | **Wherever measurement runs** | `fonts.role()` bumps the epoch, and `weft/text` calls `clear()` on the slot | none |
| warp virtual lists: Chat, Feed, Kanban, VirtualList | **Automatic** | These components call `measure` for row heights. They are measured contexts by declaration (§3.3) | none |
| Skeleton line bars (`<Boundary pending="shape">`) | **Automatic** | The shape variant measures its placeholder strings at the real role and width (11 §7) | none |
| `s.text()` in Surfaces | **Automatic** | It calls `lines()` | none |
| `<Text stream>` | **Automatic** | Grow-only reservation via `layout()` | none |
| `fit()`, `fit.measure()` | **Automatic** | Calls the slot | none |
| `<Text reserve>` on ordinary prose | **Opt-in, per node** | SSR estimate, then exact on the client | add `reserve` |
| Plain `<p>{post.body}</p>`, `<Text role="body">` without `reserve` in normal flow | **No** | CSS lays it out. Nothing to measure | — |
| SSR | **The estimator, never the engine** | Advance tables from `fonts.json` (`font.build`). The server never loads the engine (11 §5) | none |

**Why measurement is not global:**
- **Cost.** The engine is a 34.5 KB br chunk (pretext; slim TBD), and `prepare` costs about what a DOM measurement
  does for Latin (8.7 vs 10 ms per 1k, [11 §1.6](11-text-and-type.md)). Measuring text that CSS already lays out
  correctly buys nothing and costs a chunk on every route, which breaks PLAN §3.7.
- **Correctness.** A forced height on flow text is a new way to clip or overflow when the prediction misses (2 per
  1,000 CJK paragraphs). It is a risk with no reward.

**Why the listed contexts are automatic rather than opt-in:**
- Each of them *already cannot work without a height before render*. A virtual list has to place rows that don't
  exist yet, a skeleton has to size bars for data it doesn't have, a canvas has to break lines, and a stream has to
  avoid upward reflow.
- Using the component is the opt-in, at the boundary. There is no second switch to forget, and no way for
  measurement to start silently somewhere it wasn't requested.

**Why `<Text reserve>` is opt-in:** its only win is avoiding SSR→client shift for text whose height matters before
data or fonts settle, such as above-the-fold prose next to a sticky element. That is a per-node judgement. A
project-wide `reserve: 'all'` mode would be the "every text node measured" cost the brief rules out.

### 3.3 The compiler hook: `text.reserve`

**Measured contexts** come from compiler data, contributed by whoever owns the component:
- **core `weft/text`:** `<Text reserve>`, `<Text stream>`;
- **core `weft/skeleton`:** the subtree of `<Boundary pending="shape">`;
- **warp (`warp().compiler`):** the row template of `VirtualList`, `Chat`, `Feed` and `Kanban`.

**Inside a measured context, the pass:**
1. Finds **text-bearing JSX nodes**: a `textComponents` entry (`<Text role>`), or an intrinsic whose children include
   an expression (`<p>{item.body}</p>`). The role is the explicit `role` prop, or the inherited role token for
   intrinsics.
2. Builds a **height equation** for the row from warp's closed vocabulary, which is why warp's no-raw-pixels rule
   (PLAN §6) pays off here:
   - `Stack` = Σ children + gaps + block padding;
   - `Row` = max(children), where the text child's width = row width − fixed siblings − gaps − inline padding;
   - `Text` = `measure(role, width).height`;
   - media = width ÷ `aspect-ratio`;
   - fixed controls = their token height.
   Token values are read at runtime from the px-resolved token table, so form factor and dial are respected.
3. **Emits** one `derived` per row: `rowHeight(item, width)` over `measure` calls. In a virtual list it is fed into
   the spacer and the `translateY` writes, and in a shape variant it gives the bar sizes.
4. **Can't compute it?** That happens with a `Row` that has two flexible text siblings, arbitrary `class`/`style`
   sizes, or a child component outside the vocabulary that has no shape. The pass emits **X054** with the reason and
   the node.
   - The fixes are to restructure, set `estimate={…}` on the row, or mark `measure="after-paint"`. With
     `after-paint` the row renders at the estimate and is read once after paint, and it is reported as
     `exact: false`.
   - The pass never guesses silently.

**Outside a measured context** the pass does nothing, at zero cost. When `text.measure` is unbound, the feature table
is absent, the pass is off, and any measured-context use is P101 (§2.6).

**Later:** `crates/weft-layout` (Taffy, PLAN §5b) with `text.measure` as Taffy's measure function would compute
heights for *any* warp tree, not just the equation subset. It is not in v0, because WASM Taffy on the web is a size
question **(unverified)**.

### 3.4 Config

```ts
// @weft/plugin-text options (Zod)
text({
  engine: 'slim',            // 'slim' (packages/text-engine, default) | 'pretext' (pinned @chenglou/pretext 1.0.0)
  measure: 'auto',           // 'auto': provide text.measure (loaded lazily by consumers) | 'off': font.build only
  fonts: {                   // role → face. The only place font files are declared when the plugin is installed
    body:    { family: 'Inter', src: './fonts/InterVariable.woff2', fallback: 'Arial', axes: { wght: [400, 600] } },
    display: { family: 'Space Grotesk', src: './fonts/SpaceGrotesk.woff2', fallback: 'Arial' },
    mono:    { family: 'IBM Plex Mono', src: './fonts/IBMPlexMono.woff2', fallback: 'Courier New', display: 'optional' },
  },
  subsets: ['latin', 'latin-ext'],   // more on demand
  worker: 'auto',            // prepare in a worker on low-memory devices (11 §5)
})
```

- **`measure: 'off'`** provides `font.build` only. If a measured context is then used, P101's message says
  "text.measure is disabled by `text({ measure: 'off' })` in weft.config.ts:4", and the autofix flips it.
- **`engine`** must pass the same `text.measure@1` conformance suite either way.
  - `slim` is the default because it is smaller. Its budget is set once the fork is measured: ≤ 36 KB br until then,
    with a target of ≤ 20 KB **(guess)**.
  - `pretext` is the escape hatch when the fork lags upstream on accuracy.
  - A call that needs a capability the selected engine lacks (for example rich-inline on `slim`, if the fork drops
    it) is **X050**.
- **Fonts move out of `theme.fonts`** (11 §8.2 had them there). With the plugin installed, `text({ fonts })` is the
  single declaration, and theme roles reference families by name. A role that names an undeclared family is **X052**.
  Without the plugin, fonts are plain CSS `@font-face` (the CSS-only path).

### 3.5 Code

**Slot definitions (core, `weft/slots`):**

```ts
// packages/weft/src/slots/text.ts
import { defineSlot } from 'weft/plugin'

export interface FontSpec { css: string; lineHeight: number; letterSpacing?: number; whiteSpace?: 'normal' | 'pre-wrap'; wordBreak?: 'normal' | 'keep-all' }
export interface Prepared { readonly __brand: 'Prepared' }
export interface LayoutLine { text: string; width: number; start: number; end: number }

/** text.measure@1. Pure: prepare() may read canvas; layout()/lines() are arithmetic and never touch the DOM. */
export interface TextMeasureV1 {
  readonly engine: { name: string; version: string }
  prepare(text: string, font: FontSpec): Prepared
  layout(p: Prepared, maxWidth: number, lineHeight: number): { height: number; lineCount: number }
  lines(p: Prepared, maxWidth: number, lineHeight: number): readonly LayoutLine[]
  clear(): void                                        // after a font epoch bump or a DPR change
  prepareMany?(items: readonly [string, FontSpec][], o: { sliceMs: number; signal: AbortSignal }): AsyncIterable<Prepared[]>
}

export const textMeasure = defineSlot<TextMeasureV1>()({
  id: 'text.measure', version: 1, cardinality: 'one', sides: ['client', 'worker'], default: null,
  consumers: ['weft/text', 'weft/skeleton', 'weft/surface', '@weft/warp'],
  conformance: () => import('weft/test/conformance/text-measure'),
  diagnostics: ['X001', 'X002', 'X054'],
})

/** font.build@1 — runs at build/dev start, cached by content hash of inputs. */
export interface FontBuildV1 {
  build(input: { roles: Record<string, RoleFont>; subsets: string[]; dialStops: string[] }, ctx: BuildCtx): Promise<{
    css: string                                        // @font-face + fallback faces, inlined into the document head
    preloads: { href: string; stop: string }[]          // per dial stop, above-the-fold only
    files: { path: string; bytes: Uint8Array }[]        // subset woff2, emitted under .weft/plugins/<name>/
    metrics: FontsJson                                 // cap/x-height, trims, per-char advance tables (SSR estimator)
  }>
}
export const fontBuild = defineSlot<FontBuildV1>()({
  id: 'font.build', version: 1, cardinality: 'one', sides: ['build'], default: null,
  consumers: ['weft (css pipeline)', 'weft/text (estimator)'],
  conformance: () => import('weft/test/conformance/font-build'),
  diagnostics: ['X020'],
})
```

**The plugin definition:**

```ts
// packages/plugin-text/src/index.ts
import { definePlugin, provide } from 'weft/plugin'
import { textMeasure, fontBuild } from 'weft/slots'
import { z } from 'zod'
import pkg from '../package.json' with { type: 'json' }

const Face = z.object({
  family: z.string(), src: z.string(), fallback: z.string(),
  axes: z.record(z.string(), z.tuple([z.number(), z.number()])).optional(),
  display: z.enum(['swap', 'optional']).default('swap'),           // never block (X021)
})
const Options = z.object({
  engine: z.enum(['slim', 'pretext']).default('slim'),
  measure: z.enum(['auto', 'off']).default('auto'),
  fonts: z.record(z.string(), Face).default({}),
  subsets: z.array(z.string()).default(['latin']),
  worker: z.enum(['auto', 'off']).default('auto'),
})

export const text = definePlugin({
  name: pkg.name, version: pkg.version, weft: pkg.peerDependencies.weft,
  options: Options,
  permissions: { fs: { read: ['**/*.{woff2,woff,ttf,otf}', 'src/**/*.css'] }, native: true },  // napi subsetter
  contribute: (o) => ({
    provides: [
      provide(fontBuild, { versions: [1], sides: {
        build: { module: '@weft/plugin-text/build/fonts', export: 'createFontBuild', options: { subsets: o.subsets } },
      } }),
      ...(o.measure === 'auto' ? [provide(textMeasure, { versions: [1], sides: {
        client: { module: '@weft/plugin-text/runtime/measure', export: 'createMeasure', options: { engine: o.engine } },
        worker: { module: '@weft/plugin-text/runtime/measure.worker', export: 'createMeasure', options: { engine: o.engine } },
      } })] : []),
    ],
    compiler: o.measure === 'auto' ? { features: {
      'text.reserve': {
        measuredContexts: [{ module: 'weft/skeleton', export: 'Boundary', slot: 'children' }],  // pending="shape" only
        textComponents: [{ module: 'weft/text', export: 'Text', roleProp: 'role' }],
      },
    } } : undefined,
    check: { files: /\.css$/, run: findHandWrittenFaces },          // X020 with autofix into text({ fonts })
    diagnostics: { owner: pkg.name, codes: ['X003', 'X004', 'X022', 'X023', 'X050', 'X051', 'X052', 'X053'] },
    agents: { title: 'Text and fonts', file: new URL('../AGENTS.section.md', import.meta.url) },
    catalog: [{ kind: 'option', name: 'text.engine', values: ['slim', 'pretext'] }],
    tokens: { namespace: 'text', values: roleTokens(o.fonts) },    // --text-<role>-canvas: '400 16px Inter'
  }),
})
```

```ts
// packages/plugin-text/src/runtime/measure.ts — the only code that reaches the client, as its own chunk
import type { TextMeasureV1 } from 'weft/slots'

export async function createMeasure({ engine }: { engine: 'slim' | 'pretext' }): Promise<TextMeasureV1> {
  const e = engine === 'slim' ? await import('@weft/text-engine') : await import('./pretext-adapter')
  return {
    engine: { name: engine, version: e.version },
    prepare: (t, f) => e.prepare(t, f.css, { whiteSpace: f.whiteSpace, wordBreak: f.wordBreak, letterSpacing: f.letterSpacing }),
    layout: (p, w, lh) => e.layout(p, w, lh),
    lines: (p, w, lh) => e.lines(p, w, lh),
    clear: () => e.clear(),
  }
}
```

**How `weft/text` consumes the slot.** This is what every consumer (warp, Surfaces, skeletons) calls:

```ts
// packages/text/src/measure.ts
import { derived, resource, type Derived } from 'weft'
import * as slot from 'weft:slot/text.measure'          // → .weft/slots/text.measure.ts (generated, readable)
import { estimate } from './estimate'                    // advance tables from font.build's fonts.json; ~0.6 KB
import type { FontRole } from './fonts'

export interface Measured { height: number; lineCount: number; exact: boolean }

export function measure(text: () => string, role: Derived<FontRole>, width: Derived<number>): Derived<Measured> {
  const engine = resource(() => slot.load())             // import() is cached by the module system; one chunk per app
  const prepared = derived(() => {
    const e = engine.value, r = role.value
    return e && r.loaded ? e.prepare(text(), r.spec) : null   // reads r.epoch via r.loaded → re-prepares once on font load
  })
  return derived(() => {
    const p = prepared.value, r = role.value
    if (!p) return { ...estimate(text(), r, width.value), exact: false }   // SSR, chunk loading, font not loaded
    const { height, lineCount } = engine.value!.layout(p, width.value, r.spec.lineHeight)
    return { height, lineCount, exact: true }
  })
}
```

**How warp consumes it.** This is an ordinary component. It imports `weft/text`, not the plugin:

```tsx
// @weft/warp — Chat (abridged). package.json: "weft": { "consumes": { "text.measure": ["Chat", "Feed", "Kanban", "VirtualList"] } }
import { Text } from 'weft/text'                   // the row's measure() calls are emitted by the compiler (§3.3)
import { VirtualList } from './VirtualList'          // VirtualList itself imports measure() from weft/text

export function Chat({ messages }: { messages: Message[] }) {
  return (
    <VirtualList items={messages} key={m => m.id}>
      {(m, width) => {
        // The text.reserve pass sees this row template (VirtualList is a measured context) and emits the row's
        // height equation: pad + avatarRow + measure(m.body @ role body, width − pad·2 − avatar − gap).
        return (
          <Stack gap="related" pad="related">
            <Row gap="related"><Avatar user={m.author} size="sm" /><Text role="label">{m.author.name}</Text></Row>
            <Text role="body">{m.body}</Text>
          </Stack>
        )
      }}
    </VirtualList>
  )
}
```

```ts
// warp's plugin part: metadata only. It declares its measured contexts; it provides no slot
export const warp = definePlugin({
  name: '@weft/warp', version, weft: '^0.4.0', options: WarpOptions, permissions: {},
  contribute: (o) => ({
    compiler: { features: { 'text.reserve': { measuredContexts: ['VirtualList', 'Chat', 'Feed', 'Kanban']
      .map(e => ({ module: '@weft/warp', export: e, slot: 'row' as const })), textComponents: [] } } },
    tokens: { namespace: 'warp', values: warpTokens(o) },
    agents: { title: 'warp', file: new URL('../AGENTS.section.md', import.meta.url) },
    catalog: warpCatalog,
  }),
})
```

When two plugins contribute to the same compiler feature (here plugin-text and warp both add `text.reserve` data),
the tables are unioned. A duplicate `(module, export)` with different values is P113.

**Surfaces:** `s.text({ role })` calls `lines()` from `weft/text`. `surface.renderer` and `text.measure` are separate
slots, so a `keel-pixel` renderer gets canvas text and the mirror for free.

### 3.6 X-code ownership

Codes keep their numbers from [11 §8.5](11-text-and-type.md). Ownership decides who documents a code, where it fires
without the plugin, and which package's version can change its behaviour. **Rule:** a code about the *contract*
belongs to the slot (core) and fires for any provider or for the absence of one. A code about *one implementation*
belongs to the plugin.

| Code | Owner | Fires without the plugin? |
|---|---|---|
| X001 measured ≠ rendered (dev sampling) | `slot:text.measure` | no (nothing is measured) |
| X002 `system-ui` on a measured role | `slot:text.measure` | no |
| X003 prepare before the font loads, no fallback face | `@weft/plugin-text` | no |
| X004 a style the engine can't predict (`balance`, `hyphens: auto`, `tabular-nums`, `opsz` …) | `@weft/plugin-text` (the list depends on the engine) | no |
| X005, X006, X008 fluid-type and zoom rules | core (CSS type) | **yes** |
| X010–X012 canvas text without a mirror, mirror hidden, fallbacks disabled | core (`weft/surface`) | **yes**. `s.text()` itself needs the slot (P101) |
| X020 `@font-face` without a generated fallback | `slot:font.build` | **yes**, as a warning. The autofix adds `text()` |
| X021 `font-display: block\|auto` | core (CSS type) | **yes** |
| X022 font not subset, or over budget | `@weft/plugin-text` | no |
| X023 preload not used above the fold, or display face not preloaded | `@weft/plugin-text` | no |
| X030–X034, X036 skeleton rules | core (`weft/skeleton`) | **yes** (bars fall back to estimates) |
| X035 streamed text without `<Text stream>` | core (`weft/text`) | **yes** |
| X040, X041 per-glyph DOM motion | core (warp/ds) | **yes** |
| **X050** (new) a call needs an engine capability the selected `engine` lacks | `@weft/plugin-text` | no. Fix: `engine: 'pretext'` |
| **X051** (new) a font `src` is remote or missing | `@weft/plugin-text` | no. Fix: self-host the file |
| **X052** (new) a theme role names a family not declared in `text({ fonts })` | `@weft/plugin-text` | no |
| **X053** (new) `weft plugins verify` corpus result older than the pinned engine or browser | `@weft/plugin-text` | no |
| **X054** (new) row height not computable in a measured context | `slot:text.measure` (core compiler pass) | no |

### 3.7 Agent surface of the text plugin

- **AGENTS section** (≤ 1 KB):
  - `<Text role>` for all text, and `reserve` only for above-the-fold prose whose height matters.
  - Lists and chat use warp `VirtualList`/`Chat`, and heights are automatic.
  - Never call `fillText`; use `s.text()`.
  - Fonts are declared only in `text({ fonts })`.
  - `weft plugins explain text.measure` shows the binding.
- **Catalog:** the `engine` and `measure` options, the font roles with their families and fallback metrics, and
  `fit`.
- **`weft check --json` extract:**

  ```json
  { "code": "P101", "owner": "core", "file": "src/routes/chat.tsx", "span": [14, 5, 14, 11],
    "why": "<Chat> needs text.measure (row heights); nothing provides it",
    "fix": { "edits": [{ "file": "weft.config.ts", "insert": "text()", "at": "plugins" }],
             "install": "pnpm add @weft/plugin-text" } }
  ```

### 3.8 Budgets for plugin-text

| Metric | Budget | Basis |
|---|---|---|
| Base runtime when no measured context is used | **0 KB** | §2.6 |
| `weft:slot/text.measure` module | ≤ 0.2 KB br **(guess)** | generated loader |
| Engine chunk | pretext ≤ 36 KB br (34.5 measured); slim ≤ 36 KB until measured, target ≤ 20 KB **(guess)** | 11 §8.4 |
| Generated font CSS | ≤ 1.5 KB br, inlined | 11 §8.4 |
| HMR cost on `.tsx` edits | **0 ms** (no Vite hooks; compiler data is hashed into the cache key) | §2.4 |
| Font build, cold, per face | ≤ 300 ms **(guess)**; warm (hash hit) ≤ 5 ms | napi subsetter |
| Config load (`contribute` + resolve) | ≤ 5 ms | — |
| Accuracy, speed and CLS | as 11 §8.4, enforced through the `text.measure@1` and `font.build@1` conformance suites | — |

---

## 4. PLAN integration

### 4.1 Package layout

```
packages/
  weft          + weft/plugin (definePlugin, defineSlot, provide), weft/slots (core slot defs),
                  weft/test/plugins (harness, conformance), `weft plugins` CLI, .weft/slots codegen
  text          weft/text + weft/skeleton consumer APIs, no engine
  text-engine   slim Pretext fork (library, no weft dependency)            ← other agent; untouched here
  plugin-text   @weft/plugin-text: text.measure + font.build providers
  plugin-bus-*  @weft/plugin-bus-postgres | -redis | -nats | -durable-object     (Phase 3 / 3b)
  plugin-db-*   @weft/plugin-db-kysely | -prisma | …                             (3c)
  plugin-pay-*  @weft/plugin-pay-stripe | -storekit | -play                      (6c)
  plugin-surface-keel, plugin-device-*, plugin-tailwind
crates/
  weft-fonts    metrics (skrifa) + subsetting, napi; used by plugin-text's font.build
```

**Naming rule:** anything that goes in `plugins: []` is `@weft/plugin-*`, except warp, which is
`@weft/warp/plugin`, a subpath of the kit. An agent can tell from the import what kind of thing it is. PLAN §8's
`text` line splits into `text` (API) and `plugin-text` (engine and fonts), and `pay`'s adapters and `realtime`'s
buses move out to `plugin-*`.

### 4.2 Phase placement

| Phase | Plugin-system work |
|---|---|
| **1** | Reserve P100–P120 in the catalog, reserve the `plugins` and `slots` keys in the `weft.config.ts` schema (empty), and generate `.weft/slots/` with the built-in defaults only. No `definePlugin` yet: nothing in Phase 1 needs a provider, and designing the API without one real plugin is speculative |
| **2 (start)** | The minimum API: `definePlugin`, `defineSlot`, `provide`, `one` slots, generated slot modules plus `slots.d.ts`, `weft plugins list\|explain\|add`, a `slots` block in `weft check`, P100–P107, P111–P117, P120. The **first provider is `font.build`** in `@weft/plugin-text`, landing with warp tier 1's font build step |
| **2 (Surfaces)** | `text.measure` (slim and pretext), the `text.reserve` compiler pass for `<Text reserve>` and `Boundary`, `weft/test/plugins` with conformance and `plugins verify` (P119), `keyed` slots plus `surface.renderer` and `keel-pixel`, Vite hook timing plus P108 |
| **3** | Server-side slots: `realtime.bus` (`memory` default, postgres provider), P118. warp's measured contexts land with 3c's virtual lists |
| **3c (before the packs)** | Permissions audit, `.weft/plugins.lock.json`, `approve`, P109, P110, and `--sandbox` in CI. The Agorix packs are the first plugins not written alongside core, so trust tooling lands before they do. `db.adapter` and the bus packs |
| **6b / 6c** | `device.*` and `pay.rail` providers |

### 4.3 Budgets added to §3.7

| Metric | Budget |
|---|---|
| Plugin resolution at config load | ≤ 5 ms per plugin, ≤ 30 ms for 10 **(guess)** |
| HMR overhead per plugin | ≤ 5 ms p95; all plugins ≤ 10 ms; total stays ≤ 50 ms p95 |
| Unfiltered `resolveId`/`load`/`transform` hooks | **0** (P107) |
| Runtime added by an installed but unused plugin | **0 KB** (P114) |
| Slot loader module | ≤ 0.2 KB br per consumed slot |
| Determinism | byte-identical prod output for any permutation of `plugins: []` |
| AGENTS.md section | ≤ 1 KB per plugin; whole file ≤ 8 KB |

### 4.4 Diagnostics: P100–P120 (plugin system)

These are unused P numbers: P001–P008 and P010 are taken; P009 is left as a gap.

| Code | Catches | Fix |
|---|---|---|
| P100 | Two providers for a `one` slot (or the same key in a `keyed` slot) | Remove one, or name the winner in `slots: {}` |
| P101 | A consumer of a slot is used, but nothing provides it (reported at the user's line; also the TS error on `weft:slot/*`) | Add the plugin (autofix plus install command), or set the option that disables it back |
| P102 | Provider implements no slot interface version this weft supports. P102w: bound through a deprecation adapter | Upgrade the plugin or weft |
| P103 | Plugin's `weft` peer range doesn't include the installed weft | Upgrade either side |
| P104 | `requires` names a slot that nothing provides | Add a provider |
| P105 | Cycle in `order.before`/`after` | Remove one edge (the cycle is printed) |
| P106 | Two plugins' `transform` filters matched the same module with no declared order | Add `order.after` to one |
| P107 | Unfiltered `resolveId`/`load`/`transform`, or a `config` hook | Add `filter`; move config to data |
| P108 | Plugin over its HMR budget share | Narrow filters, cache, or move work to `check` |
| P109 | Undeclared permission used (audit), or permissions widened since the lock | Declare it, then `weft plugins approve` |
| P110 | Installed plugin integrity differs from `.weft/plugins.lock.json` | Reinstall, or approve the update |
| P111 | Diagnostic code outside the plugin's namespace, or namespace collision | Use `<short-name>/<CODE>` |
| P112 | AGENTS section over 1 KB | Shorten; move detail to the MCP `docs` tool |
| P113 | Token, catalog, compiler-data or Vite-config key collision | Rename in the namespace |
| P114 | Provider runtime code in an entry chunk (eager import) | Reach it only through the slot's `load()` |
| P115 | Invalid plugin options (Zod path given) | Fix the option |
| P116 | Same plugin twice, or `name`/`version` doesn't match `package.json` | Remove the duplicate |
| P117 | `contribute()` not pure (results differ between two calls, or it does IO) | Move IO to a build-side provider |
| P118 | Server code registered outside a server-side slot (request middleware, route injection) | Provide a slot, or move it into app code |
| P119 | Provider failed its slot's conformance suite | Fix the provider; the failing cases are listed |
| P120 | A weft plugin's `vite` part registered directly in `vite.config.ts` | Move it to `plugins` in `weft.config.ts` (autofix) |

---

## 5. Risks

- **Over-generalisation.** A plugin system invites a slot for everything. **Mitigation:** a slot needs two real
  providers or a real "absent" mode before it is added. `skeleton.shape` was dropped by that rule (§2.1). The initial
  table (§2.2) has seven slots, each replacing an existing ad-hoc switch.
- **Interfaces ossify early.** `text.measure@1` is fixed before the slim fork is measured. **Mitigation:** integer
  interface versions with a core-owned adapter window (P102w), and v1 kept to the four calls the fork already has.
- **"All fonts use it" gets misread** as "all text is measured", and someone adds `reserve` everywhere. **Mitigation:**
  §3.2 is the AGENTS wording, and X001 sampling plus the size gate show the cost.
- **The equation subset is too small.** Real chat rows have reactions, attachments and quoted replies, so X054 may
  fire often. **Mitigation:** warp ships row parts inside the vocabulary. If X054 dominates in 3c, move to Taffy with
  `text.measure` as its measure function (§3.3).
- **Hook timing has overhead and noise.** Wrapping costs µs, and shared-machine timings lie (08 §8). **Mitigation:**
  P108 is a warning locally and a gate only on the quiet-runner bench, on ratios.
- **Security theatre.** A manifest can be dishonest, and in-process JS can't be fenced. **Mitigation:** the doc and
  the CLI say so plainly. The value is in the *diff* (`approve` on widening) and the audit, not a sandbox claim.
- **Generated files go stale.** `.weft/slots/` is regenerated on every config load, and `weft check` fails on hash
  drift (P010 already forbids editing generated files).
- **Two engines double the test matrix.** **Mitigation:** both run one conformance suite. If `slim` passes and stays
  smaller for two releases, `pretext` becomes "unsupported but allowed".
- **Third-party ecosystem pressure for AST access.** People will ask for Babel-style transforms. **Answer:** `vite`
  hooks with filters and budgets exist for that. The compiler stays closed, and good passes go upstream.

## 6. Is it worth it?

| Piece | Verdict |
|---|---|
| Slots with providers, defaults and P100/P101 | **Yes.** This is what makes "add `text()` and everything uses it" true with nothing hidden, and it absorbs `realtime.bus`, pay rails, surface kinds and device modules into one model with one diagnostic set |
| Generated slot modules (`.weft/slots/*.ts`) | **Yes.** They make the binding readable on disk, lazy by construction (0 KB unused) and type-checked |
| Conformance suites per slot | **Yes.** The accuracy corpus and the bus ordering tests already have to exist; attaching them to the slot makes them apply to every provider |
| Compiler contributions as data | **Yes.** It keeps the 0.5 s / 1k compiler budget and the single-parse rule intact |
| `weft plugins` and the `slots` block in `weft check` | **Yes, cheap.** It is the agent's single answer to "what provides X" |
| Filtered, timed `vite` hooks | **Yes, but minimal.** First-party plugins need almost none; it exists for third parties |
| Permissions manifest, audit and lockfile | **Yes, from 3c.** Visible trust diffs at low cost. Not before third-party packs exist |
| `--sandbox` | **Optional CI seat belt only** |
| Rust compiler plugins | **No** |
| Turning warp components or `weft/start` into providers | **No.** It would hide where code comes from |
| A general event or hook bus between plugins | **No.** This is the Nuxt/Astro/Babel failure mode. Slots are the only channel |

**Overall:** build it, small, at the start of Phase 2, with `@weft/plugin-text` as the proving case. It needs no
Vite hooks, has a 0 KB unused cost, binds two slots, contributes compiler data and owns codes. If the text plugin
can't be expressed cleanly in this model, the model is wrong, and it is cheaper to find that out with one plugin than
with seven.

---

## Sources

- Vite plugin API (`enforce`, `apply`, hook filters, `config` deep-merge warning, `handleHotUpdate`):
  https://vite.dev/guide/api-plugin
- Rollup plugin development (hook kinds, `order`, `sequential`, `filter`, `custom` resolver options, module `meta`):
  https://rollupjs.org/plugin-development/
- Rolldown hook filters: https://rolldown.rs/plugins/hook-filters · https://rolldown.rs/in-depth/why-plugin-hook-filter
  (benchmark figures as cited in [08 §1](08-builder-and-compiler.md))
- unplugin guide (hosts, hooks, filters, per-host limitations): https://unplugin.unjs.io/guide/
- Nuxt module author guide: https://nuxt.com/docs/4.x/guide/modules ·
  module anatomy (`meta.name`, `configKey`, `compatibility`, "does not ensure the module runs before your module"):
  https://nuxt.com/docs/4.x/guide/modules/module-anatomy ·
  module dependencies (`version`, `optional`, `overrides`, `defaults`): https://nuxt.com/docs/4.x/guide/modules/module-dependencies
- Astro integration API (hooks, `astro:config:setup` options, `HookParameters`, custom hooks via global augmentation,
  "run in the order that they are configured", `createCodegenDir`, `injectTypes`):
  https://docs.astro.build/en/reference/integrations-reference/
- SvelteKit writing adapters (`name`, `adapt`, `emulate`, `supports.read`, `supports.instrumentation`):
  https://svelte.dev/docs/kit/writing-adapters
- Babel plugin ordering: https://babeljs.io/docs/plugins
- SWC Wasm plugin compatibility (1.15, cbor, `Unknown` variants): https://swc.rs/docs/plugin/ecmascript/compatibility
- Oxc: `oxc_transformer_plugins` crate https://docs.rs/crate/oxc_transformer_plugins ; Oxlint JS plugins alpha and
  raw transfer as cited in [08 §1](08-builder-and-compiler.md)
- Tailwind v4 directives (`@theme`, `@utility`, `@custom-variant`, `@plugin` "solely for compatibility"):
  https://tailwindcss.com/docs/functions-and-directives
- ESLint flat config: https://eslint.org/docs/latest/use/configure/configuration-files · rationale:
  https://eslint.org/blog/2022/08/new-config-system-part-2/
- Hono middleware (registration order, typed `Variables`): https://hono.dev/docs/guides/middleware
- Fresh 2 middleware (`app.use`, `define.middleware`, `_middleware.ts`): https://usefresh.dev/docs/concepts/middleware
- Node permission model (stable 23.5 / 22.13, "seat belt", symlink and fd limitations): https://nodejs.org/api/permissions.html
- Deno security and permissions: https://docs.deno.com/runtime/fundamentals/security/
- pnpm 10 lifecycle scripts off by default: https://socket.dev/blog/pnpm-10-0-0-blocks-lifecycle-scripts-by-default ·
  CVE-2025-69264: https://osv.dev/GHSA-379q-355j-w6rj
- weft: PLAN §2, §3.5–§3.7, §4.2–§4.4, §5, §5b, §6.1–§6.2, §7, §7b, §8, §9 · research [06](06-runtimes-and-rust.md),
  [08](08-builder-and-compiler.md), [11](11-text-and-type.md), [05 §5.3](05-testing-browser-cli.md),
  [agorix 03](agorix/03-server-realtime-data.md) (db adapters, buses, H6)
