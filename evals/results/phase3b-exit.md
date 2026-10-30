# Phase 3b exit check

2026-10-30: **PASS**. `create-weft --db sqlite --auth --ui warp`, extended by a fresh agent with chat
rooms from the brief in `evals/phase3b-exit.mjs`, then the hidden e2e (`evals/phase3b-exit.e2e.mjs`) per runtime, in
Chrome and over a raw WebSocket.

| Runtime | Result | Checks |
|---|---|---|
| node | pass | 13 |
| bun | pass | 13 |
| deno | pass | 13 |

- `weft check`: no errors ({"files":8,"tests":0,"errors":0,"warnings":0,"byCode":{}}).
- `tsc` on the app: 0 error(s) in `src/`, 5 in linked packages.
- Tables: user, session, account, verification, todos, messages. Migrations: 0000_daily_morg.sql, 0001_aspiring_nocturne.sql.
