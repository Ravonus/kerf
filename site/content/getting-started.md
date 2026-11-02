# Getting started

This page takes you from an empty folder to a running weft app, then has you change it. You'll need Node 26 and npm.
Once weft is published, Bun or Deno can take Node's place: the CLI, `weft dev` and `weft build` all run on either one, with no
Node installed.

Rust isn't needed to use weft. The compiler comes with it as WebAssembly, which runs anywhere, and a native addon for your
platform installs by itself and makes builds faster. Rust only comes in if you choose to write [Rust sidecars](/docs/rust).

weft isn't on npm yet, so for now the commands below run from a checkout of the repo, and building that checkout's compiler
does take Rust (`cargo`). Once weft is published, `npm create @weft-js` will replace the first two steps and no Rust is involved.

## 1. Get the repo

```bash
git clone https://github.com/Ravonus/weft.git
```

## 2. Create an app

Run this from the folder that holds `weft`. It builds what it needs, packs each package and creates `my-app` beside the repo.

```bash
node weft/packages/create-weft/scripts/local.mjs new my-app --yes --db none
```

`--db none` leaves out the database so there's nothing to set up. Leave off `--yes` to choose a database, a UI kit and more.

## 3. Start it

```bash
cd my-app
npx weft dev
```

Open the address it prints. You'll see a card with a button that counts your clicks.

## 4. Change something

Open `src/routes/index.tsx`. Add `derived` to the import from `@weft-js/core`, and work out a new value under `count`:

```tsx
const count = state(0)
const doubled = derived(() => count.value * 2)
```

Show it above the button:

```tsx
<p>Doubled: {doubled.value}</p>
```

Save, and the page updates. Click the button and both numbers change. You didn't tell `doubled` what to watch: it read
`count`, so it follows `count`.

## 5. Check and build

```bash
npx weft check
npx weft build
```

`weft check` reads the whole app and reports mistakes with a code and a fix. `weft build` makes the production build.

## Where to next

Read [The rules](/docs/rules) next. There are nine, and they cover how every component behaves. To see more first, the
[examples](/examples) each show running code beside its source.
