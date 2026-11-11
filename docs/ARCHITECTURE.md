# Architecture

Kerf is a fine-grained reactive UI framework for people and agents. Components are TSX setup functions that run once. State and derived values are explicit boxes; live props and JSX bindings update the DOM where values are read. Diagnostics catch mistakes that would otherwise look like valid React code.

The Rust/Oxc compiler parses and checks source, then emits Kerf's own DOM and server output. The core runtime owns the reactive graph, DOM bindings, keyed lists and hydration. Vite integrates compilation into development and builds. The CLI exposes checks and project tools. Package reference pages describe the public APIs.

`@kerf/start` connects routing, server rendering, validated server functions and tagged data caches. Server functions share their contracts with the client; explicit invalidation tags connect mutations and real-time updates to cached queries. Hydration analysis keeps static regions on the server and retains client code when it cannot prove that omission is safe.

veneer-core supplies framework-independent behavior. Veneer adds components, tokens and styling. Other packages provide media, text, payments, multiplayer and adapters. Typed plugin slots connect optional implementations without opening the compiler to plugin code. Surfaces participate in layout; native work targets platform views with shared layout.

The [decisions](decisions/) record the reasoning that still guides the design and link to archived research. [ROADMAP-1.0.md](ROADMAP-1.0.md) is the source of future work; an architectural direction here does not imply that every feature is complete. Performance and size claims require the comparative measurements described in [CLAUDE.md](../CLAUDE.md).

## 1.0 package scope

The 1.0 release scope is `@kerf/core`, `cli`, `create`, `start`, `db`, `veneer`, `veneer-core` and
`veneer-icons`. The release script also discovers built compiler platform packages for core's native
binding; these support the in-scope compiler and are not the native app work below. A package in
scope still has to pass the release gates.

Native app phases 6a, 6b and 6d, the native half of pay, and packages with only one conformance
test are out of 1.0. All other top-level add-on packages, including web pay, remain unreleased and
private until ready. Their code remains in the repository. `scripts/release.mjs` selects non-private
top-level packages and any built compiler platform packages; it does not use this document as a
package allowlist.

## Repository map

- [packages](../packages/) contains the runtime, CLI, app framework, UI toolkit and optional integrations.
- [crates](../crates/) contains the Rust compiler, layout engine and command-line crate.
- [site](../site/) contains the site and learning material; [examples](../examples/) contains example applications.
- [benchmarks](../benchmarks/) compares implementations; [evals](../evals/) holds evaluation results and tools.
- [scripts](../scripts/) contains repository setup and quality checks; [.github](../.github/) contains workflows and templates.
- [docs](./) contains architecture, decisions and the roadmap.

## Runtime state machines

Navigation, live queries, leader election, lazy islands and the change
feed each keep a lifecycle spread across several fields.
[STATE-MACHINES.md](STATE-MACHINES.md) lists their states, where they
change and the rule each one follows.
