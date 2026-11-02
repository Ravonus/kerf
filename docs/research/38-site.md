# weft site: research and recommendation

Observed 2026-10-31 in the built-in browser and with direct fetches. Keystroke and navigation timings are one or two samples on a Mac at load 15–37, so read them as ranks, not benchmarks.

## What I saw

| Site (page) | JS KB* | DOM | Search | Keystroke to results | Worth taking / avoiding |
|---|---|---|---|---|---|
| Svelte docs | 116 | 585 | Client worker, 390 KB br content file | **6–7 ms, no requests** | Take: fastest by far. Fixed bottom bar on phone. Avoid: one flat list, heavy file |
| Astro docs | **32** | 1,423 | Algolia, plus an analytics call per query | 103–181 ms | Take: lightest docs. Results grouped Reference / Learn |
| Vue guide | 63 | 1,159 | Algolia, 28 KB chunk on open | ~196 ms | Take: API-style switch changes page content |
| tRPC docs | 261 | 353 | Algolia, 110 KB chunk on open | network 52–171 ms | Take: landing shows real editor autocomplete |
| Tailwind docs | 256 (+1,172 fonts) | 1,058 | Algolia | 63–198 ms | Take: best grouping, tinted active row. Avoid: font weight; one page change took 1.2 s and 11 requests |
| React learn | 462 (+312 fonts) | 2,411 | Algolia, 4 fetches on open | 58–155 ms | Take: inline sandboxes in prose, about 69 KB loaded on scroll; Copy on every page; `.md` page |
| Next docs | 553 | 921 | Own `/api/search`, 241–263 ms | 395–496 ms | Avoid: slowest search here. Take: speculation rules, `.md` pages |
| TanStack Query | 670 | 1,031 | Algolia, ~69 KB on open | 58 ms | Take: Ask AI as the first row, library and framework filters, examples with a file tree and no iframe until asked |
| Radix dialog | 614 | 2,514 | `/` hint; not timed | n/a | Take: preview stage, CSS flavour selector, shipped size badge, prop descriptions in a popover |
| shadcn button | **2,761, 113 files** | 1,573 | Static commands plus `/api/search` | commands 5 ms, server 174 ms | Take: variant sections, install tabs, Copy Page. **Avoid: raw `<mark>` tags visible in results**, "No results found" shown mid-load |

*\*Bytes on the wire in the browser, idle page, search closed. Solid docs: 93 KB by HTML refs, 19 KB search chunk, backend not determined. Landing pages by HTML refs (gz): Astro 6, Vue 74, Svelte 95, Solid 147, tRPC 159, Tailwind 338, TanStack 384, React 427, Next 463, Vercel 585, shadcn 599, Radix 751, Linear 850. Those counts include modulepreloads and exclude later chunks, so they differ from the column above.*

**First screens.** The ones that sell show the product: shadcn fills it with live working components, Radix pairs code with a live gallery, tRPC shows the type inference happening. Astro and Next put a copyable install chip by the headline. Vercel, Svelte, Next and TanStack lead with art, which proves nothing. Tailwind puts search beside the main button.

**Other patterns.** Radix Themes' playground is the right model for warp's dial: one side panel changes the whole page, then Copy Theme. Solid's examples page is a list beside a live editor. Svelte's playground shows compiled output, at a cost of 642 KB, and Svelte preloads page data on hover. All six phone layouts I tried had no horizontal overflow at 375 px.

**Agent access.** `llms.txt` exists on most (missing at the root on Astro docs, Tailwind, Radix), with full-text versions on tRPC, Svelte (1.27 MB) and Vue. I saw little beyond that aimed at agents.

## 1. Pages

- **`/` landing.** First screen: one-line claim, install chip, search, and a **live** counter with a DOM-write meter and this page's real JS bytes. Below: three proofs (updates, size, agent errors), the shop receipt, a streaming demo, the warp dial. About 4,000 px. Art is the weave motif only.
- **`/docs`.** Three-column: nav, prose, on-this-page. Sections: Start, Learn, Reference (API, `W/S/R/X` diagnostic codes as individual pages), Agents (AGENTS.md, MCP, `weft check --json`, evals), Migrate from React. Each page gets Copy as Markdown, a `.md` twin, and prev/next.
- **`/examples`.** Solid's layout: list plus live editor, with an output pane of DOM writes and bundle bytes.
- **`/warp`.** Overview with the dial, Foundations, then one page per component.
- **`/llms.txt`, `/llms-full.txt`, `/search.json`.** Generated, same source as the pages.
- Built on weft and warp, prerendered through `@weft-js/start`'s `prerender` export.

## 2. Search and spotlight

**Naming.** warp already uses `spotlight` for a pointer glow (08 §1.3). I read the owner's "spotlight" as the ⌘K launcher, so it is warp's `CommandPalette`: 640 wide, 12dvh from top, full screen on phones. **Please confirm.** Search and commands are one surface.

**Prototype result.** I ran a prefix inverted index over Svelte's real corpus (2,088 sections, 1.1 M chars). In Node on this Mac: full-body query p50 0.014 ms, p99 0.25 ms, max 0.62 ms; worst single-letter prefix 0.25 ms; index build 34 ms. Brotli sizes: titles 15 KB, plus URLs 25 KB, plus 160-char snippets 99 KB, full text 290 KB. So the query fits a frame easily; size and rendering are the real problems. Not tested: a phone, typo tolerance, highlight cost.

**Build.** A build step reads MDX, component metadata, the diagnostic catalog and examples, and emits two content-hashed, immutable files:

- **T0, ≤ 20 KB br:** every title, heading, API symbol, component, prop, diagnostic code and example, with URL, kind and static rank. Pre-sorted vocabulary plus postings in a flat `Int32Array`, so no build at runtime.
- **T1, ≤ 120 KB br:** body text and snippets, same format.

**Cached in the page.** T0 is fetched at idle and held in a module variable in the app shell, so it survives client navigation. T1 loads in a worker on first focus or first pointer over the search trigger. Both also go in Cache Storage for later visits. A keystroke before T0 lands is queued and answered on arrival; the input never blocks. Opening fetches no JS chunk: the palette is in the shell, unlike the 28–110 KB chunks on Vue, tRPC and TanStack.

**One-frame path.** No debounce, no spinner, no skeleton.

1. `input` event runs T0 synchronously on the main thread (a postMessage round trip is not worth it for under 1 ms).
2. A pool of 12 row nodes is written through fine-grained text updates. No list diff, no remount, fixed row height so nothing shifts.
3. Query matches are painted with the CSS Custom Highlight API, which warp's CodeInput already uses. No markup in strings, so shadcn's `<mark>` bug cannot occur.
4. The worker gets the query; a superseded query is dropped. T1 hits arrive a frame or two later, **append only**, and never move the selected row.

Gate: CI measures input to paint at 4× CPU throttle; p95 ≤ 16 ms on T0.

**Keyboard**

| Key | Action |
|---|---|
| ⌘K / Ctrl+K, `/` (outside fields) | Open; press ⌘K again to close |
| Type | Filter; first result selected. Focus stays in the input (warp 05 §3) |
| ↑ ↓, Home End, PgUp PgDn | Move; wraps. Selected row scrolls into view |
| Enter / ⌘Enter | Open / open in new tab |
| Tab | Next group header |
| → on a page row | Preview headings in the same list |
| `>` first | Command mode: theme, expression dial, copy page as Markdown, go to |
| `@` / `#` first | Components only / examples only |
| Esc | Clear query, then close, then return focus to the trigger |

Empty query shows recent items (per-viewer `localStorage`, wrapped in try/catch) and top pages. Hover changes selection only after the pointer moves. Announce the result count politely.

**Grouping and ranking.** Fixed group order: exact match pinned, then API, Guides, Components, Diagnostics, Examples; at most 4 per group, with "show all" as a row. Score = exact symbol or code (`W005` jumps straight there) > title prefix > heading prefix > title word > body, multiplied by per-page static rank, with a current-section tie break. An item keeps its group as you type. Fuzzy matching runs only when exact and prefix find nothing, and is labelled. No third-party calls.

## 3. Code examples and live previews

Three levels, cheapest first; a page uses the lowest that makes the point.

- **Static (default).** warp `CodeBlock`, highlighted at build into token classes, zero JS, works without scripts. Filename, Copy with "Copied" state, wrap toggle. Tabs for `npm/pnpm/bun` and TS/JS, remembered across the site. Line focus and diff marks. Don't hide code behind a button on phones as shadcn does.
- **Live (prebuilt).** The example is compiled at build and mounted in a shadow root when it scrolls near. Under it sits a thin strip: DOM writes, component runs (always 1), KB. Reset button. Nothing downloads for a page with no live example.
- **Editable (on demand).** Click Edit. warp `CodeInput` replaces the block, the compiler loads in a worker, preview runs in a sandboxed iframe, and errors show as real W-codes inline with their autofix. Output tab shows compiled JS, per Svelte. Open in `/play` carries state in the URL hash. Target under 500 KB to beat Svelte's 642.

**Blocker:** `weft-compiler` is Rust and I found no plan for a browser or WASM build (PLAN mentions WASM only for `native()`). Without one, Editable needs a server compile or waits. Live does not depend on it, so ship that first.

## 4. Toolkit pages

- **Overview:** Radix-style dial panel: expression quiet/balanced/vivid, accent hue, light/dark, `fields: floating|classic`, Copy config. It restyles the whole page instantly, since everything is tokens.
- **Component page, in order:** name and one line; shipped-bytes badge (JS + CSS, br, measured at build) and tier; **preview stage** with prop controls; code that updates with the controls; install; variants as sections with a live preview each; states (hover, focus, error, disabled, loading) shown pinned, so you needn't reproduce them; keyboard table; a11y notes (APG pattern, contrast result); props.
- **Prop controls are warp's own inputs** (floating fields, switches, segmented). Each control updates the preview by a single bind, without remounting.
- **Prop table:** generated from types, never by hand. Name, type (long unions expand in a popover), default, one line of description in the row rather than Radix's hidden popover. Bindable props marked.
- **Also:** a 390 px frame toggle, and copy-prompt plus `.md` links for agents.

## 5. Examples

Each is under about 40 lines. Transport demos use the `@weft-js/core/test` fake in the browser and **say so**; the same code runs against a real server, with a repo link.

| # | Example | Reads like | Proves |
|---|---|---|---|
| 1 | Counter that runs once | `state`, one button | Component body runs once; a log shows 1 run, N text-node writes |
| 2 | Live prices, 1,000 rows | `stream` plus a keyed list | Fine-grained: changed cells flash, DOM writes per tick are shown (evals: 1 write per price push) |
| 3 | Shared todos, two panes | `listTodos.live()`, `mutation` | Realtime by tag poke; no client cache code, no flashing skeleton on refetch |
| 4 | Chat with a "cut the wire" button | `channel` with `authorize` | Reconnect and resume in about 30 lines; missing `authorize` is an R-code, not a bug |
| 5 | Slow page, instant shell | `resource`, `<Boundary pending>` | Streaming SSR with a delay slider; shell first, holes fill, matching skeleton shape. Needs a small real server or a labelled recording |
| 6 | The shop receipt | Whole app, itemised | About 10 KB: bar chart of runtime/kit/app. Use only `evals/` numbers (shop 10.7 KB br JS; v4 app 6.8–6.9 KB gz vs Solid 10.4–11.8, React ~70), name the app, link the raw results |
| 7 | React habit, caught | Paste `state(prop)` or an effect that copies state | Compile error W005/W004 with a one-click fix: the design rule that errors teach |
| 8 | Ask the app | The todo app plus a live graph | Reactive graph as JSON with real names; change a value and watch only its edges light up; same JSON an agent reads through MCP |

## 6. How weft's site beats all of these

1. **Search no one can match on weight.** Svelte proves 6 ms; nobody pairs that with grouping, commands, and a small index. Target ≤ 16 ms at 4× throttle on 140 KB total against Svelte's 390 KB and flat list.
2. **Docs under the lightest measured.** Astro docs is 32 KB of JS; Svelte, the fastest search, is 116. Target ≤ 20 KB br JS for shell, search and page, by PLAN's own 10 + 7 KB gate. This is the argument for the product, so make it visible.
3. **A live footer readout.** Real bytes, DOM writes and run count for the current page, from the browser's own APIs. No site here shows its own cost.
4. **Agent-first in fact.** Stable `/search.json`, MCP over the same content, a page per diagnostic code, a `.md` twin everywhere, and a published eval page with raw results, including the finding that correctness ties.
5. **One rule for motion.** Use warp's budget: nothing idle, nothing over 384 ms, except the sweep. Hover preload as Svelte does and hold under about 100 ms between docs pages. Linear shows the other approach: 4,774 DOM nodes, 188 KB gz HTML, 123 animations.
6. **Quality gates in CI.** Search frame time, page JS, contrast, axe, 375 px overflow. Fail the build on a miss.

## Not verified

- **Real networks and phones:** all numbers come from one Mac, and cached state varied between pages.
- **Linear's hero stayed black** at 2 s and 6 s. The browser pane was hidden at the end of the run and may have been earlier, which throttles rendering, so I can't judge its first screen or motion.
- **Svelte's index fetch:** I never saw the request itself (the log was gone), only the worker and the published file; I infer it loads that file.
- **View transitions, theme flash, reload behaviour:** I did not watch them or test them, on any site. A `view-transition` CSS rule exists on tRPC; that is all.
- **Phone search and touch gestures:** tested layout only. Radix's search was opened, not timed. Vercel internals and Solid's search backend not determined.
- **Pagefind:** official docs state no size figures, so I didn't compare it; blog numbers were unverifiable.
- **weft readiness:** the compiler in a browser is unplanned, and prerender for a docs-sized site is untested by me. CommandPalette's `commands: Command[]` API has no groups, async sources or modes yet; section 2 needs those added. Bundle targets above are mine, except PLAN's gate.
- **Sizes for the 20 KB and 120 KB tiers** are scaled from Svelte's corpus; re-measure on weft's docs.
