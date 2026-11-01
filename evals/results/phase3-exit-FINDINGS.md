# Phase 3 exit check: findings

2026-10-30. One Sonnet agent, given the scaffold and the brief in `evals/phase3-exit.mjs`, with no e2e. Result:
[phase3-exit.md](phase3-exit.md), 24/24 on Node, Bun and Deno on the first run.

**How much this shows.** One agent and one run, with an exact brief (names, roles and labels). It shows the scaffold
and docs are enough to add a table, a migration, access rules and UI, not how the stack compares to T3. The agent never
saw a diagnostic, so this run says nothing about whether they help. To check the e2e, `toggleTodo`'s share check was
removed from the agent's code: the suite failed, then the code was restored.

**Fixed from the agent's report.**
- AGENTS.md listed `dev` and `build` as not shipped. Full-stack apps now list `dev`, `build`, `start` and `db`.
- `weft docs start` had no access rule beyond ownership, and nothing on two queries in one `optimistic`. Added.
- `weft dev --port` with another port breaks sign-in unless `BETTER_AUTH_URL` matches. Now documented; the failure is
  still only a server log line (`INVALID_ORIGIN`).

**Open.**
- `weft check` doesn't read server modules, so Q011 only fires when a function runs in `weft dev`. The agent chose its
  tags with no confirmation.
- The scaffold ships no `tsc`, so server code an agent writes isn't type-checked unless the build happens to catch it.
- AGENTS.md forbids `fetch` to `/_weft/*` and offers no way to call a server function from a script.
- warp's `Input` renders its label twice (visible, and aria-hidden character spans), so `label.textContent` is garbled.
  Accessible-name queries are right.
- The two `tsc` errors in linked packages are `packages/warp-core/src/floating-label.ts:172,182`, which predate this work.
- The build prints two harmless warnings: `bun:sqlite` treated as external, and a `@takumi-rs/core` traceInclude.
