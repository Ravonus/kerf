<p align="center">
  <a href="https://github.com/Ravonus/weft">
    <img src="https://raw.githubusercontent.com/Ravonus/weft/main/site/public/logo.svg" width="88" height="88" alt="Weft">
  </a>
</p>

<h1 align="center">weft-compiler</h1>

<p align="center">
  <strong>Weft's TSX compiler, in Rust on Oxc: one parse per file, diagnostics with fixes, DOM or SSR output.</strong><br>
  One crate behind a Node addon and a WebAssembly build that return the same bytes, so nobody needs Rust to use Weft.
</p>

<p align="center">
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/license-MIT-145c3c" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/rust-1.99.1-145c3c" alt="Rust toolchain 1.99.1">
  <img src="https://img.shields.io/badge/oxc-0.144-145c3c" alt="Oxc 0.144">
</p>

<p align="center">
  <a href="#build-and-test">Build and test</a> ·
  <a href="#the-passes-in-order">Passes</a> ·
  <a href="#diagnostics-catalog">Diagnostics</a> ·
  <a href="../../site/content/learn/diagnostics.md">Diagnostics guide</a> ·
  <a href="../README.md">All crates</a>
</p>

> [!NOTE]
> This crate is internal. Its `Cargo.toml` sets `publish = false`, so it is not on crates.io. Apps get it through
> `@weft-js/core`, which ships the WASM build and lists a prebuilt addon per platform as an optional dependency. You
> only build this crate when you work on Weft itself.

The compiler reads a `.tsx` file once with [Oxc](https://oxc.rs), checks it for the mistakes Weft's model makes easy
(reading a prop once in a body that runs once, writing state inside `derived`, an unkeyed `.map`, and so on), and
lowers its JSX to template clones and fine-grained bindings against `@weft-js/core/dom`, or to server code against
`@weft-js/core/ssr`. Every diagnostic has a stable code, a one-line reason, help text and, where the change is
mechanical, an autofix. The same `compile()` serves `weft check` (diagnostics only), the Vite plugin and the `weftc`
command line.

## Highlights

- **One parse per file.** Oxc parses once; `analyze` reads the program with scopes and symbols, `transform` rewrites
  the same AST, and the back end lowers the printed result (`src/lib.rs`).
- **Its own back end.** `emit` lowers JSX to `_$tpl` template clones, one `_$bind` per element's dynamic attributes,
  delegated `_$on` events and keyed lists (`src/emit.rs`).
- **Diagnostics as data.** Each `Diagnostic` carries `code`, `severity`, `message`, `help`, a span, a 1-based line and
  UTF-16 column, and an optional `Fix` whose `safe` flag says `weft fix` may apply it unasked (`src/diag.rs`).
- **Text in, JSON out.** Every binding calls `transform_json(source, options_json)`. No AST crosses a boundary, so the
  addon and the WASM build differ only in how the text travels.
- **Same bytes on both builds.** `packages/core/scripts/parity.mjs` compiles every `.tsx` in the repo through the addon
  and the WASM build, in every output mode, and compares the JSON each returns.
- **SSR, hydration, HMR, shapes and style groups.** One `Options` struct selects DOM or SSR output, hydratable markup,
  partial-hydration islands, dev HMR registration, skeleton "shape" variants and build-time style groups.
- **Source maps back to the authored file.** Codegen's map goes through the emitter, so positions in output map to the
  `.tsx` you wrote (`src/srcmap.rs`).

## Contents

- [How Weft uses it](#how-weft-uses-it)
- [Architecture](#architecture)
- [The passes, in order](#the-passes-in-order)
- [Options and output](#options-and-output)
- [What the lowering looks like](#what-the-lowering-looks-like)
- [Diagnostics catalog](#diagnostics-catalog)
- [The `weftc` command line](#the-weftc-command-line)
- [Node-API and WASM builds](#node-api-and-wasm-builds)
- [Platform builds](#platform-builds)
- [Build and test](#build-and-test)
- [Troubleshooting](#troubleshooting)
- [Related](#related)

## How Weft uses it

`packages/core/compiler.cjs` loads the compiler and exports `transform(source, options)` and `backend`. It picks the
fastest build this machine has, in this order:

1. the Node addon built in this checkout, `packages/core/native/weft-compiler.<platform>-<arch>.node`;
2. the prebuilt addon for this platform, `@weft-js/compiler-<name>`, an optional dependency of `@weft-js/core`;
3. the WASM build shipped in `@weft-js/core`, `native/weft-compiler.wasm`, which runs anywhere.

`WEFT_COMPILER=native` or `WEFT_COMPILER=wasm` pins one, for the parity gate and the bench. In a checkout, each binary
carries a source stamp, and the loader refuses one that is older than `crates/weft-compiler` (see
[Troubleshooting](#troubleshooting)).

The Vite plugin (`packages/core/vite.mjs`) calls `transform` for every component module, and `weft check` calls it with
`checkOnly: true` and joins the per-file `facts` across the project.

## Architecture

```text
src/
├── lib.rs           Options, Output, compile(), transform_json(): the pipeline
├── diag.rs          Diagnostic, Severity, Fix, Edit; line_col() in UTF-16 columns
├── analyze.rs       read-only pass: components, props, boxes, lists → Plan + diagnostics
│   └── analyze/     one module per rule family (props, lists, react, early_returns, numeric_*,
│                    async_callbacks/, handler_mutations/, aliases, body_reads, row_entries, …)
├── browser.rs       @weft-js/core/browser checks (W050–W056), its own read-only pass
│   └── browser/     context, diagnostics, visitor
├── style.rs         style groups: evaluate group() at build, lower call sites to attributes (W060, D024, D025)
│   └── style/       values, lower, visitor
├── shape.rs         `Name$shape` skeleton variants for <Boundary pending="shape">
│   └── shape/       collect, elements, generate
├── hydration.rs     partial hydration: per-file facts, island marking (SSR) and hoisting (DOM)
│   └── hydration/   facts, islands, scan, traverse, visit, loose, escapes
├── transform.rs     applies the Plan: props → live reads, JSX .map → <For>
│   └── transform/   components, lists, nodes, rewrites, visitor
├── hmr.rs           dev-only: _$keep state across hot updates, register components, name graph nodes
├── emit.rs          the back end: JSX → template clones and bindings (DOM) or server code (SSR)
│   └── emit/        attrs, children, component, constants, helpers, list, lower, props, template, values, walk
├── srcmap.rs        position markers through emit, decoded into a source map to the authored file
├── react.rs         React prop names on native elements, resolved at compile time
├── project.rs       Facts for `weft check`'s project view; link_w014() joins W014 across files
├── node.rs          Node-API binding (feature `node`)
├── wasm.rs          WebAssembly binding (target wasm32)
└── bin/weftc.rs     the command line
```

Public surface of the library: `compile`, `transform_json`, `Options`, `Output`, `Diagnostic`, `Severity`, `Fix`,
`Edit`, `Facts`, and the `hydration`, `project` and `style` modules.

## The passes, in order

`compile()` in `src/lib.rs` runs these steps on one file. Each step names the function that does it.

| # | Step | Function | Runs when |
|---|------|----------|-----------|
| 1 | Append each island call site as an export, so every later pass reads it as authored code | `hydration::hoisted` | DOM output with `islands` set, not `checkOnly` |
| 2 | Parse with Oxc. Any syntax error returns `W000` diagnostics and no code; nothing else is checked | `Parser::parse` | always |
| 3 | Build scopes and symbols | `SemanticBuilder` | always |
| 4 | Analyze: find components, props, boxes and lists; produce a `Plan` and the W-diagnostics | `analyze::analyze` | always |
| 5 | Collect partial-hydration facts for the project's view | `hydration::facts` | always |
| 6 | Browser checks: listeners, intervals, sockets, owners, `media()` under SSR | `browser::check` | always |
| 7 | Style groups: evaluate `group()` definitions, lower call sites to attributes | `style::apply` | always |
| 8 | Keep diagnostics inside the authored text, sort by position. With `checkOnly`, list shape exports and return | | always |
| 9 | Write shape variants (`Name$shape`) | `shape::apply` | not `checkOnly` |
| 10 | Mark island call sites for the server | `hydration::mark` | SSR, `hydratable`, `islands` set |
| 11 | Apply the plan: props become live reads, JSX `.map` becomes a keyed `<For>` | `transform::apply` | not `checkOnly` |
| 12 | Register components for hot updates, and name boxes and derived values for the graph | `hmr::apply`, `hmr::names` | `dev` DOM output (`hmr::apply` also needs `hmr`) |
| 13 | Print the program with Oxc codegen and append the shape variants | `oxc_codegen::Codegen` | not `checkOnly` |
| 14 | Lower JSX to DOM or SSR code, decode source-map markers, append the HMR footer | `emit::emit` | not `checkOnly` |

If the back end fails on the printed program, its error becomes a `W000` diagnostic and `code` is `null`.

## Options and output

`Options` deserializes from camelCase JSON, and every field has a default, so `{}` is a valid options object.

| Option | Type | Default | What it does |
|---|---|---|---|
| `filename` | string | `"input.tsx"` | Picks the source type (`.ts`, `.tsx`, …) and appears in dev comments and source maps |
| `moduleName` | string | `"@weft-js/core/dom"` | Runtime module the DOM back end imports helpers from. SSR output switches the default to `@weft-js/core/ssr` |
| `checkOnly` | bool | `false` | Analysis and diagnostics only, no code (what `weft check` uses) |
| `dev` | bool | `false` | Dev output: a `// file:line <tag>` comment per template, and graph names in DOM output |
| `sourceMap` | bool | `false` | Return a JSON source map to the authored file in `map` |
| `generate` | `"dom"` \| `"ssr"` | `"dom"` | Output mode |
| `hydratable` | bool | `false` | DOM output that adopts server-rendered nodes; SSR output that marks them |
| `explain` | bool | `false` | Also return what each JSX node became, in `explain` (`weftc --explain` uses it) |
| `hmr` | bool | `false` | Dev DOM output only: register components for hot updates and keep their state |
| `groups` | object | `{}` | Style groups defined in other modules, keyed `"<absolute path without extension>#<export>"` |
| `taggedParts` | bool | `false` | Group parts carry `data-g` as well as `data-part` |
| `shapes` | object \| null | `null` | Emit a shape variant of each component; lists imported components that have one |
| `islands` | object \| null | `null` | The call sites the project made islands. `null`: every component hydrates |
| `cwd` | string \| null | `null` | Working directory, for a build with no filesystem of its own (the WASM binding) |
| `off` | string \| null | `null` | `WEFT_OFF`, for a build with no environment of its own (the WASM binding) |

`Output` serializes to:

| Field | What it holds |
|---|---|
| `code` | The compiled module, or `null` after a syntax error or with `checkOnly`. TypeScript syntax is kept; Vite's Oxc pass strips it |
| `map` | The source map as JSON text, when `sourceMap` is set |
| `diagnostics` | `Diagnostic[]`, sorted by position |
| `facts` | Per-file facts for `weft check`: `spreadProps`, `keyedProps`, `groups`, `groupUses`, `shapes`, `hydration` |
| `explain` | With `explain`: `{ line, column, node, code }` for each JSX node. Omitted otherwise |

> [!TIP]
> `WEFT_OFF` turns off a compiled speed path for one run, by name, comma-separated, or `all`. For example
> `WEFT_OFF=KEYREAD` leaves a keyed row's key read where it was instead of hoisting it (`src/emit/list.rs`). The names
> are defined in `packages/core/src/flags.ts`.

## What the lowering looks like

The pre-pass (`transform`) rewrites component code before the back end sees it:

| Authored | After the pre-pass |
|---|---|
| `({ a, b = a, ...rest }) => …` | `(props) => …`, with `a` → `props.a`, `b` → `(props.b === undefined ? props.a : props.b)`, `rest` → `_rest = omit(props, ["a", "b"])` |
| `<div {...rest}>` | `<div {...restOf(props, ["a", "b"])}>` |
| `({ children }) => …` | `const _children = memo(() => props.children)`, and `children` → `_children()` |
| `{xs.map(x => <Row key={x.id} x={x} />)}` | `<For each={xs} by={(x) => x.id}>{x => <Row x={x()} />}</For>` |
| `{xs?.map(…)}` | the same list: `For` renders a nullish `each` as empty |

The back end (`emit`) then lowers each JSX construct one way:

| JSX | Output |
|---|---|
| element tree | module-level `const _tN = _$tpl("<li>…")`, then `_tN()` and a walk |
| static attribute | inlined in the template |
| dynamic attributes of one element | one `_$bind(() => [a, b], (v, p) => …)` |
| `onX={fn}` | `_$on(el, "x", fn, delegated)` |
| `{expr}` child | `_$child(parent, () => expr, marker?)` |
| `{c ? <A/> : <B/>}`, `&&` | a `_$child` whose condition is read through `_$memo` |
| `<Comp a={x} />` | `_$component(Comp, { get a() { return x; } })` |
| `{...rest}` on an element | `_$spread(el, () => ({ a: x, ...rest }))` |

Style group call sites lower to plain attributes before any of this, so they compile to static template HTML:

| Authored | Lowered |
|---|---|
| `{...orderCard({ status: s, selected })}` | `data-g="order-card" data-status={s} aria-selected={selected ? "true" : "false"}` |
| `{...orderCard({ status: 'late' })}` | `data-g="order-card" data-status="late"` |
| `{...orderCard.title}` | `data-part="title"` (with `taggedParts`: `data-g="order-card" data-part="title"`) |

`tests/helper_contract.rs` compiles the repo's components in DOM, dev DOM, hydratable DOM and SSR modes and fails if
the output imports a helper that `@weft-js/core`, `core/internal`, `core/dom` or `core/ssr` doesn't export.

## Diagnostics catalog

These are the codes this crate emits, read from the `Diagnostic::new` sites in `src/`. The descriptions follow the
catalog in `packages/cli/src/catalog/`, which is what `weft check`, `weft docs` and `AGENTS.md` draw on. The
[diagnostics guide](../../site/content/learn/diagnostics.md) explains how to read and fix them.

| Code | Severity | Emitted in | Catches |
|---|---|---|---|
| `W000` | error | `diag.rs` | A syntax error. Nothing else in the file is checked |
| `W001` | error | `analyze/` | A prop or `.value` used to compute something in the component body outside `derived`, `watch`, JSX or handlers (the body runs once) |
| `W002` | error | `analyze/` | Writing state inside `derived` |
| `W003` | error | `analyze/async_callbacks/` | A `watch` that writes state its own source reads (a cycle) |
| `W004` | warning | `analyze/async_callbacks/` | A `watch` that only copies one value into another |
| `W005` | error | `analyze/` | `state(prop)`: the box never follows the prop |
| `W006` | error | `analyze/` | Nested prop destructuring (`({ user: { name } })`), which can't stay live |
| `W010` | error | `analyze/` | `.map` over objects without `key` |
| `W011` | error | `analyze/` | A number on the left of `&&` (renders `0`) |
| `W012` | error | `analyze/` | `derived(async …)`, or reads after `await` in `resource` (untracked) |
| `W013` | error | `analyze/` | An early `return` inside a JSX `.map` callback |
| `W014` | error / warning | `analyze/`, `project.rs` | `.map(p => ({ ...p, … }))` feeding a keyed list: every row re-runs on every change. A warning when the box leaves the file as a prop; `link_w014` upgrades it to an error when it reaches a keyed list in another file |
| `W015` | error | `analyze/` | A box rendered without `.value` in JSX |
| `W016` | warning | `analyze/` | A non-reactive call passed as a component prop runs again whenever the prop is read |
| `W017` | warning | `analyze/` | One entry of a whole object read per row (`cart[p.id]`): every row reads the whole object |
| `W018` | warning | `analyze/` | `const x = untrack(() => …)` in a body that only JSX reads: it renders the setup-time value |
| `W019` | error | `analyze/` | An unsupported row pattern |
| `W020` | error | `analyze/react.rs` | React hook imports and standard hook names, with migration advice |
| `W040` | error | `analyze/` | An early `return` in a component body that depends on state (runs once, never re-checked) |
| `W041` | error | `analyze/` | A `let` mutated in a handler and read in JSX (never updates) |
| `W050` | error | `browser/` | A raw `addEventListener`, `setInterval`, `new WebSocket` or `new EventSource` in a component with no cleanup |
| `W051` | error | `browser/` | A `@weft-js/core/browser` value, `on` or `interval` created outside an owner: module scope, a timer, a promise callback, a handler, after `await` |
| `W052` | error | `browser/` | A `watch` folding a stream by hand into component state |
| `W054` | error / warning | `browser/` | `media(query)` without `ssr` in a server-rendered component. A warning when `checkOnly` can't tell whether the file is server-rendered |
| `W056` | warning | `browser/` | A `watch` that copies a live value into `state` |
| `W060` | error | `style/values.rs` | A `group()` that can't be evaluated at build, such as a value that isn't a literal |
| `W061` | error | `analyze/body_reads.rs` | `bind:x` on a native element, or `bind:x`/`bind(box)` with something that isn't a box or a component prop |
| `D024` | error | `style/visitor.rs` | Two group roots spread on one element (the last `data-g` would win) |
| `D025` | error | `style/lower.rs` | An unknown axis, value, state or part at a group call site, with the closest names |

The catalog also lists W-codes that the CLI checker owns (`W007`, `W008`, `W030`, `W043`, `W044`, `W080`–`W085`) and
`W053`, which `@weft-js/start` reports at run time. This crate does not emit those.

> [!IMPORTANT]
> `scripts/quality/diagnostic-catalog.mjs` keeps this honest. It finds every `Diagnostic::new` code in `src/`, every
> code asserted in `tests/`, and compares both with the catalog: a code with no catalog entry, a catalog entry that is
> never emitted, or a code no test asserts is a failure. The allowed gaps live in
> `scripts/quality/diagnostic-catalog-baseline.json`, which is currently empty. `pnpm run check` runs it as the
> `diagnostic-catalog` step.

## The `weftc` command line

`src/bin/weftc.rs` compiles files and prints code or diagnostics, or times a corpus.

```bash
cargo run --release --bin weftc -- src/App.tsx              # code to stdout, diagnostics to stderr
cargo run --release --bin weftc -- --json src/App.tsx       # one JSON Output per file
cargo run --release --bin weftc -- --check src/             # diagnostics only, every .tsx in the directory
cargo run --release --bin weftc -- --dev src/App.tsx        # dev output, a `// file:line <tag>` comment per template
cargo run --release --bin weftc -- --explain src/App.tsx:12 # what each JSX node starting on line 12 becomes
cargo run --release --bin weftc -- --bench 20 corpus/       # compile the corpus 20 times on one thread
```

| Flag | What it does |
|---|---|
| `--json` | Print one JSON result per file instead of code and diagnostics |
| `--check` | Diagnostics only, no codegen |
| `--dev` | Dev output |
| `--explain file.tsx:LINE` | Print what each JSX node starting on `LINE` becomes |
| `--bench N` | Compile every input `N` times; print `{ files, bytes, runs, minMs, medianMs, maxMs, diagnostics }` |

A directory argument expands to its `.tsx` files, sorted. Exit codes: `0` success, `1` at least one error diagnostic
(or an `--explain` line with no JSX), `2` a command line that can't run, such as a missing file or a bad `--explain`
target. `tests/cli.rs` checks that these report a one-line `weftc: …` error and never a panic.

## Node-API and WASM builds

Both bindings wrap `transform_json`, so the only difference is how the text crosses.

| Build | Source | How to get it | Exports |
|---|---|---|---|
| Node addon | `src/node.rs` | `--features node` on a native target | `transform(source, optionsJson) -> string` |
| WebAssembly | `src/wasm.rs` | `--target wasm32-unknown-unknown` | `alloc(len)`, `free(ptr, len)`, `transform(src, srcLen, opts, optsLen) -> u64` |

The crate is a `cdylib` and an `rlib`. Its one Cargo feature:

| Feature | Default | What it adds |
|---|---|---|
| `node` | off | The Node-API binding (`napi`, `napi-derive`). Off for `weftc` and the tests |

`build.rs` calls `napi_build::setup()` only when the `node` feature is on, so plain `cargo build` and `cargo test`
don't link against Node.

The WASM module has no imports, so Node, Bun and Deno load the same file with plain `WebAssembly`. The host writes
UTF-8 into buffers from `alloc`, `transform` takes ownership of them and returns its own buffer as
`pointer << 32 | length`, and the host reads it and hands it back to `free`. `packages/core/compiler-wasm.cjs` is that
host. Because the module has no filesystem and no environment, the host passes `cwd` and `off` in the options.

## Platform builds

Each prebuilt addon is an npm package, `@weft-js/compiler-<name>`, listed in `@weft-js/core`'s
`optionalDependencies` and pinned to its version. The installer keeps the one whose `os`, `cpu` and `libc` match;
anywhere else runs the WASM build. The table lives in `packages/core/platforms.cjs`:

| Package suffix | Rust target | Built with |
|---|---|---|
| `darwin-arm64` | `aarch64-apple-darwin` | `cargo build` |
| `darwin-x64` | `x86_64-apple-darwin` | `cargo build` |
| `linux-x64-gnu` | `x86_64-unknown-linux-gnu` | `cargo zigbuild` off-host (glibc 2.28) |
| `linux-arm64-gnu` | `aarch64-unknown-linux-gnu` | `cargo zigbuild` (glibc 2.28) |
| `linux-x64-musl` | `x86_64-unknown-linux-musl` | `cargo zigbuild`, `-crt-static` |
| `linux-arm64-musl` | `aarch64-unknown-linux-musl` | `cargo zigbuild`, `-crt-static` |
| `win32-x64` | `x86_64-pc-windows-msvc` | `cargo xwin build` off-host |
| `win32-arm64` | `aarch64-pc-windows-msvc` | `cargo xwin build` off-host |

`packages/core/scripts/build-platform.mjs` builds them (`--target <name>[,<name>…]|host|all`) into
`packages/core/dist/platform/<name>/`, and `--verify` checks every package there against `optionalDependencies` and
`platforms.cjs`. `.github/workflows/compiler-release.yml` is the same work as a manually triggered workflow: one job
per platform, one for the WASM build, and a `verify` job. It stops at artifacts and publishes nothing.

The release profile uses `lto = "fat"`, `codegen-units = 1` and `strip = "symbols"`.

## Build and test

The toolchain is pinned in `rust-toolchain.toml`: Rust `1.99.1` with `clippy`, `rustfmt` and the
`wasm32-unknown-unknown` target. `Cargo.toml` declares `rust-version = "1.95"`.

```bash
cd crates/weft-compiler
cargo test                                            # every test
cargo test --test compile                             # one test target
cargo clippy --all-targets -- -D warnings             # the lints `pnpm run check` enforces
cargo build --release --lib --features node           # the Node addon
cargo build --release --lib --target wasm32-unknown-unknown   # the WASM build
```

To use your build from the JavaScript side, let the scripts in `packages/core` build it, copy it into place and stamp
it:

```bash
cd packages/core
pnpm run build:native     # addon → native/weft-compiler.<platform>-<arch>.node, then the WASM build if stale
pnpm run build:wasm       # WASM → native/weft-compiler.wasm (8 MB stack, simd128, matching the addon)
pnpm run parity           # every .tsx in the repo through both builds, compared byte for byte
pnpm run build:platform   # the prebuilt platform packages
```

`node scripts/build-native.mjs --addon-only` skips the WASM rebuild, for a quick loop while working on the compiler.

### Tests

| File | What it covers |
|---|---|
| `tests/compile.rs` | Compile tests, split by rule family into `tests/compile/*.rs`: props, lists, output, React, early returns, handler mutations, numeric JSX and properties, async callbacks, derived writes, watch cycles, patterns and copies, the browser catalog examples, runtime imports |
| `tests/browser.rs` | The `@weft-js/core/browser` diagnostics (W050, W051, W054, W056) in check, DOM, SSR and hydratable modes |
| `tests/helper_contract.rs` | Every helper the back end imports exists in `packages/core/src`. Reads components from `packages/core/test/fixtures`, `packages/core/bench/fixtures` and `evals/reference-v3/weft/src` |
| `tests/cli.rs` | `weftc` on a command line that can't run: exit 2 and a one-line error |

`tests/helper_contract.rs` reads files outside the crate, so run the tests from a full checkout of the repository.

The lints are strict: Clippy `pedantic` is denied, as are `unwrap_used`, `undocumented_unsafe_blocks` and
`allow_attributes_without_reason`. An `#[allow]` needs `reason = "…"`, and every `unsafe` block needs a
`// SAFETY:` comment. Tests may unwrap (`crates/clippy.toml`).

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `weft: … is older than crates/weft-compiler … run npm run build:native in packages/core` | In a checkout, the loader compares each binary's stamp with the crate's sources. Rebuild with `pnpm run build:native` in `packages/core` |
| `weft: WEFT_COMPILER=native, and no addon for <platform> loads` | The pin asks for an addon and none loads. Build one, or unset `WEFT_COMPILER` to fall back to WASM |
| `weft: no compiler at …/weft-compiler.wasm` | The WASM build is missing. Run `pnpm run build:wasm` in `packages/core` |
| Every file reports only `W000` | Oxc found a syntax error, and the compiler checks nothing else until it is fixed |
| Addon and WASM output differ | `pnpm run parity` in `packages/core` names the file and mode. The WASM build sees only `/` paths and the `cwd` and `off` it is given |
| `weftc` exits with 2 | The command line can't run: a missing file, or `--explain` without `file.tsx:LINE` |

## Related

| Path | What it is |
|---|---|
| [`packages/core`](../../packages/core) | `@weft-js/core`: the runtime this compiler targets, the loader (`compiler.cjs`) and the Vite plugin |
| [`packages/cli`](../../packages/cli) | `@weft-js/cli`: `weft check`, `weft fix` and the diagnostic catalog |
| [`crates/weft`](../weft) | The Rust side of server functions (`remote()`, `native()`) |
| [`crates/weft-layout`](../weft-layout) | Taffy flexbox behind a C ABI, for native hosts |
| [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) | How the compiler, runtime, Vite and the CLI fit together |

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md). Before a change goes in, run `cargo test` and
`cargo clippy --all-targets -- -D warnings` here, `pnpm run parity` in `packages/core`, and `pnpm run check` at the
root. A new diagnostic code needs a catalog entry in `packages/cli/src/catalog/` and a test that asserts it.

## License

[MIT](../../LICENSE)
