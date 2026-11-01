# Getting started

This page takes you from an empty folder to a running weft app, then has you change it. You'll need Node 26, Rust (`cargo`)
and npm.

weft isn't on npm yet, so the commands below run from a checkout of the repo. Rust is there because the compiler is built on
your machine. Once weft is published, `npm create weft` will replace the first two steps.

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

Open `src/routes/index.tsx`. Add `derived` to the import from `weft`, and work out a new value under `count`:

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
