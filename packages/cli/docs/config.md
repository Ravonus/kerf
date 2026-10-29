# weft.config.ts

```ts
import { defineConfig } from 'weft/config'

export default defineConfig({
  scope: { write: ['src/**', 'test/**'], forbid: ['.env*'] },
  tasks: {
    seed: { run: 'node scripts/seed.mjs', description: 'Load demo products into the dev db', sideEffects: ['db'], env: ['dev'] },
  },
  environments: { dev: { url: 'http://localhost:5173' } },
  plugins: [],   // reserved: Phase 1 runs no plugins; entries are validated as data
  slots: {},     // reserved: names the winner when two plugins provide one slot
})
```

| Key | Checked by `weft check` |
|---|---|
| `scope` | `forbid` globs are never compiled or written. `write` is the boundary for `weft fix` (P005, planned) |
| `tasks` | P003 duplicate name or command, P004 missing `description` or `sideEffects` |
| `plugins` | P116 duplicate name; P100 two entries `provides` one `one` slot |
| `slots` | P008 unknown slot id, P009 winner not in `plugins` or not providing the slot |
| anything else | P007: unknown key or wrong type, with the path |

`package.json` scripts may only alias `weft …` (P002). Project commands live in `tasks`.
