# warp 02 — Layout, navigation and responsive behaviour

Status: v0.3, 2026-10-28 (v0.2 review fixes: §14; v0.3 adds the Spacer demo and the locale provider: §15). CSS: [tokens/warp-layout.css](tokens/warp-layout.css), in `@layer warp.layout`. Specimen:
[specimens/layout.html](specimens/layout.html) (nine templates × phone 390 / tablet 834 (portrait or landscape) /
desktop 1280, plus galleries of every part; the picker also flips `fields: floating | classic` page-wide). It builds on [01-foundations.md](01-foundations.md) and
[SIGNATURE.md](SIGNATURE.md).

---

## 1. Rules everything here follows

1. **Containers decide, not the viewport.** Steps are **600** and **1000** of the *nearest container*. Three named
   containers exist: `warp-shell` (the shell root), `warp-main` and `warp-page` (the page: shell main, Docs root, or
   any box that sets it). Parts that decide by the *page*, such as AnchorNav, tab-nav orientation and Inspector, query
   `warp-page`, so they behave the same in a side pane and in full width. `data-form` / `data-pointer` force a form.
2. **Relationships, not pixels.** Gaps are `hair · tight · related · group · section · page`; widths are named.
3. **Sys tokens only.** Never `--warp-ref-*` (the single exception is `--warp-ref-push`, which this file defines).
4. **Hooks:** `data-scope` + `data-part` + state attributes, every selector inside `:where()`, all in `warp.layout`.
   `warp.css` must declare `@layer warp.tokens, warp.base, warp.signature, warp.layout, warp.components;`.
5. **One DOM order on every form:** skip link → header → nav → main → overlays. CSS moves things; DOM never does.
6. **The document scrolls, not the shell.** There is no nested scroll container around main. Header, nav and dock
   are `sticky`, and nothing with a `transform` wraps the content slot (it would break `position: fixed` in pages).
7. **No hover-only affordances.** Every hover reveal also shows on `:focus-visible` and on coarse pointers.
   Touch targets are ≥ `--warp-hit-min` (44px) on `pointer: coarse`.
8. **The sweep is the signature** (SIGNATURE.md). Here it lives on nav items (sidebar, rail, bottom-bar tabs,
   NavList, TopNav links, mega-menu entries), on the workspace switcher, on interactive panels and cards
   (`[data-scope="surface"][data-sweep]`, gated by `--warp-sweep-surfaces`: on at vivid or with
   `data-flair="sweep"`), on doc tabs and pager cards, and on the command field (the real floating-border field).
   Layout only sets `--warp-color-sweep-base` and `--warp-sweep-radius`; the phase machine is the shared one
   (`specimens/warp-sweep.js`, weft `sweep()`): every exit keeps travelling right, at 240 · 300 · 340ms.
   **Bases follow the surfaces exception.** Controls (the command field, the workspace switcher) rest on the ink
   sweep-base, so sweep-vs-base is ≥ 3:1 (measured 3.03–3.16 at every stop and theme). Nav items, doc tabs and the
   phone command ring have no resting border (base `transparent`), so the sweep is measured against the surface
   (4.7–5.3:1). Panels and cards rest on the hairline. Never rest a control on `border-control` grey (1.47:1).

## 2. Tokens and inputs (added by this file)

| Token | Value | Use |
|---|---|---|
| `--warp-safe-top/right/bottom/left` | `env(safe-area-inset-*)` | inputs; frames and tests override them |
| `--warp-keyboard` | `0px` | input: on-screen keyboard height (VirtualKeyboard API or visualViewport) |
| `--warp-viewport-block` | `100dvh` | input: usable block size; pinned by frames, never `100vh` |
| `--warp-layout-bar` | control-md + 12px (48 / 56 coarse) | header, top bar, panel heads |
| `--warp-layout-tabbar` | 56px + safe bottom | phone bottom bar |
| `--warp-layout-rail / -sidebar` | 80px / 248px | tablet rail, desktop sidebar |
| `--warp-layout-list / -aside` | 340px / 300px | master list, inspector and aside |
| `--warp-layout-measure / -narrow / -content / -wide` | 68ch / 440 / 1160 / 1440 | Center widths |
| `--warp-ref-push` | 16% · 32% · 100% (quiet · balanced · vivid) | push travel, × motion-scale |
| `--warp-duration-route / -push / -sheet` | base / slow / slow | navigation motion |

Required meta: `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover,
interactive-widget=resizes-content">`. With `resizes-content` the keyboard shrinks the layout viewport; where it
is unsupported, the shell sets `--warp-keyboard` and `data-keyboard` from `visualViewport`.

## 3. Primitives

All take `gap?: Space`, `class?`, `as?` and pass aria-* and `data-*` through. `Space = "hair" | "tight" | "related"
| "group" | "section" | "page"`. `Step = "tablet" | "desktop"` (600 / 1000). Each child of Split, SplitPane and the
Inspector is itself a container.

```ts
Stack(p: { gap?: Space; align?: "start" | "center" | "end"; divided?: boolean })          // data-scope="stack"
Row(p: { gap?: Space; justify?: "start" | "between" | "end" | "center"; align?: ...; wrap?: boolean; reflow?: Step })
Grid(p: { min?: "xs" | "sm" | "md" | "lg"; cols?: 2 | 3 | 4 | 6; gap?: Space })            // intrinsic columns
Split(p: { side?: "start" | "end"; width?: "rail" | "nav" | "list" | "half"; at?: Step; sticky?: boolean })
Center(p: { max?: "measure" | "narrow" | "content" | "wide"; gutter?: boolean; intrinsic?: boolean })
Cover(p: { min?: "screen" | "fill" }) & { Center: Component }                              // auth, error
Frame(p: { ratio: "square" | "4:3" | "16:9" | "21:9" | "9:16" | `${number}:${number}` })
ScrollArea(p: { axis?: "y" | "x" | "both"; snap?: boolean; fade?: boolean; label?: string })
Spacer()                                                  // flex: 1 inside Row / Stack
Inset(p: { pad?: "group" | "section" })                   // sunken padded region
bleed?: true | "start" | "end"                            // any element: out to the page edge, honours safe areas
```

- **Grid**: `repeat(auto-fit, minmax(min(100%, max(min, (100% - gaps) / cols)), 1fr))`, so no breakpoints.
- **Row `reflow`** becomes a Stack below the step (it replaces PLAN's `Switch`).
- **ScrollArea** contains overscroll, uses a thin bar, and `fade` masks its edges with a scroll timeline (this is
  FadeMask). Give it `role="region"`, a name and `tabindex=0` when it has no focusable child.
- **Frame** crops its children; it has no chrome of its own (wrap it in a Surface for chrome).
- **Spacer** takes the free space inside a Row or Stack (`flex: 1 1 0`), so what follows it sits at the far end: the
  actions after a toolbar's filter field, the footer of a fixed-height card. It is an empty box with no role and no size
  of its own, and it does nothing in a Grid or a block parent. Its basis is 0, so it never forces a wrap. In a
  wrapping Row it stays on the line of the item before it, and items that wrap start their own line at the start. If the
  end group must stay at the end, use `wrap={false}` or `reflow`. Prefer `justify="between"` when there are exactly
  two groups; use Spacer when only some items go to the end. Demo: `layout.html#spacer-demo`.

## 4. Page parts (coverage rows)

```ts
Section(p: { variant?: "plain" | "band" | "inset"; divided?: boolean; header?: Slot })
PageHeader(p: { eyebrow?: string; title: string; description?: string; actions?: Slot; meta?: Slot; tabs?: Slot })
Masonry(p: { min?: "xs" | "sm" | "md" | "lg"; gap?: Space })
SplitPane(p: { orientation?: "horizontal" | "vertical"; size: Bindable<number>; min?: number; max?: number;
               collapsible?: boolean; label: string })                                   // size in %
FloatPanel(p: { title: string; position: Bindable<{ x: number; y: number }>; bounds?: "parent" | "viewport";
                snap?: number } & Openable)                                               // DraggablePanel
StickyBar(p: { edge?: "top" | "bottom"; tone?: "default" | "accent"; variant?: "bar" | "floating" })  // Shell.Dock = bar
Banner(p: { tone?: "info" | "positive" | "caution" | "critical" | "accent"; icon?: Icon; actions?: Slot;
            dismissible?: boolean })
AnnouncementBar(p: { tone?: "inverse" | "accent"; dismissKey?: string } & Openable)
ConsentBanner(p: { onAccept(): void; onReject(): void; onCustomize?(): void })          // CookieBanner
```

- **Section** gives vertical rhythm (`section` padding, `group` gap). `band` is a full-bleed surface;
  `inset` is sunken.
- **PageHeader** is a grid: the heading sits at the start and the actions at the end when the container is ≥ 600;
  below 600 the actions drop under the title. Meta and tabs span the full width. It renders `<header>` + `<h1>`
  (pass `level` to change the heading level).
- **Masonry** uses native `grid-template-rows: masonry` where supported (row-first reading order). Elsewhere it uses
  CSS columns with `break-inside: avoid`, and then DOM order reads *down each column*. So keep tiles independent:
  never put a sequence there that must be read in order.
- **SplitPane** renders `role="separator"` with `aria-valuenow/min/max`, `aria-controls` and a name. Keys:
  ←/→ (↑/↓ when vertical) move 5, Shift moves 20, Home/End go to min/max, and Enter collapses or restores.
  The visible line is 1px; the hit area is `max(12px, --warp-hit-min)`; hover, focus and drag turn it accent.
  Below 600 it stacks with no separator. Persist `size` as a fraction. Nesting SplitPanes gives a **dockable
  layout**; save the tree of fractions.
- **FloatPanel** is a non-modal `role="dialog"`, dragged by its handle (pointer capture, `touch-action: none`).
  When the handle has focus, arrows move it 8px (Shift: 32). It is clamped to its bounds. Below 600 it becomes
  a bottom sheet over the bottom bar (the dock offset). It takes elevation 2, and 3 while dragging.
- **StickyBar** is position sticky; `floating` is the selection pill (centred, rounded, elevation 3,
  `role="toolbar"`). A bottom bar clears `--_dock` (bottom bar + safe area; 0 when the keyboard is
  up). A top bar sits under `--_barh`. It is glass at balanced and solid at quiet.
- **Banner** is a page message *inside main*; it is not a toast or a modal. Info, positive and caution use
  `role="status"`; critical uses `role="alert"`. It has a 2px tone edge at the inline start.
- **AnnouncementBar** sits above the header and is inverse by default. The first one takes the top safe area, and a
  TopNav right after it drops its own. Dismissal persists by `dismissKey`. It has a 44px dismiss button with a name.
- **ConsentBanner** is non-modal, so it never traps focus or covers primary nav. *Reject* and *Accept* are equal in
  size and weight; *Customise* is third. Desktop and tablet show a card at the bottom-start. Below 600 it is a
  sheet above the bottom bar. It is never shown again after a choice.

## 5. Navigation parts

```ts
TopNav(p: { brand: Slot; links: NavLink[]; actions?: Slot; current?: string })        // marketing / docs
NavLink = { label: string; href?: string; mega?: { icon?: Icon; title: string; description?: string; href: string }[] }
NavList(p: { groups: { label?: string; items: NavItem[] }[]; current?: string; label: string })
NavItem = { id: string; label: string; icon?: Icon; href?: string; count?: number; badge?: string; children?: NavItem[] }
AnchorNav(p: { items: { id: string; label: string; children?: ... }[]; scroller?: Element; label?: string })
Breadcrumb(p: { items: { label: string; href?: string }[]; label?: string })
TabNav(p: { items: NavItem[]; current: string; orientation?: "horizontal" | "auto"; label: string })
Pager(p: { prev?: { label: string; href: string }; next?: { label: string; href: string } })
VersionSwitcher(p: { versions: string[]; value: Bindable<string> })                      // a compact Select
```

- **A row of links never wraps (priority+).** Links are `white-space: nowrap`. When they don't fit, the ones at
  the end move, in order, into a trailing "More" disclosure (`aria-expanded`, `aria-controls`; a list of links,
  not a menu role). With none left it reads "Sections". Re-measure on resize, font load and density change.
  Escape, an outside click, focus leaving or picking a link closes it. TabNav scrolls instead (it shows state).
- **TopNav** is sticky and glass. Links carry `aria-current="page"` and sweep. Below 1000 the links collapse into a
  full-screen menu (`role="dialog"`, `aria-modal`, focus moves to Close, and Escape restores focus to the trigger)
  that also holds the page's NavList. A link with `mega` is a disclosure **button** (`aria-expanded`,
  `aria-controls`), not a menu role. Its panel spans the bar, holds links, and closes on Escape, an outside click
  or a route.
- **NavList** is the sidebar's list as a standalone part. It has eyebrow group labels. A parent with children is a
  disclosure (`aria-expanded`, chevron); children indent behind a hairline. The current item gets an inset 2px
  accent line and an accent icon. Counts are mono and tabular.
- **AnchorNav** ("On this page") uses scroll-spy: the last heading above `min(120px, ¼ of the scroller)` gets
  `aria-current="location"`. At ≥ 1000 of `warp-page` it is a sticky side list with a moving accent line. Below,
  it is a `<details>` disclosure placed above the article (the summary reads "On this page"). It is open whenever
  the summary is hidden. Smooth-scrolls (instant under reduced motion), offsetting by the header.
- **Breadcrumb** is shown in full at ≥ 1000. Below that it shows the first item and the last two, behind an
  ellipsis link ("Show N more"). On phone the header shows a **back button** (named "Back to {parent}") in its
  place; the breadcrumb itself never appears in the phone top bar.
- **TabNav** is *tabs as navigation*: links with `aria-current="page"`, never `role="tab"`, because they change the
  URL. It has an underline indicator and scrolls with edge fades. `orientation="auto"` turns vertical at ≥ 1000 of
  the page (the settings layout uses it).

## 6. The app shell

```ts
Shell(p: { variant?: "app" | "focus"; nav?: NavItem[]; current?: string; collapsed?: Bindable<boolean | "hidden">;
           depth?: "root" | "child"; label?: string }) & {
  Header, Brand, Switcher, Title, Crumbs, Command, Actions, Account, Nav, NavGroup, NavFoot, Main, Dock, Overlays }
Shell.Command(p: { label?: string; shortcut?: string /* "⌘K" */; onOpen(): void })
Shell.Switcher(p: { current: { name: string; meta?: string }; workspaces: ...[]; onSwitch(id): void })
```

| | Phone < 600 | Tablet 600 – 999 | Desktop ≥ 1000 |
|---|---|---|---|
| Header | top bar: brand mark, page title, search icon, account | breadcrumb (first + last two), command field 220px, bell, account | breadcrumb in full, command field 300px with ⌘K hint |
| Nav | bottom bar: 4 tabs + More (sheet), 56px + safe area, count badge | 80px rail: icon over a 12px label, settings and collapse at the foot | 248px sidebar: switcher, groups, saved views, counts; `[` collapses it to the rail |
| Rail expand | — | overlay sidebar over a scrim (clip-path reveal, no reflow) | collapse ↔ expand (the sidebar animates `--_navw`; labels fade after) |
| Depth child | back button replaces the brand; the title is the item | breadcrumb | breadcrumb |
| Account menu | bottom sheet | popover | popover |
| Palette | full screen | centred, 560px | centred, 640px |
| Keyboard up | bottom bar hides, dock rides the keyboard | — | — |

- **Glass** (`--_glass`) is the page at 84% plus 16%·x over `--warp-blur-overlay`. At quiet x=0 it is solid. The
  header's `::after` is the **route line**: a hairline sweep drawn on `data-routing`, gated by
  `--warp-sweep-buttons`.
- **The focus variant** (wizard, checkout) has no nav. The title is always shown, Close sits at the start and the
  step count at the end. The dock pins to the bottom edge even on short pages, because main fills
  `viewport − bar − safe − dock`.
- **`collapsed="hidden"`** (≥ 600) removes the rail as well. An **edge tab** at the inline start (a real
  button with a name, `aria-expanded` and `aria-controls`; 28×64 on coarse pointers) opens the overlay sidebar.
  The old pull-out tab had no state and expanded on hover; this one has state and opens on press only.
- **The workspace switcher** heads the sidebar. In the rail and on phone it moves into the account menu as a
  `menuitemradio` group (`role="group"` with a name; the eyebrow is `aria-hidden`).
- **The account menu is an APG menu button.** The triggers (avatar, switcher) have `aria-haspopup="menu"`,
  `aria-expanded` and `aria-controls`. Opening (click, Enter, Space, ↓) focuses the first item; ↑ focuses the last.
  Items use a roving tabindex: ↑/↓ wrap, Home/End (and PageUp/PageDown) jump, a printable key is typeahead
  (keys within 500ms build a prefix; the same letter repeated cycles through its matches), Enter/Space activate.
  Escape closes and returns focus to the trigger; Tab closes, returns to the trigger and moves on. Children are
  only `menuitem*`, `group` and `separator`; the identity header is `aria-hidden` and its text is the menu's name.
  An outside click closes it without moving focus.
- **Overlays** are siblings of the layout, never inside main. Z budget: sticky 100 < dock 200 < overlay 300 <
  menu 400 < modal 500 < toast 600 < tooltip 700.

### Accessibility contract

- **Landmarks:** `header` (banner), one `nav` per navigation, each named ("Main", "Breadcrumb", "Settings
  sections", "On this page"), `main` with an id and `tabindex=-1`, and `aside` for inspectors. One `main` per
  document: a shell rendered as an island (a preview, a device frame, a story) renders its main slot as
  `role="region"` with a name instead (`Shell island`).
- **The skip link** comes first, is visible on focus, sits below the top safe area, and jumps to `main`.
- **Focus order:** skip → brand → (back) → crumbs → command → actions → account → nav items → foot → main → dock.
  On phone the bottom bar comes *after* main in reading order, as one DOM order styled to the bottom; the tab
  order matches the DOM.
- **Rail items always show their visible label.** Never use a tooltip-only name (this fixes C4 from the old code).
  The collapse toggle has `aria-expanded`, `aria-controls` and a label that names the action, and its
  `aria-keyshortcuts="["`.
- **Current:** nav items use `aria-current="page"`; anchors use `location`; master rows use `true`.
- **Modal vs non-modal:** the palette, the More sheet, the phone menu and the TopNav menu are modal. Modal means
  all of: `aria-modal`; focus moves in on open (the palette's input, otherwise the first tabbable, usually Close);
  every sibling on the dialog's path to `<body>` is `inert` (the scrim stays live, so a tap closes it); Tab and
  Shift+Tab wrap inside; Escape closes; focus returns to the control that opened it. Prefer
  `<dialog>.showModal()`; use the inert walk only where the top layer can't be used (an island inside a
  transformed frame). The account popover, FloatPanel, Inspector, ConsentBanner and mega menu are non-modal; they
  still close on Escape and return focus to their trigger.
- **Names come from visible text.** Fields use a real `<label for>` (never `aria-label`, never `aria-hidden` on
  the label). The per-character sweep tint lives in an `aria-hidden` span whose glyphs are generated content
  (`[data-char]::before { content: attr(data-c) }`), beside a visually hidden copy of the label with no
  text-transform, so both the accessible name and `textContent` read "Alt text", not "A L T  T E X T". Settings
  rows and switches are named by their row title with `<label for>`; the sentence under it is
  `aria-describedby`. A count badge says its meaning in visually hidden text (`12` + " new"), never `aria-label`
  on a span. Kbd hints are `aria-hidden`; the control carries `aria-keyshortcuts`.
- **Live regions:** route changes announce the new `h1`. Board moves, pull-to-refresh and resizes announce through
  a polite region.

## 7. Master/detail and templates

`MasterDetail(p: { view: Bindable<"list" | "detail">; list: Slot; detail: Slot })`: below 600 it is push navigation
(the detail slides over, the back button returns, and the scroll position of each is kept); at ≥ 600 both panes
show (list 300 / 340). Templates in the specimen, each a composition with no new primitives:

| Template | Composition | Notes |
|---|---|---|
| Dashboard | PageHeader · Grid(min sm, cols 4) stats · Split(end, at desktop) chart + list | stats go 4 → 4 → 2×2 |
| List / detail | MasterDetail · ScrollArea chips · NavList-like rows | push on phone |
| Settings | PageHeader · Banner · Split(nav, at desktop) with TabNav auto + sections · Dock | the settings layout row |
| Form wizard | Shell focus · Stack steps (≥ 1000) · Dock | keyboard-safe |
| Auth | Cover · Split art (≥ 1000) · card · passkey | chrome-less on phone |
| Landing | AnnouncementBar · TopNav + mega · Center wide · Grid · ConsentBanner | display scales with cqi |
| Docs | `data-scope="docs"`: TopNav + version · NavList · article · AnchorNav · Pager | the docs layout row |
| Empty / Error | Shell + empty state / Cover | one heading, one action |

## 8. Workbench and app chrome

```ts
Inspector(p: { label: string } & Openable)                 // aside beside content ≥1000 of the page; sheet below
DocTabs(p: { tabs: { id; label; dirty?: boolean }[]; value: Bindable<string>; onClose(id); onReorder(ids) })
StatusBar(p: {}) & { Item(p: { optional?: boolean; tone?: "accent" }) }
Board(p: { widgets: { id; w: number; h: number }[]; onChange(layout) })    // dashboard grid
Canvas(p: { view: Bindable<{ x; y; zoom }>; minimap?: boolean; controls?: boolean })
PullToRefresh(p: { onRefresh(): Promise<void> })
BackToTop(p: { after?: number /* px, default one viewport */ })
RouteProgress(p: { state: "idle" | "loading" | "done" })
```

- **Inspector** is docked at ≥ 1000 of `warp-page`: 300px wide, a hairline at the start, and it enters from the end.
  Below that it is a non-modal bottom sheet. Combine it with SplitPane to make it resizable.
- **DocTabs** is a `role="tablist"`. ←/→ select (mirrored in RTL), Home/End jump, Alt+←/→ reorder, Delete
  closes, and dragging reorders. Every tab has `aria-controls` → the one `role="tabpanel"` below, whose
  `aria-labelledby` follows the selection. The close mark is pointer-only and `aria-hidden` (nothing interactive
  nests in a tab); Delete is the keyboard and AT path, stated in the tabs' `aria-describedby` and
  `aria-keyshortcuts`. A dirty tab shows ● in place of its close mark and says "(unsaved changes)" in hidden
  text. Close marks are 32px on coarse pointers with a 44px hit area. The selected tab joins the content below.
- **StatusBar** is mono 11px with button items. Below 600, `optional` items drop. It pads by the bottom safe area.
- **Board** has 12 columns at ≥ 1000, 6 at tablet and 1 on phone. Widget spans clamp to the column count, and rows
  are a fixed `--_row` (72px). Pointer: drag the handle to reorder, or drag the corner grip to resize. Keyboard:
  Alt+arrows move, Alt+Shift+arrows resize. Each change is announced.
- **Canvas**: drag (or Space+drag) pans, wheel scrolls, and ⌘/Ctrl+wheel or pinch zooms around the pointer
  (40–250%). It is focusable as `role="application"` with a roledescription: arrows pan, +/− zoom, 0 resets.
  Controls sit at the bottom-start; a minimap at the bottom-end tracks the viewport and is hidden below 600.
- **PullToRefresh** works on touch only, at scroll top, with resistance `70·(1 − e^(−d/110))`. It arms at 56px and
  spins on release (`aria-busy`, announced). Fine pointers get a refresh button instead.
- **BackToTop** is sticky at the bottom-end and clears the dock and bottom bar. It appears after one viewport of
  scroll. **RouteProgress** is a 2px accent bar for routes slower than ~150ms: it trickles toward 90%, completes,
  then fades. It is aria-hidden, because the new title is what gets announced.

## 9. Responsive rules

| Concern | Rule |
|---|---|
| Safe areas | Header pads `safe-top`; the bottom bar, dock, sheets and consent pad `safe-bottom`; gutters take `max(page, safe-left/right)`, so landscape notches are respected |
| Keyboard | `interactive-widget=resizes-content`, and `--warp-keyboard` as a fallback. With `data-keyboard` the bottom bar hides, the dock sits on the keyboard, and the focused field stays in view (`scroll-margin`) |
| Viewport height | `--warp-viewport-block` (100dvh); Cover and the focus shell use it; never `100vh` |
| Sticky and containment | One scroller (the document). Side panes, the sidebar, NavList and ScrollArea use `overscroll-behavior: contain`. Sticky offsets add `--_barh` |
| Landscape tablet | 1194 wide gives the desktop sidebar; 834 high keeps a 56px header (coarse) |
| Foldables | `@media (horizontal-viewport-segments: 2)` puts master and detail on separate screens, with the hinge as the gap (`env(viewport-segment-*)`) |
| Print | Nav, header, dock, overlays, consent and announcement are hidden; main is full width; Split stacks; links print their URL |
| RTL | Only logical properties are used, so `dir="rtl"` mirrors everything (try the specimen's Direction toggle). Push and drawer motion flip. Device chrome stays LTR. `dir` comes from the locale provider (below) |
| Theme | ThemeProvider writes `data-theme` / `data-expression` / `data-density` on the root (or on an island). FaviconSwitcher swaps the icon on `data-theme` and on `prefers-color-scheme` |

### Locale provider

`Locale` is the one place an app says which language it's in, which way that language runs and how its numbers, money
and dates are written. It renders `[data-scope="locale"]` with `lang` and `dir` on its root (the root provider writes them
on `<html>`). Every component inside reads the same context.

```ts
Locale(p: {
  locale: string;                        // BCP 47: "en-US", "de-DE", "ar-EG"
  dir?: "auto" | "ltr" | "rtl";          // default "auto": from the locale's script
  currency?: string;                     // ISO 4217: the default for values that carry none (a market's price list)
  timeZone?: string;                     // IANA; default: the user's resolved zone
  numberingSystem?: string;              // "latn", "arab", …; default: the locale's own
  calendar?: string; hourCycle?: "h12" | "h23"; weekStart?: 1 | 2 | 3 | 4 | 5 | 6 | 7;   // defaults from the locale
  as?: string;                           // render a real box (data-box); default: display: contents
})
locale(): LocaleContext                  // the nearest provider

type LocaleContext = {
  locale: string; dir: "ltr" | "rtl"; currency?: string; timeZone: string; weekStart: number;
  decimal: string; group: string; digits: string[];                    // what the parser accepts
  number(n, o?): string; money(n, currency?): string; percent(n): string; unit(n, unit): string; compact(n): string;
  date(d, o?): string; range(a, b, o?): string; relative(n, unit): string; list(xs, type?): string;
  plural(n): Intl.LDMLPluralRule; collator(o?): Intl.Collator; name(code, type?): string;   // DisplayNames
  parse(text): number | null;                                          // typed input → number
}
```

**How direction resolves.** An explicit `dir` wins. Otherwise the locale's own text direction is used
(`Intl.Locale#getTextInfo()`, falling back to its maximized script: Arab, Hebr, Thaa, Syrc, Nkoo, Adlm, Rohg are RTL).
A provider **always writes `dir`** and never inherits it, so a `de-DE` island inside an Arabic page stays LTR and an
outer direction can't leak in. That's also why the specimen's Direction setting (a test harness that forces `dir` on
the frames) doesn't reach the locale demo. Device chrome stays LTR.

**How it meets the RTL work.** Nothing in §1–§8 changes: layout is logical properties, so a `dir` write mirrors it with
no JS. The few physical things key off the provider's `dir`:
- Horizontal keyframes multiply by `--_dir`. `warp-layout.css` now writes both `[dir="rtl"] { --_dir: -1 }` and
  `[dir="ltr"] { --_dir: 1 }`, so a nested LTR island resets it instead of inheriting −1.
- Route progress grows from `:dir(rtl)`, not `[dir="rtl"] …`, which a nested LTR island would also have matched.
- Icons that point (back, next, send, undo, a list chevron) carry `data-flip` and mirror under `:dir(rtl)`. Icons that
  depict things (search, a clock, a check, media play) never mirror.
- The sweep keeps travelling left to right in every direction (SIGNATURE §1.2–§1.4 are physical). Per-character label
  delays are measured from the left edge, so they stay in step with it.

**How components read it.**
- **weft components** call `locale()`. Each formatted value is derived from `(value, locale)`, so switching the
  locale rewrites text nodes and two attributes and re-mounts nothing. Formatters are cached by
  `(tag, options)`, because constructing an `Intl` object costs far more than calling it.
- **Plain DOM code** reads the closest `[lang]` and `getComputedStyle(el).direction`. The inputs' "nearest
  `<Surface lang>` → document lang" (03 §2, 04 §1) is the same lookup, because the provider is what writes that `lang`.
- **CSS** uses logical properties first, then `:dir()` for physical exceptions and `:lang()` for script typography.
- **SSR** resolves the locale once per request (route segment, then the account setting, then `Accept-Language`) and
  serialises it into the root provider, so hydration formats with the same locale and time zone and the text matches.
  The LanguageSwitcher (05 §7) writes the choice, persists it and updates `<html lang>`, which also switches the screen
  reader's voice.

**Formatting rules.**
- **Money keeps its own currency.** A value carries its ISO code. Switching locale changes how it's written
  (`$1,284.50`, `1.284,50 $`, `‏١٬٢٨٤٫٥٠ US$`), never the amount. The provider's `currency` is only the default for
  values that have none, such as a market's price list.
- **Digits are the locale's.** `ar-EG` writes Arabic-Indic digits. `numberingSystem: "latn"` switches them (common
  in Gulf and Maghreb apps). Tables and stats use `tabular-nums` with either set.
- **Isolate every formatted value.** `[data-format]` gets `unicode-bidi: isolate`, so a number, date or price never
  reorders against the words around it. Identifiers (order ids, SKUs, codes, e-mail, phone, URLs) use
  `data-format="id"` and stay LTR. User content (names, notes, comments) uses `dir="auto"`, or `<bdi>` inline.
- **Plurals come from `Intl.PluralRules`**, never `n === 1`. Arabic has six categories (zero, one, two, few, many,
  other), and the message table supplies each one.
- **Parse what people type.** NumberInput and CurrencyInput (03 §3) parse through `parse()`: the locale's digits *and*
  Latin digits, its group and decimal marks, and a typed minus. Values are stored as numbers and re-formatted on blur.
- **Sort and search with `collator()`**, so de-DE sorts "Ä" with "A". Table text sort and filter fields use it with
  `sensitivity: "base"`.
- **Dates use the provider's `timeZone`.** Calendars start the week on `weekStart` (04 §1.4 reads the same value).

**Script typography.** For scripts that join (Arabic, Syriac, N'Ko, Adlam, Hanifi Rohingya, Mongolian) or have no
case (Hebrew, Thai, Devanagari, CJK), `warp-layout.css` sets the eyebrow, label, floated-label and button tracking to
0 and their case to `none` under `:lang()`. Tracking pulls joined letters apart. `:lang()` matches every descendant, so
the reset survives nested scope roots that re-declare the sys tokens. The floating label's per-character tint is
segmented by the provider: grapheme clusters (`Intl.Segmenter`) by default, and **words** for joining scripts, because
a letter alone in its own span loses its joined form.

**Accessibility.** `lang` is on every island whose language differs from its parent's, down to a single quoted phrase
(WCAG 3.1.2). The direction change is a visual property, so nothing is announced. Focus order follows the DOM, which
doesn't move.

Demo: `layout.html#locale` (`#locale-demo`). Switch en-US, de-DE and ar-EG to change the number, money, date, range,
relative time, unit, percent, compact, list and plural formats, the direction and the digits. Override the direction
or the digits, type an amount in the locale's own format, and read the resolved context in the table.

## 10. Input modality

| | Mouse / trackpad | Touch | Keyboard | Pen |
|---|---|---|---|---|
| Sweep | hover in / leave out | press in, release out (+120ms) | `:focus-visible` in | as mouse (it hovers) |
| Targets | control-md (36) | hit-min 44, bar 56 | — | as mouse |
| Shell | `[` collapses, ⌘K opens the palette | the More sheet, swipe-free | skip link, Escape, ⌘K, menu arrows + typeahead | — |
| Resize / drag | drag the separator or handle | the same, with `touch-action: none` | arrows, Shift ×4, Home/End | drag |
| Hover-only? | **never**: hover reveals also show on focus and on coarse pointers | | | |

## 11. Navigation motion

| | Quiet | Balanced | Vivid | Reduced |
|---|---|---|---|---|
| Route (sibling) | fade 120ms | rise 6px + fade, base | rise 9px + header route-line sweep | fade only, 0 distance |
| Push / pop | 16% travel | 32%, slow | 100% (a full slide over a scrim) | crossfade |
| Rail expand | clip reveal, base | + labels stagger | + labels stagger ×1.4 | instant |
| Sheet / drawer | from its edge; the exit is 70% of the entry | same | spring ease | fade |
| Shared element | opt-in View Transitions (`warp-main`, `warp-push`); named only on the clicked element | | | off |

Everything multiplies by `--warp-motion-scale`. Exits are shorter than entries. Nothing animates `width`: the
sidebar animates a grid-track variable, and the rail overlay reveals with `clip-path`.

## 12. Coverage map (old name → warp)

| Old | warp | | Old | warp |
|---|---|---|---|---|
| Stack, HStack, VStack | Stack / Row | | AppShell, SidebarLayout | Shell |
| Spacer | Spacer | | Sidebar | Shell.Nav (+ NavList) |
| Container, Center | Center | | TopNav | TopNav (+ mega) |
| Grid | Grid | | BottomNav | Shell.Nav (phone form) |
| Section | Section | | NavList | NavList |
| Masonry | Masonry | | Breadcrumb | Breadcrumb |
| AspectRatio | Frame | | AnchorNav | AnchorNav |
| ScrollArea, FadeMask | ScrollArea `fade` | | StickyBar | StickyBar / Shell.Dock |
| SplitPane | SplitPane | | Banner | Banner |
| PageHeader | PageHeader | | AnnouncementBar | AnnouncementBar |
| DraggablePanel | FloatPanel | | CookieBanner | ConsentBanner |
| ThemeProvider wiring | §9 Theme | | FaviconSwitcher | §9 Theme |
| DirectionProvider, LocaleProvider | Locale (§9) | | | |

§3 gap rows owned by layout: navigation rail (§6), route tabs (TabNav), route progress, inspector, workspace tabs
(DocTabs), dockable panels (nested SplitPane), status bar, infinite canvas, dashboard grid (Board), affix and
back-to-top (StickyBar, BackToTop), wrap/cluster (Row), bleed/inset, skip link, RTL (§9), settings layout, docs layout
(+ Pager), workspace switcher, pull to refresh, version switcher. Every one has a demo in the specimen.

## 13. Do and don't

- **Do** let containers decide. **Don't** write `@media (min-width)` in a component; media queries are only for
  pointer, motion, print and segments.
- **Do** keep one DOM order. **Don't** render nav twice for mobile and desktop.
- **Do** put overlays outside main. **Don't** put `transform`, `filter` or `contain: paint` on any ancestor of page
  content.
- **Do** name every nav and give every rail item a visible label. **Don't** use tooltip-only names or hover-expand
  sidebars.
- **Do** use tab-nav links for routes. **Don't** use `role="tab"` for things that change the URL.
- **Do** make Reject equal to Accept. **Don't** make the consent banner modal or let it cover navigation.
- **Do** keep the sweep on interactive things only. **Don't** sweep static cards, banners or the header.
- **Do** use `dvh` through `--warp-viewport-block`. **Don't** use `100vh`, and don't nest a scroll container around
  main.
- **Do** keep tiles independent in Masonry. **Don't** use it for ordered content.
- **Do** move overflowing links into "More" (priority+). **Don't** let a nav row wrap or clip.

## 14. Changes in v0.2 (judge reviews 01, 02, 03)

| Finding | Fix |
|---|---|
| 01 B3 · exits snapped off | The specimen runs the shared `warp-sweep.js`; measured: every layout host exits as `out` travelling right, then `idle` (240 / 300 / 340ms), and goes straight to `idle` under reduced motion |
| 01 M7 · command trigger 1.47:1 | The command field and switcher rest on the ink base: sweep-vs-base 3.03–3.16, sweep-vs-surface 4.7–5.3, every stop and theme |
| 01 minor 3 · no fields toggle | The template picker has Fields: Floating / Classic (`?f=classic`) |
| 01 minor 5 · char delays assumed 520 | Delays read `warpSweep.duration()` |
| 02 M5 · header nav wrapped at 1280/1440 | Priority+ section nav (§5), one 63px row from 1100 up; below, the controls get a fading second row |
| 02 M7 · tiny switch and close targets | Switch rows are `<label for>` rows; doc-tab close gets a 44px hit area on coarse pointers |
| 02 M9 (part) · 10px control labels | 11px |
| 02 m10 · clipped ⌘K on touch | Hidden on coarse pointers and `aria-hidden` everywhere |
| 03 B3 · account/workspace menu | APG menu button (§6) |
| 03 B4 · palette and More sheet leaked focus | The modal contract (§6): 0 of 35 Tabs escape the palette, 0 of 25 the sheet; the TopNav menu too. The Inspector returns focus to its toggle |
| 03 M1 · `aria-label` instead of labels | Real `<label for>` everywhere; no input, label or generic span carries `aria-label` |
| 03 M6 · doc tabs | Tabpanel, Home/End, no nested interactive (§8) |
| 03 m2 · `aria-label` on count spans | Visually hidden text |
| 03 m3 · ten `<main>`s | One; shell islands use a named region |
| 03 m4 · h1 → h4 | Demo headings step (PageHeader takes `level`) |
| 03 m13 · switcher on a 1.31:1 hairline | Ink base |

## 15. Changes in v0.3 (coverage gaps)

| Gap (COVERAGE §4) | Fix |
|---|---|
| §1 primitives · Spacer had no demo | §3 Spacer rules; `layout.html#spacer-demo` (toolbar Row, fixed-height Stack footer, resizable box) |
| P0 direction and locale provider · no locale spec | §9 [Locale provider](#locale-provider): API, direction resolution, how components read it, formatting rules, script typography; `layout.html#locale` (`#locale-demo`, `#locale-island`, `#locale-context`) |
| (found while specifying it) nested LTR inherited `--_dir: -1`; route progress matched `[dir="rtl"] …` through an LTR island | `[dir="ltr"] { --_dir: 1 }`; route progress uses `:dir(rtl)` |
