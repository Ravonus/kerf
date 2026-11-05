# @weft-js/start

> **Early release (0.1.1).** APIs will change between minor versions.

The full-stack part of weft: routes from files, server functions, server rendering with streaming, a database, auth and
realtime. It runs on Node, Bun or Deno, and doesn't need Rust. An app made with `npm create @weft-js` already has it.

```bash
npm install @weft-js/start
```

A server function in `src/server/` runs on the server. The client gets a stub that calls it:

```ts
// src/server/greeting.ts
import { query } from '@weft-js/start'

export const greeting = query({
  run: () => {
    const time = new Date().toISOString()
    return `Hello at ${time}`
  },
})
```

A route in `src/routes/` reads it. Calling the query in a component gives a `Resource`, a box that fills when the data
arrives:

```tsx
// src/routes/hello.tsx
import { greeting } from '#/server/greeting'

export default function Hello() {
  const text = greeting()
  return <p>{text.value ?? 'Loading…'}</p>
}
```

`npx weft dev` serves it at `/hello`.

## Docs

- `weft docs start`: routes, `load`, `query`, `mutation`, the database, auth, runtimes and realtime.
- `weft docs meta`: page metadata and share cards.
- `weft docs rust`: server functions with a Rust body, if you want them.

The source of each page is in [packages/cli/docs](../cli/docs).

## End-to-end tests

From the repository, `pnpm --filter @weft-js/start test:e2e <built-app>` runs the runtime matrix.
Pass `--e2e <path>` to select another scenario in `test/e2e`. The live database scripts in that
folder run directly with Node and require the database environment shown in each script. They keep
`.mjs` because Node and the runtime matrix load them without a test transform.
