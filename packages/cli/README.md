<p align="center">
  <a href="https://github.com/Ravonus/weft">
    <img src="https://raw.githubusercontent.com/Ravonus/weft/main/site/public/logo.svg" width="88" height="88" alt="Weft">
  </a>
</p>

<h1 align="center">@weft-js/cli</h1>

<p align="center">
  <strong>The <code>weft</code> command: run, check, build, audit and deploy a Weft app.</strong><br>
  Every finding has a code, a reason and a fix, as text for you and as JSON or MCP tools for an agent.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@weft-js/cli"><img src="https://img.shields.io/npm/v/@weft-js/cli?color=145c3c&label=npm" alt="npm version"></a>
  <a href="https://github.com/Ravonus/weft/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-145c3c" alt="MIT license"></a>
  <a href="https://github.com/Ravonus/weft/actions"><img src="https://img.shields.io/github/actions/workflow/status/Ravonus/weft/quality.yml?branch=main&label=checks" alt="checks"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D24-145c3c" alt="Node 24 or later">
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="https://github.com/Ravonus/weft/tree/main/packages/cli/docs">Docs</a> ·
  <a href="https://github.com/Ravonus/weft/tree/main/examples">Examples</a> ·
  <a href="https://github.com/Ravonus/weft/blob/main/CHANGELOG.md">Changelog</a> ·
  <a href="https://github.com/Ravonus/weft">GitHub</a>
</p>

> [!IMPORTANT]
> **Early release (0.1.x).** The command works end to end, and commands, flags and output can still change between
> minor versions.

`weft` is the one command a Weft app needs. It runs the app (`dev`, `build`, `start`), checks it (`check`, `tsc`, `fix`,
`audit`, `test --gate`), ships it (`deploy`), serves its docs to people and agents (`docs`, `agents-md`, `map`, `mcp`)
and manages plugins (`add`, `plugins`). An app made with
[`npm create @weft-js`](https://github.com/Ravonus/weft/tree/main/packages/create) already has it.

It is built for two readers. A person gets short lines on stderr, and a tool gets the same result as JSON on stdout
with `--json`, or as MCP tools through `weft mcp`.

## Highlights

- **Diagnostics with fixes.** `weft check` compiles every component in check mode. Each problem prints as
  `file:line:col  CODE severity  why`, with a `fix:` line under it, and `weft fix` applies the safe ones.
- **Docs that match the install.** `weft docs W014` prints the page for a code, with whether the installed Weft reports
  it. `weft agents-md` writes an `AGENTS.md` for the version you have.
- **A build that audits itself.** `weft build` opens the built pages in a clean Chrome at a phone's and a desktop's
  width, runs axe-core's WCAG rules, and fails on an error.
- **The running app, driven from the terminal.** `weft browser snapshot`, `act` and `assert` work against any browser
  connected to the dev server, and `record` turns a session into a test.
- **A test gate on the diff.** `weft test --gate` checks that new tests fail on the old code, kill mutants of the changed
  lines, and that no existing test got weaker.
- **Deploys that say why not.** `weft deploy hosts` says which hosts can run this app before you have an account, and
  `weft deploy` is a dry run until you pass `--yes`.
- **An MCP server.** `weft mcp` serves `docs`, `check`, `audit`, the style tools, the test gate and the `browser_*`
  tools on stdio.

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [Global flags, output and exit codes](#global-flags-output-and-exit-codes)
- [Commands](#commands)
  - [Run the app](#run-the-app): `dev`, `build`, `start`
  - [Check it](#check-it): `check`, `tsc`, `fix`, `doctor`, `audit`, `routes`, `surfaces`
  - [Test and verify](#test-and-verify): `test --gate`, `browser`
  - [Deploy](#deploy): `deploy`, `deploy hosts`, `deploy init`
  - [Data](#data): `db generate`, `db live`, `db listen`
  - [Add things](#add-things): `add`, `plugins`
  - [Docs for people and agents](#docs-for-people-and-agents): `docs`, `agents-md`, `map`, `mcp`, `tasks`, `run`
  - [Style and design](#style-and-design): `style`, `tokens`, `icons`
  - [Editors](#editors): `lsp`
- [The diagnostic shape](#the-diagnostic-shape)
- [Diagnostic families](#diagnostic-families)
- [The package API](#the-package-api)
- [Troubleshooting](#troubleshooting)
- [Related packages](#related-packages)

## Install

A new app already lists it in `devDependencies`. To add it to an existing one:

```bash
npm install -D @weft-js/cli
```

```bash
pnpm add -D @weft-js/cli
```

```bash
bun add -d @weft-js/cli
```

```bash
deno add -D npm:@weft-js/cli
```

It needs Node 24 or later, or Bun or Deno in its place. `@weft-js/core` is a peer dependency: the CLI uses the project's
own compiler, and falls back to its own copy only when the project has none.

## Quick start

```bash
# Compile every component, report diagnostics with fixes
npx weft check
npx weft dev            # the dev server, for an app with src/routes
# The production build into .output/, then the audit
npx weft build
npx weft start          # run the build
```

When `check` finds something, it looks like this:

```text
src/routes/counter.tsx:8:8  W015 error
  `count` is a box; JSX needs its value.
  fix: Read `count.value`. (autofix)
weft check: 12 files, 1 errors, 0 warnings (84 ms)
```

Then:

```bash
npx weft docs W015      # the page for that code
npx weft fix            # apply the safe autofixes
npx weft check --json   # the same result, for a tool
```

`npx weft help` prints the full command list.

## Global flags, output and exit codes

Every command takes these:

| Flag | Default | What it does |
|---|---|---|
| `--root <dir>` (or `--root=<dir>`) | the working directory | The app to work on |
| `--json` | off | Print the result as JSON on stdout. Text for people still goes to stderr |
| `--check` | off | Used by `agents-md`: report, don't write |
| `--stdout` | off | Used by `agents-md`, `map` and `style matrix`: print instead of writing a file |

A flag that takes a value accepts `--flag value` or `--flag=value`. An unknown flag is a usage error.

| Exit code | Meaning |
|---|---|
| `0` | OK |
| `1` | Errors found: diagnostics with `error` severity, a build refused on one, a failed assertion, or a stale `AGENTS.md` under `--check` |
| `2` | A usage error or an internal error. With `--json`, stdout gets `{ "ok": false, "error": { "code", "message" } }` |

## Commands

### Run the app

| Command | Flags | What it does |
|---|---|---|
| `weft dev` | `--port <n>` | The dev server for an app with `src/routes` (Vite and Nitro). Loads `.env` under what's already set, writes `.weft/map.md`, and starts any Rust `remote()` sidecars before the server |
| `weft build` | `--runtime node\|bun\|deno`, `--preset <p>`, `--unsafe-allow <codes>` | The production build, into `.output/`, plus `.weft/contract.json`. Then the built pages are audited (L-codes), and an error fails the build |
| `weft start` | `--runtime <r>` | Runs `.output/server/index.mjs` on its runtime: `--runtime`, else the config's `runtime`, else the one running `weft`. Starts sidecars first |

`--runtime` picks Node, Bun or Deno. `--preset` picks a host preset instead, such as `netlify`, `vercel` or
`cloudflare_durable`; with `deploy.target` in the config, `weft build` builds for that host.

`--unsafe-allow` lets a build go past codes you have looked at: a code (`R002`), a family (`L`), several
(`L003,R002`) or `all`. Each one it lets through is listed as a warning, every build. To keep that in the config with a
reason, use `build.unsafeAllow`:

```ts
// weft.config.ts
export default defineConfig({
  build: {
    unsafeAllow: { L003: 'the legacy page is replaced next sprint' },
  },
})
```

A build that fails still writes its output, and says so: fix the errors, or force it with `--unsafe-allow <code>`.

### Check it

| Command | Flags | What it does |
|---|---|---|
| `weft check [files…]` | `--preset <p>`, `--verbose` | Compiles every component in check mode and reports W-, P-, D- and the other codes, with fixes. Files limit it to those. `--verbose` says which compiler ran (native addon or WASM). Ends with `files, errors, warnings (ms)` |
| `weft tsc` | | Type-checks the whole project with inferred props (tsc or tsgo). For CI |
| `weft fix [files…]` | | Applies the safe autofixes and lists each one as `file:line:col  CODE` |
| `weft doctor` | `--preset <p>`, `--runtime <r>` | Which compiler this install uses, whether Rust is around (it's optional), and which hosts fit. For an app with `src/realtime.server.ts`, or with `--preset`, also what live data does on that target, what it requires and the options |
| `weft audit [routes…]` | `--url <u>`, `--indexing public\|private\|auto`, `--all`, `--max <n>` | The built pages, or a running site with `--url`, in a clean Chrome at a phone's and a desktop's width: axe-core's WCAG rules, console errors, deprecations, the head, sideways scroll and layout shift |
| `weft routes` | `--meta`, `--preset <p>` | The route table, path and file. `--meta` adds each route's merged metadata, tags, card mode and H-diagnostics |
| `weft surfaces` | | The canvas and WebGL surfaces this project already defines, with their kind, file and props |

`weft audit` samples up to 30 pages unless you pass `--all` or `--max <n>`. Without Chrome it skips, with an `L000`
warning. `--indexing public` makes a `noindex` an error (L024), for a site meant for search. Run it again with `--url`
after a deploy: a host or proxy can add a header a local build can't see.

### Test and verify

#### `weft test --gate`

The test gate runs on the diff, in scratch copies. Your working tree is never touched.

| Flag | Default | What it does |
|---|---|---|
| `--gate` | required | Run the gate. `weft test` without it is a usage error: run the suite itself with vitest |
| `--base <ref>` | `HEAD` (the uncommitted change) | What the diff is against |
| `--budget <sec>` | `60`, or `test.gate.mutationBudgetSec` | Time for mutants |
| `--max-mutants <n>` | `40`, or `test.gate.maxMutants` | Mutants sampled |
| `--concurrency <n>` | up to 4, from the CPU count | Parallel runs |
| `--refactor` | off | Promise no behavior change: then no test may change |
| `--no-mutation` | off | Skip the mutants |

It reports **T010** (a new or changed test must fail on the code before the change), **T011** (each new test must kill
at least one mutant of the changed lines) and **T020** (deleting, skipping or loosening a test needs
`// weft-allow T020: <reason>`). `weft docs verify` has the details.

#### `weft browser <cmd>`

Drives the running app. The page is the app open in any browser connected to the dev server: yours, an agent's, or one
`launch` starts. In a browser that runs JS, the same commands are `await __weft__.agent.run('<command>', args)`.

Every `browser` command takes `--url <dev server>`, `--tab <id>` and `--json`.

| Command | Flags and arguments | What it does |
|---|---|---|
| `tabs` | | Tabs connected to the dev server |
| `launch [route]` | `--headed` | Starts a headless Chrome on the app, for when you have no browser |
| `open <route>` | | Navigates the tab and waits for the new page |
| `snapshot` | `--interactive`, `--delta`, `--scope role:name\|@ref`, `--graph-only`, `--no-graph`, `--full` | Roles, names and refs, plus the reactive graph (`Cart.total = 42.5 ← …`). Long output spills to a file unless `--full` |
| `act <target> <action> [value]` | | `click`, `dblclick`, `hover`, `focus`, `clear`, `fill`, `type`, `press`, `select`, `check`, `uncheck` (default `click`) |
| `assert <target> <expectation> [value]` | `--timeout <ms>` | `visible` (default), `absent`, `text`, `exactText`, `value`, `checked`, `unchecked`, `disabled`, `enabled`, `focused`, `count`. Retries until the timeout. Exits 1 on a failure |
| `graph [filter]` | `--full` | The named reactive graph |
| `set <Name.box> <json>` | | Writes state by its graph name (dev only) |
| `time pause\|advance <ms>\|resume\|status` | `--reload` | The page's clock |
| `net offline\|online\|latency <ms>\|drop\|reset\|status` | | The page's network |
| `record start\|stop\|note <text>\|code` | `--component`, `--from`, `--props '{…}'`, `--name`, `--out file.test.tsx` | Records actions and assertions; `code` writes them as a test |
| `logs` | | Console errors and warnings, and uncaught errors, since the last call |
| `overlay [on\|off]` | | The graph panel in the page (Alt+Shift+G) |
| `info` | | What the tab is showing, starting with its URL |
| `reload` | | Reloads the tab |
| `screenshot` | `--out file.png` | Launched Chrome only; use your own browser's screenshot otherwise |
| `close` | | Stops the launched Chrome |

A target is `<role> <name>` (`button "Add Banana"`), `label <text>`, `text <text>`, or a ref from a snapshot (`@e5`).

```bash
npx weft browser launch /cart
npx weft browser act button "Add Banana" click
npx weft browser assert text Cart text "1 item"
npx weft browser record code --component Cart \
  --from ./Cart --out src/Cart.test.tsx
```

### Deploy

| Command | Flags | What it does |
|---|---|---|
| `weft deploy hosts` | | Which hosts can run this app, why not, what each costs, and the one Weft suggests |
| `weft deploy init [target]` | `--target <t>`, `--dry-run`, `--force` | Writes the host's files (`netlify.toml`, `fly.toml` and a Dockerfile…), a GitHub workflow that checks and deploys on push, and `deploy` in the config. Then prints the one-time commands to run yourself |
| `weft deploy` | `--target <t>`, `--prod`, `--yes`, `--unsafe-allow <codes>` | Checks the fit, builds for the target, then runs the host's own CLI and prints the live URL. Without `--yes` it's a dry run that prints what would run and which environment variables it reads. Without `--prod` it's a preview |

| Target | Kind | Reads from the environment |
|---|---|---|
| `netlify` | functions | `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID` |
| `vercel` | functions | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` |
| `cloudflare` | Workers, with Durable Objects | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` |
| `fly` | a server that stays up | `FLY_API_TOKEN` |
| `render` | a server that stays up | `RENDER_DEPLOY_HOOK_URL` |

`weft deploy hosts` also rates AWS Lambda, which `weft deploy` doesn't ship to yet. Nothing in Weft creates a site, an
app, a volume or a DNS record, and a token written into the config, a host file or a workflow is **E008**.
`weft docs deploy` covers which app features each host can run (E001–E003), `deploy` in the config, and the CDN.

```bash
npx weft deploy hosts          # fit, cost and the suggestion
npx weft deploy init fly       # host files and the GitHub workflow
npx weft deploy                # dry run: what --yes would run
npx weft deploy --yes --prod   # ship it
```

### Data

| Command | What it does |
|---|---|
| `weft db generate [name]` | A migration for the schema's changes, through the app's data layer (Drizzle, Prisma or native SQL). It applies on the next request |
| `weft db live` | A migration that adds change triggers to the tables in `changes` (`src/realtime.server.ts`), on Postgres, SQLite or MySQL. On Prisma or native SQL it prints the SQL for you to add |
| `weft db listen` | The change feed as its own process, for an app on functions |

An app with no database gets a usage error that points at `weft add db`.

### Add things

#### `weft add <feature>`

Installs a package with the app's package manager (found from its lockfile: pnpm, bun, yarn, deno or npm) and wires it
into the config, whichever format it's in.

| Feature | What it does |
|---|---|
| `db [engine]` | A database on an app that has none: `sqlite` (default), `postgres` or `mysql`, with `--layer drizzle\|prisma\|native` (default `drizzle`). Writes the same wiring a new app gets, without the todo app. Refuses if the app has a database, or if a file it writes exists |
| `auth` | Better Auth on an app with a database: `src/auth.server.ts`, `src/server/session.ts`, a sign-in page and the auth tables. Refuses without a database or with an existing `src/auth.server.ts` |
| `tailwind` | Tailwind: the Vite plugin, a Tailwind entry in `src/app.css` (without its reset when Warp is there), and the layout's import of it |
| `rust [name]` | A Rust crate, its server module and one working function. `native()` by default (in process); `--remote` for a sidecar behind HTTP |
| `warp`, `icons`, `text` | `@weft-js/warp`, [`@weft-js/warp-icons`](https://www.npmjs.com/package/@weft-js/warp-icons), [`@weft-js/text`](https://www.npmjs.com/package/@weft-js/text) |
| `media`, `media-ffmpeg`, `surface-keel` | [`@weft-js/plugin-media`](https://www.npmjs.com/package/@weft-js/plugin-media), [`@weft-js/plugin-media-ffmpeg`](https://www.npmjs.com/package/@weft-js/plugin-media-ffmpeg), [`@weft-js/plugin-surface-keel`](https://www.npmjs.com/package/@weft-js/plugin-surface-keel) |
| `redis`, `nats` | [`@weft-js/realtime-redis`](https://www.npmjs.com/package/@weft-js/realtime-redis), [`@weft-js/realtime-nats`](https://www.npmjs.com/package/@weft-js/realtime-nats) |
| `pay`, `pay-stripe` | [`@weft-js/pay`](https://www.npmjs.com/package/@weft-js/pay), `@weft-js/pay/stripe` |
| any other name | Another `@weft-js/<name>` add-on, or a package name as given |

| Flag | What it does |
|---|---|
| `--dry-run` | Print what it would install and write, and change nothing |
| `--no-install` | Wire it in without installing |
| `--layer drizzle\|prisma\|native` | For `add db` |
| `--remote` | For `add rust` |

Some add-ons (`pay`, `text`, the media plugins and the realtime transports) aren't released on npm yet.

#### `weft plugins`

| Command | Flags | What it does |
|---|---|---|
| `weft plugins` (or `plugins list`) | | Each plugin, its version, the slots it provides and whether they're bound, its tokens, and diagnostics |
| `weft plugins explain <slot>` | | The binding chain: config, plugin, module, `.weft/slots/<id>.ts` |
| `weft plugins sync` | | Regenerates `.weft/slots/*`, `.weft/slots.d.ts` and `.weft/tokens/*` |
| `weft plugins audit` | | Each plugin's permissions and code against `.weft/plugins.lock.json`, and what it uses that it didn't declare |
| `weft plugins approve [name…]` | `--all` | Records plugins in the lock. With no names and no `--all`, shows what's waiting and writes nothing |

`weft docs plugins` walks through writing one.

### Docs for people and agents

| Command | Flags | What it does |
|---|---|---|
| `weft docs [topic\|code]` | | Prints a docs page or a diagnostic (`weft docs props`, `weft docs W014`). With no topic, the index |
| `weft agents-md` | `--check`, `--stdout` | Writes `AGENTS.md` from the installed Weft. `--check` exits 1 when it's stale; `--stdout` prints it. Any run exits 1 when it's over the 9 KB limit |
| `weft map` | `--stdout` | Writes `.weft/map.md` and `.weft/map.json`: a matrix of what to call in this app |
| `weft mcp` | | An MCP server on stdio (below) |
| `weft tasks` | | The built-in commands and the project's tasks, with arguments, side effects and environments |
| `weft run <task>` | | Runs a project task from `tasks` in `weft.config.ts` |

`weft docs` topics:

| Topic | Covers |
|---|---|
| `rules` | The nine rules: boxes, derived, live JSX and props, run-once bodies. Start here |
| `state` | Every reactive function and `defineState` with persist, sync and history |
| `props` | How props stay live |
| `lists` | Keyed lists, conditionals and stable items |
| `async` | `resource`, `<Boundary>`, `@weft-js/core/ssr` and hydrate |
| `start` | The full stack: routes, `load`, `query`, `mutation`, the database, auth, realtime, runtimes |
| `rust` | Rust bodies: `native()` addons with a WASM fallback, `remote()` sidecars, `weft add rust` |
| `deploy` | Hosts, `weft deploy`, the push workflow, the CDN |
| `plugins` | Building a plugin: slots, server extensions, check hooks, docs, `weft add` |
| `theme` | `warp()` options, worked looks, button tone channels |
| `testing` | `@weft-js/core/test`: render, screen, user, flush, clock |
| `browser` | `@weft-js/core/browser`: online, visible, lifecycle, media, the fakes |
| `ui-state` | Hover, press and focus as state: `interaction()`, the `ui` prop |
| `surface` | `@weft-js/core/surface`: canvas and WebGL as layout children |
| `verify` | `weft browser`, `__weft__.agent` and the test gate |
| `icons` | `@weft-js/warp-icons`: per-icon exports, tiers, sizes |
| `fonts` | Fonts with `@weft-js/text` |
| `meta` | Page metadata and share cards, `weft routes --meta` |
| `config` | `weft.config.ts`: scope, tasks, environments, plugins |
| `design` | The design language: `Stack`, `Row`, `Heading`, `Text`, `Link`, `weft fix`, `weft tokens` |
| `style` | Style groups, `weft style find` and `explain` |
| `diagnostics` | Every code, and which ones the installed Weft reports |
| `commands` | This project's commands and tasks |
| `agents` | The generated `AGENTS.md` |

Installed plugins can add their own topics; `weft docs` with no topic lists them.

#### `weft mcp`

An MCP server on stdio, rooted at `--root`. Its tools:

| Tool | Same as |
|---|---|
| `docs` | `weft docs` |
| `check` | `weft check` |
| `audit` | `weft audit` |
| `routes_meta` | `weft routes --meta` |
| `map` | `weft map` |
| `tasks` | `weft tasks` |
| `surfaces` | `weft surfaces` |
| `style_find`, `style_explain` | `weft style find`, `weft style explain` |
| `test_gate` | `weft test --gate` |
| `browser_tabs`, `browser_launch`, `browser_open`, `browser_snapshot`, `browser_act`, `browser_assert`, `browser_state`, `browser_time`, `browser_net`, `browser_record`, `browser_logs`, `browser_screenshot` | `weft browser` |

To add it to an MCP client:

```json
{
  "mcpServers": {
    "weft": { "command": "npx", "args": ["weft", "mcp"] }
  }
}
```

### Style and design

| Command | Flags | What it does |
|---|---|---|
| `weft style find <query>` | | Style groups that fit what you're about to style (`card`, `status badge`). Reuse before you write |
| `weft style explain <group\|selector>` | `--<axis> <value>`, `--states a,b`, `--accent intent:token`, `--part <p>` | The resolved CSS for one variation, and where each value came from. The group's own axes are flags (`--status late`) |
| `weft style matrix` | `--stdout` | Writes `.weft/styles.json`: every group, with axes, parts, accents, resolved CSS and uses |
| `weft tokens` | | Warp's resolved tokens as DTCG, in `.weft/tokens/` |
| `weft icons publish <dir>` | | Every icon and variant as static `.svg` files with a `manifest.json`, for a CDN. Nothing is uploaded: host the folder, then set `icons({ source })` |

### Editors

| Command | What it does |
|---|---|
| `weft lsp` | A language server for editors on TypeScript 7: `tsc --lsp` with inferred props |

A new app's `tsconfig.json` also loads `@weft-js/cli/ts-plugin`, which gives the editor the same inferred props.

## The diagnostic shape

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

| Field | What it is |
|---|---|
| `span` | 1-based `[line, col, endLine, endCol]`, with columns in UTF-16 units |
| `offset` | UTF-16 indices into the file's text |
| `fix.text` | The fix, in words |
| `fix.edits` | `{ file, span, offset, text }`, when there's a mechanical change |
| `fix.safe` | Whether `weft fix` applies it without asking |
| `project` | `true` for a result that needed more than one file to find |
| `related` | Other places that explain it |
| `docs` | The command that prints its page |

## Diagnostic families

`weft docs diagnostics` lists every code and whether the installed Weft reports it.

| Prefix | Area |
|---|---|
| `W` | Reactivity, from the compiler |
| `S` | State and `defineState` |
| `P` | Plugins and config |
| `D` | Design language and style groups |
| `H` | Page metadata and hydration |
| `Q`, `A`, `C`, `F`, `R` | Server functions and the database, auth, the contract, forms, realtime and Rust |
| `E` | Deploys |
| `L` | Built pages, from `weft build` and `weft audit` |
| `T` | Tests and the test gate |
| `U` | UI state |
| `X` | Surfaces and text |
| `M`, `I` | Media and icons |

A test that needs a T-code on purpose keeps it with `// weft-allow <code>: <why>`, in the file header or on the line
above. Adding a diagnostic is in [CONTRIBUTING.md](https://github.com/Ravonus/weft/blob/main/CONTRIBUTING.md).

## The package API

Most people only run the command. The package also exports what the command is built from:

| Import | Exports |
|---|---|
| `@weft-js/cli` | `check`, `docs`, `topics`, `agentsMd`, `writeAgentsMd`, `catalog`, `entry`, `probe`, `loadConfig`, `tasks`, `bindSlots`, `slotTable`, and the MCP server's `serve`, `handle` and `tools` |
| `@weft-js/cli/config` | `defineConfig`. Apps import it from `@weft-js/core/config`; this is the fallback when a project's Weft doesn't resolve |

```js
import { check } from '@weft-js/cli'

const result = await check(process.cwd(), {
  files: ['src/routes/index.tsx'],
})
console.log(result.summary) // { files, errors, warnings }
```

## Troubleshooting

<details>
<summary><code>weft is not installed</code> (E_NO_WEFT)</summary>

`@weft-js/core/compiler` resolves neither from the project nor from the CLI. Install `@weft-js/core` in the app.
</details>

<details>
<summary>Which compiler am I running?</summary>

`weft doctor`, or `weft check --verbose`. The WASM build gives the same output as the native addon; the addon only adds
speed. Rust is never needed to use Weft.
</details>

<details>
<summary><code>weft build</code> refused with a code</summary>

The build found an error in the built pages or the target. The message has the fix, and the way past it:
`--unsafe-allow <code>`, or `build.unsafeAllow` in `weft.config.ts` with a reason. It exits 1, not 2.
</details>

<details>
<summary><code>weft audit</code> skipped</summary>

It needs a Chrome or Chromium on the machine. Without one it reports `L000` as a warning and checks nothing.
</details>

<details>
<summary><code>weft test</code> says to use vitest</summary>

`weft test` only runs the gate, with `--gate`. Run your suite with vitest.
</details>

<details>
<summary><code>weft agents-md --check</code> fails in CI</summary>

`AGENTS.md` is stale for the installed Weft. Run `weft agents-md` and commit the file. A file over 9 KB fails every run.
</details>

## Related packages

| Package | What it is |
|---|---|
| [`@weft-js/core`](https://www.npmjs.com/package/@weft-js/core) <sup>[source](https://github.com/Ravonus/weft/tree/main/packages/core)</sup> | The runtime, the compiler binding, the Vite plugin, SSR and test utilities |
| [`@weft-js/start`](https://www.npmjs.com/package/@weft-js/start) <sup>[source](https://github.com/Ravonus/weft/tree/main/packages/start)</sup> | The full stack: file routes, server functions, SSR, a database, auth and live data |
| [`@weft-js/create`](https://www.npmjs.com/package/@weft-js/create) <sup>[source](https://github.com/Ravonus/weft/tree/main/packages/create)</sup> | `npm create @weft-js`: a new app with this CLI in it |
| [`@weft-js/db`](https://www.npmjs.com/package/@weft-js/db) <sup>[source](https://github.com/Ravonus/weft/tree/main/packages/db)</sup> | Prisma and native SQL layers, and list sources |
| [`@weft-js/warp`](https://www.npmjs.com/package/@weft-js/warp) <sup>[source](https://github.com/Ravonus/weft/tree/main/packages/warp)</sup> | Warp's components, and the `warp()` theming plugin |

## Contributing

[CONTRIBUTING.md](https://github.com/Ravonus/weft/blob/main/CONTRIBUTING.md) has the setup. To work on this package:

```bash
pnpm --filter @weft-js/cli test
```

The pages `weft docs` prints are in
[`packages/cli/docs`](https://github.com/Ravonus/weft/tree/main/packages/cli/docs). Report security problems privately,
as [SECURITY.md](https://github.com/Ravonus/weft/blob/main/.github/SECURITY.md) says.

## License

[MIT](https://github.com/Ravonus/weft/blob/main/LICENSE).
