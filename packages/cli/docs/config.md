# kerf.config

`kerf.config.ts` is the default. `kerf.config.json` and `kerf.config.yaml` take the same keys, and `kerf check` writes
`.kerf/config.schema.json` for editor completion. In JSON and YAML a plugin is a package name or `[name, options]`, like
`["@kerf/veneer", { "fields": "classic" }]`; anything that needs a function belongs in `kerf.config.ts`. Keep one file:
two is P010. `kerf add <plugin>` installs a plugin and adds it to whichever format you use; `kerf add tailwind` sets up Tailwind, `kerf add db mysql --layer native` adds a database, and `kerf add auth` adds Better Auth to it.

```ts
import { defineConfig } from '@kerf/core/config'
import { dialScript, veneer } from '@kerf/veneer/plugin'

export default defineConfig({
  scope: { write: ['src/**', 'test/**'], forbid: ['.env*'] },
  tasks: {
    seed: {
      run: 'node scripts/seed.mjs',
      description: 'Load demo products into the dev db',
      sideEffects: ['db'], env: ['dev'],
    },
  },
  environments: { dev: { url: 'http://localhost:5173' } },
  // Metadata defaults: static tags in the first response.
  // See kerf docs meta.
  site: {
    name: 'Acme',
    url: 'https://acme.dev',
    title: '%s · Acme',
    description: 'Tools for builders.',
    locale: 'en_US',
    // Default 'auto': generated card; false: none (kerf docs meta).
    image: { url: '/og.png', width: 1200, height: 630 },
    twitter: { card: 'summary_large_image', site: '@acme' },
    // Default true: first-paint CSS. False keeps plain links,
    // as a strict CSP needs (D012).
    inlineCss: false,
    // Default true: one hashed sheet and first-paint CSS.
    // False splits by chunk and inlines up to 48 KB.
    criticalCss: false,
    // Selector words to keep for classes set by a head script.
    criticalKeep: ['theme-x'],
    // Raw HTML before stylesheets on every page. dialScript from
    // @kerf/veneer/plugin restores setDial(…, { persist: true })
    // before the first paint.
    head: dialScript,
  },
  // Plugin factories; plain { name, provides } entries are data.
  plugins: [veneer()],
  // Names the winner when two plugins provide one slot.
  slots: {},
})
```

| Key | What it holds, and what `kerf check` reports |
|---|---|
| `scope` | `write`, `read` and `forbid` globs. `forbid` is never compiled or written. `write` will bound `kerf fix` (P005, not reported yet) |
| `tasks` | Project commands for `kerf run` and `kerf tasks`. P003 duplicate name or command, P004 missing `description` or `sideEffects` |
| `environments` | Named places the app runs, with a `url` |
| `test` | `include` (default `**/*.{test,spec}.*`), `lanes`, and `gate: { mutationBudgetSec, maxMutants }` for `kerf test --gate` |
| `check` | `include` and `exclude` globs; `design: false` turns off the D-codes, `routes: false` the route pass (H001–H007, H011–H016, which run the app's loaders once), `props: false` or `'manual'` the prop inference (`kerf docs props`) |
| `plugins` | P116 duplicate name; P100 two entries provide one `one` slot; P115 bad options; P117 impure `contribute()`; P111 code outside the plugin's namespace; P112 AGENTS section over 1 KB; P113 token-namespace or catalog collision; and the codes plugins report themselves (e.g. veneer's D010) |
| `slots` | Which plugin wins a slot two provide. P008 unknown slot id, P009 winner not in `plugins` or not providing the slot |
| `site` | Page metadata defaults and CSS delivery. P007 `url` not absolute http(s), `title` without `%s`, `locale` not `en_US` style; H001 no `url`; H003 no `description`; H004 a title over 60 or a description over 160 (warnings) |
| `site.card` | The generated share card's colours and fonts. P007 a colour that isn't `#rrggbb`, a font family that isn't a name. `kerf docs meta` has the rest |
| `site.headers` | Response headers by route pattern |
| `site.security` | Headers every Start response gets unless it sets its own (`nosniff`, `Referrer-Policy`, `X-Frame-Options: SAMEORIGIN`, COOP, HSTS on https). Name a header to change it, `false` to drop it, or `security: false` for none |
| `site.trustProxy` | `true` or a number: proxies in front of the server. The client's address comes from that many entries from the right of `X-Forwarded-For`, so auth's rate limit sees real clients. Leave it off with nothing in front |
| `site.log` | `'text'` (default) or `'json'`: the server log's lines, readable or as JSON objects with `time`, `level`, `code`, `message`, `route` and `requestId` |
| `site.limits` | `{ body, upload }` in bytes: the largest JSON (1 MB) and multipart (25 MB) request body. Past it, 413 (Q018) |
| `runtime` | `node`, `bun` or `deno`: what `kerf build` targets (`kerf docs start`) |
| `hydration` | `'lazy'` (default): islands load when needed; `'partial'`: every island loads with the page; `'full'`: every route hydrates whole |
| `rust` | `unions` and `services` for Rust bodies (`kerf docs rust`) |
| `live` | `targets` for a live query's `verify` (`kerf docs start`) |
| `trust` | `'enforce'` (default) or `'warn'`: see P109 and P110 under Plugins |
| anything else | P007: unknown key or wrong type, with the path |

`package.json` scripts may only alias `kerf …` (P002). Project commands live in `tasks`.

## Plugins

A plugin is a factory made with `definePlugin` from `@kerf/core/plugin`. Its pure `contribute(options, env)` returns what it
adds: slot providers, `tokens` (`--<namespace>-*`), one AGENTS.md section (≤ 1 KB), catalog entries and diagnostic
codes in its namespace. Components stay normal imports.

- `kerf plugins --json` lists plugins (sorted by name), the slots they provide and bind, permissions and codes.
- `kerf plugins explain <slot> --json` shows config → plugin → module → `.kerf/slots/<id>.ts`.
- `kerf plugins sync` (and `kerf check`) writes `.kerf/slots/<id>.ts`, `.kerf/slots.d.ts` and `.kerf/tokens/<ns>.css`.
  Import a slot as `kerf:slot/<id>`; its provider loads lazily through `load()`. Unbound: `load()` throws P101.
- Output is the same for any order of `plugins: []`; array order never decides a binding (P100).

### Permissions and the lock

A plugin declares `permissions` (`fs: { read, write }`, `net`, `env`, `spawn`, `native`). `.kerf/plugins.lock.json`
records what you approved, plus a hash of each installed plugin's files. Commit it.

- **P109** stops `kerf check`, `kerf dev` and `kerf build` when a plugin asks for a permission the lock doesn't give it,
  or the audit finds it using one it didn't declare.
- **P110** stops them when an installed plugin's code isn't what the lock recorded, or the lock can't be read.
- `kerf plugins audit --json` shows every plugin against the lock: permissions added and removed, undeclared use with
  file and line, and the dependencies it didn't read. It exits 1 if anything is blocked.
- `kerf plugins approve <name…>` records those plugins, and `--all` records every plugin and drops ones you removed.
  With neither it shows what's waiting and writes nothing. If `.gitignore` hides the lock, it fixes that line. In a
  monorepo, check the ignore file at the repository root yourself.
- `kerf add` never approves. It tells you what the plugin asks for, and the next `kerf check` stops until you do.
- A plugin that asks for nothing and passes the audit needs no approval, and `approve` pins it if you want that.
- `npm create kerf` approves the plugins you pick. It can't hash code before the install, so run
  `kerf plugins approve --all` once to pin them.
- `trust: 'warn'` in the config turns P109 and P110 into warnings, for a project that vets dependencies some other way.

This shows you changes; it isn't a sandbox. `contribute()` runs when the config loads, before any of this. The audit
reads the source of the plugin's own package from its entry and its build and server modules, so it won't see code
that hides itself or code in dependencies (your package manager's lockfile pins those). A workspace package has no
fixed code to hash, so it's audited on every check instead. A plugin defined in the config file is your own code:
only its permissions are compared. A plugin is matched to its package by name, so one that claims another's name is
hashed as that package.


## Indexing intent

For a site intended for public search, declare
`build: { audit: { indexing: 'public' } }`. L024 then fails the build or audit if
robots metadata or an HTTP X-Robots-Tag header says noindex. `private` or the
backward-compatible `auto` leaves this a warning; neither removes a directive.
After deployment, run `kerf audit --url https://your-site.example --indexing public`:
a host or proxy may add a header that a local build cannot see. Preserve intentional
preview/private exclusions. A noindex finding is an indexing policy issue, not
chat-agent traffic; use a clean profile before attributing other audit failures
to application or framework code.
