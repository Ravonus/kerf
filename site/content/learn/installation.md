# Installation

:::learn
- How to make a new Kerf app, and every option the generator takes
- What each file in a new app is for
- How to run, check, build and start it, on Node, Bun or Deno
- How to add Kerf to a Vite project you already have
- What changes if you're coming from React
:::

This page takes you from an empty folder to a running Kerf app, then walks through what you got. You need Node 26, or Bun
or Deno in its place: the generator, the CLI, `kerf dev` and `kerf build` all run on either one, with no Node installed.

Rust isn't needed to use Kerf. The compiler comes with it as WebAssembly, which runs anywhere, and a native addon for your
platform installs by itself and makes builds faster. Rust only comes in if you choose to write
[Rust server functions](/learn/rust). The next page, [Editor and TypeScript setup](/learn/setup), says more about the two
builds of the compiler.

## Create an app

### 1. Create it

```bash
npm create kerf -- my-app --yes --db none
```

`--db none` leaves out the database so there's nothing to set up. Leave off `--yes` and it asks you each question in
turn, with the default already picked: arrow keys move, Enter chooses. With npm, the flags go after `--`.

The other package managers and runtimes take the same flags:

```bash
pnpm create kerf my-app --yes --db none
bun create kerf my-app --yes --db none
deno run -A npm:create-kerf my-app --yes --db none
```

It installs the dependencies with the package manager you ran it with, and starts a git repository.

### 2. Start it

```bash
cd my-app
npx kerf dev
```

Open the address it prints. You'll see a card with a button that counts your clicks.

### 3. Change something

Open `src/routes/index.tsx`. Add `derived` to the import from `@kerf/core`, and work out a new value under `count`:

```tsx
const count = state(0)
const doubled = derived(() => count.value * 2)
```

Show it above the button:

```tsx
<p>Doubled: {doubled.value}</p>
```

Save, and the page updates. Click the button and both numbers change. You didn't tell `doubled` what to watch: it read
`count`, so it follows `count`.

## Every option

Each question the generator asks has a flag, so an agent or a CI job never sees a prompt. With no terminal, or with
`--yes`, every question you didn't answer takes its default.

| Flag | Values | Default | What it does |
|---|---|---|---|
| `[dir]` | a folder name | asked, `my-kerf-app` with `--yes` | Where the app goes. It must be missing or empty |
| `--template` | `todo`, `admin`, `catalog`, `landing` | none | A fuller app to start from, on Postgres (below) |
| `--ui` | `veneer`, `headless`, `tailwind`, `none` | `veneer` | The UI kit. `headless` gives you Veneer's behaviour and tokens under your own markup |
| `--db` | `sqlite`, `postgres`, `mysql`, `none` | `sqlite` | A database, and a todo page that uses it |
| `--layer` | `drizzle`, `prisma`, `native` | `drizzle` | How the app talks to the database. `native` is SQL migrations with no ORM |
| `--auth`, `--no-auth` | | on when there's a database | Sign-in with Better Auth, and a login page |
| `--auth-provider` | `better-auth`, `custom` | `better-auth` | `custom` writes a stub for your own sign-in instead |
| `--runtime` | `node`, `bun`, `deno` | whichever is running the generator | What `kerf build` targets |
| `--config` | `ts`, `json`, `yaml` | `ts` | The format of `kerf.config` |
| `--pm` | `npm`, `pnpm`, `bun`, `deno`, `yarn` | the one you ran it with | The package manager for the install |
| `--git`, `--no-git` | | on (off with no terminal, unless `--yes`) | Start a git repository |
| `--install`, `--no-install` | | on (off with no terminal, unless `--yes`) | Install the dependencies |
| `--name` | a package name | the folder's name | The `name` in `package.json` |
| `--yes`, `-y` | | | Take the defaults for anything not given |

`--auth` keeps its users in the database, so it needs `--db sqlite`, `postgres` or `mysql`; with `--db none` the generator
stops and says so. A few combinations, to give you the idea:

```bash
# a static-looking site with Tailwind and no server data
npm create kerf -- site --yes --ui tailwind --db none

# Postgres through Prisma, no sign-in, built for Bun
npm create kerf -- shop --yes \
  --db postgres --layer prisma --no-auth --runtime bun

# a fuller app to start from: a shop on Postgres
npm create kerf -- store --yes --template catalog
```

`--template` starts from a fuller app on Postgres: `todo` (sign-in and a todo list), `admin` (an orders admin behind
sign-in), `catalog` (categories, product pages and a cart) or `landing` (a landing page with pricing and a sign-up list).

:::note Making it from a checkout
Working on Kerf itself? `node kerf/packages/create-kerf/scripts/local.mjs new my-app` takes the same flags and wires the app to
tarballs packed from your checkout, which needs Rust to build the compiler. After you pull new changes, `local.mjs refresh
my-app` puts the new tarballs in the app. [Using a Kerf checkout](https://github.com/Ravonus/kerf/blob/main/docs/getting-started.md)
has the rest.
:::

## What's in a new app

Here is the app `--yes` makes, with every default: Veneer, SQLite through Drizzle, and Better Auth.

```text
my-app/
├── AGENTS.md                 generated guidance for an AI agent
├── package.json              scripts that call `kerf`
├── kerf.config.ts            site metadata and plugins
├── tsconfig.json             strict TS, kerf TSX and editor plugin
├── drizzle.config.ts         where Drizzle finds the schema
├── .env                  DATABASE_URL and auth secret (not committed)
├── .env.example              the same keys, without the secret
├── .gitignore
├── .vscode/settings.json     tells VS Code where the editor plugin is
├── .kerf/plugins.lock.json   approved plugins and their permissions
└── src/
    ├── routes/
    │   ├── _layout.tsx       wraps every page: the nav and <main>
    │   ├── index.tsx         the home page, at /
    │   ├── about.tsx         /about
    │   ├── login.tsx         sign in and sign up
    │   └── todos/
    │       ├── _layout.tsx   sends you to /login when signed out
    │       └── index.tsx     the todo list, at /todos
    ├── server/
    │   ├── todos.ts          queries and mutations for todos
    │   └── session.ts        me, signUp, signIn, signOut
    ├── db/
    │   ├── schema.ts         the tables
    │   └── index.server.ts   the database connection
    ├── auth.server.ts        Better Auth, on the same database
    ├── context.server.ts     what every server function gets as `ctx`
    └── env.server.ts         checks the environment on server start
```

With `--db none` there's no `.env`, `drizzle.config.ts`, `src/server`, `src/db` or `.server.ts` file: only the config
files and three routes. The parts worth knowing on day one:

- **`src/routes`** is your pages. A file is a route: `about.tsx` is `/about`, `todos/index.tsx` is `/todos`, and a
  `_layout.tsx` wraps the pages beside and below it. [Routing and layouts](/learn/routing-and-layouts) covers the rest.
- **`src/server`** holds server functions: `query` and `mutation`. A component imports them like any module and calls
  them; the code inside only ever runs on the server. [Server functions](/learn/server-functions) explains how.
- **A `.server.ts` file** never reaches the browser. The database, the auth secret and the environment live in those.
- **`kerf.config.ts`** is short on purpose. `site` gives every page its title pattern and description, and `plugins`
  lists what extends Kerf, here `veneer()`. The [config reference](/reference/config) lists every key.
- **`package.json`'s scripts** are all `kerf` commands: `dev`, `build`, `check`, `typecheck` (which is `kerf tsc`),
  `start`, and `db:generate` when there's a database. A script that runs something other than `kerf` gets a P002
  warning, because an agent can't see what it does. Project commands go in `tasks` in `kerf.config.ts` instead.
- **`AGENTS.md`** is written by `kerf agents-md` right after the install, from the Kerf you installed. Don't edit it:
  [Working with AI agents](/learn/working-with-agents) explains what it holds and how to regenerate it.

A `.kerf/` folder also appears the first time you run `kerf dev` or `kerf check`. It holds files Kerf generates, such as
`.kerf/map.md`, and only the plugin lock in it is committed.

## Run, check and build

These are the commands you'll use every day. Each one is `npx kerf <command>` with npm.

| Command | What it does |
|---|---|
| `kerf dev` | The dev server, with the page updating as you save. `--port 3000` picks the port |
| `kerf check` | Reads the whole app and reports mistakes, each with a code, a reason and a fix |
| `kerf tsc` | Type-checks the project, with the prop types Kerf works out for you |
| `kerf build` | The production build, into `.output/` |
| `kerf start` | Runs `.output/` |
| `kerf db generate` | A migration for what changed in `src/db/schema.ts`. It applies on the next request |

An app with a database needs one migration before its first run:

```bash
npx kerf db generate
npx kerf dev
```

Then, before you ship:

```bash
npx kerf check
npx kerf build
npx kerf start
```

`kerf check` is the one to run most. It compiles every file in check mode, and also checks your tests, your config, your
design tokens and accessibility, and each route's page metadata. [Diagnostics and kerf check](/learn/diagnostics) is
about reading what it says.

`kerf --help` lists every command. You'll meet most of them later: `kerf add` adds a feature to an app you already have
(`kerf add tailwind`, `kerf add db postgres`, `kerf add auth`, `kerf add rust`), and `kerf doctor` says which compiler and
runtime you're on.

## Node, Bun or Deno

An app builds for and runs on all three, and the CLI runs on whichever one starts it, with none of the others installed.

| | Node | Bun | Deno |
|---|---|---|---|
| Run a command | `npx kerf dev` | `bunx --bun kerf dev` | `deno run -A npm:@kerf/cli dev` |
| Build for it | `kerf build --runtime node` | `kerf build --runtime bun` | `kerf build --runtime deno` |

`kerf build` targets the `runtime` key in `kerf.config.ts`. When that isn't set, it targets whichever runtime ran it, and
`--runtime` overrides both. `kerf start` runs the build on the same runtime. The generator's `--runtime` flag writes the
key for you. [Runtimes and deploying](/learn/deploying) covers hosts and presets.

:::pitfall Runtime-only APIs in shared code
`Bun.*`, `Deno.*` and Node-only packages work in a server module built for that runtime, and nowhere else. Keep them in
`.server.ts` files and pick the runtime in the config, so the build and the code agree.
:::

## Add Kerf to an existing Vite project

You don't need `@kerf/start` to use Kerf. A Vite app can use Kerf's components and reactivity alone, with no server
routes, and the same checks work on it.

You need Vite 8, and two packages: `@kerf/core` (the runtime and its Vite plugin) and `@kerf/cli` as a dev
dependency (the `kerf` command):

```bash
npm install @kerf/core
npm install -D @kerf/cli vite@8
```

Add the plugin to `vite.config.ts`. It compiles `.tsx` and `.jsx` files with Kerf's compiler:

<!-- example: skip a Vite config, which lives outside src; the scratch app is a @kerf/start app with its own -->
```ts
import { defineConfig } from 'vite'
import kerf from '@kerf/core/vite'

export default defineConfig({ plugins: [kerf()] })
```

Tell TypeScript that TSX is Kerf's. These are the keys that matter; keep the rest of your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "@kerf/core",
    "types": ["@kerf/core/client"],
    "plugins": [{ "name": "@kerf/cli/ts-plugin" }]
  }
}
```

Then mount a component from your entry module with `render` from `@kerf/core/dom`:

```tsx
// src/main.tsx
import { state } from '@kerf/core'
import { render } from '@kerf/core/dom'

function App() {
  const count = state(0)
  return (
    <button type="button" onClick={() => count.value++}>
      Clicked {count.value} times
    </button>
  )
}

const root = document.getElementById('root')
if (root) render(() => <App />, root)
```

`render` returns a function that removes what it rendered. Run the app with `vite` as before, and check it with
`npx kerf check`.

A few things to know about this setup:

- **`kerf dev`, `kerf build` and `kerf start` are for `@kerf/start` apps.** They need `src/routes`. A Vite-only app
  keeps using `vite` and `vite build`.
- **`kerf check`, `kerf fix`, `kerf tsc` and `kerf docs` all work.** With no `kerf.config.ts`, `kerf check` reads every
  `.tsx` and `.jsx` file in the project.
- **Your `vite` scripts get P002 warnings**, since they aren't `kerf` commands. That's advice for agents, not an error:
  move them into `tasks` in a `kerf.config.ts` when you want them listed by `kerf tasks`.
- **In dev, the plugin adds Kerf's devtools to every page**, so `kerf browser` and the in-page agent work here too.
- **A production build drops CSS nothing can reach.** `kerf({ purge: { keep: ['knob'] } })` keeps a name only built at
  run time, and `kerf({ purge: false })` turns it off.

:::pitfall React and Kerf TSX in one project
`jsxImportSource` applies to the whole project, and Kerf's plugin compiles every `.tsx` and `.jsx` file Vite loads. A
React component compiled as Kerf's won't work: Kerf has no hooks, and it isn't run the way React runs it. Move to
Kerf one app at a time, not one component at a time.
:::

## Coming from React

Most of what you write in TSX carries over. Kerf accepts React's prop names on native elements: `className`, `htmlFor`,
`tabIndex`, camelCase SVG attributes, a `style` object, and `onChange` firing on every keystroke as it does in React. The
[From React](/reference/react) reference lists each one.

What doesn't carry over is the model underneath. A component runs once, state is a box you read with `.value`, and the
compiler wires each read to the DOM. So the habits that come with hooks have no place, and `kerf check` reports them:

| A React habit | What Kerf reports | The Kerf way |
|---|---|---|
| `useState`, `useEffect`, `useMemo`, `useRef`, `useCallback`, a custom `useX()` hook, a dependency array | W020: no hooks in Kerf | `state`, `watch`, `derived`, `ref={el}`, plain functions |
| `useState(props.value)` written as `state(props.value)` | W005: the box never follows the prop | `state.linked(() => props.value)` |
| Computing from a prop in the component body | W001: the body runs once | `derived(() => …)`, or compute in the JSX |
| `{count}` for a state value | W015: that renders the box | `{count.value}` |
| `data-open={true}` on an element | W043: Kerf writes `data-open=""`, not `"true"` | `data-open` for a flag, `data-open="true"` for the word |
| `key={crypto.randomUUID()}` | W044: the key differs on server and client | A stable id from the data |
| `bind:value` on an `<input>` | W061: `bind:` is for component props | `value` and `onChange` |

[Thinking in Kerf](/learn/thinking-in-kerf) explains the model, and [Components run once](/learn/components-run-once)
shows why the body isn't a render function.

:::deepdive Why Kerf keeps React's prop names
Code that agents and people write is full of React's names, and most of them have one obvious meaning. Rejecting
`className` would only add a step. The compiler resolves the names it can see while it compiles, so they cost nothing at
run time, and a `{...spread}` resolves its keys only in an app that has one. Hooks are different: they assume a
component re-runs, and in Kerf it doesn't, so a hook would silently do the wrong thing. That's why one is an error and
the other just works.
:::

## Recap

- `npm create kerf` (or pnpm, bun or deno) makes an app; `--yes` takes every default, and every question has a flag.
- `src/routes` is your pages, `src/server` your server functions, and `.server.ts` files never reach the browser.
- `kerf dev` runs the app, `kerf check` checks it, `kerf build` builds it and `kerf start` runs the build.
- Node, Bun and Deno all work: `runtime` in the config picks what the build targets.
- A Vite app can use Kerf alone: the `kerf()` plugin, `jsxImportSource`, and `render` from `@kerf/core/dom`.
- Rust is only for code you choose to write in Rust.

Next, set up your editor and TypeScript in [Editor and TypeScript setup](/learn/setup).
