# 31. Query shapes: `query.shape`, last-seen shapes, compiler shape variants, `<Text reserve>`, X032–X036

Status: built (2026-10-30). This closes the skeleton items in PLAN §9's "3. Start" row. The design comes from
[11](11-text-and-type.md) §7 and §8.5 and builds on warp's `<Shape>` and X031 ([26](26-phase-2-completion.md) §4).
Measurements are in §9.

**Goal:** when data arrives, nothing moves. A pending view is the size the content will be, and nobody hand-writes it.

## 1. What changed from research 11, and why

Research 11 was written before the runtime existed. Five of its assumptions no longer hold.

| Research 11 | Now | Why |
|---|---|---|
| Pretext measures placeholders, and text bars are drawn at the measured widths | **The browser lays out placeholder text in the real elements.** The bars are `[data-skeleton]` spans around that text | `text.measure` lands with Surfaces, and the base runtime must not load Pretext. Placeholder text in the real element gets the real font, width and wrapping from the engine that will lay out the content, on the server too, with no measuring code |
| New skeleton CSS for bars | **None.** warp's spec already has it: `[data-scope="skeleton-scope"][aria-busy="true"] [data-skeleton]` turns real children into shimmer blocks of their own size (05 §5) | warp is ported, never redesigned |
| Shape record of counts and heights, about 8 bytes per row, persisted to `sessionStorage` | **A pointer to the fn's latest entry.** The mask (§4) is computed when a skeleton is shown | The cache keeps every entry, so a same-args revisit has a value and shows no skeleton at all. Last-seen only serves **other args** of the same query, and the entry is already in memory. The data path pays one `Map.set`. `sessionStorage` is not built: SSR renders the content on a reload, so it has nothing to help |
| `.shape` is a `Derived<Shape>` over a new `Shape` type | **`.shape` is a placeholder value of the result's own type** | The variant reads `post.title` from it exactly as the component reads the real value, so `.map`, `?.`, `&&` and formatters all work with no shape vocabulary |
| `query({ shape: { title: { example } } })` per-field hints | **`shape` is an example result:** `shape: [{ title: 'Release notes for 0.4' }]` | The same type as the output, and it needs no schema |

## 2. The API

```tsx
// src/server/posts.ts
export const listPosts = query({
  input: z.object({ limit: z.number() }),
  output: z.array(z.object({ id: z.number(), title: z.string().max(80), body: z.string().max(400) })),
  run: ({ input }) => db.posts(input.limit),
})

// A component
function Feed() {
  const posts = listPosts({ limit: 20 })
  return <ul>{(posts.value ?? []).map(p => <li key={p.id}><h3>{p.title}</h3><p>{p.body}</p></li>)}</ul>
}

<Boundary pending="shape"><Feed /></Boundary>
```

- **`posts.shape`** and **`listPosts.shape(input)`** return a placeholder value, or `undefined` when nothing is known.
  Hand-written pending views can use it too: `<Shape kind="list" rows={listPosts.shape({ limit: 20 })?.length} />`.
- **`<Boundary pending="shape">`** renders the compiled shape variant of its children. The string form is
  compile-time: the compiler replaces it with `shape={site}`, a function that returns the variant.
- **The place is held from the first paint** (research 11 §7.4). A hand-written fallback appears at 150 ms and pushes
  what's below it. A shape renders at once with `visibility: hidden` and is revealed at 150 ms, so the reveal moves
  nothing and data inside the 150 ms swaps straight in. The timing is otherwise unchanged, and so is X031.

**Size sources, in order** (research 11 §7.1):

1. The value already cached for these args. (A cached value means no skeleton at all, so this only serves `.shape`.)
2. The last-seen value of the same query with other args.
3. The declared `shape` example, merged over the `output` schema.
4. Nothing known: a generic placeholder that reads as anything (§5).

Server hints (`x-weft-shape`) are not built. SSR renders real content, and the query stubs already carry the shape.

## 3. Getting a schema's shape to the client

The client build replaces a server module with stubs, so the Zod schema doesn't ship, and it shouldn't. The stub
carries a compact tree instead:

| Output | Tree | Placeholder |
|---|---|---|
| `z.string().length(n)`, `.min/.max` | `{ $s: n }` (`.length`, or the midpoint) | n characters |
| `.meta({ example })` | the example | the example |
| a named field (`title` 40, `email` 22, `body` 200, `name` 16…) | `{ $s: n }` | n characters |
| any other string | `{ $u: 16 }` | 16 characters, and X036 when one is shown |
| `z.array(x).max(n)` | `{ $a: n, $of: tree }` | n rows (the input's `limit` wins) |
| `z.array(x)` | `{ $of: tree }` | the input's `limit`, else 5 rows and X032 |
| optional, nullable | absent, `null` | research 11's rule; `.meta({ probability })` of 0.5 or more keeps it |
| number, boolean | the value `0`, `false` | same |

`@weft-js/start` evaluates server modules once to get the schemas: the dev server's SSR environment in dev, and a private
Vite server at build, the same way `.weft/contract.json` is written. It runs only when a project uses
`pending="shape"` or `.shape`. Without those, no module is loaded and the stubs are unchanged.

The server computes the same tree from the same schema, so a streamed fallback hydrates against the same placeholders.

## 4. Last-seen, and why placeholders are masks

A last-seen placeholder is the old value with its letters masked, not its length. Each letter becomes a stand-in of a
similar width (`i` narrow, `m` wide, `n` the rest, `X` capitals, `0` digits), and spaces stay. So word boundaries and
widths survive and the line count nearly always does, while no user text enters the DOM. Numbers, booleans and nulls
stay; an expression over them behaves the same. Rows are capped at 50, which is well past any viewport.

## 5. The compiler's shape variant (`crates/weft-compiler/src/shape.rs`)

For each component whose body returns JSX, the compiler writes a second function, `Name$shape`, next to it. It is
ordinary JSX, appended to the printed module, so it goes through the same back end: DOM, SSR and hydration all work.

| Source | Variant |
|---|---|
| Host element | Same tag with its static `class`, `style` and sizing attributes. Events, refs, `id`, `src` and `href` go |
| `{expr}` over placeholders | `<span data-skeleton style="color:transparent">{$$st(() => expr)}</span>` |
| `{expr}` over a dropped local | The same span, with a default length |
| `<img>`, `<video>`, `<iframe>` | The same tag with its dimensions, `data-skeleton`, and no source |
| `xs.map(x => …)` | The same `.map` over the placeholder array, with the variant of its body |
| `a ? b : c`, `a && b` | Evaluated over placeholders; with a dropped local, the branch with content |
| `const x = q(…)` | `const x = $$sr(q)`: the shape of the resource `q` made under this Boundary |
| `const y = x.value ?? []` | Kept when it only reads what's kept. Everything else in setup goes |
| `<Row post={p} />` | `<Row$shape post={p} />` if `Row` has a variant |
| A component with no variant | Its JSX children's variants, or one bar. Its code doesn't run: placeholder ids must not reach real effects or queries |

**Why this is a sibling function and not the real component with placeholder data.** Running real setup with fake data
would fire effects and queries with fake ids.

**Why setup doesn't need its inputs.** `<Boundary>` has already built its content, so the real `listPosts({ limit: 20 })`
ran and registered its resource. The variant only says which query it wants (`$$sr(listPosts)`), and the Boundary
finds that resource, with the real input, however that input was computed.

**warp apps** load the skeleton CSS with `<Shape>` or `<Skeleton>`, or `import '@weft-js/warp/skeleton'` when neither is
on the page. Without it (no warp), the reservation still holds: the placeholder is transparent, with no shimmer.

**Cost.** Variants are emitted only when `@weft-js/core/vite` asks (`options.shapes`), and each is a plain function nothing
imports until a `pending="shape"` reaches it, so tree-shaking removes the rest. A component with no consumer costs 0
bytes in production (§9). Across modules, the plugin tells the compiler which relative imports have variants, the same
way it passes style groups, so a variant never imports a name that doesn't exist. A re-exporting barrel counts as no
variant.

**The wrapper** is `<div data-scope="skeleton-scope" aria-busy="true" role="status" aria-label="Loading" inert
style="display:contents">`, so flex and grid parents lay out the variant's elements as they will the content's. X031's
measuring walks through `display: contents`.

## 6. `<Text reserve>` (`@weft-js/core/text`)

```tsx
import { Text } from '@weft-js/core/text'
<Text as="p" reserve={200}>{post.value?.body}</Text>       // 200 characters' worth, until the text arrives
<Text as="h2" reserve={posts.shape?.[0].title}>{title}</Text>   // a sample string
```

While the child is empty, `Text` renders the placeholder inside the real element, in a one-element SkeletonScope.
The element has its real font, width and wrapping, so the reservation is the right size at any width, with no script
and no measuring. When the text lands, one node swaps and nothing else writes. In a shape variant, `Text` stays
`Text`, so its element, class and role survive.

`text.measure` can make this exact later (research 11 §8.1's `min-block-size` and `data-exact`). The API doesn't change.

## 7. Diagnostics

| Code | Severity, by | Fires when |
|---|---|---|
| X032 | warning, runtime (dev) | A skeleton repeats a list with no count: no input `limit`, no `.max()`, no last-seen. It shows 5 rows |
| X033 | warning, `weft check` | `x.pending ? <Skeleton…> : …` (or `&&`) with no check that `x` has no value: a refresh flashes the skeleton |
| X034 | exists | research 26 |
| X035 | warning, `weft check` | Streamed text goes straight into a scroll container (`overflow: auto/scroll`) with no `<Text stream>` |
| X036 | warning, runtime (dev) | A schema string with no length hint was actually shown in a shape variant. Fields a variant doesn't show stay quiet |

X032 and X036 run in dev rather than in `weft check` because they depend on the schema and on what the variant reads.

X035's fix is `<Text stream>`, so `Text` has a small `stream` mode: the height only grows, checked once per frame.
Research 11 §7.3's full treatment (whole-line steps, tail blocks) stays in Phase 3c.

## 8. Not built

- **Pretext-measured bars,** `text.measure` and exact `min-block-size`: Surfaces.
- **Morphing a skeleton into content from per-key heights.** Swapping is CLS 0 and simpler (research 11 §7.4).
- **`sessionStorage` shape records and `x-weft-shape`:** nothing needs them (§1, §2).
- **Viewport-fill counts** (§7.3's "rows that fill the viewport + 1"): a count comes from `limit`, `.max()` or 5.
- **Variants through barrels and third-party components.** They get one bar, or their JSX children, and X031 says so
  in dev. That includes warp's own components (`<Card>`), which come through its barrel.

## 9. Measurements

**Layout shift.** Chrome, 390×844, a 20-row feed at research 11 §7.6's lengths (title 12–70, body 40–360), data at
+400 ms, `PerformanceObserver('layout-shift')`, a production build as well as dev (`test/shape.browser.test.mjs`).
`moved` is how far the element after the feed went at the swap.

| Pending view | CLS at the reveal | CLS at the swap | `moved` | DOM writes at the swap |
|---|---|---|---|---|
| naive (5 × 72 px bars, hand-written) | 0.024 | 0.028 | 2986 px | 2 |
| shape, nothing seen (schema midpoints) | **0** | **0** | 541 px, below the fold | 2 |
| shape, last seen, same payload | **0** | **0** | **0** | 2 |
| shape, last seen, other payload | **0** | **0** | 352 px, below the fold | 2 |

The footer is off-screen with a 20-row feed, so CLS only sees rows in the viewport, and those are swapped, not moved
(research 11 §7.4). `moved` is the stricter number. **Exact only holds for a payload of the same size:** the schema's
midpoints are a guess, and last-seen for a different payload can't know the new lengths. A short list on a tall screen
would show those differences as CLS. The two 2s are the skeleton out and the feed in.

Two things this measurement changed:

- **`x` was the wrong stand-in.** With `x` (0.5em in Arial) the same payload moved 124 px, because most lowercase is
  0.556em and the masked text wrapped too late. `n` gives 0.
- **The first version shifted at the reveal,** the footer jumping at 150 ms (CLS 0.028). That's why the place is now held
  from the first paint (§2).

**Size** (brotli, against the commit before this work, `packages/weft/scripts/size.mjs`):

| Page | Before | After |
|---|---|---|
| hello world, v3 shop (client and hydrate), js-framework-benchmark | | unchanged, to the byte |
| runtime (every export) | 6.37 KB | 6.45 KB |
| `Boundary` + `resource` | 3.64 KB | 3.72 KB (+82 B) |
| a `pending="shape"` page, against the same page with a hand-written fallback | 3.91 KB | 4.26 KB (+350 B) |
| `@weft-js/start`'s client: `fill` and `mask` | | at most 407 B, on every page that loads a query |

A component no `pending="shape"` reaches costs 0 bytes: `test/shape-size.test.ts` checks that neither its variant nor
@weft-js/core/shape reaches the bundle. `Text` is only in a page that imports `@weft-js/core/text`.

**Hydration.** A streamed `pending="shape"` fallback, then the content, hydrates with 0 misses and 0 writes.

## 10. Two bugs found

Both were in existing code, outside this work:

- **`xs?.map(x => <li key={x.id} />)` crashes at run time.** The pre-pass rewrites `x` to an accessor, but an optional
  chain never becomes a keyed list, so `x().title` runs on a plain value. `(xs ?? []).map(…)` works.
- **`cond ? <Boundary … /> : null` never showed `pending`.** Fixed in the same change. The hole's effect read the memo
  `Boundary` returns, so each `show` change re-ran the hole and rebuilt the Boundary, restarting its timer and its
  fetch. Any component that returns a reactive value directly had the same problem, in a fragment too. A hole now
  reads a function or an array holding one in a child computation, so the condition and what it built have separate
  dependencies. Holes with plain values get no extra node. The runtime grows from 6.45 to 6.50 KB br.
