# weft.config

`weft.config.ts` is the default. `weft.config.json` and `weft.config.yaml` take the same keys, and `weft check` writes
`.weft/config.schema.json` for editor completion. In JSON and YAML a plugin is a package name or `[name, options]`, like
`["@weft-js/warp", { "fields": "classic" }]`; anything that needs a function belongs in `weft.config.ts`. Keep one file:
two is P010. `weft add <plugin>` installs a plugin and adds it to whichever format you use; `weft add tailwind` sets up Tailwind, `weft add db mysql --layer native` adds a database, and `weft add auth` adds Better Auth to it.

```ts
import { defineConfig } from '@weft-js/core/config'
import { dialScript, warp } from '@weft-js/warp/plugin'

export default defineConfig({
  scope: { write: ['src/**', 'test/**'], forbid: ['.env*'] },
  tasks: {
    seed: { run: 'node scripts/seed.mjs', description: 'Load demo products into the dev db', sideEffects: ['db'], env: ['dev'] },
  },
  environments: { dev: { url: 'http://localhost:5173' } },
  site: {        // page metadata defaults: static tags in the server's first response (weft docs meta)
    name: 'Acme',
    url: 'https://acme.dev',
    title: '%s · Acme',
    description: 'Tools for builders.',
    locale: 'en_US',
    image: { url: '/og.png', width: 1200, height: 630 },   // default 'auto': a generated card (weft docs meta); false: none
    twitter: { card: 'summary_large_image', site: '@acme' },
    inlineCss: false, // default true: each page carries what its first paint needs; false keeps plain links
    criticalCss: false, // default true: one hashed sheet plus a first-paint part; false splits by chunk and inlines up to 48 KB
    criticalKeep: ['theme-x'], // words of selectors a first paint keeps, for classes a head script sets
    head: dialScript, // raw HTML in every page's head, before the stylesheets: dialScript from @weft-js/warp/plugin restores `setDial(…, { persist: true })` before the first paint
  },
  plugins: [warp()],   // plugin factories (@weft-js/core/plugin); a plain `{ name, provides }` entry is data only
  slots: {},           // names the winner when two plugins provide one slot
})
```

| Key | What it holds, and what `weft check` reports |
|---|---|
| `scope` | `write`, `read` and `forbid` globs. `forbid` is never compiled or written. `write` will bound `weft fix` (P005, not reported yet) |
| `tasks` | Project commands for `weft run` and `weft tasks`. P003 duplicate name or command, P004 missing `description` or `sideEffects` |
| `environments` | Named places the app runs, with a `url` |
| `test` | `include` (default `**/*.{test,spec}.*`), `lanes`, and `gate: { mutationBudgetSec, maxMutants }` for `weft test --gate` |
| `check` | `include` and `exclude` globs; `design: false` turns off the D-codes, `routes: false` the route pass (H001–H007, H011–H016, which run the app's loaders once), `props: false` or `'manual'` the prop inference (`weft docs props`) |
| `plugins` | P116 duplicate name; P100 two entries provide one `one` slot; P115 bad options; P117 impure `contribute()`; P111 code outside the plugin's namespace; P112 AGENTS section over 1 KB; P113 token-namespace or catalog collision; and the codes plugins report themselves (e.g. warp's D010) |
| `slots` | Which plugin wins a slot two provide. P008 unknown slot id, P009 winner not in `plugins` or not providing the slot |
| `site` | Page metadata defaults and CSS delivery. P007 `url` not absolute http(s), `title` without `%s`, `locale` not `en_US` style; H001 no `url`; H003 no `description`; H004 a title over 60 or a description over 160 (warnings) |
| `site.card` | The generated share card's colours and fonts. P007 a colour that isn't `#rrggbb`, a font family that isn't a name. `weft docs meta` has the rest |
| `site.headers` | Response headers by route pattern |
| `runtime` | `node`, `bun` or `deno`: what `weft build` targets (`weft docs start`) |
| `hydration` | `'lazy'` (default): islands load when needed; `'partial'`: every island loads with the page; `'full'`: every route hydrates whole |
| `rust` | `unions` and `services` for Rust bodies (`weft docs rust`) |
| `live` | `targets` for a live query's `verify` (`weft docs start`) |
| `trust` | `'enforce'` (default) or `'warn'`: see P109 and P110 under Plugins |
| anything else | P007: unknown key or wrong type, with the path |

`package.json` scripts may only alias `weft …` (P002). Project commands live in `tasks`.

## Plugins

A plugin is a factory made with `definePlugin` from `@weft-js/core/plugin`. Its pure `contribute(options, env)` returns what it
adds: slot providers, `tokens` (`--<namespace>-*`), one AGENTS.md section (≤ 1 KB), catalog entries and diagnostic
codes in its namespace. Components stay normal imports.

- `weft plugins --json` lists plugins (sorted by name), the slots they provide and bind, permissions and codes.
- `weft plugins explain <slot> --json` shows config → plugin → module → `.weft/slots/<id>.ts`.
- `weft plugins sync` (and `weft check`) writes `.weft/slots/<id>.ts`, `.weft/slots.d.ts` and `.weft/tokens/<ns>.css`.
  Import a slot as `weft:slot/<id>`; its provider loads lazily through `load()`. Unbound: `load()` throws P101.
- Output is the same for any order of `plugins: []`; array order never decides a binding (P100).

### Permissions and the lock

A plugin declares `permissions` (`fs: { read, write }`, `net`, `env`, `spawn`, `native`). `.weft/plugins.lock.json`
records what you approved, plus a hash of each installed plugin's files. Commit it.

- **P109** stops `weft check`, `weft dev` and `weft build` when a plugin asks for a permission the lock doesn't give it,
  or the audit finds it using one it didn't declare.
- **P110** stops them when an installed plugin's code isn't what the lock recorded, or the lock can't be read.
- `weft plugins audit --json` shows every plugin against the lock: permissions added and removed, undeclared use with
  file and line, and the dependencies it didn't read. It exits 1 if anything is blocked.
- `weft plugins approve <name…>` records those plugins, and `--all` records every plugin and drops ones you removed.
  With neither it shows what's waiting and writes nothing. If `.gitignore` hides the lock, it fixes that line. In a
  monorepo, check the ignore file at the repository root yourself.
- `weft add` never approves. It tells you what the plugin asks for, and the next `weft check` stops until you do.
- A plugin that asks for nothing and passes the audit needs no approval, and `approve` pins it if you want that.
- `npm create @weft-js` approves the plugins you pick. It can't hash code before the install, so run
  `weft plugins approve --all` once to pin them.
- `trust: 'warn'` in the config turns P109 and P110 into warnings, for a project that vets dependencies some other way.

This shows you changes; it isn't a sandbox. `contribute()` runs when the config loads, before any of this. The audit
reads the source of the plugin's own package from its entry and its build and server modules, so it won't see code
that hides itself or code in dependencies (your package manager's lockfile pins those). A workspace package has no
fixed code to hash, so it's audited on every check instead. A plugin defined in the config file is your own code:
only its permissions are compared. A plugin is matched to its package by name, so one that claims another's name is
hashed as that package.