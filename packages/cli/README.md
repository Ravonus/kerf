# @weft/cli (Phase 1 agent layer)

The `weft` binary for agents: `weft.config.ts`, `weft check --json`, `weft tasks --json`, a generated AGENTS.md and an
MCP server (PLAN §7, §7b, §7c, §9 Phase 1). It uses the compiler only through the public `weft/compiler` `transform()`.
What this build changes or adds to PLAN: [docs/research/17-agent-layer.md](../../docs/research/17-agent-layer.md).

```bash
npm install                      # needs ../weft built: (cd ../weft && npm install && npm run build:native)
npx vitest run                   # 38 tests, on evals/reference-v3/weft and planted copies of it
node bin/weft.mjs check --json --root ../../evals/reference-v3/weft
```

| Command | Does | Output |
|---|---|---|
| `weft check [files…]` | Compile every `.tsx`/`.jsx` in check mode, add the project view (cross-file W014), config P-codes, P002, P120 and the `slots` block | `--json`: the check result. Exit 1 on errors |
| `weft tasks` | Built-in commands plus the project's `tasks`, with args (JSON Schema), side effects, environments and scope | `--json`: the task list |
| `weft docs [topic\|code]` | `rules`, `props`, `lists`, `testing`, `config`, `diagnostics`, `commands`, `agents`, or a code (`W014`) | Markdown (`--json`: `{ topic, text }`) |
| `weft agents-md` | Write AGENTS.md from the installed weft. `--check` exits 1 when stale, `--stdout` prints it | Under 8 KB (it is ~4.6 KB) |
| `weft mcp` | MCP server on stdio with the tools `docs`, `check`, `tasks` | JSON-RPC 2.0, one message per line |

Every command takes `--root <dir>` (default: the working directory). JSON goes to stdout, human text to stderr. Exit
codes: 0 ok, 1 errors found (or a stale AGENTS.md under `--check`), 2 usage or internal error (`{ ok: false, error:
{ code, message } }` with `--json`).

## Diagnostics

One shape everywhere (`check`, `tasks`, MCP):

```json
{ "code": "W014", "severity": "error", "owner": "core", "file": "src/App.tsx",
  "span": [21, 44, 21, 117], "offset": [867, 940],
  "why": "`.map(p => ({ ...p, … }))` gives every item a new identity on each update, and `products` reaches a keyed list in src/components/ProductList.tsx:29 through <ProductList products>: every row re-runs on every change.",
  "fix": { "text": "Keep items stable … or replace only the item that changed (`p.id === id ? { ...p, price } : p`)." },
  "project": true,
  "related": [{ "file": "src/App.tsx", "span": [43, 22, 43, 22], "why": "passed as `<ProductList products>`" },
              { "file": "src/components/ProductList.tsx", "span": [29, 10, 29, 10], "why": "rendered here as a keyed list" }],
  "docs": "weft docs W014" }
```

- `span` is 1-based `[line, col, endLine, endCol]`, with columns in UTF-16 units. `offset` is UTF-16 indices into the
  file's text. The compiler reports UTF-8 byte offsets, and `check` converts them.
- `fix.edits` (`{ file, span, offset, text }`) are present when the compiler has an edit; `fix.safe` says whether
  `weft fix` may apply it unasked.
- `project: true` marks a result that only the project view could produce.

## weft.config.ts

```ts
import { defineConfig } from 'weft/config'   // resolves to @weft/cli/config until packages/weft ships the subpath

export default defineConfig({
  scope: { write: ['src/**'], forbid: ['.env*'] },
  tasks: { seed: { run: 'node scripts/seed.mjs', description: 'Load demo products', sideEffects: ['db'], env: ['dev'] } },
  environments: { dev: { url: 'http://localhost:5173' } },
  plugins: [],   // reserved: validated as data, never executed in Phase 1
  slots: {},
})
```

The loader uses Node's sync module hooks (Node ≥ 22.15). It transpiles `.ts` with TypeScript (so `enum` works) and
loads it with Node's own `require(esm)`, so it also works inside test runners. Each load gets a fresh module id, so a
long-lived `weft mcp` sees edits to the config file itself. Files the config imports are cached.

Codes reported from the config: P003, P004, P007 (schema, with the Zod path), P008, P009, P100, P116. The full list
is `weft docs config` / `weft docs diagnostics`.

## Layout

| File | |
|---|---|
| `src/cli.mjs`, `bin/weft.mjs` | Argument parsing, output, exit codes |
| `src/load-config.mjs`, `src/config.{mjs,d.ts}` | Loader, Zod schema, task and plugin checks; `defineConfig` and its types |
| `src/slots.mjs` | Slot table and binding rules (research 13 §2.2) |
| `src/check.mjs`, `src/project.mjs` | `weft check`; the project view (cross-file W014, TypeScript parser, syntax only) |
| `src/catalog.mjs` | W- and P-codes, each W-code with an example that `probe()` runs through the installed compiler |
| `src/docs.mjs`, `docs/*.md`, `src/agents-md.mjs` | Docs topics and AGENTS.md, generated from the installed weft (version, exports, codes it reports) |
| `src/tasks.mjs`, `src/mcp.mjs` | `weft tasks`; the MCP server |

Not built yet: `weft run`, `fix`, `dev`, `build`, `test`, `browser`, `create` and `plugins` (`weft tasks` lists them
as `available: false`), the tsc pass with TS→W mapping, content-hash caching, P001/P005/P006 (they need a diff), and
`.weft/slots/` generation.
