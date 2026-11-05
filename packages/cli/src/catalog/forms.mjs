/** forms diagnostic entries in catalog order. */
export const forms = [
  {
    code: 'F001',
    severity: 'error',
    by: 'runtime',
    catches: "`<Form of>` was given something that isn't a mutation",
    fix: '`<Form of={addTodo}>`, with `addTodo` a `mutation()` export of a server module',
  },
  {
    code: 'F002',
    severity: 'error',
    by: 'start',
    catches:
      'A form POST without the same-origin proof (`Origin`, or `Sec-Fetch-Site: same-origin`): 403',
    fix: 'Submit through a `<Form>` on the same origin; behind a proxy, forward the host so the origins match',
  },
  {
    code: 'F003',
    severity: 'error',
    by: 'start',
    catches: 'A form POST naming no known mutation: the page is older than the server',
    fix: 'Reload; keep `mutation` exports in server modules',
  },
]
