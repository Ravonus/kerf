# Instant navigation from existing primitives

Status: design decision for Sprint 7. This document changes no runtime or UI.
The timing and budgets below are implementation requirements, not measured results.
S4 implementation is on main; recovery of its historical evidence is separate work.

## Evidence and scope

Read against `d99bfa49`, whose Sprint 7 requirements are in
`docs/ROADMAP-1.0.md:368–400`.

| Existing primitive | Evidence | Consequence |
| --- | --- | --- |
| Route levels and shared layouts | `packages/start/src/router.ts:105`, `applyMatches` | Retain level identity and write only changed params/data. Do not replace the application root. |
| Navigation waits for data and code | `packages/start/src/run/navigation.ts:106–139` | History and active links currently change after both awaits. Move acceptance before network work. |
| Link interception and intent | `packages/start/src/run/listeners.ts:29–90`, `run/helpers.ts`, `ours` | Reuse delegated anchors, hover/focus, transition cancellation and native-link exclusions. Pointerdown currently only cancels a fade. |
| Static and reactive active links | `packages/start/src/view.tsx`, `Link`; `run/helpers.ts`, `current_` | Both must observe accepted navigation immediately. |
| Boundary first-load tracking | `packages/core/src/async/boundary.ts:56`, `async.ts:54` | Initial pending differs from refetching. A refresh keeps its current value. |
| Boundary delay | `packages/core/src/async/shared.ts:4`, `boundary.ts:222–229` | The current 150 ms delay and 400 ms hold cannot be the navigation policy. |
| Compiler shapes | `crates/weft-compiler/src/shape.rs:234–313` | Reuse variants and their inert, sizing-preserving markup. Generation currently needs shape discovery or an authored shape site. |
| Query shape refinement | `packages/start/src/data/query.ts:62–76` | Reuse same-input/last-seen masked values, then the declared/schema shape. |
| Navigation data | `packages/start/src/server/navigation.tsx:18–65` | Deferred fields are awaited; responses currently use `no-cache` without ETags. Do not require a new streaming protocol for this sprint. |
| Mutation ordering | `packages/start/src/data/mutation.ts:29–100`, `data/cache.ts:184–246` | Keep call-owned optimistic layers, rollback, tag invalidation and generation checks. |
| Existing cache bounds | `packages/start/src/run/navigation.ts:28`, `data/cache.ts:90–110` | One warm response is not a route cache. The query cache's 1,000-entry target is soft because active entries are pinned. |

Preserve existing markup, styles, controls, nested outlets and interaction state.
Skeletons occupy the existing outlet. Add no spinner, overlay, detached panel or
new navigation control. Existing no-JavaScript links and forms keep working.

## Acceptance, presentation and completion

Treat one navigation as a transaction with a sequence number, abort controller,
source URL, destination URL, committed matches and an invalidation generation.
Keep accepted destination and committed payload separate. `route.path` becomes
the accepted pathname plus search; level params/data remain committed until a
matching payload can land. Server rendering still uses one state per request.

Resolve the roadmap's two outgoing-page sentences as follows: **the old page
stays interactive until the incoming presentation can render. That presentation
can be a skeleton; it need not be the incoming real page.** There is no extra
interactive grace period after the skeleton replaces it.

1. At eligible pointerdown, resolve the destination and capture the source URL,
   scroll and focus before changing history. Cancel the previous transaction and
   skip any transition picture that could intercept the next input.
2. In that event task, push history once, or replace it when requested. Set
   `route.path`, update reactive and static `aria-current` state, and flush the
   shared layout's path-dependent bindings. These operations await no request,
   chunk, timer or View Transition. Shared layouts retain their owners, DOM and
   local state. Their server data and params change only when known together;
   immediate layout response does not mean inventing loader data.
3. Prefer renderable cached content. Otherwise prepare the incoming skeleton
   synchronously from already available shape metadata. Replace only the
   changed outlet in the same task when possible, by the next paint. While
   preparation runs, the outgoing DOM remains live, with its original committed
   props and source URL context. Do not disable it in anticipation of a swap.
4. On replacement, remove outgoing content from hit testing and tab order.
   Dispose replaced route owners exactly once. Keep owners whose route IDs are
   unchanged, including parameter/search-only navigation, as `applyMatches`
   does today; their outlet may show a skeleton without disposing those owners.
   This transient retention is not a cache of mounted pages. Outgoing relative
   links and submits must still resolve against the captured source URL while
   retained, including native modified-click behavior.
5. Fetch data and required code/CSS in parallel. Seed query values through the
   existing generation-aware hook, prepare incoming content and atomically
   commit matches, status, head and static HTML. If its first resources remain
   pending, keep the route skeleton until initial content or its error view can
   render. Background resource refreshes never reinstate a route skeleton.
6. Release the skeleton's owner and commit scroll once: hash target or top for
   forward navigation, saved position for history, or retain it for
   `scroll: false`. Preserve focus in retained layouts. If the focused outgoing
   node disappears, use the existing content focus policy when real content
   arrives; skeleton nodes are inert and never receive focus.

An already renderable destination skips the skeleton. A cold or slow destination
must visibly show its skeleton in under 100 ms; URL and active-layout response
must be painted in under 50 ms. A real-content View Transition may run only after
these updates and must not hold an old-page picture over the skeleton. Preserve
reduced-motion behavior. No artificial minimum skeleton hold delays ready data.

Use the existing Boundary/resource ownership and first-load machinery. Add a
private per-instance navigation timing scope in `async/shared.ts`, read by
`async/boundary.ts`, with zero show delay and zero minimum hold for the route
gate. Make that scope available through the existing core internal entrypoint;
do not import core source paths from Start. Keep ordinary Boundary timing at
150/400 ms and keep nested application Boundaries outside the route timing
scope. Do not mutate the exported global `timing` object during navigation.

Only the latest sequence may change history, head, scroll, matches, seeds or
presentation. Check its abort/sequence after every await, including chunk and
transition completion. A late response cannot restore an older page. Loader
redirects replace the accepted pending entry, keeping the existing five-hop
limit. On fetch/chunk failure, use the existing full navigation to the accepted
URL with replacement, rather than pushing it twice. Handle route errors in the
same outlet. Back/Forward abort pending work and select the history entry without
another push; a cache miss takes the same immediate skeleton path.

## Pointerdown eligibility

Use one admission helper for navigation and prefetch, based on `ours`, with the
event-specific checks kept explicit:

- A real anchor in the event's composed path, with a valid HTTP(S) same-origin
  URL matching a page route in the client table. Unknown URLs use native
  navigation. Exclude internal `/_weft/` URLs.
- Primary pointer and button zero, with no Meta, Ctrl, Shift or Alt; reject an
  already prevented event. Run delegated admission after app handlers have had
  their normal chance to prevent the event. A later click cannot veto an already
  accepted pointerdown; document pointerdown cancellation for guarded links.
- No download, external rel token, non-self target or editable origin. Honor
  ancestor `data-navigation="off"` as the full-load opt-out. An existing
  `data-preload="off"` disables speculation only, not real navigation.
- Same-document hashes retain native anchor/scroll behavior. An identical URL
  is a no-op rather than another history entry.

Record the accepted pointer gesture and suppress its matching click's default
navigation even if the outlet swap removes its anchor. Clear the record on
pointercancel or completion, without suppressing a later independent click.
Keyboard, assistive and programmatic clicks without an accepted pointer gesture
take the same transaction through the click fallback. Preserve native context
menus, middle-click, modified clicks and new tabs. Test touch cancellation and
drag/selection explicitly: accepting on pointerdown is intentional and cannot
promise native release-to-activate cancellation after acceptance.

`navigate()` uses the same transaction, preserving `replace` and `scroll`.
Admission must be ready with the initial client entry on pages with navigable
links, rather than waiting for an island to wake and download `run.tsx` after
the press. Keep island component hydration lazy. Before the initial script is
ready, anchors keep their native fallback; the browser test records router
readiness and measures navigation after that point.

## Skeleton selection and compiler work

At the first changed outlet, compose the incoming layout/page shapes in route
order. A retained layout stays real; a changed layout includes a child outlet
shape. A parameter-only change uses the existing level and component identity.

Selection order is fixed:

1. `export const skeleton = false` on the destination page disables its route
   skeleton. Accept URL/active state immediately and retain outgoing interactive
   content until real content or an error can replace it. This opt-out is exempt
   from the skeleton deadline, not the response deadline.
2. `export const skeleton = Component` replaces the generated fallback in the
   same outlet. Bundle this override with eager shape assets, independently of
   the lazy page module. A false/component export on a layout governs that
   layout's own changed region; a page opt-out also suppresses its automatic
   composed incoming fallback. Never unmount an unchanged shared layout for it.
3. Otherwise use the compiler's shape, refined by the last successful render of
   that route at the same viewport width and style/build version. Prefer the
   exact pathname/search geometry; fall back to route-ID geometry. Reuse query
   `shapeOf` for collection counts and placeholder lengths.
4. With no prior render, use the declared/schema resource shape and compiler
   static structure. For opaque components or dimensions the compiler cannot
   prove, use its existing inert placeholder and reserve the known outlet box.
   Emit the existing shape diagnostics where applicable. Do not claim this
   predicts arbitrary unseen data dimensions exactly.

Capture geometry after successful content layout, not from a fallback. Store
only dimensions, counts and masked text lengths; never clone forms, events,
live DOM, user strings or component owners. Discard it on width/style mismatch,
deployment, session reset or route invalidation. The initial SSR page can seed
geometry for itself. Keep image aspect ratios, sizing classes and responsive
rules; do not add fixed dimensions to real content to manufacture a passing test.

Compiler changes are required. Merely wrapping each lazy page in
`pending="shape"` still waits for the page's code and misses cold 3G deadlines.

- In `crates/weft-compiler/src/shape.rs`, request variants for all route defaults
  and layouts even without an authored Boundary. Preserve named/default export
  handling in `shape/collect.rs` and reuse the existing generator in
  `shape/generate.rs` and sizing rules in `shape/elements.rs`.
- Produce an independently loadable, inert shape representation from the same
  variant machinery. Its dependency closure contains safe sizing constants,
  masked placeholders and shapes, never route setup, handlers, loaders or
  server imports. Do not import the full route to obtain `default$shape`.
  Unsupported expressions take the existing conservative placeholder path;
  do not evaluate arbitrary module code to derive a first-visit shape.
- In `packages/start/src/vite/route-modules.mjs`, extend the client manifest with
  shape/override metadata, critical sizing CSS and asset costs. Arrange for
  generated shapes to be synchronously available with navigation readiness,
  including static routes, 404/error shapes and nested layouts. Avoid a new
  request for the first skeleton. Measure the eager metadata/CSS cost separately
  from lazy page code; it is a real delivery cost, not free tree shaking.
- `packages/core/src/plugin.mjs` carries the existing shape-discovery/compiler
  plumbing. Extend that path rather than introducing another JSX transform.
  Add compiler cases in `crates/weft-compiler/tests/compile.rs` and product cases
  in `packages/start/test/shape.browser.test.ts`.

`checkSwap` in `packages/core/src/async/view.ts` remains a useful development
warning, not evidence of CLS 0. Exact first-visit geometry is not guaranteed for
arbitrary data; the scaffold acceptance test must use the template's real sizing
contract, and report other shape limits honestly.

## Bounded route cache and freshness

Replace `Navigation.warm` with one deduplicated route-payload LRU, not a second
query cache. Key by build ID, session epoch and exact pathname plus search;
exclude the hash and preserve search order. Each entry holds payload, ETag,
fetch/freshness times, loader-tag union, originating query generation, byte
count and compatible geometry. Query `c` still lands only through `client.seed`.

Initial policy: at most 32 entries and 4 MiB of decoded serialized payloads,
plus at most 1 MiB of geometry, with a 64 KiB per-geometry cap. These are proposed
conservative defaults to measure. Account prefetched entries in the same limits.
Evict least recently used entries until both caps hold. Never retain an oversized
response. Active rendered state and one in-flight candidate are owned separately
and are not hidden LRU exemptions. Bound queued work; release aborted responses,
temporary nodes and controllers. Do not retain mounted pages in history.

A usable cached payload with loaded code renders immediately on Back/Forward
or revisit, then conditionally revalidates. Without loaded code, show its shape
until code is ready. Thus instant real-content history is a warm-cache property,
not a promise for evicted routes. Restore saved scroll after outlet placement.
Do not use invalidated payloads as real content. Geometry may be independently
evicted; compiled fallback metadata remains available. Preserve the existing
query cache's soft 1,000-entry target and optimistic/readers pins; do not describe
that separate structure as a hard memory bound.

In `packages/start/src/server/navigation.tsx`, serialize the final response
once, compute an ETag from those bytes and build identity, and return an empty
304 when `If-None-Match` matches an authorized response. Initially this saves
transfer, not loader execution: authentication, loaders and invalidation still
run before deciding 304. Do not create a global cache of personalized responses.

For successful cacheable route data, default to
`Cache-Control: private, max-age=0, stale-while-revalidate=30` and appropriate
`Vary` for representation/session inputs. Preserve stricter app headers:
`no-store` forbids retention and `must-revalidate` forbids stale presentation.
Do not cache errors, redirects or responses that change cookies. Session-scoped
data is never marked public. Run authentication before 304, and preserve the
existing header/cookie merging. Server-derived limits may shorten the 30-second
client stale window; missing permission to cache means revalidate before reuse.

Use explicit conditional requests with `cache: 'no-cache'` in `run/helpers.ts`
so the HTTP cache cannot silently serve a stale response behind the client's
generation checks. A 304 renews a still-valid cached body and never goes through
`json()`. A 200 atomically replaces its entry and updates visible levels in
place. A failed background refresh retains permitted stale content within the
window and uses the existing retry path; auth refusal clears protected entries.
After the window, show a skeleton while validating rather than stale real data.

Extend `Navigation.invalidated`, not mutation's execution model. Tags from
`staleTags`, realtime and peer tabs invalidate every cached route whose loader
tags intersect, not only the current route. Keep `owed` tags for pending routes
whose dependencies are still unknown. Reject a 200 or 304 if its transaction,
session or affected tag generation changed after the request began; retry from
the new generation. Preserve captured `since` when seeding a cache hit, never
substitute Infinity. A late navigation cannot undo an optimistic layer or write.
On session reset clear payloads, pending speculation, geometry and validators;
on deploy/HMR clear build-dependent entries as well.

## Prefetch by intent and byte cost

Manifest costs include the unique not-yet-loaded code and CSS dependency graph,
plus route-data cost. Record exact emitted asset byte counts at build time;
use the greater of observed data size and a conservative estimate for data.
Unknown size is ineligible for speculation. Count shared chunks once. Reserve
budget before scheduling, count response bodies as they arrive and cancel data
prefetches that exceed the reservation. Speculative code warming uses
cancellable fetches of immutable assets, without evaluating the page module;
do not rely on cancelling an already started dynamic import.

Initial budgets below are policy proposals, not performance claims. KiB means
1,024 bytes; costs count conservatively in decoded bytes when transfer size is
unknown. The rolling allowance applies to the whole tab over 30 seconds.

| Connection | Hover / viewport | Strong speculative intent | Route cap | Tab allowance / concurrency |
| --- | --- | --- | --- | --- |
| `saveData` or offline | None | None | 0 | 0 |
| `slow-2g` / `2g` | None | Keyboard focus only | 8 KiB | 16 KiB / 1 |
| `3g`, or connection API absent | None | Keyboard focus only | 16 KiB | 32 KiB / 1 |
| `4g` | Hover after 80 ms; viewport only up to 16 KiB | Focus immediately | 64 KiB | 256 KiB / 2 |

Focus must be real link intent; skip text-input/editable origins. Viewport work
starts only while visible and idle and follows existing eligible anchors.
Cancel queued hover work on exit/blur, hidden documents or network downgrade.
Actual primary pointerdown promotes the same deduplicated work to navigation
immediately: it is demand, not speculation, even with Save-Data or above the
prefetch cap. Never refuse a requested page because of a speculation budget.
Keyboard activation and `navigate()` do the same. `data-preload="off"` prevents
all speculative triggers. Prefetch never runs a mutation or changes URL/UI.

## Optimistic actions and forms

`data/mutation.ts` is the only optimistic execution path. A mutation call and
`Form`'s existing `SUBMIT` path apply its recipe before transport, expose pending
immediately, and use call-owned layers. Preserve overlapping-call ordering,
single-flight refreshed queries, rollback of only the failed call, S011 tag
coverage and held layers when a write may have landed. Navigation/cache refresh
must not bypass those rules. Native no-JavaScript forms still post normally.

Keep the existing recipe callback and extend its type to accept `false` as the
per-action opt-out. Omission uses the available recipe automatically; false
prevents an automatic recipe from running. Use the same definition/stub in
`data/types.ts`, `data/definitions.ts` and
`vite/server-functions.mjs`; `form.tsx` must not maintain its own predictions.

An important limit of the roadmap's wording: tags and submitted fields do not
describe an arbitrary server transformation. With no existing recipe, Start can
show immediate pending/form feedback but cannot truthfully predict changed
domain data. Do not invent cache patches or execute server code on the client.
An application that needs that prediction supplies the existing `optimistic`
callback. There is no safe generic recipe to enable merely by omitting an
option. The mutation ticket must demonstrate this boundary with a negative case;
M2 must distinguish default recipe execution from automatic inference in public
copy. This decision introduces no second mutation layer or compiler synthesis
of business logic.

## Independent implementation tickets

The labels below are proposed follow-up scopes, not assignments of existing
orchestra ticket numbers. Each can be reviewed and committed independently;
dependencies are explicit. Internal contract types should land before consumers.

| Ticket | Exact implementation files / new files | Acceptance and dependency |
| --- | --- | --- |
| N1: failing scaffold proof | New `packages/create/test/e2e/instant-navigation.mjs`; new `packages/create/test/e2e/navigation-metrics.mjs`; `packages/create/package.json`; `scripts/check.mjs` | First ticket. Wire a real failing Playwright/CDP run into check, before changing navigation. Use the public `packages/create/bin/create-weft.mjs` to generate the landing app; do not change template UI. |
| N2: shape assets and manifest | `crates/weft-compiler/src/shape.rs`, `shape/collect.rs`, `shape/generate.rs`, `shape/elements.rs`; `crates/weft-compiler/tests/compile.rs`; `packages/core/src/plugin.mjs`; `packages/start/src/vite/route-modules.mjs`; `packages/start/src/run.tsx` | Independent of runtime work after agreeing manifest fields. Cold shapes/overrides contain no route setup or server code; report eager bytes and static/nested/default-export cases. |
| N3: accepted navigation and route gate | `packages/start/src/router.ts`, `run/navigation.ts`, `run/listeners.ts`, `run/helpers.ts`, `run/boot.tsx`, `view.tsx`, `client.tsx`, `boot.ts`; `packages/core/src/async/shared.ts`, `async/boundary.ts`; `packages/start/test/nav.browser.test.ts`, `shape.browser.test.ts` | Depends on N2 contract and N1 measurements. Immediate history/active links, route timing, cancellation, retained owners and both overrides; ordinary Boundary timing unchanged. Include internal-entry export plumbing in this scope. |
| N4: route data validators | `packages/start/src/server/navigation.tsx`, `server/payload.ts`; new `packages/start/test/navigation-cache.test.ts` | Independent of N3 after header contract. Test 200/304, private/session variants, no-store, cookies and mutation-invalidated validators. |
| N5: bounded client cache | New `packages/start/src/run/cache.ts`; `run/navigation.ts`, `run/helpers.ts`; new `packages/start/test/route-cache.test.ts`; `packages/start/test/nav.browser.test.ts` | Depends on N3/N4; sequential with N3 on shared files. Test hard byte/count caps, history, eviction, expiry, tag/session invalidation and stale 304 races. |
| N6: intent/cost scheduling | New `packages/start/src/run/prefetch.ts`; `run/listeners.ts`, `vite/route-modules.mjs`, `run.tsx`; new `packages/start/test/prefetch.test.ts` | Depends on N2/N5; sequential with their shared-file work. Test each network row, unknown/oversized costs, deduplication, cancellation and unrestricted demand. |
| N7: optimistic contract | `packages/start/src/data/types.ts`, `data/definitions.ts`, `data/mutation.ts`, `vite/server-functions.mjs`, `form.tsx`; `packages/start/test/form.browser.test.ts`; new `packages/start/test/optimistic-navigation.test.tsx` | Independent of shapes/ETags. Prove recipe execution/false, rollback, overlap, no-recipe limits and mutation/navigation races. Keep existing layers. |
| N8: M2 public docs and final proof | `packages/cli/docs/start.md`; new `site/content/learn/navigation-feels-instant.md`; N1 test files | Coordinate the reference-page placement with M2 before editing. Docs land with implemented API, then exact integrated scaffold proof. No public speed claim precedes its measurements. |

N3 and N5 share the navigation implementation deliberately; do not dispatch them
concurrently. Likewise sequence N6 manifest/listener edits after N2/N3. The new
cache and scheduler each serve demand navigation and speculative navigation;
keep unrelated behavior out of them.

## Early failing proof and completion evidence

N1 uses Playwright's `chromium` and `newCDPSession`, rather than extending the raw
CDP helper in `packages/create/scripts/cdp.mjs` into another browser driver.
Generate an unmodified landing template in one owned temporary root, wire it to
this checkout's packages, build and serve it, then exercise its existing links.
Reuse public scaffold/package helpers where compatible with pnpm; do not use
`packages/create/scripts/local.mjs`'s npm-only install path or silently test
published packages instead of the candidate. Pin the existing Playwright tool
version and include required package metadata if this test needs a direct
development dependency. This ticket installs or runs none of that.

- Run separate fresh contexts for Fast 3G (150 ms latency, 1.6 Mbit/s down,
  750 Kbit/s up) and Slow 3G (400 ms, 400 Kbit/s each way). CDP throughput is
  bytes/second, so divide bit rates by eight. Enable network throttling before
  navigation and verify the configured values. A separate delayed-response
  control guarantees a visible pending interval; it does not replace either
  throttle run. Do not describe network throttling as physical-device proof.
- Install a page-side observer before input. Timestamp trusted pointerdown with
  `performance.now()` and observe paint opportunities with animation frames,
  verifying active-link appearance, outlet visibility and location. Start from
  router-ready, not from `click()` completion. Require first painted visual
  response **< 50 ms**, visible incoming skeleton **< 100 ms**, correct URL and
  unchanged shared-layout identity. Do not hover first to warm the cold case.
- Exercise cold code/data, warm revisit, Back/Forward, a parameter/search move,
  rapid A→B→C and mutation invalidation. Hold data separately when testing that
  outgoing controls remain usable before presentation is ready and are absent
  after skeleton placement. Add keyboard, native-link exclusions, overrides,
  Save-Data and touch-cancel coverage without changing the template UI.
- Collect `layout-shift` entries with `buffered: true` and include entries with
  `hadRecentInput`. The usual Web Vitals input exclusion would hide precisely
  this regression. From skeleton appearance through settled content and two
  further painted frames, require the sum of shift values to equal **0**.
  *Status (2026-11-07):* the landing scaffold measures about 0.20 on Fast and
  Slow 3G (0.14 as the skeleton is placed, 0.06 as content lands). The check
  enforces a 0.25 regression ceiling; reaching 0 needs skeletons that match
  the destination's height and is open work.
  Wait for fonts and media dimensions; do not stop measurement at the first
  content node. Record bounding boxes as diagnostic evidence, not a substitute.
- Before trusting a pass, show the current implementation failing the cold
  response/skeleton assertions. Separately inject a late skeleton and a
  wrong-height fallback in the test transport/fixture controls; each must fail
  its intended assertion with a nonzero process status. Include recent-input
  shift coverage. A broken server, missing browser or unexecuted case is a
  failure, not a timing sample or skip.

Add `test:e2e` in `packages/create/package.json` for the raw Node entrypoint.
Add a slow `instant-navigation` step to `scripts/check.mjs` that invokes it and
propagates nonzero status. A filtered check can run that step alone; normal
`pnpm run check` includes both profiles. Enumerate the tracked matching test
entrypoints with `git ls-files` and assert the runner's selected count agrees;
print both profile names and each case's executed count so an empty run fails.
The manager's integration gate must run that check step on the exact commit.
An early deliberately red ticket is not permission to merge a failing final gate.

Keep bounded timing/shift/byte receipts with the candidate SHA and environment;
close the browser, server and owned temporary scaffold on success and failure.
For runtime/compiler changes, follow `CONTRIBUTING.md` and `CLAUDE.md`: package
checks, size checks and the full comparison across Weft + Warp, Solid,
React + Radix, React + Zustand and React + MUI. Commit comparison history and
HTML; retain the 50 KB Warp ceiling. No benchmark or 3G acceptance ran for this
design-only ticket.

M2 owns public coordination: reference types and exports, the Learn page's
defaults/opt-outs/custom skeleton, cache/session behavior, strong-intent budgets,
the pointerdown cancellation contract and the optimistic-recipe limitation.
Examples must compile against the implemented API and follow 70-column Markdown
and 58-column runnable sample widths. Do not redesign the scaffold to demonstrate
the feature. Implementation and exact integrated proof remain follow-up work.
