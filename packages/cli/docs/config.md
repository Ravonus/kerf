# weft.config.ts

```ts
import { defineConfig } from 'weft/config'

export default defineConfig({
  scope: { write: ['src/**', 'test/**'], forbid: ['.env*'] },
  tasks: {
    seed: { run: 'node scripts/seed.mjs', description: 'Load demo products into the dev db', sideEffects: ['db'], env: ['dev'] },
  },
  environments: { dev: { url: 'http://localhost:5173' } },
  site: {        // page metadata defaults: static tags in the server's first response (research 20)
    name: 'Acme',
    url: 'https://acme.dev',
    title: '%s · Acme',
    description: 'Tools for builders.',
    locale: 'en_US',
    image: { url: '/og.png', width: 1200, height: 630 },   // or 'auto' (generated card, not built yet)
    twitter: { card: 'summary_large_image', site: '@acme' },
  },
  plugins: [warp()],   // plugin factories (weft/plugin); a plain `{ name, provides }` entry is data only
  slots: {},           // names the winner when two plugins provide one slot
})
```

| Key | Checked by `weft check` |
|---|---|
| `scope` | `forbid` globs are never compiled or written. `write` is the boundary for `weft fix` (P005, planned) |
| `tasks` | P003 duplicate name or command, P004 missing `description` or `sideEffects` |
| `plugins` | P116 duplicate name; P100 two entries `provides` one `one` slot; P115 bad options; P117 impure `contribute()`; P111 code outside the plugin's namespace; P112 AGENTS section over 1 KB; P113 token-namespace or catalog collision; a code a plugin throws from `contribute()` (e.g. warp's D010) |
| `site` | P007 `url` not absolute http(s), `title` without `%s`, `locale` not `en_US` style; M001 relative image (or `auto`) without `url`; M003 no `description`; M004 title over 60 or description over 160 (warnings) |
| `slots` | P008 unknown slot id, P009 winner not in `plugins` or not providing the slot |
| anything else | P007: unknown key or wrong type, with the path |

`package.json` scripts may only alias `weft …` (P002). Project commands live in `tasks`.

## Plugins

A plugin is a factory made with `definePlugin` from `weft/plugin`. Its pure `contribute(options, env)` returns what it
adds: slot providers, `tokens` (`--<namespace>-*`), one AGENTS.md section (≤ 1 KB), catalog entries and diagnostic
codes in its namespace. Components stay normal imports.

- `weft plugins --json` lists plugins (sorted by name), the slots they provide and bind, permissions and codes.
- `weft plugins explain <slot> --json` shows config → plugin → module → `.weft/slots/<id>.ts`.
- `weft plugins sync` (and `weft check`) writes `.weft/slots/<id>.ts`, `.weft/slots.d.ts` and `.weft/tokens/<ns>.css`.
  Import a slot as `weft:slot/<id>`; its provider loads lazily through `load()`. Unbound: `load()` throws P101.
- Output is the same for any order of `plugins: []`; array order never decides a binding (P100).
