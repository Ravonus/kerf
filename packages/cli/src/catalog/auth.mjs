/** auth diagnostic entries in catalog order. */
export const auth = [
  {
    code: 'A001',
    severity: 'error',
    by: 'start',
    catches: 'The auth secret is missing or under 32 characters on a production server',
    fix: "Set `BETTER_AUTH_SECRET` (`openssl rand -base64 32`) in the server's environment",
  },
  {
    code: 'A002',
    severity: 'error',
    by: 'start',
    catches: "A function with `auth: 'user'` was called with no session (401)",
    fix: 'Sign in first, or guard the route with `redirect()` in its `load`',
  },
  {
    code: 'A003',
    severity: 'error',
    by: 'start',
    catches:
      "`auth: 'user'`, but `ctx` has no `user`: the context file never asked for the session",
    fix: 'Spread `session(auth, request)` into what `src/context.server.ts` returns',
  },
  {
    code: 'A004',
    severity: 'warning',
    by: 'start',
    catches:
      'A mutation changed the session cookie without a redirect: the tab keeps what the last session cached',
    fix: "`redirect()` after it: that's a full load, which drops the client cache",
  },
  {
    code: 'A005',
    severity: 'error',
    by: 'start',
    catches: 'The database provider has no Better Auth adapter',
    fix: 'Pass `options.database` to `createAuth`, or use a provider that has one',
  },
]
