# Agorix 01 — Design language, tokens and theming → weft/ds

Research date: 2026-10-28. Read-only review of `@agorix/ui` 0.2.0 and four consumer apps. Counts come from scripted
greps over the working tree on that date. Contrast ratios are WCAG 2.x, computed from the literal token values
(alpha composited over the surface they sit on). Nothing was built, installed or run.

**Path prefixes used in citations:**
- `ui/` = `~/dev/agorix-discord/packages/ui/src/`
- `vel/` = `~/dev/medium/src/` (Velatis), `vend/` = `~/dev/medium/vendor/agorix-ui/`
- `rr/` = `~/dev/rr-store/apps/web/app/` (`ricochet_royale` is the same monorepo)
- `fa/` = `~/dev/fun-art/apps/web/src/`

**State of the source.**
- The checkout is on `fix/zabbix-agent2-docker-plugin-leak` (HEAD `f486721`). Its `ui/theme/tokens.css` is the
  warm, sharp **"field" identity**: Space Grotesk, 2px radius, cream ink on near-black, plus 11 uncommitted files.
  `codex/agorix-chart-system` and the Velatis vendor build carry the same identity.
- **The local `main` ref is 134 commits ahead** and carries a different identity: "redesign wave 1/2" (`df22983`,
  `44310f9`): Inter, 8/12px radius, cool slate dark, light by default, and new `--info`/`--pending` tokens.
  - It keeps the old variable *names* on purpose: `--font-space-grotesk: "Inter"` (`main:…/tokens.css:34`).
  - This differs from sibling doc 02, which treats `main` and HEAD as equal for `packages/ui`.
  - Line numbers below are from the working tree unless they are prefixed `main:`.
- `find ~/Documents/Codex -name agorix-kit.css` returned nothing within 280 s on this (loaded) machine. The
  `agorix-kit.css` cited here is fun-art's (`fa/styles/agorix-kit.css`), which is the KEEL studio app.

Sibling docs: [02 components/a11y](02-components-a11y.md), [03 server/realtime](03-server-realtime-data.md),
[04 port architecture](04-port-architecture.md). This doc decides **token model, theming API and opt-out levels**.
04 decides packaging.

---

## TL;DR

1. **Agorix has a strong *look* but a weak *token system*.**
   - What it has is one flat layer of ~45 semantic CSS variables (`--accent`, `--surface`, `--muted` …), written
     out by hand per theme class.
   - Missing: primitive layer, DTCG, spacing/type/radius/elevation/z/control-size scales, `on-*` colors that
     components actually use, `@layer`, and a contrast check.
   - Every consumer re-invented the missing scales. All 3 apps added spacing and motion tokens, 2 added a z-index
     scale, 2 a radius scale, and 2 a text-vs-fill color split. One wrote its own contrast test.
2. **The defaults fail contrast.** Measured from the shipped values:
   - The **default dark primary button is 3.56:1** (cream `--btn-ink` on `--accent`, 12px caps).
   - **`tone="gold"` fill in dark is 1.53:1.**
   - **`tone="neutral"` focus ring is 1.13:1 dark and 1.08:1 light**, i.e. invisible. Velatis uses it 49 times.
   - Re-theming makes this worse, because `defineTheme` never recomputes ink. rr-store's gold accent gives a
     **1.29:1** filled button.
3. **Styling is ~95% Tailwind arbitrary-value classes that read CSS variables.**
   - 1,587 `x-[var(--y)]` classes across 193 component files.
   - The good side: re-*coloring* by variables works everywhere.
   - The bad side: re-*shaping* (radius, type, spacing, heights) is impossible without forking. Over 140 hard-coded
     `rounded-*`, 20 distinct `text-[Npx]` sizes and 19 spacing steps ignore the theme.
   - There is no slot or part API, no `tailwind-merge`, and no unstyled mode. Kit CSS is **unlayered**, so it beats
     every consumer utility.
4. **Agent-friendliness is mixed.**
   - Good: the README decision table is the best part, and a pattern weft should copy.
   - Bad: the vocabulary is unclosed. Six different `tone` enums, `variant` means three different things, Button
     uses boolean shape flags, and names describe effects instead of intent (`FloatingBorderInput`, `borderSweep`,
     `gold` — which is green by default).
   - The README documents a Button `variant` prop that the code doesn't have.
5. **Recommendation: weft/ds keeps its own architecture and adopts Agorix as its default *skin*.**
   - Keep from weft/ds: seed → ref → sys → component, DTCG 2025.10, OKLCH, `light-dark()`, computed `on-*`, and
     `@layer`.
   - Adopt from Agorix: its surface ladder, `-soft` emphasis, motion presets, native-form styling, and the sweep
     signature, which becomes a component token, not a hard-wired effect.
   - Ship an `agorix-compat.css` alias layer and three opt-out levels: tokens → parts → headless. Details in §6.

---

## 1. Token architecture

### 1.1 What exists

| Layer | Agorix today | Evidence |
|---|---|---|
| Primitive (ramps, raw scales) | **None.** Hex literals live directly in the semantic slots, per theme class. | `ui/theme/tokens.css:28-168` |
| Semantic | ~45 vars: page and ink, 5 surfaces + hover, 3 borders, text/muted, accent ×4, gold ×5, 3 status × 3 (`x`, `x-soft`, `x-bg`), `*-foreground` ×3, shadow, scrollbar | `tokens.css:55-168`; README token table `ui/../README.md:383-433` |
| Component | Only `.btn` (`--btn-tone`, `--btn-ink`, `--btn-stroke-text`, `--btn-sweep-duration`, `--btn-frame-*`) and `--kit-field-label-bg` | `tokens.css:254-263, 322-324, 1116` |
| Scales | Fonts ×3, radius ×2 (`--card-radius`, `--surface-radius`), transitions ×3. No space, type, z, elevation or control-height scale. | `tokens.css:28-53` |

**Structural defects:**

- **`:root` defines no surface or ink.** `--text`, `--surface`, `--border` and `--page-bg` exist only under `.dark`
  and `.light` (`tokens.css:55, 112`). With no theme class on an ancestor, every component reads undefined
  variables. Consumers patch this by painting `:root, .dark` together (`vel/styles/brand.css:73-77`,
  `rr/theme-ansem.css:8-9`).
- **Theme switching is class-only** (`.dark`/`.light` via next-themes `attribute="class"`,
  `ui/theme/ThemeProvider.tsx:11`). There's no `prefers-color-scheme` fallback for no-JS, no `light-dark()`, and no
  scoped "dark island" except by nesting a class.
- **Names encode values, not roles.**
  - `--font-space-grotesk`, `--font-ibm-plex-mono` and `--font-serif-display` (`tokens.css:29-31`) are font names.
    `main` now sets `--font-space-grotesk: "Inter"` and `--font-serif-display: "Inter"` (`main:…/tokens.css:34,37`).
  - `--gold` is `#7ed957`, a green (`tokens.css:40`).
  - `--card-radius` is also used for buttons (`tokens.css:237`).
- **Redundant soft levels.** `--success-soft` and `--success-bg` differ only in alpha (0.2 vs 0.1,
  `tokens.css:98-103`). Components pick one or the other at random: Tag uses `-bg` (`ui/components/display/badges/Tag.tsx:24`);
  Badge, Alert and Callout mix them.
- **Undefined or dangling variables.**
  - `--surface-raised` is read once (`ui/components/meet/MeetingPresentationPip.tsx:73`) and never defined.
  - `--info` is used by nothing on HEAD. Alert maps `info` → accent (`ui/components/feedback/status/Alert.tsx:18`).
  - The default Skeleton style references `@keyframes shimmer` (`tokens.css:857`), which exists nowhere in source or
    in the shipped CSS (`vend/dist/styles.css`). **The default skeleton never animates.**
- **No DTCG.** There's no JSON source, and `defineTheme` (`ui/theme/defineTheme.ts`) is a hex-string compiler with no
  types beyond TS. It can't round-trip to Figma or Style Dictionary.

### 1.2 `defineTheme`: the theming compiler

- **Accent is one value for both schemes.** It emits `:root, .dark, .light { --accent… }` (`defineTheme.ts:148`), so
  a custom accent replaces both the dark and light accents with one value. The kit's own tokens need different
  values per scheme (`tokens.css:58` vs `115`).
- **Hover/strong/soft are RGB-lerp shifts** (`shift(hex, -0.15)`, `defineTheme.ts:95-103`), not perceptual steps.
  They're never contrast-checked.
- **No `on-*` output.** `--accent-foreground` and `--btn-ink` stay at their defaults whatever accent you pass.
- **The `skeletonStyle` option emits an empty rule** (`defineTheme.ts:154-158`).
- **`scale` sets root `font-size`** (`defineTheme.ts:129`). That rescales rem-based padding, but not the 127
  `text-[10px]` labels or the px button heights, so "compact" distorts proportions instead of densifying.

### 1.3 Contrast, computed

| Pair (default "field" identity) | Ratio | Needs |
|---|---|---|
| dark `--btn-ink` `#f4efe4` on `--accent` `#4a8b5c` (primary fill button) | **3.56** | 4.5 |
| dark `--btn-ink` on `--gold` `#7ed957` (`tone="gold" fill`) | **1.53** | 4.5 |
| dark `--danger` `#c0392b` as text on `--surface` | **3.33** | 4.5 |
| light `--warning` `#c9a227` as text on `--surface` (`:root` value, never overridden in `.light`) | **2.42** | 4.5 |
| light `--success` `#4a8b5c` as text on `--surface` | **4.09** | 4.5 |
| neutral button focus ring (`--surface-strong` vs page), dark / light | **1.13 / 1.08** | 3.0 |
| `--border` vs `--surface`, dark / light (input boundaries) | 1.21 / 1.28 | 3.0 for control boundaries |
| rr-store `--accent` `#ffcf3a` filled button (kit `--btn-ink` hard-coded, `tokens.css:257`) | **1.29** | 4.5 |
| Velatis dark `--accent` `#c9a227` filled button | **2.11** | 4.5 |
| `defineTheme({accent:'#FF6B35'})` (the README's own example) + light ink | **2.71** | 4.5 |

**Ink on solid fills: four strategies, none consistent.**
- `--btn-ink` is a hard-coded literal (`tokens.css:257`).
- 14 components use `text-[var(--page-bg)]` on solid fills (e.g. `ui/components/pickers/dates/DatePicker.tsx:221`).
- The meet components use `text-white` (`ui/components/meet/MeetingScheduledLobby.tsx:176`).
- **`--accent-foreground` / `--danger-foreground` / `--gold-foreground` are defined (`tokens.css:66-68`) but read by
  0 components.** rr-store sets them carefully (`rr/theme-ansem.css:17,25,30`) and they change nothing.

### 1.4 Against weft/ds (03 §4)

| Concern | weft/ds plan | Agorix | Verdict |
|---|---|---|---|
| Tiers | seed → ref → sys → component | sys only (hand-written ×2 schemes) | **weft wins**. Agorix becomes a seed plus pins. |
| Format | DTCG 2025.10 + resolver | none | weft |
| Color space | OKLCH, `light-dark()` | hex/rgba per class | weft |
| On-colors | computed until ≥4.5:1, else build error | literals, mostly unused | **weft; this is the main bug fix** |
| Surface ladder | `surface, -raised, -overlay, -sunken` | `page-bg, surface, surface-elevated, surface-strong, surface-inset, surface-hover` | **Agree in shape.** Agorix proves it needs `page` distinct from `surface`, plus `hover`. Adopt both into weft sys. |
| Tones | `neutral accent positive caution critical info` | `accent gold success warning danger neutral` (+`info`,`pending` on main) | Conflict on names and on `gold`. Use weft names; `gold` becomes an optional `highlight` tone (§6.1). |
| Emphasis | `ghost subtle soft solid outline` | Button booleans `fill/outline`; Badge `soft/solid/outline`; Card `default/elevated/outlined/ghost` | Agorix's `-soft` naming already matches weft. Adopt weft enum everywhere. |
| Spacing | relationships `tight…page` | Tailwind numerics; Stack `xs…xl` (`ui/components/layout/structure/Stack.tsx:4,20-27`), Grid pixels (`Grid.tsx:13`) | **weft**, and the consumers agree: Velatis built exactly this (`vel/styles/brand.css:42-71`). |
| Density | `--weft-density-k` multiplier | root font-size hack | weft |
| Motion | `motion.{fast,base,slow,ease}` | CSS `--transition-*` (read 5×) + JS `ease.out/inOut` + 3 springs (`ui/motion/presets.ts:40-46`) | **Adopt Agorix's JS vocabulary** (2 curves + 3 springs) as DTCG `cubicBezier` tokens plus `$extensions` springs. Drop the third CSS curve `(0.4,0,0.2,1)`, which JS never uses. |
| Layout primitives | `Stack Row Split Switch Grid Center Surface Frame` | `Stack HStack VStack Spacer Center Grid Container Section AspectRatio SplitPane Masonry` | `VStack`→`Stack`, `HStack`→`Row`, `Container`→`Center`, `AspectRatio`→`Frame`, `Card`/`Panel`→`Surface`. **Name clash:** weft's layout `Switch` collides with the toggle `Switch` (Agorix *and* weft's own component list, 03 §4.2). Rename the layout one to `Reflow`. |

---

## 2. Theming in practice: how consumers override it

| App | Mechanism | Size of the override | Where it fights the kit |
|---|---|---|---|
| **Velatis** (`vel/styles/brand.css`, `globals.css`) | Re-declares ~45 vars on `:root, .dark` and `.light` | 754 lines CSS; 171 import sites via `vel/components/ui.tsx` | see below |
| **rr-store** (`rr/theme-ansem.css`, `platform.css`) | Re-declares all kit vars on `:root, .dark` (dark only), adds full scales | 195 + 9,383 lines; 28 `!important` | parallel theme system `data-oa-theme` (113 selectors); `.btn` overridden by descendant selector (`platform.css:7244-7248`) |
| **fun-art / KEEL studio** (`fa/styles/*`) | Imports the kit into `@layer kit`, own token system, `@theme inline` bridge | 3,958 lines CSS; uses 1 kit component (`Drawer`) | the kit's bundled Tailwind `@layer theme` overrode the app's `--text-3xl` until reordered (`fa/styles/agorix-kit.css:8-26`, `fa/styles/tokens.css:90-98`) |

**Velatis, specifically:**
- **One-off escape hatch.** `--btn-stroke-hover-text` was patched into the *built* CSS (`vend/SOURCE.md:37-39`,
  `vend/dist/tokens.css:258,298`) because stroke-button hover ink was pale-on-pale in light mode. The consumer sets
  it twice (`vel/styles/brand.css:184, 206-208`). It is the canonical example of a missing `on-*` token surfacing as
  a one-off variable.
- **Forked component to restyle it.** `Segmented` is re-implemented and shadows the kit export (`vel/components/ui.tsx:11-13`).
  There's no part API to restyle the thumb.
- **Deep-selector patches.** 143 touch-target patches (128 `[&_button]:min-h-11`-style plus 15 `.tap-44`), because
  kit buttons are 26/30/34px (`tokens.css:540-569`) and Velatis uses `size="sm"`/`"xs"` 534 of 550 times.
  - Also `[&_svg]:!h-[15px]` on `ThemeToggle` (`vel/features/platform/PlatformNav.tsx:323`) and
    `hover:[&>span]:!text-[var(--text)]` (`vel/features/platform/app-shell/SidebarNav.tsx:141`).
- **Collapsed tones.** It sets `--accent` = `--gold` (`brand.css:78,83`). The kit's DistributionBar series 1 and 2
  then become the same color, because charts use status tones as a categorical palette (`ui/components/charts/proportions/DistributionBar.tsx:27-32`).
- **Re-invented scales:** spacing (`globals.css:71-79`), z-index (`brand.css:30-39`) and motion (`brand.css:15-23`).
- **Tailwind scanning pain.** The vendored kit has to be `@source`-scanned as built JS, or kit utilities silently
  vanish (`globals.css:16-44`, which documents a real Segmented regression).

**Escape-hatch census, all consumers:**
- 1 build-patched component variable (`--btn-stroke-hover-text`);
- 1 forked component (`Segmented`);
- ≥146 deep or `!`-important selectors against kit internals (143 touch-target + 3 others);
- 1 descendant `.btn` override (rr);
- 2 whole-cascade workarounds: the fun-art layer reorder, and Velatis' scan-the-dist trick;
- 3 apps re-declaring the full palette instead of passing a seed.

Most `!important` in consumers (Velatis 7, rr 28) target their own markup, not the kit. The kit doesn't force
`!important`; it forces **forks and descendant selectors**, which is worse for agents because those don't show up as
overrides.

**Hard-coded values inside the kit that theming can't reach:**
- `.btn-tone-danger` hard-codes `rgba(192,57,43,.12)` and `#9c2d21` (`tokens.css:511-512`), so a re-themed
  `--danger` leaves danger buttons with the old hover;
- `.light .btn-border-sweep { --btn-frame-track: #050505 }` (`tokens.css:327`);
- the native select chevron is `%239a978d` in both schemes (`tokens.css:981`);
- the label-background fallback is `#000`/`#fff` (`ui/components/inputs/text/FloatingBorderInput.tsx:228-229`);
- the meet family uses an **indigo `#6366f1` fallback** for `--accent` (`MeetingPresentationPip.tsx:80,107`;
  `MeetingSidebar.tsx:102,115,125`). That's exactly the "AI purple" default weft wants to avoid.
- Totals in `ui/components`: 65 hex literals, 27 `rgb(a)` literals, and at least 82 raw-palette utilities
  (`text-white/55`, `bg-rose-600` …). These are concentrated in `meet/`, `ColorPicker` and `Select`.

---

## 3. Visual quality and consistency

The identity is distinctive and coherent at a glance: mono caps labels, hairline borders, an L→R sweep on hover,
sharp corners and a warm palette. Measured, it drifts:

| Dimension | Finding | Evidence |
|---|---|---|
| **Type scale** | 20 distinct arbitrary px sizes (9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 26, 28, 32, 36, 40, 44, 56, 60, 64) plus 8 Tailwind steps. `text-[10px]` ×127, `text-[9px]` ×20, which is below a sensible floor for caps labels. No type tokens. | grep `ui/components` |
| **Tracking** | ≥15 letter-spacing values for the same "eyebrow" role: `0.1/0.12/0.14/0.18/0.2/0.22/0.24/0.28em`, `wider`, `wide` … | Badge alone uses 3 (`Badge.tsx:16-18`) |
| **Radius** | 83 uses of `rounded-[var(--surface-radius)]` vs ≥141 hard-coded (`rounded-md` 71, `rounded` 47, `-lg` 14, `-xl` 7, `[6px]`, `[5px]` …). Set radius to 12 and half the kit stays at 4–6px. Fallbacks disagree too: `var(--surface-radius, 6px)` (`tokens.css:932`) vs a default of `2px`. | grep; `tokens.css:32-33` |
| **Control heights** | Button 26/30/34px (`tokens.css:540-569`), FloatingBorderInput 40px (`h-10`), Select/NumberInput 36px (`h-9`), DatePicker and pagination 32px (`h-8`). A `md` Button next to an Input is 6px short. | component greps |
| **Spacing** | 19 distinct numeric steps. Stack has `xs…xl` (`gap-1/2/3/5/8`, skipping 4); Grid takes raw pixels. | `Stack.tsx:20-27`, `Grid.tsx:13` |
| **Elevation** | One `--surface-shadow` token (13 uses) vs `shadow-2xl` ×23, `shadow-lg` ×16, `shadow` ×13, plus 6 bespoke `shadow-[…rgba]`. Overlays don't share a level. | grep |
| **Z-index** | 10/20/30/40/50/60/9998/9999 literals and no scale. Velatis had to build one (`brand.css:30-39`). | grep |
| **Focus** | `.btn` ring = `--btn-tone` (`tokens.css:526-529`), which is invisible for neutral. Inputs signal focus by the animated sweep plus `0 0 0 1px var(--accent-soft)` (8% alpha, `tokens.css:965`). 30 `focus:outline-none`. Rings in components use 6 different colors, including `ring-white/40` and `ring-rose-300`. 3 files drop the outline with no visible ring (the `Modal.tsx:370` panel, the `CommandPalette.tsx:266` input, `SignGateFlow.styles.ts:12`); `PaginationBar.tsx:103` falls back to a 1px border-color change only. | grep |
| **States** | Disabled is 0.35 opacity on buttons (`tokens.css:535`) and 0.55 on inputs (`tokens.css:971`). Hover uses `--surface-hover` in some places and `--hover-bg` (an alias) in others. Loading has no shared state. | `tokens.css` |
| **Motion** | 9 CSS durations (`duration-[620ms]` ×13, `[520ms]`, `[420ms]` …) vs 3 tokens read 5 times. JS has ≥8 durations and 6 spring stiffnesses. `prefers-reduced-motion` is honored by Skeleton CSS (`tokens.css:895`) and 1 component; the motion provider only disables motion if the app wires it in (`ui/motion/MotionConfig.tsx:27-28`). | grep |
| **Semantics** | GaugeChart's gradient pairs map `warning → danger` and `danger → warning` (`ui/components/charts/proportions/GaugeChart.tsx:43-47`). There's no data-viz palette, so charts reuse status and brand colors. | |

**The signature effect is worth keeping, but it costs a lot.** The notched floating label has to sample ancestor
backgrounds at runtime to paint behind itself (`ui/components/inputs/text/label-background.ts:1-20`). The pure-CSS
`.kit-field` needs a manual `--kit-field-label-bg` per surface (`tokens.css:1112-1116`). In weft this should be an
opt-in `field.style: "notched" | "stacked"`, with `stacked` as the default because it needs no sampling.

---

## 4. Styling coupling

**How it's built today:** Tailwind v4 utilities with arbitrary values (`bg-[var(--surface)]`) inside TSX strings.
There's a hand-written component sheet for `.btn`, `.field-sweep`, `.kit-form` and `.kit-field`, and a
`@source inline(…)` safelist for dynamic classes (`tokens.css:22`).

Two distributions:
- `styles.css`, a full Tailwind snapshot (132 KB in `vend/dist/styles.css`);
- `tokens.css`, which requires the app to run Tailwind and scan the kit (`tokens.css:1-15`).

The coupling is **to Tailwind's compiler and to the variable names**, not to Tailwind's theme. That is why
re-coloring works and re-shaping doesn't.

| Opt-out level | What it would take per component | Effort |
|---|---|---|
| **(a) Tokens only** | Replace every literal size, radius, shadow, duration and z with sys tokens: ~140 radius, ~375 font-size, ~60 shadow and ~55 duration sites, plus control-height tokens. Make `.btn` read `on-*` tokens. | Medium. Mechanical, codemod-friendly. |
| **(b) Class / part API** | Emit `data-scope="button" data-part="root|label|icon|frame"` plus state attributes (`data-tone`, `data-emphasis`, `data-size`, `data-state`) instead of baking state into class strings. Today there are **0** `classNames` slot props, and `data-slot` appears only in `meet/` (2 values). State attributes are ad hoc (`data-phase` ×22, `data-active` ×9). Move kit CSS into `@layer` and use `:where()` so `class` always wins. Today `cn` is a plain join with no merge (`ui/lib/cn.ts:10-14`), so a consumer `rounded-lg` competes with the kit's `rounded-[var(--…)]` by stylesheet order, and the kit's unlayered `.btn-*` rules beat every Tailwind utility. | Medium–high. Touches every component's markup. |
| **(c) Full unstyled** | Behavior and a11y with no CSS: needs (b) first, then a build that drops the skin. Today the visual and behavior code are interleaved: sweep phase hooks live in Button, and framer-motion variants in overlays (36 files). | High. Sibling 04's headless-core split. |

`::part` itself doesn't apply. weft renders light DOM, so the right shape is Ark/Zag's `data-scope` + `data-part`.
Zag machines already emit exactly that (`data-scope`, `data-part`, `data-state`), which is free alignment with the
headless layer weft is binding anyway (03 §3.2).

---

## 5. Agent-friendliness

**What works:** the README "⚠️ AGENTS: READ THIS FIRST" block and its "I need to…" decision table
(`ui/../README.md:7-152`). Rules like "Do **not** write a fourth [calendar]" are the closed-vocabulary idea expressed
in prose. weft should generate this table from the catalog, not hand-write it.

**What fails:**

1. **The tone vocabulary isn't closed.**
   - Button `accent gold danger neutral` (`ui/components/buttons/core/Button.styles.ts:3`);
   - Badge `accent gold danger warning success neutral` (`Badge.tsx:4`);
   - Alert `info success warning danger` (`Alert.tsx:5`);
   - Callout adds `accent neutral` (`Callout.tsx:7`);
   - Gauge has no neutral; Meeting controls have `active share`;
   - others use `default | danger`.
   - An agent can't know `<Button tone="success">` is invalid until tsc complains.
2. **`variant` means three things:** emphasis in Badge (`soft solid outline`), surface style in Card
   (`default elevated outlined ghost`, `Card.tsx:5`) and Panel (`default inset elevated accent dashed`, `Panel.tsx:5`),
   and shape in Skeleton. Button has no `variant` at all. It uses booleans `fill`/`outline`/`borderSweep`/`idleAccent`
   (`Button.styles.ts:6-14`), so `<Button fill outline>` is a legal fifth state.
3. **The docs describe a prop that doesn't exist.** The README lists `variant` (`primary/secondary/ghost/danger/gold/outline`)
   on Button (`README.md:508`), and the code has none. This is the "unverifiable prop" failure v0 DS 2.0 warns about
   (03 §1.2).
4. **Names describe effects, not intent.** `FloatingBorderInput`, `FloatingLineInput`, `FloatingBorderCheckbox`,
   `borderSweep`, `idleAccent`, `noSweep`, `static`. An agent asked for "a text field" has to know that the house
   field is called "FloatingBorder".
5. **Near-duplicates.** ~180 PascalCase runtime exports (sibling 02 counts 206 components). Clusters:
   - Badge / Tag / Pill / Dot / ToggleChip / SignGateBadge
   - Alert / Callout / Banner / AnnouncementBar
   - Card / Panel
   - Stack / HStack / VStack / Spacer
   - Menu / OverflowMenu / ContextMenu
   - FloatingBorderInput / FloatingLineInput / KitField / FormField / InputGroup
   - Select / Combobox / MultiCombobox

**Proposed canonical set (design-side; 02 owns the full inventory):**

| Canonical | Absorbs | Distinguishing props (closed) |
|---|---|---|
| `Button` | `fill/outline/borderSweep` booleans, `ButtonGroup` stays as a layout | `tone`, `emphasis: ghost\|soft\|outline\|solid`, `size: sm\|md\|lg` |
| `Badge` | Tag, Pill (static), Dot (`<Badge dot>`), SignGateBadge | `tone`, `emphasis`, `size` |
| `Toggle` / `ToggleGroup` | ToggleChip, Pill (pressable), Segmented | `size`, `selection: single\|multiple` |
| `Callout` | Alert, Banner, AnnouncementBar (`placement="page"`) | `tone`, `emphasis`, `dismissible` |
| `Surface` | Card, Panel (+ Card/Panel Header/Body/Footer parts) | `level: base\|raised\|overlay\|sunken`, `tone`, `pad` |
| `Field` + `Input`/`Textarea`/`Select` | FloatingBorder*/FloatingLine*/KitField/FormField | `Field label hint error`, skin `field.style` |
| `Menu` | OverflowMenu (`<Menu.Trigger icon>`), ContextMenu (`trigger="context"`) | parts `Root Trigger Content Item` |
| `Select` / `Combobox` | MultiCombobox (`multiple`) | `multiple`, `searchable` is Combobox |
| Layout ×8 | per §1.4 table | `gap`, `pad`, etc. |

---

## 5b. Scorecard (1 = poor, 5 = excellent)

| Dimension | Score | Justification |
|---|---|---|
| Token architecture | **2** | A single semantic tier with sensible role names, but no primitives, no scales, no DTCG, unused `on-*` tokens, and names that encode values (`--font-space-grotesk`, green `--gold`). |
| Dark/light handling | **3** | Both schemes are hand-tuned and look good. But it's class-only, `:root` has no surface or ink, `defineTheme` collapses accents across schemes, and `--warning` is never re-tuned for light (2.42:1). |
| Contrast and a11y of tokens | **1** | The default primary button, the gold fill, the neutral focus ring and dark danger text all fail. Nothing computes or checks contrast, so every consumer re-theme can fail silently, and two did. |
| Theming ergonomics | **2** | Re-coloring by variable is easy and real. Re-shaping requires forks. `defineTheme` covers 4 knobs, and none of the 3 consumers uses it: all re-declare the whole palette by hand. |
| Visual consistency | **3** | A strong, recognizable identity, but drift in type (20 sizes), radius (≥141 bypasses), control heights (26–40px), tracking (≥15) and elevation. |
| Motion | **3** | A good preset vocabulary in JS (`ui/motion/presets.ts`) and opt-outs like `noSweep`/`static`. But CSS tokens are barely used, durations are scattered, reduced motion isn't on by default, and the default skeleton never animates. |
| Styling coupling and interop | **2** | Variables everywhere help. Tailwind-compiler coupling, unlayered CSS, no part or state API, no class merging, and a two-snapshot hazard documented in 3 places. |
| Agent-friendliness | **3** | The README decision table is excellent. The vocabulary underneath is open (6 tone enums, overloaded `variant`, boolean shapes), and the docs disagree with the code. |
| **Overall as a default skin** | **2.5** | Port the *look* and the *decision table*. Rebuild the *token system* under it. |

---

## 6. Recommendation

### 6.1 The merged token model (weft/ds tiers, Agorix values)

Keep 03 §4.3's tiers and output exactly. Changes to the **sys** tier, informed by Agorix and its consumers:

```
seed ─▶ ref (OKLCH ramps; space/type/radius/motion/z scales) ─▶ sys ─▶ component ─▶ CSS vars in @layer weft.tokens
                                                                 └─▶ agorix-compat.css (aliases only, no values)
```

| sys group | Roles (closed) | Source |
|---|---|---|
| `color.page` / `color.on-page` | page background and ink | Agorix `--page-bg`/`--page-ink`. weft lacked a page-vs-surface split. |
| `color.surface.{base,raised,overlay,sunken,hover}` | +`hover` as a sys role | Agorix `surface`, `surface-elevated`, `surface-strong`, `surface-inset`, `surface-hover` |
| `color.text.{default,subtle,faint}` | `faint` for placeholder and disabled | Agorix `--text`/`--muted`; fun-art `--text-faint` |
| `color.border.{default,strong,focus}` | `focus` ≥ 3:1 vs page, always (not tone-derived) | fixes the neutral focus ring |
| `color.{tone}.{solid,on-solid,soft,on-soft,text,border}` | tones: `neutral accent positive caution critical info` + optional `highlight` | weft tones; **`text` split from `solid`** (fun-art `--accent-text`, Velatis `--btn-stroke-hover-text`); one soft level, not two |
| `color.data.{1..8}`, `data.sequential`, `data.diverging` | categorical, contrast-checked vs surface | fixes charts borrowing status colors |
| `space.{hair,tight,related,group,section,page}` | `hair` added | Velatis' role table (`brand.css:54-61`) maps 1:1 |
| `control.height.{sm,md,lg}` | one value across Button, Input, Select, DatePicker | fixes the 26–40px spread. `md` = 36px at regular density. Coarse pointers get ≥44px via `@media (pointer:coarse)`, which removes Velatis' 143 patches. |
| `radius.{control,surface,pill}` | seed `radius: sharp\|soft\|round` | "field" identity = `sharp` (2px) |
| `text.{display,title,heading,body,label,caption,code}.{size,leading,weight,tracking,case}` | `label` carries Agorix's mono caps and one tracking value | collapses the 20 sizes and ≥15 trackings |
| `elevation.{base,raised,overlay}` + `z.{base,sticky,dock,overlay,menu,modal,toast}` | z as a sys scale | Velatis `brand.css:30-39` |
| `motion.duration.{fast,base,slow}`, `motion.ease.{out,inOut}`, `motion.spring.{default,bouncy,snappy}` | springs in `$extensions["dev.weft.spring"]` and compiled to `linear()` for CSS | Agorix `presets.ts:40-46`. Reduced motion collapses durations in the token layer (rr `theme-ansem.css:175-184`). |
| `font.{body,display,mono}` | role names only | replaces `--font-space-grotesk` and friends |

The Agorix identity then becomes a **preset seed plus component tokens**, not a CSS fork:

```ts
// weft/ds/presets/agorix.ts — the default skin
export const agorix = defineSkin({
  seed: { accent: "oklch(0.56 0.09 150)", neutral: { hue: 95, chroma: 0.01 }, highlight: "oklch(0.80 0.19 135)",
          radius: "sharp", type: { sans: "Space Grotesk", mono: "IBM Plex Mono", display: "Instrument Serif" } },
  components: {
    button: { case: "upper", font: "mono", tracking: "label", flair: "sweep" },   // flair: none | sweep | frame
    field:  { style: "stacked", flair: "sweep" },                                 // style: stacked | notched
    surface:{ flair: "sweep-on-hover" },
  },
});
```

### 6.2 Theming API

```ts
// weft.config.ts
import { defineConfig } from "weft";
import { agorix } from "weft/ds/presets";

export default defineConfig({
  ds: {
    skin: agorix,                       // agorix (default) | "plain" | "headless" | "none"  — §6.3
    theme: {                            // Zod-validated, .strict(); unknown keys are errors
      name: "velatis",
      seed: { accent: "oklch(0.72 0.13 85)", neutral: { hue: 20, chroma: 0.03 }, radius: "soft",
              type: { display: "Cormorant", scale: "expressive" }, schemes: ["dark", "light"], contrast: "AA" },
      pins: { dark: { "color.surface.base": "#1e1113" } },  // explicit overrides — still contrast-checked (D-codes)
      components: { button: { flair: "none" } },            // component tokens are the only per-component knob
    },
    adapters: ["tailwind", "agorix-compat"],                // also: "panda" | "vanilla-extract" | "stylex" | "shadcn-compat"
  },
});
```

```tsx
// Runtime: scoped theme / scheme / density are attributes, not providers. Nested islands just work.
<Surface level="raised" scheme="dark" density="compact" theme="velatis">…</Surface>
// Canvas and WebGL read the same resolved values (03 §4.6):
const t = tokens(el); t.color("accent.solid"); t.motion("spring.snappy");
```

- **`agorix-compat.css`** aliases `--accent`, `--surface`, `--text`, `--muted`, `--border`, `--gold` (→ highlight)
  and the rest to `--weft-*`. Existing Agorix-flavored CSS, and the three consumers' theme files, keep working
  during migration. It's the same move as `shadcn-compat.css`: aliases only, never values.
- **`defineTheme(ThemeConfig)` stays as an adapter.** It maps the old `{colors:{accent}}` shape onto the seed, so
  `<ThemeStyle>` callers migrate without edits.

### 6.3 The three opt-out levels (plus "none")

| Level | What changes | Markup changes? | How |
|---|---|---|---|
| **1. Re-theme** | colors, type, radius, density, motion, flair | none | `theme.seed` / `pins` / `components`, or edit `weft.tokens.json` (DTCG) directly. Every adapter reads the same vars. |
| **2. Restyle parts** | any part's CSS, in any styling system | none | Every component emits `data-scope`/`data-part` plus `data-tone`, `data-emphasis`, `data-size`, `data-state` (Zag-compatible). Skin CSS lives in `@layer weft.components` behind `:where()`, so unlayered app CSS, Tailwind `utilities`, CSS modules, Panda and vanilla-extract all win without `!important`. `class` merges onto the root; `partClass={{ label, icon }}` targets parts. Tailwind users write `data-[part=label]:…`. |
| **3. Headless** | all visual CSS | none | `skin: "headless"`: identical components, behavior, a11y and data attributes, and zero skin CSS. Bring shadcn-style CSS, a kit's CSS, or your own. Layout primitives and tokens remain. |
| **4. None** | weft/ds not installed | n/a | `create-weft --ui none` (sibling 04). `weft check` D-codes are off unless tokens exist. |

**Rule for agents:** levels 1–2 are the only way to change looks. Forking a component is diagnostic `D040`
("component shadows `weft/ds` export; use part styling"), which directly targets the Velatis `Segmented` pattern.

### 6.4 Prioritized fix list

| # | Pri | Fix | Why / evidence |
|---|---|---|---|
| 1 | P0 | Compute `on-solid` / `on-soft` / `text` per tone in the expander; make `.btn` and all 14 `text-[var(--page-bg)]` sites read them; delete `--btn-ink` | 3.56 / 1.53 / 1.29 / 2.11 fills (§1.3) |
| 2 | P0 | `color.border.focus` as a single ring token (≥3:1 vs page in both schemes); one `:focus-visible` rule in the base layer; ban `outline-none` without a replacement (D-code) | 1.13 / 1.08 neutral ring; 3 files without a ring |
| 3 | P0 | Re-tune status tones per scheme (`warning` light 2.42, `danger` dark 3.33, `success` light 4.09) | §1.3 |
| 4 | P0 | Put all skin CSS in `@layer weft.*`, with `:where()` selectors; ship one CSS artifact, not two Tailwind snapshots | `fa/styles/agorix-kit.css:8-26`, `vel/styles/globals.css:34-39`, `ui/theme/tokens.css:10-15` |
| 5 | P1 | Introduce space/type/radius/control-height/z/elevation scales; codemod the ~140 radius, ~375 px font-size, ~60 shadow and ~55 duration literals | §3 table |
| 6 | P1 | Closed `tone` and `emphasis` enums shared by all components; Button booleans → `emphasis`; `gold` → optional `highlight` | §5 items 1–2 |
| 7 | P1 | `data-scope`/`data-part`/state attributes on every component; `partClass` | §4 (b) |
| 8 | P1 | Defaults: `:root` gets a full scheme via `light-dark()` with `color-scheme: light dark`; remove the dependence on a class | `tokens.css:28-53` |
| 9 | P1 | Reduced motion on by default in the token layer; define the missing `shimmer` keyframes | `tokens.css:857`, `MotionConfig.tsx:27-28` |
| 10 | P2 | Rename to intent: `FloatingBorderInput` → `Input` (in `Field`), `borderSweep`/`noSweep`/`static` → `flair`; generate the README decision table from the catalog; fix the phantom `variant` doc | §5 items 3–4 |
| 11 | P2 | Data-viz palette tokens; fix GaugeChart's swapped warning/danger ends | `GaugeChart.tsx:43-47` |
| 12 | P2 | Remove hard-coded hex inside the skin (danger hover, chevron, frame track, the `#6366f1` fallbacks, meet's `text-white` family) | §2 hard-coded list |
| 13 | P3 | `field.style: "notched"` as opt-in only (it needs background sampling); `stacked` by default | `label-background.ts` |
| 14 | P3 | Rename weft's layout `Switch` → `Reflow` to free `Switch` for the toggle | §1.4 |

**Decision needed from the user:** which Agorix identity is "the default": HEAD's "field" look (sharp, warm,
Space Grotesk, which is what Velatis shipped) or `main`'s redesign (Inter, 12px, slate, light-first)? Under this
model both are just two seeds (`agorix` and `agorix-clean`), but only one should ship as `skin: agorix`.
