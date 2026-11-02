# 23 — Style groups: named, grouped styles instead of class storms (design)

Research date: 2026-10-29. Status: **design; step 1 (the spike) done and passed, results in §6; step 2 (the matrix,
`weft style`, MCP tools, AGENTS.md, D020–D025) built, §7**. Builds on [03](03-design-language.md) (tokens, intent
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
import { group } from '@weft-js/core/style'

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
   token-only, still the same group, and it renders as an attribute on that element, so it stays visible
   (`data-accent="radius:round"`, as built in step 2: one word per intent, sorted). The matrix records every accent
   and where it's used. When the same accent appears three times, `weft check` suggests
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
- As built (§7), `tokens` at the top level is `vocab` (intent → token names: the closed vocabulary, not token values),
  `resolved` is keyed by place (`base`, `status=late`, `part title`, `state selected`, `compound 0`), and each group
  also lists `escapes` (D023), `compounds`, `binding`/`exported` (how to import it) and `contextTone`.

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
| D020 | warning | An element carries more than 8 utility classes, or the same class list (4+ classes) appears in 2+ places | Extract a group (name suggested from the component and element) |
| D021 | warning | Two groups resolve to ≥ 90% the same CSS | Merge into one group with an axis |
| D022 | info | The same accent appears 3+ times | Promote it to an axis value |
| D023 | warning | A `css: {…}` escape or a raw value in a group | Suggest the nearest token |
| D024 | error | Two values in one group set the same property without an explicit order, or two groups claim one element | Show both and the winner |
| D025 | error | Unknown group, axis, axis value, state, part, intent or token (also a type error) | The closest names from the matrix |

Exactly what each code fires on, as step 2 defines them (W060, "not a literal", stays a compiler W-code: it's about
evaluating code, not about styles):

- **D020** (`weft check`, any `.tsx`/`.jsx`): a static `class`/`className` string with more than 8 classes, or the same
  class list (4+ classes, any order) in two or more places. Groups never produce a class, so this only finds class soup
  written by hand, and it names a group from the component and the element (`order-card` for `<article>` in
  `OrderCard`).
- **D021** (matrix): two groups whose resolved declarations (base, parts, every axis value, state and compound, each
  keyed by where it applies) have a Jaccard similarity of 0.9 or more. Listed in `similar`.
- **D022** (matrix): the same accent (same keys and tokens on the same group) at 3 or more call sites.
- **D023** (matrix): each `css: { … }` in a group's base, axis value, part, state or compound, with the properties it
  sets. A warning, not an error: it's the sanctioned escape, counted so it stays rare.
- **D024**: (a) two group roots spread on one element (`<li {...a()} {...b()}>`), where the second `data-g` would
  silently replace the first (the compiler); (b) two compounds on the same part that can match at once (no axis where
  their `when`s disagree) and set the same property to different values, so only definition order decides (the
  matrix); (c) an accent that sets an intent the call site's own axis values already set, so the accent and the axis
  fight for the same property (the matrix).
- **D025**: at a call site, an axis value, axis, state or part the group doesn't have (the compiler; was the spike's
  W061), with the closest names; in a definition or an accent, an intent or token that isn't in the vocabulary (the
  Vite plugin and `weft check`).

warp's contrast gate keeps its own code (D010, in the warp branch). D040 and D081 are reserved by warp's design docs;
none of these collide.

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

Step 1 of §4, run 2026-10-29, then a second pass the same day on CSS size (6.4). Code: `@weft-js/core/style`
(`packages/weft/src/style.ts`, `src/style/vocab.ts`, `src/style/css.ts`), the compiler's
`crates/weft-compiler/src/style.rs`, and the `weft:style` part of `vite.mjs`. The measurements are in
`spikes/style-groups/` (`run.mjs` for the shop, `scale.mjs` for 6.5, `results.json`, sample output in `out/`).

### 6.1 What was built

- **`group(name, { base, axes, parts, states, compounds, defaults })`**, fully typed. Every key is an intent from a
  closed table, and every value is one of that intent's token names. `pad: '13px'`, `padding: …`, `tone: 'danger'`, a
  default that isn't a value of its axis, a compound on a missing part, `card({ status: 'lost' })` and `card.footer`
  are all type errors (`test/style-types.tsx`, 10 negative cases). `css: { … }` is the escape. A part may be called
  `name`, which shadows `Function.name`.
- **Token table: warp's names.** `vocab.ts` maps research 03's intent keys (`surface`, `pad`, `gap`, `radius`, `tone`,
  `emphasis`, `text`, `ink`, `layout`, `align`, `justify`, `ring`, …) to `--warp-*` variables from
  `docs/design/warp/tokens/warp.css`. A test checks that every variable it names is defined there. Using warp's names
  means a page with warp loaded needs no second theme. Tones are written in warp's channel form (`--_solid`,
  `--_soft`, `--_text`, …) and folded to direct tokens at emit (6.4).
- **Static evaluation at build.** The compiler evaluates each `group()` call as literal data. A value that isn't a
  literal is W060, which names it and its path: `` `px` at g.axes.size.big.pad isn't a literal ``. The Vite plugin
  resolves every intent against the table, and a bad token is a build error naming the group, its file and line, and
  the valid values. The codes are placeholders until the D-codes in step 2.
- **Call sites lower to plain attributes** before the back end runs, so they get its existing template and binding
  paths:

  | Authored | Compiled (DOM) |
  |---|---|
  | `<li {...productRow({ stock: left <= 0 ? 'out' : left <= 3 ? 'low' : 'in' })}>` | `data-g="product-row"` in the template, then `_$attr(el, "data-stock", v)` in one `bind` |
  | `<span {...productRow.price}>` | `data-part="price"`, static |
  | `<button {...action()}>` | `data-g="action" data-emphasis="solid"` (the default), static |
  | `{...tabButton({ pressed: tab === 'cart' })}` | `aria-pressed={tab === 'cart' ? "true" : "false"}` |

  Unknown axes, values, states and parts at a call site are W061 errors (D025 since step 2). A site whose argument isn't an object
  literal stays a runtime spread of `group()`'s return value and is reported as dynamic. The call is marked
  `/* @__PURE__ */`, so a definition whose sites were all lowered drops out of the bundle: the groups shop's JS is
  5.29 KB gz against 5.39 KB for the class version.
- **CSS only for what sites can produce.** Literals emit their value. A conditional whose leaves are all literals
  emits those leaves. Anything else emits the whole axis. Parts, states and compounds are emitted only when they can
  be reached, and a group with no call site emits nothing. Output is `@layer app.groups`, one `@scope (group) to
  (nested group)` block per group, and a `/* name · file:line */` comment in dev. SSR writes the same attributes.
  The dev output for one group, as shipped (minified in prod):

```css
  /* product-row · spikes/style-groups/shop-groups/src/components/ProductRow.tsx:7 */
  @scope ([data-g="product-row"]) to ([data-g]) {
    :scope { display: flex; flex-wrap: wrap; align-items: center; gap: var(--warp-space-related); … }
    [data-part="price"] { font-size: var(--warp-text-label-size); …; font-variant-numeric: tabular-nums; }
    [data-part="note"] { font-size: var(--warp-text-caption-size); …; border-radius: var(--warp-radius-round); }
    :scope[data-stock="out"] { color: var(--warp-color-text-subtle); }
    :scope[data-stock="low"] [data-part="note"] { background-color: var(--warp-color-caution-soft); color: var(--warp-color-caution-text); }
    :scope[data-stock="out"] [data-part="note"] { background-color: var(--warp-color-neutral-soft); color: var(--warp-color-neutral-text); }
  }
```

Not built, as planned: the matrix file, the CLI, D020–D025, Tailwind input, accents (§2.2 level 3), `inherit` axes
beyond typing, and per-module CSS splitting (§2.5 step 7). Step 2 (§7) built the matrix, the CLI, the D-codes and
accents. The spike serves one `virtual:weft/groups.css`, which each
defining module imports.

### 6.2 The shop, three ways

The v3 reference shop ships no CSS at all, so "today's shop CSS" had to be written first. `shop-css/` is the same
design as BEM classes plus one hand-written stylesheet on the same warp tokens, written the way a careful person
would: rules shared across components with selector lists (`.product-row, .cart-line { … }`). `shop-groups/` is that
design as 10 groups (33 call sites). Both are copies; the reference is untouched. Atomic output comes from the same
definitions and call sites: one class per declaration and condition, as StyleX and Panda emit.

**CSS bytes** after the fixes in 6.4 (lightningcss-minified; gz and br compress the minified CSS):

| | min | gz | br | br vs hand |
|---|---|---|---|---|
| Hand CSS (`shop-css` build) | 4,342 | 923 | **762** | — |
| **Groups, default** (`shop-groups` build) | 5,956 | 979 | **829** | **+8.8%** |
| Groups, parts tagged with `data-g`, flat selectors | 6,476 | 1,010 | 852 | +11.8% |
| Atomic | 4,032 | 1,020 | 844 | +10.8% |

Call-site pruning removes nothing in this app: every axis is reactive over all its values, so "all values" gives the
same 829 B (unit tests show a literal emitting one rule). The groups CSS now has 149 declarations against the hand
CSS's 115 (163 before 6.4). The remaining 34 are blocks the hand author shares across components with selector lists
(row layout, lists, name parts, notes). Selectors are the rest of the minified gap: `@scope ([data-g="product-row"])`
and `[data-part="price"]` against `.product-row__price`. Rewriting the groups' own rules as BEM classes, with no
sharing, gives 808 B (`scale.mjs`), so about 21 B of the 67 B gap is the attribute selectors and preludes and about
46 B is the hand author's sharing.

**Styling tokens per styled element** (54 elements across the catalogue and cart views):

| | catalogue: mean / max | cart: mean / max |
|---|---|---|
| Hand CSS: classes | 1.09 / 2 | 1.24 / 2 |
| Groups: attributes (`data-g`, `data-part`, axis, state) | 1.30 / 2 | 1.38 / 2 (1.73 / 1.86 before parts went bare) |
| Atomic: classes | 8.42 / 23 | 9.57 / 24 |

A groups root carries a name and at most one variation (`data-g="product-row" data-stock="low"`), and a part carries
only its part name (`data-part="note"`). Atomic is the class storm research 23 set out to avoid: up to 24 classes on
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

**Same look.** In a real browser (Chromium, warp.css loaded), the two builds compute the same value for 34 properties
on every element in the catalogue, with a field focused, after adding items, and in the cart with the price trend both
down and up. This was re-run after every fix in 6.4. The one difference is the pressed tab, where the hand CSS is the
broken one: weft's client wrote `aria-pressed=""` for `true` when this was measured, so `.tab[aria-pressed="true"]`
never matched (6.7, since fixed).
`:hover` and `:focus-visible` don't fire under automation, so those two rules were compared by their declarations.

**Tests.** Both shops pass the hidden suite, **23/23**. `packages/weft/test/style.test.tsx` (14 tests) covers the
lowering, the diagnostics, the emitter (scope prelude, folding, flat tagged mode) and the round trip. SSR of the
groups shop writes `data-stock="low"`, `data-trend="up"` and `aria-pressed="true"`. Hydration then claims everything
with **0 misses and 0 DOM writes**, and the next axis change is one write. The full weft suite (201 tests) and the
compiler's Rust tests pass.

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

### 6.4 CSS size: the fixes, one at a time

The first run missed the CSS bar: 914 B br from the Vite build (906 B from the emitter), **+19.9%** against 762 B.
Each fix below was applied on top of the one before and checked against the bars before moving on (same computed
styles, 23/23, one write per axis change, 0 hydration writes). Bytes are the emitter's prod output, br:

| Fix | br | vs hand | Change |
|---|---|---|---|
| First run: tagged parts, `@scope` with `:not([data-part])`, `:where()`, tone channels | 906 | +18.9% | |
| 1. Fold static tones into direct tokens | 858 | +12.6% | −48 |
| 2. Body text leaves `font-weight` to inheritance | 849 | +11.4% | −9 |
| 3. Parts carry only `data-part` | 834 | +9.4% | −15 |
| 4. Tones are local to their group | 836 | +9.7% | +2 |
| 5. No `:where()` | **829** | **+8.8%** | −7 |
| Vite build of the final default | **829** | **+8.8%** | |

1. **Tone folding.** A group's tone set the six channels and its emphasis read them (`background-color:
   var(--_soft)`). Where the tone is static on an element, the emitter now substitutes: `background-color:
   var(--warp-color-caution-soft)`, and the channels go. Two shapes fold. One unconditional tone setter on an element
   substitutes into every read on it. Conditional setters (an axis value or compound that sets a tone) take the
   substituted reads into their own rule, and the element's unconditional reads keep only their fallback or drop.
   This removed every channel from the shop's CSS. Without it the default is 893 B (+17.2%).
2. **Body weight.** `text: 'body'` wrote `font-weight: var(--warp-text-body-weight)`, which is 400, what the hand
   author leaves to inheritance. The vocab now leaves it out, as it already did for `caption` and `code`.
3. **Bare parts.** A part is `<span data-part="price">`, no `data-g`. The group's `@scope ([data-g="x"]) to
   ([data-g])` finds it under its root, and the prelude no longer needs `:not([data-part])`. Tested with nesting in
   the browser: a group nested in itself doesn't leak rules into the inner copy, and a nested group with the same part
   names doesn't take the outer group's part rules. **The limit:** a part rendered inside a nested group's root (an
   outer group's part passed as children into another group's component) is past the scope's bound and gets no
   styles. The compiler can't see that across components. `taggedParts` (compiler and Vite option) keeps the old
   form for apps that need it, at 852 B flat. Step 2 should decide whether warp's contract (`data-scope` +
   `data-part`) adopts bare parts, and whether a runtime dev check warns on a part with no matching root.
4. **Local tones.** Folding needs to know where a channel comes from. A group now never reads a tone from a group it
   sits in: an untoned group's reads (`color: var(--_text, var(--warp-color-text))`) emit their fallback. Context
   tone (a tone that flows down the tree) stays warp's `data-tone`, which is unchanged. This cost 2 B and makes the
   folding sound, so it stays.
5. **No `:where()`.** Inside `@layer app.groups`, unlayered CSS and later layers (Tailwind's utilities) win whatever
   the specificity. Within the layer, two groups never style one element (a nested root is the scope's bound), and one
   group's rules rise in specificity in the order they should win: base, axis, compound. So `:where()` settled
   nothing, and dropping it saves 7 B.

**Also measured, not taken:**

| Option | br | vs hand | Why not |
|---|---|---|---|
| Identical blocks shared across groups (one `@scope` over their owners) | 845 | +10.9% | Smaller minified (5,470 B) but larger after brotli. Re-tested after the other fixes; it still loses |
| Shared blocks, tagged parts, flat | 845 | +10.9% | Same |
| Prod short group names, as attributes (`data-g="a"`) | 808 | +6.0% | Unreadable in devtools and in a bug report |
| Prod short group names as classes | 796 | +4.5% | Same, and a second markup contract between dev and prod |
| Prod short group and part names | 774 | +1.6% | Same |

**Short names: no.** They are the only option that reaches the bar with margin, but the point of groups is markup a
person can read (`data-g="product-row" data-stock="low"`), and prod is where people read it in bug reports and
devtools. 21 B to 55 B on a 10-group app doesn't pay for that. If size ever forces it, it should be an explicit opt-in
with a name map in the matrix, not a default.

**Group order moves brotli by ±1%.** Groups never compete for an element, so their order in the file can't change a
computed style, but it changes how well brotli matches across blocks: 825 B in file order, 834 B by name, 841 B in
reverse file order. The emitter now orders by similarity (greedy nearest neighbour on shared declarations, starting
from the first group by name), which gives 829 B whatever order the files compiled in. Before this, the Vite build
and the emitter differed by 17 B on the same rules.

### 6.5 At more groups

The shop has 10 groups, so per-group costs (one `@scope` prelude each) weigh most there. Neither bigger candidate was
cheap: the v4 eval app has no CSS to compare against, and warp's tier-1 set is hand-written to warp's own contract.
So `scale.mjs` generates N groups from the vocabulary with a fixed seed (a base, 0–3 parts from a shared pool of 10
names, 0–2 axes of 2–4 values with half of them tones, some hover states and compounds) and compares the groups CSS
with the same rules written as BEM classes (`.x`, `.x__part`, `.x--axis-value`). **Synthetic**, and with no
cross-component sharing on either side, so it measures the selector cost alone:

| Groups | BEM, br | Groups, br | Groups vs BEM |
|---|---|---|---|
| 10 | 1,091 | 1,071 | −1.8% |
| 30 | 2,367 | 2,214 | −6.5% |
| 100 | 6,063 | 5,233 | −13.7% |
| 300 | 15,528 | 12,492 | −19.6% |
| *The shop, for calibration* | *808* | *829* | *+2.6%* |

The selector cost doesn't grow with the number of groups; it shrinks. A BEM part selector repeats its block name
(`.order-card__title`), while a bare part (`[data-part="title"]`) is the same string in every group that has a title,
which brotli stores once. The synthetic names (`card-badge-12`) are longer and more varied than the shop's, which
flatters groups here, so read the table as "no growth", not as groups beating hand CSS at scale. What it can't
measure is the hand author's cross-component sharing, the ~46 B in the shop (6.2). That should be measured on a real
app in step 5's eval, with a hand-CSS version written for it.

### 6.6 Go/no-go

| Pass bar (§4) | Result | |
|---|---|---|
| CSS ≤ today's shop CSS + 10% (≤ 838 B br) | 829 B br against 762 B: **+8.8%** (first run +19.9%) | met |
| One attribute mutation per axis change | `data-stock` ×1, `data-trend` ×1 | met |
| 0 hydration writes | 0 writes, 0 misses | met |
| Same look as the hand CSS | Same computed styles for every element and state checked | met |

**Go to step 2.** All bars pass with readable output (full group and part names, a source comment per group in dev).
Things to carry into step 2:

- **The margin is thin.** 9 B under the bar, and group order alone moved the result by 16 B. The similarity order
  makes it deterministic, but a small change to one group could cross the line on this app. 6.5 says the margin
  grows with app size rather than shrinking.
- **Bare parts change the markup contract.** Decide with warp's `data-scope`/`data-part` contract, and decide what to
  do about parts slotted into another group (6.4 fix 3): a dev check, `taggedParts`, or a documented rule.
- **Local tones** mean a group never takes its tone from the group around it. Context tone is warp's `data-tone`.
  The matrix should say which groups read a context tone.
- **Sharing stays off** and short names stay out. Both are measured above if the trade changes.
- Atomic (844 B) is still larger than semantic, so §2.5's "semantic unless it costs > 20%" holds without an atomic
  mode.

### 6.7 Found along the way

- **weft wrote boolean `true` as an empty attribute** (`aria-pressed=""` on the client; a bare `aria-pressed` from
  SSR). `aria-pressed=""` isn't valid ARIA, and `[aria-pressed="true"]` never matches it, which is the hand shop's one
  computed-style difference in 6.2. The v4 eval branch (PR #17) fixed it in @weft-js/core/dom and the SSR back end: `aria-*`
  booleans are now the words. Groups still lower an ARIA state to `"true"`/`"false"`, since a state's value may be any
  truthy expression and a static one becomes plain template text.
- **With tagged parts, `@scope` needs `:not([data-part])` in its prelude and its bound**, or a part becomes its own
  scope root and stops its own group's rules. Bare parts (the default) don't have this problem.
- **brotli rewards repetition, not deduplication.** Every attempt to share blocks across groups made the minified CSS
  smaller and the compressed CSS larger. Size work on generated CSS should be judged on brotli bytes only.

## 7. Step 2: the matrix, `weft style`, MCP tools, D020–D025

Built 2026-10-29 on the spike's code. Nothing in `packages/warp` or `packages/warp-core` changed.

### 7.1 What shipped

| Piece | Where | What it does |
|---|---|---|
| The matrix | `packages/weft/src/style/matrix.ts` (`@weft-js/core/style/matrix`) | `buildMatrix(groups, uses)` → `{ version, groups, vocab, similar, diagnostics }`; `scanProject(root, files, transform)` (definitions, then each component compiled with the groups its relative imports bring in); `explainGroup(group, selection)` |
| `.weft/styles.json` | `vite.mjs` (`weft:style`) | Written after a build's project scan (errors among the project-wide codes stop the build, the rest are warnings) and in dev, debounced, whenever a compile changes it. `style.matrix: false` turns it off; off under vitest |
| | `weft check` | Also writes it when the project has groups, so an agent that never ran `weft dev` has it |
| `weft style find <query>` | `packages/cli/src/style.mjs` | Every query word must hit the group's name, doc, parts, axes, values, states or tokens (one typo allowed in a name word); best first, results under a quarter of the best score dropped. Gives how to import the group, its axes, parts, states, use count and similar groups |
| `weft style explain <target>` | same | Target: `order-card`, `order-card.title`, `order-card[status=late][selected]`, or a selector copied from devtools (`[data-g="order-card"][data-status="late"] [data-part="meta"]`, `aria-*`, `data-accent~=`). Axes as flags (`--status late`), `--states`, `--accent`, `--part`. Prints each element's declarations in cascade order with the token and the place it came from, marks overridden ones, then the CSS that selection emits (tones folded) and the sites that can produce it |
| `weft style matrix` | same | Writes the file; `--stdout` prints it |
| MCP `style_find`, `style_explain` | `packages/cli/src/mcp.mjs` | The same JSON as `--json`. The server's instructions now say to `style_find` before writing a group |
| AGENTS.md "Styling" section | `packages/cli/src/agents-md.mjs` | Only when the installed weft exports `@weft-js/core/style`'s `group`. One paragraph: find first, the shape of a group, tokens only, the codes, `weft docs style`. The style codes left the general diagnostics table and `weft style` the commands table, since the section covers both |
| `weft docs style` | `packages/cli/docs/style.md` | The rules (find first, tokens, axes, accents, one group per element, states, no class soup) and the tools |
| Accents | compiler, `style.ts`, `css.ts` | `card({ accent: { radius: 'round' } })` lowers to a static `data-accent="radius:round"`; the CSS gets `:scope[data-accent~="radius:round"]` after the group's own rules. Typed (`Accent` = intents without `css`); a non-literal accent is W060 |
| Doc comments | compiler | The `/** … */` right above a definition is `facts.groups[].doc`, for the matrix and `find` |

### 7.2 The codes, as built

Defined in §3. W061 (the spike's placeholder) is now D025, and every "unknown name" message gets the closest names
(edit distance with adjacent swaps as one edit, within a third of the word, or containing it): ``group order-card has
no part `titel` `` → ``Did you mean `title`?``. W060 stays a compiler W-code: it's about evaluating code.

| Code | Found by | Tested on |
|---|---|---|
| D020 | `weft check`, on the text of every `.tsx`/`.jsx` | 9 classes on a `<section>`; the same 4 classes in a `class` and a `className={'…'}` in another order |
| D021 | the matrix | Two identical groups under two names (similarity 1.0) |
| D022 | the matrix | `accent: { radius: 'round' }` at three sites |
| D023 | the matrix | `css: { letterSpacing }` (no intent sets it, so the fix says so) and `css: { padding: 'var(--warp-space-group)' }` (the fix names `pad: 'group'`) |
| D024 | the compiler (two roots), the matrix (compounds, accents) | `<p {...a()} {...b()}>`; compounds on `size=l` and `tone=b` setting `pad` (a third on `size=s` is correctly not flagged); an accent `tone: 'caution'` on a site whose `status=late` sets the tone |
| D025 | the compiler (sites), the matrix and the Vite plugin (tokens) | `status: 'Late'`, `selcted`, `card.titel`, `pad: 'grup'`, `accent: { radius: 'roundish' }` |

A site whose accent is D025 is left out of the CSS and the other checks, so one bad accent doesn't hide the rest
(found while testing: it first switched off D024 for the whole group).

All six are in the CLI catalog. `weft docs D025` works, and `probe()` confirms the compiler reports W060, D024 and
D025 from their catalog examples.

### 7.3 Numbers and checks

- **Tests:** weft 239 (new: `test/style-matrix.test.ts`, 9; `test/style.test.tsx` +4; 2 new type cases), CLI 101
  (new: `test/style.test.mjs`, 11), warp 74, warp-core 21, compiler (Rust) 93. All pass.
- **The spike's shop through the CLI:** `weft style find row` → `product-row` first (doc and name), then `action`
  (its doc says "row"); groups that only use `layout: row` drop under the score cut. The matrix lists 10 groups and
  one diagnostic, D023 on `cart-line`'s `qty` part (`minInlineSize`, `textAlign`: no intent sets them).
- **AGENTS.md stays under 8 KB:** it was 8,173 B before step 2, 19 B under the cap, so the section needed room.
  It's 8,175 B now with the section. What paid for it, with no loss of meaning: runs of codes as ranges
  (`T001–T009`, `P002–P004`), one "other exports are for compiled code" sentence instead of two, the style codes out
  of the general table, a shorter W017 entry, and a few redundant words. **The cap is the real constraint on
  teaching agents more in AGENTS.md**; the next addition will need `weft docs` topics, not more AGENTS.md text.

### 7.4 Open

- **`.ts` in `node_modules`.** The CLI imports `@weft-js/core/style/matrix` (TypeScript) with Node's type stripping, as
  `vite.mjs` already imports `css.ts`. That works in this repo (packages are linked, so the real path isn't under
  `node_modules`) but Node refuses to strip types under `node_modules`. A published weft needs these compiled to JS.
- **The dev matrix is what's been compiled.** In dev the Vite plugin writes only the files it has compiled so far
  (no project scan, to keep startup fast). `weft check` and `weft style` always scan the whole project.
- **Steps 3–5 unchanged:** Tailwind input, warp on groups, the agent eval. The eval should now count `style_find`
  calls and D020/D021 hits per run, since both are what the matrix exists to prevent.
- Decisions still open from 6.6: bare parts in warp's contract, and parts slotted into another group.

## Sources

- Panda CSS, recipes and slot recipes: https://panda-css.com/docs/concepts/recipes · https://panda-css.com/docs/concepts/slot-recipes · compound variants and `smartCompoundVariants`: https://v2.panda-css.com/docs/recipes/compound-variants
- StyleX at scale (Meta, 2025-11-11): https://engineering.fb.com/2025/11/11/web/stylex-a-styling-library-for-css-at-scale/
- Tailwind v4 functions and directives (`@theme`, `@utility`, `@apply`, `@custom-variant`): https://tailwindcss.com/docs/functions-and-directives
- tailwind-variants (slots, compound slots): https://www.tailwind-variants.org/docs
- UnoCSS features (shortcuts, attributify, variant groups): https://github.com/Akryum/unocss
- CSS custom functions and mixins (MDN): https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_custom_functions_and_mixins · Chrome intent to ship `@function`: https://groups.google.com/a/chromium.org/g/blink-dev/c/bvi4D7eD7wI · `if()` (Chrome 137): https://developer.chrome.com/blog/if-article
- `@scope` in all engines: https://frontendmasters.com/blog/how-to-scope-css-now-that-its-baseline/
- Agents and Tailwind (secondary): https://daisyui.com/pages/tailwind-agent/ · https://dev.to/vola-trebla/your-ai-agent-hallucinates-tailwind-classes-heres-the-fix-mk2 · https://www.stork.ai/blog/the-ai-guardrail-for-tailwind-css
