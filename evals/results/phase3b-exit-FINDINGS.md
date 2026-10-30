# Phase 3b exit check: findings

2026-10-30. Two fresh Sonnet agents, one brief, no e2e and no framework sources.

| Run | `weft check` | `tsc` | Hidden e2e | What stopped it |
|---|---|---|---|---|
| 1 | clean | 1 error | 13/13 on Node, Bun, Deno (after the e2e fix below) | The agent typed `onInput`'s event as `InputEvent`; TypeScript's DOM types say `Event` |
| 2 | clean | clean | first run failed at the typing check on all three | A compiler bug (below); passes 13/13 with the fix, app unchanged |

The recorded PASS is run 2's app, unedited, after the compiler fix. Neither agent got it all right on the first try.

## Framework bug the eval found

**`.map(([k, v]) => …)` in JSX crashed at runtime** with `function is not iterable`, and `weft check` said nothing. Row
callbacks handled an identifier or an object pattern; an array pattern kept its destructuring over the row's accessor.
Now `v` compiles to `_item()[1]` (`AccessorIndex`, tests in `crates/weft-compiler/tests/compile.rs` and
`packages/weft/test/rows.test.tsx`). Still open: a rest or nested element in that pattern (`([a, ...b])`) crashes the
same way, and so does a nested object pattern. `weft check` should reject those until they're lowered.

## The e2e

- **My bug:** the first version typed the next message before the previous ack cleared the input, so the ack wiped the
  draft. `say` now waits for the box to empty, which the brief promises. A real user typing that fast would lose a
  draft on both agents' pages; the docs don't warn about clearing on ack.
- **Teeth:** three mutants of run 1's app, on Node. `authorize: () => true` fails at the guest join. Removing
  `onReset`'s invalidate fails at the reset check with the history gone. `max(50000)` fails at the long message.

## Docs, from the agents' reports

Fixed in `weft docs start`: where `invalidate` and `skip` come from; a refused join can't drive server-rendered UI, so
share the rule with `load`; `ctx.user` stays nullable in `on`; how to send `typing`; how to type a handler.

Not fixed, outside this phase:
- The scaffold's `.env` has `BETTER_AUTH_URL` on 5173 and `weft dev` listens on 3000, so sign-in fails with
  `INVALID_ORIGIN` until `--port 5173`. Both agents hit it.
- The route example reads `props.data` in the body, which is W001; a destructured signature is what passes.
- AGENTS.md says no `let` counters in a component body, and `weft check` accepts `let lastTyping`.
- The scaffold doesn't install `tsc`, so an agent can't run the check that caught run 1.
- `weft browser` drives one tab and one cookie jar, so an agent can't test two users. Both left typing and reconnect
  untested, and that's where the bugs were.
- `weft browser assert "role:status" text open` prints the help instead of an error.
