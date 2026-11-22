# Changelog

Every `@kerf-js` package is released together, at one version. Early releases (0.1.x) can change APIs between minor
versions.

## 0.1.3

- **Breaking.** A missing function is Q009 (404), including `serverCall` and extension calls. Q019 is reserved for rate
  limits (429). Queue infrastructure errors are J005. J004 identifies a job recorded as dead.
  For one release, Q019 with 404 and queue-operation J004 are documented as deprecated legacy meanings for mixed
  deployments. Update alert and client matchers to use the new codes. Wrong function transports use Q010, and a stale
  realtime connection or join uses R025.

- **Breaking.** Production Start diagnostics default to JSON lines. Set `site.log: 'text'` for text collectors.
  `/_kerf/health` now reports liveness. Move dependency-aware load balancer checks to `/_kerf/ready`.
- **Breaking.** The generated Node listener waits for plugin startup. Startup rejection, an unowned crash,
  failed cleanup and drain timeout now terminate it with a nonzero status. Run it under a supervisor.
- **Breaking.** Production Start responses suppress exception and validator details. Use the public
  reference to find the server log. Raw throws use the Kerf JSON error envelope, and declared function
  errors publish only schema-validated JSON data.
- **Breaking.** The `@kerf-js/core/test` matchers require Vitest 5.
- Start supports a release-owned shell, browser-rendered routes, and shell operations. Production output is
  reproducible, and development recovers from route edits, refused file watchers, and Nitro runner restarts.
- `kerf build` audits server-rendered pages and reports findings as warnings. `kerf audit` still fails on errors.
- Start uses configured trusted proxy hops when checking the public origin for mutations and form submissions.
- Veneer adds reusable navigation and data components, keeps a Table's default fields in expanded rows, and
  preserves NumberField drafts while typing.

## 0.1.0

- The first release as **Kerf**. The framework was published as `@weft-js/*` up to 0.1.4; it was renamed because
  another TypeScript framework already uses the name weft (`@weftjs/*`, `create-weft`).
- `@weft-js/*` is now `@kerf-js/*`, and the UI toolkit Warp is now **Veneer** (`@kerf-js/veneer`, `@kerf-js/veneer-core`,
  `@kerf-js/veneer-icons`, `--veneer-*` tokens).
- Scaffold with `npm create kerf` (the package is `create-kerf`).
- Providers drop the `plugin-` prefix: `@kerf-js/media`, `@kerf-js/media-ffmpeg`, `@kerf-js/keel`, `@kerf-js/keel-pixel`.
- The command is `kerf`, the config file is `kerf.config.ts`, attributes are `data-kerf-*`, environment variables are
  `KERF_*` and framework routes live under `/_kerf/`.

The history before the rename is in [docs/history/weft-CHANGELOG.md](docs/history/weft-CHANGELOG.md).
