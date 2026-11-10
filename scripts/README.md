<p align="center">
  <a href="https://github.com/Ravonus/weft">
    <img src="https://raw.githubusercontent.com/Ravonus/weft/main/site/public/logo.svg" width="88" height="88" alt="Weft">
  </a>
</p>

<h1 align="center">scripts</h1>

<p align="center">
  <strong>The scripts for working on Weft itself: set up, check, fix, and release.</strong><br>
  One command per job, and every failure says how to fix it.
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#checkmjs">check</a> ·
  <a href="#releasemjs">release</a> ·
  <a href="quality/README.md">Length checks</a> ·
  <a href="../CONTRIBUTING.md">Contributing</a>
</p>

> [!NOTE]
> These scripts run on the Weft repository. They are not published, and they are not what an app gets: an app's rules
> are `weft check`, in the compiler and the CLI.

## Contents

- [Quick start](#quick-start)
- [At a glance](#at-a-glance)
- [setup.mjs](#setupmjs)
- [check.mjs](#checkmjs) and [check/](#check)
- [fix.mjs](#fixmjs)
- [jobs.mjs](#jobsmjs)
- [release.mjs](#releasemjs)
- [release-e2e.mjs](#release-e2emjs)
- [intel/](#intel)
- [quality/](#quality)
- [lib/](#lib)
- [Troubleshooting](#troubleshooting)

## Quick start

Needs Node 26 or later (`.nvmrc`; the root `package.json` sets `engines.node` to `>=26`), pnpm, and Rust through rustup.

```sh
pnpm run setup     # from a fresh clone to a tree that passes
pnpm run check     # every step a merge needs
pnpm run fix       # what a machine can fix safely; check explains the rest
```

## At a glance

| Script | Run it with | When |
| ------ | ----------- | ---- |
| [`setup.mjs`](setup.mjs) | `pnpm run setup` | After cloning, and after a pull that changes dependencies or generated inputs |
| [`check.mjs`](check.mjs) | `pnpm run check [flags]` | Before every commit you push. CI runs it too |
| [`fix.mjs`](fix.mjs) | `pnpm run fix` | When `check` reports lint, Clippy or format problems |
| [`jobs.mjs`](jobs.mjs) | imported, or `--jobs=N` / `WEFT_JOBS=N` | To limit how much a gate runs at once |
| [`release.mjs`](release.mjs) | `node scripts/release.mjs [--publish]` | To build, stage, check and (with `--publish`) publish the packages |
| [`set-version.mjs`](set-version.mjs) | `node scripts/set-version.mjs <version> \| --nightly <n>` | Before a release, or in the nightly: every public package at one version |
| [`trust-nightly.mjs`](trust-nightly.mjs) | `node scripts/trust-nightly.mjs` | Once, so the nightly workflow may publish each package by trusted publishing |
| [`release-e2e.mjs`](release-e2e.mjs) | `node scripts/release-e2e.mjs <tgz dir> <empty dir>` | After `release.mjs`, to prove a fresh install works |
| [`intel/proof.mjs`](intel/proof.mjs) | `pnpm run proof:intel` | To prove the darwin-x64 install on an Apple Silicon Mac |
| [`quality/prove.mjs`](quality/prove.mjs) | `pnpm run check:prove` | After changing a check, to prove each rule still fails on a planted violation |
| [`quality/*`](quality) | through `check.mjs` | Each one is a check step, or a helper of one |
| [`lib/*`](lib) | imported | Shared helpers for repository scripts |

## `setup.mjs`

`pnpm run setup` takes a fresh clone to a tree that passes. The repo is one pnpm workspace, so one install at the root
covers every package, the site and the arena. It runs, in order, and stops at the first failure:

| Folder | Command | Why |
| ------ | ------- | --- |
| `.` | `pnpm install --frozen-lockfile` | Every workspace dependency |
| `packages/core` | `pnpm run build:native` | The native compiler addon |
| `packages/text` | `node scripts/specialize.mjs` | Generated text code the package reads |
| `packages/db` | `pnpm exec prisma generate` | The Prisma client that tests and types read. `DATABASE_URL` defaults to `file:./setup.db`, which Prisma never opens |
| `site` | `node ../benchmarks/arena/build.mjs` | The arena builds the site's types read |
| `site` | `pnpm exec weft plugins sync` | The site's plugin outputs |
| `site` | `pnpm exec weft run content` | The site's generated docs and numbers |

It needs Node and Rust. rustup reads the `rust-toolchain.toml` in each crate, including the wasm target.

## `check.mjs`

One command for every rule on the framework's own code. It says what failed and how to fix it, and it's what CI runs.

```sh
pnpm run check                  # every step a merge needs, all at once
pnpm run check --fast           # without the test suites
pnpm run check --release        # also the release-only steps and test files, and WebKit
pnpm run check --changed=main   # test only packages changed since main, and those that depend on them
pnpm run check --only=lint,types
pnpm run check --list           # the steps, and what each covers
pnpm run check --require-tools  # a missing gitleaks or cargo-deny fails instead of skipping (CI does this)
pnpm run check --jobs=4         # how much to run at once (see jobs.mjs)
```

| Flag | What it does |
| ---- | ------------ |
| `--fast` | Leaves out the steps marked slow: `guardrails`, `rust-tests` and `tests` |
| `--release` | Adds the `instant-navigation` step, runs every test file (including the release-only ones in `check/tiers.mjs`), and tests WebKit. First it checks that WebKit can open a page, and fails at once with the reason if it can't |
| `--changed=<ref>` | Runs the `tests` step only for packages with a change since `<ref>`, plus every package that depends on them. A change outside `packages/` tests them all; changes in `docs/`, `site/`, `examples/`, `benchmarks/`, `evals/`, `.github/` or a top-level `.md` are ignored |
| `--only=<ids>` | Only these steps, comma-separated. An unknown id exits 2 |
| `--list` | Prints each step and what it covers, then exits |
| `--require-tools` | A step whose tool is missing (gitleaks, cargo-deny) counts as failed |
| `--jobs=N` | Concurrency, see [`jobs.mjs`](#jobsmjs) |

### The steps

`pnpm run check --list` prints these. The static steps run first, all at once. The slow test steps start once they
finish, because the test suites write temporary files into the tree that the static steps read.

<details>
<summary>All 28 steps</summary>

| Step | Covers |
| ---- | ------ |
| `s9-structure`, `s9-duplicates`, `s9-comment-budget`, `s9-category-limits` | Warning inventories: they report findings without failing, but a script that crashes still fails |
| `conventions` | Tracked source extensions, test locations and Vitest configs |
| `package-folders` | Package folders match published names, tracked paths, shared repository helpers |
| `css-important` | `!important` only where a user setting or a must-win state overrides every template |
| `format` | oxfmt formatting at 100 columns |
| `sample-width` | 70-column doc fences and 58-column split-pane samples (`site/scripts/sample-width.mjs`) |
| `lint` | Oxlint with type-aware rules, plus the repo's own plugin rules |
| `lengths` | 400 lines per source file, 800 per test or generated file, 80 per function, against a baseline that may only shrink |
| `types` | `tsc` on the root, the site and every package: strict, `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes` |
| `api-snapshots` | The core and start export maps, and a reference page for each path |
| `diagnostic-catalog` | Compiler diagnostic catalog against emit sites and compile-test assertions |
| `boundaries` | warp-core imports no framework; browser entries reach no Node code, however deep |
| `browser-apis` | Browser code never calls `crypto.randomUUID`, which plain http (a LAN address) lacks |
| `rust-fmt` | `rustfmt --check` on all tracked Rust files |
| `clippy` | Clippy with `-D warnings` on each crate: no unwrap outside tests, `SAFETY` comments on `unsafe`, reasons on allows |
| `secrets` | gitleaks over the working tree. Skipped if gitleaks isn't installed |
| `tarballs` | `.gitignore` keeps out env files and credentials, and no package would ship them |
| `licences` | Every npm dependency's licence is on the allowlist |
| `npm-audit` | `pnpm audit --prod --audit-level=low`, then `pnpm audit --audit-level=high` for dev tools |
| `cargo-deny` | Advisories, licences, bans and sources for each crate. Skipped if cargo-deny isn't installed |
| `commits` | Each commit that fixes a bug touches a test |
| `instant-navigation` | Landing scaffold navigation on Fast and Slow 3G. Only with `--release` |
| `guardrails` | The tests of the check scripts and eval gates themselves. Not with `--fast` |
| `rust-tests` | `cargo test` in each crate. Not with `--fast` |
| `tests` | Every package's `test` script, with `--maxWorkers=4`, longest suites first. Not with `--fast` |

</details>

Each failure prints up to 60 problem lines and a `how to fix:` line. Steps cover the three crates:
`crates/weft-compiler`, `crates/weft-layout` and `crates/weft`.

## `check/`

The parts of `check.mjs`, split out so each can be tested.

| File | What it does |
| ---- | ------------ |
| [`run.mjs`](check/run.mjs) | `run(cmd, args, cwd, env)` spawns a command from the repo root with `NO_COLOR=1` and keeps its output. `allJobs` runs a job per item with bounded concurrency, prints each failure's output, and reports the three slowest |
| [`steps.mjs`](check/steps.mjs) | `runSteps` runs the chosen steps in two waves, prints one line per step in list order, then each failure with its fix |
| [`tiers.mjs`](check/tiers.mjs) | `RELEASE_TESTS`: the heavy test files only `--release` runs (scaffolds, builds, mutation tests, benchmarks, cross-browser checks). `affected()` works out the packages `--changed` tests. `mergeArgs()` turns the release-only files into Vitest `--exclude` flags |
| [`types.mjs`](check/types.mjs) | Pulls `error TS` lines out of `tsc` output, leaving out `evals/`, `examples/` and `packages/text/gen/` |
| [`webkit.mjs`](check/webkit.mjs) | `webkitWorks(root, ms = 30000)`: launches WebKit through `packages/start`'s playwright-core and opens a page. `--release` calls it first |
| `*.test.mjs` | Tests for `run.mjs`, `types.mjs` and the Vitest cache |

## `fix.mjs`

`pnpm run fix` applies everything a machine can fix safely:

1. `oxlint --type-aware --fix --quiet` over `packages`, `scripts` and `site`.
2. `cargo clippy --fix --allow-dirty --allow-staged --all-targets` in each crate.
3. `node scripts/quality/rust-format.mjs --write`.
4. `node scripts/quality/format.mjs --write`.

It exits non-zero only if the Rust formatter fails. Run `pnpm run check` afterwards for what is left.

## `jobs.mjs`

How many things a gate runs at once. `check.mjs` and other gates import it.

- `--jobs=N` or `WEFT_JOBS=N` sets it. `1` runs everything one at a time. Anything but a whole number from 1 up throws.
- The default is half the cores free right now, at most 8 and at least 1: `floor((cores - load) / 2)`. Load is the
  1-minute load average, or on Windows, where that is always 0, the CPU share in use over half a second.
- `pool(items, limit, run)` runs at most `limit` at a time, keeps results in item order, and rejects on the first failure.

> [!TIP]
> On a busy machine the default already backs off. If the suites still time out, run with `--jobs=1`, or run the gate
> on a less busy machine.

## `release.mjs`

Builds, checks and publishes the packages. It only reads the tree: each package is packed, its manifest made fit for a
registry, and that tarball is what gets checked and sent.

```sh
node scripts/release.mjs                      # build, stage, check, then `npm publish --dry-run` each. Nothing leaves
node scripts/release.mjs --publish            # the same, then publish to npmjs.org. You approve in a browser
node scripts/release.mjs --publish --otp      # one 6-digit authenticator code covers every package
node scripts/release.mjs --publish --registry http://localhost:4873/   # a local registry instead
node scripts/release.mjs --publish --no-build --ci   # from GitHub Actions by trusted publishing (the nightly)
```

| Flag | Default | What it does |
| ---- | ------- | ------------ |
| `--publish` | off | Really publish. Without it every package gets `npm publish --dry-run` |
| `--otp` | off | Ask once for a one-time code, and again only if it expires part way (`EOTP`) |
| `--registry <url>` | `https://registry.npmjs.org/` | Where to publish. A non-npmjs registry needs no auth |
| `--out <dir>` | `.release/` (gitignored) | Where tarballs go |
| `--no-build` | off | Use the WASM, text and platform builds already on disk. Otherwise it runs `packages/core/scripts/build-wasm.mjs --if-stale` |

What it does:

1. **Discover.** Every non-private package in `packages/`, plus each platform package built into
   `packages/core/dist/platform/<name>/`. A platform that isn't built is left out of core's `optionalDependencies`,
   and that platform runs the WASM build.
2. **One version.** All packages must share one version, or it stops.
3. **Order.** Dependencies first, so nothing reaches the registry ahead of what it needs. A cycle stops it.
4. **Stage.** `pnpm pack` in place, then the manifest is rewritten in a copy: sibling `@weft-js/*` dependencies become
   the release version (peer dependencies get `^version`), `devDependencies` and `scripts` are dropped, and the copy is
   packed again with `--ignore-scripts`.
5. **Check each tarball.** Version and `private`, the repository URL, licence, README, `publishConfig.access: public`,
   LICENSE (except compiler platform packages), no `file:`/`link:`/`workspace:` specs, no unpublished `@weft-js/*`
   dependency, nothing from `quality/stray.mjs`, every `exports` and `bin` target present, no secret-looking text, no
   import of an undeclared package or an unshipped relative file. Any problem means nothing is published.
6. **Send.** Prerelease versions (with a `-`) go to the `next` tag, others to `latest`. A version already on the
   registry is skipped, so a publish that stopped part way is safe to run again.

> [!WARNING]
> `--publish` without `--registry` publishes to npmjs.org. Run the dry run first, then
> [`release-e2e.mjs`](#release-e2emjs) against the tarballs in `.release/`.

## `release-e2e.mjs`

Proves the install. It serves a directory of tarballs from a local registry, then, from an empty folder, runs what a
new user runs, with no repo in reach.

```sh
node scripts/release-e2e.mjs <dir of .tgz> <empty dir> [--registry-script <path>] [--pm npm|bun|deno] [--no-rust] [--expect-backend <kind>]
```

| Option | Default | What it does |
| ------ | ------- | ------------ |
| `--pm` | `npm` | The package manager and runtime to scaffold and run with: `npm`, `bun` or `deno` |
| `--registry-script` | `packages/create/scripts/registry.mjs` | The local registry to serve the tarballs. Its folder must also hold `cdp.mjs` and `hot-checks.mjs` |
| `--no-rust` | off | Removes every directory holding `cargo` or `rustc` from `PATH`, points `CARGO_HOME` and `RUSTUP_HOME` at nothing, and fails if cargo is still found |
| `--expect-backend` | none | Fails unless `weft doctor --json` reports this compiler kind (for example `native`) |

The empty directory must be empty. The run creates an app, checks that it names only `@weft-js/*` packages that are in
the tarball folder, installs it, runs `weft doctor --json` and `weft check --json`, adds a route with a counter and a
live query, and runs `weft build`. Then it starts `weft dev` and `weft start` in turn, and in a real browser clicks the
page until its counter moves, with no error and each module loaded once. It ends with a JSON summary line of passed and
failed steps. It needs
Chrome or Edge, named by `CHROME` if it isn't found: serving HTML proves nothing about hydration, so with no browser the
run fails. Each step prints `[e2e] pass` or `[e2e] FAIL`.

It needs only Node and its neighbouring registry scripts, so it can be copied to a machine that has neither the repo nor
Rust.

## `intel/`

Proves the `darwin-x64` install on an Apple Silicon Mac: an Intel Node under Rosetta installs the packed tarballs and
uses the Intel compiler package, with no Rust in reach.

```sh
node packages/core/scripts/build-platform.mjs --target darwin-x64
node scripts/release.mjs
pnpm run proof:intel        # or: node scripts/intel/proof.mjs [<dir of .tgz>]   (default .release/)
```

| File | What it does |
| ---- | ------------ |
| [`proof.mjs`](intel/proof.mjs) | Refuses to run anywhere but darwin-arm64, and without a `compiler-darwin-x64` tarball. Uses Intel Node from `NODE_X64` (a folder holding `bin/node`), or downloads it into `.release/node-x64/` and checks it against nodejs.org's `SHASUMS256.txt`. Then runs `release-e2e.mjs --no-rust --expect-backend native` under `arch -x86_64`. On failure it keeps the app folder and prints its path |
| [`chrome-arm64.sh`](intel/chrome-arm64.sh) | Starts Google Chrome as arm64. A child of Intel Node would otherwise start Chrome's x86_64 half; the browser isn't what's being tested |

## `quality/`

The check steps and their helpers. Most files are a step `check.mjs` runs; each `*.test.mjs` beside them tests that
step, and `pnpm run check`'s `guardrails` step runs all of them. [`quality/README.md`](quality/README.md) explains the
length checks and their baseline in full.

<details>
<summary>Every script in quality/</summary>

| File | What it does |
| ---- | ------------ |
| `api-snapshots.mjs` | Snapshots package export maps and requires a reference entry for each path |
| `boundaries.mjs` | What may import what, followed through the whole import graph. `[--json]` |
| `browser-apis.mjs` | No `crypto.randomUUID` in browser code, following the same import graph. `[--json] [files...]` |
| `categories.mjs`, `category-limits.mjs`, `category-overrides.mjs`, `category-allowance.json` | Length categories in first-match order, their limits, and generated overrides checked for drift |
| `comment-budget.mjs` | Inventory of comment size in JS/TS and Rust sources |
| `commits.mjs` | Branch rules: a bug fix touches a test or has a `No-Regression-Test: <reason>` trailer. `--base <ref>`, and `--dco` for `Signed-off-by:` |
| `conventions.mjs`, `conventions-references.mjs` | Tracked paths, extensions, test locations and Vitest configs; the `css-important` step |
| `diagnostic-catalog.mjs`, `diagnostic-catalog-baseline.json` | Compiler diagnostics against their catalog, emit sites and compile-test assertions |
| `duplicates.mjs` | Inventory of repeated source windows. Reports without failing |
| `format.mjs` | Formats tracked source with oxfmt, leaving generated output and archived results alone. `--write` to apply |
| `leak-places.mjs` | Turns a gitleaks report into file and line places, never values |
| `lengths.mjs`, `length-*.mjs`, `length-*.json` | The `lengths` step: collection, metrics, the Oxlint plugin, the Rust tokenizer, and the baseline |
| `licences.mjs` | Every npm dependency's licence against the accepted list. Rust's are in `crates/deny.toml` |
| `lint-plugin.mjs` | The repo's own Oxlint rules, for what Oxlint has no built-in rule |
| `package-folders.mjs` | Package folder names match their published names |
| `prove.mjs` | Plants one violation per area, runs that step, and wants a failure naming it. Undoes each plant, and checks the tree is clean at the end. `[step...]` |
| `rust-format.mjs` | rustfmt on every tracked Rust file, without fetching or building dependencies. `--write` to apply |
| `s9-warnings.mjs` | Makes the warning-only inventory steps |
| `shared-helpers.mjs`, `shared-helpers-source.mjs` | Keeps repository-only helper copies visible |
| `stray.mjs` | What must never ship in a tarball. `release.mjs` and the `tarballs` step use it |
| `structure.mjs` | Inventory of structure warnings |
| `tarballs.mjs` | Nothing private goes out in a package or can be committed by accident |

</details>

## `lib/`

Shared helpers for repository scripts. Not part of any published package.

| Export | File | What it does |
| ------ | ---- | ------------ |
| `repoRoot` | `helpers.mjs` | The repository root, resolved from the module's own path, not the caller's |
| `freePort()` | `helpers.mjs` | A free TCP port |
| `median(xs)`, `upperMedian(xs)` | `helpers.mjs` | Medians for benchmark samples |
| `until(what, fn, ms = 60000)` | `helpers.mjs` | Polls every 50 ms until `fn` returns something truthy, or throws `timed out waiting for <what>` |
| `walk(dir, each, skip)` | `helpers.mjs` | Calls `each` for every file under `dir`, skipping folders `skip` names |
| `sleep(ms)`, `sleep80()` | `sleep.mjs` | Timers shared by scripts and their browser-environment tests |

## Troubleshooting

| Symptom | What to do |
| ------- | ---------- |
| `secrets did not run: gitleaks is not installed` | `brew install gitleaks`. CI runs with `--require-tools`, where this fails |
| `cargo-deny did not run` | `cargo install cargo-deny --locked`, or `brew install cargo-deny` |
| `no step called <id>` | `pnpm run check --list` shows the ids |
| `webkit FAIL: <reason>` with `--release` | WebKit can't open a page. Install Playwright's WebKit, and see [patches/](../patches) for macOS 14 |
| Test suites time out under load | Lower `--jobs`, or run on a less busy machine |
| `[release] N problem(s): nothing was published.` | Each problem is printed under its package. Fix them and run again |
| `npm publish failed` part way | Fix it and run `release.mjs --publish` again: versions already up are skipped |
| `<dir> is not empty` from `release-e2e.mjs` | Give it a new, empty folder |

## Contributing

A new check is a step in `check.mjs` with an `id`, a `covers` line and a `fix` line, plus a test in `quality/`. Run
`pnpm run check:prove` to show the new rule fails on a planted violation. See [CONTRIBUTING.md](../CONTRIBUTING.md).

## License

MIT. See [LICENSE](../LICENSE).
