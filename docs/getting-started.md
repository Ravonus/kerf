# Using a Kerf checkout in your apps

An app made with `npm create kerf` uses the released packages. To try changes you've made to Kerf itself, or the
add-ons that aren't released yet, `packages/create-kerf/scripts/local.mjs` lets any app on your machine use a checkout of
this repo instead. It builds what's stale, packs every package as a tarball and points the app at those tarballs, so the app gets
what a consumer would get, not workspace links.

This page is for working on Kerf. For a first app, use `npm create kerf` and follow
[Installation](../site/content/learn/installation.md).

## What you need

- Node 24 or later, and npm. Other package managers aren't supported here.
- Rust (`cargo`), because a checkout builds its own compiler. An app doesn't need Rust: it gets the WASM compiler, plus a
  native addon where one fits. `npx kerf doctor` says which one is running.

An alias saves typing. Put it in your shell's startup file, with the path to your checkout:

```bash
alias kerf-local='node ~/path/to/kerf/packages/'\
'create-kerf/scripts/local.mjs'
```

If your `~/.npmrc` sets `min-release-age`, npm skips packages newer than that many days, which can leave it nothing to
install. Prefix the alias with `npm_config_min_release_age=3`, or lower the setting.

## A new app

```bash
kerf-local new my-app --yes
```

It takes the same flags as `npm create kerf`, such as `--ui tailwind --db postgres --layer prisma`. Without `--yes` it
asks. Then:

```bash
cd my-app
npx kerf db generate
npx kerf dev
```

Skip `kerf db generate` if you made the app with `--db none`. `npx kerf build` makes the production build.

## After changing Kerf

From the app:

```bash
kerf-local refresh
```

This rebuilds the compiler if the crate changed, rebuilds `@kerf-js/text/engine`, repacks, and puts the new tarballs in the
app. Pass a path to refresh an app from elsewhere. Restart `kerf dev` afterwards. `refresh --packed` installs the tarballs
already in the store without packing again.

Other apps keep what they have installed until you refresh them. The store holds one set of tarballs, though, so a clean
install in any app takes whichever checkout packed last. `kerf-local pack` updates the store and touches no app.

The store is `~/.kerf/local`. Set `KERF_LOCAL_DIR` to move it.

## What it changes in an app

`package.json` gets absolute `file:` paths to the tarballs, and `overrides` for all of them, so these apps only install on
this machine. `kerf add` works as usual and adds the tarball for anything in the store.
