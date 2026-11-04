# Architecture

weft is a fine-grained reactive UI framework for people and agents. Components are TSX setup functions that run once. State and derived values are explicit boxes; live props and JSX bindings update the DOM where values are read. Diagnostics catch mistakes that would otherwise look like valid React code.

The Rust/Oxc compiler parses and checks source, then emits weft's own DOM and server output. The core runtime owns the reactive graph, DOM bindings, keyed lists and hydration. Vite integrates compilation into development and builds. The CLI exposes checks and project tools. Package reference pages describe the public APIs.

`@weft-js/start` connects routing, server rendering, validated server functions and tagged data caches. Server functions share their contracts with the client; explicit invalidation tags connect mutations and real-time updates to cached queries. Hydration analysis keeps static regions on the server and retains client code when it cannot prove that omission is safe.

warp-core supplies framework-independent behavior. warp adds components, tokens and styling. Other packages provide media, text, payments, multiplayer and adapters. Typed plugin slots connect optional implementations without opening the compiler to plugin code. Surfaces participate in layout; native work targets platform views with shared layout.

The [decisions](decisions/) record the reasoning that still guides the design and link to archived research. [ROADMAP-1.0.md](ROADMAP-1.0.md) is the source of future work; an architectural direction here does not imply that every feature is complete. Performance and size claims require the comparative measurements described in [CLAUDE.md](../CLAUDE.md).
