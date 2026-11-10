<p align="center">
  <a href="https://github.com/Ravonus/weft">
    <img src="https://raw.githubusercontent.com/Ravonus/weft/main/site/public/logo.svg" width="88" height="88" alt="Weft">
  </a>
</p>

<h1 align="center">Dashboard</h1>

<p align="center">
  <strong>The synthetic dashboard from <code>benchmarks/compare</code>, run through the app bench.</strong><br>
  Six stacks, client-rendered and served statically, so Warp is measured on a real bundle.
</p>

<p align="center">
  <a href="#run-it">Run it</a> ·
  <a href="#the-variants">Variants</a> ·
  <a href="#latest-numbers">Latest numbers</a> ·
  <a href="../README.md">All examples</a> ·
  <a href="../../benchmarks/compare">benchmarks/compare</a>
</p>

> [!NOTE]
> This folder is a manifest only: it holds [`app.json`](./app.json) and nothing else. Every variant points into
> [`../../benchmarks/compare`](../../benchmarks/compare), and bench reads those stack folders without changing them.
> Nothing here is published.

`benchmarks/compare` has its own harness (`measure.mjs`) for one screen across stacks. This manifest puts the same
screen through `examples/bench.mjs` as well, so it gets the app bench's Lighthouse runs, byte accounting, hydration
probe, build-freshness checks and Weft diagnosis, and so its numbers sit next to the real apps in
`../evals/results/apps.html`.

## What the app shows

One screen, described in [`benchmarks/compare/README.md`](../../benchmarks/compare/README.md): a shell (sidebar,
account menu, phone drawer) and a 200-row table with sort, filter, selection with a bulk action, paging, a column
picker, inline details and a live cell.

## The variants

Every variant has `"path": "../../benchmarks/compare"` and builds one subfolder of it through `cwd`:

| Variant | `cwd` | Install and build | Label in results |
| --- | --- | --- | --- |
| `weft-warp` | `weft-warp` | defaults; `src: ["src"]` | weft + warp |
| `weft-plain` | `weft-plain` | defaults | weft |
| `solid` | `solid-kobalte` | `npm install --legacy-peer-deps`, `npx vite build` | Solid |
| `react-radix` | `react-radix` | `npm install --legacy-peer-deps`, `npx vite build` | React |
| `react-zustand` | `react-zustand` | `npm install --legacy-peer-deps`, `npx vite build` | React + Zustand |
| `react-mui` | `react-mui` | `npm install --legacy-peer-deps`, `npx vite build` | React + MUI |

None of them has a `start` script, so bench serves each build's `index.html` from memory with brotli and gzip through
[`../lib/serve/static-host.mjs`](../lib/serve/static-host.mjs), the way a CDN would. The Weft variants have no `build`
script either, so bench runs `npx vite build` for them too. Weft variants are installed from tarballs of this checkout,
whatever their `package.json` says.

The manifest has one page, `/`, with a hydration probe: bench clicks `[role=columnheader] button, th button` every
frame until `table, [role=grid]` changes, under a 4x CPU throttle.

## Latest numbers

From [`../results.json`](../results.json): run at 2026-10-31T19:24:16Z, commit `1174811`, 3 samples, on a 28-core host
whose peak 1-minute load was 6.56. Medians only; the spread is in the file.

| Variant | Mobile score | Mobile LCP | JS (brotli) | CSS (brotli) | Hydration |
| --- | ---: | ---: | ---: | ---: | ---: |
| weft-warp | 99 | 901 ms | 21.6 KB | 19.6 KB | 276 ms |
| weft-plain | 100 | 944 ms | 5.3 KB | 1.4 KB | 101 ms |
| solid | 100 | 751 ms | 47.4 KB | 1.4 KB | 159 ms |
| react-radix | 99 | 751 ms | 98.3 KB | 1.4 KB | 206 ms |
| react-zustand | 99 | 751 ms | 98.4 KB | 1.4 KB | 206 ms |
| react-mui | 93 | 602 ms | 239.6 KB | 0.0 KB | 774 ms |

KB is bytes / 1024 after recompressing at brotli 11. `weft-plain`, `solid` and the React + Radix and Zustand stacks share
`shared/design.css`, so their CSS matches; Warp and MUI each bring their own design system, so compare those two as
kits. `benchmarks/compare/README.md` explains that split.

## Run it

```bash
pnpm run setup                         # repo root, once
cd examples
pnpm install                           # benchmark tools only
node bench.mjs dashboard
node bench.mjs dashboard --only weft-warp,weft-plain --no-record
node bench.mjs dashboard --detect      # each variant's stack, package manager, build and start
```

To click through the stacks themselves, use `benchmarks/compare` directly:

```bash
cd benchmarks/compare
pnpm install
node serve.mjs                         # each built app on its own port, from 5401
```
