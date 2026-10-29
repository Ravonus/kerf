# warp 07: App patterns (AI and agents, calendar, meetings, notifications, chat, collaboration)

Owner: app. Specimen: `specimens/app.html`. Styles: `tokens/warp-app.css` (`@layer warp.app`, after
`warp.components`; every selector is `:where()`). Coverage: every `app` row of `COVERAGE.md` §1, §2.7–2.10 in this
scope is mapped in §9.

Primitives are reused by name, never redrawn: Field, Select, Combobox, Textarea, OTP → `03-inputs.md`; DatePicker,
CalendarGrid picker, RecurrenceField, TimeZoneSelect, EmojiPicker, RichTextEditor, CodeBlock, Markdown →
`04-inputs-rich.md`; Button, Badge, StatusDot, LiveStatus, Toast, Tabs, Dialog, Sheet, Popover, Menu, Alert, Banner,
EmptyState, Progress, Spinner, Avatar → `05-components.md`; AppShell, BottomNav, ScrollArea → `02-layout.md`; tables,
charts, `useSmoothNumber` → `06-data-and-charts.md`. **Not here (→ `09-app-flows.md`):** auth and onboarding (sign-in,
passkeys, MFA, SignGate, tour, checklist), settings, billing and admin (role matrix, seats, API keys, audit log),
system states (result pages, offline page, maintenance, error boundary, update prompt), commerce checkout, and the `?`
shortcuts overlay.

## 0. Rules every app pattern follows

- **One arrival grammar.** Anything that shows up without the user asking (a notification, a message, a booking, a
  tool result, a peer's comment) enters from above with `data-arrive`: fade plus `--warp-dist` down, then the sweep
  draws its top edge once (full border at vivid or with `data-flair="sweep"`). New rows only: lists are diffed by id,
  so a refetch never re-animates what was already there. First render (`fast`) never animates.
- **The sweep is for state the user should notice, once.** Field focus, a speaking tile, a drop that landed (one-shot
  `data-confirm`), a running tool (a light on the bottom edge), today's now line (drawn left to right on mount). It is
  never a loop, except the running-tool light, which stops when the tool settles. Stroke is the full accent:
  `--warp-color-sweep` measures 3.8–4.0:1 against the hairline base and 3.0–3.2:1 against the ink field base in both
  themes (live readout in the specimen hero, `#measure`).
- **Two live regions per app**, mounted once at the shell: `polite` (arrivals, saves, moves, "3 new") and `assertive`
  (offline, failed send, approval needed). Announce summaries, not every token or every row; collapse bursts into one
  sentence after 1 s of quiet.
- **Form decides interaction, container decides layout.** `data-pointer="coarse"` swaps drag for long-press plus a move
  sheet; `@container` widths decide rails, sidebars and column counts. Phone < 600, tablet 600–999, desktop ≥ 1000.
- **Every drag has a non-drag path** (WCAG 2.5.7): keyboard move mode, a sheet with fields, or menu actions.
- **Realtime state is always visible and always small.** One `LiveStatus` pill reads `.live`, `stream().status` or
  `channel.status`. It is quiet while live and loud only in trouble (§4.4).
- **Hosts are stable.** A live list is rendered by key: existing nodes are patched in place (attributes, text), new ones
  inserted, gone ones removed, and nodes move only when the order changed. A row under the pointer keeps its sweep phase
  through an arrival; it never restarts. Never `innerHTML` a list that holds `[data-sweep]` hosts.
- **Touch floor.** Every app target reaches `--warp-hit-min` (44px coarse, 24px fine), visually or through a hit-area
  `::after`: composer (`min-block-size: hit-min`, padding centres one line), model chip, reasoning and tool-call
  summaries, suggestions, thread replies, reactions, cites, inbox tabs and footer, agenda strip, solid sweep buttons.
  Bespoke targets in new patterns take `data-hit` (01 §14).
- **Names are real.** Every field has a `<label for>`; the floating-label character spans are `aria-hidden` next to a
  visually hidden copy, and no input carries `aria-label` (01 §14). Generic elements that need a name get a role first
  (`group`, `region`, `img`).
- **Loops are marked.** Idle loops (typing dots, stream caret, tool light, shimmer, the speech wave) stop under reduced
  motion; new ones take `data-loop` or `animation-play-state: var(--warp-loop-play)`. Live figures (timers, durations,
  counts) take `data-numeric`. Heading `em` reads `--warp-text-emphasis-style`, never a hard-coded italic.

### weft bindings (research 07 §9)

```ts
// Server state that changes elsewhere: poke + refetch, driven by tags.
const inbox = query.live(listNotifications, { tags: ['inbox:me'] })   // Resource<Note[]> & { live: LiveState }
type LiveState = 'connecting' | 'live' | 'reconnecting' | 'offline'

// Incremental output (AI tokens, tool events): fold chunks into a value, keep the last N for replay.
const answer = stream(run.events, { fold: foldAnswer, keep: 'all' })   // Signal<Answer> & { status, stop() }

// Two-way, named messages with auth; presence and cursors use delivery: 'latest'.
const room = channel('room/:id', { authorize, client: { cursor, react, hand }, server: { joined, left, speaking } })
room.status   // 'connecting' | 'open' | 'reconnecting' | 'closed' | 'unauthorized'
const peers = presence(room)          // @weft/multiplayer: Signal<Peer[]>, cursors anchored to [data-anchor]
online(); visible()                   // browser values: pause animation and polling when hidden
```

Every pattern below names which of the three it reads. Optimistic writes use `mutation({ optimistic, rollback })`:
the row takes `data-state="sending"`, then settles or flips to `failed` with Retry. Nothing is ever silently lost.

## 1. AI and agent UIs (flagship)

Demo: `#ai-desk` (1240×820: thread, plan/trace/changes rail), `#ai-phone` (390×780), `#ai-parts` (state cards).

### 1.1 Anatomy

```
Conversation (role=log)
├─ Message[data-mine] > Bubble[data-variant=prompt] + Status (edit, copy)
├─ Assistant (article)  Mark · Content · Actions · BranchSwitcher
│   ├─ Reasoning (<details>)          "Thinking…" shimmer → "Thought for 4 s", folds when the answer starts
│   ├─ ToolCall[data-state]           name · args preview · duration · chevron → input/output
│   ├─ Prose (Markdown, streaming)    caret on the last block, cites [n]
│   ├─ ToolCall[data-state=approval]  editable args · Approve · Deny · "Always allow for this repo"
│   ├─ Question (form)                radio / checkbox / free text; the run pauses
│   └─ Sources                        numbered cards, same numbers as the cites
├─ Suggestions (chips)                follow-ups after the turn
└─ Prompt  Composer[data-sweep] · Files · Tools (attach, /, mic, web) · ModelChip · ContextMeter · Send/Stop
Rail (desktop ≥ 1000): Tabs Plan · Trace · Changes   Plan = TaskList + Queue; Trace = spans; Changes = CommitCard
```

### 1.2 States

| Part | States | Visual |
|---|---|---|
| Assistant | `waiting` → `streaming` → `done` / `stopped` / `error` | waiting: three-dot blink in the mark; streaming: 2px accent caret after the last block; stopped: "Stopped · kept what arrived" footnote |
| Reasoning | streaming, folded, open | streaming: accent left rule plus shimmer label; folds itself when the first answer token lands, keeps duration |
| ToolCall | `running`, `done`, `failed`, `approval`, `denied` | running: sweep light travels the bottom edge; failed: critical border + exit code; approval: caution border, args become an editable Textarea |
| Plan task | pending, running, done, blocked | box: empty, spinner ring, check, caution dash; done rows strike through at 60% |
| Prompt | idle, focused (sweep), busy (Send → Stop), drag-over (sweep held), offline (Send disabled with reason) | |
| ContextMeter | `normal`, `high` (≥ 80%), `full` (≥ 95%) | ring + "23%"; caution and critical tones; `/compact` offered at high |
| Branch | `n/m` switcher appears after the first regenerate or edit | |

### 1.3 Behaviour

- **Streaming without layout jump.** Tokens append into the live Markdown tree; block boundaries are committed only
  when the parser closes them, so a half-open code fence renders as code from its first line. The conversation sticks
  to the bottom only while the user is within 48px of it; otherwise a "Jump to latest" pill appears (§5).
- **Stop** keeps everything that arrived and marks the turn `stopped`. **Escape** stops when focus is in the composer.
  Messages sent while busy go to the **Queue** (shown in the Plan tab) and run in order.
- **Regenerate / edit** creates a branch; the switcher (`‹ 2/2 ›`) swaps the subtree below that turn. Edit opens the
  user bubble as a Textarea in place.
- **Model picker**: Popover from the model chip. A Listbox grouped by provider; each option shows capabilities (badges),
  context size and relative cost, plus a "default for this chat" check. P0.
- **Slash commands and @-mentions** use the Combobox suggest listbox from 03 attached to the composer
  (`aria-activedescendant`).
- **Citations**: `[n]` is a link to source n; hover/focus shows a Popover preview (title, path, snippet). Sources list
  repeats the numbers. P0.
- **Approval** never auto-runs. Approve is the one solid; Deny is outline; the args are editable and the diff of an
  edit is shown before approve. "Always allow" is a checkbox scoped to tool + resource, revocable in settings (09).
- **Message actions**: copy, thumbs up/down (toggle buttons; down opens a short reason Popover), regenerate, branch,
  more. Visible on hover/focus at desktop; always visible on the last turn and on touch.
- P1 spec lines:
  - **Suggestions / starter prompts**: empty state is 2–4 sweep cards (title + one line); after a turn, chips. Picking
    one sends it; Tab reaches them after the composer.
  - **Trace viewer**: nested spans with name, duration bar on a shared time axis, tokens and cost per span; Tree
    pattern (APG treegrid) with expand/collapse; live while running via `stream`.
  - **Context meter**: ring + percent; tooltip lists prompt, tools, files, history. Caution at 80, critical at 95.
  - **Artifact panel**: right Sheet on tablet, rail on desktop, full-screen route on phone. Tabs Preview · Code ·
    Versions; versions come from checkpoints.
  - **Question form**: a fieldset with legend = question; Continue is the solid; run status reads "Waiting for you".
  - **Checkpoint**: a hairline divider with a label and Restore; restoring forks a branch, never deletes.
  - **Shimmer**: a 1.6 s gradient pass over placeholder text ("Reading 14 files…"); static text under reduced motion.
- P2 one-liners: **persona orb** (idle, listening, thinking, speaking: scale and a soft ring, never spin);
  **live transcription** (speaker-labelled lines, the in-progress line at 60% ink); **sandbox panel** (env vars as a
  masked list, packages, terminal ScrollArea, preview iframe); **commit card** (files, +/− counts, diff link);
  **MCP status** (StatusDot + name + "6 tools" + expiry caution).

### 1.4 Phone, tablet, desktop

- **Phone**: one column, no rail. Plan, trace and changes open as a bottom Sheet from the app bar. The composer is
  pinned above the keyboard (`interactive-widget=resizes-content`), tool toggles collapse into a `+` menu, the model
  chip shows only the model's short name. Message actions are always visible on the last turn.
- **Tablet**: thread plus a right Sheet for the rail, opened on demand. Desktop ≥ 1000: rail is 360px and persistent.

### 1.5 Motion by dial stop

| Moment | quiet | balanced | vivid | reduced |
|---|---|---|---|---|
| token arrival | 120 ms opacity per token | same | same | no fade, text still streams |
| tool running | light travels bottom edge | same | same, slower | static 50% accent line |
| tool done / approved | border sweep in → out, 480 ms | 620 ms | 700 ms | instant colour flash |
| reasoning fold | height 200 ms | 270 ms | 320 ms | instant |
| new turn | fade + 4px | 8px + top-edge sweep | 12px + spring + full-border sweep | fade only |

### 1.6 Accessibility

- Conversation is `role="log"` with `aria-live="off"`; the polite region announces "Answer ready" (and "Stopped") at
  the end of a turn, never per token. The streaming article has `aria-busy="true"` until done.
- Reasoning is a native `<details>`; ToolCall is a disclosure button (`aria-expanded`) whose accessible name includes
  the state ("run_tests, failed, exit 1"). Approval moves focus to the approval card and announces assertively.
- Composer: Textarea with a visible-hidden hint "Enter sends, Shift+Enter adds a line, Escape stops". Send ↔ Stop keep
  one button identity (label changes), so focus never drops.
- Citations are links with `aria-label="Source 2"`; the preview Popover is reachable by focus.
- The prompt bubble is a `[data-sweep]` host like every other surface: dial-gated (`--_on: var(--warp-sweep-surfaces)`,
  so hover sweeps only at vivid) and confirmed once (`warpSweep.confirm`) when the prompt is sent. The sweep colour is
  `color: var(--warp-color-sweep)` on the sweep part; the old `--_sweep-color` property is gone.
- Run views (Steps / Trace / Raw) are APG tabs: one tab stop, ←/→ and Home/End, automatic activation, each tab
  `aria-controls` its `tabpanel`. The same `tabKeys` helper drives every tab strip on the page.

### 1.7 API

```ts
<Conversation run={run}>                                   // run: stream() of AgentEvent
  {(turn) => <Turn turn={turn} onRegenerate onEdit onFeedback />}
</Conversation>
<Prompt value={draft} onSubmit={send} onStop={run.stop} busy={run.status === 'running'}
        model={model} models={models} onModelChange tools={['attach', 'slash', 'mic', 'web']}
        context={{ used, limit }} queue={queue} />
<ToolCall call={c} onApprove={(args) => …} onDeny alwaysAllow={{ scope: 'repo' }} />
type AgentEvent = { kind: 'reasoning' | 'text' | 'tool' | 'tool-result' | 'approval' | 'question' | 'source' | 'done' | 'error'; … }
```

`foldAnswer` turns the event stream into `Answer { blocks, tools, sources, plan }`; the UI renders the folded value
only, so replay, reconnect and SSR hydration use the same path. `keep: 'all'` lets the trace tab replay timings.

## 2. Calendar, booking and planner

Demo: `#cal-desk` (week, 1240×760), `#cal-phone` (agenda, 390×800), `#planner` (MeetingPlanner, tablet 820×800),
`#ev-pop`, `#ev-sheet`, `#move-sheet`.

### 2.1 Anatomy

```
Calendar (container: calendar)
├─ Toolbar   ‹ › Today · title · LiveStatus · TimeZone chip · ViewTabs (Month Week Day Agenda Timeline) · New event
├─ Rail (≥ 1000)   MiniMonth (CalendarGrid picker from 04) · My calendars (checkbox per source, data-cal 1–8) · Time zones
└─ Grid      Head (day, date; today is accent) · AllDay row · Scroller > Gutter + Columns
    Column   Slots (15-min) · Event* · NowLine (today) · Ghost (while dragging) · Draft (create) · Readout
    Event    [data-cal] bar + tint · title · time · location; tentative = hatch; locked = no handles; Resize handle
EventPopover (Popover) · EventEditor (Sheet right / bottom on phone) · MoveSheet (bottom Sheet, phone)
Agenda (phone)  Strip (7 days + dots) · Pages (prev, current, next day; swipe) · Row* · Now · "1 h free" gaps · FAB
```

### 2.2 States and rules

- **Event model** `{ id, start, end, allDay, cal, tone, tentative, locked, recurrence?, tz }`. Layout: overlapping
  events share the column; each takes the leftmost free lane and spans right across free lanes (`--_col`, `--_cols`,
  `--_span`), so a long focus block is never squeezed by a short call.
- **Drag** (pointer): 4px threshold, then the event lifts (elevation-3, `data-dragging`), a ghost stays at the origin,
  a readout shows the new time, snap is 15 min (Alt for 5). Drop commits optimistically and plays `data-confirm`.
  Escape cancels. Create = drag on empty slots (draft). Resize = bottom handle.
- **Keyboard**: roving tabindex over events (arrows by time then day); Enter opens the popover; `M` enters move mode
  (arrows move by 15 min / one day, Enter drops, Escape cancels); Shift+↑↓ resizes; Delete asks via Dialog.
- **Touch**: long-press (400 ms) lifts the event and opens the MoveSheet (day, start, duration steppers); swipe pages
  the agenda; no drag-to-create on touch, the FAB creates.
- **Now line**: today only, `--warp-color-sweep`, drawn once on mount; the label sits in the gutter and updates each
  minute (`interval` paused when `!visible()`).
- **Time zones**: the toolbar chip is TimeZoneSelect (04); secondary zones in the rail; events crossing DST show the
  wall-clock time with a dotted underline and a tooltip.
- **Recurring** (P1): edits ask "This event / This and following / All" (RadioGroup in a Dialog); recurrence is
  RecurrenceField (04). Recurring events carry a repeat glyph.
- **Views**: Month (chips, "+3 more" Popover), Week, Day, Agenda (P1), Year (P1: 12 MiniMonths with density dots),
  Timeline (P1: resource rows of people or rooms over hours, same drag rules on the x axis).
- **Booking** (BookingCalendar, SlotPickerCard): a date list plus slot buttons (`aria-pressed`), a confirm step with
  ManualTimeCard as the fallback field path, and the arrival sweep on the confirmation card.
- **MeetingPlanner**: Attendees (Combobox add, zone per person), Details (title, link, tags), Availability (rows per
  person, busy bars, an "Everyone" row of shared free time), Suggested slots (top three, within working hours), Send.
- **Availability editor** (P1): weekly rows (day toggle + time ranges, add/remove range) plus date overrides (a list
  of DatePicker + ranges). Overlapping ranges merge on blur.
- **Gantt** (P2): timeline rows plus dependency arrows; milestones as diamonds; same drag/keyboard rules.

### 2.3 Phone, tablet, desktop

- **Phone (< 600)**: Agenda first. The week strip sits on top with dots per source, the day pages swipe (3 pages in a
  track; settle 320 ms), long-press opens MoveSheet, FAB opens the editor as a bottom Sheet. Week view is
  available but read-only on touch, with 3 days visible.
- **Tablet (600–999)**: Week with no rail; MiniMonth moves into a Popover from the title. Touch rules apply when
  `data-pointer="coarse"`.
- **Desktop (≥ 1000)**: rail + week; hover shows the resize handle; double-click empty slot creates 30 min.

### 2.4 Motion

Drag lift is the same at all stops (elevation, no scale); vivid adds the snap readout bubble. Drop = `data-confirm`
(480 / 620 / 700 ms). Now line draws 480 / 620 / 700 ms. Agenda swipe settles 270 / 320 / 384 ms. Sheets slide
270 / 320 / 384 ms. Reduced: drag still follows the pointer; confirm is a colour flash; now line appears; swipes cut.

### 2.5 Accessibility

- The week grid is APG **grid**: `role="grid"`, columns are `columnheader`s; events are `button`s inside
  `gridcell`s with names like "Design crit, Monday 10:00 to 11:30, Studio, tentative".
- View switcher (Month / Week / Day / Agenda / Timeline) is APG tabs controlling one `tabpanel` (the main pane).
- **Mini month** is an APG date grid: `role="grid"` labelled by the live month title, `role="row"` wrappers with
  `display: contents` (layout stays a 7-column grid), `columnheader`s with `abbr`, one tab stop on the focused day.
  ←/→ day, ↑/↓ week, Home/End week start/end, PageUp/PageDown month (Shift: year), Enter/Space picks. Each day is named
  in full ("Wednesday, October 28, 2026, today, in the shown week"); `aria-current="date"` is today, `aria-selected`
  the picked day. Picking moves the main view (Day view inside the shown week; otherwise the month note says so).
- **Month** is the same grid model; Enter opens that day. **Timeline** rows are `row` > `rowheader` + lane; bookings
  are named gridcells with one roving stop: ←/→ along the lane, ↑/↓ to the nearest booking in the next row.
- Planner: the availability strip is a `table` (rowheader per person, visually hidden busy/free text, the coloured
  spans `aria-hidden`); suggested slots are a `radiogroup` (`role="radio"`, `aria-checked`, roving tabindex, arrows).
- Agenda day strip: tabs with one stop, controlling the agenda list panel.
- Every move and resize announces politely ("Moved to Tuesday 14:00"); conflicts announce the overlap.
- Month "+N more" is a button opening a Popover list. Agenda is a list of links per day with `aria-current` on now.
- The drag path is never the only path: keyboard move mode, MoveSheet, and the editor's fields.

### 2.6 API

```ts
const events = query.live(listEvents, { tags: [`cal:${userId}`], input: range })  // .live → toolbar LiveStatus
<Calendar view={view} date={date} events={events} calendars={sources} timeZone={tz}
          snap={15} onMove={(e, to, reason) => move.run({ id: e.id, ...to })} onResize onCreate onOpen />
<Agenda date={date} events={events} onDateChange onLongPress={openMoveSheet} />
<MeetingPlanner loadAttendees loadSlots duration={30} onSubmit />
<BookingCalendar slots={query(slotsFor, { input: day })} onBook />
```

`move` is a `mutation` with `optimistic: (cache) => shift(cache, id, to)`; on reject the event returns to its origin
with the ghost path animated back and an assertive "Couldn't move Design crit: room is booked".

## 3. Video meetings

Demo: `#meet-desk` (1240×720, dark island), `#meet-phone` (390×800, speaker), `#meet-pre` (prejoin, lobby, countdown).

### 3.1 Anatomy

```
MeetingRoom (container: room; grid: header / stage + sidebar / controls)
├─ Header   title · timer · REC · LayoutSwitch (Gallery Speaker Presentation Board) · LiveStatus (network)
├─ Stage[data-layout]
│   gallery: auto grid (2 cols < 600, 3 ≥ 600, 4 ≥ 1200) · speaker: main + strip
│   presentation: share + rail of tiles · board: board + narrow rail
│   Tile  video/avatar · name chip (level bars) · flags (muted, hand, poor network) · speaking ring (sweep)
│   Pip (self view, draggable, snaps to the nearest corner)
├─ Sidebar (≥ 1000 docked 300px; overlay below)   People | Chat
└─ ControlBar   Mic · Camera | Share · Hand · React · Chat · People · More | Leave (the only solid, critical)
Prejoin (preview tile, mic meter, device Selects, Join) · Lobby (waiting) · ScheduledLobby (Countdown, Join disabled)
```

### 3.2 Rules

- **Speaking ring is the sweep**: in when a participant starts speaking (`data-speaking`), out to the right when they
  stop (`data-speaking-out`), 290 / 370 / 420 ms. Never pulses. Muted, hand raised and poor network are icon flags
  with words in the accessible name, never colour alone.
- **Speaker** layout follows the active speaker with a 1.5 s hold to avoid flicker. Off-screen tiles pause their video
  (IntersectionObserver).
- Controls are toggle buttons (`aria-pressed`) with labels at ≥ 1000 container width and icon-only below (names stay).
  Leave is icon-only on phone. Reactions float up from the control bar and fade (no motion when reduced).
- Prejoin: preview + mic meter (16 bars) + device Selects (03) + Join; joining shows the button's loading state. Lobby
  shows a Spinner and "Asking to join…" (`role="status"`). Countdown is `role="timer"`, `aria-live="off"`, announced
  once at one minute.

### 3.3 Phone, tablet, desktop

Phone: speaker layout, strip below, Pip top-right, control bar with icons only, sidebar as a bottom Sheet. Tablet:
gallery 2–3 columns, sidebar overlays the stage. Desktop: gallery + docked sidebar.

### 3.4 Accessibility and API

- Tiles are a list; each tile's name: "Kofi Mensah, host, speaking" / "Ana Ruiz, muted". Active speaker changes are
  not announced (too chatty); hand raises are (polite).
- ControlBar is an APG **toolbar** (arrow keys between controls, Tab leaves). LayoutSwitch is a radio group.

```ts
const room = channel(`meet/${id}`, { authorize, client: { hand, react, mute }, server: { joined, left, speaking, level } })
const people = room.collect('joined', 'left')            // Signal<Participant[]>
<MeetingRoom room={room} layout={layout} onLayoutChange participants={people} self={me} onLeave />
type MeetingLayout = 'gallery' | 'speaker' | 'presentation' | 'board'
interface Participant { id; name; role; isSpeaking; isMuted; isCamOn; handRaised; network: 'good' | 'poor' }
```

Audio levels arrive at 10 Hz on `delivery: 'latest'`; the level bars read `--level` directly (no re-render).

## 4. Notifications and `.live`

Demo: `#nt-desk` (bell, inbox popover, toasts, activity, push ask), `#nt-rig` (New arrival, Burst, connection
states), `#nt-phone` (inbox as a page), `#live-row` (LiveStatus states).

### 4.1 Anatomy

```
Bell (Button icon-only + Badge[data-count], bumps on arrival)
Inbox (Popover 400px desktop · full page on phone)
├─ Header   title · Mark all as read · More
├─ Tabs     All · Unread n · Mentions
├─ Group    "Today", "Yesterday" (sticky)
│   Notification  avatar + kind badge · text (actor verb object) · quote · time · source · actions · unread dot
└─ Footer   "Up to date" / "n new" pill · View all
ToastRegion (05) · Activity feed · PushSoftAsk (P2) · NotificationPreferences (P1, page lives in 09 settings)
```

### 4.2 Rules

- New notifications **arrive** at the top of the list (§0). If the user has scrolled, a "n new" pill appears instead
  of moving content. The bell badge bumps once per batch.
- **Inbox open → no toast.** Inbox closed → a Toast (05) per item, max three stacked, bursts collapse to "3 new
  notifications". Toast progress pauses on hover and focus.
- Unread: dot + bold actor; reading is explicit (open, mark, or 2 s visible in the inbox). Dismiss slides out right,
  and Undo is in the polite announcement and a toast.
- Actionable rows (approve, accept) have inline Buttons; the row itself is a link to the object.
- **Activity feed** (P0): actor · verb · object · time, grouped per day, a vertical hairline; it is the same component
  as the inbox row in a quieter variant, with a "Live" check in the header when `.live === 'live'`.
- **Preferences matrix** (P1): event types × channels (in-app, email, push) as a grid of checkboxes with a row header
  per event and a "mute all" per channel; APG grid navigation.
- **Push soft-ask** (P2): an in-app card first (why, what, "Turn on" / "Not now"); the browser prompt only after
  "Turn on"; never on first visit.

### 4.3 Phone, tablet, desktop

Phone: the bell opens a full-page inbox (route, not popover), toasts stack at the top under the status bar and swipe
up to dismiss. Tablet/desktop: Popover from the bell; toasts bottom-right.

### 4.4 `.live` connection status

| State | Surface | Announce |
|---|---|---|
| connecting | pill with spinner; skeletons only on first load | nothing |
| live | quiet pill, positive dot, no banner | "Back online" only after trouble |
| reconnecting | caution pill; Banner (05) after 3 s; data stays, edits queue | polite, once |
| offline | critical pill + Banner; server actions disabled with a reason | assertive, once |

Returning to live replays queued edits and arrivals as **one** summary ("Back online. 4 updates."). The full offline
page is 09's.

### 4.5 Accessibility and API

- Inbox is a Popover with a `role="feed"` list (APG feed: Page Down/Up between articles); each item is an `article`
  with `aria-label` = text + unread + time. The bell's name includes the count ("Notifications, 3 unread").
- Arrivals announce politely in summary; approvals needing the user announce assertively.
- Inbox filters (All / Unread / Mentions) are APG tabs; the list sits in one `tabpanel` whose `aria-labelledby`
  follows the selected tab.
- The list renders by key (§0 "Hosts are stable"): read, approve and mark-all patch the existing `li` (`data-read`,
  name, actions) and never replace it; `data-arrive` is removed after the arrival so a later sort cannot replay it.

```ts
const inbox = query.live(listNotifications, { tags: ['inbox:me'] })
<Bell count={() => inbox.value?.filter(n => !n.read).length} onOpen />
<Inbox items={inbox} live={inbox.live} onRead onReadAll onDismiss onAction tabs={['all', 'unread', 'mentions']} />
<LiveStatus state={inbox.live} />          // also accepts stream().status and channel.status, mapped to 4 states
```

## 5. Messaging and chat

Demo: `#chat-tab` (tablet: conversations + thread), `#chat-phone` (390×760, keyboard toggle).

### 5.1 Anatomy

```
ConversationList   item: avatar (presence) · name · last message · time · unread Badge · pinned · muted
Thread (role=log)
├─ Header   channel · members · avatar stack · call · search
├─ Day divider · Unread divider ("New · Today", accent hairline)
├─ Message  avatar · author · time · Bubble · attachments · Reactions · ThreadReplies · Receipt
│           grouped: a continued message hides avatar and author within 5 min
├─ Typing indicator ("Mei is typing", three dots)
└─ Composer[data-sweep]  Textarea (field-sizing) · attach · emoji (EmojiPicker, 04) · @mention · Send
```

### 5.2 Rules

- **Delivery**: `sending` (60% ink, clock) → `sent` → `read` ("Read 09:51" under the last mine message only) or
  `failed` (critical bubble border, "Not sent. Retry", assertive once). Optimistic via `mutation`.
- **Stick to bottom** when within 48px; otherwise "Jump to latest" pill with the new count. Opening a channel lands on
  the unread divider, not the bottom.
- **Mentions**: `@` opens the suggest listbox (03 Combobox) anchored at the caret; a mention renders as an accent
  soft chip; `@you` gets a highlight tint on the whole message.
- **Reactions** (P1): toggle buttons with count; the name lists who ("Thumbs up, 3: you, Ana, Kofi"); `+` opens
  EmojiPicker. **Thread replies** (P1): "2 replies · last 17:40" link opens a side panel (desktop) or a pushed page
  (phone). **Quote reply** puts a quote block in the composer. **Typing / receipts** (P1) as above; typing dots stop
  under reduced motion.
- **Voice message** (P2): hold-to-record button, waveform bars, play/pause with scrubber; transcript under it.
- **GIF picker** (P2): a Popover grid with search, same keyboard model as EmojiPicker.
- Attachments: file chip with type badge, size, progress; images as a thumbnail that opens the lightbox (08).

### 5.3 Phone, tablet, desktop

Phone: list and thread are two routes; the composer rides on the keyboard (`interactive-widget=resizes-content`);
long-press a message for actions (Sheet). Tablet: list 300px + thread. Desktop: list + thread + optional thread panel.

### 5.4 Accessibility and API

Thread `role="log"` (polite region announces "New message from Mei" summarised); messages are `article`s; composer hint
"Enter sends, Shift+Enter adds a line". ConversationList is a listbox with `aria-selected` on the open channel.

```ts
const ch = channel(`chat/${id}`, { authorize, client: { send, typing, react, read }, server: { message, typing, receipt } })
const messages = query.live(listMessages, { tags: [`chat:${id}`] })
<Thread messages={messages} me={me} onSend={send.run} onRetry onReact onReply typing={ch.collect('typing')} />
```

## 6. Real-time collaboration

Demo: `#collab-demo` (shared brief: cursors, peer selections, lock, conflict, comments, viewport rail, relay),
`#share-dlg`, versions, kanban.

### 6.1 Parts

- **Presence avatar stack**: avatars with a 2px ring in each peer's presence colour (data palette 1–8, assigned per
  session, stable per peer); `+n` overflow opens a list. **Following** (P1): Follow on a peer's avatar; your viewport
  rides theirs, a flag in their colour pins the top edge ("Following Mei · Esc to stop"); any scroll breaks follow.
- **Cursors** (PageCursorsLayer): arrow + name chip in the peer colour, anchored to the nearest `[data-anchor]` element
  plus an offset, so they line up across viewport sizes. Glide 120 ms between updates, fade after 5 s idle, hidden
  when the peer's anchor is off-screen (an edge chevron shows direction).
- **Peer selections** (P1): `mark[data-peer-text]` tint in the peer colour at 22% plus a 1px caret and name flag on the
  focus end; on canvas, an outline with the name chip.
- **Lock** (P2): a field another peer holds shows their colour border, a "Kofi is editing" chip, and is `readonly`
  (not disabled, so it is still readable and focusable).
- **Conflict** (P1): an Alert (caution) with both versions side by side (Theirs · name · time / Yours · unsaved) and
  Use theirs · Keep mine · Compare. Nothing is discarded silently.
- **Sync indicator**: "Saved" check / "Saving…" / "Offline · changes kept" next to the title, from `channel.status`.
- **InteractionRelay**: a peer's hover, focus and press replay on the same component using its own states
  (`[data-relay]`), plus a click ripple in their colour. Label "Ana is pressing this" in the polite region only for
  buttons that change shared state.
- **LiveViewport**: a narrow rail showing the document with a box per peer viewport in their colour; click to jump.
- **LiveSection**: a small avatar beside each section heading showing who is reading it.
- **SyncedDom / SyncedTree**: shared class, scroll, attribute and hash; no visual of their own beyond the sync
  indicator. Data-integrity panel (P2, dev tool): counts sent / received / duplicate / out-of-order as a stat row.

### 6.2 Comments, sharing, versions

- **Comment thread** (P0): avatar, name, time, body, reply field, Resolve (link button, check icon); resolved threads
  collapse to one line with "Reopen". **Anchored comments** (P1): highlight on the text range, a numbered pin on
  canvas, the thread in a margin rail (desktop) or a bottom Sheet (phone); the active thread raises and draws its top
  sweep.
- **Share dialog** (P0): Dialog (05). Invite field (Combobox of people + emails, chips), role Select per person
  (Viewer, Commenter, Editor, Owner), link access row (Restricted / Anyone with link + role), Copy link with
  `data-confirm` sweep, and "Invited" rows arriving.
- **Version history** (P1): a list of versions (named ones carry the accent dot), Preview (read-only overlay with a
  diff tint) then Restore (Dialog confirm; restore creates a new version).
- **Kanban** (P1): columns with count and WIP limit (caution when over), cards drag between columns with the calendar's
  lift / ghost / announce grammar; keyboard: Space to pick up, arrows to move, Space to drop; quick add at column end;
  swimlanes as row groups. Phone: one column per page with swipe, move via a Sheet.

### 6.3 Motion, accessibility, API

- Motion: cursors glide 120 ms (instant when reduced); presence join is a fade + ring sweep; comment arrival uses
  `data-arrive`; conflict alerts slide 8px (none when reduced).
- Cursors, selections and relays are `aria-hidden`; presence is announced on join/leave, summarised ("Ana and Kofi
  joined"). Comments rail is a `complementary` landmark; each thread is an `article`.

```ts
const doc = channel(`doc/${id}`, { authorize, client: { cursor, select, relay }, server: { op, presence } })
const peers = presence(doc, { delivery: 'latest' })        // @weft/multiplayer
<PresenceStack peers={peers} onFollow />
<Cursors peers={peers} anchor="[data-anchor]" idle={5000} />
<ShareDialog object={doc} members={query(listMembers)} onInvite onRoleChange onLinkAccess />
<VersionHistory versions={query.live(listVersions)} onPreview onRestore />
```

### 6.4 Coverage additions (v0.2)

Each is a card in the specimen, built from 03 shells (Field, Select, Switch) and 05 Buttons, with the sweep machine
untouched.

**SpeechInput + MicSelector** (`[data-scope="speech"]`, §1). Mic device Select, a three-bar input level
(`[data-part="level"]`, bars driven by `--level`; reduced motion holds height and shows level by opacity), Record ↔ Stop
on one button identity. While listening the strip is held in with `warpSweep.pin`, a 40-bar wave (`data-loop`) moves
and a `role="timer"` (`data-numeric`) counts; the transcript shows interim words in `text-subtle` and final words in
`text`. A blocked mic shows a caution Alert with the fix, not a dead button. Insert writes the transcript into the
composer and confirms its sweep once. Phone: the strip is full width; the wave drops to the bars that fit.

**ArtifactPanel** (`[data-scope="artifact"]`, §1). Header (title, version badge, Copy), APG tabs Preview / Code /
Versions. Versions is a `listbox` (single select, roving tabindex, ↑/↓, Home/End); the current version carries
`aria-current` and a sweep-coloured marker. Copy confirms the panel's sweep and announces "Copied to clipboard". It fills its container, so phone, tablet
and desktop differ only in the column it lands in.

**AvailabilityEditor** (`[data-scope="availability"]`, §2). One row per weekday: a Switch (on = available) and one or
more From/To Select ranges with add and remove; "Copy Monday to weekdays". Validation runs on change: "Ends before it
starts" and "Overlaps another range" set `aria-invalid` on both selects, an error line (`aria-describedby`), and pin the
fields' sweep in. Date overrides are a list (date, hours or Unavailable, note) with add and remove. Save is blocked
while errors remain (focus goes to the first invalid select, assertive announce); otherwise it confirms its sweep and
the `role="status"` line reads "Saved · booking pages updated". Container query: at 420px and below the day label stacks
above its ranges.

**SyncedForm** (`[data-scope="synced-form"]`, §6, "all-inputs sync"). Every field of the form is shared channel state.
A remote edit rings the field in the peer's presence colour (`data-remote`) and shows a `peer-tag` ("Ana") for 1.4 s; a
field that has focus is never overwritten: the change queues and applies on blur. Text sends on `input`, choices on
`input` only (no duplicate `change` send).

**DataIntegrity** (`[data-scope="integrity"]`, §6). A dev-tools panel on the same channel: Sent, Received, Duplicate,
Out of order, Lag p95 (`dd`s are `data-numeric`; Duplicate turns caution and Out of order critical when non-zero), a
recent-events log, and inject-duplicate / inject-reorder / reset controls for testing a client's dedupe.

**MultiplayerAutoTrack** (`[data-scope="auto-track"]`, §6). A "Follow whoever presents" Switch, a `role="status"` line
("Following Kofi · presenting") and a scroll region that follows the presenter's section. Any manual wheel, touch or
key scroll pauses following ("Paused: you scrolled") with a Resume button; it never fights the user. Presenter
changes are shown, not announced.

**Forced colours** (01 §12). `warp-app.css` §12 opts background-drawn app state out and repaints it: arrival bar, now
line and label, stream caret, run and plan done markers, unread dot, today and selected days, booking slot, own
message bubble, calendar source toggles and speech wave use `Highlight` / `HighlightText`; soft states (range, pressed
reaction, chosen answer, current version) become a 2px `Highlight` ring; events get a `CanvasText` border; a speaking
tile is a 3px `Highlight` outline, a remote edit a dashed one, an invalid range 3px double `CanvasText`.

## 7. Dial and theming

The same markup is quiet, balanced or vivid by `data-expression` on any ancestor: quiet drops the arrival sweep line
and uses raised field fills; balanced draws top-edge sweeps; vivid draws full-border arrivals, springs, mono
uppercase buttons and square forms (05). App-only tokens (`warp-app.css` §0): `--warp-cal-hour` (48px × density),
`--warp-cal-gutter`, `--warp-cal-tint` (15% event tint), `--warp-arrive-duration`, `--warp-tile-gap`,
`--warp-bubble-radius`, `--warp-avatar-sm|md|lg`. Calendars and presence use the data palette (`--warp-color-data-1…8`)
so a host site's theme recolours them. Meetings default to a dark island (`data-theme="dark"` on the room) in either
page theme.

## 8. Specimen checks (headless Chrome, 2026-10-28, v0.2)

- **Settings bar** is the canonical 01 §13 bar (Expression · Fields · Theme · Density · Motion · Flair, Auto removes the
  attribute, `?expression=` deep links, `?dial=` accepted as an alias). 57px at 390 and 834 (one row plus the Settings
  sheet: focus to the checked option, Esc returns to the button); ≥1024px it wraps to two rows (117px at 1280).
- **Hero**: the weave sits in its own stacking context at `z-index: -1`, in the right column at ≥1000px (copy capped at
  54%) and as a 72px band above the eyebrow below that. No overlap with any hero text at 390, 834 or 1280.
- **No horizontal scroll** at 390 / 834 / 1280 in quiet-light, balanced-dark, vivid-dark and vivid-light + classic.
- **Touch targets**: 0 under 44px on a coarse pointer at 390 (192 targets measured, tablet frames included).
- **Keyboard**: mini grid (1 stop, 6 rows, arrows / Home / End / PageUp / PageDown / Enter), month, timeline, calendar
  view tabs, agenda strip, Run views, inbox tabs, artifact tabs and versions listbox, planner radiogroup. 0 fields
  without a label.
- **Sweep**: hovered notification keeps its node and phase across an arrival; prompt bubbles have sweep parts, gated at
  quiet/balanced, confirm on send; no `--_sweep-color` in any loaded stylesheet.
- **Reduced motion** (OS and `data-motion="reduce"`): spinners pulse, level bars hold, caret, dots and tool light stop.
- **Forced colours** (CDP emulation, light and dark): today, the now line, selected range and source toggles read.
- **New cards** (functional): range validation and blocked save, switch by Space, save status; synced form mirrors
  (sent 1 / received 1), injected duplicate and reorder count; artifact tabs End and version ↓; speech listening with
  timer and interim transcript. No page errors.
- `node scripts/contrast-check.mjs`: 858 checks, 0 failures.

## 9. Coverage map

| Original / COVERAGE row | warp name | Here | P |
|---|---|---|---|
| CalendarView, CalendarGrid (app view), DayCell, DayColumn, EventChip | Calendar (month/week/day), Event | §2 | P0 |
| EventPopover | EventPopover (Popover) | §2 | P0 |
| BookingCalendar, SlotPickerCard, ManualTimeCard | BookingCalendar, slot buttons, manual field path | §2 | P0 |
| ScheduleGrid, ScheduleHeader, ScheduleBlockButton, ScheduleOverlays | Calendar grid, toolbar, Event, Ghost/Draft/NowLine | §2 | P0 |
| MeetingPlanner, MeetingMetaCard, AttendeesCard | MeetingPlanner (attendees, details, availability, slots) | §2 | P0 |
| Event drag, resize, create-by-drag | move / resize / create + keyboard move mode + MoveSheet | §2 | P0 |
| Agenda / year view | Agenda (phone default), Year | §2 | P1 |
| Resource / timeline view | Timeline | §2 | P1 |
| Recurring + time-zone display | RecurrenceField / TimeZoneSelect (04) in the editor | §2 | P1 |
| Availability editor | AvailabilityEditor (weekly ranges, validation, overrides) | §6.4 | P1 |
| Gantt | Gantt (one-liner) | §2 | P2 |
| Kanban | Kanban | §6 | P1 |
| MeetingRoom, MeetingTile, MeetingControlBar, MeetingSidebar, MeetingPresentationPip | MeetingRoom, Tile, ControlBar, Sidebar, Pip | §3 | P0 |
| Gallery, Speaker, Presentation, BoardFirst layouts | `data-layout` gallery / speaker / presentation / board | §3 | P0 |
| MeetingPrejoin, MeetingLobby, MeetingScheduledLobby, MeetingCountdown | Prejoin, Lobby, ScheduledLobby, Countdown | §3 | P0 |
| Notification center / inbox, bell with count | Inbox, Bell | §4 | P0 |
| Activity feed | Activity | §4 | P0 |
| Notification preferences matrix | NotificationPreferences (page in 09 settings) | §4 | P1 |
| Push permission soft-ask | PushSoftAsk | §4 | P2 |
| `.live` status, offline banner, reconnecting indicator | LiveStatus + Banner states | §4.4 | P0 |
| Conversation list, message thread, composer | ConversationList, Thread, Composer | §5 | P0 |
| Typing, receipts, reactions, thread replies, quote reply | as named | §5 | P1 |
| Voice message, GIF picker | one-liners | §5 | P2 |
| Comment thread, share dialog | CommentThread, ShareDialog | §6 | P0 |
| Anchored comments, following, peer selections, conflict, version history | as named | §6 | P1 |
| Lock indicator | as named | §6 | P2 |
| Data-integrity panel | DataIntegrity | §6.4 | P2 |
| All-inputs sync (SyncedDom forms) | SyncedForm | §6.4 | P1 |
| MultiplayerAutoTrack | AutoTrack (follow, pause on manual scroll, resume) | §6.4 | P1 |
| Live cursors, LiveCursorsOverlay, PageCursorsLayer, presence avatars | Cursors, PresenceStack | §6 | P0 |
| LiveHover / LiveClick / Live, InteractionRelay | InteractionRelay (`data-relay`, ripple) | §6 | P1 |
| LiveSection, LiveViewport, MultiplayerAutoTrack, `usePeers` | LiveSection, LiveViewport, `presence()` | §6 | P1 |
| SyncedDom (Class, Scroll, Attribute, Hash), SyncedTree | sync indicator only | §6 | P1 |
| Sandbox recipes: chat, notification feed; realtime recipes | Thread, Inbox, LiveStatus, streaming agent chat | §1, §4, §5 | P0 |
| Streaming message, prompt input, model selector, reasoning | Assistant, Prompt, ModelPicker, Reasoning | §1 | P0 |
| Tool-call card, tool approval, citations, message actions + branching, plan/task/queue | ToolCall, approval state, Cite/Sources, Actions/BranchSwitcher, Plan | §1 | P0 |
| Suggestions, trace, context meter, question, checkpoint, shimmer | as named | §1 | P1 |
| Artifact | ArtifactPanel (preview, code, versions) | §6.4 | P1 |
| SpeechInput, MicSelector | SpeechInput, MicSelector | §6.4 | P1 |
| Persona orb, transcription, sandbox panel, commit card, MCP status | one-liners | §1 | P2 |
| SignGate*, auth, onboarding, settings, billing, admin, role matrix, system pages, shortcuts overlay | → `09-app-flows.md` | n/a | n/a |
| AI label / explainability popover | → `05-components.md` (comp) | n/a | P1 |

## 10. Handoffs

- **components (05), resolved:** 05 now wipes a solid button's `sweep-fill` with `clip-path` inside the box, so the
  local `overflow: hidden` clip in `warp-app.css` §9 is gone and the 44px `::after` hit area is whole again.
- **foundations (01), resolved:** the settings bar is shared (`specimens/warp-bar.css` / `warp-bar.js`) and is one
  59px row at 1280 and up, with page extras behind More (01 §13).
- **data (06):** the "3px status-bar buttons" in review 02 are the data tracker, not app.
- **flows (09):** the role/permission matrix and SignGate stay in 09 (see the scope note at the top).
- **Signature:** Kanban cards and comment threads still sweep at every stop; gate them with
  `--_on: var(--warp-sweep-surfaces)` if review 01 asks again. Calendar events stay ungated on purpose: they are
  controls.
