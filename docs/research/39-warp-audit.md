# warp audit, 2026-10-31

Everything here was rendered in Chromium and looked at. Base components: `packages/warp/test/bench` at
quiet/balanced/vivid × light/dark, plus the overlays opened and frames of the modal's enter. Packs (agent, admin,
collab, schedule, live, flow, rich, surfaces, charts, table, shell, virtual): the a11y gallery in balanced dark. Those
were checked as whole pages, so a pack grade is a page impression, not a per-state review.

Screenshots are outside the repo:
`/private/tmp/claude-501/-Users-ravonus-dev-lemonstand-weft/5b9ac326-8108-49b9-87f8-0b8371e360fb/scratchpad/before/`.

Grades: **done** (would show it), **weak** (works, no feeling), **ugly** (visibly wrong), **missing** (no weft component).

## The diagnosis

The foundations are good: the token ladder, the dial, the sweep, the notch label, the contrast work. The magic is lost
in five places.

1. **The first 150 ms is empty.** Hover on a solid button runs a 620 ms wipe on `cubic-bezier(.65,0,.35,1)`, which barely
   moves early on. The sweep is meant as a grace note, but it is the only response, so everything feels late. Nothing
   answers the pointer at once. Press is a 1 px nudge.
2. **Nothing connects.** Tabs and Segmented slide a rigid block on the same slow curve. Select, Menu and Combobox have
   no moving highlight. Each overlay fades in from its own centre, not from what opened it.
3. **The everyday kit is unfinished.** `Select` is the OS popup. There is no weft `Menu`, `Accordion`, `Radio`, `Slider`,
   `Breadcrumbs` or number roll. 34 component stylesheets exist with no component (below).
4. **Quiet and balanced are too close.** Colour, type and radius move, motion does not. Only vivid's hard corners read as
   a different tier. Nothing about how the kit *moves* changes with the dial.
5. **Density of ink.** Vivid light tints every field mint, against 00 §10's own rule. Alerts in dark are saturated slabs.
   Cards have no hierarchy: the title is body size.

## Defects found

| # | Defect | Evidence |
|---|---|---|
| 1 | **Select shows the last option, not the first**, when no value is given: `selectedIndex` 2 of 3 | probe, every stop |
| 2 | Segmented has no `align-self`, so it stretches to fill a grid cell: a 165 px "Week" slab | all stops |
| 3 | Nav has no layout: `display: block`, no gap, "DocsToolkitExamples", bar detached | all stops |
| 4 | Filter chip's text touches the edge; chip count hugs the end; Toggle and Chip differ in height | zoomed, vivid light |
| 5 | Spinner in a solid button is near-invisible | all stops |
| 6 | Table caption sits flush against the frame with no padding | all stops |
| 7 | Vivid light: mint field fill at rest, contradicting 00 §10 | vivid light |
| 8 | Modal's opening has no direction: it comes up from its own centre whatever opened it | film-modal-* |
| 9 | `toast.promise` is in 05 §5 and not in the code | source |
| 10 | The kit ships no webfont. Unconfigured, warp is Arial and Courier New, and badges look like a typewriter | first bench run |

Not defects, though they looked like it. Vivid's jagged icons are the deliberate pixel tier (10 §5). The ink resting
border on fields is SIGNATURE's rule. The table's unaligned Spend column was my bench: the prop is `numeric`, not `align`.

## Grades

**Actions and inputs**

| Component | Grade | Note |
|---|---|---|
| Button solid, soft, outline, ghost | weak | Clean at rest; hover is late, press is nothing |
| Button frame | done | The real signature; keep exactly |
| Button loading | ugly | Defect 5 |
| Toggle, Chip | weak | Defect 4 |
| Field, Input, Search, Textarea | done | The notch and sweep work; vivid fill is defect 7 |
| Select | ugly | OS popup, defect 1 |
| Checkbox | done | Check draws in |
| Switch | done | The rail sweep is lovely |
| Segmented | ugly | Defect 2; rigid slide |
| ComboField | weak | No moving highlight |
| Tag, Badge, Kbd | weak | Sound, plain |
| DateField, DateRange, Time, DateTime, Month, Week, Period, Calendar | weak | Works, consistent with fields; rich gallery stacks them with no gaps, a fixture issue |
| TimeZone, Country, Language, Currency, Phone, Duration, Recurrence | weak | Same |
| Place, Address, PaymentCard, Signature | weak | Same |
| MentionsInput, CodeInput, JsonEditor, KeyValueEditor, RichTextEditor, Markdown | weak | Functional, unpolished |

**Navigation and overlays**

| Component | Grade | Note |
|---|---|---|
| Tabs | weak | Works; rigid indicator; content pop |
| Nav | ugly | Defect 3 |
| Pagination | weak | |
| Tooltip | weak | Right delays, no scale, no origin |
| Popover | weak | |
| Modal | weak | Good bones, defect 8 |
| Drawer | weak | |
| CommandPalette | weak | Good structure, no height animation or moving row |
| Toast | weak | Stack is right; 200 ms and no promise |
| Shell | done | Holds up |

**Display and data**

| Component | Grade | Note |
|---|---|---|
| Card | ugly | No hierarchy |
| Alert | weak | Slabs in dark |
| Progress, Spinner, Skeleton, Shape | weak | Thin but correct |
| Table | weak | Data is good, chrome heavy (defect 6), row states flat |
| DataGrid, PivotTable, ScrollGrid, VirtualList, Feed | weak | Solid engineering, same table chrome |
| Charts (22) | done | Consistent; not reviewed per chart |
| CodeBlock | done | |
| Heading, Text, Link, Layout | done | |

**Packs** (page impression)

| Pack | Grade | Note |
|---|---|---|
| agent | done | Dense and coherent, the strongest pack |
| collab | done | Thread, cursors and conflict read well |
| schedule | done | Calendar and agenda hold up |
| live | weak | Fine; preferences table is heavy on ink checkboxes |
| flow | weak | Auth is good; the system pages are empty at this size |
| admin | weak | Settings fine, hierarchy thin |

**Missing, by demo value**

Menu, Number roll, Accordion, Slider, Radio, HoverCard, Breadcrumbs, Stepper, Avatar in the main export, EmptyState.

CSS exists with no component: accordion, ai-label, anchor, breadcrumbs, button-group, countdown, hamburger, highlight,
icon, image, item-row, listbox, logo, menubar, meta-list, number, pagination, palette-motion, persona, pill, popconfirm,
qr-code, quote, section-message, selection-toolbar, separator, speed-dial, status-light, theme-panel, theme-toggle,
toggletip, toolbar, truncate, watermark. Some are used by scope from other stylesheets, so this list means "no file
imports it by name", not always "dead". It is the easiest coverage to win.

## How it compares

Read in source unless marked. Full list with links was gathered for this audit; the numbers that shape the design:

| Craft | Best in class | warp today |
|---|---|---|
| Press | scale .97 (Emil; Linear's own CSS); Mantine 1 px | 1 px |
| Hover | Linear: `:hover { transition: none }`, 150 ms out | 120 ms in, plus a 620 ms wipe |
| Enter : exit | Radix Themes 200 : 100, smaller exit travel | 10 : 7 |
| Origin | Radix `--radix-*-transform-origin` from the trigger | own centre |
| Tooltip | delay then skip delay; 140 ms, 4 px, .97 (Radix) | delay and skip delay, no scale |
| Toast | Sonner: 400 ms transitions, height follows front, 5% per step, 14 gap | 200 ms, 5%, 10 px |
| Drawer | Vaul: 500 ms `(.32,.72,0,1)` | 320 ms in-out |
| Numbers | NumberFlow: per-digit `linear()` spring, mask .25em | static |
| Command | cmdk: list height follows results, 100 ms | jumps |
| Springs | `linear()` baseline since Dec 2023 | vivid only |
| Focus ring | No kit animates it (of those checked) | static |

The tension: Emil's "under 300 ms" against Sonner at 400 and Vaul at 500. Reading it as frequency settles it: rare, large
surfaces get long curves; frequent, small ones get 100–200 ms. That is warp's two clocks.

## Not verified

Linear's app (only linear.app's CSS), Geist's shadows, Apple's numeric spring presets, Aceternity's source, and the
animations.dev course. Packs are graded from one stop. Phones were not reviewed in this pass.
