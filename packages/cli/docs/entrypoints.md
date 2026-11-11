# Core and Start entrypoints

These paths are retained package exports. Node tooling must not enter a browser bundle.
The snapshots cover export paths, targets and conditions, not names or signatures.

## @kerf-js/core

- `@kerf-js/core`: Application reactive runtime and components.
- `@kerf-js/core/internal`: Compiler and renderer contract; shares the runtime graph, not an app API.
- `@kerf-js/core/keyed`: Keyed state helpers.
- `@kerf-js/core/jsx-runtime`: JSX types for compiler output; types only.
- `@kerf-js/core/dom`: Browser DOM rendering and hydration; other helpers serve compiler output.
- `@kerf-js/core/ssr`: Server rendering and compiler helpers.
- `@kerf-js/core/head`: Browser route metadata updates.
- `@kerf-js/core/test`: Test utilities; requires the test peers.
- `@kerf-js/core/test/plugins`: Plugin conformance test suites; browser layout tests need a browser.
- `@kerf-js/core/persist`: State persistence.
- `@kerf-js/core/history`: State history.
- `@kerf-js/core/sync`: State synchronization.
- `@kerf-js/core/interaction`: Interaction state.
- `@kerf-js/core/browser`: Browser APIs and browser state.
- `@kerf-js/core/style`: Style groups and styling helpers.
- `@kerf-js/core/ds`: Design system primitives.
- `@kerf-js/core/media`: Media components and helpers.
- `@kerf-js/core/shape`: Shape components and helpers.
- `@kerf-js/core/text`: Text components and helpers.
- `@kerf-js/core/surface`: Surface components and helpers.
- `@kerf-js/core/media-probe`: Media probing for tooling; Node entry.
- `@kerf-js/core/client`: Client type declarations only; no runtime condition.
- `@kerf-js/core/style/matrix`: Style matrix tooling; Node entry.
- `@kerf-js/core/hydration`: Hydration tooling; Node entry.
- `@kerf-js/core/markup`: Shared markup helpers and types.
- `@kerf-js/core/node-purge`: Node cache purge tooling.
- `@kerf-js/core/hmr`: Compiler-generated development hot updates.
- `@kerf-js/core/plugin`: Plugin declarations and runtime helpers.
- `@kerf-js/core/devtools`: Development tools.
- `@kerf-js/core/agent`: In-page development agent; requires testing peers.
- `@kerf-js/core/config`: Configuration declarations and runtime helpers.
- `@kerf-js/core/vite`: Vite plugin; Node tooling.
- `@kerf-js/core/compiler`: Compiler binding; Node tooling and native or WASM compiler.

## @kerf-js/start

- `@kerf-js/start`: Application server functions, forms and routing APIs.
- `@kerf-js/start/data`: Server function and data primitives.
- `@kerf-js/start/cache`: The shared query cache's `Store` type and `memoryStore()`, for `src/cache.server.ts`.
- `@kerf-js/start/cron`: `defineCron()` and the `CronJob` type, for `src/cron.server.ts`.
- `@kerf-js/start/email`: `sendEmail()` and the Resend, SMTP and dev-log mailers, for `src/email.server.ts`.
- `@kerf-js/start/jobs`: `defineJobs()`, `job()` and `memoryQueue()`, for `src/jobs.server.ts`.
- `@kerf-js/start/derive`: Server-side page metadata derivation.
- `@kerf-js/start/media`: Media schema and asset types.
- `@kerf-js/start/hub`: Realtime hub and topics; server.
- `@kerf-js/start/live`: Streams and live queries.
- `@kerf-js/start/bus`: Realtime bus interfaces.
- `@kerf-js/start/changes`: Database change feeds; server.
- `@kerf-js/start/changes-sql`: SQL for database change triggers; server tooling.
- `@kerf-js/start/live-target`: Live target capability checks; Node tooling.
- `@kerf-js/start/listen`: Database change listener; server.
- `@kerf-js/start/verify`: Live verification; server tooling.
- `@kerf-js/start/bus/postgres`: Postgres realtime bus; server, requires Postgres.
- `@kerf-js/start/list`: List queries and helpers.
- `@kerf-js/start/list/drizzle`: Drizzle list integration; requires Drizzle.
- `@kerf-js/start/channel`: Realtime channels.
- `@kerf-js/start/share`: Shared state.
- `@kerf-js/start/db`: Drizzle schema helpers; requires Drizzle.
- `@kerf-js/start/db/core`: Database interfaces and core helpers.
- `@kerf-js/start/db/sqlite`: SQLite database adapter.
- `@kerf-js/start/db/postgres`: Postgres database adapter; requires Postgres driver.
- `@kerf-js/start/db/mysql`: MySQL database adapter; requires MySQL driver.
- `@kerf-js/start/auth`: Authentication provider interface.
- `@kerf-js/start/auth/better-auth`: Better Auth integration; requires Better Auth.
- `@kerf-js/start/auth/drizzle`: Drizzle authentication integration; requires Drizzle.
- `@kerf-js/start/extension`: Server extension contract.
- `@kerf-js/start/client`: Client application bootstrap; browser.
- `@kerf-js/start/server`: Server application rendering and request handling.
- `@kerf-js/start/vite`: Start Vite plugin; Node tooling.
- `@kerf-js/start/routes`: Route manifest tooling.
- `@kerf-js/start/og`: Open Graph image tooling; server.
- `@kerf-js/start/app`: Development and build application tooling; Node.
- `@kerf-js/start/inspect`: Route metadata inspection; Node tooling.
- `@kerf-js/start/contract`: Server function contract generation; Node tooling.
- `@kerf-js/start/rust`: Rust remote function support.
- `@kerf-js/start/sidecar`: Rust sidecar supervisor; Node tooling.
