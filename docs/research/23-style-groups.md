# 23 — Style groups: named, grouped styles instead of class storms (design)

Research date: 2026-10-29. Status: **design; step 1 (the spike) done, results in §6**. Builds on [03](03-design-language.md) (tokens, intent
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
  A `g={orderCard(...)}` prop reads shorter but needs compiler support on every element. **Answered in §6.3:
  spread.**
- **Groups in `.css` files too?** Some people will want to write groups as CSS (`@group order-card { … }`),
  compiled the same way. That could be the input format that maps most directly to the future native `@mixin`.
- **Cross-file accents:** should an accent be allowed at all, or should every variation be an axis value? Start
  allowed with D022, and tighten if the eval shows agents overuse them.

## 6. Spike results

Step 1 of §4, run 2026-10-29. Code: `weft/style` (`packages/weft/src/style.ts`, `src/style/vocab.ts`,
`src/style/css.ts`), the compiler's `crates/weft-compiler/src/style.rs`, and the `weft:style` part of `vite.mjs`.
The measurements are in `spikes/style-groups/` (`run.mjs`, `results.json`, sample output in `out/`).

### 6.1 What was built

- **`group(name, { base, axes, parts, states, compounds, defaults })`**, fully typed. Every key is an intent from a
  closed table, and every value is one of that intent's token names. `pad: '13px'`, `padding: …`, `tone: 'danger'`, a
  default that isn't a value of its axis, a compound on a missing part, `card({ status: 'lost' })` and `card.footer`
  are all type errors (`test/style-types.tsx`, 10 negative cases). `css: { … }` is the escape. A part may be called
  `name`, which shadows `Function.name`.
- **Token table: warp's names.** `vocab.ts` maps research 03's intent keys (`surface`, `pad`, `gap`, `radius`, `tone`,
  `emphasis`, `text`, `ink`, `layout`, `align`, `justify`, `ring`, …) to `--warp-*` variables from
  `docs/design/warp/tokens/warp.css`. A test checks that every variable it names is defined there. Tones set warp's
  own channels (`--_solid`, `--_soft`, `--_text`, …), so a group tone and a warp component tone read alike. Using
  warp's names means a page with warp loaded needs no second theme.
- **Static evaluation at build.** The compiler evaluates each `group()` call as literal data. A value that isn't a
  literal is W060, which names it and its path: `` `px` at g.axes.size.big.pad isn't a literal ``. The Vite plugin
  resolves every intent against the table, and a bad token is a build error naming the group, its file and line, and
  the valid values. The codes are placeholders until the D-codes in step 2.
- **Call sites lower to plain attributes** before the back end runs, so they get its existing template and binding
  paths:

  | Authored | Compiled (DOM) |
  |---|---|
  | `<li {...productRow({ stock: left <= 0 ? 'out' : left <= 3 ? 'low' : 'in' })}>` | `data-g="product-row"` in the template, then `_$attr(el, "data-stock", v)` in one `bind` |
  | `<span {...productRow.price}>` | `data-g="product-row" data-part="price"`, static |
  | `<button {...action()}>` | `data-g="action" data-emphasis="solid"` (the default), static |
  | `{...tabButton({ pressed: tab === 'cart' })}` | `aria-pressed={tab === 'cart' ? "true" : "false"}` |

  Unknown axes, values, states and parts at a call site are W061 errors. A site whose argument isn't an object
  literal stays a runtime spread of `group()`'s return value and is reported as dynamic. The call is marked
  `/* @__PURE__ */`, so a definition whose sites were all lowered drops out of the bundle: the groups shop's JS is
  5.32 KB gz against 5.39 KB for the class version.
- **CSS only for what sites can produce.** Literals emit their value. A conditional whose leaves are all literals
  emits those leaves. Anything else emits the whole axis. Parts, states and compounds are emitted only when they can
  be reached, and a group with no call site emits nothing. Output is `@layer app.groups`, one `@scope (group) to
  (nested group)` block per group with `:where()` selectors and a `/* name · file:line */` comment in dev (sample
  below). Tone channels that nothing reads are dropped. SSR writes the same attributes.

```css
  /* product-row · spikes/style-groups/shop-groups/src/components/ProductRow.tsx:7 */
  @scope ([data-g="product-row"]:not([data-part])) to ([data-g]:not([data-part])) {
    :where(:scope) { display: flex; flex-wrap: wrap; align-items: center; gap: var(--warp-space-related); … }
    :where([data-part="note"]) { … border-radius: var(--warp-radius-round); background-color: var(--_soft); color: var(--_text); }
    :where(:scope[data-stock="out"]) { color: var(--warp-color-text-subtle); }
    :where(:scope[data-stock="low"] [data-part="note"]) { --_soft: var(--warp-color-caution-soft); --_text: var(--warp-color-caution-text); }
  }
```

Not built, as planned: the matrix file, the CLI, D020–D025, Tailwind input, accents (§2.2 level 3), `inherit` axes
beyond typing, and per-module CSS splitting (§2.5 step 7). The spike serves one `virtual:weft/groups.css`, which each
defining module imports.

### 6.2 The shop, three ways

The v3 reference shop ships no CSS at all, so "today's shop CSS" had to be written first. `shop-css/` is the same
design as BEM classes plus one hand-written stylesheet on the same warp tokens, written the way a careful person
would: rules shared across components with selector lists (`.product-row, .cart-line { … }`). `shop-groups/` is that
design as 10 groups (33 call sites). Both are copies; the reference is untouched. Atomic output comes from the same
definitions and call sites: one class per declaration and condition, as StyleX and Panda emit.

In a real browser (Chromium, warp.css loaded), the two builds compute the same value for 28 properties on every
element, in the catalogue, after adding items and in the cart. The one difference is the pressed tab. There the hand
CSS is the broken one: weft's client writes `aria-pressed=""` for `true`, so `.tab[aria-pressed="true"]` never
matches (see 6.5).

**CSS bytes** (lightningcss-minified; the gz and br columns compress the minified CSS):

| | min | gz | br | br vs hand |
|---|---|---|---|---|
| Hand CSS (`shop-css` build) | 4,342 | 923 | **762** | — |
| **Groups, default: `@scope`, `:where`** (`shop-groups` build) | 7,038 | 1,092 | **914** | **+19.9%** |
| Groups, flat selectors, no `@scope` | 7,218 | 1,088 | 917 | +20.3% |
| Groups, no `:where` | 6,742 | 1,061 | 903 | +18.5% |
| Groups, identical blocks shared across groups | 6,282 | 1,129 | 958 | +25.7% |
| Groups, parts carry only `data-part`, no `:where` | 6,402 | 1,051 | 886 | +16.3% |
| Atomic | 4,078 | 1,027 | 845 | +10.9% |

Call-site pruning removed nothing here. Every axis in the shop is reactive over all of its values, so "all values"
gives the same bytes: 906 B from the emitter, 914 B after Vite's own pass. (Unit tests show a literal emitting one
rule.) The groups build costs 7,038 B minified against
the hand CSS's 4,342 B (+62%), but the gap is mostly repetition, which brotli absorbs. The groups CSS has 163
declarations against the hand CSS's 115. The 48 extra are (a) blocks the hand author shares across components (row
layout, lists, name parts, notes: about 30), (b) tone channels plus the `var(--_x)` reads of them (13 set, 7 reads),
and (c) `font-weight` for the body role, which the hand author leaves to the default (5). Selectors make up the rest:
`[data-g="product-row"]…` against `.product-row__price`. Sharing blocks across groups (row 5) shrinks the minified
bytes but grows the brotli bytes, so it's off by default. Per-group channel pruning is on.

**Styling tokens per styled element** (54 elements across the catalogue and cart views):

| | catalogue: mean / max | cart: mean / max |
|---|---|---|
| Hand CSS: classes | 1.09 / 2 | 1.24 / 2 |
| Groups: attributes (`data-g`, `data-part`, axis, state) | 1.73 / 2 | 1.86 / 2 |
| Atomic: classes | 8.64 / 23 | 9.67 / 24 |

A groups element carries a name and at most one variation, such as `data-g="product-row" data-stock="low"` or
`data-g="product-row" data-part="note"`. Atomic is the class storm research 23 set out to avoid: up to 24 classes on
one button.

**DOM work per interaction** (`touches()`, in the eval's weft framework):

| Interaction | Hand CSS | Groups | Attribute writes (groups) |
|---|---|---|---|
| Price push in the catalogue | 1 (text) | 1 (text) | none |
| Add one, stock in → low | 2 | 3 | `data-stock` ×1 |
| Price push in the cart, trend same → up | 3 | 4 | `data-trend` ×1 |
| Tab switch | 4 | 4 | `aria-pressed` ×2 |

Each axis change is exactly one attribute write, with no class string rebuilt and no re-render. The one extra
mutation against the class version is that write. The hand version styles "low" from the note element alone and never
marks the row, while the group axis names the row's state on the row.

**Tests.** Both shops pass the hidden suite, **23/23**. `packages/weft/test/style.test.tsx` (14 tests) covers the
lowering, the diagnostics, the emitter and the round trip. SSR of the groups shop writes `data-stock="low"`,
`data-trend="up"` and `aria-pressed="true"`. Hydration then claims everything with **0 misses and 0 DOM writes**, and
the next axis change is one write. The full weft suite (201 tests) and the compiler's Rust tests still pass.

### 6.3 Spread or a `g=` prop (§5)

| | `<li {...productRow({ stock })}>` | `<li g={productRow({ stock })}>` |
|---|---|---|
| Compiler | Done (style.rs lowers the spread) | The same lowering, keyed on an attribute name `g` that would then be reserved on every element and component |
| Without the compiler (tests in plain TS, other JSX runtimes, a dynamic argument) | Works: `group()` returns the attributes | Needs a `g` handler in the runtime's attribute setter, and in every other runtime |
| Types | Ordinary JSX spread | `g?: GroupAttrs` added to every intrinsic element, and a clash with any component prop called `g` |
| Two groups on one element | Possible, and the last `data-g` wins silently (step 2 should flag it) | Ruled out by syntax |
| Length | 3 characters longer | Shorter |
| Agents | Standard JSX they already write | weft-only vocabulary to learn |

**Decision: spread.** It's already compiled, it works uncompiled, and it needs nothing new in the runtime, the types
or the agent's vocabulary. The one thing the prop gives, at most one group per element, should be a diagnostic in
step 2 ("two group roots on one element").

### 6.4 Go/no-go

| Pass bar (§4) | Result | |
|---|---|---|
| CSS ≤ today's shop CSS + 10% | 914 B br against 762 B: **+19.9%** (best variant +16.3%) | **missed** |
| One attribute mutation per axis change | `data-stock` ×1, `data-trend` ×1 | met |
| 0 hydration writes | 0 writes, 0 misses | met |

**Recommendation: go to step 2, with the CSS bar restated and two cheap wins taken.** The markup, reactivity and
hydration bars pass cleanly. The CSS bar is missed by about 150 B br on a baseline a human tuned by hand for exactly
this design, and the cost has known parts, each with a fix to measure at step 2:

1. **Tone channel folding.** When a group sets a tone and reads its channels on the same element, emit the token
   directly (`background-color: var(--warp-color-caution-soft)`) and keep a channel only when a group with no tone
   of its own reads it. This targets the 20 channel declarations and reads.
2. **Parts carrying only `data-part`** (row 6: −1.6 to −2.2 points). This trades away warp's `data-scope`/`data-part`
   symmetry and leans on `@scope` alone, so decide it together with warp's contract, not here.
3. **Measure at app scale.** The shop has 10 groups and about 4 KB of CSS, so per-group fixed costs (scope preludes,
   attribute selectors) dominate. Re-measure on warp's specimens or the v4 eval app before treating +20% as the cost
   of groups. Atomic is only 11% under semantic here, well inside §2.5's "semantic unless it costs > 20%" rule, so
   no atomic mode.

If +10% is a hard requirement, the honest answer is no-go for semantic output at this scale. Even atomic misses it
(+10.9%).

### 6.5 Found along the way

- **weft writes boolean `true` as an empty attribute** (`aria-pressed=""` on the client; a bare `aria-pressed` from
  SSR). `aria-pressed=""` isn't valid ARIA, and `[aria-pressed="true"]` never matches it. Groups sidestep this by
  lowering ARIA states to `"true"`/`"false"` strings on both sides. The general fix (serialize `aria-*` booleans) is
  for the runtime and the SSR back end, not this spike.
- **`@scope` needs `:not([data-part])` in its prelude and its bound** while parts carry `data-g`, or a part becomes its
  own scope root and stops its own group's rules.
- **`:where()` costs 1.7%.** Inside `@layer app.groups`, unlayered user CSS wins whatever its specificity, so
  `:where()` only settles fights within the layer. It stays, since it's cheap.

## Sources

- Panda CSS, recipes and slot recipes: https://panda-css.com/docs/concepts/recipes · https://panda-css.com/docs/concepts/slot-recipes · compound variants and `smartCompoundVariants`: https://v2.panda-css.com/docs/recipes/compound-variants
- StyleX at scale (Meta, 2025-11-11): https://engineering.fb.com/2025/11/11/web/stylex-a-styling-library-for-css-at-scale/
- Tailwind v4 functions and directives (`@theme`, `@utility`, `@apply`, `@custom-variant`): https://tailwindcss.com/docs/functions-and-directives
- tailwind-variants (slots, compound slots): https://www.tailwind-variants.org/docs
- UnoCSS features (shortcuts, attributify, variant groups): https://github.com/Akryum/unocss
- CSS custom functions and mixins (MDN): https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_custom_functions_and_mixins · Chrome intent to ship `@function`: https://groups.google.com/a/chromium.org/g/blink-dev/c/bvi4D7eD7wI · `if()` (Chrome 137): https://developer.chrome.com/blog/if-article
- `@scope` in all engines: https://frontendmasters.com/blog/how-to-scope-css-now-that-its-baseline/
- Agents and Tailwind (secondary): https://daisyui.com/pages/tailwind-agent/ · https://dev.to/vola-trebla/your-ai-agent-hallucinates-tailwind-classes-heres-the-fix-mk2 · https://www.stork.ai/blog/the-ai-guardrail-for-tailwind-css
