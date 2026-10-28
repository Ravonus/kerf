# warp review 03: accessibility and completeness

Reviewer: an independent judge who designed none of it. Date: 2026-10-28.

**Scope:**
- the nine specimens in `specimens/`;
- judged against `SIGNATURE.md`, the specs `02`–`09`, `COVERAGE.md` §1 and the P0/P1 rows of §2;
- checked against the original's failures in `docs/research/agorix/02-components-a11y.md` (C1–C4, H1–H10, M1–M6).

## Method

- **Browser.** Playwright 1.64 drove system Google Chrome, headless, against `http://localhost:4817`, at 1440×1000
  unless noted. axe-core was neither installed nor in the npm cache, so I didn't fetch it.
- **Hand-written checker** (injected per page). It checked:
  - duplicate ids;
  - broken or empty IDREFs (`for`, `aria-labelledby/-describedby/-controls/-owns/-activedescendant/-errormessage`);
  - invalid roles, required states and required context;
  - controls with no label, or labelled only by `aria-label`;
  - `aria-hidden` labels, and focusable elements inside `aria-hidden`;
  - nested interactive elements, positive tabindex, missing `alt`, heading skips and `main` count.
- **Accessible names.** Names came from Chrome's own accessibility tree (CDP `Accessibility.getFullAXTree` /
  `getPartialAXTree`), not from a heuristic. Every node with a name-required role and an empty name was resolved to
  its DOM selector.
- **Keyboard.** Table-driven walks over every visible instance:
  - menu buttons (Enter, ↓, End, Home, typeahead, Esc and focus return);
  - dialog triggers (focus in, name, 25 Tab/Shift+Tab presses for containment, Esc, focus return);
  - tablists (→, End, Home, tab stops, `aria-controls` → tabpanel);
  - comboboxes, by arrow and by typing (`aria-expanded`, `aria-activedescendant` validity, Enter, Esc);
  - grids and calendars (cell names, arrows, PageDown, Home, End);
  - toasts (announcer text, pause, F8);
  - carousels (controls, pause, slide groups).
- **Reduced motion.** I emulated `reduce`, scrolled the full page, hovered 25 sweep hosts and listed every running
  animation that changes anything other than opacity or colour. I also compared the focused and blurred end states of
  the fields under `reduce` and under `no-preference`.
- **Contrast.**
  - `node scripts/contrast-check.mjs` passes 804 of 804 checks (tightest: 4.52, dark positive-text on positive-soft).
  - I also sampled the rendered colour and the composited background of every visible text node, and the sweep, base
    and background of every `[data-sweep]` host, in light and dark.
- **Forced colours.** I emulated `forced-colors: active` and took before/after pixel diffs and screenshots of the
  focus and hover states of fields, buttons, chips, tabs, cards and invalid fields.
- **Coverage.**
  - I matched every §1 component (243 items across 36 rows) and every P0/P1 §2 row (186 rows) against the owner's
    spec text and the owner's rendered specimen DOM.
  - I checked every miss and every loose hit by hand.
  - "Works" means the interaction tests above pass, or a targeted smoke test passes (bulk bar, sortable, sort header,
    share dialog, event popover, move sheet, autocomplete).

## Scores per specimen (1–5)

| Specimen | Score | Why |
|---|---|---|
| `components.html` | **4** | The best in the set. Menus pass APG in full (arrows, Home/End, typeahead with repeat, Esc returns focus), and every native dialog contains and returns focus. Toasts use pre-mounted polite and assertive announcers, pause on focus and hover, and F8 reaches them. Docked by the nameless loading button, motion under `reduce`, and dead tabs in the device frames. |
| `inputs-rich.html` | **3** | The date grids are exemplary: full date names, one tab stop, ← → ↑ ↓, PageDown, Home and End (H4 fixed). All 11 picker popovers move focus in, close on Esc and return focus. But 31 fields hide the label and name the input by `aria-label`, against `03` §1's binding rule. Place of birth's combobox is broken. |
| `data.html` | **3** | The real `<table>` is good: `aria-sort`, bulk bar, applied-filter chips. 28 of 29 charts are focusable, and 27 have a table alternative (H9 fixed). Sortable works by keyboard and announces. The 2,000×120 scroll grid is semantically broken. The Columns popup doesn't close on Esc, and the flow edges keep animating under `reduce`. |
| `app.html` | **3** | The week calendar's keyboard model is excellent: arrows between events, `m` to move, Shift+arrows to resize, Enter/Esc, all announced. The share dialog and move sheet are right. But the Run-views and inbox tabs ignore the arrow keys, the mini calendar can't be reached by keyboard, and informational text uses `text-faint` at 3.66:1. |
| `foundations.html` | **3** | Clean on reduced motion, with identical end states. But all 39 fields use an `aria-hidden` span label plus `aria-label`, and none of the 18 visible hints or errors is linked by `aria-describedby` (H8 repeated). |
| `inputs.html` | **2** | The only specimen that follows the binding `<label for>` anatomy, and because of that it exposes a token bug. 84 of 89 field names come out letter-spaced ("F I R S T   N A M E"). The Search combobox ignores Esc. Chips, segmented controls, choice cards, knob, XY pad and dropzone sweep at 1.47:1 against their base. |
| `layout.html` | **2** | C1 is back: the shell's account and workspace menu has no arrow keys, typeahead or roving focus, and 12 triggers open it. The `aria-modal` command palette and the More sheet leak focus to the page behind (24 of 25 and 18 of 25 Tabs). Workbench tabs have no panels. 10 `<main>`s. |
| `flows.html` | **2** | C4 is back: 20 collapsed-rail links have no accessible name. 42 fields use `<label for>` but mark it `aria-hidden` and rename the input with `aria-label`. Duplicate ids across frames (`ck-t`, `n1`). 16 `<main>`s. The flows themselves (OTP, save bar, type-to-confirm, checkout, system states) are otherwise well wired. |
| `marketing.html` | **2** | The carousel is right (pause button, `role=group` "n of 6" slides, `aria-live` off while rotating) and so is the lightbox (modal, contained, returns focus). But the page forces `data-motion="full"` by default, so the marquee, parallax, reveals and sweeps all run under OS reduced motion. |

## Accessibility findings (severity-ranked)

Totals: **5 blockers, 13 major, 15 minor.**

### Blockers

**B1. The per-character label spans destroy the accessible name.**
- **Where:**
  - `tokens/warp.css:753`, `:where([data-scope="field"] [data-part="label"] [data-char]) { display: inline-block }`;
  - visible in `inputs.html`, every `[data-scope=field]` (84 of 89 controls).
- **What happens:** Chrome inserts a space between inline-block children when it computes the name. The names come
  out as "F I R S T   N A M E", "L a s t   n a m e", "S e a r c h   p r o j e c t s", and "P L A N Team" on select
  triggers.
  - The bug is latent in every specimen. The others mask it only by breaking the label a different way (B2's sibling,
    M1).
  - `innerText`, copy and find-in-page get one letter per line.
- **WCAG:** 1.3.1, 2.5.3, 4.1.2. It also breaks SIGNATURE §2.4 ("the real label stays available to screen readers")
  and this review's §6 check.
- **Fix:** make `[data-char]` `display: inline`, since colour transitions don't need a box. If a box is needed,
  render `<label for><span class="vh">First name</span><span aria-hidden="true">…char spans…</span></label>`. Add a
  browser-lane test: `getByLabelText('First name')` resolves, and its name equals the visible text.

**B2. Collapsed-rail navigation links have no name (C4 regression).**
- **Where:** `flows.html`, `div.app > div.shell > nav.shell-side > a`, the tablet frames of `#onboard`, `#settings`,
  `#plans` and `#system` (20 links).
- **What happens:** at rail width the label `<span>` is `display: none`, so the links' AX name is "". The icon is
  `aria-hidden`.
- **WCAG:** 2.4.4, 4.1.2.
- **Fix:** hide the label with the visually-hidden clip, never `display: none`, or set `aria-label` on the link. Wire
  the rail tooltip with `aria-describedby`. `02-layout.md` §6's accessibility contract already says this. Enforce it
  in `warp-flows.css`.

**B3. The shell account and workspace menu is not operable by keyboard (C1 regression).**
- **Where:** `layout.html`, `[data-scope="shell"] > [data-part="menu"][role="menu"]`, opened from `button.acct` and
  `#nav-* > button[data-part="switcher"]` (12 triggers across the shells).
- **What happens:**
  - Every `button.mi[role=menuitemradio]` is a tab stop (`tabindex=0`).
  - ↓, ↑, Home, End and typeahead do nothing (focus stayed on "Loom Studio" through every key).
  - The trigger has no `aria-controls`.
  - It also covers the P0 row "Workspace / org switcher".
- **WCAG:** 2.1.1, 4.1.2 (APG Menu Button).
- **Fix:** use the components menu behaviour, which passes every check in `components.html`: roving tabindex, arrows,
  Home/End, typeahead, and Esc returning focus.

**B4. `aria-modal` dialogs that don't contain focus.**
- **Where:** `layout.html`, `[data-scope="shell"] > [data-part="palette"][role="dialog"][aria-modal="true"]` (all
  12 shells) and `[data-part="sheet"]` (the phone "More" sheet, and the inspector sheet opened from `#ins1`).
- **What happens:**
  - Tab escapes to the page behind on 24 of 25 presses (palette) and 18 of 25 (sheet), and the page isn't `inert`.
  - After the inspector sheet closes, focus returns to the More button, not to `#ins1`.
- **WCAG:** 2.4.3, 1.3.2, 4.1.2 (`aria-modal` tells AT the rest of the page is gone).
- **Fix:** `<dialog>.showModal()`, as `components.html` does, or `inert` on the siblings while open. Return focus to
  the actual trigger.

**B5. marketing.html overrides the OS reduced-motion preference.**
- **Where:** `marketing.html:1303`, `motion: Q.get("motion") || "full"`, then `root.dataset.motion = s.motion`
  (`:1306`). `[data-motion="full"]` beats `@media (prefers-reduced-motion)` in `warp.css:210`.
- **What happens** under emulated `reduce`:
  - `mk-marquee` keeps translating the logo track (−64px → −95px in 700 ms);
  - `mk-parallax`, the bento, stats and plan reveal translates, the `mk-rule` clip-path and the announce-bar sweep all
    run.
- **WCAG:** 2.2.2 and 2.3.3. It also breaks `00` §8, `08` §1.5, and COVERAGE's "nothing loops while idle … pause
  under reduced motion".
- **Fix:** leave `data-motion` unset unless the user or the `?motion=` param chooses. Default to following the OS.

### Major

**M1. Field labels hidden from AT and replaced by `aria-label`.**
- **Where:**
  - span label `aria-hidden` plus input `aria-label`: `foundations.html` (39 fields, e.g. `#controls .fields
    [data-scope=field] input`), `inputs-rich.html` (31), `marketing.html` (5: `#nl-form`, `#details`), `data.html`
    (filters `#tbl-1-q`, `#tbl-4-q`, `#tbl-7-q`, `#tbl-10-q`, `#fp-15-q`);
  - `<label for>` marked `aria-hidden="true"` plus `aria-label`: `flows.html` (42, e.g. `label[for=email-1]`).
- **Why it matters:** `03` §1 decision 2 is binding: "a real `<label for>` … NOT aria-hidden … Don't add aria-label
  beside it." Span labels also lose click-to-focus, and `aria-label` drifts from the visible text.
- **WCAG:** 1.3.1, 2.5.3, 3.3.2.
- **Fix:** a real, un-hidden `<label for>` everywhere; delete the `aria-label`s. This only works once B1 is fixed.

**M2. foundations.html hints and errors aren't linked (H8 repeat).**
- **Where:** `#controls [data-scope=field] > [data-part=message]`. None of the 18 visible messages has an id
  referenced by the input. The 6 invalid fields do set `aria-invalid`.
- **WCAG:** 1.3.1, 3.3.1.
- **Fix:** give the message an id and merge it into `aria-describedby`, as `inputs.html` does (32 of 32 linked).

**M3. A loading button has no accessible name.**
- **Where:** `components.html` `#feedback`, `button[data-scope=button][data-loading][aria-busy=true]`. The label
  span is `visibility: hidden` while loading, so the AX name is "". The `05` §10 "M1" promise ("loading buttons keep
  focus and announce") is unmet.
- **WCAG:** 4.1.2.
- **Fix:** hide the label with `opacity: 0` or `color: transparent`, which keeps it in the AX tree, or set
  `aria-label`.

**M4. The large scroll grid has invalid grid semantics.**
- **Where:** `data.html` `#sgrid [data-scope=scroll-grid][role=grid]`.
- **What happens:**
  - 96 `gridcell` and `columnheader` elements sit directly in the canvas with no `role=row`.
  - `aria-activedescendant=""` never changes.
  - Arrow keys move the selection, but it is only "announced" by rewriting the grid's own `aria-label` ("…Selected
    metric_0002, day 2: 1,824"), which AT doesn't re-read on a focused element.
- **WCAG:** 1.3.1, 4.1.2 (APG Grid).
- **Fix:** virtualised `role=row` wrappers with `aria-rowindex`, and point `aria-activedescendant` at the active cell
  id. Or use roving focus on the cells.

**M5. The Columns popup lies about its type and won't close.**
- **Where:** `data.html` `#tbl-1 > [data-part=toolbar] .colmenu > button` (and `#tbl-4`, `#tbl-7`, `#tbl-10`).
- **What happens:**
  - `aria-haspopup="true"` means a menu, but it opens `[data-part=menu-pop][role=group]` of checkboxes.
  - There is no `aria-controls`.
  - Esc leaves `aria-expanded="true"` and the popup open.
- **WCAG:** 4.1.2, 2.1.1.
- **Fix:** `aria-haspopup="dialog"` with a popover, or a real menu of `menuitemcheckbox`. Esc closes it and returns
  focus.

**M6. Tablists without the APG keyboard.**
- **Where:**
  - `app.html` `#ai-desk aside [role=tablist][aria-label="Run views"]`: → End Home do nothing.
  - `section[data-scope=inbox] [role=tablist][aria-label=Filter]` (×2): no arrows, and no `aria-controls` or
    tabpanel.
  - "Calendar view": no Home/End.
  - `#cal-phone [data-part=strip][role=tablist]`: 7 tab stops, and arrows move focus without selecting.
  - `layout.html` `[data-scope=doc-tabs]`: no tabpanels, no Home/End, and a `span[data-part=close]` nested in each
    tab.
  - `components.html` `#devices .fa-main [role=tablist]` (×3 frames): no arrows, no panels.
- **WCAG:** 2.1.1, 4.1.2.
- **Fix:** reuse the components tabs controller. It passes for Release views, Range, Snippet and Settings sections.

**M7. The app mini calendar can't be reached by keyboard.**
- **Where:** `app.html` `aside[data-part=rail] > [data-part=mini][role=grid]`.
- **What happens:**
  - Every day button has `tabindex=-1` and there's no tab stop.
  - Outside days carry `aria-label=""`.
  - Month view `[data-part=month][role=grid]` and the availability `[data-part=timeline][role=grid]` have cells or
    `rowheader`s with no `role=row`.
- **WCAG:** 2.1.1, 1.3.1.
- **Fix:** one roving tab stop and the inputs-rich grid model, plus row wrappers.

**M8. `text-faint` (3:1) is used for information.**
- **Where:**
  - `app.html`: `[data-scope=tool-call] [data-part=dur]` ("0.6 s", 3.70), mini-calendar day numbers and weekday
    eyebrows (3.66), `[data-part=gutter-label]` "All day" (3.66), free-time labels, chat and activity timestamps
    (3.66–3.70, 10.5–11px);
  - `flows.html` `#system [data-part=meta]` paths (3.45).
- **Why it matters:** `01` §207 limits `text-faint` to disabled and decorative ink.
- **WCAG:** 1.4.3.
- **Fix:** `text-subtle` (≥ 4.5:1).

**M9. Controls sweep at 1.47:1 against their base.**
- **Where:** `inputs.html` (and `foundations.html`):
  - `button[data-scope=chip]`, `[data-scope=segmented]`, `[data-scope=choice-card]`, `[data-scope=knob]`,
    `[data-scope=xy-pad]`, `[data-scope=dropzone]`, `[data-scope=icon-tile]`, `[data-appearance=line]` fields;
  - their `sweep-base` is oklch(0.625), border-strong, not the ink. That gives sweep vs base of 1.47 (light) and
    1.34 (dark).
- **Why it matters:**
  - SIGNATURE's surfaces exception covers cards and panels only: "Sweep-vs-base ≥ 3:1 stays mandatory for fields and
    controls."
  - `contrast-check.mjs` checks only the field pair (3.04–3.15, a thin pass), so it can't see these hosts.
- **WCAG:** 1.4.11 (the state change is the indicator).
- **Fix:** an ink base for control hosts, and add these hosts to the contrast check.

**M10. There is no forced-colours design.**
- **Where:** only `warp-marketing.css:309` mentions `forced-colors`.
- **What happens in WHCM:**
  - `sweep` and `sweep-base` both become CanvasText, so "in" is indistinguishable from rest on cards (0 changed px on
    `[data-scope=surface][data-sweep]` hover).
  - Field focus survives only as a 1 → 1.5px border change and the label lift, because `warp.css:816` sets
    `[data-part=input]:focus-visible { outline: none }`.
  - Error borders lose their colour; icon and text still carry the error.
  - The frame button and chips stay visible.
- **WCAG:** 2.4.7, 1.4.11 (in forced colours).
- **Fix:** add `@media (forced-colors: active)` to the signature layer:
  - `[data-part=input]:focus-visible { outline: 2px solid Highlight }`;
  - `[data-part=sweep] { color: Highlight }`, base CanvasText;
  - a double or 2px border for `[data-invalid]`;
  - and specify it in `01-foundations.md`.

**M11. Things that still move under reduced motion.** Each item here moves under `reduce` (not counting B5):

| Specimen | What still moves |
|---|---|
| `components.html` | `[data-scope=spinner]` (rotate) and `[data-scope=skeleton]` shimmer (`warp.css:516` only covers `[data-shimmer]`), plus the indeterminate progress translate |
| `data.html` | `#flow path.edge` (`warp-dash`, looping), and the chart point `r` transitions in `#live` |
| `app.html` | the tool-call, live-status and lobby spinners, and the meet level bars (height) |
| `inputs.html` | the field spinner |

- **WCAG:** 2.3.3, plus the spec rule "nothing moves more than a fade" (SIGNATURE §3).
- **Fix:** under `reduce`, turn spinners into a static icon with an opacity pulse at most, stop the shimmer and dash,
  and snap the point radius.

**M12. Combobox defects.**
- **Where:**
  - `inputs.html` "Search projects" (`input[type=search][role=combobox]`): Esc leaves `aria-expanded=true`.
  - `inputs-rich.html` "Place of birth" (`input[role=combobox]`): typing opens it, but ↓ never sets
    `aria-activedescendant`, and Esc doesn't close it.
- **The rest passes:** Plan, Time zone, Language, Region, Team, City (autocomplete by typing), Country, Labels,
  components Status and Language.
- **WCAG:** 2.1.1, 4.1.2.

**M13. Duplicate ids across device frames.**
- **Where:**
  - `flows.html` `#ck-t` ×3, the checklist's `aria-labelledby` target, so the tablet and phone copies are named by
    the desktop heading;
  - `#n1` ×3 in the settings rows.
- **WCAG:** 1.3.1, 4.1.2.
- **Fix:** prefix ids per frame, as `layout.html` already does (`nav-1`…`nav-12`).

### Minor

| # | Finding | Where (selector) | WCAG | Fix |
|---|---|---|---|---|
| m1 | Icon SVGs exposed as unnamed images | `inputs.html` stepper `button > svg.ico`, error `svg.ico` (40); `data.html` view-toggle and `#layers` toggles (102); `marketing.html` `#pause-all > svg`, topbar icons (50); `foundations.html` chip check marks (16) | 1.1.1 | `aria-hidden="true" focusable="false"` in every icon helper |
| m2 | `aria-label` on a generic span or div (prohibited, so ignored) | `layout.html` `span[data-part=nav-count][aria-label="12 new"]` ×9; `components.html` `span[data-scope=badge][aria-label="3 unread"]`, `#ctx`; `data.html` git-status spans, `span[data-scope=avatar][aria-label="and 4 more"]`; `app.html` 26 (e.g. `[data-scope=sources]`, `[data-part=now]`, busy lanes); `flows.html` pay-frame slot; `inputs-rich.html` mention span | 4.1.2 | visually-hidden text, or a role (`img`/`group`) |
| m3 | Several `<main>` landmarks | `layout.html` ×10, `flows.html` ×16, `components.html` ×4 (device frames) | 1.3.1 | frames use `role=region` + `aria-label` |
| m4 | Heading levels skip | `flows.html` 15 (e.g. `#auth .notes h4` after h2); `data.html` `#cards h4`, `#k-0`; `layout.html` `#install` h1→h4; `marketing.html` `#facts h4` | 1.3.1 | step levels |
| m5 | Kanban "Move to" menu ignores Home/End; the disabled item uses `aria-disabled=""`, which means false | `data.html` `#board button[data-part=move]` | 2.1.1 | Home/End, `aria-disabled="true"` |
| m6 | Radio chip without `aria-checked` | `inputs-rich.html` `#ic-demo > .chips > button[data-scope=chip][role=radio]` | 4.1.2 | set `aria-checked` |
| m7 | Colour-area thumb `role=slider` lacks `aria-valuenow` | `inputs.html` `#color [data-part=area-thumb]` | 4.1.2 | two sliders, or `aria-valuenow` + `aria-valuetext` |
| m8 | Focusable file input with no label | `inputs.html` `#dz > input[type=file]` | 3.3.2 | `aria-labelledby` → dropzone title |
| m9 | Dialogs labelled by ids that exist only after opening | `app.html` `#ev-sheet`, `#move-sheet` (`aria-labelledby=ev-sheet-t` / `move-sheet-t`) | 4.1.2 (tests fail idle) | render the title node up front |
| m10 | The AI-label toggletip opens `role=dialog` but leaves focus on the trigger | `components.html` `#seltext [data-scope=ai-label]` → `#ai1` | 2.4.3 | move focus in, or don't claim `dialog` |
| m11 | Phase machine stuck at `out` on an invalid field under full motion (no `transitionend`, no backstop) | `foundations.html` third `#controls` field | n/a (end state ≠ reduced) | the duration + 150ms backstop from `03` §1.4 |
| m12 | Small text under 4.5:1 | `components.html` `[data-scope=pill] [data-part=count]` 3.56–3.68 at 10.5px; `flows.html` `#plans [data-scope=segmented] small` "−20%" 3.78; `flows.html` `#auth aside blockquote em` 2.85 at 28.5px; `inputs-rich.html` signature `[data-part=baseline]` 3.27 | 1.4.3 | subtle or text tokens |
| m13 | Control resting borders below ink | `layout.html` `[data-part=switcher]` base/bg 1.31; `data.html` outline buttons base/bg 1.51 | 1.4.11 (advisory, since labelled) | the ink base the spec promises |
| m14 | 404 resource on load | `foundations.html`, `components.html` (console) | n/a | fix the path |
| m15 | `aria-describedby` points at a hidden empty message | `flows.html` `#email-1-m[hidden]` etc. | n/a (harmless) | add the ref when the message shows |

### What the original got wrong and warp fixed (verified)

- **C1 (menus):** fixed in `components.html` (split, actions, menubar File/Edit/View, FAB speed dial), but not in the
  `layout.html` shell (B3).
- **C2 / H3 (select and combobox):** fixed for 12 of 14 comboboxes. They set `aria-activedescendant` to a real
  option, Enter selects, and Esc closes.
- **C3 / H2 (dialogs):** every `<dialog>` in components, marketing and app is named, contains focus (0 of 25 leaks)
  and returns it. Not fixed in the layout shells (B4).
- **H4 (date picker):** fixed. Cells read "Wednesday, October 28, 2026, today", with one tab stop, PageDown, Home and
  End.
- **H5 (table):** fixed in the `<table>` demos, including `aria-sort`. Not in the scroll grid (M4).
- **H6 (toast):** fixed. Pre-mounted polite and assertive announcers get "Saved. Workspace settings updated." and
  (assertive) "Sync failed…". Progress pauses on focus.
- **H7 (motion):** mostly fixed, except B5 and M11.
- **H8 (field wiring):** fixed in `inputs.html` (32 of 32), not in `foundations.html` (M2).
- **H9 (charts):** fixed. 28 of 29 are focusable, 27 have a table alternative, and none is an unnamed `img`.
- **C4 (rail names):** not fixed (B2).
- **M4 (carousel slides):** fixed (`role=group`, "1 of 6").

## Coverage

**The rule:** a row is ✓ only when both of these hold:
- the owner's spec has a section for it;
- the owner's specimen renders a demo that works.

**The labels:**
- **broken:** present, but an interaction fails (a finding above).
- **partial:** only part of the row is shown.
- **✗:** absent.

### §1 Original inventory (36 rows, 243 components)

| Result | Rows |
|---|---|
| Spec ✓, demo ✓ | 23 |
| Spec ✓, demo broken | 6 |
| Spec ✓, demo missing (in part) | 5 |
| Spec ✗, demo ✗ (in part) | 2 |

| # | Original row | Spec | Demo | Owner | Notes |
|---|---|---|---|---|---|
| 1 | buttons: Button, ButtonGroup, Toolbar, AnimatedHamburger | ✓ | ✓ | comp |  |
| 2 | carousel: Carousel (all modes) | ✓ | ✓ | market |  |
| 3 | charts: LineChart, BarChart, DonutChart, GaugeChart, HeatGrid, DistributionBar, Sparkline | ✓ | ✓ | data |  |
| 4 | data / tables: Table, ComparisonTable, ScrollableGrid, VirtualList, List, DescriptionList, TreeView, Timeline, | ✓ | broken | data | ScrollableGrid: gridcells without rows, empty `aria-activedescendant` (M4) |
| 5 | data / calendar and scheduling: CalendarView, CalendarGrid, DayCell, DayColumn, EventChip, EventPopover, Booki | ✓ | broken | app | CalendarGrid: mini month has no tab stop, month gridcells without rows (M7); MeetingMetaCard folded into the planner |
| 6 | display: Avatar, Badge, Tag, Kbd, Separator, Anchor, Image, Quote, MetaList, Truncate, NumberFormat, RelativeT | ✓ | ✗ | comp | QRCode: no demo anywhere (components defers to `08` §5.4, marketing has none); others ✓ |
| 7 | display / code and content: Code, CodeBlock, Markdown | ✓ | ✓ | rich |  |
| 8 | display / stats: Stat, StatRow, CountUp, Sparkline | ✓ | ✓ | data |  |
| 9 | display / expressive text: ScrambleText, Typewriter | ✓ | ✓ | market |  |
| 10 | feedback: Toast, Alert, Callout, Progress, ProgressCircle, Spinner, Skeleton, SkeletonScope, EmptyState, Count | ✓ | broken | comp | loading Button loses its name (M3); spinner/skeleton move under reduced motion (M11) |
| 11 | feedback / expressive: Confetti, FactCarousel | ✓ | ✓ | market |  |
| 12 | feedback / gating: SignGateBadge, SignGateBlocker, SignGateFlow (wallet or sign-in gate flow) | ✓ | ✗ | app | SignGate Badge/Blocker/Flow specced in `09` §2.4; no demo in flows.html or app.html |
| 13 | forms: FormField, KitForm, DynamicForm (schema-driven) | ✓ | ✓ | inputs | FormField hints unlinked in foundations only (M2) |
| 14 | inputs: every file in `inputs/**` | ✓ | broken | inputs; Address, Phone, PlaceLookup and PaymentCard go to rich | 84/89 field names letter-spaced (B1); Search projects Esc (M12); Address/Phone/PlaceLookup/PaymentCard in inputs-rich ✓, Place of birth broken (M12) |
| 15 | layout: Stack, Grid, Container, Section, Masonry, AspectRatio, ScrollArea, SplitPane, PageHeader, DraggablePan | ✓ | ✓ | layout |  |
| 16 | layout / surfaces and selection: Card, Panel, Accordion, Tabs, Segmented, Pill, ToggleChip, FilterPanel | ✓ | ✓ | comp (FilterPanel goes to data) | FilterPanel ✓ in data.html |
| 17 | marketing: Hero, CTA, FeatureGrid, LogoCloud, PricingCard, ProductCard, TestimonialCard, FAQ, NewsletterForm,  | ✓ | ✓ | market |  |
| 18 | meet (video): MeetingRoom, MeetingLobby, MeetingPrejoin, MeetingScheduledLobby, MeetingCountdown, MeetingTile, | ✓ | ✓ | app |  |
| 19 | nav: AppShell, Sidebar, TopNav, BottomNav, NavList, Breadcrumb, Stepper, AnchorNav, StickyBar, Banner, Announc | ✓ | broken | layout (Stepper goes to comp) | AppShell account/workspace menu has no keyboard (B3); palette and More sheet leak focus (B4); rail links unnamed in flows.html (B2) |
| 20 | overlays: Modal, AlertDialog, Drawer, Popover, Tooltip, HoverCard, Menu, ContextMenu, OverflowMenu, CommandPal | ✓ | ✓ | comp (Lightbox goes to market) | components.html overlays pass APG; Lightbox ✓ in marketing.html |
| 21 | pickers: Select, Combobox, MultiCombobox, ColorPicker | ✓ | broken | inputs | Select ✓; Combobox search Esc fails (M12) |
| 22 | pickers / dates: DatePicker, DateRangePicker, DateTimePicker, TimePicker, MonthPicker | ✓ | ✓ | rich |  |
| 23 | realtime and multiplayer UI: live cursors, presence avatars, synced state indicators, `.live` status | ✓ | ✓ | app |  |
| 24 | theme *(added)*: ThemeProvider (light, dark, system), ThemeToggle, Logo (theme-aware mark), FaviconSwitcher (f | ✓ | ✓ | comp (ThemeToggle, Logo); layout (ThemeProvider wiring, FaviconSwitcher). `defineTheme` / `ThemeStyle` stay with foundations (`01`) |  |
| 25 | icons *(added)*: the icon set in `icons/index.tsx` | ✓ | ✓ | comp, drawn to `00` §6 |  |
| 26 | motion *(added)*: Motion preset registry as a user-facing feature: 32 presets in 8 families (enter, modal, she | ✓ | ✓ | comp (registry and per-component override); market (the `fancy` family) | `fancy` presets demoed only in components.html, not marketing.html |
| 27 | motion components *(added)*: ScrollReveal, AnimatedGrid / AnimatedGridItem (staggered grid), MotionCard, Modal | ✓ | ✓ | market (ScrollReveal, AnimatedGrid, MotionCard); comp (ModalBackdrop) | AnimatedGrid = `data-reveal` stagger; MotionCard only as the tilt card |
| 28 | parallax *(added)*: Parallax (scroll), ParallaxScene + ParallaxLayer (layered depth hero), TiltCard (tilt, lif | ✓ | ✗ | market | Parallax, TiltCard, Magnetic ✓; no ParallaxScene/ParallaxLayer layered hero |
| 29 | hooks with visible behaviour *(added)*: `useShaderThemeTransition` (a shader wipe on theme change), `useSlidin | ✓ | ✗ | market (shader transition); comp (sliding indicator, overflow); data (infinite scroll); app (shortcuts and their help overlay); layout (FadeMask on ScrollArea) | useShaderThemeTransition: no demo; the others ✓ |
| 30 | multiplayer *(added, detail)*: LiveCursorsOverlay (peer cursors, click ripple, hover outline), LiveHover / Liv | ✓ | ✗ | app | MultiplayerAutoTrack: no demo; the others ✓ |
| 31 | realtime UI *(added, detail)*: PageCursorsLayer (cursors anchored to elements, so they line up across viewport | ✓ | ✓ | app; `useSmoothNumber` goes to data for live stats |  |
| 32 | data *(added)*: LiveTable (a resource-backed table with SSR hydration and realtime invalidation) | ✓ | ✓ | data |  |
| 33 | validation *(added)*: `useForm`, `V` validators, `zodErrorsToFieldMap` (maps errors to fields) | ✓ | ✓ | inputs |  |
| 34 | primitives *(added)*: HoverScope, `useIconSweepHover`, Dot, AvatarGroup, PillLink, HStack / VStack / Spacer /  | ✓ | ✓ | inputs (HoverScope, icon sweep); comp (Dot, AvatarGroup, PillLink); layout (the rest) |  |
| 35 | sandbox recipes *(added)*: **Chat:** channel list, bubbles, composer. **Dashboard:** KPI header, capacity gaug | ✗ | ✗ | app (chat, login, settings, notification feed, danger zone); data (dashboard, activity table); market (marketing page, marketplace listing card) | Marketplace listing grid, filter rail and stats strip: no spec section or demo (market); the other recipes ✓ |
| 36 | realtime sandbox recipes *(added)*: presence with a typing indicator, streaming agent chat over SSE, transport | ✗ | ✗ | app (the data-integrity panel is a dev tool, P2) | all-inputs sync: no spec or demo; data-integrity panel (P2) no demo; presence+typing, SSE, transport, reconnect ✓ |


**Missing or stubbed in §1:**
- QRCode;
- SignGate Badge, Blocker and Flow;
- ParallaxScene and ParallaxLayer;
- useShaderThemeTransition;
- MultiplayerAutoTrack;
- the Marketplace recipe;
- all-inputs sync;
- the data-integrity panel (P2).

**Owner mismatches:**
- the `fancy` motion presets are demoed only in components;
- QRCode is assigned to comp but deferred to `08`.

### §2 P0 and P1 rows (186 rows)

| Result | Rows |
|---|---|
| Spec ✓, demo ✓ | 160 |
| Spec ✓, demo broken | 8 |
| Spec ✓, demo partial | 3 |
| Spec ✓, demo ✗ | 12 |
| Spec ✗, demo ✗ | 3 |

| Line | Row | P | Spec | Demo | Owner | Notes |
|---|---|---|---|---|---|---|
| 102 | Field / Fieldset primitives (label, description, error, required mark, group legend) | P0 | ✓ | ✓ | inputs |  |
| 103 | Native select | P1 | ✓ | ✓ | inputs |  |
| 104 | Checkbox card / radio card | P0 | ✓ | ✓ | inputs |  |
| 105 | Toggle and ToggleGroup (pressed state, single or multi) | P0 | ✓ | ✓ | comp |  |
| 106 | Autocomplete (free text with suggestions, not constrained to options) | P1 | ✓ | ✓ | inputs | works by typing |
| 107 | Listbox (standalone, always-open selectable list) | P1 | ✓ | ✓ | inputs |  |
| 111 | Checkbox tree with indeterminate parents | P1 | ✓ | ✓ | inputs |  |
| 112 | Character counter and max length | P1 | ✓ | ✓ | inputs |  |
| 113 | Password strength meter and rules checklist | P1 | ✓ | ✓ | inputs |  |
| 118 | Color swatch picker and swatch display | P1 | ✓ | ✓ | inputs |  |
| 121 | File upload list with per-file progress, retry and remove | P0 | ✓ | ✓ | inputs |  |
| 122 | Multi-step form / wizard with per-step validation | P0 | ✓ | ✓ | inputs |  |
| 123 | Unsaved-changes guard and save bar | P1 | ✓ | ✓ | inputs |  |
| 124 | Form autosave indicator (saving, saved, failed) | P1 | ✓ | ✓ | inputs |  |
| 126 | Mentions input (@user, #channel triggers in a textarea) | P0 | ✓ | ✓ | rich |  |
| 127 | Rich text editor (toolbar, bubble menu, slash menu, links, lists, tables, images) | P0 | ✓ | ✓ | rich |  |
| 128 | Markdown editor with preview | P1 | ✓ | ✓ | rich |  |
| 129 | Code editor input (syntax highlight, line numbers, lint markers) | P1 | ✓ | ✓ | rich |  |
| 130 | JSON / schema editor and viewer (collapsible tree) | P1 | ✓ | ✓ | rich |  |
| 131 | Emoji picker | P1 | ✓ | ✓ | rich |  |
| 133 | Date input (typed, segmented day/month/year) | P0 | ✓ | ✓ | rich |  |
| 134 | Year, quarter and week pickers | P1 | ✓ | ✓ | rich |  |
| 135 | Date-range presets panel (Today, Last 7 days, This quarter) and comparison range | P0 | ✓ | ✓ | rich |  |
| 137 | Time zone picker (search, offsets, current time) | P1 | ✓ | ✓ | rich |  |
| 138 | Recurrence rule editor (RRULE: daily, weekly on, until, count) | P1 | ✓ | ✓ | rich |  |
| 139 | Inline calendar (standalone, multi-month, multi-select) | P0 | ✓ | ✓ | rich |  |
| 140 | Image crop / avatar cropper (zoom, rotate, aspect) | P1 | ✓ | ✓ | rich |  |
| 142 | Speech input with mic selector | P1 | ✗ | ✗ | app | only meeting mic mute; no speech input or mic selector |
| 149 | Collapsible / Disclosure (single, not an accordion) | P0 | ✓ | ✓ | comp |  |
| 150 | Popconfirm (inline confirm anchored to a button) | P1 | ✓ | ✓ | comp |  |
| 151 | Toggletip / contextual help (click-to-open info) | P1 | ✓ | ✓ | comp |  |
| 152 | Split button (primary action plus menu) | P1 | ✓ | ✓ | comp |  |
| 153 | Floating action button and speed dial | P1 | ✓ | ✓ | comp |  |
| 155 | Menu with checkbox and radio items and submenus | P0 | ✓ | ✓ | comp |  |
| 156 | Bottom sheet with snap points and drag to dismiss | P0 | ✓ | ✓ | comp |  |
| 157 | Overlay / modal manager (imperative open, stacking, `confirm()` helper) | P1 | ✓ | ✓ | comp |  |
| 158 | Item / list row (media, title, description, meta, actions) | P0 | ✓ | ✓ | comp |  |
| 159 | Persona (avatar, name, secondary text, presence) | P1 | ✓ | ✓ | comp |  |
| 160 | Avatar with presence/status ring and fallback initials | P0 | ✓ | ✓ | comp |  |
| 161 | Meter (value in a known range, distinct from progress) | P1 | ✓ | ✓ | comp |  |
| 162 | Status light / indicator with label | P0 | ✓ | ✓ | comp |  |
| 163 | Inline loading and button loading states | P0 | ✓ | broken | comp | loading button loses its name (M3) |
| 164 | Toast with promise, action, undo and stacking | P0 | ✓ | ✓ | comp |  |
| 165 | Global message bar / section message (full-width, in-page) | P1 | ✓ | ✓ | comp |  |
| 166 | Highlight / mark (matched-text highlight) | P1 | ✓ | ✓ | comp |  |
| 167 | Link overlay (whole card clickable, inner links still work) | P1 | ✓ | ✓ | comp |  |
| 169 | Stopwatch / elapsed timer | P1 | ✓ | ✓ | comp |  |
| 170 | Format helpers: bytes, duration, list, unit, compact numbers | P1 | ✓ | ✓ | comp |  |
| 171 | Selection / floating text toolbar | P1 | ✓ | ✓ | comp |  |
| 172 | Tour step popover primitive (anchored, with step count) | P1 | ✓ | ✓ | comp |  |
| 173 | Visually hidden | P0 | ✓ | ✓ | comp |  |
| 174 | Live region / announcer | P0 | ✓ | ✓ | comp |  |
| 175 | Focus scope and focus ring utilities | P0 | ✓ | ✓ | comp |  |
| 176 | Language / locale switcher | P1 | ✓ | ✓ | comp |  |
| 177 | Theme switcher (light, dark, system, as a menu or segmented) | P0 | ✓ | ✓ | comp |  |
| 178 | Density control (compact, cozy, comfortable) | P1 | ✓ | ✓ | comp |  |
| 179 | The warp dial as a user control (quiet ↔ balanced ↔ vivid) | P1 | ✓ | ✓ | comp |  |
| 187 | Navigation menu / mega menu | P1 | ✓ | ✓ | layout |  |
| 188 | Navigation rail | P1 | ✓ | ✓ | layout |  |
| 189 | Underline / tab navigation (route tabs) | P0 | ✓ | ✓ | layout |  |
| 190 | Route progress bar (top loading bar) | P1 | ✓ | ✓ | layout |  |
| 191 | Inspector / right panel (property panel that docks beside content) | P1 | ✓ | ✓ | layout |  |
| 196 | Dashboard grid (draggable, resizable widgets) | P1 | ✓ | ✓ | layout |  |
| 197 | Sticky / affix and scroll-to-top | P1 | ✓ | ✓ | layout |  |
| 198 | Wrap / cluster, bleed and inset | P1 | ✓ | ✓ | layout |  |
| 199 | Skip link | P0 | ✓ | ✓ | layout |  |
| 200 | Direction provider (RTL) and locale provider | P0 | ✓ | ✓ | layout | Direction toggle in the layout toolbar |
| 201 | Settings layout (section nav plus forms) | P0 | ✓ | ✓ | layout |  |
| 202 | Docs layout (left nav, content, "on this page" TOC with scroll spy, prev/next pager) | P1 | ✓ | ✓ | layout |  |
| 203 | Workspace / org switcher in the shell | P0 | ✓ | broken | layout | switcher menu has no keyboard (B3) |
| 210 | Data grid: column resize, reorder, pin, hide; sort; per-column filters; virtualised rows a | P0 | ✓ | broken | data | DataGrid table ✓; the 2,000×120 grid is semantically broken (M4) |
| 211 | Grid: inline cell editing and validation | P1 | ✓ | ✓ | data |  |
| 212 | Grid: row grouping, aggregation, tree data, master/detail expansion | P1 | ✓ | ✓ | data |  |
| 214 | Grid: export (CSV, XLSX), copy/paste ranges, clipboard | P1 | ✓ | ✓ | data |  |
| 215 | Grid: saved views (columns, filters, sort as a named view) | P1 | ✓ | ✓ | data |  |
| 216 | Bulk action bar (appears on selection) | P0 | ✓ | ✓ | data |  |
| 217 | Applied-filter chips with "clear all" | P0 | ✓ | ✓ | data |  |
| 218 | Faceted search results (facet counts, sort, result highlighting) | P1 | ✓ | ✓ | data |  |
| 219 | Cursor "load more" and infinite list | P1 | ✓ | ✓ | data |  |
| 220 | Sortable / reorderable list (keyboard and pointer drag) | P0 | ✓ | ✓ | data |  |
| 222 | Area, stacked and percent bar, and combo (bar + line) charts | P0 | ✓ | ✓ | data |  |
| 223 | Pie, radial bar and funnel charts | P1 | ✓ | ✓ | data |  |
| 224 | Scatter and bubble charts | P1 | ✓ | ✓ | data |  |
| 229 | Bar list (ranked horizontal bars with labels) | P0 | ✓ | ✓ | data |  |
| 230 | Tracker / uptime bar | P1 | ✓ | ✓ | data |  |
| 231 | Chart interaction: shared tooltip, crosshair, legend toggle, brush and zoom, reference lin | P0 | ✓ | ✓ | data |  |
| 232 | Live streaming chart (rolling window) | P1 | ✓ | ✓ | data | live price plot in #live |
| 233 | Calendar heatmap (contribution graph) | P1 | ✓ | ✓ | data |  |
| 235 | Interactive map (tiles, markers, clusters, popups, fit bounds) | P1 | ✓ | ✓ | data |  |
| 238 | Diff viewer (split and unified, inline word diff) | P1 | ✓ | ✓ | rich |  |
| 239 | Log viewer / terminal output (ANSI colour, follow tail, search) | P1 | ✓ | ✓ | rich |  |
| 242 | File tree (expand, select, icons by type, git status) | P1 | ✓ | ✓ | data |  |
| 249 | Prose / typography styles for rendered HTML | P0 | ✓ | ✓ | rich |  |
| 250 | Code group / code tabs (several languages or package managers) | P1 | ✓ | ✓ | rich |  |
| 251 | Snippet / one-line command with copy | P1 | ✓ | ✓ | rich |  |
| 252 | Heading anchors with copy-link | P1 | ✓ | ✓ | rich |  |
| 257 | Link preview card (unfurl: title, image, site) | P1 | ✓ | ✓ | rich |  |
| 264 | Video player (custom controls, captions, chapters, speed, PiP, fullscreen) | P1 | ✓ | ✗ | market |  |
| 265 | Audio player with waveform and scrub | P1 | ✓ | ✗ | market |  |
| 266 | Image gallery grid with selection | P1 | ✓ | ✓ | market |  |
| 267 | Zoom and pan image viewer | P1 | ✓ | ✓ | market |  |
| 271 | Product gallery (thumbnails, zoom on hover, video slides) | P1 | ✓ | ✓ | market |  |
| 272 | Variant picker (colour swatches, sizes with stock state) | P1 | ✓ | ✓ | market |  |
| 273 | Reviews: rating summary histogram, review list, write a review | P1 | ✓ | ✓ | market |  |
| 274 | Cart drawer / mini-cart with quantity steppers | P1 | ✓ | ✓ | app |  |
| 275 | Checkout flow (address, shipping options, payment, review, confirmation) | P1 | ✓ | ✓ | app |  |
| 276 | Order summary, coupon field, order status tracker | P1 | ✓ | ✓ | app |  |
| 277 | Device and browser mockups (phone, browser, laptop frames) | P1 | ✓ | ✓ | market |  |
| 283 | Sign-in / sign-up screens (email, password, social buttons, magic link sent state) | P0 | ✓ | ✓ | app |  |
| 284 | Passkey (WebAuthn) prompts: create, sign in, manage passkeys | P1 | ✓ | partial | app | passkey sign-in button and "Add passkey" row; no create/manage prompt |
| 285 | MFA setup (QR, TOTP confirm, backup codes) and challenge | P1 | ✓ | partial | app | OTP challenge ✓; no QR/TOTP setup or backup-code screen |
| 286 | Password reset and email verification flows | P0 | ✓ | ✓ | app |  |
| 287 | Session expired / re-authenticate modal | P1 | ✓ | ✗ | app |  |
| 288 | Invite accept / join workspace screen | P1 | ✓ | ✗ | app | only a tour tip mentions invites |
| 289 | Onboarding checklist (progress, dismiss, deep links) | P1 | ✓ | ✓ | app |  |
| 290 | Product tour (multi-step, spotlight cut-out, beacons) | P1 | ✓ | ✓ | app |  |
| 292 | Notification center / inbox (tabs, unread, group by day, mark all read, archive) | P0 | ✓ | broken | app | filter tabs ignore arrow keys (M6) |
| 293 | Notification bell with count and preview popover | P0 | ✓ | ✓ | app |  |
| 294 | Notification preferences matrix (event × channel) | P1 | ✓ | ✓ | app |  |
| 296 | Activity feed (actor, verb, object, time, grouped) | P0 | ✓ | ✓ | app |  |
| 297 | Keyboard shortcuts help overlay (`?`) | P1 | ✓ | ✓ | app |  |
| 303 | Conversation list (unread, last message, presence, pinned, muted) | P0 | ✓ | ✓ | app |  |
| 304 | Message thread: bubbles, grouping, day dividers, unread marker, jump to latest, stick to b | P0 | ✓ | ✓ | app |  |
| 305 | Composer with attachments, emoji, mentions, send-on-enter | P0 | ✓ | ✓ | app |  |
| 306 | Typing indicator, read receipts, delivery state | P1 | ✓ | ✓ | app |  |
| 307 | Reactions (picker plus counts with who reacted) | P1 | ✓ | ✓ | app |  |
| 308 | Reply-in-thread and quote reply | P1 | ✓ | ✓ | app |  |
| 310 | Comment thread (resolve, edit, delete, reply) | P0 | ✓ | ✓ | app |  |
| 311 | Anchored / inline comments (on text range, on canvas pin, margin rail) | P1 | ✓ | ✓ | app |  |
| 312 | Share dialog (invite by email, role per person, link access, copy link) | P0 | ✓ | ✓ | app |  |
| 313 | Presence avatar stack with "following" mode | P1 | ✓ | ✓ | app |  |
| 314 | Peer selection highlights in text and on canvas | P1 | ✓ | ✓ | app |  |
| 315 | Conflict and stale-data indicators ("edited by X, reload / merge") | P1 | ✓ | ✓ | app |  |
| 317 | Version history panel (list, preview, restore, named versions) | P1 | ✓ | ✓ | app |  |
| 318 | Role / permission matrix (roles × capabilities) | P1 | ✓ | ✗ | app | share dialog has roles per person; no roles × capabilities matrix |
| 324 | Streaming message (incremental Markdown render, streaming caret, no layout jump) | P0 | ✓ | ✓ | app |  |
| 325 | Prompt input (autosize, attachments, tool toggles, submit / stop, model picker slot) | P0 | ✓ | ✓ | app |  |
| 326 | Model selector (provider groups, capabilities, cost, context size) | P0 | ✓ | ✓ | app |  |
| 327 | Reasoning / thinking block (collapsible, duration, streams then collapses) | P0 | ✓ | ✓ | app |  |
| 328 | Tool-call card (name, input, streaming state, output, error, duration) | P0 | ✓ | ✓ | app |  |
| 329 | Tool approval / confirmation (approve, deny, edit arguments, remember) | P0 | ✓ | ✓ | app |  |
| 330 | Inline citations and sources list (hover preview, numbered refs) | P0 | ✓ | ✓ | app |  |
| 331 | Message actions (copy, retry, edit, branch, thumbs feedback) and branch switcher | P0 | ✓ | ✓ | app |  |
| 332 | Suggestions / starter prompts | P1 | ✓ | ✓ | app |  |
| 333 | Plan, task list and queue (agent steps with status) | P0 | ✓ | broken | app | "Run views" tabs ignore arrow keys (M6) |
| 334 | Agent run trace / timeline (spans, timings, tokens, nested calls) | P1 | ✓ | ✓ | app |  |
| 335 | Context and usage meter (context window used, tokens, cost) | P1 | ✓ | ✓ | app |  |
| 336 | Artifact / canvas side panel (preview, code, versions) | P1 | ✓ | ✗ | app |  |
| 337 | Question / ask-user form (agent asks single or multi choice, free text) | P1 | ✓ | ✓ | app |  |
| 338 | Checkpoint / restore point in a conversation | P1 | ✓ | ✓ | app |  |
| 339 | Shimmer / thinking text placeholder | P1 | ✓ | ✓ | app |  |
| 344 | AI label / AI-generated marker and explainability popover | P1 | ✓ | ✓ | comp |  |
| 351 | Calendar week and day views (time grid, all-day row, now line, overlap layout) | P0 | ✓ | ✓ | app |  |
| 352 | Agenda / list view and year view | P1 | ✓ | ✓ | app |  |
| 353 | Resource / timeline view (rows of people or rooms over time) | P1 | ✓ | ✓ | app |  |
| 354 | Event drag, resize and create-by-drag with snapping | P0 | ✓ | ✓ | app |  |
| 355 | Recurring events and time-zone aware display | P1 | ✓ | ✓ | app |  |
| 356 | Availability editor (weekly hours, date overrides) | P1 | ✓ | ✗ | app | availability timeline only; no weekly-hours/overrides editor |
| 358 | Kanban board (columns, card drag, swimlanes, WIP limits, quick add) | P1 | ✓ | ✓ | app |  |
| 359 | Plan picker / upgrade (current plan, compare, monthly / annual toggle) | P0 | ✓ | ✓ | app |  |
| 360 | Usage meters with quotas and overage | P0 | ✓ | ✓ | app |  |
| 361 | Invoices / billing history table and payment methods list | P1 | ✓ | partial | app | "Invoices" heading only; no billing history table or payment-method list |
| 362 | Seat management (members, roles, invite, remove) | P0 | ✓ | ✗ | app | seat meters only; no members table with invite/role/remove |
| 363 | API keys manager (create, reveal once, copy, revoke, scopes) | P1 | ✓ | ✗ | app |  |
| 364 | Webhooks / integrations grid (connect, status, configure) | P1 | ✗ | ✗ | app | "Integrations" is a nav label only |
| 365 | Danger zone (delete, transfer, type-to-confirm) | P0 | ✓ | ✓ | app |  |
| 366 | CRUD resource pages (list → detail → edit → create, generated from a schema) | P0 | ✓ | ✓ | data |  |
| 367 | Audit log viewer (actor, action, target, diff, filters, export) | P1 | ✓ | ✗ | app | "audit log export" appears only as a plan feature |
| 368 | CSV import wizard (upload, column mapping, validation preview) | P1 | ✗ | ✗ | app |  |
| 371 | Result pages (success, 403, 404, 500) | P0 | ✓ | ✓ | app |  |
| 372 | Offline banner and reconnecting indicator | P0 | ✓ | ✓ | app |  |
| 373 | Maintenance page and status banner | P1 | ✓ | ✗ | app | system states show 404, 500, offline, stale deploy and rate limit only |
| 374 | Error boundary fallback (retry, report, details) | P0 | ✓ | ✓ | app | 500 page with Retry and Report |
| 375 | Update available / reload prompt | P1 | ✓ | ✓ | app | stale deploy state |
| 376 | Rate-limited / quota-exceeded state | P1 | ✓ | ✓ | app |  |
| 382 | Bento grid | P0 | ✓ | ✓ | market |  |
| 383 | Marquee (logos, testimonials, pause on hover, vertical) | P0 | ✓ | broken | market | keeps scrolling under OS reduced motion (B5) |
| 384 | Spotlight / cursor-glow card | P1 | ✓ | ✓ | market |  |
| 385 | Border beam / shine border (travelling light along the border; a sibling of the sweep) | P1 | ✓ | ✓ | market |  |
| 386 | Animated backgrounds: gradient / aurora, grid, dot and noise patterns, retro grid, light r | P1 | ✓ | broken | market | animates under OS reduced motion (B5) |
| 388 | Text effects: gradient and shiny text, word rotate, morphing text, text reveal on scroll,  | P1 | ✓ | ✓ | market |  |
| 389 | Scroll-driven sections: sticky scroll reveal, container scroll, scroll progress bar, scrol | P1 | ✓ | broken | market | scroll reveals move under OS reduced motion (B5) |
| 394 | Before/after compare slider | P1 | ✓ | ✓ | market |  |
| 400 | Pricing table with monthly / annual toggle and feature matrix | P0 | ✓ | ✓ | market |  |
| 401 | Testimonial wall (masonry, social embeds) | P1 | ✓ | ✗ | market | quotes exist only as a carousel |
| 402 | Team, blog index, changelog, contact and waitlist sections | P1 | ✓ | ✓ | market |  |


**The §2 gaps:**
- **Missing:**
  - **P0:** seat management (`app`/`09` §4.2 has a spec but no members, invite, role or remove demo).
  - **P1:**
    - video player and audio player (`08` §5.3);
    - session-expired re-auth, invite accept, API keys, audit log, maintenance page, role matrix and availability
      editor (all specced, none demoed);
    - the artifact panel (`07` §1.3);
    - the testimonial wall (`08` §3.6).
- **No spec and no demo:**
  - speech input with a mic selector;
  - the integrations grid;
  - the CSV import wizard.
- **Partial:** passkey management, MFA setup, and the invoices and payment-methods list.
- **Broken:**
  - button loading (M3);
  - the workspace switcher (B3);
  - the data grid at scale (M4);
  - the notification inbox and agent plan tabs (M6);
  - the marquee, animated backgrounds and scroll-driven sections under reduced motion (B5).

**Caveat:** demo presence was matched by DOM selector or text, and I hand-checked every miss and loose hit. "✓" for
rows I didn't drive interactively means the demo renders and matches the spec's anatomy, not that every sub-feature
was exercised. The rows I drove are listed in Method.

## Fix order

1. **B1** (one token line in `warp.css`), then **M1** across the five specimens. Together they restore real
   `<label for>` names kit-wide.
2. **B3** and **B4**: port the components menu and `<dialog>` into the layout shell.
3. **B5**, then **M11**, then **M10**: honour OS reduced motion, stop the leftover loops, and add a forced-colours
   layer to the signature.
4. **B2**, **M6**, **M7**: names on rail links, and the APG tabs and grid controllers reused everywhere.
5. **M4** and **M5**: data grid semantics, and the Columns popup.
6. **Coverage:** seat management (P0) first. Then the P1 admin set (API keys, audit, roles, re-auth, invite,
   maintenance), the media players, and the three rows with no spec at all.
