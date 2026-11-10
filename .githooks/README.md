<p align="center">
  <a href="https://github.com/Ravonus/weft">
    <img src="https://raw.githubusercontent.com/Ravonus/weft/main/site/public/logo.svg" width="88" height="88" alt="Weft">
  </a>
</p>

<h1 align="center">.githooks</h1>

<p align="center">
  <strong>An optional pre-commit hook that runs the few checks that take seconds, on staged files only.</strong><br>
  Off by default. CI runs the full check either way.
</p>

<p align="center">
  <a href="../CONTRIBUTING.md">Contributing</a> ·
  <a href="../scripts">Scripts</a> ·
  <a href="../.github">.github</a>
</p>

> [!NOTE]
> This folder is repository tooling. Nothing here ships in a package, and git ignores it until you turn it on.

The full gate is `pnpm run check` (see [scripts/](../scripts)). It takes minutes. This hook catches the cheap mistakes
(a lint error, unformatted Rust, a committed secret) before they reach a commit, in a few seconds.

## Highlights

- **Staged files only.** It reads `git diff --cached --name-only --diff-filter=ACMR`, and exits at once when nothing is staged.
- **Lint for JS and TS.** Staged `.ts`, `.tsx`, `.mts`, `.cts`, `.mjs`, `.cjs` and `.js` files under `packages/`,
  `scripts/` or `site/` go through `oxlint --quiet --deny-warnings`.
- **Rust formatting.** If any staged file is a `.rs` file under `crates/`, it runs `cargo fmt --check` in
  `crates/weft-compiler`, `crates/weft-layout` and `crates/weft`.
- **Secrets.** If `gitleaks` is on your `PATH`, it scans the staged changes with the repo's `.gitleaks.toml`, redacted.
  If gitleaks isn't installed, this step is skipped.
- **Fails fast.** The script runs under `set -e`, so the first failing step stops the commit.

## Turn it on

The root `package.json` has a script that points git at this folder:

```sh
pnpm run hooks
```

That runs `git config core.hooksPath .githooks`. To turn it off again:

```sh
git config --unset core.hooksPath
```

> [!TIP]
> The comment at the top of `pre-commit` says `npm run hooks`. The repo is a pnpm workspace, so use `pnpm run hooks`;
> both run the same `git config` line.

## What it needs

| Tool      | Needed for                 | Where it comes from                                         |
| --------- | -------------------------- | ----------------------------------------------------------- |
| `oxlint`  | the JS/TS lint             | `node_modules/.bin/oxlint`, installed by `pnpm run setup`   |
| `cargo`   | `cargo fmt --check`        | rustup; each crate's `rust-toolchain.toml` picks the version |
| `gitleaks`| the secret scan (optional) | `brew install gitleaks`, or a release from GitHub           |

Run `pnpm run setup` once after cloning so `node_modules/.bin/oxlint` exists. Without it, any commit that stages a
matching JS/TS file fails.

## Hook versus full check

| Check                  | pre-commit hook                | `pnpm run check`                          |
| ---------------------- | ------------------------------ | ----------------------------------------- |
| Oxlint                 | staged files, without type-aware rules | every lint path, `--type-aware`   |
| Rust formatting        | `cargo fmt --check` per crate  | `rust-fmt` step on all tracked Rust files |
| Secrets                | `gitleaks git --staged`        | `secrets` step, `gitleaks dir .`          |
| Types, tests, Clippy, lengths, audits | no              | yes                                       |

## Troubleshooting

- **`node_modules/.bin/oxlint: not found`.** Run `pnpm run setup` (or `pnpm install`) at the repo root.
- **A lint failure you want to fix by machine.** `pnpm run fix` applies Oxlint's and Clippy's safe fixes and formats.
- **gitleaks flags a fixture.** Add the path to `.gitleaks.toml` with a reason, as the `secrets` step's fix line says.
  If the secret is real, rotate it first.
- **You need to commit past it once.** `git commit --no-verify` skips the hook. CI still runs every check.

## License

MIT. See [LICENSE](../LICENSE).
