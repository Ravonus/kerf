# Core and Start entrypoints

These paths are retained package exports. Node tooling must not enter a browser bundle.
The snapshots cover export paths, targets and conditions, not names or signatures.

## @weft-js/core

- `@weft-js/core`: Application reactive runtime and components.
- `@weft-js/core/internal`: Compiler and renderer contract; shares the runtime graph, not an app API.
- `@weft-js/core/keyed`: Keyed state helpers.
- `@weft-js/core/jsx-runtime`: JSX types for compiler output; types only.
- `@weft-js/core/dom`: Browser DOM rendering and hydration; other helpers serve compiler output.
- `@weft-js/core/ssr`: Server rendering and compiler helpers.
- `@weft-js/core/head`: Browser route metadata updates.
- `@weft-js/core/test`: Test utilities; requires the test peers.
- `@weft-js/core/test/plugins`: Plugin conformance test suites; browser layout tests need a browser.
- `@weft-js/core/persist`: State persistence.
- `@weft-js/core/history`: State history.
- `@weft-js/core/sync`: State synchronization.
- `@weft-js/core/interaction`: Interaction state.
- `@weft-js/core/browser`: Browser APIs and browser state.
- `@weft-js/core/style`: Style groups and styling helpers.
- `@weft-js/core/ds`: Design system primitives.
- `@weft-js/core/media`: Media components and helpers.
- `@weft-js/core/shape`: Shape components and helpers.
- `@weft-js/core/text`: Text components and helpers.
- `@weft-js/core/surface`: Surface components and helpers.
- `@weft-js/core/media-probe`: Media probing for tooling; Node entry.
- `@weft-js/core/client`: Client type declarations only; no runtime condition.
- `@weft-js/core/style/matrix`: Style matrix tooling; Node entry.
- `@weft-js/core/hydration`: Hydration tooling; Node entry.
- `@weft-js/core/markup`: Shared markup helpers and types.
- `@weft-js/core/node-purge`: Node cache purge tooling.
- `@weft-js/core/hmr`: Compiler-generated development hot updates.
- `@weft-js/core/plugin`: Plugin declarations and runtime helpers.
- `@weft-js/core/devtools`: Development tools.
- `@weft-js/core/agent`: In-page development agent; requires testing peers.
- `@weft-js/core/config`: Configuration declarations and runtime helpers.
- `@weft-js/core/vite`: Vite plugin; Node tooling.
- `@weft-js/core/compiler`: Compiler binding; Node tooling and native or WASM compiler.

## @weft-js/start

- `@weft-js/start`: Application server functions, forms and routing APIs.
- `@weft-js/start/data`: Server function and data primitives.
- `@weft-js/start/cache`: The shared query cache's `Store` type and `memoryStore()`, for `src/cache.server.ts`.
- `@weft-js/start/cron`: `defineCron()` and the `CronJob` type, for `src/cron.server.ts`.
- `@weft-js/start/email`: `sendEmail()` and the Resend, SMTP and dev-log mailers, for `src/email.server.ts`.
- `@weft-js/start/jobs`: `defineJobs()`, `job()` and `memoryQueue()`, for `src/jobs.server.ts`.
- `@weft-js/start/derive`: Server-side page metadata derivation.
- `@weft-js/start/media`: Media schema and asset types.
- `@weft-js/start/hub`: Realtime hub and topics; server.
- `@weft-js/start/live`: Streams and live queries.
- `@weft-js/start/bus`: Realtime bus interfaces.
- `@weft-js/start/changes`: Database change feeds; server.
- `@weft-js/start/changes-sql`: SQL for database change triggers; server tooling.
- `@weft-js/start/live-target`: Live target capability checks; Node tooling.
- `@weft-js/start/listen`: Database change listener; server.
- `@weft-js/start/verify`: Live verification; server tooling.
- `@weft-js/start/bus/postgres`: Postgres realtime bus; server, requires Postgres.
- `@weft-js/start/list`: List queries and helpers.
- `@weft-js/start/list/drizzle`: Drizzle list integration; requires Drizzle.
- `@weft-js/start/channel`: Realtime channels.
- `@weft-js/start/share`: Shared state.
- `@weft-js/start/db`: Drizzle schema helpers; requires Drizzle.
- `@weft-js/start/db/core`: Database interfaces and core helpers.
- `@weft-js/start/db/sqlite`: SQLite database adapter.
- `@weft-js/start/db/postgres`: Postgres database adapter; requires Postgres driver.
- `@weft-js/start/db/mysql`: MySQL database adapter; requires MySQL driver.
- `@weft-js/start/auth`: Authentication provider interface.
- `@weft-js/start/auth/better-auth`: Better Auth integration; requires Better Auth.
- `@weft-js/start/auth/drizzle`: Drizzle authentication integration; requires Drizzle.
- `@weft-js/start/extension`: Server extension contract.
- `@weft-js/start/client`: Client application bootstrap; browser.
- `@weft-js/start/server`: Server application rendering and request handling.
- `@weft-js/start/vite`: Start Vite plugin; Node tooling.
- `@weft-js/start/routes`: Route manifest tooling.
- `@weft-js/start/og`: Open Graph image tooling; server.
- `@weft-js/start/app`: Development and build application tooling; Node.
- `@weft-js/start/inspect`: Route metadata inspection; Node tooling.
- `@weft-js/start/contract`: Server function contract generation; Node tooling.
- `@weft-js/start/rust`: Rust remote function support.
- `@weft-js/start/sidecar`: Rust sidecar supervisor; Node tooling.
