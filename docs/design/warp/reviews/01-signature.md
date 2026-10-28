# Review 01 · Signature fidelity (sweep, floating label, frame button, rails)

Judge: independent, adversarial. Spec: `../SIGNATURE.md`. Original: `~/dev/agorix-discord/packages/ui/src` plus the showcase at `:5174`.
Date: 2026-10-28.

## How this was measured

- **Tooling.** Headless Chrome (Playwright 1.60, `channel: chrome`) at 1440×900, DPR 2, against `:4817/specimens/*.html` and `:5174/#/…`.
- **Frames.** Each frame strip is a real pointer hover in and out. After the event, every running CSS transition was paused and seeked
  to 0/150/300/620 ms (`document.getAnimations()` → `currentTime`). The page's long `setTimeout` backstops were frozen so they couldn't
  short-circuit the `out` phase.
- **Metrics.** Each frame records `data-phase` and the computed `clip-path` of `sweep` and `sweep-base`. It also records the label's
  `top`, `font-size` and notch background, three sampled `[data-char]` colours, and the icon, `rail-fill` and `rail-hover` clips.
- **CSS audit.** Every visible `[data-sweep]` host on all 9 pages (about 1,200 hosts) was forced to `in`. The audit then read the
  clip, stroke, opacity and duration, and the contrast of sweep against base and against surface. It ran at quiet, balanced and vivid,
  in light and dark (54 page states).
- **Fields toggle.** `data-fields="classic"` was set through the page's own control, or on `:root` where the page has none. Each label
  was then classified by geometry: above the box, in the notch, or inside.
- **Reduced motion.** `reducedMotion: 'reduce'` on 6 pages: the sweep is instant and the label fades in 120 ms. **Pass on every page.**

Evidence strips are in `shots/`. Each strip reads left to right: rest, in 0, in 150, in 300, in 620, out 0, out 150, out 300, out 620.
Strips prefixed `orig-` are the original showcase.

## Scores

### Per specimen (5 = indistinguishable from the original signature, 1 = signature broken)

| Specimen | Score | Blockers | Majors | One line |
|---|---|---|---|---|
| foundations | **4** | 0 | 2 | The only page where the frame button draws its outline. Fields, rails and fill buttons are right. The segmented control is reinvented, and the switch-off ring is 1.33:1. |
| inputs | **4** | 0 | 2 | Reference implementation: phase machine, notch on gradients, icon sweep, per-character tint, error pin, classic toggle. Grey-based controls are 1.47:1, and the segmented control is reinvented. |
| inputs-rich | **4** | 0 | 0 | Fields, pickers and popovers (pinned in while open) are correct, and classic flips everything. Only the shared notch snap (minor). |
| components | **2** | 1 | 2 | Frame button: no outline at all. The palette input and the line accordion have no sweep. The page has zero signature fields. |
| layout | **2** | 1 | 1 | Every exit snaps off instead of travelling right. The command trigger is 1.47:1. |
| data | **2** | 1 | 0 | Every exit snaps off (the machine reads the wrong part's duration). Surfaces sweep at every dial. |
| app | **1** | 1 | 4 | Every sweep **reverses** on exit. The per-character tint is dead. Tool-call sweeps are a 2 px sliver, notifications are a 1 px rule, messages have no sweep, and the solid buttons' sweep is invisible. |
| flows | **2** | 1 | 2 | 34 frame buttons with no outline, and in neutral tone, so hover changes nothing visible. Fields, switch and plans are fine. |
| marketing | **4** | 0 | 0 | The machine is correct. Tiles and plans rest on an ink border and sweep at balanced (minor). |

### Per signature element

| Element | Score | Why |
|---|---|---|
| 1. Sweep border | **3** | **Correct on inputs, inputs-rich, foundations, flows, marketing and components:** 620 ms balanced, 480 quiet, 700 vivid, `round` matches the host radius, left to right in and out, and the error stays pinned. **Broken on 3 of 9 pages:** app reverses, layout and data snap off. **Under 3:1 on 9 grey-based controls.** |
| 2. Floating label | **4** | **Correct:** rises on hover, focus and value. 10 px caps, 0.12 em, 520 ms. Gradient notch is pixel-aligned. Per-character tint follows the sweep. Icon sweeps. Error is critical. **Wrong:** the notch background snaps instead of transitioning (all pages), and app's per-character delays are all 0 ms. |
| 3. `fields: floating \| classic` | **4** | The CSS flips 100% of fields on every page; the only exceptions are explicit `data-variant="floating"` overrides, which are correct. But 5 of 9 specimens (components, layout, data, app, marketing) have no toggle to show it. |
| 4. Frame button | **2** | Matches the spec only in foundations (CSS outline). In components and flows the SVG outline is unstyled and 0×0, so it never draws. |
| 5. Rails | **4** | **Correct:** the switch fill sweeps through on and clips back off (thumb 420 ms), the on-state inner sweep, the slider fill sweep, and the progress clip-fill. **Wrong:** the segmented control's behaviour is reinvented. |
| 6. Consistency | **2** | Three different phase machines are broken in three different ways. Two frame-button implementations. App invents a 1 px rule for notifications, and gives tool-calls a 2 px sliver. |

## Findings (severity-ranked)

### BLOCKER

**B1 · Frame button outline never draws: components and flows.** `specimens/components.html:1159` (`initSweep`), `specimens/flows.html:471` (`FRAME`).

- **What's wrong.** Both pages inject `<svg data-part="sweep-outline"><path pathLength=1 …/></svg>`. `warp.css:617-658` only styles the
  six-`<i>` CSS outline (`--warp-frame-head`/`--warp-frame-tail`), and nothing styles the SVG.
- **Measured.** The SVG computes to `width:0; height:0`. The path has `stroke:none` and `stroke-dasharray:none`, and `head`/`tail`
  animate on nothing.
- **What you see.** On hover only the active corners and the label copy wipe in. There's no stroke around the frame, and none exits
  right. In flows the buttons are `data-tone="neutral"`, so the tone corners and label copy are the same ink as the track: **hover
  produces no visible change at all.**
- **Frame times.**
  - components: in 150/300/620 shows corners and label only. Out 0–300 shows the corners clipping right, with no stroke.
  - flows: all 9 frames are identical.
- **Compare with:**
  - foundations: at in 150 the left edge draws, by in 300–620 the full outline is closed, and it exits right by out 300.
  - original: at in 150 the stroke rises on the left edge.
- **Evidence:**
  - [components-frame-light-balanced](shots/components-frame-light-balanced.png)
  - [components-frame-dark-balanced](shots/components-frame-dark-balanced.png)
  - [components-frame-filled-light-balanced](shots/components-frame-filled-light-balanced.png)
  - [flows-frame-light-balanced](shots/flows-frame-light-balanced.png)
  - working: [foundations-frame-light-balanced](shots/foundations-frame-light-balanced.png)
  - original: [orig-frame-light](shots/orig-frame-light.png)
- **Fix.** Emit the canonical markup from the `warp.css:596-600` comment in both pages:
  `<span data-part="sweep-outline"><i></i><i></i><i></i><i></i><i></i><i></i></span>` instead of the `<svg>`. Delete the SVG
  branch from `components.html:1159` and `flows.html:471`. Also drop `stroke-dashoffset` and `path` from those pages' `transitionend`
  filters (`components.html:1184`, `flows.html:538-539`), and listen for `--warp-frame-tail` or `clip-path` on `sweep-corners` instead.
  One frame implementation, in `warp.css` only.

**B2 · app.html: every sweep retracts right to left on exit.** `specimens/app.html:411`, `:417`, `:425`.

- **Root cause.** `sweepMs()` does `parseFloat(getPropertyValue("--warp-sweep-duration"))`. The custom property's value is the
  unresolved string `calc(620ms * 1)`, so `parseFloat` returns `NaN`, and the `|| 0` turns it into 0.
- **Chain.**
  1. `sweepOut` therefore removes `data-phase` in the same tick it sets `out`.
  2. With no phase attribute, `warp.css:547-550` leaves the sweep at `clip-path: inset(0 100% 0 0)` with its transition **still
     enabled**. Only `[data-phase="idle"]` disables it.
  3. So the sweep animates from `inset(0)` back to `inset(0 100% 0 0)`. That is the exact reversal the spec forbids.
- **Measured.**
  - field, composer, calendar event, kanban and booking slot, out 300: sweep `inset(0 45.4% 0 0%)` with phase `null`, so the left
    55% is still visible and shrinking toward the left.
  - tool-call: the base reverses too (`inset(0 0 0 54.6%)`).
- **Evidence:**
  - [app-field](shots/app-field-light-balanced.png)
  - [app-composer](shots/app-composer-light-balanced.png)
  - [app-calendar-event](shots/app-calendar-event-light-balanced.png)
  - [app-kanban-card](shots/app-kanban-card-light-balanced.png)
  - [app-suggestion](shots/app-suggestion-light-balanced.png)
- **Fix.**
  - **Read the duration correctly.** Copy the probe from `inputs.html:975-976` (`probe` + `msOf`): resolve
    `transition-duration: var(--warp-sweep-duration)` on a throwaway element.
  - **Never remove the attribute.** On the `transitionend` of `[data-part="sweep"]` while `out`, set `data-phase="idle"`
    (`app.html:417`, `:425`).
  - **Initialise the phase.** Set `data-phase="idle"` on every host at render (`SW` hosts currently start with no phase).

**B3 · layout.html and data.html: the exit snaps off instead of travelling right.**

- **What happens.** On hover-out the phase goes `in` → `out` → `idle` in the same task, so the sweep disappears instantly. The spec's
  "keeps travelling left to right, never reverses" exit is simply missing.
- **layout.** `specimens/layout.html:1168` has the same `parseFloat("calc(…)")` → 0 bug, so `sweepOut` writes `idle` immediately.
- **data.** At `specimens/data.html:547-548`, `host.querySelector(':scope > [data-part^="sweep"]')` returns **`sweep-base`** (the
  first child), and `warp.css:562-563` gives the base `transition: none` during `out`. The measured duration is 0, so it goes straight
  to `idle`.
- **Frame times.** Out 0 is already `phase:"idle"` with the sweep at `inset(0 100% 0 0)`, on every layout and data host tested: nav
  item, command trigger, navlist, topnav link, surface, stat, kanban, field, outline button.
- **Evidence:**
  - [layout-nav-item](shots/layout-nav-item-light-balanced.png)
  - [layout-command](shots/layout-command-light-balanced.png)
  - [layout-surface-vivid](shots/layout-surface-light-vivid.png)
  - [data-kanban-card-vivid](shots/data-kanban-card-light-vivid.png)
  - [data-stat-vivid](shots/data-stat-light-vivid.png)
  - [data-field](shots/data-field-light-balanced.png)
- **Fix.**
  - layout: use the `msOf` probe.
  - data: query `':scope > [data-part="sweep"]'` (the travelling part), not `^="sweep"`.
  - Better: delete all 9 per-page machines and ship one `sweep()` (the `inputs.html:1015-1038` version is correct) as a shared
    specimen script. Three copies are broken in three different ways.

### MAJOR

**M1 · The command-palette input row has no sweep** (suspect confirmed). `specimens/components.html:1102-1103`.

- **What's wrong.** `[data-part="input-row"]` has no `data-sweep` and isn't in `SWEEP_AUTO` (`:1142-1147`). Opening the palette and
  focusing or hovering the row leaves `phase:null` and no sweep part.
- **Original.** `CommandPalette.tsx:260` used a plain input too. But the spec (§1.7) says text inputs sweep everywhere, and a focused
  palette input is precisely the "pinned in" case.
- **Evidence:** [components-palette-input-row](shots/components-palette-input-row-light-balanced.png)
- **Fix.** Add `[data-scope="palette"] [data-part="input-row"]` to `SWEEP_AUTO`, give it `sweep-base` + `sweep` parts and
  `--warp-sweep-radius: 0` (it's flush with the dialog), and hold it `in` while the input has focus (it always does while open).

**M2 · The line accordion lost its sweep** (suspect confirmed). `specimens/components.html:1146`.

- **What's wrong.** The selector `[data-scope="accordion"]:not([data-variant="line"]) [data-part="item"]` excludes it, so hover only
  shows a grey background.
- **Measured.** Every frame has `phase:null` and no sweep part.
- **Original.** The original has only the boxed accordion (`Accordion.tsx:145-151`, `field-sweep` held while open). Spec §1.7 lists
  accordion without exception.
- **Evidence:**
  - [components-accordion-line](shots/components-accordion-line-light-balanced.png)
  - working boxed: [components-accordion-boxed](shots/components-accordion-boxed-light-balanced.png)
- **Fix.** Remove the `:not([data-variant="line"])`. For `line`, set `--warp-sweep-radius: 0` and make the base the item's own bottom
  hairline. The sweep is still the full 1 px stroke and still left to right.

**M3 · app.html "1 px" sweeps** (suspect confirmed).

- **Tool-call** (`app.html:562`):
  - The sweep spans sit directly inside a closed `<details>`, and render as a **319×2 px** (and 784×2 px) box. Measured: 6 of 6
    tool-calls.
  - On hover the "border" is a 2 px sliver at the top. Nothing is visible in the strip.
  - Evidence: [app-tool-call](shots/app-tool-call-light-balanced.png)
  - Fix: wrap the tool call in a host `<div data-scope="tool-call" data-sweep>` that contains `${SW}` and the `<details>`, or put the
    parts inside `<summary>` with `position: relative`.
- **Notification** (`tokens/warp-app.css:564-566`):
  - The sweep is deliberately reduced to `inset:auto 0 0; block-size:0; border-top` — a **1 px bottom rule** (measured 386×1).
  - That reinvents the signature: everywhere else a surface gets the full border over a hairline base.
  - Evidence: [app-notification](shots/app-notification-light-balanced.png)
  - Fix: delete those three rules. Use the surface treatment (hairline base, full-accent sweep), and keep the separate arrival
    top-edge (`[data-arrive]::after`) as it is.

**M4 · app.html: message bubbles have `data-sweep` but no sweep parts.** `specimens/app.html:1322`.

- **What's wrong.** 14 of 14 messages have no sweep parts. So hover does nothing, and the "message sent" confirmation
  (`warp-app.css:97`, which targets `> [data-part="sweep"]`) does nothing either.
- **Evidence:** [app-message](shots/app-message-light-balanced.png)
- **Fix.** Insert `${SW}` into the message host (or the bubble), with `--warp-sweep-radius: var(--warp-bubble-radius)`. If the intent
  is no hover sweep on messages, keep the parts but gate them with `--_on: 0` and let `data-confirm` play.

**M5 · app.html: the per-character label tint doesn't travel.** `specimens/app.html:440`.

- **What's wrong.** `charDelays` uses `sweepMs()`, which is 0 (see B2), so every `--d` is `0ms`. Measured on 9 of 9 labels. The whole
  label recolours at once instead of following the sweep (§2.4).
- **Compare.** Inputs, layout, data, flows and the other pages produce 70–340 ms delays.
- **Fix.** Same probe as B2. Recompute on resize and on dial change.

**M6 · app.html solid buttons and the pressed booking slot: the sweep is invisible, and an ink ring is added.**

- **Where.** `specimens/app.html:386-387`: `btn(…, { sweep: true })` adds `sweep-base` and `sweep` to a **solid** button.
- **Effect.**
  - The accent sweep runs over the accent fill at **1.08:1** (light) and 1.81:1 (dark). The measured strip shows no stroke.
  - The ink `sweep-base` puts a black ring around a solid button at rest, which the original never had.
  - The pressed `[data-part="slot"]` is the same: 1.08:1.
- **Spec.** §1b.4 says filled buttons use the **fill** variant.
- **Evidence:**
  - [app-solid-sweep-button](shots/app-solid-sweep-button-light-balanced.png)
  - [app-booking-slot](shots/app-booking-slot-light-balanced.png)
  - correct: [foundations-solid-button](shots/foundations-solid-button-light-balanced.png),
    [flows-solid-button](shots/flows-solid-button-light-balanced.png)
- **Fix.** For solid emphasis, emit `<span data-part="sweep-fill">` (as `foundations.html:746` does) and no `sweep-base`/`sweep`.
  For a pressed slot, pin the fill or use `--_tone-sweep: var(--warp-color-accent-on-solid)`.

**M7 · Controls with a grey base fail the mandatory sweep-vs-base ≥ 3:1** (the "no visible sweep" complaint, still live on controls).

- **What's wrong.** These hosts set `--_base: var(--warp-color-border-control)`, which is oklch 0.625 in light and 0.545 in dark,
  against a sweep at 0.515 / 0.6.
- **Measured sweep-vs-base:**

  | | quiet | balanced | vivid |
  |---|---|---|---|
  | light | 1.50:1 | 1.47:1 | 1.48:1 |
  | dark | 1.33:1 | 1.34:1 | 1.35:1 |

  Fields on the ink base measure 3.03–3.16:1, which passes.
- **Hosts:**
  - switch off-ring: `tokens/warp-inputs.css:380` (also foundations and flows)
  - segmented: `:418`
  - choice-card: `:435`
  - chip: `:463`
  - dropzone: `:693`
  - knob: `:843`
  - xy-pad: `:872`
  - icon-tile: `:937`
  - layout command trigger: `tokens/warp-layout.css:421`
- **Visible result.** The ring reads only by hue. Compare [inputs-choice-card](shots/inputs-choice-card-light-balanced.png),
  [inputs-switch-off](shots/inputs-switch-off-light-balanced.png), [inputs-switch-off-dark](shots/inputs-switch-off-dark-balanced.png)
  and [layout-command](shots/layout-command-light-balanced.png) with
  [inputs-field-icon](shots/inputs-field-icon-light-balanced.png).
- **Original.** The switch rested on `--border` (`Switch.tsx`), but `SIGNATURE.md` overrides it: "Inputs and controls rest on the ink
  border… Sweep-vs-base ≥ 3:1 stays mandatory for fields and controls".
- **Fix.** Replace `--_base: var(--warp-color-border-control)` with `--_base: var(--warp-color-sweep-base)` in those 8 rules, and in
  `warp-layout.css:421`.
  - If the design wants these quieter at rest, keep the grey base but raise the sweep for these hosts to `--warp-color-text-strong`
    luminance plus the accent hue.
  - Whichever way, re-run the specimen's own contrast meter (`app.html:457-466` already has one) on these hosts.

**M8 · Segmented control: the sweep is reinvented.** `specimens/inputs.html` (`decorate`, segmented branch), the foundations
segmented, and `flows` `[data-part="indicator"]`.

- **Original** (`Segmented.tsx:98-140`): hovering an **unselected** option sweeps a 1 px accent ring around **that option**. The
  selected option never sweeps.
- **warp:**
  - hovering anywhere sweeps a ring around the **whole group**;
  - and/or the **selected indicator's** inner `rail-hover` darkens left to right, even when the pointer is over a different option.
  - At inputs in 300 the group ring is half drawn while "Board" is hovered, and the "List" indicator also darkens.
- **Evidence:**
  - [inputs-segmented](shots/inputs-segmented-light-balanced.png)
  - [foundations-segmented](shots/foundations-segmented-light-balanced.png)
  - [flows-segmented](shots/flows-segmented-light-balanced.png)
- **Fix.** Make each `[role=radio]:not([aria-checked=true])` option the sweep host, with `--warp-sweep-radius` = the inner radius.
  Drop the group-level ring. Keep `rail-hover` only for the *indicator moving* on selection (§1c "segmented indicator"), not on hover
  of other options.

### MINOR

1. **The notch background snaps instead of fading** (all pages). `tokens/warp.css:728`.
   - **What's wrong.** `transition-property` omits `background-color`. The original (`FloatingBorderInput.tsx`, `FloatingLabel`)
     transitions `background-color` over 520 ms.
   - **Visible effect:**
     - in 0: a page-coloured box appears behind the still-inside label, over the tinted field.
     - out 0–150: the label descends through the border with no notch, and the stroke cuts through the text.
   - **Evidence:** [inputs-field-icon](shots/inputs-field-icon-light-balanced.png) (frames "in 0", "out 0", "out 150") and
     [app-field](shots/app-field-light-balanced.png) ("out 0").
   - **Fix.** Add `background-color` to that list.
   - **Also:** stop `--_notch-image` from switching on until `inset-block-start` is within 4 px of the float offset. For example,
     gate it with `:not(:hover)` delays, or use `transition: background-image 0s var(--warp-label-float-duration)` on the way down.

2. **Surfaces sweep at quiet and balanced on data, app and marketing.**
   - **Where:** data stat, panel, card and kanban (`warp-data.css:134`, `:1026` hard-sets `--_on: 1`); app kanban and calendar;
     marketing tile and plan.
   - **Spec.** §3 says cards, panels and stat rows sweep by default **only at vivid**.
   - **Also:** marketing tiles and plans rest on the **ink** base (oklch 0.235) instead of the hairline the surfaces exception requires.
     See [marketing-tile](shots/marketing-tile-light-balanced.png).
   - **Fix.** Use `--_on: var(--warp-sweep-surfaces)` and `--warp-color-sweep-base: var(--warp-color-border)` for these scopes, or
     tag them `data-scope="surface"`.

3. **There is no `fields` toggle on components, layout, data, app or marketing.**
   - Setting `data-fields="classic"` on `:root` flips 100% of their fields (verified: 3/3, 5/5, 9/9, 1/1), so the CSS is right, but the
     specimen can't demonstrate it.
   - components renders **zero** signature fields (its select, palette and dialog field are not field shells).
   - **Fix.** Add the same `data-ctl="fields"` segmented control the other pages have, and add at least one floating field plus a
     combobox field to components.

4. **Outline buttons (data) and plan cards (flows) in dark: sweep-vs-base is 2.71:1.** The base is oklch 0.38. These are controls.
   - Evidence: [data-outline-button-dark](shots/data-outline-button-dark-balanced.png)
   - Fix: base `--warp-color-sweep-base` in dark, or lift the dark sweep to L 0.66.

5. **layout per-character delays always assume 620 ms.** `specimens/layout.html:1189` makes the same `parseFloat` call, so the
   delays are wrong at quiet (480 ms) and vivid (700 ms).

6. **Re-entering while `out`.**
   - **Spec.** §1.4 says it jumps straight to `in`.
   - **app, layout, data.** They force `idle`, reflow, then `in`, so the stroke restarts from the left edge.
   - **Fine already.** inputs and components follow the spec.
   - **Fix.** Pick one behaviour and put it in the shared `sweep()`. The spec wording is the requirement.

7. **Labels are `<span>`, not `<label for>`, in data, marketing, inputs-rich and foundations.** Spec §2.5 requires a real
   `<label for>` in both modes. Verified by tag: inputs, layout, flows and app use `<label for>`.

8. **The frame outline's corners are rounded** by `border-radius: var(--warp-radius-mark)` + `overflow:hidden` on the button
   (`warp-components.css` frame block). The original is square-capped and mitred at 2 px radius.
   - Evidence: [foundations-frame](shots/foundations-frame-light-balanced.png),
     [foundations-frame-filled](shots/foundations-frame-filled-light-balanced.png)
   - Fix: `border-radius: min(var(--warp-radius-mark), 2px)` on `[data-emphasis="frame"]`.

9. **`--_sweep-color` is dead code.** `tokens/warp-app.css:44-47, 566, 677` set it, but `warp.css` never reads it (the sweep uses
   `color`). So the composer's intended base and the notification's transparent base never apply. Delete it, or rename it to `color:`.

10. **Info: the spec deviates from the original in two places** (warp follows the spec, as it should, but the user should know):
    - **Duration.** The original frame button runs at `--btn-sweep-duration: 760ms` (`tokens.css:263`), not 620.
    - **Label copy colour.** The original's label copy wipes to `--text` over an accent idle label (`.btn-idle-accent`); the spec says
      the copy is in the tone colour.

11. **Info, faithful: the rounded leading edge leaves a gap mid-sweep.** `round` is applied to both the sweep's leading edge and the
    base's trailing edge, so mid-sweep (frame "in 300") there is a small gap where the two meet. The original has the same artefact
    (`round 0.375rem` on both). No action.

## What passes (verified, no action)

- **Phase machine** (inputs, inputs-rich, foundations, components, flows, marketing):
  - idle → in → out → idle, with out → idle on the sweep's `transitionend`;
  - exit travels left to right; out 300 measures `inset(0 0 0 45.4%)`.
- **Timing:**
  - 620 ms balanced, 480 ms quiet, 700 ms vivid;
  - `cubic-bezier(0.65,0,0.35,1)`;
  - the label floats over 520 ms on `cubic-bezier(0.16,1,0.3,1)`.
- **Clip radius:** `round` matches the host radius on fields (5 px), switches (pill), surfaces (2–7 px) and chips (999 px).
- **Visibility:**
  - field sweep-vs-ink-base is 3.03–3.16:1 in every dial and theme;
  - sweep-vs-surface is 3.98–5.39:1 for every host.
- **Field states:**
  - the error state pins the critical sweep and clips the base: [inputs-field-invalid](shots/inputs-field-invalid-light-balanced.png);
  - the gradient notch is seamless in light and dark: [inputs-field-gradient-dark](shots/inputs-field-gradient-dark-balanced.png),
    vs the original [orig-field-gradient](shots/orig-field-gradient-light.png).
- **Icon sweep** runs in step with the border: 37/37 icon fields on inputs, 23/23 on inputs-rich, 21/21 on foundations.
- **Classic mode** keeps the sweep and the icon sweep, and the label tints:
  [inputs-field-icon-classic](shots/inputs-field-icon-light-balanced-classic.png).
- **Switch:**
  - the fill sweeps through the rail on and clips back off, with the thumb at 420 ms:
    [inputs-switch-click](shots/inputs-switch-click.png), [flows-switch-click](shots/flows-switch-click.png),
    [foundations-switch-click](shots/foundations-switch-click.png);
  - the on-state inner sweep is correct: [inputs-switch-on](shots/inputs-switch-on-light-balanced.png).
- **Slider and progress:**
  - the slider fill sweeps: [inputs-slider](shots/inputs-slider-light-balanced.png),
    [foundations-slider](shots/foundations-slider-light-balanced.png);
  - the progress range clips through the rail on the sweep timing (`warp-components.css:973-978`).
- **Popovers.** The inputs-rich picker popovers are held `in` while open:
  [inputs-rich-popover-date](shots/inputs-rich-popover-date-light-balanced.png).
- **Fill frame.** The fill slides in from the left and leaves to the right, in components and foundations.
- **Reduced motion.** The sweep becomes an instant colour change and the label fades over 120 ms (6 pages).

## Evidence index

This review's strips are the `*.png` files in `shots/` named `<page>-<host>-<theme>-<dial>[-mode].png`, plus `*-click.png` and
`orig-*.png`. The `.jpg` files in that folder belong to other reviews.
