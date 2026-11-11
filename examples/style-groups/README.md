<p align="center">
  <a href="https://github.com/Ravonus/kerf">
    <img src="https://raw.githubusercontent.com/Ravonus/kerf/main/site/public/logo.svg" width="88" height="88" alt="Kerf">
  </a>
</p>

<h1 align="center">style-groups</h1>

<p align="center">
  <strong>A small shop written with style groups from <code>@kerf/core/style</code>.</strong><br>
  It is the source fixture for core's style and SSR round-trip tests, not an app you start.
</p>

<p align="center">
  <a href="#what-it-shows">What it shows</a> ·
  <a href="#how-a-group-reads">How a group reads</a> ·
  <a href="#run-the-tests-that-use-it">Tests</a> ·
  <a href="../README.md">All examples</a> ·
  <a href="../../docs/decisions/styles.md">Style decision</a>
</p>

> [!NOTE]
> Source only, not a published package and not a benchmark app. The folder holds `src/` and nothing else: no
> `package.json`, no entry point and no `app.json`, so `bench.mjs --all` skips it.

Style groups give a repeated style a name, with its variations declared up front, instead of a list of generated
classes at every use. The compiler lowers each use to attributes, emits CSS only for the values those uses can produce,
and a reactive change becomes a single attribute write. This folder is a realistic set of components written that way,
so the tests that check those claims run on code that looks like an app, not on toy snippets. See
[`docs/decisions/styles.md`](../../docs/decisions/styles.md) for the decision behind it.

## What it shows

A grocery shop with a Products tab and a Cart tab:

| File | What's in it | Groups |
| --- | --- | --- |
| `src/App.tsx` | The page: loads products, subscribes to price updates, keeps the cart, switches tabs. | `shop` |
| `src/components/Header.tsx` | The top bar with the two tabs and the cart count. | `topBar`, `tabButton` |
| `src/components/ProductList.tsx` | Search, category and sort filters over the list. | `catalog` |
| `src/components/ProductRow.tsx` | One product with its price and stock level (in, low, out). | `productRow` |
| `src/components/CartView.tsx` | Cart lines with quantity steppers and a total. | `cartView`, `cartLine` |
| `src/ui.tsx` | Shared controls: a button with solid and ghost emphasis, a labelled field, an input. | `action`, `field`, `input` |
| `src/api.ts` | `createFakeApi()`: six products (fruit, bakery, dairy) after 300 ms, and a random price change every 3 s. | |
| `src/format.ts` | Money formatting. | |

State is plain Kerf: `state`, `derived` and `watch` from `@kerf/core`.

## How a group reads

From [`src/ui.tsx`](./src/ui.tsx):

```tsx
import { group } from '@kerf/core/style'

/** A button. Solid for the main action of a row, ghost for small steppers. */
export const action = group('action', {
  base: {
    layout: 'inline',
    justify: 'center',
    control: 'sm',
    padInline: 'control',
    radius: 'control',
    text: 'button',
    tone: 'accent',
    cursor: 'pointer',
    border: 'none',
  },
  axes: {
    emphasis: { solid: { emphasis: 'solid' }, ghost: { emphasis: 'ghost', border: 'tone' } },
  },
  states: { hover: { emphasis: 'strong' }, disabled: { fade: 'half', cursor: 'blocked' } },
  defaults: { emphasis: 'solid' },
})
```

| Key | What it holds |
| --- | --- |
| `base` | Styles every use gets, by intent (`pad: 'page'`, `ink: 'subtle'`), not raw values. |
| `axes` | Named variations, such as `emphasis` or a product row's `stock: { in, low, out }`. |
| `states` | Interaction and boolean states, such as `hover`, `disabled` or a tab's `pressed`. |
| `parts` | Named children styled as part of the group, such as `topBar.tabs` or `shop.notice`. |
| `defaults` | The axis value used when a call leaves it out. |

A use spreads the group onto an element, from [`src/components/Header.tsx`](./src/components/Header.tsx):

```tsx
<header {...topBar()}>
  <nav {...topBar.tabs}>
    <button {...tabButton({ pressed: tab === 'products' })} onClick={() => onTab('products')}>
      Products
```

## Run the tests that use it

The fixture [`packages/core/test/fixtures/ssr/GroupShop.tsx`](../../packages/core/test/fixtures/ssr/GroupShop.tsx)
imports `Header`, `ProductList` and `CartView` from here, and
[`packages/core/test/style.test.tsx`](../../packages/core/test/style.test.tsx) renders it on the server and hydrates
it. Among other things, that test checks that the server writes the group attributes, that hydration claims them with
0 writes and 0 misses, and that after hydration an axis change is one attribute write.

```bash
pnpm run setup                         # repo root, once
cd packages/core
pnpm exec vitest run test/style.test.tsx
```

`pnpm --filter @kerf/core test` runs the whole core suite, this file included.
