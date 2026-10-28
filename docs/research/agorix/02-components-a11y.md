# Agorix → weft 02 — Component inventory, API quality, accessibility, tests

Research date: 2026-10-28. Scope: `@agorix/ui` 0.2.0 at `~/dev/agorix-discord/packages/ui` (read-only). Paths below
are relative to `packages/ui/src/` unless they start with `~`. Line numbers are from the working tree on 2026-10-28.

**What was read, and its state:**
- The checkout is on branch `fix/zabbix-agent2-docker-plugin-leak`, not `main`. `main` is an ancestor and the two
  extra commits are infra-only, so `packages/ui` matches `main`.
- On top of that, 11 files have uncommitted edits (`git status -- packages/ui`). These are the a11y and Sidebar fixes.
  `label-background.ts` and its test are untracked.
- Branch `codex/agorix-chart-system` (f776aa7) is one extra commit: `LineChart.tsx` plus a new `LineChart.test.ts`.
- `~/dev/medium/vendor/agorix-ui` (`SOURCE.md`, `dist/`, and the medium git log) was used for the shipped-only
  patches.
- Nothing was built, installed or run.

---

## TL;DR

1. **The kit has 206 exported components** (PascalCase value exports in `index.ts`, not counting ~60 icons or the
   realtime/multiplayer hooks). For weft:
   - **85 keep**, of which about 45 are distinct families and the rest are parts such as `CardHeader`;
   - **36 merge** (near-duplicates);
   - **76 move out** into optional packs (meet, marketing, charts, scheduling, motion, commerce, e-sign);
   - **9 drop**.

   The v1 core is about **50 components**, which lines up with the PLAN §6 vocabulary.
2. **The look is worth porting; the behaviour is not.** The L→R sweep, the floating-border label and the tokens
   are good and distinctive. The interactive layer, though, is hand-rolled per component and mostly fails the
   WAI-ARIA APG:
   - **Menu, OverflowMenu and ContextMenu** have no arrow keys, and focus never enters the portaled panel.
   - **Select** without `searchable` can't be operated by keyboard at all.
   - **Tabs** has no tab semantics.
   - **Drawer** sets `aria-modal` but has no focus management.
   - **The collapsed Sidebar rail** has icon-only links with no accessible name.
   - **OS reduced-motion** is ignored by default.
3. **Behaviour engine: Zag.js for composite widgets, native HTML for the rest.** Use native `<dialog>`, `popover`
   and form inputs where the platform already does the job. Port only the pure logic: `computeLabelWindow`,
   `visibleLineLabelIndexes`, Table's priority column hiding, and the sweep CSS. Don't port `useDismiss`,
   `useFocusTrap` or `useFloatingPosition`; Zag and the native top layer replace them.
4. **API drift would trip agents in 9 places.** Examples:
   - `onChange` gets an event in one input and a value in the next;
   - `activeTab`/`onTabChange` sits next to `value`/`onValueChange`;
   - `ariaLabel` is used 38 times and `'aria-label'` 4 times;
   - `tone="default"`, `"neutral"` and `"muted"` all mean the same thing;
   - Button styles come from boolean flags rather than one enum.

   weft fixes all of these with **one** convention: `value`/`defaultValue` or a `State<T>` box, `onValueChange(value)`,
   closed intent enums, `aria-*` passthrough, and parts as dotted members.
5. **Tests: none of the interactive core is tested.** There are 29 test files; the 13 component ones mostly cover
   `meet/*` (moving out) and SignGate. Vitest runs with `environment: 'node'`, so keyboard and focus can't be tested.
   Of the component tests:
   - roughly a third assert Tailwind class strings or `data-testid` (T005);
   - one checks a mapping against the table it was derived from (T002).
6. **Not every shipped-only patch is in source:**
   - **In source, uncommitted:** the ARIA IDREF fix. Commit it.
   - **Missing:** LineChart's static Y-axis labels, `--btn-stroke-hover-text`, Textarea `id`/`aria-describedby`
     wiring, and the FloatingBorderCheckbox `aria-describedby`/`role` props. They exist only in `medium`'s `dist/`.
   - **On a branch only:** the chart-branch fixes (reduced motion, label density). Not merged.

---

## 1. Inventory

**Legend:** **K** keep (core), **M** merge (target in parentheses), **O** move out to an optional pack, **D** drop.

| Group (n) | Keep | Merge → into | Move out → pack | Drop |
|---|---|---|---|---|
| Buttons (4) | Button, ButtonGroup, Toolbar | AnimatedHamburger (→ IconButton + icon) | | |
| Text inputs (14) | FloatingBorderInput (→ `Input`), Textarea, NumberInput, PasswordInput, MaskedInput, InlineEdit | FloatingLineInput (→ `Input variant="line"`), InputGroup (→ `Input` leading/trailing parts), SearchInput (→ `Input type="search"`), CurrencyInput (→ `NumberInput format`) | PhoneInput, PlaceLookupInput, AddressInput, PaymentCardInput → **commerce** | |
| Choice / range (13) | FloatingBorderCheckbox (→ `Checkbox`), CheckboxGroup, Switch, RadioGroup, OTPInput (→ `PinInput`), Slider, TagsInput, Rating, FileDropzone | RangeSlider (→ `Slider` with 2 thumbs) | | FloatingBorderIcon, FloatingBorderActiveContext, HoverScope (internal sweep plumbing) |
| Pickers (9) | Select, Combobox, DatePicker, TimePicker | MultiCombobox (→ `Combobox multiple`), DateRangePicker (→ `DatePicker mode="range"`), MonthPicker (→ `DatePicker view="month"`), DateTimePicker (→ composition) | ColorPicker → **pickers-extra** | |
| Forms (4) | FormField (→ `Field`) | KitForm, KitField (→ `weft/start` form + `Field`) | DynamicForm → **schema-forms** | |
| Selection (4) | Segmented | Pill, PillLink, ToggleChip (→ `ToggleGroup` / `Badge`) | | |
| Overlays (19) | Modal (→ `Dialog`) + Header/Body/Footer, AlertDialog, Drawer, Popover, Tooltip, Menu, ContextMenu, CommandPalette | HoverCard (→ `Popover trigger="hover"`), OverflowMenu, ContextMenuPanel (→ `Menu`) | Lightbox → **media**; SignGateBlocker, SignGateFlow → **e-sign** | FloatingPortal (weft core `Portal`), SweepBorderOverlay (internal) |
| Disclosure / nav (12) | Tabs, Accordion, AccordionItem, SplitPane, Breadcrumb, Stepper, NavList, PaginationBar | | FilterPanel, FilterSection, AnchorNav → **recipes** | NavPermissionsProvider (app concern; keep the pure filter fn) |
| Shell (9) | AppShell, Sidebar, TopNav, BottomNav, Banner | SidebarLayout (→ `AppShell`), AnnouncementBar (→ `Banner`) | StickyBar, CookieBanner → **recipes** | |
| Layout (20) | Stack, Center, Grid, Card + 5 parts, ScrollArea | HStack (→ `Row`), VStack (→ `Stack`), Container (→ `Center`), Section, Panel (→ `Surface`), AspectRatio (→ `Frame`) | PageHeader, Masonry, DraggablePanel → **recipes** | Spacer |
| Data display (8) | Table, List, DescriptionList, TreeView, VirtualList | MetaList (→ `DescriptionList inline`) | Timeline, ComparisonTable → **marketing** | |
| Display (21) | Badge, Avatar, AvatarGroup, Kbd, Separator (→ `Divider`), Image, Code, Anchor (→ `Link`), RelativeTime, NumberFormat, Stat, CopyButton | Dot, Tag (→ `Badge`), Quote, Truncate (→ `Text`), StatRow (→ `Stat` group) | CodeBlock, Markdown → **content**; ShareButton, QRCode → **media** | |
| Feedback (12) | Alert, EmptyState, ToastProvider (→ `Toast`), Progress, Spinner, Skeleton, SkeletonScope | Callout (→ `Alert`), ProgressCircle (→ `Progress shape="circle"`) | CountdownTimer, FactCarousel → **recipes**; SignGateBadge → **e-sign** | |
| Carousel (1) | Carousel | | | |
| Charts (7) | | | Line/Bar/Donut/Gauge charts, DistributionBar, HeatGrid, Sparkline → **charts** (first-party, a11y rework first) | |
| Calendars (4) | | | CalendarView, BookingCalendar, MeetingPlanner, ScheduleGrid → **scheduling** | |
| Marketing (11) | | | Hero, FeatureGrid, CTA, LogoCloud, Pricing/Testimonial/ProductCard, FAQ, Footer, NewsletterForm, SessionLobby → **marketing** | |
| Meet (13) | | | MeetingRoom … MeetingSidebar (LiveKit) → **meet** | |
| Motion / FX (16) | | MotionConfigProvider (→ theme motion tokens) | AnimatedGrid(+Item), MotionCard, ScrollReveal, Parallax ×3, TiltCard, MagneticElement, CountUp, Typewriter, ScrambleText, Confetti → **motion** | AnimatePresence (framer re-export), ModalBackdrop |
| Theme (5) | ThemeProvider (no `next-themes`), ThemeToggle | ThemeStyle (→ ThemeProvider) | Logo, FaviconSwitcher → app | |
| **Total 206** | **85** | **36** | **76** | **9** |

Not counted above:
- the `realtime/*` and `multiplayer/*` exports (`Live*`, `MultiplayerProvider`, `LiveCursorsOverlay`), which move to
  a **realtime** pack and belong in research 07's area;
- the ~60 icons, which become `Icon` plus a tree-shaken set.

The hooks barrel (`useLocalStorage`, `useDebounce`, `useMediaQuery` and others) has no place in weft. Every one of them
is a W025 React-ism; weft replaces them with `state`, `watch` and plain functions.

## 2. API consistency: what would trip an agent

Agents generalise from the first component they see. Each row below is a place where the second component breaks
the pattern of the first.

| # | Inconsistency | Evidence |
|---|---|---|
| A1 | **`onChange` payload varies.** Some get a DOM event, some a value, one gets `number \| ''`. | `inputs/text/FloatingBorderInput.tsx:142` (event) · `inputs/text/NumberInput.tsx:10` (`number \| ''`) · `pickers/select/Select.tsx:83` (`T`, never null) · `pickers/select/Combobox.tsx:27` (`V \| null`) · `inputs/choice/Switch.tsx:14` (`checked`) |
| A2 | **Value/handler names vary per component.** | `layout/disclosure/Tabs.tsx:13-14` `activeTab`/`onTabChange` · `layout/disclosure/Accordion.tsx:39` `value`/`onValueChange` · `layout/selection/Segmented.tsx:24` `value`/`onChange` · `carousel/Carousel.tsx:110` `onChange(index)` · `overlays/dialogs/Lightbox.tsx:19` `index`/`onIndexChange` · `data/lists/TreeView.tsx:19,23` `onSelect`/`onExpandedChange` |
| A3 | **Controlled vs uncontrolled varies.** Tabs, Select, Combobox and DatePicker are controlled-only. Menu and Carousel are uncontrolled-only: the index is internal (`Carousel.tsx:144`) yet there is an `onChange`. Switch, Popover and Accordion support both. Table sort is internal only (`Table.tsx:226`). | as cited |
| A4 | **The open/close vocabulary varies.** | `Modal.tsx:33-34` `open`/`onClose` · `Popover.tsx:25-26` `open`/`onOpenChange` · `AlertDialog.tsx:14` `onCancel` · `Callout.tsx:22` `onDismiss` · `Alert.tsx:11` `onClose` · `Menu.tsx:17-22` (no open prop) |
| A5 | **ARIA prop spelling.** `ariaLabel` appears 38 times and `'aria-label'` 4 times. Modal takes `aria-labelledby`, but Popover takes `ariaLabel`. | `Popover.tsx:28` · `Modal.tsx:58` · `Segmented.tsx:28` · `Switch.tsx:20` |
| A6 | **Variants are flags in one place and enums in another.** Button uses `fill`/`outline`/`borderSweep`/`idleAccent` booleans, so impossible combinations type-check. Badge uses `variant: soft\|solid\|outline`. | `buttons/core/Button.styles.ts:6-14` · `display/badges/Badge.tsx:6` |
| A7 | **Tone and size vocabularies drift.** Tone uses `default` (`OverflowMenu.tsx:20`), `neutral` (`Tag.tsx:5`) and `muted` (`ProgressCircle.tsx:4`). The brand name `gold` is used as a tone. Button has no `success`/`warning`. Sizes are `xs\|sm\|md` (Button), `sm\|md\|lg\|xl` (Modal) and `xs…xl` (Avatar). Stack `gap` is `xs…xl` (`Stack.tsx:4`), unlike PLAN's `related/section`. | as cited |
| A8 | **Three patterns for compound components.** Static members: `Menu.Item` (`Menu.tsx:159`). Sibling exports: `ModalHeader` and `CardHeader` (`Card.tsx:55-79`). Data arrays: `OverflowMenu items`, `Tabs tabs`, `ContextMenu items`. And `trigger` is a `ReactElement` modified with `cloneElement` (`Menu.tsx:18,50`; `Popover.tsx:19,90`). | as cited |
| A9 | **Refs and polymorphism are inconsistent.** 27 of about 185 `.tsx` files use `forwardRef`; Select, Combobox, DatePicker, Segmented, RadioGroup, Modal, Card and Stack don't. `as` exists only on Stack, Container, Section and Truncate. Button has no `href`/`as`, and links get a separate `PillLink` (`Pill.tsx:84`). | `grep forwardRef` |

**Also notable:**
- `isOpaque` is duplicated: an old copy at `Select.tsx:34` and a newer one in `inputs/text/label-background.ts`.
- Select, Combobox and DatePicker position their panels at `anchor.bottom + n` (`Select.tsx:242`,
  `Combobox.tsx:273`, `DatePicker.tsx:254`) with no flip. Menu, Popover and Tooltip use `useFloatingPosition`, which
  does flip and shift.
- Select and Combobox take no `name`/`id`, so they can't submit with a native form or receive `FormField`'s id
  (`Select.tsx:80-94`).

## 3. Accessibility audit (interactive core vs WAI-ARIA APG)

**What Agorix gets right, so we don't lose it:**
- Accordion has a proper button + region with `aria-controls` (`Accordion.tsx:159-186`).
- RadioGroup uses native radios (`RadioGroup.tsx:44`); Slider uses a native range.
- Switch uses `role="switch"`.
- `aria-current="page"` is set throughout the nav.
- Modal restores focus and avoids the stale-callback refocus bug (`Modal.tsx:234-263`).
- `useFocusTrap` skips hidden elements.
- The Carousel region has a roledescription and pauses on hover and focus.
- The IDREF fix, though it is uncommitted.

### Severity-ranked findings

**Critical** (a keyboard or screen-reader user can't complete the task)

| ID | Component | Problem | APG / WCAG |
|---|---|---|---|
| C1 | Menu, OverflowMenu, ContextMenu | `role="menu"` but no arrow, Home/End or typeahead handling, and focus is never moved into the panel. The panel is portaled to the end of `<body>`, so Tab from the trigger can't reach the items. No focus return. The separator has both `role="separator"` and `aria-hidden` (`Menu.tsx:27-99,156`; `OverflowMenu.tsx:87-113`; `ContextMenu.tsx:137-171`) | Menu Button pattern; 2.1.1 |
| C2 | Select (non-searchable) | Focus stays on the trigger and the arrow handler is on the panel (`Select.tsx:247,491`), so arrows never move the highlight. ArrowDown on the trigger re-runs open/toggle. The visible `<label>` has no `htmlFor` and the trigger has no name (`Select.tsx:533-535,415`). Options are `<button>`s, each a tab stop. | Select-only Combobox; 1.3.1, 2.1.1, 4.1.2 |
| C3 | Drawer, AlertDialog | Drawer sets `aria-modal` but doesn't move focus, trap it or restore it, and has no name (`Drawer.tsx:33-79`). AlertDialog has no trap or restore, and its ids `alert-dialog-title`/`-desc` are hard-coded, so a second instance collides (`AlertDialog.tsx:63-91`). | Dialog (Modal); 2.4.3 |
| C4 | Sidebar (collapsed rail, mobile) | Rail items are icon-only, and the label exists only in a Tooltip that isn't linked to the item, so links have no accessible name (`Sidebar.tsx:645-697`). The mobile drawer has no Escape, focus move or `inert` on the page behind. The edge tab has no `aria-expanded`/`aria-controls` (`Sidebar.tsx:188-191`). A drill-in button claims `aria-haspopup="menu"` (`:675`). | 4.1.2, 2.4.4 |

**High** (the pattern is wrong, or AA fails)

| ID | Component | Problem | APG / WCAG |
|---|---|---|---|
| H1 | Tabs | It's a row of plain buttons: no `tablist`/`tab`/`tabpanel`, no `aria-selected`, no arrow keys, no panels (`Tabs.tsx:21-57`) | Tabs pattern |
| H2 | Modal | Unnamed by default: `aria-labelledby` is optional and the id `ModalHeader` generates is never wired up (`Modal.tsx:58,367,403-409`). Escape is a document listener, so stacked layers all close (`:250-256`). `body.style.overflow=''` breaks nested modals. | Dialog; 4.1.2 |
| H3 | Combobox, MultiCombobox, CommandPalette | `role="listbox"` wraps the search `<input>`, and the options live in a separate `<ul>`. There's no `role="combobox"` or `aria-activedescendant`, and the input is unlabelled. The clear button is a `span role=button` nested inside a `<button>` (`Combobox.tsx:170-185,271-290`; `MultiCombobox.tsx:163,291`) | Combobox pattern; 4.1.2 |
| H4 | DatePicker (and Range/Month) | Days are named only by their number ("14", with no month or year). There's no grid role or arrow, PageUp/PageDown navigation; that's 42 tab stops. Focus isn't moved into the dialog and the trigger has no label prop (`DatePicker.tsx:207-228,250-277,326-330`) | Date Picker Dialog |
| H5 | Table | It's a `div` grid with no table, row, columnheader or cell semantics. Sort buttons expose no `aria-sort`. A clickable row is a `<button>` wrapping every cell, so nested controls are invalid and the row's name is the whole row's text (`Table.rows.tsx:45-55`; `Table.tsx:366-395`) | Table/Grid; 1.3.1 |
| H6 | Toast | `role="status"` is mounted together with its content (`Toast.tsx:100`), so many AT never announce it. Danger toasts aren't assertive. There's no pause on hover or focus, and a toast with an action still auto-dismisses at 4 s (`:53-54`) | 4.1.3, 2.2.1 |
| H7 | Reduced motion (kit-wide) | OS `prefers-reduced-motion` isn't read. `MotionConfigProvider disableAllMotion` is opt-in (`motion/MotionConfig.tsx:52-66`), and only 15 of 35 framer-motion files consult anything. Carousel autoplay and marquee have no pause/stop control (`Carousel.tsx:66-80`) | 2.3.3, 2.2.2 |
| H8 | Input, FormField | FloatingBorderInput's hint and error aren't linked by `aria-describedby` and aren't announced (`FloatingBorderInput.tsx:114-124,158`). FormField's `cloneElement` id is ignored by Select, Combobox and DatePicker, so `htmlFor` dangles. A child's own `aria-describedby` replaces the helper id instead of merging (`FormField.tsx:56-71`) | 1.3.1, 3.3.1 |
| H9 | Charts | `role="img"` with default names such as "Line chart". The `sr-only` value text inside `role="img"` is pruned as presentational (`BarChart.tsx:151,205`). Data is available only on hover, with no keyboard path and no table alternative; series differ only by colour | 1.1.1, 1.4.1 |
| H10 | Contrast (`theme/tokens.css`) | Computed values:<ul><li>input borders: `--border` 1.21:1 (dark), 1.28:1 (light); `--border-strong` 1.89:1 and 1.52:1, all below 3:1 (1.4.11);</li><li>dark `--danger` #c0392b on surface: 3.33:1 (error text at 11–12 px);</li><li>dark `--accent` text: 4.44:1;</li><li>light `--gold`: 3.64:1.</li></ul>Fine: `--muted` 6.2 / 5.4, `--text`. Also, uppercase 10 px muted labels are everywhere. | 1.4.3, 1.4.11 |

**Medium / Low**
- M1. **Tooltip** (`Tooltip.tsx:71-105`): no `aria-describedby` link, no Escape, and `pointer-events-none`, so it
  can't be hovered (1.4.13). It wraps the trigger in a `span`.
- M2. **Popover** (`Popover.tsx:107-141`): focus isn't moved into the panel or restored, and the portal breaks Tab
  order.
- M3. **Segmented** (`Segmented.tsx:47,106-115`): `radiogroup` with no arrow keys, and every radio is a tab stop.
- M4. **Carousel slides**: `aria-roledescription="slide"` on a plain `div`, with no `role="group"` or "n of m" label
  (`Carousel.modes.tsx:119`).
- M5. **`useDismiss`** (`hooks/useDismiss.ts:36-48`): `mousedown` only, with no touch or pointer events and no layer
  stack. Escape closes a Popover and the Modal under it together.
- M6. **Button with `aria-disabled`** still fires `onClick` on the non-touch path (`Button.interactions.ts:60-66,79-82`).
  A deferred touch click replays a stale React event.
- L1. English strings are hard-coded ("Close", "Dismiss", "Choose a date").
- L2. FloatingBorderCheckbox re-implements Space/Enter on a native button (`FloatingBorderCheckbox.tsx:45-62`). It's
  redundant; medium's dist removes it.
- L3. The `📅` glyph in DatePicker (`:138`).

### Shipped-only patches (SOURCE.md): are they in source?

| Patch (vendored in `~/dev/medium`) | In `agorix-discord` source? |
|---|---|
| ARIA IDREF: `aria-controls` only while the panel is mounted (Select, Menu, Popover, mobile Table row) | **Yes, but uncommitted.** It's in the working-tree diff (`Select.tsx:452-458,540`, `Menu.tsx:56`, `Popover.tsx:96`, `Table.rows.tsx:275`). One `git checkout` loses it. |
| LineChart Y-axis labels: static, no mount fade (medium 6e884ecfb) | **No.** Still `initial={{opacity:0}}` at `charts/series/LineChart.tsx:42-46`, and also missing on `codex/agorix-chart-system`. |
| Chart refresh f776aa7: `useReducedMotion`, `maxVisibleXLabels`, no infinite pulse | **Branch only.** Not merged into main. |
| Form-studio pass (medium 2af4403e2): Textarea `id`/hint `aria-describedby`; FloatingBorderCheckbox `aria-describedby` + `role` props, native keys | **No.** `Textarea.tsx:18-55` still uses `htmlFor={id}` with an undefined `id` and an unlinked hint. The Checkbox still has its own keydown at `:45` and has no `aria-describedby` prop. |
| `--btn-stroke-hover-text` (dark ink on stroke-button hover) | **No.** Not in `src/` (present in vendored `dist/tokens.css`). |
| Floating-label nbsp + background window, Sidebar fixed/sticky | **Yes, uncommitted.** It supersedes the vendored `whitespace-pre`. |

**Conclusion.** "FormField work" in SOURCE.md really means the Textarea and Checkbox field wiring; `FormField.tsx`
itself is identical in source and dist. Before any port, reconcile medium's `dist` with source and commit, so weft
ports the shipped behaviour and not an older one.

## 4. Tests

There are 29 files and 3,289 lines. Sixteen of them are realtime/data and outside this scope. The 13 component and
helper files:

| File | What it checks | Verdict (§7b) |
|---|---|---|
| `inputs/text/__tests__/label-background.test.ts` | pure `colorAlpha`/`isOpaque`/`computeLabelWindow` across color spaces | **Good.** Behavioural, and it would kill mutants. Port as-is. |
| `charts/series/LineChart.test.ts` (branch) | `visibleLineLabelIndexes` endpoints and bound | **OK but weak.** `size <= 7` survives many mutants; add exact-set cases (`test.prop`). |
| `overlays/dialogs/__tests__/SignGate.test.ts` | poller state machine and classifiers | **Good logic test.** Moves out with e-sign. |
| `feedback/status/__tests__/SignGateBadge.test.tsx` | Tailwind class strings (`bg-[var(--warning-soft)]`, `h-5`) | **T005** (implementation detail). `toneClassForState` vs `STATE_TONE` is **T002**: it checks a table against itself (`:56-63`). |
| `data/calendars/__tests__/render.smoke.test.tsx` | renders without throwing | `html.length > 0` (`:27`) is near-**T002**. `data-block-id` is **T005**. |
| `meet/__tests__/*` (6 files, 158 `expect`s) | layouts via `data-meet-*` and `data-testid`; clicks by walking React elements and calling `props.onClick()` directly | **T005**, plus not user-level: there are no DOM events, so a broken `disabled` or keyboard path still passes. Moving out anyway. |
| `scheduleGrid.helpers`, `meetingPlanner.helpers` | pure date math | Good. Moves out with scheduling. |

**Gaps:**
- There are **zero** tests for Button, Input, Select, Combobox, Menu, Popover, Dialog/Drawer, Tooltip, Tabs, Table,
  Toast, Sidebar, Carousel and DatePicker.
- `vitest.config.ts:19` sets `environment: 'node'`, so focus, keyboard, `aria-*` on live nodes and portals can't be
  tested at all. Every finding in §3 would pass the current suite.
- There's no axe run, no contrast check and no reduced-motion check.

## 5. Behaviour logic: port, replace with Zag, or go native

The Agorix behaviour hooks are each about 50–170 lines, and none handles layering, touch, RTL or typeahead. Zag
machines are framework-agnostic and expose `data-state` / `data-part`, which match Agorix's existing
`data-phase`/`data-state` styling hooks, so the sweep CSS can sit on top of them. PLAN §6 and REVIEW defer Zag for
v0, so the column says what v0 uses and what replaces it once `@weft/zag` lands.

| Component | Agorix today | v0 (native) | v1 engine | Port from Agorix |
|---|---|---|---|---|
| Button, IconButton | native `<button>` + sweep | native | — | sweep CSS, touch-feedback delay (opt-in) |
| Input/Textarea/Field | native + `cloneElement` | native + `Field` context (ids via context, not cloning) | — | `computeLabelWindow` floating label |
| Checkbox, Radio | custom `role=checkbox` button; native radio | native `<input>` | Zag `checkbox`/`radio-group` only if a styled indeterminate is needed | sweep visuals |
| Switch | `role=switch` button | `<input type=checkbox switch>` fallback | Zag `switch` | — |
| Select | hand-rolled listbox (C2) | native `<select>` (styled, `appearance: base-select` where supported) | **Zag `select`** | nothing |
| Combobox (+multi), CommandPalette | hand-rolled (H3) | — (ship in v1) | **Zag `combobox`** (palette = combobox in `<dialog>`) | filter fn |
| Menu, ContextMenu, Overflow | hand-rolled (C1) | native `popover` + manual roving (stopgap) | **Zag `menu`** (context, typeahead, submenus) | — |
| Popover, HoverCard | `useDismiss` + `useFloatingPosition` | **native `popover`** + anchor positioning with a JS fallback | Zag `popover`/`hover-card` | — |
| Tooltip | hover/focus timer (M1) | `popover="hint"`/manual + `aria-describedby` | **Zag `tooltip`** | — |
| Dialog, AlertDialog, Drawer | custom trap/Escape (C3, H2) | **native `<dialog>.showModal()`** (top layer, inert, Escape, focus) | keep native | motion presets (gated) |
| Tabs | buttons (H1) | — | **Zag `tabs`** | sliding-indicator measurement |
| Accordion | correct, hand-rolled | `<details name>` | Zag `accordion` | — |
| Toast | context + timers (H6) | — | **Zag `toast`** (pause, stack, live region) | tone icons |
| Carousel | 6 animation modes | — | **Zag `carousel`**, plus `marquee` for the marquee mode (verify machine availability) | mode visuals, drag math |
| DatePicker/Range/Month, TimePicker | hand-rolled (H4) | native `<input type=date>` | **Zag `date-picker`** (range, month and year views); time picker: check current Zag status | — |
| Slider/RangeSlider | native range / custom | native range | Zag `slider` (multi-thumb) | — |
| TagsInput, OTPInput, Rating, FileDropzone, ColorPicker, InlineEdit, NumberInput, PasswordInput | hand-rolled | native where possible | Zag `tags-input`, `pin-input`, `rating-group`, `file-upload`, `color-picker`, `editable`, `number-input`, `password-input` | masks, strength meter |
| SplitPane, TreeView, Pagination, Stepper, Segmented, Avatar, CopyButton, QRCode, DraggablePanel | hand-rolled | — | Zag `splitter`, `tree-view`, `pagination`, `steps`, `toggle-group`/`radio-group`, `avatar`, `clipboard`, `qr-code`, `floating-panel` | — |
| Table | div grid (H5) | **native `<table>`** + `aria-sort` | no Zag; port | priority column hiding, mobile card mode, sort helper |
| Sidebar, TopNav, BottomNav | custom (C4) | `<nav>` + `<dialog>` for the mobile drawer | Zag `navigation-menu` for TopNav dropdowns (verify) | sticky/fixed layout from the uncommitted diff |
| Charts | SVG + framer | — | no Zag; port | render math, `visibleLineLabelIndexes`; add a data-table alternative and keyboard focus per point |

**Drop:**
- `useDismiss`, `useFocusTrap`, `useFloatingPosition`, `useAnchorRect`, `FloatingPortal`, replaced by Zag's
  dismissable/popper layers and the native top layer;
- every `useX` utility hook (W025).

Modal's latest-callback-ref workaround is moot in weft, because components run once.

---

## 6. Scorecard (1–5, for porting into weft)

| Dimension | Score | Why |
|---|---|---|
| Visual identity and tokens | **4** | Distinctive sweep, CSS-variable tokens, `defineTheme`. Borders and dark danger fail contrast. |
| Breadth | **5** | 206 exports, which is more than weft needs. |
| API consistency | **2** | A1–A9. |
| Keyboard and focus (APG) | **1.5** | C1–C4 and H1–H4. Only Accordion, RadioGroup and Carousel arrows are right. |
| ARIA and labelling | **2** | Good intent (IDREF fix, `aria-current`), weak wiring (H2, H3, H8, C4). |
| Reduced motion | **1.5** | Opt-in only. The chart fix is on a branch. |
| Tests (meaningful) | **1.5** | Good pure-function tests, nothing for the interactive core, and no DOM. |
| Reusable behaviour logic | **2** | The hooks are simple and unlayered. Value is in the pure helpers and CSS. |
| Ease of re-theme / skip | **3** | Tokens are swappable, but Tailwind arbitrary values (`text-[10px]`) are baked into the markup. |

---

## 7. Recommendation

### 7.1 Canonical v1 component set (`weft/ds`, Agorix look as the default theme)

About 50 components, plus the 8 PLAN §6 layout primitives (`Stack Row Split Switch Grid Center Surface Frame`).

**Actions and inputs** (17): `Button`, `IconButton`, `ButtonGroup`, `Toolbar`, `Field`, `Input`, `Textarea`,
`NumberInput`, `PasswordInput`, `Checkbox`, `CheckboxGroup`, `RadioGroup`, `Switch`, `Slider`, `Select`, `Combobox`,
`DatePicker`.

**Overlays** (8): `Dialog` (with `AlertDialog` and `Drawer` as presets), `Popover`, `Tooltip`, `Menu`, `ContextMenu`,
`CommandPalette`, `Toast`, `Portal`.

**Disclosure and nav** (9): `Tabs`, `Accordion`, `Segmented`, `Breadcrumb`, `Pagination`, `Steps`, `NavList`,
`Sidebar`, `AppShell` (absorbing `TopNav`, `BottomNav` and `SidebarLayout`).

**Display and feedback** (16): `Text`, `Heading`, `Link`, `Badge`, `Avatar`, `Kbd`, `Divider`, `Icon`, `Table`,
`List`, `DescriptionList`, `Alert`, `Progress`, `Spinner`, `Skeleton`, `EmptyState`.

**Later in v1, behind Zag:** `TagsInput`, `PinInput`, `FileUpload`, `TreeView`, `Splitter`, `Carousel`, `Rating`,
`Editable`, `TimePicker`, `VirtualList`.

**Packs:** each pack is a separate package that depends only on `weft/ds` tokens and parts, so any of them can be
skipped:
- `@weft/ds-charts`
- `-motion`
- `-marketing`
- `-scheduling`
- `-meet`
- `-commerce`
- `-esign`
- `-content`
- `-recipes`

**How the requirements are met:**
- **Re-theme:** swap the seed. The Agorix tokens become a `{seed, pins}` recipe, and the sweep becomes an
  `@layer weft.agorix` CSS layer keyed on `data-part`/`data-state`.
- **Combine with other toolkits:** components emit `data-scope`/`data-part` and pass `class` through.
- **Skip entirely:** import `weft/ds/headless` (Zag/native parts, no styles).

### 7.2 API conventions every component follows

```ts
import type { State } from 'weft'

type Tone = 'neutral' | 'accent' | 'positive' | 'caution' | 'critical' | 'info'   // PLAN §6; 'gold' → theme pin
type Emphasis = 'ghost' | 'subtle' | 'soft' | 'solid' | 'outline'                 // replaces fill/outline/borderSweep flags
type Size = 'sm' | 'md' | 'lg'

/** One shape for every stateful control: value box OR value + callback, never both styles. */
type Bindable<T> =
  | { value: State<T>; defaultValue?: never; onValueChange?: (value: T, reason: ChangeReason) => void }
  | { value?: T; defaultValue?: T; onValueChange?: (value: T, reason: ChangeReason) => void }
type ChangeReason = 'pointer' | 'keyboard' | 'programmatic'

/** Overlays: same names everywhere (Dialog, Popover, Menu, Tooltip, Select, DatePicker, Sidebar drawer). */
type Openable = { open?: State<boolean> | boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void }

type Common = {
  id?: string                 // forwarded to the focusable control; Field provides one via context
  class?: string              // passthrough for Tailwind/other kits; no className-only props
  ref?: (el: HTMLElement) => void
  'aria-label'?: string       // real aria-* attributes, never ariaLabel
  'aria-labelledby'?: string
  'aria-describedby'?: string // MERGED with Field's hint/error ids, never replaced
}

// Parts are dotted members, one pattern for all compound components:
// <Menu> <Menu.Trigger/> <Menu.Content> <Menu.Item onSelect={…}/> <Menu.Separator/> </Menu.Content> </Menu>
// Data shorthand allowed only as `items={[…]}` on the root and lowered to the same parts.
// Triggers are parts (<X.Trigger>), never cloneElement'd props. Links: `href` on Button/Menu.Item renders <a>;
// no `as`, no separate *Link components.
// Text inputs: onValueChange(string) fires per input event (W042 already bans onChange-on-text).
// Every interactive component requires an accessible name at the type level: label | aria-label | aria-labelledby
// (a D0xx diagnostic "D010 missing accessible name" when none is statically present).
```

### 7.3 Behaviour engine

- **v0:** native `<dialog>`, `popover`, form controls and `<table>`, as PLAN §6 already says. Ship no hand-rolled
  composite widget. A component that needs a composite pattern (Menu, Select-with-search, Combobox, Tabs, DatePicker
  grid) waits for v1, or ships in a deliberately limited native form, for example `<select>` and
  `<input type=date>`.
- **v1:** `@weft/zag`. Write the ~200-line adapter from research 03, starting from the Solid adapter, and use it for
  every composite in §5.
- **Ports from Agorix:** `computeLabelWindow`, `visibleLineLabelIndexes`, Table's priority hiding and mobile card
  mode, and the sweep CSS. Nothing from `hooks/` comes across.
- **Reduced motion:** honoured by default. The theme's motion tokens collapse to 0 under
  `prefers-reduced-motion: reduce`, and any autoplay gets a visible pause control.

### 7.4 Test standard per component (enforced by `weft test --gate`)

Every v1 component ships tests in both lanes, written only with role, label and text queries (T005 clean):

1. **ARIA contract** (fast lane): `getByRole(role, { name })` for every part. The required states are asserted:
   `aria-expanded`, `-selected`, `-checked`, `-sort`, `-current`, `-invalid`, `-describedby`. Opt-in aria snapshot.
2. **APG keyboard map** (`--browser`, real focus): a table-driven `test.each` over the APG key list for the pattern
   (arrows, Home/End, typeahead, Escape, Tab out). Each row asserts `document.activeElement` and the value.
3. **Bindable round-trip:**
   - write the box, `flush()`, check the DOM;
   - user action, check the box and `onValueChange(value, reason)`;
   - same file, controlled and uncontrolled.
4. **Overlay lifecycle:** open moves focus in, Escape closes only the top layer, focus returns to the trigger, and an
   outside pointer dismisses. Layering is tested with Popover-in-Dialog.
5. **Field wiring:** `getByLabelText` resolves the control, and hint/error show up in its accessible description.
6. **axe** (`@axe-core/playwright` in the browser lane) with zero violations; **token contrast** is checked at build
   (PLAN §6 D-codes), including 3:1 for borders.
7. **Reduced motion:** with emulated `reduce`, there are no running animations or autoplay.
8. **Work budget** for lists, tables and option lists: `expect(interaction).toTouchAtMost(n)` (from v3-FINDINGS).
9. **Gate:** fail-before (T010) and at least one killed mutant per new test (T011). Pure helpers also need a
   `test.prop` law.

**Port order:**
- `label-background.test.ts` comes across verbatim.
- Agorix's class-string and React-tree-walking tests are not ported.
- For the ~50 v1 components, the §3 findings become the first fail-before cases. Each C/H item is a test that must
  fail against a naive port.

---

## Sources

- Agorix source: `~/dev/agorix-discord/packages/ui` (`src/index.ts`, files cited inline; `git status`/`git diff -- packages/ui`;
  `git diff HEAD...codex/agorix-chart-system`).
- Shipped patches: `~/dev/medium/vendor/agorix-ui/SOURCE.md`; `git -C ~/dev/medium show 6e884ecfb 2af4403e2 07de3ced8
  -- vendor/agorix-ui`.
- WAI-ARIA APG patterns: https://www.w3.org/WAI/ARIA/apg/patterns/ (menu-button, combobox, dialog-modal, tabs,
  carousel, grid/date picker dialog, table, tooltip, alert).
- WCAG 2.2: https://www.w3.org/TR/WCAG22/ (1.4.3, 1.4.11, 1.4.13, 2.1.1, 2.2.1, 2.2.2, 2.3.3, 2.4.3, 4.1.2, 4.1.3).
- Zag.js machines and adapter guide: https://zagjs.com/overview/introduction ·
  https://zagjs.com/guides/framework-adapters (machine availability for `marquee`, `time-picker`,
  `navigation-menu`, `password-input` to be re-checked when the adapter is written).
- Contrast ratios computed with the WCAG relative-luminance formula from `theme/tokens.css` values (alpha borders
  composited onto `--surface`).
- weft: `docs/PLAN.md` §2, §3, §6, §7b · `docs/research/03-design-language.md` §4 · `docs/research/05-testing-browser-cli.md`
  · `evals/results/v3-FINDINGS.md`.
