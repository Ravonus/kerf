# 39. The speed lab

Every optimisation in the runtime's update and list paths is a named switch in `packages/weft/src/flags.ts`. Each is
behaviour-neutral: turning one off changes speed and size and nothing else, and the suite proves it by passing both ways
(`WEFT_OFF=all npx vitest run`). `evals/speed/lab.mjs` prices them.

## Using it

```sh
cd evals/speed
node lab.mjs                        # all on, all off, each path off alone (about an hour)
node lab.mjs --off SWAP,TEXT        # one combination against all on
node lab.mjs --flags SWAP,TEXT      # each of these off alone
node lab.mjs --sizes                # bytes only, in a minute
node lab.mjs --host yuna-mbp        # build here, time there (when this Mac is busy)
node lab.mjs --report               # lab.json to lab.html again
open lab.html
```

An app can do the same with `weft({ off: ['SWAP'] })`.

## How paths reach an app

Three ways, in order of preference. None can change behaviour, because a path being absent only means the slower
route, which gives the same DOM.

1. **Tree-shaking.** `For` installs what only lists need (`trade`, `wipe`) and links `Row` when it's first called, so an
   app without a keyed list ships neither. Nothing has to detect anything, so third-party packages are safe.
2. **The plugin's `off`.** Rewrites `flags.ts` for a build. For experiments and for an app that wants to trade.
3. **Adaptive at runtime.** Decided by size where the data can't be known at build time: see below.

`weft/linked` went back into the core. As a plugin-injected feature it had a failure mode the speed paths can't: a
package in `node_modules` using `state.linked` isn't transformed by the plugin in a dev prebundle, so the method wasn't
there and it threw. Absence must mean slower, never broken, and that's worth its 169 B.

## What was tried and refused

- **`BATCH`, a fragment for long runs of new rows.** Slower: create 9% and 10k rows 8% worse than `insertBefore` one by
  one, measured in the lab. Removed.
- **`SORT`, skipping the queue's sort when it's already in order.** 14 B on the shop for nothing past the noise in the
  lab: V8 sorts a sorted list quickly. Removed.
- **Plain arrays without the longest-run search.** Would save bytes in apps without `For`, but a node that needn't move
  could move, and a moved node loses focus. That's a change of behaviour, so `inOrder` stays in every app.
- **Hot code after first paint.** What could be deferred is the code `For` installs, 218 B brotli. Split out, the
  entry grew by 571 B for Vite's dynamic-import glue, so the app paid 789 B more to defer 218 B, and an early swap would
  take the slow path. There's nothing large enough here to defer: `For` itself is needed for first render. Not built.
- **Skipping the key when a row's item is the same object.** Saves `by()` calls on remove, but a key that changed
  inside a mutated object would keep a stale row. A semantic shortcut; refused.

## Adaptive thresholds

| Where | Rule | Why this number |
| --- | --- | --- |
| `add` | under 8 links, an exact-size copy; past it, `push` | memory: V8's first `push` reserves 17 slots |
| `read` | up to 8 positions back, look for a repeat | short lists don't hold one box twice |
| Keyed write | over 8 readers and objects not far larger: compare the object's keys, else the readers' | one write costs the smaller side |
| `For` middle | up to 8 rows: scan; past it: a Map | `LINEAR`: 15% on a list of 8, for 81 B |
| `For` repeats | checked only once a pass could keep rows | a first render costs no hashing |

The current prices, per path, per bundle and per benchmark, are in `evals/speed/lab.html`.
