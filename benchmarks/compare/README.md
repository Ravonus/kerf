# Same dashboard, every stack

One screen: a shell (sidebar, account menu, phone drawer) and a 200-row table (sort, filter, selection with a bulk action,
paging, column picker, inline details, a live cell). One data set and plain `vite build`, with dependencies pinned by the lockfile.

| Stack           | Table                     | Overlays         | CSS                 |
| --------------- | ------------------------- | ---------------- | ------------------- |
| kerf + veneer     | veneer                      | veneer             | veneer                |
| kerf, no veneer   | hand-written              | native `popover` | `shared/design.css` |
| Solid + Kobalte | TanStack                  | Kobalte          | `shared/design.css` |
| React + Radix   | TanStack                  | Radix            | `shared/design.css` |
| React + Zustand | TanStack, data in Zustand | Radix            | `shared/design.css` |
| React + MUI     | X DataGrid                | MUI              | MUI's CSS-in-JS     |

`shared/design.css` is one hand-written sheet, so those four stacks ship the same rules: compare frameworks there. The same-CSS
stacks are the fair framework test; veneer and MUI each bring a design system, so compare them as kits.

    pnpm install         # every stack and design app, linked to this repo's packages
    node serve.mjs       # each built app on its own port, from 5401, to click through
    node measure.mjs     # size, load, parity script with DOM mutations and CPU, row scale, screen sweep

`results.json` holds the latest numbers, `../../evals/results/compare-history.jsonl` gets a line per run, and
`../../evals/results/compare.html` is rewritten from both. A stack is a folder here with a `stack.json`; `chart.html` is the page.

## Measurement and reproduction

Use Node 26 and pnpm. From the repository root, run `pnpm run setup`, verify
that the compiler binary has the matching source stamp, then run
`pnpm --filter @kerf-js/text run build`. From this directory run `pnpm install`
and `node measure.mjs`. Record the machine, OS, Chromium version, source revision
and dirty state, compiler binary and source stamp, Node and pnpm versions, and
dependency lockfile with the results. History records a commit and package dirty
state; it does not replace the rest of those pins.

Dashboard size sums Brotli quality 11 compressed JS and CSS assets; gzip level 9
is also recorded. Load uses five fresh Chromium contexts at 1280 x 800 with CDP
4x CPU throttling. Each waits for `Apollo 0`, then 300 ms. The result is the
median of each metric separately: script, style, layout and task duration, heap,
node count and first contentful paint. Fresh contexts do not make the browser
process or OS caches cold. These measurements do not establish device performance.

The parity script exercises dashboard interactions and checks their visible
results. Scale uses 20, 100 and 200 rows; the screen sweep builds 1, 10, 50 and
200 screens. The long-list and design audits below cover different scenarios.
Scoped S5 local candidate measurements are not the combined Yuna canonical run
or proof of runtime speed. See the [keyed benchmark](../js-framework-benchmark/README.md)
for its pinned upstream workload and validation limits; it is not a submitted
upstream comparison result.

## The long list

`feed/` in each stack is a second page, so it doesn't touch the dashboard's numbers: 10,000 rows of wrapped text
(`shared/feed.ts`, `shared/feed.css`) on the stack's usual virtualiser. veneer uses `VirtualList` with exact heights from
`text.measure`; kerf without veneer uses `@kerf-js/veneer-core`'s `virtualizer`, measuring rows as they render; Solid, React + Radix and
React + Zustand use TanStack Virtual with `measureElement`; MUI uses react-virtuoso. The script scrolls 120 px a frame down and
then up, and reads back how far each on-screen row moved. Anything but 120 is a visible jump. It also jumps to row 7,777.

## One brief, built by an agent

`design/` holds the apps a fresh agent built from one brief (`../../evals/gates/ds-exit.mjs`, Phase 4's exit check): the same three screens on
each stack, in that stack's usual kit, plus kerf on raw Tailwind. Git retains the original agent output. The React + MUI
Customers and Pricing files now move parts of their JSX into local functions; the rendered screens and interactions stay the
same. `measure.mjs`
rebuilds and re-audits them (`design/audit.mjs`: axe, focus, reflow, distinct computed values and role drift, read only from the
page in Chromium) when `pnpm install` has run here, so a change to veneer shows up here. It can't see
whether a page looks good.

## The rule

A new eval scenario, benchmark or size or speed claim gets built in every stack here, not only kerf. Changes to kerf's
compiler or runtime, veneer or veneer-core end with a `node measure.mjs` run, and its history line and chart are committed with the
change. To add a stack, add a folder; to add a scenario, add it to every folder and to the script in `measure.mjs`.

## Reading DOM changes

The count is a MutationObserver on the whole document: every node added or removed and every attribute and text change. It
can't see property writes (`input.value`, `checked`), shadow roots or CSSOM, and one `<style>` edit counts once however many
cells it restyles. So read it with the CPU ms beside it, and each step also asserts the page shows the right result. Run `pnpm install` here first (one install covers every stack).

kerf without veneer has no menu keyboard handling (arrow keys, typeahead) or focus trap beyond what native `popover` gives, where
Radix and Kobalte add them, and it has no headless table library in its bundle. veneer also keeps a phone sort bar and closed
menus mounted, which the others don't. MUI's community DataGrid has no detail panel, so details open under the grid.

## Historical size attribution

Use an owned output directory for the pinned October 31 to November 3 audit:

```bash
node history-bisect.mjs --out /tmp/kerf-history-audit
node --test history-bisect.test.mjs
```

The script reads Git and archived six-stack vectors. It preserves missing stacks,
dirty receipts, unresolved source objects and necessary merge-parent bridges. Its
source-byte deltas describe Git inputs, not compressed bundle contributions. The
JSON includes exact compiler source stamps and dependency manifests for each pin.
It does not build historical apps with the current compiler or dependency links.
Add `--require-artifacts` to fail when a pinned compiler stamp is unavailable;
repeat `--artifacts /path/to/native` to inspect specific existing caches. No source,
artifact or dependency is changed. Fresh performance and size measurements still
use `measure.mjs` with a coherent source/compiler/install combination.
