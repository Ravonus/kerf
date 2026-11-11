# Core and Start entrypoints

These paths are retained package exports. Node tooling must not enter a browser bundle.
The snapshots cover export paths, targets and conditions, not names or signatures.

## @kerf/core

- `@kerf/core`: Application reactive runtime and components.
- `@kerf/core/internal`: Compiler and renderer contract; shares the runtime graph, not an app API.
- `@kerf/core/keyed`: Keyed state helpers.
- `@kerf/core/jsx-runtime`: JSX types for compiler output; types only.
- `@kerf/core/dom`: Browser DOM rendering and hydration; other helpers serve compiler output.
- `@kerf/core/ssr`: Server rendering and compiler helpers.
- `@kerf/core/head`: Browser route metadata updates.
- `@kerf/core/test`: Test utilities; requires the test peers.
- `@kerf/core/test/plugins`: Plugin conformance test suites; browser layout tests need a browser.
- `@kerf/core/persist`: State persistence.
- `@kerf/core/history`: State history.
- `@kerf/core/sync`: State synchronization.
- `@kerf/core/interaction`: Interaction state.
- `@kerf/core/browser`: Browser APIs and browser state.
- `@kerf/core/style`: Style groups and styling helpers.
- `@kerf/core/ds`: Design system primitives.
- `@kerf/core/media`: Media components and helpers.
- `@kerf/core/shape`: Shape components and helpers.
- `@kerf/core/text`: Text components and helpers.
- `@kerf/core/surface`: Surface components and helpers.
- `@kerf/core/media-probe`: Media probing for tooling; Node entry.
- `@kerf/core/client`: Client type declarations only; no runtime condition.
- `@kerf/core/style/matrix`: Style matrix tooling; Node entry.
- `@kerf/core/hydration`: Hydration tooling; Node entry.
- `@kerf/core/markup`: Shared markup helpers and types.
- `@kerf/core/node-purge`: Node cache purge tooling.
- `@kerf/core/hmr`: Compiler-generated development hot updates.
- `@kerf/core/plugin`: Plugin declarations and runtime helpers.
- `@kerf/core/devtools`: Development tools.
- `@kerf/core/agent`: In-page development agent; requires testing peers.
- `@kerf/core/config`: Configuration declarations and runtime helpers.
- `@kerf/core/vite`: Vite plugin; Node tooling.
- `@kerf/core/compiler`: Compiler binding; Node tooling and native or WASM compiler.

## @kerf/start

- `@kerf/start`: Application server functions, forms and routing APIs.
- `@kerf/start/data`: Server function and data primitives.
- `@kerf/start/cache`: The shared query cache's `Store` type and `memoryStore()`, for `src/cache.server.ts`.
- `@kerf/start/cron`: `defineCron()` and the `CronJob` type, for `src/cron.server.ts`.
- `@kerf/start/email`: `sendEmail()` and the Resend, SMTP and dev-log mailers, for `src/email.server.ts`.
- `@kerf/start/jobs`: `defineJobs()`, `job()` and `memoryQueue()`, for `src/jobs.server.ts`.
- `@kerf/start/derive`: Server-side page metadata derivation.
- `@kerf/start/media`: Media schema and asset types.
- `@kerf/start/hub`: Realtime hub and topics; server.
- `@kerf/start/live`: Streams and live queries.
- `@kerf/start/bus`: Realtime bus interfaces.
- `@kerf/start/changes`: Database change feeds; server.
- `@kerf/start/changes-sql`: SQL for database change triggers; server tooling.
- `@kerf/start/live-target`: Live target capability checks; Node tooling.
- `@kerf/start/listen`: Database change listener; server.
- `@kerf/start/verify`: Live verification; server tooling.
- `@kerf/start/bus/postgres`: Postgres realtime bus; server, requires Postgres.
- `@kerf/start/list`: List queries and helpers.
- `@kerf/start/list/drizzle`: Drizzle list integration; requires Drizzle.
- `@kerf/start/channel`: Realtime channels.
- `@kerf/start/share`: Shared state.
- `@kerf/start/db`: Drizzle schema helpers; requires Drizzle.
- `@kerf/start/db/core`: Database interfaces and core helpers.
- `@kerf/start/db/sqlite`: SQLite database adapter.
- `@kerf/start/db/postgres`: Postgres database adapter; requires Postgres driver.
- `@kerf/start/db/mysql`: MySQL database adapter; requires MySQL driver.
- `@kerf/start/auth`: Authentication provider interface.
- `@kerf/start/auth/better-auth`: Better Auth integration; requires Better Auth.
- `@kerf/start/auth/drizzle`: Drizzle authentication integration; requires Drizzle.
- `@kerf/start/extension`: Server extension contract.
- `@kerf/start/client`: Client application bootstrap; browser.
- `@kerf/start/server`: Server application rendering and request handling.
- `@kerf/start/vite`: Start Vite plugin; Node tooling.
- `@kerf/start/routes`: Route manifest tooling.
- `@kerf/start/og`: Open Graph image tooling; server.
- `@kerf/start/app`: Development and build application tooling; Node.
- `@kerf/start/inspect`: Route metadata inspection; Node tooling.
- `@kerf/start/contract`: Server function contract generation; Node tooling.
- `@kerf/start/rust`: Rust remote function support.
- `@kerf/start/sidecar`: Rust sidecar supervisor; Node tooling.
