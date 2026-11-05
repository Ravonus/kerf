/** serverState diagnostic entries in catalog order. */
export const serverState = [
  {
    code: 'S001',
    severity: 'error',
    by: 'cli',
    catches:
      'A server object or array (`q().value`, `await q.fetch()`, or a map, filter or spread of one) copied into `state`: it goes stale and its rows lose their identity',
    fix: 'Reference the query and `derived` from it; store ids; `state.linked` for edits, `untrack` for a deliberate snapshot',
  },
  {
    code: 'S002',
    severity: 'error',
    by: 'runtime',
    catches:
      'A `defineState` scope reached on the server outside a render (module scope, `load`, a server function, a timer): it would be shared by every request',
    fix: 'Read it in a component, a handler or a `derived`; pass values into server code as arguments',
  },
]

/** stateTransport diagnostic entries in catalog order. */
export const stateTransport = [
  {
    code: 'S012',
    severity: 'warning',
    by: 'cli',
    catches:
      '`state.linked` over a query value with no `key`: a refetch resets what someone is typing',
    fix: 'Add `{ key: () => source.value?.id }`',
  },
  {
    code: 'S013',
    severity: 'warning',
    by: 'runtime',
    catches:
      'A `local` or `session` persisted box read in a server render: the page shows `init`, then flashes to the stored value',
    fix: "`persist: { in: 'cookie' }` if it's small, or render it client-only",
  },
]
