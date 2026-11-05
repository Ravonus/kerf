/** serverFunctions diagnostic entries in catalog order. */
export const serverFunctions = [
  // Server functions and the query cache (research 27 §6; Q for query). `start`: reported by @weft-js/start while serving
  // (the server log, and the error the call rejects with); `runtime`: thrown or warned by the client runtime.
  {
    code: 'Q001',
    severity: 'error',
    by: 'runtime',
    catches:
      '`q()` (a live query, a Resource) called with no owner: in `load`, a handler, a timer or module scope',
    fix: '`await q.fetch(input)` there; `q()` in components and defineState scopes',
  },
  {
    code: 'Q002',
    severity: 'error',
    by: 'start',
    catches:
      "A query's or mutation's input failed its schema (400, with the issues and their paths)",
    fix: 'Pass what the schema accepts',
  },
  {
    code: 'Q003',
    severity: 'error',
    by: 'start',
    catches:
      '`query`/`mutation` defined outside a server module: its `run` and imports would ship to the client (the build fails)',
    fix: 'Move it to `src/server/**` or a `*.server.ts` file',
  },
  {
    code: 'Q004',
    severity: 'error',
    by: 'start',
    catches:
      "A mutation called while the server handles a GET (`load`, a page render, a query's `run`)",
    fix: 'Call it from a handler or another mutation; reads go in queries',
  },
  {
    code: 'Q005',
    severity: 'warning',
    by: 'start',
    catches:
      "A server function's result doesn't survive JSON (`Date`, `Map`, `Set`, a class, `undefined` in an array, a function, `NaN`): the client sees another value",
    fix: 'Send plain data (ISO strings, arrays, objects)',
  },
  {
    code: 'Q006',
    severity: 'error',
    by: 'start',
    catches:
      'A cached (`cache: { life }`) query reads `ctx.request`, `ctx.response` or `ctx.user`: its value is shared by every user',
    fix: 'Drop `cache`, or pass the value as input',
  },
  {
    code: 'Q007',
    severity: 'error',
    by: 'start',
    catches:
      "`redirect()` after the page started streaming (a component's query): the status is already sent",
    fix: "Call the query in the route's `load`, which runs before the first byte",
  },
  {
    code: 'Q008',
    severity: 'warning',
    by: 'start',
    catches: `A mutation \`invalidates\` a tag no query declares (\`todo:*\` covers \`todo:\${id}\`): nothing refreshes`,
    fix: "Fix the tag name, or add it to the query's `tags`",
  },
  {
    code: 'Q009',
    severity: 'error',
    by: 'start',
    catches:
      "`/_weft/fn/<id>` names no function: the page is older than the server, or the module isn't a server module",
    fix: 'Reload; keep `query`/`mutation` exports in server modules',
  },
  {
    code: 'Q010',
    severity: 'error',
    by: 'start',
    catches:
      'A mutation request without the CSRF proof (POST, JSON, `x-weft: 1`, same origin): 403',
    fix: 'Call mutations through their stub, not a hand-made `fetch` or form',
  },
  {
    code: 'S011',
    severity: 'warning',
    by: 'runtime',
    catches:
      "`mutation({ optimistic })` updated a query its invalidated tags didn't cover: the prediction has no fresh value to land on (held until a refetch)",
    fix: "Add one of the query's tags to `invalidates`",
  },
]
