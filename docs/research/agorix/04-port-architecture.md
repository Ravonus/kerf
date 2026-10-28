# Agorix 04 — Port architecture, layering and distribution

Research date: 2026-10-28. Numbers come from scripted greps over `~/dev/agorix-discord/packages/ui/src` (worktree as
found, including its 14 uncommitted files) and over the four consumer apps on that date. Versions come from
`npm view`. Effort figures are **estimates**, not measurements. Statements marked **(unverified)** could not be
confirmed from a primary source.

**Decision being implemented:** Agorix (`@agorix/ui` 0.2.0) becomes weft's default front-end toolkit. It has to be
easy to (1) change the design, (2) plug into other toolkits and styling systems, and (3) skip entirely.

**Scope:** port strategy, package layering and distribution. Sibling docs: 01 design/theming, [02 components/a11y](02-components-a11y.md),
[03 server/realtime/data](03-server-realtime-data.md). "01"–"03" below mean those, not `research/0x`. Where this doc
and a sibling overlap, §6 says which one decides.

---

## TL;DR

1. **Agorix is two codebases in one package.** About **9k lines are already framework-free**: the data contract and 9
   DB adapters, realtime transports and wire codec, validators, `defineTheme`, scheduler and calendar math, class
   recipes (`Button.styles.ts`) and motion presets (data). The other **38k lines in 245 files** are React-coupled UI.
   Extract the first group as framework-free packages now, before weft exists. They serve React and weft unchanged.
2. **The React coupling is shallow in kind and wide in count.** Of ~710 React-specific sites, ~430 (~60%) are
   mechanical in weft: `useMemo`/`useCallback` (172) → `derived` or nothing, `useState` (137) → `state`, `useRef`
   (65) → `ref={el}`, `forwardRef` (58) deleted. The rest need judgment: 167 effects, 76 custom hooks, 20 `cloneElement`/`Children` uses, and 44 framer-motion
   files. **zustand (2 files) and next-themes (3 files) are trivial.**
3. **Port strategy: headless core plus skin, produced by codemod and then a manual pass** (options 2+4).
   - Behaviour moves into `@weft/ui-core`, using native elements first and Zag for the hard widgets.
   - The Agorix look becomes `@weft/ui`, which keeps Agorix's component and prop names.
   - **No React compat layer.** It would bring back the ~58 KB gz React floor that v3 measured.
4. **Motion:** compile Agorix's preset data to CSS transitions plus WAAPI, behind a `<Presence>` primitive and a ~1 KB
   spring-to-`linear()` helper. No framer-motion; the vanilla `motion` package is an optional adapter only.
5. **Layering makes the three goals real by contract, not by docs.** Every skin sits on three public contracts:
   CSS variables, `data-*` state attributes, and part names. Swapping the design is CSS. Swapping the kit means
   replacing one layer. Going custom means installing nothing above `weft`. `create-weft --ui agorix|headless|none`.
6. **Distribution is broken today:** 4 consumers hold **3 different `dist/index.js` builds**, all labelled `0.2.0`;
   Velatis carries hand patches to built JS; the source worktree is dirty (last commit 2026-06-20). Fix: an `agorix` monorepo with changesets and real npm versions, a canary dist-tag, and a one-shot reconciliation
   of the Velatis patches. Then delete every `vendor/` copy and every `sync-agorix-ui.sh`.
7. **Sequencing:** distribution and extraction start now, in parallel with Phase 1. Agorix tier 1 (~20 components)
   moves **ahead of Surfaces** as a new Phase 2, "UI", whose exit check is the v3 shop app on weft + Agorix. Velatis
   follows Start. D-checks stay with Design.

---

## 1. Coupling, measured

Totals: **367 files, 52.5k lines**. That includes 30 test files (3.4k lines) and 1.15k lines of `tokens.css`.
There are 209 `.tsx` files, ~241 exported components, 341 export lines in `index.ts`, and 5 `"use client"` files.

| Directory | files | lines | React-importing | effect¹ | useState | memo/cb | useRef | forwardRef | framer | free files / lines² |
|---|---|---|---|---|---|---|---|---|---|---|
| components/data (table, lists, calendars) | 40 | 5.9k | 28 | 12 | 13 | 52 | 6 | 0 | 6 | 4 / 278 |
| realtime | 25 | 5.3k | 12 | 25 | 4 | 2 | 22 | 0 | 0 | 13 / 2.6k |
| data (contract, adapters, hooks) | 44 | 5.1k | 6 | 8 | 9 | 17 | 4 | 0 | 0 | **38 / 4.2k** |
| components/inputs | 27 | 3.5k | 27 | 7 | 27 | 12 | 3 | **22** | 0 | 0 |
| components/nav | 12 | 3.0k | 12 | 11 | 8 | 4 | 0 | 3 | 4 | 0 |
| components/meet (LiveKit) | 17 | 2.8k | 13 | 8 | 5 | 1 | 2 | 11 | 0 | 4 / 323 |
| components/pickers | 9 | 2.7k | 9 | 6 | 18 | 23 | 0 | 0 | 1 | 0 |
| components/overlays | 17 | 2.7k | 15 | 17 | 7 | 10 | 6 | 0 | **10** | 2 / 125 |
| components/display | 24 | 2.5k | 24 | 6 | 10 | 4 | 1 | 4 | 3 | 0 |
| components/layout | 18 | 1.8k | 17 | 2 | 9 | 11 | 1 | 9 | 1 | 0 |
| multiplayer | 8 | 1.8k | 7 | **18** | 1 | 6 | 5 | 0 | 0 | 1 / 45 |
| theme | 8 | 1.6k | 3 | 1 | 1 | 0 | 0 | 0 | 0 | 1 / 189 (+1.15k CSS) |
| components/charts | 7 | 1.5k | 6 | 1 | 1 | 5 | 0 | 0 | 6 | 1 / 12 |
| components/feedback | 14 | 1.5k | 10 | 9 | 8 | 3 | 2 | 2 | 2 | 1 / 68 |
| hooks (23 custom hooks) | 23 | 1.2k | 21 | 20 | 7 | 9 | 7 | 0 | 0 | 2 / 28 |
| marketing, carousel, buttons, forms, icons | 27 | 3.7k | 26 | 10 | 8 | 4 | 1 | 7 | 2 | 1 / 48 |
| motion, parallax, validation, lib, root | 17 | 2.7k | 9 | 6 | 1 | 9 | 5 | 0 | 9 | 6 / 957 |
| **Total (non-test)** | 337 | 49.1k | **245** | **167** | **137** | **172** | **65** | **58** | **44** | **74 / 8.9k** |

¹ `useEffect` + `useLayoutEffect`. ² Free means a `.ts` file with no import of react, react-dom, framer-motion, zustand
or next-themes.

**Effects, classified by body** (a heuristic over the 153 that parsed):

| Kind | Count | weft form |
|---|---|---|
| DOM listener or observer | 56 | `onMount` + `onCleanup`, or `on*` attributes |
| Timer / rAF | 32 | `watch` with cleanup, or the shared surface clock |
| **State sync (`setX` inside an effect)** | **28** | `derived` / `state.linked`. These are the W004 cases, and the risky part of a port |
| Subscriptions | 5 | `watch` with cleanup, or weft-side bindings from 03 |
| Imperative focus/scroll | 2 | handler + `flush()` |
| Other | 30 | case by case |

**The rest of the React surface:**

- **Context:** 10 `createContext` (Menu, Accordion, Toast, Sidebar, NavList, MotionConfig, Parallax, Multiplayer,
  SyncedDom, FloatingBorderIcon). Each maps 1:1 onto weft `context<T>()`.
- **Portals:** 7 files (Modal, AlertDialog, Drawer, SignGateFlow, Toast, Select, FloatingPortal). Native top layer
  (`<dialog>`, `popover`) removes most of them, and a `<Portal>` primitive covers the rest.
- **Polymorphism:** 24 `as`/`asChild`/`ElementType` sites, 15 of them in layout. There are also 20
  `cloneElement`/`Children.*` uses, in Menu, Toolbar, ButtonGroup, DynamicForm and SkeletonScope. These **do not
  survive run-once components**, because children are resolved once and are not element descriptions. Replace them
  with prop getters and a context.
- **framer-motion:** 44 files. 91 `motion.div`, 40 `motion.span` and 79 `AnimatePresence` (presence dominates);
  58 motion-value hooks (`useTransform`/`useSpring`/`useMotionValue`) in parallax, CountUp and charts; 6 `useScroll`,
  6 `useInView`; **0 layout/`layoutId` animations**, which would be the hard part to replace.
- **zustand:** 2 files, both in vanilla `createStore` (`realtime/createRealtimeStore.ts`, `createRealtimeEvent.ts`).
  They are already almost framework-free.
- **next-themes:** 3 files (`ThemeProvider`, `ThemeToggle`, `Logo`).

**Already framework-free, ready to extract:** `data/contract/*`, `defineResource`, `handlers/*`; 9 DB adapters
(Drizzle, Prisma, Kysely, SQL, Mongo, Firestore, DynamoDB, REST, in-memory); `data/realtime/*` watchers and
`data/scheduler/*`; `realtime/*` (6 transports, `wireCodec`, auto/hybrid adapters, `createRealtimeKit`,
`transportIntent`); `validators.ts`; `defineTheme.ts` + `tokens.css`; calendar `timeMath`/`layoutBlocks`/
`slotGrouping`; 6 `*.styles.ts` class recipes; `motion/presets.ts` + `variants.ts` (520 lines of keyframe data).

**Not yet separated:** chart math. `buildPathFor` and `buildDonutSegments` live inside the `.tsx` files and should
move to a framework-free `@agorix/charts-core` during the port.

**The coupling that isn't React: styling.** The skin is inline in TSX: 1,550 `className=` attributes, 486 `cn()`
calls and **~2,500 Tailwind arbitrary-value classes** (`x-[...]`, regex count). That inline skin, not the hooks, is what makes "change the design" hard today. Button is the counter-example: it emits
semantic classes (`btn btn-md btn-tone-gold`) from `Button.styles.ts`. That pattern is the target for every component.

---

## 2. Port strategy options

| Option | Effort (est.) | Risk | Output quality | Agent-friendliness | Verdict |
|---|---|---|---|---|---|
| **1. Hand port to weft TSX** | High. ~38k lines rewritten by hand or agent; tier 1 ≈ 2–3 weeks, everything ≈ 3 months | Medium–high. React habits carry over silently (v3: a `{...p}` spread cost 300× DOM work). Behaviour and style stay entangled | Good per component, uneven across 241 | Medium. Familiar, but each file mixes a11y logic with 2.5k arbitrary classes | **Not alone.** It reproduces the entanglement |
| **2. Headless core + thin weft skin** | Medium–high up front. Tier 1 ≈ 3–4 weeks, then each component gets cheaper | Low–medium. Behaviour is tested once, and skins can't break a11y | **Best.** One behaviour implementation, any number of skins | **Best.** Agents edit skins (markup + classes) and never touch focus or ARIA logic. The MCP catalog can list behaviours and skins separately | **Yes: the target architecture** |
| **3. Compat layer (React inside weft)** | Low to start | High | Poor | Poor | **No.** It ships React's runtime (the 68 vs 10 KB gz gap in v3), keeps two reactivity models and two schedulers, and hooks re-run inside a run-once host. W-codes can't see inside it, so it is the silent-degradation case PLAN §2 rule 2 exists to prevent |
| **4. Codemods + manual pass** | Low for the mechanical ~60%; the other ~40% is the same as option 1 | Medium. Codemod output *compiles* but can still be identity-wrong | As good as the manual pass and its gates | Good. Diffs are small and reviewable | **Yes, as the production method** for option 2 |

**Recommendation: 2 built with 4.** The codemod is a weft-compiler-aware transform (ast-grep rules or an Oxc pass in
the `weft-compiler` crate, which already parses TSX):

- **Mechanical rewrites** (safe autofixes, the same transforms as W020–W029): `useState` → `state`, `useMemo` →
  `derived`, `useCallback` → plain function, `useRef` → `let el` + `ref={el}`, `forwardRef` unwrapped,
  `createContext`/`useContext` → `context`, text-input `onChange` → `onInput` (W042), imports swapped.
- **Flagged, not rewritten:** every effect (a `// PORT:` comment carrying its §1 class), `cloneElement`/`Children`,
  motion values, and spreads into keyed lists (the v3 identity bug).
- **Then:** move behaviour into `ui-core` and inline classes into recipes by hand. **A component is "ported" only when**
  it passes `weft check` with no W-codes, its original vitest suite is translated to `weft/test` role queries, and
  it has a `toTouchAtMost` budget for its main interaction.

**Behaviour sources for `@weft/ui-core`:**
- **Native first** (PLAN §6): `<dialog>`, `popover`, form controls.
- **Not** Agorix's own focus/dismiss/floating hooks: 02 §5 found none handles layering, touch, RTL or typeahead,
  so Zag and the native top layer replace them. Only visual measurement (`useSlidingIndicator`, sweeps) ports.
- **Zag.js** (`@zag-js/core` 1.47.0) through the ~200-line `@weft/zag` binding from [research 03 §3.2](../03-design-language.md),
  for the widgets 02 §5 lists: menu, select, combobox, tabs, tooltip, toast, date picker, carousel.

That pulls the Zag adapter forward from PLAN §10's "out of v0" list, but only for these widgets.

### Motion: replacing framer-motion

Three candidates: vanilla `motion` (14.7.1, the merged Motion One/framer line; a few KB **(unverified)**, with its own
scheduler, so optional adapter only); **CSS transitions + WAAPI** (`el.animate`, ~1–2 KB of glue: the default, since
the presets are already data); and pure CSS, which already covers Agorix's hover/press sweeps.

**Plan: `@weft/ui-core/motion`.**

- **Enter/exit.** `<Presence when={open.value} motion="modal">` delays node removal until `animation.finished` resolves.
  This is the one runtime hook framer's `AnimatePresence` gave Agorix, and it covers 79 sites.
- **Native top-layer elements** use `@starting-style` and `transition-behavior: allow-discrete` instead **(check
  Baseline before relying on them)**.
- **Presets stay data.** `presets.ts` ports unchanged: `initial`/`animate`/`exit` become WAAPI keyframes.
- **Springs** are solved once into a CSS `linear()` easing curve, which is Baseline.
- **Motion values** (`useSpring`/`useTransform`) become a `state` box driven by the shared `clock` from surfaces (PLAN §5).
  Parallax and TiltCard become small surfaces or `watch`-driven style writes.
- **Global controls:** `MotionConfig` becomes a `context`, and `prefers-reduced-motion` is honoured by default.

### State and theme

- **zustand → weft `state`.** The realtime store keeps a **framework-neutral interface**, `{ get, set, subscribe }`,
  in `@agorix/realtime`, implemented without any library. `@agorix/react` binds it with `useSyncExternalStore`.
  weft binds it as a `state` box (`.set(draft)` for `history` appends); 03 decides whether weft keeps this store
  or replaces it with its own channel state.
- **next-themes → `weft/ds` theme.** An inline no-flash script sets `data-theme` and `color-scheme` before paint
  (needs Start's SSR), a `state` box holds the mode, and `light-dark()` does the rest. Token mapping belongs to 01.

---

## 3. Layering

```
 app code ──────────────────────────────────────────────────────────────────────────────────────
   │ picks 0..1 skin per component; may mix
   ▼
 ┌─ SKINS (markup + classes only; no focus/ARIA/keyboard logic) ─────────────────────────────┐
 │ @weft/ui                │ `weft add <name>` copies          │ your own kit                 │
 │ Agorix skin (npm)       │ (registry: agorix | plain | tw)   │ (Tailwind, CSS modules, …)   │
 └─────────────┬───────────┴──────────────┬────────────────────┴──────────────┬──────────────┘
               ▼                          ▼                                   ▼
 ┌─ @weft/ui-core  (headless, weft-only) ─────────────────────────────────────────────────────┐
 │ createDialog/Tabs/Switch/Select…  → live prop getters + data-state/data-part attributes    │
 │ /motion (Presence, presets→WAAPI)  on @weft/zag machines · native top layer · portal  │
 └─────────────┬──────────────────────────────────────────────────────────────────────────────┘
               ▼                              ▲ (optional, per 03) weft/start query/crud, @weft/multiplayer,
 weft  ·  weft/ds (tokens → --weft-* vars, Stack/Row/Grid…)      @weft/db-*, @weft/realtime-* → Resource/State boxes
 ══════════════════ framework line: nothing below imports weft or React ═══════════════════════
 @agorix/tokens      tokens.css · defineTheme · *.styles recipes · motion preset data
 @agorix/data        contract · defineResource · handlers · 9 adapters · watchers   (transitional, see 03)
 @agorix/realtime    transports · wireCodec · auto/hybrid adapters · kit · neutral store (transitional)
 @agorix/validation  validators          @agorix/charts-core  scales · paths · arcs
 ══════════════════════════════════════════════════════════════════════════════════════════════
 @agorix/react (today's kit, maintenance) sits on the same framework-free packages. @agorix/ui = alias.
```

**The three contracts every skin uses** (and the only things a different kit has to honour):
1. **CSS variables.** `--weft-*` roles from `weft/ds`, with Agorix's names aliased (01 owns the mapping).
2. **State attributes.** `data-state="open|closed|checked|on"`, `data-disabled`, `data-highlighted`,
   `data-orientation`. These are the same names Zag, Ark, Radix and Kobalte use, so their CSS and Tailwind
   `data-[state=open]:` habits carry over.
3. **Part names.** `data-part="trigger|content|backdrop|title|indicator"`, which follow Ark's anatomy.

**How each goal works:**

| Goal | Mechanism | Cost to the team |
|---|---|---|
| **Change the design** | (a) Seed or tokens, which recolours everything; 01 covers it. (b) `@weft/ui` styles live in `@layer agorix.components` and target `.agx-*` classes + `data-*`. Any later layer or Tailwind utility overrides them with no specificity fight. (c) Eject one component with `weft add button`. (d) Swap the whole skin | (a)(b) CSS only, no fork. (c) You own one file; behaviour still updates from npm |
| **Plug into other kits/styling** | Skins call `ui-core` getters, so a Tailwind skin, a CSS-modules skin and the Agorix skin share one behaviour. A team that wants **Ark/Kobalte-style** components uses `@weft/zag` directly, getting Ark's anatomy on Zag machines. A **plain HTML + Tailwind** team uses `ui-core` getters or native elements | Server and realtime pieces are untouched: they are below the framework line, and 03's weft bindings return boxes, not markup |
| **Go fully custom** | Install nothing above `weft`. Data and realtime (03) remain usable without any component | Zero kit bytes. The MCP catalog lists only the app's own components |

**npm package vs copy-the-source.**

- **Default: the npm package.** Agents can't drift from a component they can't edit (03 §1.1: customised copies get
  pulled back toward their training-data defaults), and fixes arrive with `pnpm up`.
- **Escape hatch: `weft add <name> [--style agorix|plain|tailwind]`.**
  - It copies the **skin only**, so behaviour and a11y fixes still flow from the `ui-core` dependency.
  - Registry items use shadcn's framework-neutral item JSON (files, dependencies, cssVars), per 03 §1.2.
  - Each copied file starts with `// @weft/ui button@0.4.0 sha256:…`. `weft add --diff` does a 3-way merge from that
    base, which is the upgrade story shadcn lacks.
- **No separate `@weft/ui-tailwind` package.** Tailwind is a registry *style*, plus `@weft/ui/tailwind.css` (an
  `@theme inline` mapping, consistent with the ds adapter). One component package and N style variants is less to
  version than N component packages.

**`create-weft`** (flags first, per the Better-T-Stack pattern; interactive prompt only on a TTY):

```
--ui agorix     (default) @weft/ui + ui-core, styles.css imported, AGENTS.md lists the Agorix catalog
--ui headless   ui-core only, `weft add --style plain|tailwind` enabled, AGENTS.md documents getters
--ui none       nothing above weft; weft/ds tokens optional (--ds / --no-ds)
--data / --realtime   independent of --ui (packages per 03)
```

`weft check` gets one P-code: a skin file that imports `@weft/ui-core` internals or re-implements keyboard handling
(`onKeyDown` with arrow keys on a `data-part` element) gets "use the getter".

---

## 4. Distribution: replace hand-vendoring

**What exists today:**

| Consumer | Form | `dist/index.js` hash (bytes) | Notes |
|---|---|---|---|
| medium (Velatis) | `vendor/agorix-ui` via `workspace:0.2.0` | `c01ef392…` (1,041,672) | 2 hand patches to built JS (LineChart axis labels; `aria-controls` IDREF) + `--btn-stroke-hover-text`. SOURCE.md: "drifted … in BOTH directions" |
| rr-store | `packages/agorix-ui` + `sync-agorix-ui.sh` | `9c35e260…` (1,038,366) | |
| ricochet_royale | same | `9c35e260…` | Identical script and dist to rr-store |
| fun-art | `vendor/agorix-ui-0.2.0.tgz` | `57143dfe…` (1,041,243) | |

Three builds are all called `0.2.0`. Each dist is 4.3 MB. The source worktree has 14 modified files on top of a last
commit dated 2026-06-20. The vendoring exists because Next/Turbopack won't resolve a `link:` outside the project root
(the comment in `sync-agorix-ui.sh`). A registry fixes that by design.

**Plan:**

1. **Extract** `packages/ui` into a standalone `agorix` pnpm monorepo, keeping history (`git filter-repo
   --subdirectory-filter`). Packages:
   - `@agorix/tokens`, `@agorix/data`, `@agorix/realtime`, `@agorix/validation`, `@agorix/charts-core` (framework-free; lint rule: no imports
     of react, framer-motion, zustand or weft);
   - `@agorix/react` (today's kit);
   - `@agorix/ui`, a thin alias re-exporting `@agorix/react`, `./server*` and the CSS, so existing imports keep working.

   weft's own packages (`@weft/ui-core`, `@weft/ui`) live in the weft monorepo and depend on `@agorix/tokens` and
   `@agorix/charts-core` at a pinned version. `@agorix/data`/`realtime` serve the React apps until 03's weft
   packages and `@weft/agorix-compat` replace them; `data/scheduler` goes to agorix-discord (03 §7).
2. **Reconcile once.** Rebuild from a clean commit and diff it against each of the 3 vendored builds. Land Velatis's
   patches as source commits (07-15 LineChart labels, 07-23 IDREF fix, already partly upstream per SOURCE.md, and
   the button stroke variable). Commit or drop the 14 dirty files deliberately. Release **0.3.0**, gated by the
   visual and a11y suites that 01/02 define.
3. **Release mechanics.** changesets with `@agorix/*` in one **fixed** version group (one number to report);
   provenance-signed npm publish from CI (already MIT, `publishConfig.access: public`); a `canary` dist-tag
   (`0.3.1-canary.<sha>`) on every main merge, for "try my fix in Velatis" without vendoring.
4. **Migrate consumers.** Replace vendor copies with `"@agorix/ui": "0.3.0"` (exact pin). Delete `vendor/agorix-ui`,
   `packages/agorix-ui`, the `.tgz` and both `sync-agorix-ui.sh` scripts, and add a CI grep that fails if a
   `vendor/agorix-ui*` reappears. Velatis's SOURCE.md digest discipline becomes the lockfile's integrity hash.
5. **Codemods** (`npx @agorix/codemod <transform>`, ast-grep rules, idempotent):
   - `split-imports`: `@agorix/ui/server/*` → `@agorix/data/*`, `@agorix/ui` → `@agorix/react`, run before the
     alias is deprecated;
   - one transform per breaking prop rename, shipped with the changeset that makes the change;
   - `to-weft`: the §2 mechanical rewrites plus `@agorix/react` → `@weft/ui`. Component and prop names are kept, so
     the consumer diff is mostly imports.

   What consumers actually import is small: Button, Modal(+Header/Body/Footer), Card, Badge, Tooltip, Toast,
   Segmented, Drawer, Markdown, Kbd, SearchInput, Slider, Stat, NavList and AnchorNav. Velatis also uses
   `useHydrated` (17 imports). It has no weft equivalent (client-only branches go in `onMount`), so `to-weft` flags
   each site rather than rewriting it.

**weft versioning:** `@weft/ui` and `@weft/ui-core` form a fixed group with `peerDependencies: { weft: "^x.y" }`.
Registry items carry the version they were cut from, so `weft add --diff` knows its base.

---

## 5. Recommendation

| Package | Contents | Depends on | Lives in |
|---|---|---|---|
| `@agorix/tokens` | `tokens.css`, `defineTheme`, `*.styles` recipes, motion preset data | — | agorix repo |
| `@agorix/data` | contract, `defineResource`, handlers, adapters, watchers (transitional; weft side per 03) | zod | agorix repo |
| `@agorix/realtime` | transports, codec, auto/hybrid adapters, kit, neutral store (transitional) | — | agorix repo |
| `@agorix/validation` | validators | zod | agorix repo |
| `@agorix/charts-core` | scales, line/area paths, donut segments, gauge arcs (pure functions) | — | agorix repo |
| `@agorix/react` (+ `@agorix/ui` alias) | today's React kit, maintenance-only once weft parity lands | the framework-free packages, react | agorix repo |
| `@weft/ui-core` | behaviours, prop getters, `/motion`, Portal | weft, `@weft/zag` (the ~200-line Zag binding) + `@zag-js/*` | weft repo |
| `@weft/ui` | Agorix skin, Agorix names and props, `styles.css`, `tailwind.css`, registry items | ui-core, weft/ds, @agorix/tokens | weft repo |

**The same component three ways.** The example is `Modal`, the most-imported overlay in the consumer apps.

```tsx
// 1. Default skin: Agorix names and the React kit's exact props (open, onClose, motionPreset)
import { state } from 'weft'
import { Modal, ModalHeader, ModalBody, Button } from '@weft/ui'

export function DeleteItem({ name, onConfirm }: { name: string; onConfirm: () => void }) {
  const open = state(false)
  return (
    <>
      <Button tone="danger" outline onClick={() => (open.value = true)}>Delete</Button>
      <Modal open={open.value} onClose={() => (open.value = false)} motionPreset="modal.crt-on">
        <ModalHeader>Delete {name}?</ModalHeader>
        <ModalBody><Button tone="danger" fill onClick={onConfirm}>Delete</Button></ModalBody>
      </Modal>
    </>
  )
}
```

```tsx
// 2. Headless: same behaviour (focus trap, Esc, scroll lock, aria-*, data-state, exit animation), your markup
import { state } from 'weft'
import { createDialog } from '@weft/ui-core'
import { Presence } from '@weft/ui-core/motion'

export function DeleteItem({ name, onConfirm }: { name: string; onConfirm: () => void }) {
  const open = state(false)
  const d = createDialog({ open })                     // setup runs once; getters are live
  return (
    <>
      <button {...d.trigger} class="btn-danger">Delete</button>
      <Presence when={open.value} motion="fade">
        <dialog {...d.content} class="rounded-lg p-6 data-[state=open]:shadow-xl">
          <h2 {...d.title}>Delete {name}?</h2>
          <button onClick={onConfirm}>Delete</button>
          <button {...d.close}>Cancel</button>
        </dialog>
      </Presence>
    </>
  )
}
```

```tsx
// 3. Fully custom: no kit, native <dialog> only. Nothing from @weft/ui* or @agorix/* installed.
import { state, watch } from 'weft'

export function DeleteItem({ name, onConfirm }: { name: string; onConfirm: () => void }) {
  const open = state(false)
  let el!: HTMLDialogElement
  watch(() => open.value, v => { if (v) el.showModal(); else if (el.open) el.close() })
  return (
    <>
      <button onClick={() => (open.value = true)}>Delete</button>
      <dialog ref={el} onClose={() => (open.value = false)}>
        <p>Delete {name}?</p>
        <button onClick={onConfirm}>Delete</button>
      </dialog>
    </>
  )
}
```

`@weft/ui`'s `Modal` is written exactly like form 2, with `.agx-modal` classes and Agorix's motion presets. That is
the guarantee: the default skin has no private behaviour that a custom skin can't reach.

**Agent-facing rules** (AGENTS.md and MCP `catalog`): the catalog lists behaviours (`ui-core`) and skins (`ui`) as
separate entries; `weft add` is the only way to fork a component; the §3 P-code stops behaviour being re-implemented
in a skin; D-codes (Design phase) check skins, never `ui-core`.

### Phase placement (proposed change to PLAN §9; this doc does not edit PLAN)

| When | Agorix work | Exit check |
|---|---|---|
| **Now, parallel to Phase 1** (no weft needed) | §4 steps 1–4: extract the 5 framework-free packages, reconcile, release 0.3.0, delete vendoring in all 4 apps. Move chart math into `@agorix/charts-core` | All 4 apps build from npm `0.3.0`; no `vendor/agorix-ui*` anywhere; Velatis's patched behaviour is present in source |
| **Phase 1** (core) | The codemod's mechanical rules ship as W020–W029 autofixes, so the same code serves users and the port. `toTouchAtMost` lands | The codemod converts Button, Badge and Card with zero manual edits |
| **New Phase 2: "UI"** (before Surfaces) | `ui-core` + `/motion` + `@weft/zag`. **Tier 1 skin** (~20 components): Button, Badge, Card*, Text, Stat, Kbd, Callout/Alert, Input/SearchInput/Textarea, Switch, Segmented, Tabs, Select, Tooltip, Popover, Modal*, Drawer, Toast, Spinner/Skeleton. The ds token subset that Agorix needs is pulled forward from Design. `create-weft --ui` flag (client-only) | **The v3 shop app rebuilt on weft + `@weft/ui`** passes its 23 hidden tests, price-push ≤ 1 DOM mutation, total JS within the 08 §9.3 budget plus a measured kit allowance |
| Phase 3 (Surfaces, renumbered) | Parallax, TiltCard and CountUp become surfaces on the shared clock | — |
| Phase 4 (Start, renumbered) | SSR theme script, 03's data/realtime bindings, **tier 2**: Markdown, CodeBlock, NavList, AnchorNav, Slider, QRCode, data table, forms | **A Velatis page slice on weft** via `to-weft` (03 keeps its live-session UI on React for now), with the visual diff against the React build within tolerance |
| Phase 5 (Design, renumbered) | D-checks over skins, `weft add --style tailwind`, registry `--diff` | weft/ds + Agorix vs raw Tailwind (PLAN's existing exit check) |
| Later | Tier 3: calendars/scheduler, charts, meet (LiveKit), multiplayer, marketing, carousel. `@agorix/react` frozen | — |

**Why Agorix moves ahead of Surfaces:** v3 moved the thesis to efficiency at app scale, and an app needs a kit where
a canvas demo doesn't. The real apps that would prove weft (shop, Velatis, rr-store) all use Agorix and none needs a
surface first. And `weft/ds` overlaps Agorix on tokens, so doing the token subset early prevents two vocabularies.

**Risks:**
- **Two repos.** Token changes need an agorix release first; canary tags and the fixed version group keep that cheap.
- **Behaviour parity.** The React kit and `ui-core` can diverge; run 02's a11y suite against both until
  `@agorix/react` is frozen.
- **Kit bytes vs budget.** Tier 1 must fit a measured allowance. WAAPI and native top-layer elements keep it small; a
  framer-sized dependency would blow the 08 budgets on its own.

---

## 6. Overlaps with 02 and 03, and who decides

- **Package names (02 §7).** 02 puts the components in `weft/ds` with `weft/ds/headless` and `@weft/ds-*` packs. The
  layering is the same (`@weft/ui-core` = `weft/ds/headless`, `@weft/ui` = the `weft/ds` components, `@agorix/charts-core`
  = the math under `@weft/ds-charts`). I recommend separate packages so `--ui none` installs nothing, the skin can
  release on its own cadence, and `weft/ds` tokens stay useful without Agorix. **02 decides the component set and
  behaviour engine; this doc decides packaging.**
- **Data and realtime (03 §7).** 03 owns the weft side (`weft/start` `crud()`/tags, `@weft/db-*`, `@weft/realtime-*`,
  `@weft/multiplayer`, `@weft/agorix-compat`). This doc only extracts `@agorix/data`/`realtime` so the React apps
  stop vendoring now. They freeze once 03's packages and compat bridge ship (its Phase 3c).
- **Motion.** `@weft/ui-core/motion` is only `<Presence>` plus the preset runtime overlays need. 02's `-motion` pack
  (Typewriter, ScrambleText, CountUp, …) sits on top of it.
