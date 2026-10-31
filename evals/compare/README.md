# Same dashboard, four stacks

One screen built in weft + warp, Solid + Kobalte + TanStack Table + Tailwind, React + Radix + TanStack Table + Tailwind,
the same with Zustand holding the data, and React + MUI + X DataGrid: a shell (sidebar, account menu, phone drawer) and a 200-row table (sort, filter, selection
with a bulk action, paging, column picker, inline details, a live cell). One data set, latest stable versions, plain
`vite build`.

    node measure.mjs     # size, load, parity script with DOM mutations and CPU, row scale, screen sweep

`results.json` holds the latest numbers, `../results/compare-history.jsonl` gets a line per run, and
`../results/compare.html` is rewritten from both. A stack is a folder here with a `stack.json`; `chart.html` is the page.

## The rule

A new eval scenario, benchmark or size or speed claim gets built in every stack here, not only weft. Changes to weft's
compiler or runtime, warp or ui-core end with a `node measure.mjs` run, and its history line and chart are committed with the
change. To add a stack, add a folder; to add a scenario, add it to every folder and to the script in `measure.mjs`.

## Reading DOM changes

The count is a MutationObserver on the whole document: every node added or removed and every attribute and text change. It
can't see property writes (`input.value`, `checked`), shadow roots or CSSOM, and one `<style>` edit counts once however many
cells it restyles. So read it with the CPU ms beside it, and each step also asserts the page shows the right result. Run `npm install --legacy-peer-deps` in each stack first.

The React and Solid tables are hand-written on headless parts, so they carry less design than warp: no dials, dark theme or
phone card layout. MUI's community DataGrid has no detail panel, so details open under the grid.
