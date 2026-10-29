# 23 — Style groups: named, grouped styles instead of class storms (design)

Research date: 2026-10-29. Status: **design, nothing built**. Builds on [03](03-design-language.md) (tokens, intent
props, adapters) and warp's CSS contract (`docs/design/warp/`, PLAN §6.1). Number 22 is taken by the verify-loop
branch. Statements about other tools are from their docs as fetched today and marked **(unverified)** where a version
or detail matters.

**The task.** Give weft a styling layer where:

1. styles come in **named groups** a person can read in the markup and understand: what the thing is and which
   variation it is, not thirty utility classes;
2. a group can take **accents** (variations of the same group: tone, size, a one-off nudge) without becoming a new
   group;
3. agents get a **matrix**: one machine-readable file that lists every group, its axes, parts and resolved CSS, and
   where it's used. Agents like the side file; humans never have to open it;
4. Tailwind projects can **feed the matrix** (their theme and utilities) and use groups instead of class strings;
5. the **compiler** makes it all static: no runtime CSS-in-JS, only the combinations actually used, and reactive
   variation is one attribute write, which is the weft way.

"Class storm" here means both failure modes: a `class` attribute with 20+ utilities nobody can read, and a growing
pile of one-off CSS rules nobody can find. Agents make both: the same button comes out with different padding and
focus styles on two runs, and agents invent class names that aren't in the project's theme (§1.3).

---

## 1. What exists, and what each gets right

### 1.1 Prior art

| Tool | Grouping model | Variants ("accents") | Output | What to take | What to avoid |
|---|---|---|---|---|---|
| **Panda CSS** recipes / slot recipes | `cva`/`sva`: `base`, `variants`, `compoundVariants`, `defaultVariants`; slot recipes name the parts (`root`, `label`, `control`) | Closed per-recipe axes; compound variants style one slot when two axes match | Atomic classes, statically extracted; `smartCompoundVariants` emits only the combinations it found **(v2 docs)** | The shape (base, axes, compounds, defaults, parts), and emitting only what's used | Atomic output makes the DOM unreadable; config recipes vs atomic recipes is two systems |
| **StyleX** (Meta) | `create` objects; `defineVars` groups of variables; `createTheme` re-sets a subset of a group | Conditional styles merged at the call site, last wins | One atomic class per property/value, compiled by a Babel plugin | Typed variable groups and themes that override a subset | Babel; unreadable hashed atoms; no notion of a named component part |
| **Vanilla Extract** recipes / sprinkles | Recipes as in Panda; sprinkles = typed atomic props | Recipe variants | Static CSS per file at build | Zero runtime with TS types | Separate `.css.ts` files for everything |
| **CVA / tailwind-variants** | A function returning a class string; `tv` adds slots and compound slots | Variants map to Tailwind class strings | Whatever Tailwind generates | The authoring API people already know | The class storm just moves into a JS object, and it still needs `tailwind-merge` at runtime to resolve conflicts |
| **Tailwind v4** | `@theme` namespaces create utilities; `@utility` defines new ones (functional form via `--value`); `@apply` inlines utilities | `@custom-variant` for selectors | Utilities on demand | `@theme` as the token source, and `--*: initial` to lock the palette | Utilities are the unit, so a "card" is never named anywhere |
| **UnoCSS** | Shortcuts alias a set of utilities; attributify mode puts utilities in attributes; variant groups shorten prefixes | Dynamic shortcuts | Utilities | Shortcuts are the closest thing to a named group in utility land | Attributify and variant groups are less readable, and Uno's own guides tell agents to avoid them |
| **warp** (ours) | `[data-scope][data-part]` per component, every rule in `@layer` behind `:where()` (specificity 0) | `data-tone`, `data-emphasis`… set local channel variables (`--_solid`, `--_text`…); one rule per tone, not N×M | Plain CSS, readable, per component | The whole contract: data attributes, channels, layers, zero specificity | Hand-written, so nothing checks app code against it |

### 1.2 The platform, today

- **`@layer`**: Baseline. Lets groups sit in one layer under the user's CSS and Tailwind's utilities.
- **`@scope`**: in all three engines since Firefox 146; Baseline newly available in early 2026. `@scope (A) to (B)`
  ("donut" scope) styles a component's parts without leaking into nested components. Safari 26.0–26.3 was partial.
- **`if()`** (Chrome 137+) and **`@function`** (Chrome 141+ per a secondary source): Chromium only. Firefox and
  Safari don't have them yet.
- **`@mixin` / `@apply`** (css-mixins-1): a draft. No engine ships it. It's the eventual native form of a "group",
  so the design keeps a mapping to it, but nothing depends on it.

So the output has to be plain CSS that works now: layers, `:where()`, data attributes, custom properties, and
`@scope` where available.

### 1.3 Agents and utility classes

No peer-reviewed study was found. Practitioner reports agree on three failures:

- **Drift between runs:** two generations of the same button with different padding, colours and focus styles
  (daisyUI's write-up).
- **Invented classes:** agents write from stock Tailwind and miss the project's theme, inventing names that don't
  exist. Tools like `tailwind-context-resolver-mcp` validate class strings against the real config.
- **A linter fixes most of it:** a write-up of shadcn's linter reports off-system output dropping to zero once the
  linter ran **(secondary; methodology not seen)**.

This matches research 03's conclusion: a closed vocabulary, a machine-readable catalog and a verifier. Style groups
are that, applied to app code and not just to warp.

## 2. The design

### 2.1 A group in code

```tsx
// order-card.tsx: the group lives next to the component that uses it
import { group } from 'weft/style'

/** A summary card for one order in a list. */
export const orderCard = group('order-card', {
  base:  { surface: 'raised', pad: 'group', radius: 'surface', gap: 'related' },
  axes: {
    status:  { open: { tone: 'info' }, shipped: { tone: 'positive' }, late: { tone: 'critical' } },
    density: 'inherit',                            // the shared axis, from the nearest Surface
  },
  parts: {
    title:  { text: 'title' },
    meta:   { text: 'caption', emphasis: 'subtle' },
    action: { justify: 'end' },
  },
  states: { selected: { ring: 'accent' } },        // ARIA or data-state, never classes
  defaults: { status: 'open' },
})

export function OrderCard(props: { order: Order; selected: boolean }) {
  return (
    <article {...orderCard({ status: props.order.status, selected: props.selected })}>
      <h3 {...orderCard.title}>{props.order.name}</h3>
      <p {...orderCard.meta}>{props.order.date}</p>
      <div {...orderCard.action}><Button>Open</Button></div>
    </article>
  )
}
```

What a person reads in the markup: this is an `order-card`, in the `late` status, and this line is its `title`. What
it renders:

```html
<article data-g="order-card" data-status="late" aria-selected="true">
  <h3 data-g="order-card" data-part="title">…</h3>
```

That's warp's contract (`data-scope`/`data-part` become `data-g`/`data-part`), so app groups and warp components
read the same way in DevTools and in the CSS.

**Values are intent, not CSS.** The keys (`surface`, `pad`, `radius`, `gap`, `tone`, `emphasis`, `text`, `ring`,
`justify`…) are research 03's closed vocabulary, and the values are its token names. `pad: '13px'` is a type error.
A raw property is allowed only through an explicit `css: { … }` escape, which `weft check` counts (D023).

### 2.2 Accents: variation without a new group

Three levels, from most to least preferred:

1. **An axis value** (`status: 'late'`). Closed, typed, in the matrix. This covers most variation.
2. **A compound** (`when: { status: 'late', density: 'compact' }, part: 'meta', set: { … }`) for a combination that
   needs something neither axis gives alone, as Panda's compound variants do.
3. **A one-off accent at the call site**: `orderCard({ status: 'late', accent: { radius: 'round' } })`. Still
   token-only, still the same group, and it renders as an attribute on that element, so it stays visible. The matrix
   records every accent and where it's used. When the same accent appears three times, `weft check` suggests
   promoting it to an axis value (D022) with an autofix.

Tone works the way warp's does: a tone sets local channel variables (`--_solid`, `--_text`, `--_border`…) once, and
every group reads the channels. Adding a tone is one rule, not one per group.

### 2.3 Tailwind projects

Groups are the unit; Tailwind can be the input. Three entry points, all opt-in:

- **Theme in.** The compiler reads the project's `@theme` (Tailwind v4 CSS config), so token names in groups are
  checked against the real theme, and the matrix lists them. With research 03's strict mode (`--color-*: initial`
  before weft's mappings), raw palette values don't exist at all.
- **Utilities in.** A group's base, axis values and parts may be written as Tailwind class strings:

  ```ts
  export const orderCard = group('order-card', {
    base: 'rounded-surface p-group bg-surface-raised flex flex-col gap-related',
    axes: { status: { late: 'text-critical border-critical' } },
  })
  ```

  The compiler expands them through Tailwind's own compiler at build time into the group's CSS, so the markup still
  says `data-g="order-card"` and never carries the class list. No `tailwind-merge` at runtime: conflicts are
  resolved once, at build, and reported (D024) when two values set the same property.
- **Groups out.** For teams that stay in class strings, `weft style export tailwind` emits each group as a v4
  `@utility` (`order-card`, `order-card-late`), so `class="order-card order-card-late"` works and still comes from
  one definition.

### 2.4 The matrix: the side file for agents

`weft build`/`weft dev` writes `.weft/styles.json`, generated and never hand-edited:

```json
{
  "groups": {
    "order-card": {
      "doc": "A summary card for one order in a list.",
      "file": "src/order-card.tsx:4",
      "axes": { "status": ["open", "shipped", "late"], "density": "inherit" },
      "defaults": { "status": "open" },
      "parts": ["title", "meta", "action"],
      "states": ["selected"],
      "resolved": { "base": { "padding": "var(--weft-space-group)", "…": "…" }, "status=late": { "--_solid": "var(--weft-critical-solid)" } },
      "tokens": ["space.group", "radius.surface", "tone.info", "tone.positive", "tone.critical"],
      "used": [{ "file": "src/orders.tsx", "line": 22, "axes": { "status": "dynamic" } }],
      "accents": [{ "file": "src/home.tsx", "line": 9, "set": { "radius": "round" } }],
      "bytes": 412
    }
  },
  "tokens": { "space.group": "1.5rem", "…": "…" },
  "similar": [["order-card", "invoice-card", 0.92]]
}
```

- **What agents do with it:** before writing a new card, `weft style find card` (or the MCP tool) returns the
  groups that already fit, so the agent reuses `order-card` and doesn't write a third card. `similar` flags groups
  whose resolved CSS is nearly the same (D021).
- **`weft style explain order-card --status late`** prints the resolved CSS and where each value came from (token,
  axis, compound, accent), as `weft explain` does for compiled code.
- Humans don't need the file. The markup names the group and the variation, and the group's definition is in the
  file that uses it, with a doc comment.

### 2.5 The compiler

All of this is static, in the Rust compiler and the Vite plugin:

1. **Extract.** `group(...)` calls are evaluated at build (they're data: token names, closed axes). A group that
   isn't statically evaluable is an error that names the bad value.
2. **Resolve.** Intent keys map to declarations through the token tables; Tailwind strings expand through Tailwind's
   compiler; compounds and accents are checked against the axes.
3. **Emit only what's used.** Every axis is enumerable, but CSS is emitted only for values some call site can
   produce. A literal (`status: 'late'`) emits one rule. A reactive value typed as the axis's union emits all of its
   values. This is the same idea as Panda's `smartCompoundVariants`.
4. **Write readable CSS.** One block per group in `@layer app.groups`, behind `:where([data-g="order-card"])`
   (specificity 0, so users' CSS and Tailwind utilities always win), parts as `[data-part]`, and `@scope (…) to
   ([data-g])` for parts where supported, so a group's parts never style a nested group's. Identical declaration
   blocks are merged. Dev output keeps a `/* src/order-card.tsx:4 */` comment per block. Prod strips comments; it
   doesn't hash names, so the DOM stays readable in production too.
5. **Bind the weft way.** `orderCard({ status: order.status })` compiles to static attributes plus one `bind` per
   reactive axis. A status change is one `data-status` attribute write: no class string rebuilt, no merge, no
   re-render. `toTouchAtMost` budgets see one attribute mutation.
6. **SSR.** The server writes the same attributes. Hydration claims them with 0 writes, like any other attribute.
7. **Split.** Group CSS goes with the module that defines the group, so a route that doesn't render `order-card`
   doesn't load its CSS.

**Why not atomic output.** Atomic CSS (StyleX, Panda's default) keeps the stylesheet smallest on very large apps, but
the DOM becomes hashed atoms nobody can read, which is the opposite of the goal. Token variables already keep group
CSS small. The spike (§4) measures semantic vs atomic output on the v3 shop and warp; atomic becomes an opt-in prod
mode only if semantic output costs more than ~20% CSS on a real app.

### 2.6 Naming rules (for humans first)

- **Group:** the noun for the thing, in kebab-case, as people say it (`order-card`, `nav-bar`, `price-tag`). Not
  its look (`blue-box`) or its place (`left-thing`).
- **Axis:** an adjective-like dimension (`status`, `tone`, `size`, `density`), with values from the closed
  vocabulary where one exists (`tone: critical`, `size: sm`) and domain words where it doesn't (`status: late`).
- **Part:** the noun for the piece (`title`, `meta`, `action`, `icon`).
- **State:** an ARIA state or `data-state` (`selected`, `open`, `invalid`), never a class.
- The same rules hold in warp, so `<Button tone="critical">` and `orderCard({ status: 'late' })` read alike.

## 3. Diagnostics

| Code | Severity | Rule | Autofix |
|---|---|---|---|
| D020 | warning | An element carries more than 8 utility classes, or the same class list appears in 2+ places | Extract a group (name suggested from the component and element) |
| D021 | warning | Two groups resolve to ≥ 90% the same CSS | Merge into one group with an axis |
| D022 | info | The same accent appears 3+ times | Promote it to an axis value |
| D023 | warning | A `css: {…}` escape or a raw value in a group | Suggest the nearest token |
| D024 | error | Two values in one group set the same property (Tailwind input or compound overlap) without an explicit order | Show both and the winner |
| D025 | error | Unknown group, axis value or part (also a type error) | The closest names from the matrix |

warp's contrast gate keeps its own code (D010, in the warp branch).

## 4. Order of work

1. **Spike (one session):** `group()` types and the static evaluator; emit CSS for the v3 shop's components
   rewritten with groups; measure CSS bytes (semantic vs atomic), markup readability (classes per element before and
   after), and `toTouchAtMost` for a status change. Pass: no larger than today's shop CSS + 10%, one attribute
   mutation per axis change, 0 hydration writes.
2. **The matrix** (`.weft/styles.json`), `weft style find|explain`, MCP tools, an AGENTS.md section, D020–D025.
3. **Tailwind:** theme in, utilities in (through Tailwind's compiler), `export tailwind`.
4. **warp on groups:** warp's components are already written to this contract by hand; generating their CSS from
   group definitions is a later option, not a requirement. warp keeps the spec CSS verbatim until then.
5. **Agent eval:** add a styling ticket to the v4 eval (a new card variant, a status colour) and measure drift between
   runs, invented names and CSS growth with groups vs raw Tailwind.

## 5. Open questions

- **Spread syntax or a prop?** `{...orderCard(...)}` (above) works on any element and composes with other props.
  A `g={orderCard(...)}` prop reads shorter but needs compiler support on every element. Decide in the spike.
- **Groups in `.css` files too?** Some people will want to write groups as CSS (`@group order-card { … }`),
  compiled the same way. That could be the input format that maps most directly to the future native `@mixin`.
- **Cross-file accents:** should an accent be allowed at all, or should every variation be an axis value? Start
  allowed with D022, and tighten if the eval shows agents overuse them.

## Sources

- Panda CSS, recipes and slot recipes: https://panda-css.com/docs/concepts/recipes · https://panda-css.com/docs/concepts/slot-recipes · compound variants and `smartCompoundVariants`: https://v2.panda-css.com/docs/recipes/compound-variants
- StyleX at scale (Meta, 2025-11-11): https://engineering.fb.com/2025/11/11/web/stylex-a-styling-library-for-css-at-scale/
- Tailwind v4 functions and directives (`@theme`, `@utility`, `@apply`, `@custom-variant`): https://tailwindcss.com/docs/functions-and-directives
- tailwind-variants (slots, compound slots): https://www.tailwind-variants.org/docs
- UnoCSS features (shortcuts, attributify, variant groups): https://github.com/Akryum/unocss
- CSS custom functions and mixins (MDN): https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_custom_functions_and_mixins · Chrome intent to ship `@function`: https://groups.google.com/a/chromium.org/g/blink-dev/c/bvi4D7eD7wI · `if()` (Chrome 137): https://developer.chrome.com/blog/if-article
- `@scope` in all engines: https://frontendmasters.com/blog/how-to-scope-css-now-that-its-baseline/
- Agents and Tailwind (secondary): https://daisyui.com/pages/tailwind-agent/ · https://dev.to/vola-trebla/your-ai-agent-hallucinates-tailwind-classes-heres-the-fix-mk2 · https://www.stork.ai/blog/the-ai-guardrail-for-tailwind-css
