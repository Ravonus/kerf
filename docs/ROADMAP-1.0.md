# weft 1.0: the road to an open-source release

Written 2026-11-04 from an audit of `main` at `ceb25cda`. It's a plan, so the numbers below are a
snapshot. Each sprint ends by updating its **Status** line here.

The goal is a release that someone can clone, read and change in an afternoon, with or without an
agent. It ships three things:

1. **Code people can read on the page.** Every sample on the site and in the docs fits its box
   without wrapping strangely.
2. **The idea, fully kept.** Every React habit the plan promises to catch really is a compile error.
   Cheap agents can build apps from the docs alone. The benchmarks back the claims.
3. **A repo that looks like other good repos.** The layout is normal, nothing is left lying around,
   files and functions are small, code is DRY and KISS, and the community files a project needs are
   all there.

## Where things stand

| Area | Finding | Evidence |
|---|---|---|
| Code samples | Every `<pre>` wraps at any character, so long lines break mid-token | `site/src/styles/site.css:177` sets `pre-wrap` and `overflow-wrap: anywhere` |
| Code samples | 812 lines in Markdown code fences are over 80 columns, across 86 files | Worst: `packages/cli/docs/start.md` (50), `learn/tutorial.md` (35), `learn/auth.md` (21) |
| Code samples | 2,060 lines in site example and demo `.tsx` files are over 80 columns | `site/src/toolkit/examples/*.tsx`, `site/src/demos/` |
| Core promise | 18 compiler codes are in the catalog but nothing emits them, including every React-ism | See Sprint 4 |
| CI | `quality.yml` and `runtime-matrix.yml` have failed on every recent push | `gh run list`: Firefox and WebKit missing in CI, a gitleaks hit in `cli/test/deploy.test.mjs` |
| Size | weft + warp is 53.0 KB br, over the 50 KB ceiling. It was 40.8 KB on 10-31 | `evals/results/compare-history.jsonl` |
| Speed | weft + warp loads in 210 ms against Solid + Kobalte's 155 ms. weft alone takes 113 ms | Same file |
| Agent eval | The head-to-head eval (research 42) is built but has never been run | `evals/agent-eval/`, with nothing in `evals/results/` |
| Layout | 2,497 of the 5,507 tracked files are in `evals/`, and 1,561 of those are run snapshots | `evals/results/` |
| Size of code | 99 source files are over 400 lines. Some functions are over 400 lines | `start/src/server.tsx` `createHandler` (601), `start/src/hub.ts` `createHub` (415) |
| Line width | No JS/TS formatter. 13,000+ lines are over 120 columns, the longest 3,365 | `rustfmt.toml` is 120, and there's nothing for TS |
| DRY | `freePort`, `sleep`, `until`, `esc`, `walk` and `median` are each written 7 to 12 times | Scripts, tests and four runtime packages |
| Release scope | The README says the add-ons aren't released, but `scripts/release.mjs` publishes every non-private package | All 20 packages are public at 0.1.1 |

## Rules for 1.0

These are the rules every sprint works to. Sprint 0 makes the tools enforce them, so they don't
depend on anyone remembering them.

| Rule | Limit | Enforced by |
|---|---|---|
| Source line width (TS, JS, Rust) | 100 | `oxfmt` (`printWidth: 100`), `rustfmt` (`max_width = 100`) |
| Code in doc fences and callouts | 70 columns | `site/scripts/content.mjs` fails the build |
| Code shown in split example panes | 58 columns | Same check, run over `site/src/toolkit/examples` and `site/src/demos` |
| File length | 400 lines (generated, vendored and test files: 800) | `oxlint` `max-lines`, with a shrinking allowlist |
| Function length | 80 lines | `oxlint` `max-lines-per-function`; `clippy::too_many_lines` for Rust |
| Shared helpers | One home for each, and no private copy | `scripts/check.mjs` greps for the known duplicates |
| Folder names | A package's folder matches its npm name | A check in `scripts/check.mjs` |

The sample widths come from measuring the site's code boxes with IBM Plex Mono at 13 to 14 px:

| Box | 1440 px | 1024 px | 390 px |
|---|---|---|---|
| Doc column | 89 | 76 | 32 |
| Pitfall and challenge callouts | 74 | 71 | 28 |
| Split example pane (`/examples`, home) | 59 to 78 | about 55 | 38 |

So 70 columns fits every doc box on a tablet or anything wider. 58 fits the narrowest split pane.
On a phone, nothing fits without breaking lines, so phones get the hanging-indent wrap from Sprint 1.

Why 100 for source: Svelte, Solid and Astro all use 100, react.dev and Vite use 80. Our code is
denser than theirs, so 80 would mean a lot of churn for little gain. Docs are held to tighter
limits because their boxes are narrower than an editor.

## Sprints

Sprints are ordered by what unblocks what. They're scoped by work, not by calendar. Run heavy jobs
on yuna-mbp, never on this Mac: full `check`, `compare/measure.mjs`, the agent eval, cargo builds.
Steps marked ∥ can each run in their own session or worktree at the same time.

### Sprint 0: guardrails

Make `main` trustworthy, and make the rules above automatic before anyone starts moving code.

**Status:** blocked. The guardrails are implemented on `sprint/S0`; the packed landing
template's `Input`/`FormValue` type mismatch needs an M3 source fix or an ownership exception.
The sprint has not merged to `main`, and its two-green-main-run exit remains unmet.

- [ ] Get CI green. Install Firefox and WebKit in `quality.yml`, allowlist the deploy fixture in
      `.gitleaks.toml`, and fix `runtime-matrix.yml`. Its header still says there's no CI.
- [x] Add `oxfmt` with `printWidth: 100`, set `rustfmt` to `max_width = 100`, and format the whole
      repo in one commit. Add that commit's hash to `.git-blame-ignore-revs`.
- [x] Turn on `max-lines` and `max-lines-per-function` in `.oxlintrc.json`, and
      `clippy::too_many_lines` for Rust. Every current offender goes on an allowlist (the
      `evals/results/` baseline pattern). The allowlist can only shrink, and check fails if it grows.
- [x] Add the sample-width check to `site/scripts/content.mjs` as a warning that prints a count.
      Sprint 1 turns it into an error.

**Exit:** two green CI runs in a row on `main`. `pnpm run check` reports formatting, length and
sample-width counts, and the allowlists are committed.

### Sprint 1: code you can read on the page

The first thing in the brief: samples that fit their box, written the way we want people to write.

**Rendering** (`site/src/styles/site.css`, `docs.css`, `example.css`, and the highlighter that emits
`[data-part="line"]`):

- [ ] Stop wrapping at any character. Wrap only at spaces (`overflow-wrap: normal`) and keep the
      leading spaces.
- [ ] Indent wrapped lines past the line's own indent. The highlighter sets `--indent` on each line
      span, and CSS uses `padding-inline-start: calc(var(--indent) + 2ch)` with a matching negative
      `text-indent`. A wrapped line then reads as a continuation, as in Expressive Code's
      `hangingIndent`.
- [ ] Copy still copies the original lines, as it does now.
- [ ] Below 600 px, try horizontal scroll with an edge fade against the hanging wrap. Keep the one
      that passes `site/test/qa.mjs` and reads better on a phone.

**Content:** rewrite to fit 70 columns (docs) and 58 (split panes). The patterns to use:

- Destructure props and results: `const { items, taxRate } = props`, not `props.items.reduce(…)`
  inline in JSX.
- Name the steps. A `derived` gets a name, and so does a handler longer than one call: write
  `onClick={save}`, not a 120-column arrow function.
- Past two attributes, put one attribute on each line, and close the tag on its own line.
- Break long chains (`.filter().map()`) and long conditions (`a && b && c`) one per line, or name
  them.
- No long string literals in samples. Use shorter copy, or split the string.
- Imports: one per line once they pass the width.

Order, worst first. `packages/cli/docs/start.md`, `learn/tutorial.md`, `auth.md`,
`metadata-and-share-images.md`, `updating-objects-and-arrays.md` and
`you-might-not-need-an-effect.md` come first. Then the rest of `site/content/learn` and
`packages/cli/docs` ∥. Then `site/src/toolkit/examples/*.tsx` and `site/src/demos` ∥.

Apply the same patterns to the samples in `README.md` and in each `packages/*/README.md`.

**Exit:** the width check is an error. `site/test/qa.mjs` gains a test that loads 10 pages at 1440,
1024 and 390 px and fails if any desktop or tablet code line wraps. Before-and-after screenshots
go in the PR.

### Sprint 2: a normal repo layout

Moves and deletes come before the refactors, because moving files later would collide with every
open branch.

The target top level:

```
packages/        npm packages. Folder = npm name without the scope
crates/          Rust: weft, weft-compiler, weft-layout
site/            the docs site (weft.dev); generated pages aren't tracked
examples/        small runnable apps people copy (from evals/apps and spikes)
benchmarks/      evals/compare, evals/speed and site/arena: what we publish
evals/           agent evals: tasks, references and gates, latest version only
scripts/         repo tooling, plus scripts/lib for the shared helpers
docs/            contributor docs, ARCHITECTURE.md, decisions/
.github/         CI, templates, CODEOWNERS, dependabot
```

- [ ] Rename folders to match npm names: `packages/weft` becomes `packages/core`, `packages/icons`
      becomes `packages/warp-icons`, `packages/create-weft` becomes `packages/create`. Fix every
      link and path, and grep for `packages/weft/` afterwards.
- [ ] Move `evals/results/`, the 1,561 run snapshots, out of the tree. Tag the current tree as
      `archive/evals-2026-11`, then publish the snapshots as a release asset or in a
      `weft-js/eval-results` repo. Keep one summary file, plus `compare-history.jsonl`.
- [ ] Remove the frozen Phase 0 eval baselines (`tasks`, `tasks-v2`, `reference`, `reference-v2`,
      `buggy`, `buggy-v2`) and keep the latest version of each. The archive tag keeps the history.
- [ ] Move the eleven `evals/*-exit.mjs` gates to `evals/gates/`, sharing one `evals/lib/gate.mjs`
      for `run`, `must`, `until`, `eq` and `check`.
- [ ] Move `evals/compare`, `evals/speed` and `site/arena` to `benchmarks/`, with one README that
      explains the method (see Sprint 5).
- [ ] Remove `site/review/` (21 screenshots). Stop tracking the generated `site/public/reference`
      and `site/public/learn`, and generate them in `build`.
- [ ] Stop tracking other build output: `packages/warp/test/a11y/gallery/assets/*`,
      `packages/icons/contact-sheet.html`, `packages/cli/.vitest/`,
      `evals/results/sites/first-run-*.json` and `evals/speed/lab.json`. Add them to `.gitignore`.
- [ ] Archive `docs/research/` (58 notes), `docs/design/warp/reviews/` (215 files),
      `docs/design/warp/specimens/` and `spikes/` under the archive tag. In their place, write
      `docs/decisions/`: one short file per decision that still holds, linking to the archived
      note. Cut `docs/PLAN.md` down to `docs/ARCHITECTURE.md` plus this roadmap.
- [ ] Remove absolute `/Users/ravonus` paths from tracked files (`docs/research/04`, `40`, and
      `evals/agent-eval/lib/transcript.mjs`).
- [ ] Delete `scripts/rename-scope.mjs`, which was a one-off.

**Exit:** the top level matches the tree above. Fewer than 2,000 files are tracked. `pnpm run
check` and the site build pass after the moves, run on yuna-mbp.

### Sprint 3: KISS and DRY

Every file under 400 lines and every function under 80, with the allowlist from Sprint 0 empty.

**Splits**, largest first. Each split moves code as-is and doesn't change behaviour, so each can be
its own PR.

| File | Function(s) | Split into |
|---|---|---|
| `start/src/server.tsx` (1,180) | `createHandler` (601) | `server/` with request routing, SSR render, server-function calls, assets and errors |
| `start/src/hub.ts` (822) | `createHub` (415) | Connections, rooms, presence and delivery, each a factory `createHub` composes |
| `start/src/vite.mjs` (968) | `weftStart` (264) | One Vite plugin per concern, and `weftStart` returns the array |
| `start/src/data.ts` (1,106) | `mutate` (81) | Query, mutate and cache modules |
| `core/vite.mjs` (628) | `styleGroups` (148) | `vite/style-groups.mjs` |
| `cli/src/tests.mjs` (572) | `checkTestFile` (214) | One function per rule, plus a table |
| `warp/src/schedule/Calendar.tsx` (865) | `useCalendar`, `TimeGrid`, `MonthGrid`, `Timeline` | One file per view, plus a `calendar-state.ts` |
| `warp-core/src/live.ts` (815) | `transportSim` (147) | `live/sim.ts` |
| `weft-compiler/src/emit.rs` (1,604) | `walk` (283), `props` (99) | `emit/{walk,props,list,attrs}.rs` |
| `weft-compiler/src/analyze.rs` (1,901) | `analyze_list` (106) | `analyze/` with one module per diagnostic family |
| `weft-compiler/src/hydration.rs` (1,220) | `facts` (223), `visit_jsx_element` (107) | `hydration/{facts,visit}.rs` |
| `site/src/toolkit/examples/canvas.tsx` (1,036) | `Landing` (148), `lookKit` (128) | One file per demo |

**One home for each helper:**

- [ ] `scripts/lib/` (repo-internal, unpublished) holds `freePort`, `sleep`, `until`, `walk`,
      `median` and `repoRoot`. Twelve copies become imports, and 58 scripts stop computing their
      own `repo`, `root` or `here`.
- [ ] An HTML `esc` is exported once, from `@weft-js/core/markup`. Today there are copies in
      `start/src/server.tsx`, `start/src/inline.mjs`, `core/src/head.ts` and
      `warp-core/src/{code,editor}.ts`.
- [ ] The six `realtime-*` packages share one `vitest` and `tsconfig` base. Their configs are
      byte-identical today.
- [ ] `site/src/toolkit/world.ts` holds the shared demo data (`TONES`, `WORDS`, `VIEWS`, `Cell`…).

**Conventions** (written into CONTRIBUTING and AGENTS.md):

- [ ] Inside `src/`, use `.ts` and `.tsx`. Use `.mjs` only for files Node runs untranspiled
      (configs, `bin`, scripts). One extension style per package: `cli` stays `.mjs` with JSDoc
      types, and `start` stops mixing.
- [ ] Tests are `*.test.ts(x)` for unit tests and `*.browser.test.ts(x)` for browser tests, in
      `test/`. The 56 ad-hoc `packages/*/scripts/*-e2e.mjs` move into `test/e2e/` and run under
      `pnpm test:e2e`.
- [ ] One `vitest.config.ts` per package (15 are `.mjs` today).

**Exit:** both length allowlists are empty and the duplicate-helper grep finds nothing. Every
benchmark is within noise of the Sprint 0 numbers: these are moves, not rewrites.

### Sprint 4: keep the promise

Design rule 2 says every React habit that's silently wrong in weft is a hard compile error with a
fix. Today, these are in the catalog but the compiler never emits them:

| Code | Catches |
|---|---|
| W020 to W029 | React-isms: `useState`, `useEffect`, `useMemo`, `useRef`, `useCallback`, custom `useX()` hooks, dependency arrays |
| W040 | An early `return` that depends on state (the body runs once, so it's never checked again) |
| W041 | A `let` changed in a handler and read in JSX (it never updates) |
| W011 | A number on the left of `&&` (renders `0`) |
| W012 | `derived(async …)`, or reads after `await` in `resource` |
| W002 | Writing state inside `derived` |
| W003 | A `watch` that writes state its own source reads (a cycle) |
| W004 | A `watch` that only copies one value into another |
| W008 | A box where a value is expected at a prop, or the reverse |
| W030 | Module-level `state` the server entry can reach (it leaks across requests) |

- [ ] Implement them in `crates/weft-compiler` in that order. The React-isms and W040 come first:
      they're the bugs agents write most. Each code gets a failing fixture, a fix and a
      `tests/compile.rs` case. Where the fix can't change meaning, it gets an autofix. W008 may be
      better as a TS-error mapping, which the plan allows.
- [ ] Add W016 to the catalog (it's emitted at `analyze.rs:946` but has no entry) and give W085 a
      test.
- [ ] Add a check that the catalog matches the compiler. Every `by: 'compiler'` entry must have an
      emit site and a test, and every emitted code must have an entry. The catalog can't drift
      again.
- [ ] Trim the public API. Move the runtime internals out of the `@weft-js/core` root (`DIRTY`,
      `rt`, `listener`, `read`, `reach`, `clean`, `setFlat`, `flat`, `collecting`, `runMounts`,
      `setKeyed`, `NONE`, `stats`, `devComponent`, `Box`) into `@weft-js/core/internal`, which the
      compiler's output imports. Document `memo`, `hole`, `localProps` and `restOf`, or move them
      too.
- [ ] For each undocumented subpath export (9 in core, 23 in start), either document it in
      `packages/cli/docs` or remove it from `exports`. Commit an API snapshot (`api.json` per
      package) that `check` compares against, so API changes are deliberate.
- [ ] Settle the 1.0 scope in `docs/ARCHITECTURE.md`. In: core, cli, create, start, db, warp,
      warp-core, warp-icons. Out: native (6a, 6b, 6d), the native half of pay, and anything with
      one conformance test. Unreleased packages get `"private": true` until they're ready, so
      `release.mjs` and the README agree.
- [ ] Record the exit results for phases 1b, 3x and 3c in this file. Answer or defer each open
      question in PLAN §11.

**Exit:** the catalog check passes. `buggy-v4` reports every seeded React-ism as an error with the
right code. The API snapshots are committed.

### Sprint 5: prove it (cheap agents, benchmarks, size)

Test the bet with agents that have nothing going for them.

**Cheap-agent gauntlet** (`evals/agent-eval`, pre-registered in research 42):

- [ ] Run the matrix of weft + warp against Next + shadcn and Vite + React, on all 6 tasks, with a
      small model and a mid model, 5 samples each, on yuna-mbp. Cold start, so each agent has only
      AGENTS.md, `weft docs` and the MCP server. Record pass@1, the diagnostics hit, tokens, wall
      time and "had to read source".
- [ ] Friction pass. Give a small-model agent 20 Learn pages, one at a time: "build what this page
      teaches, without reading the framework's source". It logs every step where it got stuck,
      guessed, or found a doc that was wrong. Each friction item is a bug against the docs or the
      diagnostics.
- [ ] Fix what the runs find, then run the matrix again. Publish both runs.

**Size and speed** (decide by benchmark, speed over bytes, 50 KB ceiling):

- [ ] Get weft + warp back under 50 KB. Bisect the growth from 40.8 to 53.0 KB between `10-31` and
      `37ad91b7`. CSS is about 24.7 KB of it, so look at warp's CSS first.
- [ ] Find what makes weft + warp's first load (210 ms) slower than Solid + Kobalte (155 ms),
      when weft alone is 113 ms. Profile the warp mount path in `benchmarks/compare`.
- [ ] Submit weft as a keyed implementation to
      [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark): idiomatic, no
      hand-written DOM, versions pinned. Its numbers are the ones outsiders trust.
- [ ] `benchmarks/README.md` explains the method: machines, runs, medians, what's measured and how
      to reproduce it. The site's numbers link to it.

**Exit:** weft + warp is at or under 50 KB. Load time is no worse than Solid + Kobalte, or the
reason is written down. The agent eval results are published, with weft's pass@1 at or above both
React stacks.

### Sprint 6: open-source release

Everything a first-time visitor and their agent expect to find.

**Files.** These exist: LICENSE, CODE_OF_CONDUCT, CONTRIBUTING, SECURITY, and issue and PR
templates. Add:

- [ ] `AGENTS.md` at the root: what weft is, the commands, the rules above and where things live.
      Add nested `AGENTS.md` files in `packages/core`, `packages/start`, `packages/warp` and
      `crates/weft-compiler`. Keep the root `CLAUDE.md` as one line pointing to `AGENTS.md`.
- [ ] `docs/ARCHITECTURE.md`: how compile, runtime and SSR fit together, and a map of the folders.
- [ ] `NOTICE` for the third-party code and fonts: pretext, Figtree, Fraunces, and alien-signals'
      algorithm.
- [ ] `.github/CODEOWNERS`, `GOVERNANCE.md` (who decides and how), `SUPPORT.md`, and optionally
      `.github/FUNDING.yml`.
- [ ] A `CHANGELOG.md` for each package, from Changesets.

**Release tooling:**

- [ ] Adopt Changesets, as Svelte, Astro, Solid and TanStack do. Use `changeset version` for
      releases and `--snapshot` for canaries on a `next` tag. Previews per PR on pkg.pr.new are
      optional.
- [ ] Decide on provenance. Commit `f9119ac9` moved publishing back to local `release.mjs --otp`,
      which means no npm provenance. Trusted publishing from Actions gives provenance and satisfies
      Scorecard's Signed-Releases check. The rule that signing stays on this Mac argues for local
      publishing. This decision belongs to the owner.

**Hardening** (OpenSSF Scorecard):

- [ ] Branch protection on `main`: required checks, no force-push.
- [ ] Workflows set `permissions: {}` at the top, grant per job, and pin every action to a full
      commit SHA.
- [ ] Use Dependabot or Renovate, with the same 3-day minimum release age that
      `pnpm-workspace.yaml` sets. Never route around it.
- [ ] Turn on CodeQL, and run Scorecard as an action with its badge in the README.

**Fresh-clone test:**

- [ ] On yuna-mbp, in an empty `~/work/weft-rc`: clone the repo, then run `pnpm install`,
      `pnpm run setup`, `pnpm run check` and `npm create @weft-js` from the packed tarballs. Then
      build the app and deploy it. Time each step, and fix anything that needed knowledge not in
      the README. Delete the checkout afterwards.

**Exit:** GitHub's community profile is 100%. The Scorecard is 7 or higher. A fresh clone gets
through the steps above with only the README. `1.0.0-rc.0` is published to the `next` tag.

## Decisions to confirm

Each has a default. The plan proceeds on the default unless the owner says otherwise.

| Decision | Default | Alternative |
|---|---|---|
| Code on phones | Hanging-indent wrap at spaces | Horizontal scroll with an edge fade |
| Source width | 100 for TS and Rust | 80 (react.dev, Vite) or 120 (today's `rustfmt`) |
| Formatter | `oxfmt`, part of the Oxc toolchain weft already uses | Prettier or Biome |
| Archive for research, run snapshots and spikes | An archive git tag, plus an eval-results repo | Keep them in `docs/archive/` |
| Folder renames (`weft` to `core`, and so on) | Rename in Sprint 2 | Keep the current names and document the mapping |
| Unreleased add-ons | `private: true` until each has real tests | Publish as `0.x` experimental |
| Provenance | Owner's call (see Sprint 6) | — |

## Status

- Sprint 0: not started
- Sprint 1: not started
- Sprint 2: not started
- Sprint 3: not started
- Sprint 4: not started
- Sprint 5: not started
- Sprint 6: not started
