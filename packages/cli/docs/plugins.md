# How pay is built

A plugin is one pure manifest. `@kerf-js/pay` is the worked example: payments, with a webhook, a ledger, a fake for tests, its
own diagnostics and `kerf add` steps. It uses only what any plugin can use, and a test holds that to be true: `kerf`,
`@kerf-js/start` and the CLI don't name it. Read `packages/pay/plugin.mjs` next to this page. It's 50 lines.

## The shape

```
packages/pay/                     packages/pay/ (`src/stripe.ts`)
  plugin.mjs       the manifest     plugin.mjs  `pay.rail` provider
  src/index.ts     client-safe      src/index.ts  stripeRail(options)
  src/server.ts    the ledger
  src/test.ts      fakePay, payRailSuite
  src/checks.mjs   PAY-codes
  src/setup.mjs    `kerf add pay`
  docs/pay.md      `kerf docs pay`
```

Two packages, because they answer different questions. `@kerf-js/pay` is what payments means here, and it names no provider.
A rail is how a payment happens. `fakePay` is a second rail, which is how you know the seam is real.

## 1. Start from `definePlugin`

```js
export const pay = definePlugin({
  name: '@kerf-js/pay',
  version: '0.1.0', kerf: '*', namespace: 'PAY', permissions: {},
  contribute: () => ({
    provides: [...], diagnostics, check, docs, setup,
    agents, catalog, map,
  }),
})
```

`kerf check` loads every plugin, so `plugin.mjs` stays pure and light: no I/O, nothing heavy imported. Heavy parts sit behind
`import()`. `namespace` is the prefix of your diagnostic codes, by default `<name>/`. `permissions` is what the plugin
reaches. Pay reaches nothing, so it's `{}`; the Stripe plugin declares `net: ['api.stripe.com']` and the two `env` keys it reads,
and `kerf add` shows them for approval (`kerf docs config` has the lock).

## 2. Reach the server with a slot

A slot is a typed seam: the id, a version, keyed or one, and the sides it runs on. Providers name a module, which kerf
imports lazily, on that side only. That's why an app that doesn't use a plugin carries none of its bytes.

Pay provides `server.extension`, the slot for anything that needs a server presence:

```js
provide(
  defineSlot({
    id: 'server.extension', version: 1,
    cardinality: 'keyed', sides: ['server'],
  }),
  {
    key: 'pay',
    sides: { server: {
      module: '@kerf-js/pay/server', export: 'extension',
    } },
  },
)
```

The key is the mount: `/_kerf/x/pay/...`. A keyed provider also needs `src/<key>.server.ts`, the app's own configuration, and
kerf passes that module's default export to your provider. So `src/pay.server.ts` is `definePay({...})`, and the provider is
one line: `extension = app => app`. A `ServerExtension` (`@kerf-js/start/extension`) may have any of:

| Member | What it does | What pay uses it for |
| --- | --- | --- |
| `handle(request, path, api)` | Answers `/_kerf/x/<key>/<path>` | Webhooks; `api.invalidate(tags)` pokes live queries |
| `context(ctx)` | Adds to `ctx`, once per request | `ctx.entitlements` |
| `guard(fn, ctx)` | Runs before every server function | `requires: ['pro']`, a typed 403 |
| `options` | The `FnOptions` keys it enforces; with no extension, a call using one is refused | `requires` |
| `personal` | `ctx` keys a shared cache can't read | `entitlements` (Q006) |
| `check(dev)` | Refuses a bad boot | The in-memory ledger in production |

Types follow: augment `Context` and `FnOptions` in `declare module '@kerf-js/start'`, and `ctx.entitlements` and `requires`
are typed in any app that imports your server module. An error class with an `answer` getter reaches the client as a
typed error, with that code and status.

## 3. Define a slot of your own

Pay's `pay.rail` slot is why Stripe is one line in `plugins`. Say what a provider must implement, as a TypeScript interface
(`PayRail`), and ship a suite that holds any provider to it (`payRailSuite`). Your consumer reads the slot like any other:

```ts
const { load, providers } = await import('kerf:slot/pay.rail')
const rail = await load('stripe')
```

Another provider means another `provide(...)`, and app code doesn't change. A plugin's own slot is named `<plugin name>.<slot>`;
`pay.rail` keeps its short name only because it was in kerf's slot table from the start. `@kerf-js/pay/stripe` is a short manifest,
and a good template for a provider.

## 4. Report your own diagnostics

`diagnostics` declares each code: severity, what it catches, the fix. `check` finds them:

```js
check: {
  include: ['src/**/*.{ts,tsx}'],
  run: ctx => import('./src/checks.mjs')
    .then(c => c.run(ctx)),
}
```

`run(ctx)` gets `files`, `read`, `exists`, `jsx`, `slots`, and returns findings: `{ code, file, start, end, why, help?, fix? }`.
A `fix` is `{ description, safe, edits: [{ start, end, text }] }`; `kerf fix` applies the safe ones. Kerf does the spans,
`--json` and `kerf docs PAY012`. A code outside your namespace is `P111`. A hook that throws is `P119` and nothing worse.

`src/checks.mjs` is the example to copy: a regex decides which files parse, TypeScript is imported only there, and the
checks that say the most are the ones a type can't: PAY013 (an entitlement read on the client that no server code names),
PAY011 (a webhook handler with no signature check). Test a hook as a plain function of a map of files
(`test/checks.test.mjs`).

## 5. Give it a fake

A plugin that talks to the outside world ships the fake with it. `fakePay` is a real `PayRail` in memory, and reaches `@kerf-js/core/test`
only through what's public: `net.extension(pay)` puts your extension in the test's scope and resets it afterwards, `net.poke`
delivers tags to live queries, `clock` moves time. Events go through the app's real webhook and ledger, so a test
sees what a user sees. It's imported from `@kerf-js/pay/test`, since core can't depend on a plugin.

## 6. Make `kerf add` do the wiring

`setup` is data. `kerf add pay` reads it after installing the package:

```js
export const setup = {
  with: ['@kerf-js/pay/stripe'],     // added too
  // Refused without changes until these are present.
  needs: ['db', 'auth'],
  run({ engine, layer, read }) {
    return {
      files: {...}, edits: {...},
      env: { STRIPE_SECRET_KEY: 'sk_test_placeholder' },
      next: ['...'],
    }
  },
}
```

`run` describes and never writes, so a dry run and a refusal are free. A file that already exists stops it before anything
changes. `env` goes to `.env` and `.env.example`: use placeholders.

## 7. Say what an agent needs

- `agents`: one paragraph for the generated `AGENTS.md`, 1 KB at most.
- `docs`: `{ topic, summary, file }`, served by `kerf docs <topic>`.
- `catalog`: your exports, `{ name, import, summary }`, listed by `kerf plugins --json`.
- `map`: "want this, call that" lines.
- `diagnostics`: each is a page: `kerf docs PAY012`.

## Checklist

1. `plugin.mjs` is pure, with heavy code behind `import()`.
2. No app code names your provider; one line in `plugins` changes it.
3. Client entries hold no server code. `packed.mjs` checks that an app without you has none of your bytes.
4. A fake that goes through your real code path.
5. A suite for providers, passing on your fake and each real provider.
6. Every failure a type can't catch is a code with a fix.
7. If the API lacks something you need, add it for everyone. Pay added `server.extension`, `setup`, plugin `docs`, `net.extension`
   and the `FnOptions` interface that way.

## Rust, and when not to

A plugin can carry its own wasm, with a TS fallback and nothing in client bytes. Measure first. `packages/pay/bench/verify.mjs`
did, for webhook verification, and pay stayed on WebCrypto, which was fast enough.
