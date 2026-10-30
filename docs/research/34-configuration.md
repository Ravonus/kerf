# 34. Configuration: a strong default, one setting away from anything else

Status: design, 2026-10-30. Nothing here is built except the alias (§6). It changes PLAN §4, §7c, §8 and §9.

**Goal:** weft has a clear default stack, and every part of it can be swapped by configuration. A new app needs no
decisions. An app that wants MySQL, Prisma, Tailwind or its own auth gets it from the wizard or one setting, and nothing
in weft assumes the default.

**The rule for every choice:** the default is a provider like any other. If the default needs a private path into
weft, the seam is wrong.

## 1. What's fixed today

| Area | Today | Gap |
|---|---|---|
| Setup | `create-weft` flags | No wizard, few choices |
| Config file | `weft.config.ts`, `.mts`, `.js`, `.mjs` | No JSON or YAML |
| Database | Drizzle on SQLite or Postgres | `db.adapter` is reserved, `@weft/start/db` imports Drizzle, no MySQL |
| Auth | Better Auth | `auth.ts` imports the Drizzle adapter directly |
| warp | `warp({ seed, fields })` | Dials are set in markup; fonts, radius and tokens aren't config |
| Styling | Style groups, `headless`, `none` | Tailwind adapter waits for Phase 4 |
| Alias | `tsconfig.json` `paths`, `#/` by default | Done (§6) |

## 2. The config file

`weft.config.ts` stays the default. `weft.config.json` and `weft.config.yaml` are also accepted, with one schema across
all three. Two config files in one project is a P-code error.

```yaml
# weft.config.yaml
site: { name: Acme, title: "%s · Acme" }
runtime: node
db: { engine: mysql, layer: native }
auth: { provider: better-auth }
ui:
  kit: warp
  warp:
    seed: { accent: "#0a7d4f" }
    dials: { expression: quiet, density: compact }
    radius: soft
    fonts: { body: Inter }
plugins:
  - ["@acme/weft-audit", { level: strict }]
```

- **TypeScript or data, same result.** A plugin is `warp()` in TypeScript or `["@weft/warp", { … }]` in JSON and YAML.
  Data formats can't hold functions, so anything that needs one uses `weft.config.ts`.
- **Editors:** `weft check` writes `.weft/config.schema.json`, including each installed plugin's options, so JSON and
  YAML get completion through `$schema`.
- **YAML's parser is a lazy dependency,** loaded only when that file exists.
- **Config is data at build time.** It's never read reactively, like metadata.

## 3. The wizard

`create-weft` runs a short wizard in a terminal, in the spirit of create-t3-app. It goes through each choice as a list
with the default selected: Enter keeps it, and the arrow keys pick another. So the data layer shows Drizzle, Prisma and
Native, and an app that wants the default never has to think about it.

1. App name
2. UI: warp, headless, Tailwind, none
3. Database engine: SQLite, Postgres, MySQL, none
4. Data layer: Drizzle, Prisma, Native (only if there's an engine)
5. Auth: Better Auth, none, bring your own (only if there's a database)
6. Runtime: Node, Bun, Deno
7. Package manager, git, and whether to install

- **Flags answer questions.** Every question has a flag, and any flag skips its question.
- **Agents and CI never see a prompt.** With no terminal, or with `--yes`, unanswered questions take their defaults.
- **The wizard only writes files.** Its answers go into the config and the app. Nothing depends on how the app was made.
- **Agents read the outcome.** AGENTS.md describes the choices this app made, not every option, so it stays under 8 KB.

## 4. Databases

Two independent choices: the **engine** (SQLite, Postgres, MySQL, others) and the **data layer** (Drizzle, Prisma,
Native). No database at all is `db: none`.

**weft doesn't wrap queries.** `ctx.db` is the real Drizzle or Prisma client with its own types, or Native's thin layer,
so a provider's docs stay true. The `db.adapter@1` slot covers only what weft itself needs:

| The slot provides | Used by |
|---|---|
| A connection for the runtime, and its shutdown | `src/db`, `ctx.db` |
| Migration generate and apply | `weft db generate`, startup |
| A schema hash for drift | Q015 |
| Insert and select schemas | `schemas.todos.insert`, `<Form>` |
| The adapter Better Auth needs | Auth |
| A test database | `weft/test` |

- **Providers:** `@weft/plugin-db-drizzle` is the default, and `@weft/plugin-db-prisma` is the second, which proves the
  seam. `@weft/plugin-db-native` is the third. With `db: none` there's no slot: `ctx` is yours, and query and mutation
  work as they do now.
- **Native means no ORM, still a real database layer.** You get a connection to the engine you chose and a parameterised
  `` ctx.db.sql`select * from todos where id = ${id}` `` (values are always bound, never concatenated). You can pass your
  own driver or connection instead. Migrations are plain `.sql` files, Q015 hashes them, and `schemas` are Zod schemas you
  write. The driver stays reachable, so nothing weft doesn't cover is out of reach.
- **Support tiers:** *tested* combinations run in the matrix on every runtime. *Community* providers implement the slot
  and pass its conformance suite. `weft plugins verify` reports which is which.
- **First tested set:** Drizzle, Prisma and Native on SQLite, Postgres and MySQL. MariaDB, libSQL and others follow as providers
  and need their own check before anyone claims them.
- **Bring your own:** any package that provides `db.adapter@1` and passes conformance works, with no change to weft.

**Limits to be honest about:**
- Changing `db.engine` changes wiring, not your code. A Drizzle schema is written per dialect (`sqliteTable`,
  `mysqlTable`), and raw SQL differs too. `weft check` should list what needs changing.
- Changing the data layer means rewriting queries, because `ctx.db` is a different client. That's a migration, not a
  setting, and a codemod is out of scope for now.
- Runtimes may narrow the choice. Whether MySQL and Prisma work on all of Node, Bun and Deno is unverified, and a
  combination that doesn't work must be refused at setup and by `weft check`, not discovered at runtime.

## 5. Auth, UI and styling

- **Auth:** a new `auth.provider@1` slot gives `ctx.user`, sign-in routes and the A-code checks. Better Auth is the
  default provider and takes its store from `db.adapter`. `auth: 'user'` works with any provider.
- **warp:** config gains default dials, fonts, radius, density and token overrides. Every override goes through the
  existing contrast check at every dial stop, so D010 still protects users.
- **Styling:** the Tailwind adapter moves up from Phase 4 into this work. `headless` and `none` stay. Plain CSS keeps
  working as it does.

## 6. Aliases (built)

`tsconfig.json` `paths` is the one place for import aliases, and `#/*` is only what `create-weft` writes. Vite follows it
through `resolve.tsconfigPaths`, which an app's own Vite config can turn off. `weft check`, the gate and AGENTS.md read
the same setting. Generated files keep the `weft:` prefix.

## 7. `weft add`

The wizard only helps on day one. `weft add` makes the same choices later, on an existing app:

```
weft add auth
weft add db mysql --layer native
weft add tailwind
weft add @acme/weft-audit
```

- **One generator.** The wizard and `weft add` write through the same code, so a feature added later matches one chosen
  at the start.
- **It does what the manual steps would:** installs packages, updates the config, adds the wiring files, and regenerates
  AGENTS.md and the map.
- **It's safe to run on a real app.** It never overwrites a file you've changed: it stops and lists the conflict. `--dry-run`
  prints the changes first.
- **Agents use it too,** because it needs no prompts, and that's far less error-prone than following install steps by hand.
- **It adds, it doesn't convert.** Going from Drizzle to Prisma still means rewriting queries (§4).

This replaces the planned `weft plugins add`. Editing config by hand keeps working: `weft add` only saves the steps.

## 8. The agent map

Every choice above changes what an agent should call, so a static doc can't describe an app. `weft map` generates
`.weft/map.md` and `.weft/map.json` from this app's config and code, and regenerates them on `weft dev`, `weft build` and
`weft check`. `--check` fails when they're stale, like AGENTS.md. AGENTS.md keeps a stable pointer to the map, so it
stays small however much the app grows.

The map is a matrix of *what you want → what to call*, listing only what this app has:

| To find or do | Call | Comes from |
|---|---|---|
| Pages and their data | `weft routes` | `src/routes` |
| Server functions: input, auth, tags | `.weft/contract.json` | The build's contract |
| Tables and the data layer | `weft db …`, `src/db/schema` | `db.adapter` |
| Who a user is | `ctx.user` and this app's provider | `auth.provider` |
| Styles | `weft style find <what>` | `.weft/styles.json` |
| UI components | The kit's catalog | The `ui` plugin |
| Slots and plugins in use | `weft plugins explain <slot>` | Slot bindings |
| Project tasks | `weft tasks --json` | `tasks` |
| Rules and codes | `weft docs <topic or code>` | The installed weft |
| See it running | `weft browser snapshot` | The dev server |

- **It names, it doesn't copy.** Each row says where the real answer lives, so the map stays small and can't drift from
  it. The counts and names it does list come from the same scans those commands use.
- **Choices change the rows.** With Prisma, the database row points at `prisma/schema.prisma` and Prisma's commands. With
  no auth, the auth row is gone.
- **Plugins add rows.** A plugin declares its entries, under the same per-plugin limit as its AGENTS section.
- **`weft mcp` serves it** as a `map` tool, so an agent gets the same matrix without reading a file.

## 9. Order and exit checks

| Slice | Ships | Exit check |
|---|---|---|
| **A. Config, wizard and map** | JSON and YAML, the schema file, the wizard, `--yes`, `weft add` for plugins and UI, `weft map` | One app configured in all three formats builds identically; `--yes` with no terminal gives the default app; a fresh agent answers where-is questions about an unfamiliar app from the map alone |
| **B. warp and styling** | warp config options, the Tailwind adapter, `weft add tailwind` | A Tailwind scaffold and a re-themed warp scaffold pass the packed gate and every contrast and a11y stop |
| **C. Databases** | `db.adapter@1` and conformance, the Drizzle, Prisma and Native providers, MySQL, `weft add db` | The todo + auth app passes its hidden checks on each tested combination and runtime |
| **D. Auth** | `auth.provider@1`, Better Auth over any adapter, `weft add auth` | A hand-written provider passes the same auth checks with no change to weft |

**Costs:** every option multiplies testing. The matrix covers the tested tiers rather than every combination, and this
work comes before 3c, because 3c's `@weft/db-*` packs build on these slots.

## 10. Open questions

- **Default stack:** should Enter-through give the todo + auth app, or a plain app?
- **Auth on Native:** Better Auth needs a store. Whether it can use Native's connection directly on all three engines is
  unverified, and slice D has to settle it.
