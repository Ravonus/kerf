`@weft/start` app: file routes in `src/routes` (`_layout.tsx`, `[id].tsx`, `load`, `meta`), server functions in `src/server/**` or `*.server.ts`. Read `weft docs start` first.

- **Reads:** `query({ tags: ['todos'], auth: 'user', run: ({ ctx }) => ctx.db.select().from(todos) })`. In a component `todos().value ?? []`; in `load` and handlers `await todos.fetch()`.
- **Writes:** `mutation({ input, auth: 'user', invalidates: ['todos'], optimistic, run })`.
- **Database:** Drizzle; `await` every statement. Schema change: `weft db generate` (Q015). Inputs: `schemas.todos.insert.pick({ title: true })`.
- **Auth:** `ctx.user` is the user or `null`; `auth: 'user'` refuses anyone else (A002). A guard is `redirect('/login')` in a layout's `load`. `run` must still check who owns a row.
- **Never** copy query results into `state`, import `db` from a component (Q012), `fetch` `/_weft/*`, or poll (`todos.live()`; rooms: `channel`).
