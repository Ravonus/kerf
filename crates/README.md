<p align="center">
  <a href="https://github.com/Ravonus/kerf">
    <img src="https://raw.githubusercontent.com/Ravonus/kerf/main/site/public/logo.svg" width="88" height="88" alt="Kerf">
  </a>
</p>

<h1 align="center">Kerf's Rust crates</h1>

<p align="center">
  <strong>The compiler, the server-function runtime and the native layout engine, in Rust.</strong><br>
  You never need Rust to use Kerf: the compiler ships prebuilt and as WebAssembly inside <code>@kerf-js/core</code>.
</p>

<p align="center">
  <a href="../LICENSE"><img src="https://img.shields.io/badge/license-MIT-145c3c" alt="MIT license"></a>
</p>

<p align="center">
  <a href="#the-crates">Crates</a> ·
  <a href="#shared-configuration">Shared configuration</a> ·
  <a href="#build-and-test">Build and test</a> ·
  <a href="../docs/ARCHITECTURE.md">Architecture</a> ·
  <a href="../README.md">Kerf</a>
</p>

> [!NOTE]
> None of these crates is on crates.io. `kerf-compiler` sets `publish = false` and reaches apps through
> `@kerf-js/core` (a WASM build plus prebuilt `@kerf-js/compiler-<platform>` addons). The `kerf` crate ships as a copy
> inside `@kerf-js/start`, which an app's `Cargo.toml` points at by path. `kerf-layout` is internal.

Each crate is its own Cargo package with its own `Cargo.lock`; there is no Cargo workspace at this level. They share
lint, format and dependency-policy files kept here.

## The crates

| Crate | Version | Edition | Library kinds | What it is | Reached from JavaScript by |
|---|---|---|---|---|---|
| [`kerf-compiler`](kerf-compiler) | 0.0.0 | 2024 | `cdylib`, `rlib`, and the `kerfc` binary | Kerf's TSX compiler on [Oxc](https://oxc.rs): analysis and diagnostics, the props and list pre-pass, and its own DOM and SSR back end | `packages/core/compiler.cjs`: a Node addon, else a prebuilt addon, else WASM |
| [`kerf`](kerf) | 0.0.1 | 2024 | `rlib` | The Rust side of `remote()` and `native()`: types generated from `.kerf/contract.json`, the contexts, the signed envelope, an axum router, a Node-API and WASM entry | `@kerf-js/start` (`crate/` in the package) and `kerf add rust` |
| [`kerf-layout`](kerf-layout) | 0.0.1 | 2021 | `rlib`, `staticlib`, `cdylib` | Taffy flexbox behind a C ABI, for native hosts and Node tests | Not linked by anything in this repository yet |

### kerf-compiler

One Oxc parse per file, then `analyze`, `browser` and `style` checks, the `transform` pre-pass, shape variants,
hydration marks, HMR registration, and `emit`, which lowers JSX to template clones and fine-grained bindings. Every
diagnostic has a stable code (`W000`–`W061`, `D024`, `D025`), a reason, help and, where mechanical, a fix. Feature
`node` builds the Node-API binding; the `wasm32-unknown-unknown` target builds the WASM one. Both wrap the same
`transform_json`, and a parity gate checks they return the same bytes. [README](kerf-compiler/README.md)

### kerf

Features `core`, `server` (default), `native`, `otel` and `build`. A build script calls `kerf::build::generate`, the
crate includes the result with `kerf::contract!()`, and the app implements the generated `Service` trait. A sidecar
serves it with `kerf::serve(kerf::router(…))`; an addon exports it with `kerf::native!(…)`. [README](kerf/README.md)

### kerf-layout

Nine `wl_*` functions over a Taffy tree keyed by app node id, ten style keys, host-measured text, and frames with
scroll extents. [README](kerf-layout/README.md)

## Shared configuration

These files sit in `crates/`, above every crate. Clippy, rustfmt and cargo-deny find them by searching up from each
crate's directory.

| File | What it sets |
|---|---|
| [`clippy.toml`](clippy.toml) | `allow-unwrap-in-tests` and `allow-expect-in-tests` (a panic in a test is the failure report), and `too-many-lines-threshold = 80` |
| [`rustfmt.toml`](rustfmt.toml) | `max_width = 100` |
| [`deny.toml`](deny.toml) | cargo-deny policy for each crate, with all features: yanked crates denied; a licence allowlist (MIT, MIT-0, Apache-2.0, Apache-2.0 WITH LLVM-exception, BSD-2-Clause, BSD-3-Clause, ISC, Zlib, Unicode-3.0, Unicode-DFS-2016, MPL-2.0, CDLA-Permissive-2.0); wildcard versions denied except for path dependencies; unknown registries and git sources denied |

Every crate's `Cargo.toml` also carries the same `[lints]` table: `unsafe_op_in_unsafe_fn` is denied, Clippy
`pedantic` is denied, and so are `unwrap_used`, `undocumented_unsafe_blocks`, `allow_attributes_without_reason` and
`too_many_lines`. A few pedantic lints are allowed (the numeric casts, `module_name_repetitions`,
`must_use_candidate`, `missing_errors_doc`, `missing_panics_doc`, `similar_names`, `struct_excessive_bools`). In
practice: an `#[allow]` needs `reason = "…"`, every `unsafe` block needs a `// SAFETY:` comment, and outside tests
use `expect("why it holds")`, not `unwrap()`.

## Toolchains

| Crate | `rust-toolchain.toml` | Notes |
|---|---|---|
| `kerf-compiler` | `1.99.1`, `clippy`, `rustfmt`, target `wasm32-unknown-unknown` | `rust-version = "1.95"` in `Cargo.toml` |
| `kerf` | `1.99.1`, `clippy`, `rustfmt` | |
| `kerf-layout` | none | Builds with your default toolchain |

## Build and test

Run Cargo inside a crate's directory:

```bash
cd crates/kerf-compiler && cargo test
cd crates/kerf && cargo test
cd crates/kerf-layout && cargo test
```

From the repository root, `pnpm run check` runs these over all three crates, among its other steps:

| Step | Command per crate |
|---|---|
| `clippy` | `cargo clippy --all-targets --message-format=json -- -D warnings --force-warn clippy::too_many_lines` |
| `cargo-deny` | `cargo deny --manifest-path crates/<name>/Cargo.toml --all-features check` (skipped when cargo-deny isn't installed) |
| `rust-tests` | `cargo test` |

Rust formatting goes through `node scripts/quality/rust-format.mjs` (`--write` to apply), which formats every tracked
`.rs` file with each crate's edition. `pnpm run fix` runs `cargo clippy --fix` in each crate and then the formatters.

To use a compiler change from JavaScript, rebuild it in `packages/core` with `pnpm run build:native`; the
[kerf-compiler README](kerf-compiler/README.md#build-and-test) has the details.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the rest of the workflow.

## License

[MIT](../LICENSE)
