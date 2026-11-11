/** databaseQueries diagnostic entries in catalog order. */
export const databaseQueries = [
  {
    code: 'Q011',
    severity: 'warning',
    by: 'start',
    catches:
      "A function read or wrote a table its `tags`/`invalidates` don't name (dev): a mutation of that table won't refresh it",
    fix: "Add the table's name (or `table:…`) to `tags`/`invalidates`",
  },
  {
    code: 'Q012',
    severity: 'error',
    by: 'start',
    catches: '`@kerf/start/db*` or `@kerf/start/auth` reached the client graph',
    fix: "Import it from a server module (`src/server/**`, `*.server.ts`) or a route's `load`",
  },
  {
    code: 'Q013',
    severity: 'error',
    by: 'start',
    catches:
      "A database URL the driver can't open (a `postgres://` URL given to the SQLite entry, or the reverse)",
    fix: 'Use the matching `createDb`: `@kerf/start/db/sqlite` or `@kerf/start/db/postgres`',
  },
  {
    code: 'Q014',
    severity: 'error',
    by: 'start',
    catches: "The database doesn't match the schema: a table or column is missing",
    fix: 'Run `kerf db generate`, then reload (new migrations apply on the next request)',
  },
]

/** databaseSchema diagnostic entries in catalog order. */
export const databaseSchema = [
  {
    code: 'Q015',
    severity: 'warning',
    by: 'cli',
    catches: '`src/db/schema.ts` changed since the last `kerf db generate`',
    fix: 'Run `kerf db generate`',
  },
  {
    code: 'Q016',
    severity: 'error',
    by: 'start',
    catches:
      "A request used the database while it was down, or a migration it needs failed (503; the server log has the driver's error). Pages that run no statements still serve",
    fix: 'Start the database and check `DATABASE_URL`, or fix the migration: the next statement tries again',
  },
]
