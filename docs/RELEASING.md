# Releasing

Only the owner cuts a release, and a release runs on the owner's machine. The one exception is the nightly, which
CI publishes on its own after every merge (below).

## Channels

| npm tag  | What it is                                                       | Version                      | Install                   |
| -------- | ---------------------------------------------------------------- | ---------------------------- | ------------------------- |
| `latest` | The last release the owner cut, after the full release gate      | `0.1.4`                      | `npm i @weft-js/start`      |
| `next`   | Every push to `main` that passes `quality`                       | `0.1.5-nightly.20261111.12`  | `npm i @weft-js/start@next` |

Before 1.0 there is no separate stable line: `latest` is the stable one, and a release is a nightly the owner has
run the full release gate on. A minor (0.2.0) may break things; a patch (0.1.5) should not.

## Next (the nightly workflow)

[.github/workflows/nightly.yml](../.github/workflows/nightly.yml) runs each time `quality` passes on a push to `main`,
again at 09:00 UTC in case one was missed, and by hand from the Actions tab (with `force` to publish a commit again).
It picks the newest commit on `main` whose `quality` run passed, builds the compilers for every platform at that
version, and publishes all the packages under `next`. Merges that land while one is publishing wait and go out
together in the next run. Nothing new since the last publish, nothing published; the `nightly` git tag marks the last
commit that went out. Push as often as you like: publishing never holds a merge back.

It publishes by npm's trusted publishing: npm trusts that workflow file in this repo, and no token is stored. Each
package has to trust it once, from a terminal logged in to npm (`npm login --auth-type=web`):

```bash
node scripts/trust-nightly.mjs
```

A package that isn't on npm yet can't be trusted, so a new package goes out by hand once first. That's why the
nightly leaves out the `win32-arm64` compiler, as the hand release does: it has never been published, and Windows on
ARM runs the WASM build.

## Before a release

1. Make sure `main` passes the full gate: `pnpm run check --require-tools --release`, then the
   scaffold and runtime-matrix checks and the packed-install check
   (`node packages/create/scripts/packed.mjs <dir>`). Run the app builds after the check, not
   beside it: the browser tests' timings don't hold on a machine that is also building apps.
2. Set the version with `node scripts/set-version.mjs 0.1.5` (every public package, and the core's
   pins on its compilers) and commit.

## Dry run

```bash
node scripts/release.mjs
```

This builds every public package, packs it, rewrites sibling `file:` dependencies to versions,
checks each tarball and runs `npm publish --dry-run`. Nothing leaves the machine. Tarballs land in
`.release/`.

## Publish

```bash
node scripts/release.mjs --publish --otp
```

You approve the publish; one authenticator code covers every package. A publish that stops part
way is safe to run again: versions already on the registry are skipped. A prerelease version
(such as `1.0.0-rc.0`) is published under the `next` dist-tag, so `latest` stays on the last
stable version.

To rehearse against a local registry first:

```bash
node scripts/release.mjs --publish --registry http://localhost:4873/
```

## Scope

The 1.0 packages are listed in [ARCHITECTURE.md](ARCHITECTURE.md#10-package-scope). Private
packages are never published.

## Known gaps

- Warp's dashboard bundle is 52.3 KB brotli, slightly over the 50 KB target. This is accepted for
  1.0; the target is a goal, not a release gate.
- Instant navigation shows its skeleton in about 15-30 ms on 3G, but the
  layout still shifts by about 0.20 between skeleton and content. The
  target is 0; the check fails above 0.25.
- Changesets is not set up. A release's version is set with `scripts/set-version.mjs`.
