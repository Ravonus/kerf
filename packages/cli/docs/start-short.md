`@kerf-js/start` app: file routes in `src/routes` (`_layout.tsx`, `[id].tsx`, `load`, `meta`), server functions in `src/server/**` or `*.server.ts`. Import your own code as `#/server/todos` (`src/server/todos`); generated files are `kerf:slot/<id>` and `kerf:tokens/<name>`.

- **Reads:** `query({ tags: ['todos'], auth: 'user', run: ({ ctx }) => ctx.db.select().from(todos) })`. In a component `todos().value ?? []`; in `load` and handlers `await todos.fetch()`.
- **Writes:** `mutation({ input, auth: 'user', invalidates: ['todos'], optimistic, run })`.
- **Content an owner edits** (menu, settings, pages): read with `cache: { life: 'hours', warm: true }`; edits go to a draft (`preview.start(id)` shows the owner), publishing applies it, slow follow-ups go in `after()`. `kerf docs start` § Publishing.
- **Database:** Drizzle; `await` every statement. Schema change: `kerf db generate` (Q015). Inputs: `schemas.todos.insert.pick({ title: true })`.
- **Auth:** Use `auth: 'user'`, `{ role: 'admin' }` or `{ can: (ctx) => … }`. Mutations require a user unless `auth: 'public'`. Guard pages in layout `load`; handlers still check ownership. Sessions/tokens: `kerf docs auth`.
- **HTTP:** `name.http.ts` exports web methods; `hooks.server.ts` exports `handle(request, next)`. Apps own raw-handler CSRF; `site.cors` covers Kerf endpoints. `kerf docs start`.
- **Never** copy query results into `state`, import `db` from a component (Q012), `fetch` `/_kerf/*`, or poll (`todos.live()`; rooms: `channel`).
- **Navigation:** chrome shared by sections (sidebar, tabs) goes in the one layout above them, following `currentPath()`: a per-section `_layout.tsx` is replaced on each move. Route changes show a skeleton from the page's markup; `export const skeleton = Named` (plain markup, class and data-* only) overrides it.
- **Shared marks:** match `data-kerf-shared` keys; add `data-kerf-shared-fit="text"` for text. Start captures before the optimistic path swap. Respect reduced motion; never add a delayed logo clone around `navigate`.
- **Every page sets `meta` as you build it**, from `data` and `params`: `kerf docs meta`.
