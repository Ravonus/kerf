# Plugins

:::learn
- What a Kerf plugin is, and what it can and can't add to your app
- How to add one with `kerf add`, and what the plugin lock asks you to approve
- How to write a small plugin of your own, with its own diagnostic
- How project tasks and `kerf run` keep scripts in one place
:::

Veneer, payments, the text measurer and the database layers all reach your app the same way: as a plugin in
`kerf.config.ts`. The framework doesn't know any of them by name. That's a deliberate limit, and it's what lets you write a
plugin that's as much a part of `kerf check`, `kerf docs` and your agent's instructions as the first-party ones.

This page starts with using plugins, then writes one.

## What a plugin is

A plugin is a factory made with `definePlugin` from `@kerf-js/core/plugin`. You call it in the config:

<!-- example: skip kerf.config.ts sits at the app root, outside src/ -->
```ts
// kerf.config.ts
import { defineConfig } from '@kerf-js/core/config'
import { veneer } from '@kerf-js/veneer/plugin'

export default defineConfig({
  plugins: [veneer({ fields: 'classic' })],
})
```

What it returns is mostly data: a name, a version, its options and the permissions it asks for. Its one function,
`contribute()`, is pure. It takes the options and returns what the plugin adds:

- **Slot providers.** A slot is a typed seam in the framework, such as `text.measure` or `server.extension`. A provider
  names a module, and Kerf imports that module lazily, on the side it runs on. An app that doesn't use a plugin's slot
  carries none of its bytes.
- **Tokens.** CSS variables in the plugin's own namespace (`--veneer-*`), written to `.kerf/tokens/`.
- **Diagnostics.** Codes in the plugin's namespace, each with what it catches and the fix, and a `check` hook that
  finds them during `kerf check`.
- **Agent context.** One section of the generated `AGENTS.md` (1 KB at most), catalog entries for its exports, and a
  docs page for `kerf docs <topic>`.
- **Setup.** What `kerf add` writes into an app after installing it.

Components are not on the list. A plugin's components are normal imports (`import { Button } from '@kerf-js/veneer'`), and
your bundler treats them like any other code.

:::deepdive Why must `contribute()` be pure?
`kerf check` loads every plugin on every run, and so does your editor's language server through it. If `contribute()`
read files or opened a connection, checking one file would cost that every time. So Kerf calls it twice and compares the
results: a manifest that differs between calls is P117. Anything heavy, such as a parser for your check hook, goes behind
`import()` inside the hook, where it only loads when the hook runs.
:::

## Adding a plugin

`kerf add` installs a package, adds it to whichever config format you use, and runs the plugin's setup:

```bash
kerf add pay --dry-run   # what it would change
kerf add pay
```

Short names cover Kerf's own add-ons (`veneer`, `icons`, `text`, `pay`, `pay-stripe`, `redis`, `nats`, `media` and a few
more), and anything else is a package name. A plugin's setup can say what it needs first: `@kerf-js/pay` needs a
database and auth, so `kerf add pay` stops, with nothing changed, until `kerf add db` and `kerf add auth` have run.

`--no-install` wires up a package that's already installed. Some add-ons aren't on npm yet; for those, `kerf add`
says so and changes nothing, unless your app was made from a checkout that links them.

The same command sets up things that aren't plugins: `kerf add tailwind`, `kerf add db [engine] --layer drizzle|prisma|native`,
`kerf add auth` and `kerf add rust`.

### Picking a winner

Most slots take one provider. If two plugins provide the same one, `kerf check` reports P100, and the order of the
`plugins` array never decides it. Name the winner in `slots`:

<!-- example: skip kerf.config.ts sits at the app root, outside src/ -->
```ts
// kerf.config.ts
import { defineConfig } from '@kerf-js/core/config'
import { text } from '@kerf-js/text'

export default defineConfig({
  plugins: [text()],
  slots: { 'text.measure': '@kerf-js/text' },
})
```

`kerf plugins` lists every plugin with the slots it provides and binds, and `kerf plugins explain <slot>` shows the whole
chain from config to plugin to module to the generated `.kerf/slots/<id>.ts`. Both take `--json`.

## The plugin lock

A plugin runs code in your build, so Kerf shows you what each one asks for before it runs. A plugin declares
`permissions`: files it reads and writes, hosts it reaches, environment variables, processes it spawns, and whether it
loads native code. `.kerf/plugins.lock.json` records what you approved, plus a hash of each installed plugin's files.
Commit it.

Two codes stop `kerf check`, `kerf dev` and `kerf build`:

- **P109** when a plugin asks for a permission the lock doesn't give it, or the audit finds it using one it didn't declare.
- **P110** when an installed plugin's code isn't what the lock recorded.

So after `kerf add`, or after an upgrade, the next check may stop and tell you what changed:

```bash
# Check permissions and undeclared use against the lock.
kerf plugins audit
kerf plugins approve @kerf-js/pay
# Approve all plugins and drop those removed.
kerf plugins approve --all
```

`kerf add` never approves for you. Installing a plugin isn't the same as reading what it asks for.

:::pitfall The lock isn't a sandbox
The lock shows you changes. It doesn't stop a plugin's code from running: `contribute()` runs when the config loads, before
any of this, and the audit reads the plugin's own source, not its dependencies. Treat it as a diff you review, the way
you'd review a lockfile change, and keep choosing plugins you trust.
:::

## Writing a plugin

A plugin doesn't have to be a package. A file in your app works, and that's the best way to learn the shape. This one
gives a team's house rules to `kerf check` and to your agent: no `alert`, `confirm` or `prompt`, because they block the
page and can't be styled.

```ts
// src/plugins/acme.ts
import {
  definePlugin,
  type CheckContext,
  type Finding,
} from '@kerf-js/core/plugin'

function blocking(ctx: CheckContext, banned: string[]): Finding[] {
  const call = new RegExp(`\\b(${banned.join('|')})\\(`, 'g')
  const out: Finding[] = []
  for (const file of ctx.files) {
    for (const m of ctx.read(file).matchAll(call)) {
      out.push({
        code: 'ACME001',
        file,
        start: m.index,
        end: m.index + m[0].length,
        why: `\`${m[1]}\` blocks the whole page ` +
          `until it's dismissed, and can't be styled.`,
        help: 'Show the message in the page: a veneer Alert, ' +
          'or a Modal for a question.',
      })
    }
  }
  return out
}

export const acme = definePlugin({
  name: 'acme',
  version: '0.1.0',
  namespace: 'ACME',
  permissions: {},
  options: (input: { banned?: string[] }) => ({
    banned: input.banned ?? ['alert', 'confirm', 'prompt'],
  }),
  contribute: ({ banned }) => ({
    diagnostics: [
      {
        code: 'ACME001',
        catches: 'A blocking browser dialog',
        fix: 'Show the message in the page',
        severity: 'error',
      },
    ],
    check: {
      include: ['src/**/*.tsx'],
      run: ctx => blocking(ctx, banned),
    },
    agents: {
      title: 'Acme house rules',
      text: `Never call ${banned.join(', ')}: ` +
        `show messages in the page with veneer's Alert or Modal.`,
    },
  }),
})
```

Then add it to the config like any other:

<!-- example: skip kerf.config.ts sits at the app root, outside src/ -->
```ts
// kerf.config.ts
import { defineConfig } from '@kerf-js/core/config'
import { veneer } from '@kerf-js/veneer/plugin'
import { acme } from './src/plugins/acme'

export default defineConfig({
  plugins: [veneer(), acme({ banned: ['alert', 'confirm'] })],
})
```

Now `kerf check` reports ACME001 at the exact span, with your explanation and fix, in the same format as Kerf's own codes.
`--json` carries it to an agent, `kerf docs ACME001` prints its entry, and `kerf agents-md` puts your rule in `AGENTS.md`.

Walk through what each part does:

- **`name` and `version`** identify the plugin. Two entries with one name are P116.
- **`namespace`** is the prefix of its codes. Without one it's the short name and a slash (`acme/`). A code outside it is
  P111, so two plugins can't report each other's codes.
- **`permissions`** is what it reaches. This one reaches nothing beyond what `ctx` hands it, so it's `{}`. A plugin defined
  in your own config is your code: Kerf compares its permissions with the lock, but has no package to hash.
- **`options`** is a Standard Schema (Zod, Valibot) or a function that parses the input and throws on a bad one. Bad
  options are P115, with the path.
- **`check.run(ctx)`** gets the files that match `include`, and `read`, `exists`, `bytes` and `jsx` to look at them. It
  returns findings: `{ code, file, start, end, why, help?, fix? }`. A `fix` with `safe: true` is one `kerf fix` applies by
  itself. A hook that throws is reported as P119, and the rest of the check goes on.

:::note A check is for what types can't see
`alert()` type-checks. So does a webhook handler with no signature check, which is one of `@kerf-js/pay`'s codes. A good
plugin diagnostic catches a mistake TypeScript can't, explains why it matters in one sentence, and names the fix. That's
the bar Kerf's own codes are held to.
:::

### Going further: slots and fakes

The `acme` plugin only adds to the tools. A plugin that changes what the app does at run time provides a slot. Here's the
core of how `@kerf-js/pay` reaches the server, from its `plugin.mjs`:

```js
provide(
  defineSlot({
    id: 'server.extension',
    version: 1,
    cardinality: 'keyed',
    sides: ['server'],
  }),
  {
    key: 'pay',
    sides: {
      server: { module: '@kerf-js/pay/server', export: 'extension' },
    },
  },
)
```

The slot is `server.extension`; the key `pay` mounts it at `/_kerf/x/pay/`; and the module is only imported on the server,
when it's first used. Code that consumes a slot imports `kerf:slot/<id>` and calls `load()`. A slot nothing provides
throws P101 when it's loaded.

A plugin that talks to the outside world should ship a fake with it, one that goes through the plugin's real code path.
`fakePay` from `@kerf-js/pay/test` is a payment rail in memory that runs your real webhook and ledger on the test clock.
And a plugin that defines a slot should ship a suite any provider can be held to; `@kerf-js/core/test/plugins` has the
ones for Kerf's own slots (see [Testing](/learn/testing)).

The [plugins reference](/reference/plugins) walks through `@kerf-js/pay` from manifest to `kerf add` setup, and is the
template to copy for a real package.

## Project tasks and `kerf run`

The last thing in the config that agents and tools rely on is `tasks`: the project's own commands, each with what it
does and what it changes.

<!-- example: skip kerf.config.ts sits at the app root, outside src/ -->
```ts
// kerf.config.ts
import { defineConfig } from '@kerf-js/core/config'

export default defineConfig({
  environments: { dev: { url: 'http://localhost:5173' } },
  tasks: {
    seed: {
      run: 'node scripts/seed.mjs',
      description: 'Load demo products into the dev database',
      sideEffects: ['db'],
      env: ['dev'],
    },
  },
})
```

`kerf run seed` runs it from the project root. `kerf tasks` lists every built-in command and every task, with its side
effects and where it may run, and `--json` gives an agent the same list to choose from.

Two codes keep the list honest. P004 is a task without `description` or `sideEffects` (write `sideEffects: []` when it
has none), because an agent deciding whether to run something needs to know what it touches. P003 is a task that
duplicates a built-in or another task. And `package.json` scripts may only alias `kerf …` commands (P002): anything else
belongs in `tasks`, so there's one list, not two.

## Recap

- A plugin is a `definePlugin` factory in `plugins`. Its pure `contribute()` returns slot providers, tokens, diagnostics
  with a check hook, an `AGENTS.md` section, docs and setup. Components stay normal imports.
- `kerf add <name>` installs and wires a plugin, and runs its setup. `--dry-run` shows the changes first.
- `.kerf/plugins.lock.json` records the permissions you approved. P109 and P110 stop the build when a plugin asks for more
  or its code changes; `kerf plugins approve` records your decision.
- Your own plugin can live in your app: a namespace, codes with a fix, and a `check.run` that returns findings.
- `tasks` and `kerf run` hold the project's commands, each with a description and its side effects.

## Try it

:::challenge Fix the task
`kerf check` reports P004 on this task. Fix it.

<!-- example: skip a fragment of kerf.config.ts -->
```ts
tasks: {
  reset: { run: 'node scripts/reset-db.mjs' },
},
```
:::solution
```ts
tasks: {
  reset: {
    run: 'node scripts/reset-db.mjs',
    description: 'Drop and recreate the dev database',
    sideEffects: ['db'],
    env: ['dev'],
  },
},
```

`description` and `sideEffects` are both required. `env: ['dev']` isn't required, but a task that wipes a database
should say where it may run.
:::

:::challenge Out of its namespace
A teammate adds a second rule to `acme` and `kerf check` now reports P111. What's wrong, and what's the fix?

<!-- example: skip a fragment of the acme plugin -->
```ts
diagnostics: [
  {
    code: 'ACME001',
    catches: 'A blocking browser dialog',
    fix: 'Show the message in the page',
  },
  {
    code: 'W100',
    catches: 'A raw hex colour in a style',
    fix: 'Use a token',
  },
],
```
:::solution
`W100` doesn't start with the plugin's namespace, `ACME`. Codes outside it are P111, so a plugin can never report, or
shadow, one of Kerf's own codes or another plugin's. Name it in the namespace:

```ts
{
  code: 'ACME002',
  catches: 'A raw hex colour in a style',
  fix: 'Use a token',
},
```

The check hook's findings have to use the new code too.
:::

:::challenge Offer a fix
Make ACME001's findings carry a fix that replaces `alert(` with `console.warn(`. Should it be `safe`?
:::solution
```ts
out.push({
  code: 'ACME001',
  file,
  start: m.index,
  end: m.index + m[0].length,
  why: `\`${m[1]}\` blocks the whole page ` +
    `until it's dismissed, and can't be styled.`,
  help: 'Show the message in the page: a veneer Alert, ' +
    'or a Modal for a question.',
  ...(m[1] === 'alert' && {
    fix: {
      description: 'Log it instead',
      safe: false,
      edits: [
        {
          start: m.index,
          end: m.index + m[0].length,
          text: 'console.warn(',
        },
      ],
    },
  }),
})
```

Only `alert` gets a fix: `confirm` and `prompt` return a value the code goes on to use, so no one-line edit replaces them.
Leave `safe` false. The user would no longer see the message at all, which changes what the app does, so a person should
choose it. `kerf fix` only applies fixes marked safe. An unsafe one still travels with the diagnostic, edits included, in
`kerf check --json`, for a person or an agent to apply on purpose.
:::
