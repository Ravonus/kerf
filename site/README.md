<p align="center">
  <a href="https://github.com/Ravonus/kerf">
    <img src="https://raw.githubusercontent.com/Ravonus/kerf/main/site/public/logo.svg" width="88" height="88" alt="Kerf">
  </a>
</p>

<h1 align="center">site</h1>

<p align="center">
  <strong>Kerf's landing page, Learn tutorial, API reference and component toolkit, built with Kerf itself.</strong><br>
  Everything the site says that comes from elsewhere in the repo is generated from it, so it can't drift.
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#structure">Structure</a> ·
  <a href="#how-content-is-organized">Content</a> ·
  <a href="#testing">Testing</a> ·
  <a href="../CONTRIBUTING.md">Contributing</a>
</p>

> [!NOTE]
> The site is a private workspace package (`kerf-site`). It isn't published to npm. It uses the workspace's own
> `@kerf-js/*` packages through `workspace:*`, so it always runs the code in this repo.

## Contents

- [Highlights](#highlights)
- [Quick start](#quick-start)
- [Scripts](#scripts)
- [Structure](#structure)
- [Routes](#routes)
- [How content is organized](#how-content-is-organized)
- [Configuration](#configuration)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

## Highlights

- **A Kerf app.** It runs on `@kerf-js/start`, styles with `@kerf-js/veneer` and `@kerf-js/veneer-icons`, and sets fonts
  with `@kerf-js/text`.
- **Generated, not copied.** `scripts/content.mjs` builds the reference pages from `kerf docs`' own pages, the toolkit's
  props from veneer's types, and the numbers from `evals/`.
- **Learn tutorial.** 66 pages in 8 chapters, written as Markdown with a few fences of the site's own for live demos,
  pitfalls and challenges.
- **Live examples.** A component page's code is read from the example's own source, so the code shown is the code
  running on the page.
- **An arena.** The same page built in React, Solid and Kerf (`benchmarks/arena`), served in frames under `/arena`.
- **Agent-readable.** The build writes a `.md` twin of each Learn and Reference page, `llms.txt`, `llms-full.txt` and
  search indexes into `public/`.

## Quick start

Run these from the repo root after `pnpm run setup`, which installs the workspace and builds the arena and content once.

```sh
cd site
pnpm run dev          # generate content, then kerf dev on http://localhost:3300
```

Production build:

```sh
cd site
pnpm run build        # arena, content, then kerf build
pnpm run start        # serve the build
```

## Scripts

| Script | Command | What it does |
| ------ | ------- | ------------ |
| `dev` | `kerf run content && kerf dev --port 3300` | Generates content, then starts the dev server on port 3300 |
| `build` | `node ../benchmarks/arena/build.mjs && kerf run content && kerf build` | Builds the arena frames, the content, and the site |
| `start` | `kerf start` | Serves the production build |
| `check` | `kerf check` | The app rules Kerf gives any app. `arena/**` is excluded |
| `content` | `kerf run content` | Only the generated content |

`content` is a task defined in `kerf.config.ts`. It runs
`node --disable-warning=ExperimentalWarning scripts/content.mjs`.

## Structure

```text
site/
├── content/learn/        the Learn tutorial: one Markdown file per page
├── public/               served as-is: logo, favicons, art, samples (plus generated files, gitignored)
├── scripts/              content generation, logo drawing and sample checks
│   ├── content.mjs       the entry the `content` task runs
│   ├── content/          reference, learn, search, toolkit, art and theming builders
│   ├── toolkit.mjs       toolkit facts read from veneer's source
│   ├── toolkit/          example catalog, imports and shared "world" data for copied examples
│   ├── logo.mjs, mark.mjs   the logo and favicon, drawn from the hero's geometry
│   └── sample-width.mjs, sample-patterns.mjs   checks on displayed code samples
├── src/
│   ├── routes/           file-based routes (see below)
│   ├── components/       site components: header, search, playground, example frames, theme studio...
│   ├── demos/            the live demos Learn pages embed with :::demo
│   ├── toolkit/          component docs (docs/), examples (examples/), art rooms (art/), sample data (world/)
│   ├── lib/              navigation, search and its worker, palettes, the hero's loom, studio state
│   ├── styles/           site, docs, learn, toolkit, example, art and studio stylesheets
│   ├── server/chat.ts    the chat demo's channel: one room per visitor, nothing kept
│   ├── realtime.server.ts   realtime sharing, limited to keys that start with `demo:`
│   ├── entry.client.ts   start() and veneer's flow for every page
│   └── expression.ts     the default expression dial stop (`vivid`)
├── test/                 node:test unit tests and browser QA scripts
├── kerf.config.ts        site metadata, headers, plugins, fonts and the content task
└── package.json
```

Generated output is gitignored: `src/generated/` (JSON the routes import), and in `public/` the `docs/`, `search/`,
`arena/`, `llms.txt`, `llms-full.txt` and `search.json` files.

## Routes

| Path | File | What it shows |
| ---- | ---- | ------------- |
| `/` | `routes/index.tsx` | The landing page: the shop demo growing step by step, the arena and the numbers |
| `/learn`, `/learn/:slug` | `routes/learn/` | The tutorial, from `content/learn/*.md` |
| `/reference`, `/reference/*` | `routes/reference/` | The API reference, from `packages/cli/docs/*.md` and the diagnostic catalog |
| `/docs/*` | `routes/docs/` | Old addresses. Not prerendered, so each answers with a permanent redirect: `getting-started` to `/learn/installation`, anything else to `/reference/...` |
| `/components`, `/components/:slug` | `routes/components/` | veneer's core components, with props, theming and live examples |
| `/components/theme-studio` | `routes/components/theme-studio.tsx` | Runs veneer's theme compiler in the browser |
| `/blocks`, `/blocks/:slug` | `routes/blocks/` | Larger veneer groups: agent, admin, collab, flow, live and schedule |
| `/charts`, `/charts/:slug` | `routes/charts/` | veneer's charts |
| `/toolkit`, `/toolkit/:slug` | `routes/toolkit/` | Old addresses: a 308 redirect to `/components`, or to the page's area (`/components`, `/blocks`, `/charts`, or `/art`) |
| `/icons` | `routes/icons.tsx` | Icon browser, prerendered |
| `/art` | `routes/art/index.tsx` | The art rooms |
| `/examples`, `/examples/slow` | `routes/examples/` | Small working Kerf programs, each with its code, what to try and why it matters; `slow` is a page that loads slowly behind a `Boundary` |
| layout and share card | `routes/_layout.tsx`, `routes/_default.og.tsx` | The shared layout and the default Open Graph image |

## How content is organized

There are three kinds of writing, each with one home. [CONTRIBUTING.md](../CONTRIBUTING.md#docs) has the rule; this is
how the site uses it.

### Reference: `packages/cli/docs/*.md`

The exact API, commands, config keys and codes. `kerf docs` prints these pages to apps and agents, and the site
serves the same pages under `/reference`. `scripts/content/docs-catalog.mjs` lists them, plus a few other files such as
`packages/pay/docs/pay.md` and `docs/react-props.md`. Edit the source file, not the site.

### Learn: `content/learn/*.md`

The tutorial, in teaching order. The order and chapters are the `LEARN` list in `scripts/content/docs-catalog.mjs`:

| Chapter |
| ------- |
| Get started |
| Describing the UI |
| Adding interactivity |
| Managing state |
| Escape hatches |
| Full-stack apps |
| Styling and veneer |
| Testing and tooling |

A new page needs a file in `content/learn/` and an entry in `LEARN`. Prev and next links run straight through the
chapters. Each page is plain Markdown plus the site's own fences, each opened by a line that starts `:::` and closed by
a line that is only `:::`:

| Fence | What it renders |
| ----- | --------------- |
| `:::learn` | The "You will learn" box, a list. Every page must have one |
| `:::demo <id>` | A live demo from `src/demos`, beside its own source. One line, no closing fence |
| `:::note [title]` | An aside |
| `:::pitfall [title]` | A mistake that is easy to make, and what to do instead |
| `:::deepdive <title>` | An aside for the curious, closed until opened. The title is required |
| `:::challenge <title>` | A "Try it" task; a `:::solution` line inside starts its hidden answer |

```md
# State: a box with .value

:::learn
- How to give a component memory with `state`
- Why state is a box, and why you read and write `.value`
:::

:::demo getting-started
```

The generator throws if a page has no `:::learn` box, a fence is never closed, or a `:::demo` names a demo that doesn't
exist.

### Toolkit: `src/toolkit/`

The component pages. The words and examples are written by hand; the facts are read from veneer's source by
`scripts/toolkit.mjs`, so they can't drift:

- `src/toolkit/docs/` has each group's words.
- `src/toolkit/examples/` has the examples. Each page shows an example's own source, and its copy button hands over
  code that `test/paste.mjs` type-checks against veneer.
- `src/toolkit/world/` is the shared sample data examples import. Copied examples include it.
- Props come from the type checker, and the Theming section from veneer's own parts table (`scripts/content/theming.mjs`).

### Demos: `src/demos/`

The live demos on the landing and Learn pages. A demo named `shop-<n>.tsx` or `<name>-step-<n>.tsx` is a step: its code
view marks the lines each step added, so the code shows the app growing. `scripts/content/displayed.mjs` lists demos
whose displayed source comes from another tracked file.

### Code sample widths

Runnable site samples use 58 columns with one JSX attribute per line; Markdown samples in docs use 70. The
`sample-width` step of `pnpm run check` enforces both through `scripts/sample-width.mjs`.

## Configuration

`kerf.config.ts` sets:

| Key | Value |
| --- | ----- |
| `site.name`, `site.title` | `kerf`, `%s · kerf` |
| `site.url` | `KERF_SITE_URL` when it is set |
| `site.headers` | `cross-origin-opener-policy: same-origin` and `cross-origin-embedder-policy: credentialless` on `/` and `/arena/**`, so the arena's frames get a finer clock |
| `site.head` | Favicons, veneer's dial script, and a script that applies a saved expression before the first paint |
| `check.exclude` | `arena/**`: the arena is its own project and may not load veneer |
| `build.unsafeAllow` | `R024`, because the chat demo's channel can't connect on Netlify's functions. The page says so, and it works under `kerf dev` |
| `plugins` | `veneer()` with the named themes from `src/lib/palettes.ts`, `icons()`, and `text()` with Inter, Space Grotesk, IBM Plex Mono and Instrument Serif from `@fontsource` |

## Testing

`node:test` files run with Node:

```sh
cd site
node --test test/*.test.mjs
```

| Test | What it checks |
| ---- | -------------- |
| `logo.test.mjs` | The committed logo files are current. Run `node scripts/logo.mjs` after changing the mark |
| `sample-width.test.mjs`, `sample-patterns.test.mjs` | The sample width and pattern checks |
| `toolkit-barrels.test.mjs`, `toolkit-examples.test.mjs`, `toolkit-width.test.mjs` | Toolkit imports, examples and widths |

Browser scripts run against a running site (start one with `pnpm run dev` or `pnpm run start`). Each exits 1 on a
failure. The base URL defaults to `http://localhost:3300`.

| Script | What it checks |
| ------ | -------------- |
| `node test/qa.mjs [base]` | The site's QA pass, in Chromium. `QA_ONLY=<regex>` runs only matching checks |
| `node test/controls.mjs [base]` | Every control on every example responds, pressed as soon as it exists and again after load |
| `node test/flash.mjs [base]` | A late stylesheet changes nothing visible, on every route at desktop and phone widths |
| `node test/paste.mjs` | Every copy button's code type-checks against veneer |
| `node test/field.mjs` | The hero's field stays on its palette |
| `node test/flow-settle.mjs` | Icon page flow, with `KERF_FLOW_URL` pointing at a built icon page |

From the repo root, `pnpm run check` also runs `tsc` on the site, lints `site/`, and runs the `sample-width` step.

## Troubleshooting

| Symptom | What to do |
| ------- | ---------- |
| A route can't find `../generated/*.json` | Run `pnpm run content`. `src/generated/` is gitignored and built by the content task |
| `learn/<slug>.md has no :::learn box` | Add the `:::learn` list to that page |
| `learn: no demo called <id>` | The `:::demo` id has to exist in `src/components/LearnDemo.tsx` |
| The arena frames are empty | Run `node ../benchmarks/arena/build.mjs` from `site/`, or `pnpm run build` |
| The chat demo says it is unavailable | Expected on Netlify. It works under `kerf dev` |
| `test/logo.test.mjs` fails | Run `node scripts/logo.mjs` from `site/` and commit the files |

## Contributing

Change Reference in `packages/cli/docs/`, Learn in `content/learn/`, and component pages in `src/toolkit/`. Code in a
doc has to compile against the packages as they are, with its imports. See [CONTRIBUTING.md](../CONTRIBUTING.md).

## License

MIT. See [LICENSE](../LICENSE).
