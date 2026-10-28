# 03 — Styling interop and an agent-driven design language for weft

Status: research notes, written 2026-10-28. Sources are linked inline and collected at the end.
Where a claim comes from only a secondary source (blog, mirror, aggregator), it is marked *(secondary)*.

---

## TL;DR

- **Agents fail at styling the same way every time.** They pick the most common look (Inter, purple gradients, default
  shadcn), reach for arbitrary values (`w-[437px]`, raw hex), drift on spacing, and miss semantic accessibility.
  Published studies of LLM-generated UIs find a lot of accessibility violations. Asking for accessibility in the prompt
  does not reliably help, and one study found it made output worse. Fixing from scanner feedback cuts violations by
  about half but adds new ones.
- **The products that work best constrain the agent and don't just prompt it.** v0's Design Systems 2.0 says that if a
  component, prop or token can't be verified from the sources, v0 shouldn't use it. shadcn ships a registry, an MCP
  server, `shadcn docs` and agent skills (CLI v4, March 2026). Anthropic's frontend-design skill pushes the model off
  its defaults. The common pattern is a **closed vocabulary, machine-readable context, and a verifier**.
- **The standards are now stable enough to build on.** DTCG Format Module **2025.10** became a stable Final CG Report
  on 2025-10-28, alongside a **Resolver Module** for themes and modes. Style Dictionary v5 uses it as its base format,
  and v5.3 added DTCG structured color with OKLCH. Tailwind v4's `@theme` is CSS-first and emits every token as a CSS
  variable. Cascade layers, `@property`, OKLCH, `light-dark()` and container size queries are all Baseline. Container
  *style* queries reportedly became Baseline in May 2026 *(secondary)*.
- **Headless layer: bind Zag.js.** It is the only mature headless library designed to be framework-agnostic, and it
  documents how to write an adapter for a new framework. Base UI (1.0 in Dec 2025, the shadcn default since July 2026)
  and Radix are React-only, so use them as API and behavior references, not as dependencies.
- **Proposal: "weft/ds".** Every value an agent touches is either a semantic name or an intent prop. Concretely:
  - about 8 layout primitives and about 6 intent props, all closed enums;
  - a Zod-validated theme *seed* that expands into a full DTCG token set;
  - compiled output: plain CSS custom properties in `@layer`s, plus optional adapters for Tailwind, Uno, Panda, StyleX
    and vanilla-extract;
  - compiler diagnostics as JSON with `expected[]` and `fix` fields;
  - a typed, reactive token reader so canvas and WebGL use the same resolved values.

> **Constraint: weft has no React dependency.** weft is its own fine-grained reactive system. Everything recommended
> here is framework-agnostic: Zag.js machines, plain CSS custom properties, DTCG JSON, and Tailwind/Uno as optional
> CSS front-ends. React-only libraries (Radix, Base UI, shadcn/ui *components*, Radix Themes) appear only as
> **references for API, naming and behavior**. weft never imports them at runtime or build time. The TSX snippets
> below use weft's own JSX compilation, not React.

---

## 1. How agents style UI today, and where it breaks

### 1.1 Failure modes (observed and reported)

| Failure | Mechanism | Evidence |
|---|---|---|
| Generic sameness ("AI slop") | *Distributional convergence*: the model picks the high-probability center of its training data. Unprompted, it will "almost always" use Inter, purple gradients on white, and minimal motion. Steered away from that, it settles on a new default such as Space Grotesk. | Anthropic, *Improving frontend design through Skills* (2025-11-12) |
| Arbitrary values and token bypass | Tailwind's `[...]` syntax lets an agent write `p-[13px]` or `bg-[#7c3aed]`, which skips the theme scale. Nothing at the type level stops it. `eslint-plugin-tailwindcss` has `no-arbitrary-value`, but it is **off by default**. `no-unnecessary-arbitrary-value` (in the recommended config) only flags values that have a preset equivalent. Biome has `noTailwindArbitraryValue`. | eslint-plugin-tailwindcss docs; Biome docs |
| Spacing and rhythm drift | Each component picks its own `gap-3`, `gap-4` or `space-y-5`. Class soup has no notion of a *relationship* between spacing values ("related items are closer than unrelated sections"). | Practitioner consensus. No controlled study found. |
| Accessibility misses | **CHI EA '26** (Calò, Gurita, De Russis): 300 UIs from 3 commercial models, 541 *semantic* violations across 6 fault types. Per-model rates were Claude 0.3/UI, Gemini 1.5/UI, GPT 1.8/UI *(secondary summary, not checked against the paper)*. **W4A 2025** (Gurita and Vatavu): 80 UIs, comparing accessibility-agnostic and accessibility-oriented prompts. It cites earlier work finding 84% of ChatGPT-generated sites had violations (text resizing, contrast, semantic relationships). **MOBILESoft 2025**: 540 issues in LLM-generated Android UIs. Prompts that **explicitly asked for accessibility often produced more errors**. **SBC WebMedia**: iterative fixes driven by scanner feedback cut violations by more than 50% but introduced new ones. | links in Sources §1 |
| Dark mode | Agents hardcode light colors (`bg-white text-gray-900`), add `dark:` variants inconsistently, and forget borders, shadows, focus rings and charts. A semantic-role token system (`surface`, `on-surface`) avoids the problem by construction. Raw palette utilities invite it. | Practitioner consensus. This is why shadcn and v0 standardise on CSS-variable roles. |
| Customised components drift back to defaults | v0's docs warn that v0 is trained on default shadcn/ui implementations, so customized components may produce unexpected output. The model's prior pulls it back toward the canonical source. | v0 legacy design-systems docs |

**Takeaway for weft:** a prompt alone ("be accessible", "use our tokens") is weak and sometimes harmful. What works is
(a) **not giving the agent the dangerous degrees of freedom**, and (b) a **deterministic checker** whose output the
agent can act on, with each fix scoped so it doesn't add new violations.

### 1.2 How the tools constrain agents

**v0 (Vercel)**
- The legacy path was "registry-based design systems". A shadcn registry JSON is passed as context ("Open in v0"), and
  colors are overridden in `tokens.css` *with the shadcn variable names kept unchanged*.
- **Design Systems 2.0** (current docs) imports the DS package, its source repo, *a real consumer app*, Storybook or
  docs, and Figma. It builds a starter app for a human to approve, then saves the result as a **skill**: a small
  adapter that says which components, props and tokens are safe to use. Key rule: if a component, prop or token
  "cannot be verified from the sources, v0 should not use it."
- Lessons: ground the agent in real source plus one correct usage example, use an allow-list rather than prose, and
  start from a pre-wired starter so providers, fonts and globals are never regenerated.

**shadcn/ui**
- Registry and CLI 3.0 (Aug 2025): namespaced registries (`@acme/button`), auth headers, a rewritten registry engine,
  and an **MCP server** for any registry (`shadcn mcp init --client claude`).
- **CLI v4 (March 2026)**, "built for developers and their coding agents":
  - `shadcn/skills` (`pnpm dlx skills add shadcn/ui`);
  - `shadcn docs <component>`, which returns API, examples and usage inline for the agent;
  - `--dry-run`, `--diff` and `--view`;
  - `--preset`, which packs colors, theme, icons, fonts and radius into a short shareable code.
- Mid-2026: GitHub Registries (any public repo becomes a registry) and `registry validate` *(secondary)*.
- **Base UI became the default primitive layer for new projects on 2026-07-03.** Radix is still supported (`-b radix`)
  *(secondary changelog summary)*.
- Lessons: a **content-addressable component registry plus a docs command plus a skill** is the de facto agent
  interface, and weft should expose the same three surfaces.
- The shadcn registry *item schema* is framework-neutral JSON (files, dependencies, cssVars), so weft can reuse that
  schema for its **own weft-native items**. The shadcn components themselves are React (Radix or Base UI) and are not
  consumable by weft. They are design references, and agents porting one should use its markup and class structure,
  not its code.

**Claude (artifacts and Claude Code)**
- Anthropic's frontend-design skill is about 400 tokens and covers typography, color via CSS variables, motion,
  backgrounds and an anti-pattern list. It is loaded on demand.
- Its advice:
  - give guidance "at the right altitude", neither hex codes nor vague direction;
  - name the defaults to avoid;
  - remind the model to vary its choices;
  - put an organization's design system in custom Skills.
- The article reports **no quantitative eval**, only side-by-side comparisons.

**Lovable and Bolt**
- I found no official 2025–26 documentation of a token or design-system constraint feature for either.
- Third-party sites publish reverse-engineered `DESIGN.md` token sets for both *(secondary)*. Both are known to generate
  React + Tailwind + shadcn by default.

**DESIGN.md convention**
- Introduced by Google Stitch and reportedly open-sourced by Google Labs in April 2026 *(secondary)*.
- A root Markdown file with YAML front-matter for tokens and a prose rationale. It's an emerging convention, not a
  standard.
- weft should *generate* one from its tokens, never hand-author it, so it can't drift.

### 1.3 Evals

- No public benchmark measures **design-system adherence** for agents. The accessibility studies above are the closest.
- weft should ship its own small eval (§4.8). The metrics are: lint violations per screen, axe violations, off-token
  values, contrast failures, and a pairwise "consistency" judge across screens.

---

## 2. Token and CSS platform standards (status late 2026)

### 2.1 W3C DTCG

- **Format Module 2025.10** is a **Final Community Group Report**, published 2025-10-28 and labelled "considered
  stable". It is *not* on the W3C Standards Track. Media type `application/design-tokens+json`, file extension
  `.tokens` or `.tokens.json`.
- **Token shape**: `$value` is required. `$type`, `$description`, `$extensions` (reverse-domain keys) and `$deprecated`
  are optional. `$type` is inherited from the parent group.
- **Types**:
  - base: `color`, `dimension`, `fontFamily`, `fontWeight`, `duration`, `cubicBezier`, `number`;
  - composite: `strokeStyle`, `border`, `transition`, `shadow`, `gradient`, `typography`.
  - Tools **must not infer** a type from the value.
- **References**: `{group.token}` aliases resolve to the referenced token's `$value`. Use `$ref` (an RFC 6901 JSON
  Pointer) for property-level references, e.g. one channel of a color.
- **Groups**: `$extends` deep-merges another group, local values win, and cycles are invalid. `$root` gives a group a
  base value.
- **Color**: an object with `colorSpace`, `components` and optional `alpha` and `hex`, e.g. `oklch`. Defined in a
  separate Color module.
- **Dimension**: `{ "value": 16, "unit": "px" | "rem" }`. The unit is required even when the value is 0.
- **Resolver Module 2025.10** (same date) covers themes and modes:
  - **sets** are ordered token sources, where later entries override earlier ones;
  - **modifiers** are sets with a `contexts` map (e.g. `theme: { light, dark }`) and should have at least 2 contexts;
  - a modifier can't reference another modifier.
  - The `version` string is inconsistent between the draft and the final report (`"2025.10"` vs `"2025-11-01"`). Test
    against whatever Style Dictionary and Terrazzo accept.
- Figma reportedly ships native variable import and export based on the spec *(secondary)*.

**Implication:** weft's canonical token file should be **DTCG 2025.10 plus one resolver file**. Then Figma, Style
Dictionary, Terrazzo and Tokens Studio can all read and write it without a weft-specific format.

### 2.2 Style Dictionary v4 → v5

- v4: ESM, async hooks, and early DTCG support (e.g. the 4.3 TS declarations format).
- **v5 adopts DTCG 2025.10 as its base format** *(secondary, Zeroheight)*.
- **v5.3** added DTCG structured-color support and `color/oklch`, `color/oklab`, `color/p3` and `color/lch` transforms.
- v5.5 added `emitEmptyFiles`.
- I couldn't retrieve the official v5.0.0 breaking-change list. Check the GitHub releases before depending on it.

**Implication:** weft should **not** require Style Dictionary at build time, because a tiny resolver of our own is
smaller and faster. It should emit DTCG files that Style Dictionary v5 can consume, so teams can generate iOS, Android
and Flutter outputs with it.

### 2.3 Tailwind v4 `@theme`

- `@theme { --color-mint-500: oklch(...) }` creates both the utilities and a `:root` CSS variable.
- Namespaces: `--color-*`, `--font-*`, `--text-*`, `--font-weight-*`, `--tracking-*`, `--leading-*`, `--breakpoint-*`,
  `--container-*`, `--spacing` (base, default `0.25rem`), `--radius-*`, `--shadow-*`, `--inset-shadow-*`,
  `--drop-shadow-*`, `--blur-*`, `--perspective-*`, `--aspect-*`, `--ease-*`, `--animate-*`.
- `--color-*: initial` removes a whole namespace, and `--*: initial` removes all defaults. **This matters for agents**:
  a weft-strict Tailwind theme can delete the raw palette, so `bg-purple-500` stops existing and only `bg-accent`,
  `bg-surface` and so on compile.
- `@theme inline { --color-accent: var(--weft-accent); }` makes the generated utility emit `var(--weft-accent)`
  directly. This is the bridge that lets Tailwind utilities track weft's runtime theme, light/dark mode and scoped
  surfaces.
- `@theme static` always emits the variables, even when unused (since 4.0.5).
- Versions: v4.1 (`@source inline`), v4.2 (new neutral palettes, logical block utilities, a webpack plugin), and 4.3.x
  is current (June 2026).

### 2.4 CSS platform features to rely on

| Feature | Status | weft use |
|---|---|---|
| Cascade layers `@layer` | Baseline since 2022 | Emit `@layer weft.reset, weft.tokens, weft.base, weft.primitives, weft.components, weft.utilities;`. Users' unlayered CSS and Tailwind's `utilities` layer always win, so we never fight specificity with the host styling system. |
| `@property` | Baseline (newly available) | Register `<color>` and `<length>` tokens so they animate and are type-checked, e.g. `--weft-accent` as a typed color for theme transitions. Keep the registered set small, because `inherits:false` semantics can surprise people. |
| Container **size** queries | Baseline 2023 | Switcher, Sidebar and Grid primitives respond to their container, not the viewport, which suits components agents drop anywhere. |
| Container **style** queries `@container style(--x: y)` | Reportedly Baseline since 2026-05-19, when Firefox 151 shipped it *(secondary)* | Let density, tone and emphasis context cascade (`style(--weft-density: compact)`) without JS. Until that's verified, use a `data-*` attribute fallback. |
| OKLCH, `color-mix()`, relative color syntax | OKLCH in all modern browsers since 2023 | Generate palettes perceptually. Derive hover, active and subtle states with `oklch(from var(--accent) calc(l - .05) c h)`. |
| `light-dark()` | Baseline May 2024 | Each color role is one declaration, `--weft-surface: light-dark(oklch(.99 0 0), oklch(.18 .01 260));`. Requires `color-scheme: light dark`. Scoped `color-scheme: dark` on a subtree gives correct "dark island" cards. Use `@supports` for old Safari. |

### 2.5 How the other styling systems take tokens (for interop)

| System | Token entry point | weft adapter output |
|---|---|---|
| Plain CSS and CSS Modules | `var(--weft-*)` | Nothing extra. `weft.css` is enough. |
| Tailwind v4 | `@theme inline` | `weft/tailwind.css`, with an optional strict mode that `initial`s the raw palette |
| UnoCSS (`preset-wind4`, Tailwind 4–like theme keys) | preset `theme` object | `weftPreset()` mapping theme keys to `var(--weft-*)` |
| Panda CSS | `theme.tokens` / `semanticTokens` | `weftPandaPreset` with semantic tokens referencing CSS vars |
| StyleX | `stylex.defineVars` / `createTheme` | Generated `tokens.stylex.ts`, with `defineVars` values set to `var(--weft-*)` so the cascade stays in charge |
| vanilla-extract | `createGlobalThemeContract` | Generated contract mapped to the same var names |
| shadcn-style theming contract (CSS only) | the `--background`, `--foreground`, `--primary` … variable contract | `weft/shadcn-compat.css`, which aliases shadcn's variable names to weft roles. Existing shadcn *themes* (e.g. from tweakcn or `--preset`) and CSS copied from shadcn markup then work in weft. No React components are involved. |

**Design rule:** every adapter references the **same CSS custom properties**. None of them copies values. One source of
truth means runtime theming, scoped themes and dark mode work in every system at once.

---

## 3. Layout systems and headless primitives

### 3.1 Semantic layout primitives

- **Every Layout** (Pickering and Bell): Stack, Box, Center, Cluster, Sidebar, Switcher, Cover, Grid, Frame, Reel,
  Imposter and Icon. They are composable and intrinsically responsive "without `@media` breakpoints". Each takes only a
  few props (`space`, `threshold`, `sideWidth`, `contentMin`).
- These are ideal for agents:
  - the props are *relationships* ("the sidebar is 20rem; switch when content is under 50%"), not pixel layouts;
  - there are few ways to misuse them;
  - responsive behavior is built in, so the agent doesn't write breakpoint soup.
- **Radix Themes** shows the intent-prop pattern: `<Flex gap="3">`, `<Button variant="soft" color="crimson"
  size="2">`, and `<Theme accentColor grayColor radius scaling appearance>` as a scoped provider. Props come from a
  numeric scale (1–9) instead of raw values, and color comes from a fixed palette.
- The weakness of a numeric scale: `gap="3"` versus `gap="4"` is still an arbitrary choice an agent will vary.

### 3.2 Headless and behavioral libraries: which can bind to a new framework?

| Library | Framework coupling | Bindable to weft? | Notes |
|---|---|---|---|
| **Zag.js** (Chakra team) | Framework-agnostic state machines. Official adapters for React, Solid, Vue, Svelte and **vanilla**. | **Yes, best option** | Documented *framework adapter guide*. Implement `useMachine` (bind the machine to your reactive state while keeping transition and effect order), `Bindable<T>` (controlled and uncontrolled), `Refs`, `track`, `createNormalizer` (prop normalization), and a prop-spread directive that also *removes* stale props. The guide says to start from the adapter closest to your reactivity model, which for fine-grained signals is **Solid**. |
| **Ark UI** | Zag plus per-framework component wrappers (React, Solid, Vue, Svelte 5). v5 (Mar 2025) was 1.5–4× faster. | Indirectly | Use it as the reference for component anatomy (parts and slots). weft-ark would be our own Zag binding. |
| **Base UI** (MUI) | React-only. 1.0 on 2025-12-11 (`@base-ui/react`), v1.9 in Oct 2026 *(secondary)*, shadcn's default since Jul 2026 | No (behavior reference only) | Good API decisions: `render` prop instead of `asChild`, separate `Positioner` and `Popup` parts. |
| **Radix Primitives** | React-only. Maintained by WorkOS. Original maintainers left *(secondary)*. | No | Still the mental model most LLMs know. Aligning part names (`Root`, `Trigger`, `Content`) with Radix and Base UI cuts agent errors. |
| **Kobalte, Corvu** | Solid-only | No (but Solid's reactivity is closest to weft's, so worth reading for patterns) | I couldn't confirm Kobalte's 2026 activity. Corvu is active. |
| **Bits UI, Melt UI** | Svelte-only (Bits UI 2.x on Svelte 5) | No | |
| **Open Props** | CSS-only token library (custom props, OKLCH scales) | Yes, as a palette source | No v2 status found. Treat it as inspiration for naming and scales. |
| **Native platform** | `<dialog>`, `popover` attribute, `inert`, `:focus-visible`, anchor positioning | Yes | Prefer native elements first. Use Zag for combobox, menu, select, date picker, tree and similar widgets. Check anchor positioning's Baseline status before relying on it without a fallback. |

**Recommendation:**
- `@weft/zag`: one adapter of about 200 lines plus a `spread` directive in the compiler. It unlocks about 40 accessible
  machines (combobox, menu, dialog, tabs, slider, date picker, tree view, toast…).
- Name component parts the way Radix and Base UI do (`Dialog.Root`, `Dialog.Trigger`, `Dialog.Content`). LLM priors
  then work *for* us instead of against us.

---

## 4. Proposal: `weft/ds`, an agent-driven design language

Goals: a **small closed vocabulary**, **no raw values in the happy path**, a **single source of truth (CSS vars)**,
**machine-readable diagnostics**, and **coexistence** with whatever styling system the user already has.

### 4.1 Design principles

1. **Name intent, not values.** Agents choose `tone="danger"` and `gap="related"`, never `#e11d48` or `12px`.
2. **Context flows down.** `density`, `tone` and the color scheme are inherited through the tree, via CSS custom props
   and style queries. Agents rarely have to repeat them, and children can't contradict a parent's surface contrast.
3. **Relationships over scales.** Spacing is semantic (`tight | related | group | section | page`), so the agent
   doesn't pick between `3` and `4`.
4. **Seed, don't specify.** Themes are generated from about 6 seed values. Agents (and humans) edit the seed. The
   contrast-safe expansion is computed for them.
5. **Escape hatches are explicit and visible to the linter.** `class` and `style` always pass through, for
   Tailwind/Uno coexistence. Raw values inside weft props are a compile error.
6. **Behavior is borrowed** (Zag and native HTML). **Style is ours.**

### 4.2 Vocabulary: about 8 layout primitives, about 10 components, about 6 intent props

**Layout primitives.** Every Layout semantics, implemented with container queries:

| Primitive | Purpose | Props (all enums or tokens) |
|---|---|---|
| `Stack` | vertical flow | `gap`, `align`, `split?` (push the last child to the end) |
| `Row` | horizontal wrap (Cluster) | `gap`, `align`, `justify`, `wrap` |
| `Split` | sidebar + main (Sidebar) | `side: start\|end`, `sideWidth: narrow\|medium\|wide`, `gap` |
| `Switch` | row → column at threshold (Switcher) | `threshold: narrow\|medium\|wide`, `gap`, `limit` |
| `Grid` | auto-fit grid | `min: narrow\|medium\|wide`, `gap` |
| `Center` | max-width + centring | `width: prose\|content\|wide\|full`, `gutter` |
| `Surface` | a box that *establishes context* (bg, fg, border, elevation, tone, scheme, density) | `tone`, `level: base\|raised\|overlay\|sunken`, `pad`, `radius?`, `scheme?: light\|dark\|inherit`, `density?` |
| `Frame` | aspect-ratio media | `ratio: square\|video\|portrait\|wide` |

**Components** (styled; behavior from Zag or native HTML):
`Text`, `Heading`, `Button`, `IconButton`, `Field` (label + control + hint + error), `Input`, `Select`, `Checkbox`,
`Switch(toggle)`, `Dialog`, `Menu`, `Tabs`, `Toast`, `Badge`, `Avatar`, `Icon`, `Divider`. Anything else is built
from these, or comes from a registry.

**Intent props** (the whole closed vocabulary):

| Prop | Values | Applies to |
|---|---|---|
| `tone` | `neutral \| accent \| positive \| caution \| critical \| info` | Surface, Button, Badge, Text, Field state |
| `emphasis` | `ghost \| subtle \| soft \| solid` (plus `outline`) | Button, Badge, Surface |
| `size` | `sm \| md \| lg` | controls, Icon, Avatar |
| `density` | `compact \| regular \| comfortable` (inherited) | Surface / root. Scales spacing and control heights. |
| `gap` / `pad` | `none \| tight \| related \| group \| section \| page` | layout primitives and Surface |
| `role` (Text) | `display \| title \| heading \| body \| label \| caption \| code` | Text / Heading |

Agents never pick a color, font size, line height, shadow or radius directly. Those are derived from
`tone` × `emphasis` × `level` × `density` × theme seed.

```tsx
<Surface level="raised" pad="group">
  <Stack gap="related">
    <Heading role="title">Delete project?</Heading>
    <Text tone="neutral" emphasis="subtle">This removes 14 deployments.</Text>
    <Row gap="tight" justify="end">
      <Button emphasis="ghost">Cancel</Button>
      <Button tone="critical" emphasis="solid">Delete</Button>
    </Row>
  </Stack>
</Surface>
```

The same markup is correct in light mode, dark mode, a dark island, `compact` density, or a rebranded theme, with no
edits.

### 4.3 Token architecture (three tiers, DTCG-compatible)

```
seed (≈6 values, Zod) ──expand──▶ ref tokens (palettes, scales) ──map──▶ sys tokens (semantic roles) ──▶ CSS vars
                                                                   └──▶ optional component tokens (escape layer)
```

- **seed**: what humans and agents edit.
- **ref**: generated palettes. OKLCH ramps for neutral, accent and the 4 status hues, plus type, space, radius and
  motion scales. Never referenced by app code.
- **sys**: the only tokens components and adapters reference:
  `color.{surface,surface-raised,surface-overlay,surface-sunken,on-surface,on-surface-subtle,border,border-strong,focus-ring}`,
  `color.{tone}.{solid,on-solid,soft,on-soft,subtle,border}`, `space.{tight..page}`, `control.height.{sm,md,lg}`,
  `radius.{control,surface,pill}`, `text.{role}.{size,leading,weight,tracking}`, `elevation.{level}`,
  `motion.{fast,base,slow,ease}`.

**Zod seed schema** (sketch):

```ts
import { z } from "zod";

const Oklch = z.string().regex(/^oklch\(/).describe("CSS oklch() color");
export const ThemeSeed = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]*$/),
  accent: Oklch,                                   // brand hue/chroma
  neutral: z.object({ hue: z.number().min(0).max(360), chroma: z.number().min(0).max(0.04) }).default({ hue: 260, chroma: 0.01 }),
  status: z.object({ positive: Oklch, caution: Oklch, critical: Oklch, info: Oklch }).partial().default({}),
  radius: z.enum(["sharp", "soft", "round"]).default("soft"),
  density: z.enum(["compact", "regular", "comfortable"]).default("regular"),
  type: z.object({
    sans: z.string(), mono: z.string().optional(), display: z.string().optional(),
    scale: z.enum(["tight", "regular", "expressive"]).default("regular"),
  }),
  contrast: z.enum(["AA", "AAA"]).default("AA"),   // expansion must satisfy this, else build error
  schemes: z.array(z.enum(["light", "dark"])).min(1).default(["light", "dark"]),
}).strict();                                        // unknown keys = error (agents hallucinate keys)
```

- **Expansion** is a pure function `seed → DTCG tokens`. It uses OKLCH lightness ramps and computes each `on-*` color
  by searching lightness until WCAG 2.x contrast ≥ 4.5:1 (or APCA Lc as an `$extensions` hint).
- If the target can't be met (e.g. a mid-lightness yellow accent with white text), the build fails with a diagnostic
  that suggests a nearest passing seed.
- **Output**: `weft.tokens.json` (DTCG 2025.10) plus `weft.resolver.json` (a modifier `scheme: {light, dark}` and
  optionally `density`).
- **Round trip**: DTCG in → Zod-validated `sys` schema. Teams that already have Figma variables can skip the seed and
  supply the `sys` tier directly. It's validated against the same schema, and every required role must be present.

### 4.4 Compilation targets

The weft compiler, or `weft tokens build`, emits these files:

1. **`weft.css`** (always):
   ```css
   @layer weft.reset, weft.tokens, weft.base, weft.primitives, weft.components;
   @layer weft.tokens {
     :root { color-scheme: light dark;
       --weft-surface: light-dark(oklch(.99 .003 260), oklch(.17 .01 260));
       --weft-on-surface: light-dark(oklch(.21 .01 260), oklch(.95 .005 260));
       --weft-accent-solid: light-dark(oklch(.55 .2 275), oklch(.68 .17 275));
       --weft-space-related: calc(.75rem * var(--weft-density-k, 1));
       /* … */ }
     [data-density="compact"]     { --weft-density-k: .75; }
     [data-density="comfortable"] { --weft-density-k: 1.25; }
   }
   @property --weft-accent-solid { syntax: "<color>"; inherits: true; initial-value: oklch(.55 .2 275); }
   ```
   - Primitives compile to **static class names** (`.w-stack[data-gap=related]` or hashed atoms) in
     `@layer weft.primitives`. With known enums, every variant is enumerable at build time, so there's zero runtime
     CSS-in-JS.
   - Tone and emphasis resolve through local custom props. For example, `[data-tone=critical]` sets
     `--_tone-solid: var(--weft-critical-solid)` and Button only reads `--_tone-*`. Adding a tone means one CSS rule,
     not N×M classes.
2. **`weft/tailwind.css`** (opt-in):
   `@theme inline { --color-surface: var(--weft-surface); --color-accent: var(--weft-accent-solid); --spacing-related: var(--weft-space-related); --radius-control: var(--weft-radius-control); … }`
   - Utilities like `bg-surface`, `gap-related` and `rounded-control` then exist, and they all track runtime theme,
     scheme and density.
   - Strict variant: add `--color-*: initial; --spacing-*: initial` *before* the weft mappings, so the raw palette and
     numeric spacing don't compile. Tailwind becomes a typed front-end to weft's tokens.
3. **Uno, Panda, StyleX and vanilla-extract adapters** (opt-in, generated). See §2.5. All of them reference the
   variables and never copy values.
4. **`weft/shadcn-compat.css`**: maps `--background`, `--foreground`, `--primary`, `--primary-foreground`, `--muted`,
   `--border`, `--ring`, `--radius` and the rest to weft roles. shadcn themes, and markup or classes ported from shadcn
   examples, then restyle correctly. It's CSS only, with no React.
5. **`tokens.ts`**: a typed constant tree (`tokens.sys.color.accent.solid` → `"var(--weft-accent-solid)"`) plus the
   seed's resolved numeric values per scheme, for canvas (§4.6) and for agents' autocompletion.
6. **`DESIGN.md` / `llms.txt` / skill**: generated from the schema and resolved tokens. It contains the vocabulary
   table, the do and don't rules, and one canonical example per primitive. It's regenerated on every build so it
   never drifts.

### 4.5 Validation and machine-readable diagnostics

Validation runs in three layers, and all of them share one diagnostic format:

| Layer | Where | Catches |
|---|---|---|
| Types | TS props are string-literal unions | unknown tone or gap values, wrong part nesting (`Dialog.Content` outside `Dialog.Root`, via typed slot context) |
| Compiler and lint (`weft check`) | AST and static class extraction | raw colors or lengths in `style` on weft elements, Tailwind arbitrary values that *resolve* to an existing token (`p-[12px]` → `p-related`), raw palette utilities in strict mode, more than one `tone="accent" emphasis="solid"` per `Surface` (the "one primary action" budget), `IconButton` with no `label`, `Field` with no label, heading level skips, interactive-inside-interactive, `outline:none` without a `:focus-visible` replacement, click handlers on non-interactive elements, `img` with no `alt` |
| Render and audit (`weft check --render`) | headless browser, axe-core plus our own checks | computed contrast in *both* schemes, target size (≥ 24×24 CSS px, WCAG 2.2), focus order, reflow at 320px, forced-colors mode |

**Diagnostic shape** (also returned by an MCP tool `weft.check`):

```json
{
  "code": "WEFT-T004",
  "rule": "no-raw-color",
  "severity": "error",
  "file": "src/routes/billing.weft.tsx",
  "span": { "start": [42, 18], "end": [42, 39] },
  "message": "Raw color 'bg-[#7c3aed]' bypasses theme tokens.",
  "found": "bg-[#7c3aed]",
  "expected": ["bg-accent", "bg-accent-soft", "<Surface tone=\"accent\">"],
  "fix": { "kind": "replace", "text": "bg-accent" },
  "docs": "https://weft.dev/ds/rules/no-raw-color"
}
```

Design notes:
- **`expected` is always a finite list** drawn from the closed vocabulary. Agents repair far more reliably from a menu
  than from prose.
- **`fix` is supplied only when it is semantics-preserving**, e.g. nearest-token snapping with ΔE_ok < 0.02 for color,
  or an exact match for length. When it isn't, there's no auto-fix and the agent has to choose. This addresses the
  "scanner-driven fixes introduce new violations" finding.
- Codes are stable and grouped: `T` tokens, `L` layout, `A` accessibility, `C` composition. A `--json` stream and a
  SARIF output serve CI.
- **Suppressions**: `// weft-allow WEFT-T004: brand gradient from marketing` takes a required reason. The reason is
  counted and surfaced, so a human can see how much an agent escaped the system.

### 4.6 Canvas and WebGL read the same tokens

Problem: canvas 2D and WebGL can't use `var(--x)`, and WebGL needs linear-sRGB (or P3) floats, not OKLCH strings.

```ts
import { tokens } from "weft/ds";
const t = tokens(el);             // reactive signal; re-resolves on scheme/theme/density change
t.color("accent.solid")           // → "oklch(0.55 0.2 275)" (CSS string, for canvas 2D fillStyle)
t.rgba("accent.solid")            // → Float32Array [r,g,b,a] linear sRGB (WebGL/WebGPU uniforms)
t.space("related")                // → 12 (CSS px, density-applied)
t.motion("base")                  // → { ms: 180, ease: [0.2,0,0,1] }
```

- **Resolution**: read `getComputedStyle(el).getPropertyValue("--weft-…")` *at the element*, so scoped surfaces and dark
  islands are respected. Normalize through a tiny OKLCH→linear-sRGB converter (about 1 kB). Don't parse
  `light-dark()`: computed values already resolve it once `color-scheme` applies.
- **Reactivity**: one shared `MutationObserver` on `[data-theme],[data-density],[style*=color-scheme]` ancestors plus
  `matchMedia('(prefers-color-scheme: dark)')`. This feeds a weft signal, so a WebGL uniform update is just an effect
  on `t.rgba(...)`.
- **SSR, workers and offscreen canvas**: `tokens.ts` carries pre-resolved numeric values per scheme and density, so
  code with no DOM uses the static table.
- **Charts**: ship `sys.color.data.{1..8}` (a categorical OKLCH set with equal lightness and contrast checked against
  `surface` in both schemes) and `data.sequential` and `data.diverging` ramps. Agents get a chart palette that isn't a
  copy of the brand accent.

### 4.7 What the agent sees (context budget)

- **Skill / `llms.txt`** (about 1.5k tokens): the vocabulary table (§4.2), the rules, 4 canonical examples, and the
  rule that "you may not invent tone, gap or role values; run `weft check --json` after each edit".
- **MCP tools**:
  - `weft.vocab()` returns the enums from the Zod schemas, generated rather than hand-written;
  - `weft.tokens({scheme})`;
  - `weft.check({files})`;
  - `weft.preview({file, scheme, width})`, which returns a screenshot so the agent can verify visually;
  - `weft.registry.search/add` (shadcn-registry-compatible item schema).
- **Starter app** with tokens, providers and fonts wired, so agents never regenerate globals. This is the lesson from
  v0's Design Systems 2.0.
- **Anti-default nudge**: the seed generator asks for (or randomizes) accent, type and radius at project creation, so
  "Inter + purple" is never the silent default. This is the lesson from Anthropic's distributional-convergence finding.

### 4.8 Eval to validate the design

- 50 prompts covering dashboards, forms, marketing, settings and data-dense tables. Run each through agent + weft/ds
  and through agent + raw Tailwind/shadcn as a baseline.
- Metrics:
  - `weft check` errors per screen;
  - axe violations in light and dark mode;
  - percentage of declared values that are tokens;
  - contrast failures;
  - distinct spacing and color values per app (lower means more consistent);
  - repair loop length (iterations until the check is clean);
  - an LLM-judge pairwise consistency score across 3 screens of the same app.
- Pass bar: lower accessibility and off-token counts than the baseline, with no loss in judged visual quality.

### 4.9 Explicitly out of scope (keep it minimal)

- No runtime CSS-in-JS.
- No variant-authoring DSL for users (component tokens are the escape layer).
- No icon set (bring your own; `Icon` only sizes and colors).
- No animation system beyond motion tokens plus `prefers-reduced-motion` handling in the base layer.
- No Figma plugin. DTCG import and export cover it.

---

## 5. Open questions

1. Verify that container style queries are Baseline (Firefox 151) before making them the primary context mechanism.
   Until then, `data-*` attributes are the fallback.
2. DTCG resolver `version` string mismatch (`2025.10` vs `2025-11-01`): test with Style Dictionary v5 and Terrazzo.
3. Contrast metric: WCAG 2.x ratio (normative today) as the gate, APCA as advisory metadata. Revisit if WCAG 3 lands.
4. Should `gap` names be semantic (`related`, `group`) or t-shirt sizes? Semantic names are proposed. Run the eval
   (§4.8) to confirm that agents use them more consistently.
5. Zag adapter: test the prop-spread directive against Zag's own test checklist (focus, blur, input, change, dblclick,
   SVG `viewBox` casing).

---

## Sources

### §1 Agents and UI
- Anthropic, *Improving frontend design through Skills* (2025-11-12): https://claude.com/resources/articles/improving-frontend-design-through-skills
- v0 Design Systems 2.0 docs: https://v0.app/docs/design-systems-2
- v0 Design systems (legacy registry) docs: https://v0.app/docs/design-systems , https://v0.app/docs/design-systems-legacy
- shadcn "Open in v0": https://ui.shadcn.com/docs/registry/open-in-v0
- Vercel shadcn registry starter: https://vercel.com/templates/next.js/shadcn-ui-registry-starter
- shadcn MCP server: https://ui.shadcn.com/docs/mcp
- shadcn CLI 3.0 + MCP changelog (Aug 2025): https://ui.shadcn.com/docs/changelog/2025-08-cli-3-mcp
- shadcn CLI v4 changelog (Mar 2026): https://ui.shadcn.com/docs/changelog/2026-03-cli-v4
- shadcn GitHub registries (secondary): https://noqta.tn/en/news/shadcn-github-registries-code-sharing-2026
- shadcn Radix → Base UI default switch (secondary): https://blog.openreplay.com/shadcn-ui-radix-base-ui-switch/
- LogRocket CLI 3.0 overview: https://blog.logrocket.com/shadcn-cli-3-0-update-overview/
- DESIGN.md convention (secondary): https://betterstack.com/community/guides/ai/design-md-ai/ , https://ossinsight.io/blog/design-md-protocol-2026
- Bolt.new / Lovable reverse-engineered token sets (secondary): https://www.shadcn.io/design/bolt-new , https://open-design.ai/plugins/design-system-lovable/
- CHI EA '26 semantic accessibility gap (review summary): https://a11y-paradise.onrender.com/reviews/69e8d16a891b0e7c69dbcfff
- W4A 2025 LLM-generated UI accessibility (Gurita and Vatavu), review: https://a11y-paradise.onrender.com/reviews/69ae41f68b9c91225e628c18
- MOBILESoft 2025, LLM-generated Android accessibility: https://conf.researchr.org/details/mobilesoft-2025/mobilesoft-2025-research-track/4/Breaking-Barriers-in-Mobile-Accessibility-A-Study-of-LLM-Generated-Native-Android-In
- SBC WebMedia, iterative accessibility repair: https://sol.sbc.org.br/index.php/webmedia/article/download/37974/37752
- A11y-Bench thesis (TU Wien 2025): https://repositum.tuwien.at/bitstream/20.500.12708/224566/1/Tschoner%20Maximilian%20-%202025%20-%20A11y-Bench%20Can%20Language%20Models%20Resolve..pdf
- PoliTo paper record: https://iris.polito.it/handle/11583/3008330
- eslint-plugin-tailwindcss: https://npmjs.com/eslint-plugin-tailwindcss , https://raw.githubusercontent.com/francoismassart/eslint-plugin-tailwindcss/HEAD/docs/rules/no-unnecessary-arbitrary-value.md
- Biome `noTailwindArbitraryValue`: https://biomejs.dev/linter/rules/no-tailwind-arbitrary-value/

### §2 Tokens and CSS
- DTCG Format Module 2025.10 (Final CG Report): https://www.w3.org/community/reports/design-tokens/CG-FINAL-format-20251028/
- DTCG announcement: https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/
- DTCG Resolver Module 2025.10: https://www.w3.org/community/reports/design-tokens/CG-FINAL-resolver-20251028/ , draft: https://www.designtokens.org/TR/drafts/resolver
- DTCG FAQ: https://www.designtokens.org/faq/
- Style Dictionary releases: https://github.com/amzn/style-dictionary/releases , CHANGELOG: https://github.com/amzn/style-dictionary/blob/main/CHANGELOG.md
- Zeroheight on SD v5 / DTCG (secondary): https://help.zeroheight.com/hc/en-us/articles/48049028236187
- Tailwind v4 theme variables: https://tailwindcss.com/docs/theme
- Tailwind release notes (aggregated): https://releases.sh/tailwind-css/tailwind-css.md
- MDN `light-dark()`: https://developer.mozilla.org/docs/Web/CSS/color_value/light-dark
- Una Kravets, modern CSS theming: https://una.im/modern-css-theming
- Dave Rupert, light-dark experiment: https://daverupert.com/2024/05/light-dark-experiment/
- Container style queries Baseline (secondary): https://www.thedroptimes.com/node/70900
- UnoCSS preset-wind4: https://unocss.dev/presets/wind4

### §3 Layout and headless
- Every Layout: https://every-layout.dev/layouts , Sidebar: https://every-layout.dev/layouts/sidebar/
- Zag.js framework adapters guide: https://zagjs.com/guides/framework-adapters , full docs: https://zagjs.com/llms-full.txt
- Ark UI README: https://cdn.jsdelivr.net/gh/chakra-ui/ark@main/README.md , Svelte: https://ark-ui.com/blog/introducing-ark-ui-svelte
- Base UI v1.0.0 release notes: https://app.unpkg.com/@base-ui/react@1.6.0/files/docs/react/overview/releases/v1-0-0.md
- MUI "2026 and beyond": https://mui.com/blog/2026-and-beyond/
- Radix future discussion (secondary): https://dev.to/mashuktamim/is-your-shadcn-ui-project-at-risk-a-deep-dive-into-radixs-future-45ei
- Bits UI: https://bits-ui.com/docs
- Corvu: https://corvu.dev/docs
