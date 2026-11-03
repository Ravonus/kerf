# Using a weft checkout in your apps

weft isn't on npm yet. Until it is, `packages/create-weft/scripts/local.mjs` lets any app on your machine use a checkout of
this repo. It builds what's stale, packs every package as a tarball and points the app at those tarballs, so the app gets
what a consumer would get, not workspace links.

This page is for working on weft. For a first app, follow [Installation](../site/content/learn/installation.md).

## What you need

- Node 26 and npm. Other package managers aren't supported here.
- Rust (`cargo`), because a checkout builds its own compiler. An app doesn't need Rust: it gets the WASM compiler, plus a
  native addon where one fits. `npx weft doctor` says which one is running.

An alias saves typing. Put it in your shell's startup file, with the path to your checkout:

```bash
alias weft-local='node ~/path/to/weft/packages/create-weft/scripts/local.mjs'
```

If your `~/.npmrc` sets `min-release-age`, npm skips packages newer than that many days, which can leave it nothing to
install. Prefix the alias with `npm_config_min_release_age=3`, or lower the setting.

## A new app

```bash
weft-local new my-app --yes
```

It takes the same flags as `npm create @weft-js`, such as `--ui tailwind --db postgres --layer prisma`. Without `--yes` it
asks. Then:

```bash
cd my-app
npx weft db generate
npx weft dev
```

Skip `weft db generate` if you made the app with `--db none`. `npx weft build` makes the production build.

## After changing weft

From the app:

```bash
weft-local refresh
```

This rebuilds the compiler if the crate changed, rebuilds `@weft-js/text/engine`, repacks, and puts the new tarballs in the
app. Pass a path to refresh an app from elsewhere. Restart `weft dev` afterwards. `refresh --packed` installs the tarballs
already in the store without packing again.

Other apps keep what they have installed until you refresh them. The store holds one set of tarballs, though, so a clean
install in any app takes whichever checkout packed last. `weft-local pack` updates the store and touches no app.

The store is `~/.weft/local`. Set `WEFT_LOCAL_DIR` to move it.

## What it changes in an app

`package.json` gets absolute `file:` paths to the tarballs, and `overrides` for all of them, so these apps only install on
this machine. `weft add` works as usual and adds the tarball for anything in the store.
