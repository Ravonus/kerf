# Changelog

Every `@kerf` package is released together, at one version. Early releases (0.1.x) can change APIs between minor
versions.

## 0.1.0

- The first release as **Kerf**. The framework was published as `@weft-js/*` up to 0.1.4; it was renamed because
  another TypeScript framework already uses the name weft (`@weftjs/*`, `create-weft`).
- `@weft-js/*` is now `@kerf/*`, and the UI toolkit Warp is now **Veneer** (`@kerf/veneer`, `@kerf/veneer-core`,
  `@kerf/veneer-icons`, `--veneer-*` tokens).
- Scaffold with `npm create kerf` (the package is `create-kerf`).
- Providers drop the `plugin-` prefix: `@kerf/media`, `@kerf/media-ffmpeg`, `@kerf/keel`, `@kerf/keel-pixel`.
- The command is `kerf`, the config file is `kerf.config.ts`, attributes are `data-kerf-*`, environment variables are
  `KERF_*` and framework routes live under `/_kerf/`.

The history before the rename is in [docs/history/weft-CHANGELOG.md](docs/history/weft-CHANGELOG.md).
