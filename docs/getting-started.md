# Getting started on this machine

weft isn't published, so `packages/create-weft/scripts/local.mjs` uses a checkout from any folder: it builds what's stale, packs every package into `~/.weft/local` (`WEFT_LOCAL_DIR` moves
it), and points an app at those tarballs. The app gets what a consumer would get, not workspace links.

You need Node 26, Rust (cargo) and npm here, because a checkout builds its own compiler. An app doesn't need Rust: an install
gets the WASM compiler, plus a native addon where one fits (`weft doctor` says which is running). Other package managers
aren't supported here. Set this once, in `~/.zshrc`:

```bash
alias weft-local='npm_config_min_release_age=3 node ~/dev/weft/packages/create-weft/scripts/local.mjs'
```

`min-release-age` is in days. `~/.npmrc` has `4320`, which is about twelve years, so without this setting npm finds nothing to
install. To fix that everywhere, set `min-release-age=3` in `~/.npmrc` and drop the prefix.

## A new app

```bash
weft-local new my-app --yes
```

It takes the same flags as `create-weft`, such as `--ui tailwind --db postgres --layer prisma`. Without `--yes` it asks. Then:

```bash
cd my-app
npx weft db generate
npx weft dev
```

Skip `weft db generate` with `--db none`. `npx weft build` makes the production build.

## After changing weft

From the app:

```bash
weft-local refresh
```

This rebuilds the compiler if the crate changed, rebuilds `@weft/text-engine`, repacks, and replaces the weft packages in that
app. Pass a path to run it from elsewhere. Restart `weft dev` afterwards. The same command moves an existing app that
depends on `weft` onto the tarballs.

Other apps keep what they have installed until you refresh them. The store holds one set of tarballs, though, so a clean
install in any app takes whichever checkout packed last. `weft-local pack` updates the store and touches no app.

## What it changes in an app

`package.json` gets absolute `file:` paths to the tarballs, and `overrides` for all of them, so these apps only install on
this machine. `weft add` works as usual and adds the tarball for anything in the store.
