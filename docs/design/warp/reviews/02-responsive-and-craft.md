# warp review 02: responsive quality and visual craft

Reviewer: independent judge (designed none of it). Date: 2026-10-28. Scope: the nine specimens in
`docs/design/warp/specimens/`, judged against the brief and against `00-direction.md`, `01-foundations.md`,
`SIGNATURE.md` and `COVERAGE.md`.

## Method

- **Real viewports, not the specimens' own frames.** I used Playwright with Chromium 1234, served from
  `http://localhost:4817`. I tested phone at 390×844 (isMobile, hasTouch, DPR 2, so `(pointer: coarse)` matches),
  tablet portrait at 834×1194, tablet landscape at 1194×834 (both touch), and desktop at 1280×800 and 1440×900.
- **Dial and theme.** Every specimen ran at quiet, balanced and vivid, in light and dark, at 1440. Phone ran
  balanced/light, vivid/dark and quiet/light. Tablet and 1280 ran balanced/light. I set the dial through each
  specimen's own controls (`?stop=` / `?x=` / radios), then confirmed it on `<html>`.
- **What the DOM audits checked.**
  - page `scrollWidth` vs the viewport, and elements past the right edge;
  - unscaled target size (`offsetWidth` and `offsetHeight`, with `::before`/`::after` hit expanders counted, and
    elements inside the specimens' transform-scaled device frames excluded);
  - input `font-size`;
  - text clipped by `overflow: hidden`;
  - visible text under 11px;
  - sticky and fixed elements;
  - infinite animations running while idle;
  - CLS while hovering a field;
  - long tasks during a dial switch.
- **Reduced motion.** I ran each specimen with `reducedMotion: 'reduce'` and listed the animations still running.
- **Evidence.** Screenshots are in [`shots/`](shots/). Names follow `<specimen>-<viewport>-<stop>-<theme>.jpg`,
  plus targeted shots named for the finding.

**The good news first.** No specimen scrolls horizontally at any viewport. All 27 phone runs pass the 16px rule:
every input outside a desktop frame computes ≥ 16px on a coarse pointer. Field heights resolve to 44px on touch
from tokens alone. Hovering a field is layout-stable (CLS ≈ 0.00001). The sweep is crisp and directional at both
stops ([quiet out](shots/motion-field-sweep-quiet-out-250ms.png), [vivid in](shots/motion-field-sweep-vivid-300ms.png)).
Quiet reads as genuine B2B product UI ([data, quiet/dark](shots/data-d1440-quiet-dark.jpg),
[marketing, quiet](shots/marketing-1440-quiet.jpg)). Vivid on the marketing page is the best thing here, and it is
premium without being garish ([marketing, vivid/dark](shots/marketing-d1440-vivid-dark.jpg)).

Where it falls short: phone chrome, decoration that collides with content, reduced-motion leaks, and a handful of
touch targets that bypass the token system.

---

## Scores (1 = poor, 5 = excellent)

| Specimen | Phone | Tablet | Desktop | Quiet | Vivid | Cohesion | Craft | One-line verdict |
|---|---|---|---|---|---|---|---|---|
| foundations | 3 | 4 | 4 | 5 | 4 | 4 | 4 | Clear and calm. Its sketch buttons and specimen labels skip the coarse rules it preaches. |
| inputs | 4 | 4 | 4 | 5 | 4 | 4 | 4 | The strongest component specimen. The tinted field fill is the one bad call. |
| inputs-rich | 3 | 4 | 4 | 4 | 3 | 3 | 3 | Sheets work on a phone. The 36px icon buttons have no hit area, and the hero italic is synthesised. |
| components | 2 | 3 | 4 | 4 | 4 | 4 | 3 | The staged hero breaks below 920px, and the bottom sheet opens with a stray focus box. |
| layout | 3 | 4 | 2 | 4 | 4 | 3 | 3 | The specimen's own header nav wraps to three lines at 1280 and 1440. |
| data | 3 | 4 | 4 | 5 | 3 | 4 | 4 | Quiet is best in class. Vivid's serif KPIs lose tabular figures. Reduced motion strobes a skeleton. |
| app | 1 | 2 | 3 | 4 | 4 | 3 | 2 | The weave paints over the hero copy at every width, and the sticky bar takes 31% of a phone. |
| flows | 1 | 3 | 4 | 4 | 4 | 3 | 3 | Good flows behind a 314px sticky header (37% of a phone). |
| marketing | 3 | 4 | 4 | 5 | 5 | 4 | 4 | The best-looking page. It ignores the OS reduced-motion setting. |

**Brief check.**

| Brief item | Grade | Reason |
|---|---|---|
| Thin | A− | Hairlines, ≤ 1 border, no box-in-box |
| Fades not flashy | B+ | The sweep is tasteful, but several loops run idle |
| One system from quiet to vivid | A− for range, B for cohesion | Specimen chrome differs page to page |
| Phone, tablet, desktop all good | C+ | Two specimens are unusable on a phone because of their own header |
| Premium | B+ | Pulled down by faux italics and overlapping decoration |

---

## Findings

### Blockers

**B1. App: the hero weave paints over the hero copy at every width.**
- *Where:* `specimens/app.html` `.sp-weave` (line 59) inside `.sp-hero`. Phone, tablet and desktop; every stop.
- *What's wrong:* the absolutely positioned SVG comes before the text in the DOM, but positioned boxes paint above
  in-flow content. Its vertical warp lines and accent weft bars cross the paragraph, the fact chips and the
  contrast pills.
  - At 390 the lines run through "rooms people talk" and "Calendar & booking".
  - At 1440 they slice "sweep vs surface 5|06:1" and "Collaboration & comments".
- *Evidence:* [phone](shots/app-phone-balanced-light.jpg), [tablet](shots/app-tabletP-balanced-light.jpg),
  [desktop, vivid/dark](shots/app-1440-hero-weave-overlap.jpg).
- *Fix:* add `.sp-hero { isolation: isolate } .sp-weave { z-index: -1 }`. Then constrain the art to the right
  column: `@media (min-width: 1000px) { .sp-hero > :not(.sp-weave) { max-inline-size: 52% } }`. Below 1000px,
  either hide it (`@media (max-width: 999px) { .sp-weave { display: none } }`) or move it under the copy as a
  120px band.

**B2. Flows and App: the sticky specimen header covers 37% and 31% of a phone screen.**
- *Where:* `specimens/flows.html` `header.bar` and `specimens/app.html` `.sp-top` (line 34). 390×844, all stops.
- *What's wrong:* the controls wrap to five or six rows (314px and 263px) and stay pinned, so every section is read
  through a slot about 530px tall. Five other specimens turn the same bar into a horizontal scroll strip, so these
  two are also inconsistent.
- *Evidence:* [flows scrolled](shots/flows-phone-sticky-scrolled.jpg), [app](shots/app-phone-sticky-scrolled.jpg).
- *Fix:* below 600px, make the bar `position: static`, or keep it sticky but collapse it to one 52px row: brand plus
  a "Dial · Theme" button that opens the controls in a bottom sheet. Use one shared pattern in every specimen (see M9).

**B3. Marketing ignores the OS reduced-motion setting.**
- *Where:* `specimens/marketing.html` line ~1301:
  `const S = { …, motion: Q.get("motion") || "full" }` and then `root.dataset.motion = s.motion`. All viewports and
  stops with `prefers-reduced-motion: reduce`.
- *What's wrong:* writing `data-motion="full"` overrides the media query (`warp.css:211` only applies to
  `:root:not([data-motion])`). With reduce on, I measured `--warp-motion-scale: 1`, a 620ms sweep, and the
  `mk-marquee` logo loop and `mk-parallax` still running.
- *Fix:*
  `motion: Q.get("motion") || (matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduce" : "full")`.
  Better, leave `data-motion` unset unless the user picks something in the dock. Do the same for `?embed` frames.

**B4. Under reduced motion, data skeletons shimmer every 120ms instead of stopping.**
- *Where:* `tokens/warp-data.css:744`:
  `@media (prefers-reduced-motion: reduce) { :where(:root:not([data-motion="full"]) [data-scope="chart"] *) { animation-duration: 120ms !important; … } }`.
  Seen in `specimens/data.html` `#c-state`.
- *What's wrong:* the rule is meant to collapse one-shot enters. It also catches the infinite `warp-shimmer` on
  `[data-part="skeleton"]`, so a 1.4s sweep becomes an 8Hz strobe for exactly the users who asked for less motion.
  I measured 7 skeleton bars at 120ms with infinite iterations.
- *Fix:* add `animation-iteration-count: 1 !important` to the same rule, and add
  `:where([data-scope="chart"] [data-part="skeleton"]) { animation: none !important }` inside the media query.
  Mirror it for `[data-motion="reduce"]` (see M6).

### Major

**M1. Balanced and vivid fill every field with `accent-soft`, so a generic site gets tinted forms.**
- *Where:* `tokens/warp.css:84` and `:148` (`--warp-ref-field-fill: var(--warp-color-accent-soft)`). Every specimen
  with fields, at balanced and vivid, in light and dark.
- *What's wrong:* with the default green, every input is mint, which reads like a Bootstrap success alert. In dark
  vivid every input is a deep-green slab. With an orange or pink brand accent, every form becomes peach or pink.
  That is the opposite of "fits any site's theme" at the default stop. Quiet's `surface-raised` is the right answer.
- *Evidence:* [balanced](shots/inputs-d1440-balanced-light.jpg) vs [quiet](shots/inputs-d1440-quiet-light.jpg),
  [vivid/dark phone](shots/inputs-phone-vivid-dark.jpg).
- *Fix:* balanced field fill becomes `surface-raised`; vivid becomes
  `color-mix(in oklab, var(--warp-color-accent-soft) 35%, var(--warp-color-surface-raised))` (a hint, not a slab).
  Keep full `accent-soft` for the `:focus-within` and floated-active state only, so the colour arrives with the sweep.
  Re-run `contrast-check.mjs` (the label-on-field pairs change).

**M2. Hero headlines use a synthesised italic (Space Grotesk has none).**
- *Where:*
  - `specimens/components.html:49` `.hero h1 em { font-style: italic }` ("Thread*ed*.");
  - `specimens/inputs-rich.html` hero `h1 em` ("& *ink*.").
  Balanced at every viewport.
- *What's wrong:* `document.fonts` holds no italic face for Space Grotesk, and `font-synthesis` allows style, so
  Chrome slants the roman glyphs. Faux obliques are a visible tell of low craft at 128px. `00-direction §4` also
  reserves the italic for the vivid serif.
- *Evidence:* [components hero](shots/components-d1440-balanced-light.jpg),
  [inputs-rich hero](shots/inputs-rich-tabletP-balanced-light.jpg).
- *Fix:*
  `[data-expression]:not([data-expression="vivid"]) h1 em { font-style: normal; color: var(--warp-color-accent-text) }`.
  This is exactly what `app.html:56` already does. Add `font-synthesis-style: none` to `warp.base` for display
  roles.

**M3. Components: on tablet and phone the staged hero menu covers the card's own content.**
- *Where:* `specimens/components.html:55–60` `.vignette > * { position: absolute }`, `.vg-menu`, `.vg-toast`.
  834 and 390, all stops.
- *What's wrong:* below 920px the vignette goes single-column, but the menu stays absolutely placed at
  `inset-block-start: 26%`. It hides the "72%" rollout value and the "main → production" and "Checks passed" rows,
  and cuts the Promote frame.
- *Evidence:* [tablet](shots/components-tabletP-balanced-light.jpg), [phone](shots/components-phone-hero-overlap.jpg).
- *Fix:* inside the existing `@media (max-width: 920px)` block, add
  `.vignette { display: grid; gap: 12px; min-block-size: 0 } .vignette > * { position: static !important; inset: auto !important }`
  and `.vg-menu { justify-self: end; inline-size: min(236px, 100%) }`. Show the menu and toast stacked under the card.

**M4. Components: the bottom sheet opens with a full-width green focus box around the handle, and its primary action is below the fold.**
- *Where:* `specimens/components.html:1086` `button[data-part="handle"]`, `?open=bottom`, 390×844.
- *What's wrong:*
  - Initial focus lands on the 6px-tall handle, so the 2px focus ring draws a hard rectangle across the sheet's top
    edge.
  - The sheet opens at the half snap. "Show" sits off-screen with no sticky footer, unlike the dialog, which does it
    right ([dialog](shots/components-phone-open-dialog.jpg)).
- *Evidence:* [bottom sheet](shots/components-phone-open-bottom.jpg).
- *Fix:*
  - Send initial focus to the sheet heading (`tabindex="-1"`) or the first control, never the handle.
  - Give the handle `min-block-size: var(--warp-hit-min)` with the 4px pill drawn by a pseudo-element, and a
    focus ring that hugs the pill (`outline-offset: -14px` or a `::after` ring).
  - Make `[data-part="footer"]` sticky inside the sheet (`position: sticky; inset-block-end: 0; padding-block-end: env(safe-area-inset-bottom)`),
    which matches the dialog.

**M5. Layout: the specimen's header nav wraps to three lines and clips the controls at desktop widths.**
- *Where:* `specimens/layout.html:100–104` `.bar .wrap`. 1280 and 1440, all stops.
- *What's wrong:*
  - Nav items break mid-label ("Page / parts", "Input / & / focus"), pushing the bar to about 72px with ragged
    baselines.
  - At 1280 the Density group is clipped at the right edge ("Coz…") with no scroll affordance.
  - This is the layout specimen, so the header is the first thing judged.
- *Evidence:* [1280](shots/layout-1280-header-wrap.jpg), [1440](shots/layout-d1440-quiet-light.jpg).
- *Fix:* `.bar nav a { white-space: nowrap }`. Move the nav to a second row below 1500px (`flex-basis: 100%`), or
  put it in the `useContainerOverflow` "More" menu the kit already specifies. Add an edge fade
  (`mask-image: linear-gradient(90deg, #000 92%, transparent)`) to any scroll strip.

**M6. Idle loops and reduced-motion gaps beyond B3/B4.**
- *Where:*
  - `tokens/warp-data.css:1021` `[data-scope="flow"] .edge[data-live]` `warp-dash` runs forever (`data.html #flow`);
  - `tokens/warp-components.css:1024,1279` skeleton shimmer;
  - `tokens/warp-flows.css:533` `animation: warp-shimmer 1.4s` is hard-coded and ignores the motion scale.
  Desktop, both motion modes.
- *What's wrong:*
  - `00 §8` says nothing moves while idle except a skeleton shimmer, and that stops under reduced motion. I found
    more:
    - with reduce on, `components.html` still runs `warp-shimmer` (1240ms) on skeleton, avatar and badge
      placeholders;
    - `warp-indeterminate` keeps running;
    - `data.html #flow` keeps marching its dashes (900000ms, a "frozen by division" hack that still keeps a
      compositor animation alive).
  - The only stop rule is `warp.css:515`, `[data-shimmer]`, which none of these skeletons carry.
  - `data-motion="reduce"` set by an app (not the OS) stops none of them.
- *Fix:* one rule pair in `warp.base` covering
  `[data-part="skeleton"], [data-scope="skeleton"], .edge[data-live], [data-scope="shimmer"]`, with
  `animation: none`:
  - `@media (prefers-reduced-motion: reduce) { :where(:root:not([data-motion="full"]) :is(…)) { … } }`;
  - `:where([data-motion="reduce"] :is(…)) { … }`. Replace the `/ max(scale, 0.001)` trick with `animation-play-state: paused` keyed off the same
  selector. Spinners may keep turning, which is acceptable as the system's status signal, but slow them to 2× under
  reduce.

**M7. Touch targets that bypass the hit-area system (real 390px coarse viewport, unscaled sizes).**
- **components.** `[data-scope="toggle-group"] [data-scope="toggle"]` is 38px tall.
  - *Where:* `tokens/warp-components.css:279`, `block-size: calc(var(--warp-control-md) - 6px)`.
  - *Fix:* `max(calc(var(--warp-control-md) - 6px), var(--warp-hit-min))`, or add the same `::after` expander chips
    use (`:305`).
- **inputs-rich.** Calendar prev/next and sort "Move up/down" are `data-size="sm"` icon buttons at 36×36 with no
  expander, because they lack `data-icon-only`.
  - *Fix:* add `data-icon-only`, or apply the `:230` expander to every `[data-scope="button"][data-size="sm"]` under
    coarse.
- **data.** `#tracker` `[data-part="bars"] > button`: 90 focusable bars, each **3px wide** on a phone.
  - *Evidence:* [tracker](shots/data-phone-tracker-3px-targets.jpg).
  - *Fix:* under `(pointer: coarse)`, make the bars `pointer-events: none` and put one scrubber on `[data-part="bars"]`
    (pointermove → nearest day, roving `aria-activedescendant`).
- **data.** Table rows in `#tbl-1` are 26–28px tall on coarse, so the select-checkbox cell is under 44px.
  - *Fix:* `[data-pointer="coarse"] [data-scope="table"] { --_rh: max(var(--_rh), var(--warp-hit-min)) }`, plus the
    media-query twin.
- **app.** `[data-scope="composer"] textarea` renders 32px tall (`tokens/warp-app.css:678`, `min-block-size: 24px`),
  and `[data-part="model"]` is 28px.
  - *Fix:* `min-block-size: max(24px, calc(var(--warp-hit-min) - 12px))` on the textarea (the composer padding makes
    up the rest), and `min-block-size: var(--warp-hit-min)` on the chip.
- **flows.** `.link` buttons ("Forgot password?", "Email me a sign-in link instead", "Create an account") are 20px
  tall (`specimens/flows.html:74`, `all: unset`).
  - *Fix:* add `display: inline-flex; align-items: center; min-block-size: var(--warp-hit-min)` to `.link`.
- **inputs.** Colour swatches resolve to a 38px hit area.
  - *Where:* `tokens/warp-inputs.css:679`, the `+ 3px` in `inset: min(0px, calc((24px - var(--warp-hit-min)) / 2 + 3px))`.
  - *Fix:* drop the `+ 3px`, and let neighbouring hit areas overlap by the 3px gap. Overlap is fine for a radio group.
- **layout.** `#parts` `[role="switch"]` is 34×20 with no label hit area, and `[data-part="close"]` is 32×32.
  - *Fix:* wrap each switch in its row `label` (`min-block-size: var(--warp-hit-min)`), and give the close button
    the icon-only expander.

**M8. Data, vivid: KPI numbers set in Instrument Serif lose tabular figures, and 12px serif deltas are nearly illegible.**
- *Where:* `tokens/warp-data.css`, stat `[data-part="number"]` and its delta badge. 1440, vivid, light and dark.
- *What's wrong:*
  - `font-variant-numeric: tabular-nums` is set, but Instrument Serif has no `tnum` feature, so live KPIs will jitter
    as digits change. `00 §4` mandates tabular numerals "at every stop".
  - The delta badges ("+12.4%", "−0.3 pt") render in the serif at 12px. With its small x-height that reads like 9px.
  - The four sparklines each get a different saturated pastel fill for no data reason (decorative colour), which is
    the one place vivid edges toward candy.
- *Evidence:* [data vivid light](shots/data-d1440-vivid-light.jpg).
- *Fix:*
  - Keep the serif only for the big number, and only where it doesn't update live:
    `[data-scope="stat"][data-live] [data-part="number"] { font-family: var(--warp-text-heading-font) }`.
  - Set deltas in `--warp-font-mono` or the body sans.
  - Give all KPI sparklines `data-1`, or the accent ramp, at 18% fill.

**M9. Specimen chrome is four different products.**
- *Where:* the top bar of every specimen. All viewports.
- *What's wrong:*
  - The same control is labelled "Page stop" (foundations), "Expression" (inputs, inputs-rich, components),
    "Dial" (layout, app, flows, marketing) and "Stop" (data).
  - Density's third option is "Comfortable", "Comfy" or "Roomy".
  - On a phone the bar wraps and scrolls away (foundations), wraps and sticks (flows, app), scrolls sideways with
    the last label clipped ("DENSIT", "Com", "Float"; inputs, inputs-rich, components, layout, data), or is a
    floating bottom dock (marketing).
  - The versions read v0.1 and v0.2.
  - The control labels are 10px (`span#l-*`), under the 11px caps floor in `00 §4`.
  - For a toolkit selling "one system", the frame around it should be one component.
- *Fix:*
  - Extract one `specimen-bar` partial (brand, then Dial · Theme · Density · Motion · page-specific extras), with one
    label set: "Dial", "Theme", "Density: Compact / Cozy / Comfortable", "Motion".
  - Labels at 11px.
  - On a phone, one sticky row plus a sheet (B2). Above 600px, one row with overflow fade.
  - Add a matching `?dial=&theme=` deep link to all nine (foundations and flows have none today).

**M10. Data: switching the dial blocks the main thread for about 350ms.**
- *Where:* `specimens/data.html` `on.stop` re-draws every chart synchronously. 1440.
- *What's wrong:* one long task of 350ms on the dial click; components takes 93ms and marketing 81ms. The dial
  change then lands as a visible hitch instead of the "quiet crossfade" marketing achieves with View Transitions.
- *Fix:*
  - Redraw only the charts in view (`IntersectionObserver`), defer the rest with `requestIdleCallback`/`scheduler.yield()`
    between charts, and wrap the attribute flip in `document.startViewTransition` the way `marketing.html:1312` does.
  - The measurement was taken on a machine with a load of 7.

### Minor

- **m1. App: section heading and lede have no gap.**
  - *Where:* `specimens/app.html:70–74` `.sp-head`.
  - *What's wrong:* `h2` and `p` share one grid cell, so "Show the work. Ask before acting." sits on the paragraph
    with about 2px between them at every stop. At desktop the bullets start in the right column 60px lower, so the
    two columns don't share a top line.
  - *Evidence:* [vivid/dark](shots/app-d1440-vivid-dark.jpg).
  - *Fix:* `.sp-head > div { display: grid; gap: 12px }`, and `align-items: start` on the 1000px grid.
- **m2. Marketing: overlapping proof avatars clip their initials** ("MA" shows as "M/").
  - *Where:* `specimens/marketing.html:106` `.proof-avatars [data-part="avatar"]`. All viewports.
  - *Fix:* `margin-inline-end: -4px`, `inline-size: 28px`, and `font-size: 11px; letter-spacing: -0.02em`. Avatar
    initials in components, app, data and layout are also 8–9px (`span[data-scope="avatar"]`); set
    `font-size: max(11px, 40%)` in the avatar token.
- **m3. Marketing: the hero annotation chip covers the dashboard's p95 label.** "Canary 5% → 25%" sits on top of
  "p95 / 112ms" at 1440 (`[data-part="annotation"]` in the hero mock).
  - *Evidence:* [quiet](shots/marketing-1440-quiet.jpg).
  - *Fix:* anchor it to the chart's last point (`inset-block-start: 38%`) instead of the stat row.
- **m4. The 10px floating label contradicts the type floor.** `warp.css:438` calls 10px "the one sub-11px caps
  exception", but `00-direction §4` says "Nothing at 9–10px". On a phone, 10px caps above a 16px value is a 1.6×
  jump.
  - *Fix:* write the exception into `00 §4`, and use `--warp-label-float-size: max(10px, calc(var(--warp-input-font-min) * 0.6875))`
    (11px on coarse).
- **m5. inputs-rich: disabled past dates are struck through.** Twenty-seven strikethroughs in one month is noisy and
  heavy for "thin".
  - *Where:* `?open=date` at 390.
  - *Evidence:* [date sheet](shots/inputs-rich-phone-open-date.jpg).
  - *Fix:* use `color: var(--warp-color-text-faint)` with no `line-through`. Keep the struck style only for
    "unavailable" (booked) dates in a scheduling context, where the distinction carries meaning.
- **m6. Flows: hero index cards vertically centre their content,** so titles in the same row sit 6–8px apart
  (01 vs 02, 05 vs 06).
  - *Where:* `specimens/flows.html` hero index cards.
  - *Evidence:* [1280](shots/flows-d1280-balanced-light.jpg).
  - *Fix:* `align-content: start` on the card, and the meta line on `margin-block-start: auto`.
- **m7. Flows uses `data-form="signin"` and `data-form="otp"` on `<form>`.** `data-form` is warp's form-factor input
  (`phone | tablet | desktop`), and `warp.css` re-declares sys tokens on `[data-form]`. It works today only because
  the unknown value inherits.
  - *Fix:* rename to `data-flow-step` and reserve `data-form` in the spec's attribute list.
- **m8. Data hero: the copy is vertically centred against a taller chart,** leaving a 170px hole above "data." at
  1440.
  - *Evidence:* [quiet/dark](shots/data-d1440-quiet-dark.jpg).
  - *Fix:* `align-items: start` on the hero grid, with a `padding-block-start` equal to the chart title's line box.
- **m9. Foundations: the vivid stop card's rows sit 5–8px higher than the quiet and balanced cards,** because the
  serif title is shorter. "Space Grotesk · Instrument / Serif" also wraps.
  - *Evidence:* [vivid/dark](shots/foundations-d1440-vivid-dark.jpg).
  - *Fix:* set the card title row to a fixed `block-size` (`1lh` of the title role at its largest stop), and allow
    `white-space: nowrap` on the value column with `text-overflow: ellipsis`.
- **m10. Layout: phone top-bar `kbd` "⌘K" is clipped** (25px of content in a 12px box, `#g-bar kbd`). It is also
  meaningless on touch.
  - *Fix:* `@media (pointer: coarse) { [data-part="command"] kbd { display: none } }`.
- **m11. viewport-fit is inconsistent.** `inputs`, `inputs-rich`, `flows`, `foundations` and `data` omit
  `viewport-fit=cover`, although `layout.html` tells users to ship it and the tokens rely on `env(safe-area-inset-*)`.
  The sticky action bar in `inputs-rich` (line 159) therefore never gets its safe-area padding on iPhone.
  - *Fix:* use the same `<meta name="viewport">` as `app.html` in all nine.
- **m12. Data: the live chart's "limit 75" label sits on its own dashed line.**
  - *Fix:* add `dy: -6` and a `paint-order: stroke` halo in `--warp-color-surface`.
- **m13. Marketing, vivid: "trust ." shows a visible gap before the period.** The gradient-text `span` ends before
  the period and the serif sidebearing adds space.
  - *Fix:* move the period inside the span, or add `margin-inline-start: -0.04em` to the following text.

---

## Notes by axis

**Phone.** No page overflows sideways. Fields, selects and the date sheet are well judged on a real coarse pointer:
44px, 16px text, and a sheet with grabber, Today/Clear and Done. The dialog, which becomes a sheet with a sticky
footer, is the reference every other overlay should copy. The failures are mostly specimen scaffolding (B2, M9) and
staged decoration (B1, M3). A few components hard-code a size and skip `hit-min` (M7).

**Tablet.** Portrait 834 is the weakest form factor in staged heroes: app and components collide there first.
Everything else holds up. Landscape 1194 is effectively desktop and fine apart from layout's header.

**Desktop.** Strong rhythm, hairlines and whitespace. Pages feel "thin" in the brief's sense. The exceptions are
layout's header (M5) and app's two-column section heads (m1).

**Quiet.** It is genuinely B2B. Slate neutrals, 8/12px radius, Inter throughout and sentence-case eyebrows sit
comfortably next to Linear or Vercel ([inputs](shots/inputs-d1440-quiet-light.jpg),
[data/dark](shots/data-d1440-quiet-dark.jpg)). This is the stop I'd trust a bank with.

**Balanced.** It almost fits a generic site. The two things that brand it too hard are the mint field fill (M1) and
the faux italics (M2). Fix those and it becomes the neutral default `00 §3` promises.

**Vivid.** It succeeds on marketing and the data hero: editorial serif, warm paper, square corners, a restrained
gradient mesh. Not garish. In app and component specimens, though, vivid's voice is one note: mono caps plus square
boxes reads "industrial terminal" every time ([components vivid/dark phone](shots/components-phone-vivid-dark.jpg)).
A fashion or portfolio site would want vivid without mono-caps buttons. Consider letting button caps and the eyebrow
caps decouple, so `vivid` + `data-flair` can choose editorial or technical. Recording this as a direction note, not
a defect.

**Motion.**
- **Tasteful.** The sweep in, out and onward is the brand, and it is executed well. Label float and hover cause no
  layout shift.
- **Respectful of reduced motion.** Mostly at token level (`--warp-motion-scale` resolves to 0 everywhere except
  marketing). It leaks through hard-coded or `!important` paths (B3, B4, M6).
- **Jank.** Data's dial switch (M10).

**Cohesion.** The components themselves feel like one system across all nine pages. The pages around them don't
(M9).

---

## Top 10 fixes that most raise quality

1. **Fix the app hero weave** so it sits behind the copy, or hide it below 1000px (B1).
2. **Make the specimen bar one partial,** with one row on phone, a sheet for the controls and one label vocabulary
   (B2 + M9).
3. **Stop overriding the OS reduced-motion setting** in marketing (B3).
4. **Exclude infinite animations** from the 120ms reduced-motion rule (B4), and give every idle loop a reduce/pause
   path (M6).
5. **Balanced field fill becomes `surface-raised`;** keep accent-soft only on active (M1).
6. **Kill the synthesised italics:** non-vivid `em` becomes upright accent colour, plus `font-synthesis-style: none`
   (M2).
7. **Close the coarse-target gaps:** toggle-group, sm icon buttons, `.link`, composer, tracker, table rows,
   swatches (M7).
8. **Unstack the components hero below 920px,** and fix the bottom sheet's focus and sticky footer (M3, M4).
9. **Stop layout's header nav wrapping:** `nowrap` plus a second row or an overflow menu (M5).
10. **Keep vivid KPIs on tabular figures,** with sans or mono deltas and one sparkline colour (M8).
