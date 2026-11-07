# Releasing

Only the owner publishes. Publishing runs on the owner's machine, never in CI.

## Before a release

1. Make sure `main` passes the full gate: `pnpm run check --require-tools --release`, then the
   scaffold and runtime-matrix checks and the packed-install check
   (`node packages/create/scripts/packed.mjs <dir>`). Run the app builds after the check, not
   beside it: the browser tests' timings don't hold on a machine that is also building apps.
2. Set the version in each public package's `package.json` (for the first release candidate,
   `1.0.0-rc.0`) and commit.

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

- warp's dashboard bundle is 52.3 KB brotli, slightly over the 50 KB target. This is accepted for
  1.0; the target is a goal, not a release gate.
- Instant navigation shows its skeleton in about 15-30 ms on 3G, but the
  layout still shifts by about 0.20 between skeleton and content. The
  target is 0; the check fails above 0.25.
- `--release` runs WebKit only where it can open a page, and prints `webkit skipped: <reason>`
  where it can't. Playwright's WebKit for macOS 14 can't be driven by the current
  playwright-core, so Safari coverage needs a macOS 15 or later machine.
- Changesets is not set up. Versions are set by hand before each release.
