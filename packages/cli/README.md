# @weft-js/cli

> **Early release (0.1.x).** APIs can change between minor versions.

The `weft` command. It runs an app (`dev`, `build`, `start`), checks it (`check`, `tsc`, `fix`, `audit`), ships it
(`deploy`), serves its docs to people and agents (`docs`, `agents-md`, `mcp`) and manages plugins (`add`, `plugins`). An app made with `npm create @weft-js`
already has it.

```bash
npm install -D @weft-js/cli
npx weft check
```

Each problem prints as `file:line:col  CODE severity  why`, with a `fix:` line under it, and the run ends with a count of
files, errors and warnings.

## Commands

`npx weft help` prints this list.

| Command | What it does |
|---|---|
| `check [files…]` | Compiles every component in check mode and reports diagnostics with fixes. `--verbose` says which compiler ran |
| `tsc` | Type-checks the whole project with inferred props, for CI |
| `fix [files…]` | Applies the safe autofixes |
| `doctor` | Which compiler this install uses, whether Rust is around (it's optional), and what live data does on the target |
| `dev [--port <n>]` | The dev server, for an app with `src/routes` |
| `build [--runtime node\|bun\|deno] [--preset <p>]` | The production build, into `.output/`. The built pages are then audited (L-codes), and an error fails the build |
| `start [--runtime <r>]` | Runs the build |
| `audit [routes…] [--url <u>]` | The built pages, or a running site, in a clean Chrome at phone and desktop widths: axe-core's WCAG rules, console errors, the head, sideways scroll and layout shift |
| `deploy hosts` | Which hosts can run this app, why not, what each costs, and the one Weft suggests |
| `deploy init [target]` | The host's files (`netlify.toml`, `fly.toml` and a Dockerfile…) and a GitHub workflow that checks and deploys on push |
| `deploy [--prod] [--yes]` | Checks the fit, builds for the target and runs the host's own CLI: Netlify, Vercel, Cloudflare, Fly or Render. Without `--yes` it's a dry run |
| `db generate [name]`, `db live`, `db listen` | A migration for schema changes; one with change triggers; the change feed as its own process |
| `routes [--meta]` | The route table; `--meta` adds each route's metadata and H-diagnostics |
| `surfaces` | The canvas and WebGL surfaces the project already defines |
| `test --gate` | The test gate on the diff: fail-before, mutants on changed lines and no weakened tests |
| `browser <cmd>` | Drives the running app: open, snapshot, act, assert and more (`weft browser help`) |
| `docs [topic\|code]` | Prints a docs page or a diagnostic (`weft docs props`, `weft docs W014`) |
| `agents-md [--check]` | Writes AGENTS.md from the installed Weft; `--check` exits 1 when it's stale |
| `map [--stdout]` | Writes `.weft/map.md`: what to call in this app |
| `icons publish <dir>` | Every icon and variant as static `.svg` files with a `manifest.json`, for a CDN |
| `tasks`, `run <task>` | Lists commands and project tasks; runs a task from `weft.config.ts` |
| `add <feature>` | Installs a plugin and wires it into the config; also `tailwind`, `auth`, `db` and `rust` |
| `plugins [list\|explain\|sync\|audit\|approve]` | Plugins, their slots and permissions |
| `style find\|explain\|matrix` | Style groups |
| `tokens` | Warp's resolved tokens as DTCG, in `.weft/tokens/` |
| `lsp` | A language server for editors, with inferred props |
| `mcp` | An MCP server on stdio: `docs`, `check`, `audit`, `routes_meta`, `map`, `tasks`, `surfaces`, `style_find`, `style_explain`, `test_gate` and the `browser_*` tools |

Every command takes `--root <dir>` (the working directory by default) and `--json`. JSON goes to stdout and text for
people to stderr. Exit codes: 0 ok, 1 errors found (or a stale AGENTS.md under `--check`), 2 a usage or internal error.

## Docs

- `weft docs config`: `weft.config.ts` and every key in it.
- `weft docs diagnostics`: every code, and which ones the installed Weft reports.
- `weft docs verify`: `weft browser` and the test gate.
- `weft docs deploy`: hosts, `weft deploy` and the E-codes.
- `weft docs plugins`: writing a plugin.

The source of each page is in [docs/](docs). Adding a diagnostic is in [CONTRIBUTING.md](../../CONTRIBUTING.md).

## A diagnostic

`check`, `tasks` and the MCP tools report the same shape:

```json
{
  "code": "W014",
  "severity": "error",
  "owner": "core",
  "file": "src/App.tsx",
  "span": [21, 44, 21, 117],
  "offset": [867, 940],
  "why": "Copying every item gives each a new identity.",
  "fix": { "text": "Keep unchanged items stable." },
  "project": true,
  "related": [{
    "file": "src/components/ProductList.tsx",
    "span": [29, 10, 29, 10],
    "why": "rendered here as a keyed list"
  }],
  "docs": "weft docs W014"
}
```

- `span` is 1-based `[line, col, endLine, endCol]`, with columns in UTF-16 units. `offset` is UTF-16 indices into the
  file's text.
- `fix.edits` (`{ file, span, offset, text }`) is there when there's a mechanical change, and `fix.safe` says whether
  `weft fix` applies it without asking.
- `project: true` marks a result that needed more than one file to find.
