# Warp 05: Components (actions, overlays, navigation, feedback, display)

Owner: comp. Specimen: `specimens/components.html`. Styles: `tokens/warp-components.css` (`@layer warp.components`;
reads sys tokens only, plus the parts in `warp.signature` from `tokens/warp.css`). Coverage: every `comp` row in
`COVERAGE.md` §1 and §2 is listed in §9 with its section here and its demo id in the specimen.

Neighbours, not duplicated here: inputs and forms → `03-inputs.md`; pickers, dates, rich text → `04-inputs-rich.md`;
tables, charts, stats, infinite scroll → `06-data-and-charts.md`; app shell, sidebar, top/bottom nav, banners,
announcement and cookie bars → `02-layout.md`; notification centre, chat, calendar, meeting, presence and AI UIs →
`07-app-patterns.md`; carousel, lightbox, effects and the `fancy` motion family → `08-marketing-and-expressive.md`.
QRCode is a display atom and lives here (§6), per `COVERAGE.md` §1.

## 0. Rules every component follows

- **Markup contract.** Root `data-scope="<name>"`, children `data-part="<part>"`, state in ARIA first (`aria-expanded`,
  `aria-pressed`, `aria-selected`, `aria-checked`, `aria-current`, `aria-invalid`) and `data-state` only where ARIA
  has no word for it (`open`, `closed`, `swiped`, `loaded`). All selectors are `:where()`, so app CSS wins at 0,0,0.
- **One solid per region.** Everything else is soft, outline, ghost, frame or link. Tone changes meaning
  (`neutral | accent | positive | caution | critical | info`); emphasis changes rank.
- **Hover is a 7% current-colour layer.** Press is 11%. Focus is the `--warp-color-focus` ring, never a colour change
  alone.
- **Touch targets ≥ 44px** (`--warp-hit-min`) through an `::after` hit area, so a 28px icon button is still 44px to a
  thumb.
- **Overlays answer the viewport** (`max-width: 599.98px` = phone); **in-flow components answer their container**
  (`@container`).
- **Accessible names are required at the type level.** An icon-only button, an icon link and any overlay without a
  visible title fail to type-check (diagnostic D010). Use real `aria-*` props, never `ariaLabel`.
- **Motion** comes from foundations: durations `instant / fast / base / slow`, exits at `exit-k` (0.7) with `ease-in`,
  distance and scale-from per dial stop, and everything multiplied by `--warp-motion-scale` (0 when reduced).

### Weft API conventions

```ts
type Tone =
  | 'neutral'
  | 'accent'
  | 'positive'
  | 'caution'
  | 'critical'
  | 'info'
type Size = 'sm' | 'md' | 'lg'
type Reason = 'pointer' | 'keyboard' | 'programmatic'
interface Bindable<T> {
  value?: T | Signal<T>
  defaultValue?: T
  onValueChange?(value: T, reason: Reason): void
}
interface Openable {
  open?: boolean | Signal<boolean>
  defaultOpen?: boolean
  onOpenChange?(
    open: boolean,
    reason: Reason | 'escape' | 'outside',
  ): void
}
type Named =
  | { 'aria-label': string }
  | { 'aria-labelledby': string }
  | { children: Text } // D010 if none
```

Parts are dotted members (`Menu.Trigger`, `Menu.Content`, `Menu.Item`). Every component accepts `motion?: PresetName`
to override its preset (§8) and `class`/`style` on every part.

## 1. The sweep on components (SIGNATURE.md)

The mechanics live in foundations (`@layer warp.signature`): parts `sweep`, `sweep-base`, `sweep-fill`,
`frame-corners`, `sweep-corners`, `sweep-outline` (six `<i>` segments), `sweep-label`, `sweep-content`, `rail-fill`,
`rail-hover`, and one attribute, `data-phase = idle | in | out`. Components only decide **where** it runs and **in which tone**, and they
do it with tokens on their own hosts (`--warp-sweep-radius`, `--warp-color-sweep`, the gate `--_on`), never by
restyling the parts, so `warp-components.css` cannot change how inputs, data or app sweeps look.

- **Phase machine** (Weft `sweep()`; in the specimens the one shared `specimens/warp-sweep.js`): pointer-enter or
  focus-visible (`:focus-within` for fields and the palette row), or held open (`aria-expanded`, `aria-pressed`,
  `data-state=open`, an open field) → `in`. Leaving while `in` → `out`. `transitionend` on the travelling part while
  `out` → `idle`, with a backstop at the part's real duration + 150ms. Re-entering during `out` **restarts from the
  left** (SIGNATURE §1.4): snap to `idle`, one style flush, then `in`, so every entry draws left to right. Under reduced
  motion the duration is 0, so it goes `in → idle` directly: an instant colour change.
- **It never reverses.** In draws left to right; out keeps travelling right.
- **Errors pin it in**, painted `--warp-color-sweep-critical`.

| Component | Sweep | Notes |
|---|---|---|
| Button, outline / soft | border sweep, tone-coloured | solid and ghost use the fill wipe (`::before` 7% layer, L→R, leaves right) |
| Button, **frame** | SIGNATURE §1b exactly: bracket corners at rest (10px, 2px stroke, track ink); on hover or focus the active corners sweep in, the **CSS six-segment outline** (`--warp-frame-head` / `--warp-frame-tail`, 2.6px) draws from the left edge along top and bottom and meets at the right, and the tone-coloured label wipes to text colour. Out: the outline's tail follows its head through the right side. **620ms** (`--warp-frame-duration`: 480 · 620 · 700) | `data-fill`: tone fill slides in from the left (`-101% → 0`) and out to the right (`→ 101%`); the label copy reads in on-solid ink. Corners never rounder than 2px. Touch: `data-touch-effect` shows the full in-state for one sweep. One implementation, in `warp.css`; this file only sets tone, ink and shape |
| Chip, pill, toggle, segmented, select trigger | border sweep; holds while pressed/open | the selected segmented face does not sweep; the rail indicator travels instead (§1c) |
| Menu, select listbox | the panel's border draws in as it opens, holds while open | |
| Command palette input row | border sweep, radius 0 (flush with the dialog); held in while the input has focus, which is always while open | |
| Accordion (boxed · line) | per item; holds while the item is open | `line`: the item's own bottom hairline is the base, radius 0; the 1px accent stroke still draws left to right and exits right |
| Field inside a component (dialog, filter, tile) | the `03` field shell unchanged: two borders, notch label, per-character tint, icon sweep | `data-fields="classic"` on any ancestor flips them; the sweep stays |
| Link | the underline sweeps from 40% to emphasis weight | |
| Card / panel, interactive | always | static (non-clickable) ones: `data-sweep="surface"`, reach `--warp-sweep-surfaces` (0 · 0 · 1) |
| Custom surface | `sweep()` with `frame: 'brackets' | 'border'` | gradients and images behind it stay untouched |
| Rails (§1c) | tabs indicator, segmented face, progress range, meter range move on the sweep curve | progress and meter use `clip-path`, so the leading edge keeps its radius |
| Skeleton | the shimmer is the sweep, L→R | strength 35% · 68% · 100%; still under reduced motion |

**The dial** sets speed (480 · 620 · 700ms from foundations; the frame button the same) and reach (static surfaces only at vivid). Interactive
components sweep at every stop: the dial never decides whether the signature exists. `data-flair="none"` (buttons
off) is the only switch, and even then frame buttons keep their corners.

## 2. Actions

**Button.** Anatomy: root, optional leading/trailing icon, label, `spinner` while loading, `sweep` or frame parts.
States: rest, hover, focus-visible, active (1px press), open (menu trigger), loading, disabled.

| Prop | Values |
|---|---|
| `emphasis` | `solid` (default) · `soft` · `outline` · `ghost` · `frame` · `link` |
| `tone`, `size` | Tone, Size (`sm` 28 · `md` 36 · `lg` 44 at cozy; density scales them) |
| `fill` | frame only: the filled sweep variant |
| `loading` | keeps width, sets `aria-busy` + `aria-disabled`, keeps focus, swallows presses, spinner centred. The label hides with `opacity: 0`, never `visibility`, so it stays the button's accessible name |
| `iconOnly` | needs a name (D010); tooltip shows the name on hover/focus and on long-press |
| `full` | stretches; phone dialog footers do this automatically |

Disabled is 45% and leaves the tab order. Prefer `loading`, or an enabled button that explains why.

**IconButton** = Button with `iconOnly` and a required `label`. **ButtonGroup** `attached` joins radii; `split`
pairs a primary with a menu button (`aria-haspopup="menu"`, name "More save options"). **Toggle** is a button with
`aria-pressed`. **ToggleGroup** is a radio group (`single`) or a set of toggles (`multiple`). Its faces sit 3px inside the rail
(`control-md − 6px`), and an `::after` hit area reaches `--warp-hit-min` through the rail's padding, so each face is
44px to a thumb.

**Toolbar** (APG toolbar): one tab stop, ←/→ move, Home/End. Items that don't fit move **in order** into a trailing
“More tools” overflow menu (OverflowMenu = Menu fed by `useContainerOverflow`); toggles become `menuitemcheckbox`.
Focus on a hidden item moves to the overflow button.

**FAB** (phone only, `@container` < 600px): 56px, bottom-end above the safe area, hides on scroll down and returns on
scroll up; at ≥ 600px it renders as the region's solid button. **Speed dial**: the FAB opens up to three labelled
actions (`role=menu`), nearest the thumb first, staggered in at `pop`; the plus rotates to an X; Escape or outside
closes.

**CopyButton** (any `[data-copy]` control): the icon cross-fades to a check (pop) for 1.6s and a polite region says “Copied”. Failure falls back
to `execCommand`, then says “Press ⌘C” assertively. **ShareButton**: `navigator.share` on coarse pointers; otherwise
a popover of targets plus Copy link. Cancelling the system sheet (`AbortError`) shows nothing.

**Hamburger** (AnimatedHamburger): a ghost icon button with `aria-expanded`; its name stays “Menu”. The outer bars
fold to an X (`base`, in-out) while the middle bar sweeps out to the right. **ThemeToggle**: a toggle button named
“Dark theme” (`aria-pressed`); sun and moon cross-fade with a quarter turn. **Logo**: the Warp lines take ink, the
Weft line takes the accent, so it follows scheme and tenant accent with no second asset.

```ts
Button(props: Named & {
  emphasis?; tone?: Tone; size?: Size; fill?: boolean;
  loading?: boolean; onPress?(e): void
})
Toolbar(props: Named & { overflow?: 'menu' | 'scroll' | 'wrap' })
CopyButton(props: {
  value: string | (() => string); label?: string;
  onCopied?(ok: boolean): void
})
```

**Press (redesign.md §3).** A press is instant and takes `--warp-press` scale; release settles on `--warp-ease-spring`. Vivid
buttons rest flat and pull out under the pointer: up and left 2px off a hard offset (`--warp-offset`, coloured by
`--warp-offset-color`: black on light, white on dark, set it to brand the pull-out) that grows in behind them. A press sets them back down at `--warp-press` scale, and they settle
in 220ms rather than the stop's full spring.

## 3. Overlays

**One layer stack** (the overlay manager) for dialogs, sheets, menus, popovers, selects, hover cards and toasts:

- **Escape** closes only the top layer; an **outside press** closes every non-modal layer above the one pressed.
  Tooltips and hover cards are passive: they never eat the press.
- **Focus.** Modal layers trap focus (native `<dialog>.showModal()`: top layer, inert page) and return it to the
  trigger. Non-modal popovers move focus in and close when focus leaves. Menus and listboxes keep their roving focus.
- **Scroll lock** only for modals: `html:has(dialog:modal) { overflow: hidden }` with `scrollbar-gutter: stable`, so
  nothing jumps.
- **Positioning** (FloatingPortal + `place()`): the top layer (`popover="manual"`) is the portal. Panels are placed by
  side and align, **flip** when the preferred side lacks room, **shift** to stay 8px inside the viewport, and cap their
  height to the available space. `data-side` drives the motion direction.
- **ModalBackdrop**: `::backdrop` with `--warp-color-scrim` and `--warp-blur-overlay`; `[data-scope=backdrop]` for
  non-dialog hosts.
- **Imperative API.** `await confirm({ title, description, tone, confirmLabel })` resolves `true | false`;
  `open(Dialog, props)` returns a handle with `close()`.

| Overlay | APG | Desktop / tablet | Phone | Enter → exit |
|---|---|---|---|---|
| Dialog (Modal) | dialog | centred, `sm 420 / md 560 / lg 800`, scrim + blur | bottom form sheet, stacked full-width footer; `placement="center"` opts out | `slow`, up by distance and from scale-from with ease-out → 70%, ease-in, up by half |
| AlertDialog | alertdialog | 440, focus on Cancel, no backdrop dismiss; with `confirmText`, focus starts in the confirm field | centred | same |
| Drawer / Sheet | dialog | side sheet: right 420 / left 360, full height | bottom sheet with snap points (50%, 92%), drag, flick to close, rubber band past full; the footer stays on screen at every snap | along its edge, `slow` in-out; leaves to the same edge |
| Popover | dialog (non-modal) | anchored, flip and shift | anchored | from the anchor side by distance → half the distance back |
| Popconfirm | alertdialog popover | anchored to its button, Cancel first | same | as popover |
| Tooltip | tooltip | 500ms delay, instant for 300ms after one closes, hoverable, Escape | long-press on icon buttons only | `fast` fade + 4% scale |
| Toggletip | dialog popover | click to open, may hold a link | same | as popover |
| HoverCard | none (preview) | 600ms hover, 300ms focus delay | never; the link is the path | as popover |
| Menu / OverflowMenu | menu button + menu | anchored, submenus open on hover intent (110ms) or → | action sheet with 48px rows | `base` from the anchor, pop scale |
| ContextMenu | menu | at the pointer; Shift+F10 / Menu key at the target | long-press 500ms (cancel if it moves > 8px) | same |
| Menubar | menubar | ←/→ along the bar, ↓ opens, hover switches once open | collapses into one “⋯” menu | same |
| Select | combobox (select-only) | anchored listbox, `aria-activedescendant` | listbox sheet | same |
| CommandPalette | combobox in a dialog | 12dvh from top, 640 wide | full screen, keyboard-aware | `base` fade + scale |
| Tour step | dialog popover | anchored to a spotlit target, “2 of 5” | bottom sheet | as popover |
| Selection toolbar | toolbar | above the selection, inverse surface | above, clamped | `fast` enter |

**Type to confirm** (`AlertDialog confirmText="delete my-project"`): a labelled field (“Type **delete my-project** to
confirm”) sits above the footer. Initial focus goes to that field, not Cancel. The destructive button keeps focusability
but is `aria-disabled` until the trimmed value matches exactly (case-sensitive, no paste block). On match the field's
sweep pins in, painted critical (it now arms a destructive action), and a polite hint says “Matches. Delete is
enabled.” Enter in the field submits only when it matches. Closing clears the field.

**Bottom sheet anatomy.** One 92% panel translated down by `--_drag`. The grabber is a 24px strip holding a 36×4
pill; its `::after` reaches `--warp-hit-min` by overlapping the header (a drag area anyway), and its focus ring hugs
the pill, never the strip. **Initial focus** goes to `[autofocus]`, else the title (`tabindex="-1"`, no ring of its
own), never the grabber. The footer is lifted by `--_lift` (the resting snap's offset, written on snap, not per drag
frame) on the sheet's own curve, so the primary action sits at the bottom of the visible part at every snap point; the
body gets the same room at its end so nothing is unreachable. The footer owns the safe area
(`padding-block-end: space-group + env(safe-area-inset-bottom)`) and reaches the screen's bottom edge, so no body
content shows under the home indicator. Verified at 390×844 with a 34px bottom inset.

**Keyboard maps.** Menu: ↓/↑ wrap, Home/End, typeahead (500ms buffer), → opens a submenu, ← closes it, Enter/Space
activates, check and radio items stay open, Tab closes the whole tree and moves on. Select: closed, ↓/Enter/Space
open, typing selects; open, ↑/↓/Home/End/PageUp/PageDown move, Enter/Space/Tab commit. Palette: focus stays in the
input; ↑/↓ move the active option; Enter runs it; matched letters are `<mark>`. Sheet grabber: a real button; ↑/↓
change the snap, Enter cycles.

```ts
Dialog(props: Openable & {
  title: Text; description?: Text; size?: Size;
  placement?: 'auto' | 'center'; role?: 'dialog' | 'alertdialog'
})
AlertDialog(props: Openable & {
  title: Text; description: Text; tone?: Tone;
  confirmLabel: Text; confirmText?: string;
  onConfirm(): void | Promise<void>
})
Sheet(props: Openable & Named & {
  side?: 'auto' | 'right' | 'left' | 'bottom';
  snapPoints?: number[]; snap?: Bindable<number>
})
Menu.Root(props: Openable) · Menu.Trigger · Menu.Content
· Menu.Item({ onSelect }) · Menu.CheckboxItem(Bindable<boolean>)
Menu.RadioGroup(Bindable<string>) · Menu.Sub
· Menu.Separator · Menu.GroupLabel
// Never essential: content must also exist elsewhere.
Tooltip(props: { content: Text; side?: Side; kbd?: string })
CommandPalette(props: Openable & {
  commands: Command[]; onRun?(cmd, reason): void
})
```

Built in the redesign: `Menu`, `Accordion`, `Slider`, `Radio`/`RadioGroup`, `Ticker` and `toast.promise`. `Select` keeps a real
`<select>` and swaps the popup on fine pointers (redesign.md §5).

## 4. Navigation widgets

| Component | APG | Behaviour | Container response |
|---|---|---|---|
| Tabs (`line` · `pill` · `enclosed`) | tabs, automatic activation | ←/→ move and select, Home/End, one tab stop; every tab has `aria-controls` and a `tabpanel` (a filter strip controls one panel and filters it in place, re-pointing the panel's `aria-labelledby`); the indicator moves through the rail on the sweep curve. Every tablist on every page uses this one controller | scrolls horizontally with edge fades only where there is more; the selected tab scrolls into view |
| Accordion (`boxed` default · `line`) | accordion | Enter/Space toggle, ↑/↓/Home/End between headers; `multiple`, `collapsible` | content animates `grid-template-rows 0fr → 1fr` (`base`, in-out) |
| Disclosure / Collapsible | disclosure | one button, `aria-expanded` | same animation |
| Breadcrumbs | breadcrumb landmark | last item `aria-current="page"` | ≤ 420px: first, “…” menu of hidden levels, last two; ≤ 260px: one back link |
| Pagination | navigation landmark | page in the URL; focus stays on the current page link | ≤ 420px: “Page 3 of 12” with prev/next |
| Stepper (Steps) | list + `aria-current="step"` | complete / current / error / upcoming; horizontal or vertical | ≤ 520px: a compact title + “Step 2 of 4” + bar |
| Link / Anchor | link | always underlined in prose; the underline sweeps on hover; external links say “opens in a new tab” | n/a |
| Pill / PillLink | link or option | `aria-current` or `aria-selected`; sweeps on hover, holds while current | wraps |
| Segmented | radiogroup | arrows move and select; one face travels through the rail | scrolls if it must, never wraps |

**Pagination vs load more vs infinite.** Pagination for tables and results people return to, compare or share (page
in the URL). Load more for feeds and phone lists: the footer stays reachable, focus moves to the first new item, a
polite region says “5 more loaded, 9 of 20”. Infinite scroll only for endless, low-value streams with no footer, and
it needs a count and “back to top” (owned by `06`).

## 5. Feedback

**Toast.** Region: `<section aria-label="Notifications (F8)">`, bottom-end on desktop and tablet, full width above
the FAB on phones. Live regions are **pre-mounted at load** (polite `role=status`, assertive `role=alert`), so the
first message is announced too. Stack: up to 3 visible, collapsed (10px offset, 5% smaller each); hover or focus fans
them out and **pauses** every timer (the hairline at the bottom shows the remaining time). Swipe sideways past 35% or
flick to dismiss; the exit continues the swipe. Duration: 5s + 60ms a word; with an action 10s; critical with an
action persists. Variants: tone, action, undo, `toast.promise(p, { pending, done, error })`. F8 focuses the newest.
Enter from below by distance (`base`, out); exit up by half, 70%.

**Undo over confirm.**

| Action | Pattern |
|---|---|
| Reversible (archive, move, mark read) | do it now; toast with Undo for 10s, paused on hover |
| Low-stakes destructive (remove a webhook) | Popconfirm on the button |
| Irreversible, large loss (delete a project) | AlertDialog with `confirmText` (type to confirm) |
| Never | “Are you sure?” on something reversible |

**Alert** (inline, `role=alert` only for new errors), **SectionMessage** (full-width, in-page), **Banner** (page,
solid emphasis, owned by `02` for placement), **Callout** (prose: an emphasis-weight start line plus a mono label).
Status is never colour alone: icon + title + words.

**Progress**: linear (`4 − 1·x` px track), circular (SVG, `pathLength=100`), indeterminate (38% bar on a 1.4s loop; under
reduced motion a still, full-width bar that pulses in opacity). The range moves through the rail with `clip-path` on the sweep curve.
**ProgressCircle** = `shape="circle"`. **Meter** (`role=meter`) is a measurement, not a task: thresholds at 80%
(caution) and 100% (critical), optional marks. **Spinner**: one arc, 0.8s; under reduced motion it stops turning and pulses in opacity (warp.base). **Skeleton**: shapes
`text | circle | block`, shimmer = the sweep; still under reduced motion (OS or `data-motion="reduce"`). **SkeletonScope**: wraps real markup; while `aria-busy="true"`, every
`[data-skeleton]` descendant becomes a shimmer block of its own size, so nothing shifts when data lands.

**EmptyState**: the weave art (warp + weft lines); the error variant breaks a weft thread in critical; at vivid the
title's `em` is the serif italic. Always one primary action and a secondary.

**Badge** (`soft` · `solid` · `outline` · `count`), **StatusDot / Dot** (pings once on change, never pulses idle),
**StatusLight** (dot + word). **CountdownTimer** (`role=timer`): segmented or inline, tabular digits that roll, caution
in the last minute, critical at zero; announces at 5, 1 and 0 minutes only. **Stopwatch**: counts up (agent runs,
calls), pause/resume announced.

**Live status** (Weft `.live`):

| `.live` | Indicator | Announce | Extra |
|---|---|---|---|
| `connecting` | spinner + “Connecting…” after a 400ms grace | nothing on first load | |
| `live` | quiet positive dot + “Live” | “Back online” only after a drop | |
| `reconnecting` | caution, spinner + “Reconnecting · attempt n” | “Connection lost. Reconnecting.” (polite) | |
| `offline` | critical, wifi-off + “Offline” | the banner text (polite) | banner with Retry; “edits are kept and will sync” |

## 6. Display atoms

| Atom | Contract |
|---|---|
| Avatar | `sm 24 · md 36 · lg 48`, round or square; image → initials fallback (never under 11px); colour from a hash of the id; status dot or `presence` ring (online, away, busy, offline) plus words |
| AvatarGroup | max 3 + “+n”, 30% overlap, each a tooltip with the name |
| Persona | avatar + name + secondary line + presence |
| Tag | user content, removable (`aria-label="Remove billing"`); removing moves focus to the next tag; tone swatch |
| Kbd | mono, inset bottom border; `⌘` on Apple, `Ctrl` elsewhere |
| Separator | decorative = `aria-hidden`; labelled = `role=separator`; horizontal or vertical |
| Anchor (heading permalink) | “#” after the heading, shown on hover/focus (always on touch), copies the URL; the target flashes once in highlight |
| Image | reserves its box (`aspect-ratio`), fades in on load (`slow`), error shows the weave and the alt text |
| Quote | start rule in accent; the block stays upright at every stop (display serif, larger, at vivid); only an `em` inside takes `--warp-text-emphasis-style` (real italic at vivid, upright accent elsewhere); `figcaption` for the source |
| MetaList | a `<dl>`; two columns, stacks below a 360px container; `inline` layout for strips |
| Truncate | line clamp with “Show more” (`aria-expanded`); `mode="middle"` for hashes and paths, full value in `title` |
| NumberFormat | `Intl.NumberFormat`: compact, currency, percent with sign, unit, bytes, duration, list; tabular |
| RelativeTime | `Intl.RelativeTimeFormat`, shared 10s / 60s clock, absolute time in `datetime` and a tooltip, never announced on tick |
| Highlight / Mark | `<mark>` in highlight-soft with an emphasis underline |
| Watermark | repeated rotated text behind content, 7–10% by stop, `aria-hidden`, not selectable |
| AI label | “AI” mark on generated content; opens a toggletip with sources and model. Focus moves into it (its first control, else the popover itself) and returns on Escape |
| QRCode | see below |
| Icons | 24 grid, 1.5 stroke, round caps (square at vivid), `currentColor`; drawn to `00` §6 |
| Card / Panel / Stat | `Surface` with eyebrow, title, value; interactive ones sweep, static ones only at vivid |
| Item / list row | media, title, description, meta, actions; LinkOverlay makes the row one link while inner links and buttons still work |
| VisuallyHidden, Announcer | `[data-part=sr-only]`; `announce(text, assertive?)` writes to the pre-mounted regions. A count badge says its unit in sr-only text (“3” + “ unread”), never `aria-label` on a span |

**QRCode.** `QRCode({ value, label?, size?: 'sm' | 'md' })` encodes on the client (byte mode, ISO 18004 versions 1–10,
level M, the best of the eight masks by the standard penalty; longer values are a type error, since they don't scan
reliably from a screen). Anatomy: `figure[data-scope=qr] > [data-part=plate] > svg[role=img]` plus a
`figcaption[data-part=value]`.

- **The plate is always dark-on-light** (`color-scheme: light` on the plate), in dark theme too: many scanners can't
  read inverted codes. It keeps the 4-module quiet zone inside, sits on a hairline, and is 168px (`sm` 120).
- **The dial:** square modules at quiet and balanced, dots at vivid. The finder eyes take the stop's corners (soft,
  slight, square), and at vivid the pupil takes the accent ink. Every combination was decoded from a rendered
  screenshot, light and dark.
- **Never the only path.** The value (or a human label for it, e.g. “Guest Wi-Fi”) is printed below, the SVG's name
  says what scanning does, and the demo pairs it with CopyButton and “Save SVG” (exported black on white, squares).

## 7. Preferences as components

ThemeSwitcher (light, dark, system; segmented or menu), DensityControl, the **dial as a user control**
(quiet · balanced · vivid), accent swatches (a radiogroup that sets `--warp-seed-accent-h`; foundations keep every
pair at AA), LanguageSwitcher (a Select whose options are written in their own language with `lang`). A ThemePanel
is these rows in a sheet. All of them write the same root attributes as `01` §8.

## 8. Motion presets (registry)

Each preset reads the dial, so one name is right at every stop. Override per component (`motion="sheet"`) or app-wide
in `MotionConfig`. `useMotionDisabled()` reads `--warp-motion-scale`.

| Family | Enter | Exit | quiet · balanced · vivid |
|---|---|---|---|
| `enter` | fade + up by distance, `base`, out | 70%, in, up by half | distance 4 · 8 · 12px |
| `modal` | fade + up + scale-from, `slow`, out/pop | 70%, in | scale-from 0.99 · 0.97 · 0.94 |
| `sheet` | along the edge, `slow`, in-out | to the same edge | same travel, speed by stop |
| `toast` | from below, `base`, out | up by half; swipe continues | |
| `tooltip` | fade + 4% scale, `fast` | `fast` × 0.7 | |
| `dropdown` | from the anchor side, `base`, pop | toward the anchor by half | |
| `palette` | fade + scale-from, `base` | 70% | |
| `fancy` (crt, glitch, iris…) | see `08` | | |

Reduced motion: every distance and scale goes to 0 and durations to a 1ms fade; the sweep becomes a colour change;
the skeleton stops; the countdown stops rolling.

## 9. Coverage map (`COVERAGE.md`, owner comp)

| Row | Here | Specimen |
|---|---|---|
| Button, ButtonGroup, split, IconButton, loading | §2 | `#actions` |
| Toolbar, OverflowMenu, `useContainerOverflow` | §2 | Toolbar tile |
| AnimatedHamburger, ThemeToggle, Logo | §2 | Hamburger tile |
| CopyButton, ShareButton | §2 | Copy, Share tiles |
| FAB, speed dial | §2 | FAB, Speed dial tiles |
| Toggle, ToggleGroup, ToggleChip, Segmented, Pill, PillLink | §2, §4 | `#actions`, `#display` |
| Modal, AlertDialog, Drawer, Popover, Tooltip, HoverCard, Menu (check, radio, submenus), ContextMenu, CommandPalette | §3 | `#overlays`, `#devices` |
| FloatingPortal, ModalBackdrop, overlay manager, `confirm()` | §3 | confirm() tile |
| Popconfirm, Toggletip, Menubar, Selection toolbar, Tour step | §3 | `#patterns` |
| SweepBorderOverlay | §1 | `#sweep` custom surface |
| Card, Panel, Accordion, Tabs, Collapsible, Breadcrumb, Stepper, sliding indicator | §1, §4 | `#sweep`, `#nav` |
| Toast (promise, undo, stack), Alert, SectionMessage, Callout | §5 | `#feedback`, `#patterns` |
| Progress, ProgressCircle, Meter, Spinner, Skeleton, SkeletonScope | §5 | `#feedback`, `#patterns` |
| EmptyState, CountdownTimer, Stopwatch, StatusLight, Dot | §5 | `#feedback`, `#patterns` |
| Avatar (presence), AvatarGroup, Persona, Badge, Tag, Kbd, Separator, Anchor, Image, Quote, MetaList, Truncate, NumberFormat and format helpers, RelativeTime, Highlight, Watermark, AI label, Item rows, LinkOverlay | §6 | `#display`, `#patterns` |
| Icons | §6 | Icons tile |
| QRCode | §6 | QR code tile (`#qr-share`) |
| VisuallyHidden, live region, focus scope and ring | §0, §3, §6 | throughout |
| Theme switcher, density control, dial control, theme panel, language switcher | §7 | Preferences tile |
| Motion preset registry, per-component override | §8 | Motion presets tile |
| Lightbox, `fancy` motion | `08` | n/a |

Rows named in the reviews that are **not** comp-owned (checked against the owner column in `COVERAGE.md`):
SignGate Badge / Blocker / Flow (§1, owner `app`), seat management (§2 line 362, `app`), webhooks / integrations grid
(§2 line 364, `app`). They belong in `07-app-patterns.md` and `app.html`.

## 10. Accessibility fixes carried from the research (`02-components-a11y.md`)

- **C1.** Live regions are pre-mounted, not created with the first toast.
- **C3.** Dialog names come from the visible title (`aria-labelledby`), descriptions from `aria-describedby`.
- **H1.** Tooltips never hold essential information and have a touch path.
- **H2.** Menus use roving focus with typeahead; submenus open on → and close on ←.
- **H6.** Focus returns to the trigger on every close path (Escape, outside, select, programmatic).
- **M1.** Loading buttons keep focus and announce through `aria-busy`.
- **Forced colours** (`01-foundations` §12). Every state `warp-components.css` draws with a background opts out
  (`forced-color-adjust: none`) and is redrawn in system colours: pressed toggles, pressed chips, the segmented face
  and its indicator, and pill tabs fill with `Highlight` and `HighlightText`. Line and enclosed tabs keep `CanvasText`
  over a `Highlight` bar. The active menu, select, palette and listbox item reads as the system selection. The current
  page gets a 2px `Highlight` ring, a completed step a `Highlight` disc, and the QR plate keeps its ink on paper.
  Verified with CDP `forced-colors: active` in light and dark.

## 11. Open items for foundations

- Resolved in `warp.css`: the frame label is now `sweep-label` (no longer the generic `content`), and
  `--warp-sweep-buttons` is 1 at every stop. `warp-components.css` still resets `[data-part="content"]` for panels,
  which is harmless and keeps older markup working; it can go once no page emits a frame `content` part.
- Field fill (review 02 M1) is a foundations token; fields inside components use the `03` shell unchanged and follow
  whatever `warp.css` sets.
