# Contributing to Weft

Thanks for helping. Weft is a fine-grained reactive TSX framework with a Rust compiler, and Warp is its UI toolkit. This
page is everything you need: how to get set up, the one command to run, and what a good pull request looks like.

## Setup

You need [Node 26](.nvmrc) and [Rust](https://rustup.rs). rustup picks the right Rust version by itself.

```bash
git clone <your fork>
cd weft
pnpm run setup   # one install for every package, then the compiler
pnpm run check   # everything
```

The repo is one pnpm workspace (`pnpm-workspace.yaml`), so a tool every package uses is installed once. Use pnpm, not
npm. The workspace holds every install to releases at least 3 days old. The first run takes a few minutes because it builds
the compiler.

Two more tools make `pnpm run check` complete: [gitleaks](https://github.com/gitleaks/gitleaks) and
[cargo-deny](https://github.com/EmbarkStudios/cargo-deny). If you don't have them, those two steps say they were skipped,
and CI runs them for you.

## One command

| Command                            | What it does                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| `pnpm run check`                   | Runs every rule and every test. Prints what failed and how to fix it.           |
| `pnpm run check --fast`            | The same without the test suites.                                               |
| `pnpm run check --only=lint,types` | Only those steps. `--list` shows them all.                                      |
| `pnpm run fix`                     | Fixes what a machine can fix. Run it first when `check` complains.              |
| `pnpm run hooks`                   | Turns on an optional pre-commit hook that checks staged files in a few seconds. |

To work on one package: `pnpm --filter @weft-js/<name> test`. To undo the hook: `git config --unset core.hooksPath`.

`pnpm run check` is about the code in this repo. Don't confuse it with `weft check`, which is the product: the diagnostics an
app built with Weft gets.

## The rules

CI runs `pnpm run check`, so a pull request has to pass it. The rules are all in the repo: [.oxlintrc.json](.oxlintrc.json),
[tsconfig.base.json](tsconfig.base.json), the `[lints]` table in each `Cargo.toml`, [deny.toml](crates/deny.toml) and
[scripts/quality/](scripts/quality/).

**TypeScript.** `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride` and `exactOptionalPropertyTypes` are all on. No
`any` unless you say why. No `@ts-ignore`. `@ts-expect-error` needs a reason after it. Promises are awaited or handled. Types
are imported with `import type`.

**Source and tests.** Use `.ts` or `.tsx` in package `src/`. Keep `.mjs` for code that Node runs
without a transpiler, including its imported helpers; preserve package exports and generated import paths. The CLI
uses `.mjs` with JSDoc types. Start's Node entrypoints and their helpers stay `.mjs`; `capture.ts` is transpiled
server code. Put unit tests in `test/` as `*.test.ts` or `*.test.tsx`, and browser tests as
`*.browser.test.ts` or `*.browser.test.tsx`. Put raw Node end-to-end entrypoints and their helpers in `test/e2e/`,
and run them with the package's `test:e2e` script. The direct Node test in `core/scripts/node-style.test.mjs` is an
exception. Packages using Vitest have one root `vitest.config.ts`; shared realtime base configurations remain valid.
`node scripts/quality/conventions.mjs` checks tracked package paths and the Node entry import closure.

**Boundaries.** warp-core doesn't import a framework: that goes in `bindings/`. Core doesn't import Node. Nothing a browser
loads may reach Node code, however many files away. `scripts/quality/boundaries.mjs` follows the imports to check.
Browser code doesn't call `crypto.randomUUID`, which a page on plain http (a LAN address) doesn't have: use
`crypto.getRandomValues`. `scripts/quality/browser-apis.mjs` follows the same imports, and the site's client code.

**Comments.** This repo's comments are plain sentences that say why, not what. A file that isn't obvious starts with a line or
two on what it's for. So:

- Anything a package exports has a `/** doc comment */` saying what it's for.
- No commented-out code. Git keeps the history.
- No `TODO` without an issue: `TODO(#123): ...`.
- A lint disable names its rule and gives a reason: `// oxlint-disable-next-line <rule> -- <why>`.

**Rust.** `cargo fmt`, `cargo clippy` with pedantic on, and warnings fail. No `unwrap` outside tests unless you say why: use
`expect("why this holds")`. `unsafe` takes a `// SAFETY:` comment. `#[allow]` takes a `reason`.

**Security.** No secrets, ever. No `eval` or `new Function`. No markup written without escaping (`innerHTML`,
`dangerouslySetInnerHTML` and the like) unless a disable comment says why it's safe. Dependencies are audited and their
licences checked against an allowlist.

**Tests.** A bug fix comes with a test that fails without the fix. If one truly can't exist, put a
`No-Regression-Test: <reason>` line at the end of the commit message. No `.only`. A skipped test has a comment saying why.

**Disabling a rule** is for when the rule is wrong here, not when it's in the way. The one standing exception is measured
speed: in the hot paths of `packages/core/src` and the compiler, a narrow disable with a stated reason is fine.

**Formatting.** Run `pnpm run fix` to format tracked JavaScript and TypeScript with oxfmt and Rust with rustfmt.
Source uses 100 columns; runnable site samples use 58, with one JSX attribute per line. Markdown samples
use 70 columns. The source formatter skips generated and vendor files, archived evaluation results, snapshots,
and documentation content. Run `node scripts/quality/format.mjs` to check its tracked source files without writing them.
Rust formatting covers every tracked `.rs` file, using its manifest edition and `crates/rustfmt.toml`.
Run `node scripts/quality/rust-format.mjs` to check, or add `--write` to format those files.

## Speed and size

Speed comes first, then bytes. If you change the compiler, the runtime, Warp or warp-core:

- `node packages/core/scripts/size.mjs` and the tests in each package hold the size budgets.
- `node benchmarks/compare/measure.mjs` measures every stack in `benchmarks/compare`, not only Weft, and you commit the new line in
  `evals/results/compare-history.jsonl` and the regenerated `compare.html`. [benchmarks/compare/README.md](benchmarks/compare/README.md)
  has the rules.

## Adding a diagnostic

A diagnostic is a stable code, one line of why, a fix, and an autofix when the change is mechanical.

1. Pick the next free code in its family in `packages/cli/src/catalog/<family>.mjs`, and add an entry with `catches`, `fix` and an
   `example` that triggers it. The catalog's `probe()` runs the examples, so docs only claim what the compiler really reports.
2. Report it. Compiler diagnostics use `Diagnostic::new` in a pass under `crates/weft-compiler/src/analyze/`. CLI ones go in the matching
   `packages/cli/src/*-checks.mjs`.
3. Add a test that it fires, and one that the right code stays quiet: `crates/weft-compiler/tests/compile/`, or
   `packages/cli/test/`.
4. If the rule is new to users, document it in `packages/cli/docs/rules.md`.

After a compiler change, rebuild with `pnpm run build:native` in `packages/core`.

## Adding a Warp component

1. Behaviour that isn't tied to a framework goes in `packages/warp-core/src`. Its CSS goes in the spec's stylesheets in
   `docs/design/warp/tokens/`, under a `/* -- Name` header; `pnpm run build:css` in `packages/warp-core` splits them into
   `styles/components/`.
2. The component goes in `packages/warp/src/<Name>.tsx`, using `data-scope` and `data-part` the way its neighbours do.
3. Export it from `packages/warp/src/index.ts` with a doc comment, and register it in `packages/warp/src/plugin/catalog.mjs` and
   `packages/warp/scripts/size.mjs`.
4. Add a test in `packages/warp/test/`, including hydration if it has state. Keyboard use and screen readers count: see
   `packages/warp/test/a11y/`.

## A good pull request

- One change. Refactors go in their own pull request.
- It says what changed and why, in plain words. Link the issue if there is one.
- `pnpm run check` passes.
- It has a test. A bug fix has a test that fails without the fix.
- Public API changes update the docs: see below.

## Docs

[docs/README.md](docs/README.md) lists where each doc lives. In short:

- **Reference** is `packages/cli/docs/*.md`: exact API, commands, config keys and codes. `weft docs` prints these pages to
  apps and agents, and the site serves them under `/reference`. A change to a public API updates its page here.
- **Learn** is `site/content/learn/*.md`: the tutorial. Change it when what a reader should learn changes.
- A package's `README.md` says what it's for, how to install it and where its docs are. It doesn't repeat them.

Code in a doc has to compile against the packages as they are. Write examples whole, with their imports.

## Commits

Write a short sentence saying what is now true, in the present tense, and keep the first line under about 70 characters. Look
at `git log` for the feel:

```
Keep a hovered toast paused in WebKit after it moves into a modal
weft add: an unscoped name for an unpublished add-on gets the plain message
```

Add a body when the why isn't obvious. Sign off every commit (see below).

## Developer Certificate of Origin

Weft uses the [Developer Certificate of Origin](https://developercertificate.org), not a CLA. It's a short statement that you
wrote the code or have the right to send it. Agree by adding a sign-off to each commit:

```bash
git commit -s
```

That adds a `Signed-off-by:` line with the name and email from your git config. Your GitHub noreply address is fine. CI checks
each commit in a pull request. If you forgot: `git rebase --signoff main`.

## Reporting a security problem

Please don't open a public issue. [SECURITY.md](.github/SECURITY.md) says how to report it privately.

## Licence

By contributing you agree that your work is released under the [MIT licence](LICENSE).
