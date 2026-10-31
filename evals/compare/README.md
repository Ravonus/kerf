# Same dashboard, every stack

One screen: a shell (sidebar, account menu, phone drawer) and a 200-row table (sort, filter, selection with a bulk action,
paging, column picker, inline details, a live cell). One data set, latest stable versions, plain `vite build`.

| Stack | Table | Overlays | CSS |
|---|---|---|---|
| weft + warp | warp | warp | warp |
| weft, no warp | hand-written | native `popover` | `shared/design.css` |
| Solid + Kobalte | TanStack | Kobalte | `shared/design.css` |
| React + Radix | TanStack | Radix | `shared/design.css` |
| React + Zustand | TanStack, data in Zustand | Radix | `shared/design.css` |
| React + MUI | X DataGrid | MUI | MUI's CSS-in-JS |

`shared/design.css` is one hand-written sheet, so those four stacks ship the same rules: compare frameworks there. The same-CSS
stacks are the fair framework test; warp and MUI each bring a design system, so compare them as kits.

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

weft without warp has no menu keyboard handling (arrow keys, typeahead) or focus trap beyond what native `popover` gives, where
Radix and Kobalte add them, and it has no headless table library in its bundle. warp also keeps a phone sort bar and closed
menus mounted, which the others don't. MUI's community DataGrid has no detail panel, so details open under the grid.
