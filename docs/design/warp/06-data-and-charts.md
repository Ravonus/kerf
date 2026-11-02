# warp 06 · Data display and charts

Tables, collections, stats and charts for warp. Tokens live in `tokens/warp-data.css`, which loads after `warp.css`.
The specimen is `specimens/data.html`, sections 01–11. Every row that `COVERAGE.md` assigns to **data** has a section
here and a demo there. §15 maps each row to both.

## 1. Principles

1. **Semantic first.** A read-only table is a `<table>`. `role="grid"` is used only once cells are edited, selected
   as ranges or copied. A chart is SVG with a table view and a one-sentence summary.
2. **Identity is the performance model.** Rows, cards and marks are keyed. Sort, page, filter, group, reorder and
   kanban moves *move* nodes and never rebuild them. A live price tick costs **one text write plus one attribute
   write** (the specimen's MutationObserver counts it), which meets PLAN §3.7's "price push ≤ 1 row touched".
3. **One interaction model for every chart.** One tab stop. ←/→ walk x, ↑/↓ change series, Home/End jump to the ends.
   The tooltip follows hover, tap-and-drag and keyboard focus.
4. **The dial changes finish, never information.** Quiet is flat hairlines, a sans numeral and no motion (Bloomberg
   clarity). Balanced fades in. Vivid draws in once, with washes, a display numeral and serif annotations. The
   numbers, labels and order stay the same at every stop.
5. **The sweep is the signature (SIGNATURE.md).** Fields (the table filter, the resource form) and controls (outline
   and solid buttons, checkboxes) sweep at every stop and rest on the ink base, so sweep vs base is ≥ 3:1 (measured
   3.03–3.16 on outline buttons, light and dark, all stops). Surfaces (panels, stat rows, KPI tiles, cards, kanban
   cards, graph nodes) are gated by `--warp-sweep-surfaces`, as SIGNATURE §3 says: they sweep by default only at vivid
   or with `data-flair="sweep"`, even when they are links or draggable. At quiet and balanced their hover and focus
   feedback is the fill change and the focus ring. They rest on the hairline (`--warp-color-sweep-base: border`), the
   surfaces exception. Exit always travels off to the right; the shared phase machine (`specimens/warp-sweep.js`)
   reads its duration from `[data-part="sweep"]`, never the base.
   - **Gate variable.** `--_on` is the sweep gate and is a number. Tone ink in a specimen or component uses its own
     name (`--_ink-on`); a colour in `--_on` silently turned every gate on (the data specimen did this until v0.2).

## 2. Implementation basis

| Option | Cost (brotli) | Verdict |
|---|---|---|
| **Hand-rolled SVG plus own math** (linear, band and time scales, nice ticks, monotone cubic, arcs, stack, squarify, label window) | ≈ 3–4 KB for the core, ≈ 1 KB per extra form | **Chosen.** Ships as an opt-in `@weft/charts` pack, so the shop app's ≤ 10 KB budget is untouched |
| d3-scale + d3-shape | 12–15 KB (pulls d3-array, interpolate, format, time) | Allowed as an opt-in adapter for log, time-zone or geo work |
| Chart.js / ECharts | ~65 KB / 300 KB+ | Rejected: canvas, poor a11y, and they own the DOM |
| MapLibre GL | ~200 KB | Opt-in `@weft/map` pack only. warp styles the shell, markers, clusters and popups (§13) |

Charts render through weft components that run once. A data change rewrites attributes (`d`, `cx`, `cy`) on existing
nodes. The axis domain is fixed per dataset, so a live update never makes the axis jump or shift the layout.

## 3. Tokens (warp-data.css)

**Categorical palette v0.2.** This proposes replacing `warp.css` data-1..8. It keeps the foundation families
(blue · amber · magenta · olive · cyan · red-orange · violet · teal) and re-steps lightness so neighbours differ in L.
Each colour is written as `light-dark(oklch(L min(C·tk, cap) h), …)`. Light/balanced hex values: `#136df6 #c67603
#ca2390 #829203 #0394bd #d74b02 #9153ec #038e67`.

- **Validation** (Machado CVD in OKLab, ΔE×100): adjacent pairs ≥ 15.8 for protan and deutan (target 8), ≥ 21 for
  normal vision (floor 15). Every mark is ≥ 3:1 on page, surface, raised and sunken, in both themes at all three
  stops: 792 checks, 0 failures, minimum 3.20. All-pairs CVD separation cannot hold for 8 hues, so scatter and bubble
  add shape, and a 9th series folds into `--warp-color-data-other`.
- **Sequential:** `--warp-color-data-seq-0..5`, the accent mixed with the surface. **Diverging:** `div-neg` (critical
  family) ↔ `div-mid` (neutral) ↔ `div-pos` (info family). Status colours are never series colours.
- **Polarity:** `--warp-color-data-up/down` plus `*-flash`. Direction always carries a shape (▲/▼, hollow vs filled
  candle, hatched tracker day) and a sign.
- **Per stop:** `--warp-data-line` (1.5 / 1.75 / 2px), `--warp-data-area` (0 / .14 / .34 wash),
  `--warp-data-num-font` (sans / display / display), `--warp-data-draw/rise/fade` (enter amounts), and
  `--warp-data-enter/tween/flash` (durations × motion scale).
- **Table:** `--warp-table-row` (36 · 40 · 44 by density; 44 on coarse pointers), `--warp-table-pad-x`,
  `--warp-table-head`.
- **Private colour hook:** marks read `--_dc` (data colour). `--_c` is taken by the foundation chroma token, which is
  why the colour hook is not called `--_c`.

## 4. Motion

| Stop | Enter | Live update | Flash |
|---|---|---|---|
| quiet | none | value swaps in place | 1 frame of tint, no movement |
| balanced | 280 ms fade and rise | tween at `--warp-duration-base` | 900 ms tint |
| vivid | lines and arcs draw in, bars grow from the baseline, staggered. Runs **once, on first view**, up to 2 × slow (a documented exception) | same | same |

Enter waits for IntersectionObserver (`data-enter="wait"` → `run`) and is then removed, so a resize redraw never
replays it. A flash alternates two animation names (`up`/`up2`, `down`/`down2`), so one attribute write replays it.

**Reduced motion** (the OS setting unless the app sets `data-motion="full"`, or `data-motion="reduce"`; both selectors
carry the same rules):
- every chart enter becomes one 120 ms fade to its end state, played once (`animation-iteration-count: 1`);
- nothing loops: skeletons (`[data-part="skeleton"]`, tables, charts and lists alike) are a static sunken block, and
  live graph edges are a static dash. A loop is never "slowed down" by dividing by the motion scale;
- a chart point's radius snaps instead of growing;
- the cell flash stays: it is a colour fade, not movement.

**The dial switch costs one frame.** Changing the dial redraws only the charts in or near view (IntersectionObserver,
300px margin). Charts off screen are marked dirty and redraw when they scroll near, or one per idle slice
(`requestIdleCallback`). Token reads that charts need (`--warp-radius-mark` in px) are cached per dial state, because
each probe forces a style recalc between two chart draws. A theme change redraws nothing: every mark paints with
`var(--warp-color-*)`. The specimen wraps the attribute flip in a View Transition crossfade when motion is on.
Measured on the data specimen at 1280: a 150–185 ms long task before, no task over 50 ms after.

## 5. Table (`<Table>`)

**Anatomy.** `table[data-scope] > toolbar (filter field, count, spacer, actions) · bulk · sortbar (phone) · viewport
> table > caption, thead > th[data-part=sort|resize], tbody > tr > td[data-part=select|expand], tr[data-part=detail]
· footer (range + PaginationBar) · sheet (tablet detail)`.

**States.** ready · loading (skeleton rows, `aria-busy`) · empty (with or without a query) · error (`role="alert"`
with Retry). The frame keeps its height. Rows are idle, hover, `data-selected`, `aria-expanded` or editing.

**Features.**
- **Sort:** `aria-sort` sits on the `th`, and the button inside it is the target.
- **Filter:** the floating-border field with the sweep. Its label is a real `<label for>` (never `aria-hidden`, no
  `aria-label` on the input). The per-character tint copy sits in an `aria-hidden` span next to one visually hidden
  text node, so the accessible name is the plain label. The specimen bar's Fields control flips every field to
  `classic`.
- **Column visibility:** a disclosure (`button[aria-expanded][aria-controls]` → `role="group"` of checkboxes, not
  a menu, so no `aria-haspopup`), driven by one per-instance stylesheet, so no rows re-render. Opening moves focus to
  the first checkbox; Escape closes it and returns focus to the button; tabbing out closes it.
- **Resize:** `role="separator"`, dragged or moved with ←/→ in 16px steps.
- **Pin:** sticky `data-pinned` cells with a measured `--_pin-x`. A shadow appears only once the table is scrolled.
- **Selection:** sweep checkboxes, a tri-state header (`aria-checked="mixed"`), Shift-click ranges, and a bulk bar
  (§6).
- **Expand:** a sibling detail `<tr>` with `aria-controls`.
- **Inline edit:** Enter, F2 or double-click. Enter commits and Escape cancels.
- **Virtualisation:** above ~200 rows, swap to §9.
- **Live cells** (§7).

**Phone, tablet, desktop.** The table queries its own container.
- **≥ 1000px:** every column shows, and rows slide open in place (under reduced motion, at once).
- **600–999px:** `data-priority="3"` columns hide, and rows slide open in place. `details="sheet"` opens a detail
  **sheet** instead (`role="dialog"`, Escape closes it and returns focus).
- **< 600px:** rows slide open under their card. The layout depends on the use case, which the author declares.
  - `data-phone="cards"` is for **entity lists**. The same `<table>` becomes stacked cards: cells are labelled by
    `data-label`, `data-card="title|badge|hide"` places them, a sort bar replaces the headers, and the explicit ARIA
    table roles survive the display change.
  - `data-phone="columns"` is for **comparison tables** (prices, pivots). Columns drop by priority, because values are
    read down a column.

**A11y (APG table).** A caption is required (D010 otherwise). Row headers use `role="rowheader"`. Selection lives on
the checkbox, not on `aria-selected`.

```ts
<Table rows={projects.list.live()} key="id" phone="cards" density="cozy"
  sort={sort} onSortChange={(s) => sort(s)} selection={sel} onSelectionChange={...}
  page={{ size: 25, cursor }} onPageChange={(c, reason) => ...} expand={(r) => <Detail row={r} />}>
  <Table.Column id="name" header="Project" pin rowHeader card="title" sort />
  <Table.Column id="budget" header="Budget" numeric priority={2} edit={money} validate={(v) => v > 0 || "…"} />
</Table>
```

`rows` accepts `T[]`, `State<T[]>` or `Resource<ListPage<T>>` (the V2 envelope, by cursor or page). **LiveTable** is
`<Table rows={x.list.live(...)}>`: SSR renders the first page, and hydration adopts those rows by key. Realtime
invalidation patches cells in place. A row is re-created only when it is genuinely added.

## 6. Grid at scale (`<DataGrid>`, specimen 08)

The same parts as `Table`, plus `role="grid"` (or `treegrid` when grouped). It keeps **one tab stop**.

| Feature | Behaviour | Keys |
|---|---|---|
| Cell navigation | roving tabindex on cells | arrows, Home/End, Ctrl+Home/End |
| Range selection | `aria-selected` on cells; `aria-multiselectable` | Shift + arrows, Shift-click, Escape clears |
| Copy | the range as TSV; copied cells flash | ⌘/Ctrl + C |
| Paste (pack) | TSV into the range, validated per column, one undo step | ⌘/Ctrl + V |
| Inline edit + validation | `aria-invalid`, a described error, `data-invalid` underline; an invalid value never commits | Enter, F2, Escape |
| Column reorder | headers are draggable; a 2px accent drop line | Alt + ←/→ on a header, announced |
| Per-column filters | a filter row (contains, select or ≥ by type) mirrored as **applied-filter chips** with "Clear all" | — |
| Group + aggregate | `tr[data-part=group]` with count and subtotal, collapsible (`aria-expanded`, `aria-level`); the footer `aggregate` row covers the visible rows | Enter or Space on a group row |
| Tree data | `role="treegrid"`, rows at `aria-level` with `aria-setsize` / `aria-posinset`; parents roll up their descendants; children load lazily ([below](#tree-data)) | APG treegrid: → / ← open, close, climb |
| Master/detail | the detail `<tr>` from §5 | — |
| Saved views | `{order, hidden, filters, sort, group}` snapshots in a select, plus "Save view" | — |
| Export | CSV of the visible rows in the visible column order (XLSX through the pack) | — |
| Bulk action bar | appears on selection (inverse surface, `role="region"`), counts, and holds actions | — |
| Pivot | rows × columns × measure (sum or count) with a heat cell (`td[data-heat]`, `--v`) and totals | — |

### Tree data

`<DataGrid tree={{ children: (row) => row.kids ?? load(row.id), rollup }}>` renders hierarchical rows (an org →
team → project budget, a file system with sizes, a bill of materials) as an [APG treegrid](https://www.w3.org/WAI/ARIA/apg/patterns/treegrid/).
Demo: `data.html#treedata`.

- **Structure.** `table[role=treegrid]` (named by its caption, described by the key hint) > `tbody` >
  `tr[role=row][aria-level][aria-setsize][aria-posinset]`, plus `aria-expanded` on parents only. The first cell is
  `th[role=rowheader][data-part=tree-cell]` and holds the toggle and the name. The rest are `td[role=gridcell]`.
  `aria-setsize` and `aria-posinset` count the **visible** siblings, so they stay honest while filtered.
- **Identity.** Rows are keyed (`id → tr`). Expanding inserts the children after their parent, and collapsing removes
  the descendants (they are not in the DOM, so they aren't in the accessibility tree). The update reconciles: rows that
  leave are removed first, then rows that arrive are inserted, so a row that stays is never moved. Moving a node blurs
  it, and the focused row has to keep focus through its own expand.
- **Roll-up.** A parent shows its descendants' aggregate in the subtle ink, so leaf values read first: budget is a
  sum, used % is budget-weighted, projects is a leaf count. For an unloaded branch the server sends the aggregate with
  the row (`rollup`), so the numbers are right before the children exist.
- **Lazy children.** The first expand of a branch with no children loaded sets `aria-busy="true"` on its row and
  inserts one loading row at the child level (a skeleton, which is static under reduced motion). The children replace
  it, and a polite status announces "Observability expanded, 3 rows loaded". Focus stays on the parent row.
- **Filter.** The floating-border filter field keeps each match plus its ancestors. An ancestor shown only for context
  is `data-context` (subtle ink). Ancestors of matches open for the duration of the query, and a branch the user closes
  stays closed until the query changes. Matches get `mark[data-part=hit]`. Unloaded branches are filtered on the server
  (the query goes to `children`).
- **Look.** Each level indents by `--warp-table-indent` (24px toggle + `space.related`, density-scaled). The dial sets
  the guides: quiet has none (`--warp-table-tree-guides: 0`), balanced draws a hairline through each ancestor's
  toggle, and vivid tints the guides and the row's leading edge in the top-level branch's series colour
  (`--warp-table-tree-tint: 1`, `--_bc`). The chevron turns 90° on open and mirrors under `:dir(rtl)`. Revealed
  children rise into place in order (`warp-tree-in`, distance and stagger × motion-scale, a 120ms fade under reduced
  motion).
- **Pointer.** The 24px chevron toggles (its `::after` reaches `hit-min` on a coarse pointer, inside the 44px row).
  A click elsewhere focuses that row's cell, and a double-click toggles. Expand all and Collapse all sit in the toolbar.
- **Forced colours.** The focused row gets a real `Highlight` outline (the cell box-shadow ring is dropped there),
  guides are `GrayText`, and context rows are `GrayText`.

**Keys** (APG treegrid; one tab stop, roving over rows *and* cells; ← and → swap under `dir="rtl"`):

| Key | Row focused | Cell focused |
|---|---|---|
| → | closed parent: open it; open parent or leaf: focus its first cell | next cell (stops at the last) |
| ← | open parent: close it; closed parent or leaf: focus the parent row | previous cell; first cell: back to the row |
| ↓ / ↑ | next / previous visible row | same column, next / previous row |
| Home / End | first / last row | first / last cell in the row |
| Ctrl + Home / End | first / last row | first / last row, same column |
| PageDown / PageUp | 5 rows | 5 rows, same column |
| Enter (or Space) | toggle the row | on the first cell: toggle the row |

**ScrollableGrid** (`<ScrollGrid>`) is the two-axis primitive: a sticky header row and column, both axes virtualised.
It follows the APG data grid, read-only:
- **Structure.** `role="grid"` (the scroller, `aria-rowcount`, `aria-colcount`, `aria-readonly`) >
  `role="row"` (`aria-rowindex`) > `columnheader` | `rowheader` | `gridcell` (`aria-colindex`). Row 1 is the header
  row; each body row starts with its rowheader. DOM order is reading order.
- **Virtual rows.** A pool of row boxes is positioned on y and their cells on x. Only rows and columns in view exist,
  **plus the active row and its active cell** when they are scrolled away, so `aria-activedescendant` always names a
  real node. The demo holds 2,000 × 120 cells with about 100 nodes.
- **Focus.** One tab stop, the grid. `aria-activedescendant` points at the active cell's id (`<grid>-r<row>-c<col>`),
  so a screen reader reads the cell value with its row and column headers on every move. The grid's `aria-label`
  never changes. A visually hidden description lists the keys.
- **Keys.** Arrows move one cell; PageUp / PageDown one screen; Home / End the first and last column; Ctrl (⌘) +
  Home / End the first and last cell. Pointer down on a cell makes it active. The active cell is always scrolled
  clear of the sticky headers.
- **Look.** The active cell has the accent-soft fill; while the grid has focus it adds a 2px inset accent ring
  (`Highlight` outline in forced colours).
- app's ScheduleGrid composes it.

**Phone.** The grid scrolls horizontally inside its viewport with the first column pinned. Editing grids never turn
into cards.

## 7. Live updates

`data-live` cells hold a direction slot (`[data-part=dir]`, ▲/▼ drawn by CSS) and a value text node. A tick writes
the text node and `data-delta`. **`useSmoothNumber`** (exported as `smooth(state)`) tweens a number's *text* for KPIs.
It never animates price cells, where the flash already carries the change. Live regions are not used for ticks;
pausing exposes the latest values in the summary.

## 8. Pagination (`<PaginationBar>`)

- **Offset mode:** a rows-per-page select, the range ("1–25 of 2,481"), ‹ 1 … 4 5 6 … 100 ›, and Go to. Under 520px
  it shows only ‹ current ›; the range text says the rest. Uses `nav[aria-label]` and `aria-current="page"`.
- **Cursor mode** (`hasMore`, `hasPrev`, `pageIndex`, `supply?`, `totalFetched?`, matching the old props): Previous
  and Next only, plus "Showing 40 · more available".
- **Load more / infinite** (`useInfiniteScroll`): a sentinel observed with a 120px root margin, three skeleton rows
  while loading, `aria-busy` on the list, a "Load more" button that is always present as the fallback, and an end
  message.

```ts
<PaginationBar mode="offset" total={2481} page={page} size={size} onPageChange={(p) => page(p)} />
<LoadMore resource={feed} onLoad={(cursor) => feed.next(cursor)} />
```

## 9. Collections

- **List + item.** Slots: `leading` (avatar or icon), `content` (title + secondary), `trailing` (meta, badge,
  chevron). On touch, **swipe actions**: a row snaps open past 60px. The actions are real buttons placed after the row
  in DOM order, and the row slides open on focus, so keyboard users reach them.
- **Sortable list.** A handle button owns the gesture (pointer, pen or touch). Siblings slide out of the way. For
  keyboard: Space picks up, ↑/↓ move, Space drops, Escape restores. Every step is announced in a polite live region.
- **Layers panel.** A sortable list with visibility and lock toggles (`aria-pressed`). Locked layers disable their
  handle.
- **Card + card grid.** `ul > li > a[data-scope=card][data-sweep]`. The whole card is one link, and it sweeps on hover
  and focus.
- **Tree view (APG tree).** `role=tree/treeitem/group`, `aria-level/setsize/posinset`, roving focus,
  →/← expand and collapse or move to child and parent, and Enter selects. **File tree** adds type icons (data
  colours) and git status letters (M/A/D) with visually hidden text (", modified"), so status is never colour alone.
  (`aria-label` on a generic span is ignored by AT.)
- **Timeline / activity feed.** `ol` of knots, what, when and detail. A tone knot carries a shape, and new items get
  `data-new` and a polite announcement.
- **Virtual list.** A window of rows at known offsets, `contain: strict`, about 30 rows for 10,000, with
  `aria-setsize/posinset`. Heights vary: give it `text` and they're exact before render (`text.measure`), and without an
  engine rows are measured when they render. A size change above the viewport moves `scrollTop` by the same amount
  before paint, so nothing on screen moves. Measured text wraps plainly (`text-wrap: wrap`, no numeric variants): those
  are what an engine can't predict (X004). Ctrl+F finds rendered rows only. Scrolling is on the scroller, so a row
  mounting isn't an arrival: nothing animates in.
- **Description list.** `dl` grid with `dt` caption-sized and `dd` tabular. Long values wrap (`overflow-wrap: anywhere`).
- **Avatar, group, presence.** The tint is a data colour at 24% on the surface; the text is the text colour (≥ 4.5:1).
  Presence is shape-coded: ● online, ▲ away, ■ busy. The group overlaps with a surface ring and a `+n` "more" item.

```ts
<List items={people} key="id" swipe={[{ label: "Pin", tone: "info", run }, { label: "Remove", tone: "critical", run }]} />
<Sortable items={priorities} onReorder={(from, to) => ...} label={(p) => p.name} />
<Tree items={files} expanded={open} selected={sel} onSelectedChange={...} />
```

## 10. Kanban

Columns are `section > ol`; cards are `li[data-part=card][data-sweep][tabindex=0]` and sweep on hover and focus.
Each column is a window, so a card moving between columns is a new node in the new column, and focus follows it there.
**Pointer:** HTML drag-and-drop with a `data-drop` column tint; a drop lands at the column's end. **Touch and keyboard:**
the card's Move button opens a menu (every column, plus up and down). Alt + ←/→ changes column and Alt + ↑/↓
reorders. Each move is announced as "Moved X to Review, position 2 of 3". Cards move and are never re-created, so
focus survives. **Phone:** columns scroll horizontally with snap, one column per screen.

## 11. Stats

- **Stat (KPI tile).** Eyebrow, value (`--warp-data-num-font`), delta pill, caption and sparkline. Tiles are
  surfaces: interactive or not, they sweep by default at vivid only (§1.5).
  - **Numerals.** Vivid's display serif has no `tnum`, so a value that updates live (`[data-live]` on the tile or the
    number) uses the heading sans and never jitters. Static values keep the serif.
  - **Delta pill** inside a tile is always the body sans at ≥ 12px, never the serif.
  - **Sparkline** is context, not a series: one colour (`data-1`) for every tile, wash capped at 18%. Old props carry over: `label`, `value`,
  `detail`, `icon`, `trend`, `trendDir`, `accent`, `static`, `href`.
- **StatRow.** A `dl` of 2–6 inline stats inside one swept surface, with hairline dividers that turn horizontal in a
  narrow container. `accent` tints the values at vivid.
- **CountUp.** Starts on view, writes one text node per frame, and lands immediately under reduced motion. The final
  value sits in a visually hidden twin so screen readers never hear an intermediate number. Props: `value`, `from`,
  `decimals`, `prefix`, `suffix`, `locale`, `trigger: "view" | "mount"`.
- **Diff indicator** (`<Delta>`): sign + ▲/▼ + colour. `good="down"` flips the colour meaning for latency and churn
  but never the arrow.
- **Meter / GaugeChart.** A semicircle with `role="meter"`, threshold ticks and `data-level` (caution ≥ 70,
  critical ≥ 90), with the readout under the arc. The banded gauge (specimen 10) shows bands at 28% and a needle.
- **Progress ring** (`role="progressbar"`). **DistributionBar:** 2px gaps, a legend with %, `role="img"` with the
  full breakdown as its label.
- **Bar list.** Ranked labels and values over a 22% wash bar. It is a real list, so it reads without a chart model.
- **Tracker (uptime).** 90 day-buttons with roving focus and arrow keys, and a tooltip on hover or focus. Degraded
  days are **hatched**, outages full red. **Touch:** 90 bars are about 3px wide on a phone, so under a coarse pointer
  the bars ignore touches and the strip is one 44px scrubber (`touch-action: pan-y`): drag picks the nearest day, the
  tooltip follows, and the picked day becomes the keyboard's tab stop.

## 12. Charts

**Anatomy (every form).** `figure[data-scope=chart] > head (title, description, toolbar, view toggle) · legend
(buttons, aria-pressed, hover isolates) · plot (svg role="group" aria-roledescription, tooltip) · table (the data
table fallback, tabbable region) · summary (generated sentence, aria-describedby)`.

**Marks.**
- Hairline grid (`--warp-color-data-grid`) with a zero line.
- Lines are a monotone cubic, so they never overshoot. Line widths are tokens (§3).
- Points are ≥ 8px on focus, with a surface ring.
- Bars are ≤ 24px wide in a group, with 2px surface gaps, and only the value end is rounded (`--warp-radius-mark`).
- Donut segments have 2px gaps. **One y-axis, always:** a second measure gets its own chart, and the combo chart uses
  a moving average on the same scale.

**Label density.**
- Every chart keeps both end labels.
- Interior labels are spaced every `ceil(last/(max−1))`, and one closer than 0.6 step to the last label is dropped.
- `max = floor(plotWidth / 56–64)`.
- Labels are never rotated. Direct end labels at ≥ 560px for ≤ 4 series are de-collided at 14px.
- A heatmap too narrow for 10px cells shows the latest weeks; the table view keeps all of them.

**Tooltips.**
- They open on hover, on tap-and-drag (pointerdown latches, so a scrub works), and on focus.
- Escape closes them.
- They are placed in plot space scaled by the rendered width, so they work inside scaled device frames.
- The tooltip text duplicates each mark's `aria-label`. The tooltip itself is `aria-hidden`.

**States.** Loading (a skeleton of the chart's own shape), empty (with a next step) and error (with Retry). All three
render in the same frame height.

| Form | Notes | Specimen |
|---|---|---|
| LineChart / area | multi-series, gradient wash per stop, crosshair, annotations and bands, in-place tween | 05 |
| BarChart grouped / stacked | toggle; stacked gaps 2px; percent-stacked horizontal | 05, 10 |
| Combo (bar + line) | same axis only | 10 |
| DonutChart / pie | centre readout updates on focus; `pie` = inner radius 0 | 05 |
| Radial bar | 270° tracks, round caps | 10 |
| Funnel | step bars + "% of previous" | 10 |
| Sparkline | no axes, end dot, `aria-hidden` inside a labelled parent | 00, 02 |
| Scatter / bubble | shape per group (●■◆); bubble area ∝ value, 55% fill | 05, 10 |
| Histogram | p50 / p95 annotations | 05 |
| HeatGrid / heatmap / calendar heatmap | 6-step sequential; grid keys | 05, 10 |
| Radar | ≤ 3 series, polygon wash | 10 |
| Treemap (squarified) / sunburst | in-cell labels only when they fit; 2px surface strokes | 10 |
| Sankey | link opacity .32 → .7 on focus; node value labels | 10 |
| Candlestick / OHLC | hollow = up, filled = down, plus colour | 10 |
| Box plot | IQR box, median line, whiskers 1.5 × IQR, outliers | 10 |
| Waterfall | ▲/▼ labels, dashed connectors, neutral totals | 10 |
| Live streaming | rolling window, one `d` write per tick, fixed domain, reference line, pause | 10 |
| Brush & zoom | overview + brush; handles are `role="slider"` (←/→, PageUp/Down) | 10 |
| Reference lines, annotations | dashed `.ref`; `.anno` serif italic at vivid | 05, 10 |
| Choropleth | **tile-grid** map (equal-area tiles, no projection bias, phone-safe); geo shapes via the map pack | 10 |

```ts
<LineChart title="Revenue" data={rev} x="month" series={["subs", "usage", "services"]} format={money}
  summary={(c) => `Total grew ${pct(c.data)}…`} annotations={[{ x: "Sep", label: "Usage pricing" }]} />
<BarChart title="Seats" data={seats} x="quarter" series={plans} layout={layout.value} toolbar={<Segmented … />} />
```

**As built** (`packages/warp-core/src/charts`, `packages/warp/src/Chart.tsx`, `Charts.tsx`).
- A form is a pure layout in warp-core: config and width in, SVG scene out. The server renders the scene; `chart(figure, …)`
  then patches it, so a resize or a data change rewrites attributes on the same nodes. Charts ship in `@weft-js/warp`, tree
  shaken per form, rather than as a `@weft/charts` pack.
- Table view and summary always render, so there are no `<Chart.Table />` or `<Chart.Summary />` parts, as `Table` takes
  props rather than `Table.Column`. Every form takes `data`; a retry goes in `action`, a layout switch in `toolbar`.
- In-cell labels (percent bars, treemap, tile map, Sankey) use `.ref-t`'s surface halo instead of `.lab-on`: white or ink
  on the mid-lightness data colours misses 4.5:1 on several hues. A dimmed tooltip row is .62, not .6, for the same reason.
- `data-enter="wait"` plays as soon as it renders and is lifted off screen until first view, so no-JS and pre-hydration
  charts are never stuck at the start of their motion (the specimen's pause rule would leave them invisible).

## 13. Find, compare, build

- **FilterPanel.** An `aside` of `details` disclosures per facet. Each facet row has a checkbox, a label and a live
  **facet count**. Counts ignore their own group, so a count shows what adding that value would return; zero-count
  rows dim but stay operable.
  - **Applied-filter chips:** a removable `chip` per value, plus "Clear all".
  - **Faceted results:** a polite result count, a sort select, and matches highlighted with `mark[data-part=hit]`.
  - Under 700px the rail collapses into one "Filters (n)" disclosure. On app shells, layout's sheet hosts it.
- **ComparisonTable** (`columns`, `rows` with `section` and `hint`, `featured`, `cta`, `stickyHeader`, matching the
  old props): `true` is a ✓ with "Included", `false` a – with "Not included" (visually hidden text), and anything else
  renders as text. The featured column has an accent wash; the header sticks below the app bar. **Phone:** a "Compare
  A vs B" picker shows two plans side by side instead of squeezing four.
- **Query builder.** Groups (`role="group"`) with an AND/OR radiogroup, rules of field, operator (typed per field) and
  value, add and remove, and one nested level. The output is a readable expression plus a live match count.
- **CRUD resource pages.** These are generated from a schema (`key`, `label`, `type`, `required`, `min`, `options`):
  list → detail (`dl`) → edit/create form (floating fields with the sweep). Errors are described and focused. A
  breadcrumb goes back up. warp supplies the parts; app supplies routing.

## 14. Space and structure

- **Map** (`<Map>` shell, MapLibre in the pack): `role="application"` with a label, arrows to pan, +/− to zoom, and a
  toolbar of zoom, fit-bounds, draw-zone and pick-location.
  - **Markers** are buttons with names.
  - **Clusters** group within 56px of screen space, show their count, and zoom to their bounds when activated.
  - **Popups** are dialogs with focus moved in; Escape returns to the marker.
  - **Draw:** click or Enter adds vertices, double-click or Enter closes, Escape cancels.
  - **Pin picker:** click or Enter drops a pin, and arrows nudge it.
  - Routes and zones use non-scaling strokes.
- **Node graph** (`<Flow>`, own ~3 KB editor): nodes are focusable and sweep, and they move by dragging or by arrows
  (Shift for ×4).
  - Connect by activating a node's out-handle, then a target. Escape cancels.
  - Edges are SVG cubics; live edges use a dashed flow.
  - A visually hidden edge list gives AT the connections.
  - On phones the fixed canvas scales down and never reflows. Pan, zoom and a minimap are in the pack.

## 15. Coverage map (every `data` row)

| COVERAGE row | Section | Specimen |
|---|---|---|
| LineChart · BarChart · DonutChart · Sparkline | 12 | 05 |
| GaugeChart · HeatGrid · DistributionBar | 11, 12 | 05, 10 |
| Table · ComparisonTable · ScrollableGrid | 5, 13, 6 | 02, 09, 08 |
| VirtualList · List · DescriptionList · TreeView · Timeline | 9 | 06 |
| PaginationBar | 8 | 08 |
| Stat · StatRow · CountUp | 11 | hero |
| FilterPanel | 13 | 09 |
| `useInfiniteScroll` · `useSmoothNumber` | 8, 7 | 08, hero |
| LiveTable | 5, 7 | 03 |
| Dashboard recipe (KPI header, gauges, timeline, activity) · activity table with tabs | 11, 6 | 04, 05, 08 |
| Grid core: resize, reorder, pin, hide, sort, per-column filter, virtual rows and columns | 5, 6 | 02, 08 |
| Inline cell editing + validation · grouping, aggregation, tree data, master/detail | 6 | 08, 02 |
| Pivot · export and clipboard · saved views · bulk action bar · applied-filter chips | 6 | 08 |
| Faceted results · load-more and infinite · sortable list · swipe rows | 13, 8, 9 | 09, 08, 11, 06 |
| Area · stacked · percent bar · combo · pie · radial · funnel · scatter · bubble | 12 | 05, 10 |
| Radar · treemap · sunburst · Sankey · candlestick · box · waterfall | 12 | 10 |
| Bar list · tracker · chart interaction (shared tooltip, crosshair, legend, brush, reference, annotation) | 11, 12 | 10, 05 |
| Live streaming chart · calendar heatmap · choropleth | 12 | 10 |
| Interactive map · map draw and pin picker · node graph · file tree · layers panel | 14, 9 | 11, 06 |
| Query builder · CRUD resource pages | 13 | 09 |
| Kanban (beyond the inventory) | 10 | 07 |

## 16. Budgets and checks

- Core runtime: untouched; a table costs the toolkit's base. `@weft/charts` core ≈ 3–4 KB, and each extra form
  ≈ 0.6–1.2 KB.
- Live price tick: 2 mutation records, 0 rows recreated (counted in specimen 03).
- Virtual list: about 16 nodes for 10k rows. Scroll grid: about 100 cells for 240k.
- Every target is ≥ 44px on coarse pointers (`--warp-target-min`, invisible hit extenders on small controls). Phone
  table cards give the select cell a 44 × 44 box; the tracker is one 44px scrubber. A target never sits inside an
  `overflow: hidden` host, because that clips its `::after` expander. The specimen's solid stand-in button (the
  comparison table's "Choose Team") used to clip its own and was a 28px target. Its sweep fill now wipes through
  `clip-path` in place, like the real button in `warp-components.css`. Tree toggles reach 44px inside their 44px row.
- Dial switch: no long task over 50 ms (§4). Reduced motion: no running animation except the cell colour flash.
- Contrast: marks ≥ 3:1, text ≥ 4.5:1. Both are checked with `scripts/contrast-check.mjs` against
  `warp.css + warp-data.css`: 804 checks, 6 flags, all from one deliberate choice. Data surfaces rest on the hairline
  (`--warp-color-sweep-base: border`), so the "sweep vs resting border" pair drops to 1.5–2.96. The sweep is still ≥ 3:1
  against the surface it draws on. Static panels need no boundary under WCAG 1.4.11, and interactive cards also carry
  a surface fill. If foundations wants the pair kept, delete that one rule and panels rest on the ink border.

**As built, DataGrid and pagination** (`packages/warp-core/src/grid.ts`, `packages/warp/src/{DataGrid,Pagination}.tsx`). Where the build differs from this spec: a tree is `tree={{ kids, load, branch, rollup }}`, not one `children` key, so eager and lazy rows share a prop. There is no row virtualisation yet. A tree's footer aggregates leaves once each, open or not. `Table` takes `hiddenColumns` and writes the rule into the server HTML, so a column never flashes; its own footer keeps Previous and Next to stay small, while `PaginationBar` is the full bar.
