`@weft-js/start` app: file routes in `src/routes` (`_layout.tsx`, `[id].tsx`, `load`, `meta`), server functions in `src/server/**` or `*.server.ts`. Import your own code as `#/server/todos` (`src/server/todos`); generated files are `weft:slot/<id>` and `weft:tokens/<name>`.

- **Reads:** `query({ tags: ['todos'], auth: 'user', run: ({ ctx }) => ctx.db.select().from(todos) })`. In a component `todos().value ?? []`; in `load` and handlers `await todos.fetch()`.
- **Writes:** `mutation({ input, auth: 'user', invalidates: ['todos'], optimistic, run })`.
- **Content an owner edits** (menu, settings, pages): read with `cache: { life: 'hours', warm: true }`; edits go to a draft (`preview.start(id)` shows the owner), publishing applies it, slow follow-ups go in `after()`. `weft docs start` § Publishing.
- **Database:** Drizzle; `await` every statement. Schema change: `weft db generate` (Q015). Inputs: `schemas.todos.insert.pick({ title: true })`.
- **Auth:** `ctx.user` is the user or `null`; `auth: 'user'` refuses anyone else (A002), `{ role: 'admin' }` or `{ can: (ctx) => … }` the wrong user (A006). With auth on, mutations need a signed-in user unless `auth: 'public'` (sign-in, sign-up, sign-out). Guard pages with `redirect('/login')` in a layout's `load`; `run` still checks who owns a row. Sessions live in the database; pages cache them 5 minutes in a signed cookie (`session.cookieCache`). JWTs are API-only (`api: { functions }`).
- **Never** copy query results into `state`, import `db` from a component (Q012), `fetch` `/_weft/*`, or poll (`todos.live()`; rooms: `channel`).
- **Navigation:** chrome shared by sections (sidebar, tabs) goes in the one layout above them, following `currentPath()`: a per-section `_layout.tsx` is replaced on each move. Route changes show a skeleton from the page's markup; `export const skeleton = Named` (plain markup, class and data-* only) overrides it.
- **Every page sets `meta` as you build it**, from `data` and `params`: `weft docs meta`.
