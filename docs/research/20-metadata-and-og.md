# 20 — Page metadata and OG images (design)

Research date: 2026-10-29. Status: **built** (§7, §10), **§7.3 spike done** (§9). Depends on Phase 3 routing (PLAN §4, §9); §2's
defaults and the `<head>` writer can land before it. Statements about other frameworks are from their docs as I
know them and marked **(unverified)** where a version or detail matters.

**The task.** Every page gets correct `<title>`, description, canonical and Open Graph / Twitter tags without the
app author writing boilerplate, including routes with params (`/users/:id`). Share cards (`og:image`) are generated
from TSX: at build time for static routes, on demand for dynamic ones, locally in dev and on serverless/edge hosts
(Vercel, Netlify, Workers) in production.

---

## 1. The rule: metadata is static HTML, resolved before the page streams

Link-preview crawlers (Facebook, X, LinkedIn, Slack, Discord, iMessage) fetch the URL and read the first HTML
response. They don't run JavaScript. No platform documents this, but every source agrees, and frameworks that
streamed or patched the head broke real previews (§1.1). Googlebot renders JS in a second, later wave, and a
`noindex` or wrong title in the first-wave HTML can be acted on before the JS runs. So:

1. **Every tag is in the server's first response**, complete. Nothing a crawler needs is set by the client.
2. **Metadata is not reactive.** It is a plain object computed once per request. No boxes, no effects.
3. **It is resolved before the body.** With streaming SSR (Phase 3) `<head>` is flushed first, so metadata can't
   come from components rendered later in the tree. It comes from the route, awaited before the first byte.
4. **One place per route.** Metadata lives with the route definition, not in components. An agent looks in one
   file, and `weft check` can see every route's metadata.

What this rules out: a `<Head>`/`useHead` that any component can call during render (Solid Meta, Nuxt `useHead`,
React 19 hoisted `<title>`). Those work for crawlers only when the whole tree renders before the head is flushed,
which streaming gives up, and they make "what are this page's tags" a question about the render, not the code.

On the client, navigation after load updates `document.title` and replaces the managed tags from the next route's
metadata. That's for the tab title and history, not for crawlers, and it is the same object the server rendered.

### 1.1 How others do it, and where it broke

From Unhead's cross-framework study (2026-03-05) unless marked:

| Framework | Head with streaming | What broke |
|---|---|---|
| Next.js 15–16 | `generateMetadata` is route-level. Since 15 it streams for users (late tags injected by script) and blocks only for user agents on the `htmlLimitedBots` list (Twitterbot, Slackbot, Bingbot… per Next's docs) | Upgrading to 15 broke Slack/X/Facebook previews for apps whose crawlers weren't on the list |
| Nuxt 4 | Buffers the whole response, so the head is always complete | Nothing, but no streaming |
| SvelteKit | Head flushed first | `<svelte:head>` fed by streamed data was missing in the HTML; Search Console showed missing titles |
| Solid Start | Blocks by default; once streaming starts `@solidjs/meta` can't change the head | — |
| Remix / React Router 7 | `meta()` is synchronous, sees only awaited loader data | Deferred data can't reach `<title>` |
| Astro | Frontmatter resolves head data before streaming; islands can't set head tags | Island head changes failed silently |
| TanStack Router | Per-route `head()` returning `meta`/`links`; nested routes dedupe by name/property, deepest wins; `<HeadContent />` renders it ([docs](https://tanstack.com/router/latest/docs/framework/solid/guide/document-head-management)) | — |

The frameworks that never broke previews (Nuxt, Remix, Astro, Qwik) all resolve head data before the first byte.
The ones that broke let it arrive later. weft takes the Remix/Astro shape (route-level, awaited, plain data) and
skips Next's user-agent switch: one code path, so what a developer sees in View Source is what a crawler gets.

**The cost** is time to first byte: the head waits for the data `meta` reads. Keep that data small. A route's `load`
can return deferred parts (Phase 3 streaming), and `meta` only sees the awaited part, as in Remix. H007 (§6) flags
`meta` reading a deferred field.

## 2. Defaults: the app's config

```ts
// weft.config.ts
export default defineConfig({
  site: {
    name: 'Acme',
    url: 'https://acme.dev',          // required for absolute URLs; `weft check` errors on a relative og:image without it
    title: '%s · Acme',               // template; a route's title fills %s
    description: 'Tools for builders.',
    locale: 'en_US',
    image: 'auto',                    // 'auto' = generated card (§4), or a path/URL
    twitter: { card: 'summary_large_image', site: '@acme' },
  },
})
```

With only this, every page renders:

```html
<title>Acme</title>
<meta name="description" content="Tools for builders.">
<link rel="canonical" href="https://acme.dev/pricing">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Acme">
<meta property="og:title" content="Acme">
<meta property="og:description" content="Tools for builders.">
<meta property="og:url" content="https://acme.dev/pricing">
<meta property="og:image" content="https://acme.dev/_weft/og/pricing.png?v=3f2a9c">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
```

Derived, never written by hand: canonical and `og:url` (site URL + path, query stripped unless the route keeps
named params), `og:title`/`og:description` (from title/description), `twitter:*` (from `og:*`), image width and
height, and the `?v=` hash (§4.3).

## 3. Route metadata, including params

A route exports `meta`. It gets the params and the route loader's data, so `/users/42` gets "Ada Lovelace" without
a second fetch:

```tsx
// routes/users/[id].tsx
export const load = query({ input: z.object({ id: z.string() }), run: ({ input, ctx }) => ctx.db.user(input.id) })

export const meta: Meta<typeof load> = ({ params, data }) => ({
  title: data.name,                          // → "Ada Lovelace · Acme"
  description: data.bio,
  og: { type: 'profile' },                   // image: inherits 'auto' → routes/users/[id].og.tsx or the default card
})

export default function User(props: RouteProps<typeof load>) { … }
```

- **Merge order:** config defaults → each layout's `meta` (outer to inner) → the route's. Later keys win; `og` and
  `twitter` merge by key. A route can set `title: { absolute: 'Home' }` to skip the template.
- **Async is fine, once.** `meta` may be async (it awaits `data`, which is already loaded). The server runs the
  loaders and `meta` before it writes anything; a thrown error renders the error route's metadata, and the status
  code is set before the first byte.
- **Not found.** If `load` returns `notFound()`, `meta` isn't called; the 404 route's metadata and status are used.
  Crawlers never see a 200 page with an empty title.
- **Types.** `Meta<typeof load>` types `data`; `params` is typed from the file path. Unknown keys are type errors.
- **Escape hatch:** `meta.extra: [{ name, content } | { property, content } | { rel, href }]` for tags weft
  doesn't model (`theme-color`, `alternate` hreflang, verification tags). Still static, still route-level.
- **No metadata in components.** A component can't add head tags. The one exception is `<title>` text for client-only
  apps without routing, which is a document title, not share metadata.

### Writing the head

The server writes the merged object as tags at the top of `<head>`, each marked `data-wm` so the client knows which
tags it manages. They aren't hydrated (there's nothing reactive to claim); on client navigation the router removes
`[data-wm]` tags and writes the next route's. The client part is a tag writer of a few hundred bytes, loaded only
by apps that use the router.

## 4. OG images

### 4.1 Authoring

```tsx
// routes/users/[id].og.tsx: same params and data as the route
export default function Card({ data, site }: OgProps<typeof load>) {
  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', background: '#0b0b0f', color: 'white', padding: 64 }}>
      <img src={data.avatar} width={160} height={160} style={{ borderRadius: 80 }} />
      <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 48 }}>
        <h1 style={{ fontSize: 72 }}>{data.name}</h1>
        <p style={{ fontSize: 32, opacity: 0.7 }}>{site.name}</p>
      </div>
    </div>
  )
}
export const size = { width: 1200, height: 630 }   // default
export const fonts = ['Inter:400,700']             // bundled at build; no network fetch at render time
```

Without a `.og.tsx`, `image: 'auto'` uses a default card: title, description and site name on the app's theme
tokens (warp's, when present). A route can set `og.image` to a path or URL instead and nothing is generated.

The card is ordinary weft TSX compiled with `generate: 'ssr'`: no hooks, no effects, no boxes. It renders to a
string once. The supported style subset is flexbox, text, images, borders, radius, gradients and box shadows; the
compiler reports anything else in a `.og.tsx` file (a new diagnostic, §6) instead of rendering it wrong.

### 4.2 Rendering pipeline

TSX → HTML string (@weft-js/core/ssr) → rasterizer → PNG.

Two rasterizers are worth measuring:

| | **Takumi** (recommended to try first) | **Satori + resvg** (the incumbent) |
|---|---|---|
| What | Rust; lays out and rasterizes straight to PNG/JPEG/WebP, no SVG step. Layout is a port of Blink's block, inline, flex, grid and table; HarfRust shaping | JS; React element tree → Yoga flexbox → SVG, then resvg → PNG |
| Input | **HTML or JSX** → its node tree. weft's SSR output is already HTML, so no adapter | React element objects; weft would convert its output to that shape |
| Runtimes | `@takumi-rs/core` native (Node, Bun; macOS, Linux glibc/musl, Windows, x64/arm64), `@takumi-rs/wasm` (Workers, Vercel/Netlify edge), `takumi` crate for Rust servers | Pure JS + `resvg-wasm` everywhere; `@vercel/og` packages both |
| CSS | Flex, grid, gradients, shadows, transforms, filters, masks, RTL, COLR emoji (per Nuxt OG Image's docs) | Flex only, a subset of CSS |
| Speed | 2–10× Satori, per Takumi's own benchmarks **(unverified)** | Baseline |
| Used by | Nuxt OG Image v6's recommended renderer | `@vercel/og` / Next `ImageResponse` |
| License | MIT or Apache-2.0 | MPL-2.0 (Satori) **(unverified)** |
| Limits | No SVG output; wasm size not published | `ImageResponse` bundle (JSX, CSS, fonts, images) capped at 500 KB on Vercel |

Takumi fits weft better on three counts: it takes the HTML weft already produces, it's Rust (the same `weft/rust`
story as the compiler, and the crate can run inside a Rust server), and it isn't tied to React's element shape.
Satori is the fallback if Takumi's wasm build is too large or slow for an edge function. Either way the renderer
is server-only and never in a client bundle, and it sits behind one internal function
(`renderCard(html, size, fonts) → PNG`), so swapping it doesn't touch apps.
- **Fonts:** listed in `fonts`, resolved at build and shipped with the server bundle (or the static output). A
  render never fetches fonts.
- **Images inside a card** (`<img src>`): fetched at render with a timeout; a failed fetch renders the card without
  it rather than failing the request.

### 4.3 Where it runs: one URL scheme, three modes

Every generated image has the URL `/_weft/og/<route path>.png?v=<hash>`, where `<hash>` covers the card module's
build hash, the metadata the card reads and the size. The page's `og:image` always points at the current hash, so a
renamed user gets a new image URL and crawlers' caches can't serve the old one.

| Mode | When | What happens |
|---|---|---|
| **Build** | Routes with no params, and param routes that export `prerender` (a list of params) | `weft build` renders the PNGs into the static output. No function at runtime. |
| **On demand** | Every other param route (`/users/:id`) | The server route renders on the first request and responds with `Cache-Control: public, max-age=31536000, immutable` (the URL is content-addressed). |
| **Dev** | `weft dev` | The same route, rendered locally on the dev server; no cache headers; edits to `.og.tsx` show on reload. `weft open --og /users/42` opens the card next to its tags. |

Hosting comes from the Nitro preset the app already picks (PLAN §4.1):

- **Node, Bun, Deno servers:** the route runs in the server. A small LRU on disk keyed by the URL avoids re-rendering
  behind a CDN that ignores `immutable`.
- **Vercel / Netlify / Cloudflare:** the route is deployed as a function (edge where the preset supports it, with
  `resvg-wasm`), and the platform CDN caches the response by URL. Build-mode images are static files on the CDN.
  Vercel caps an `ImageResponse` bundle at 500 KB including fonts; other platforms' limits and Takumi's wasm size
  are measured in the spike (§9.3).
- **Static export (no server):** only build mode. `weft check` errors on a param route with `image: 'auto'` that
  has no `prerender`, since there's nowhere to render it.

The on-demand route only renders for params the route's own `load` accepts: it runs `load` with the URL's params,
so `/_weft/og/users/<anything>.png` can't be used to render arbitrary text, and a `notFound()` returns 404.

## 5. Agent surface

- **`weft check`** (new M-codes, §6) checks every route statically and, in dev, every rendered page: missing
  description, title over 60 chars or description over 160 (warnings), relative image URL without `site.url`, a
  param route with an `auto` image and a static preset but no `prerender`, a `.og.tsx` using unsupported styles.
- **`weft routes --meta`** prints each route's merged metadata as JSON, with `<param>` placeholders, so an agent
  can review every page's tags without starting a browser.
- **`.weft/contract.json`** gains each route's metadata shape and image mode.

## 6. Proposed diagnostics

Renumbered 2026-10-29 from M001–M008 to **H001–H008** (H for head): M001–M016 belong to media (research 15). Where
each one is reported now is in research 25 §8.

| Code | Severity | Rule |
|---|---|---|
| H001 | error | Relative `og:image`/canonical and no `site.url` |
| H002 | error | Param route with an `auto` image on a static-only preset and no `prerender` |
| H003 | warning | No description after merging |
| H004 | warning | Title over 60 characters or description over 160 |
| H005 | error | `.og.tsx` uses a style or element the card renderer doesn't support |
| H006 | error | `meta` reads a box or calls a hook (metadata is plain data) |
| H007 | error | `meta` reads a deferred (streamed) field of the loader's data |
| H008 | warning | A card's `<img>` didn't load (timeout, HTTP error, not an image, too large, host not allowed); the card rendered without it (§9.8) |

## 7. Order of work

1. **Now (no router needed):** `site` config, the merge and tag writer as a pure function
   (`metaTags(merged) → string`), and `renderToString` options to put it in `<head>`. Tests: snapshot of the tags,
   and an HTML-only fetch (no JS) of a rendered page that sees every tag.
   **Built (2026-10-29).** `site` in weft.config.ts (`packages/cli/src/config.d.ts`, Zod schema in `load-config.mjs`:
   absolute http(s) `url`, `title` must contain `%s`, `en_US`-style `locale`; P007 otherwise). `packages/weft/src/head.ts`,
   exported from `@weft-js/core/ssr`: `mergeMeta(site, ...metas)` (later wins, `og`/`twitter` by key, undefined keys don't erase,
   `title: { absolute }`, no title → `site.name`), `headTags(merged, path)` (the §2 set as data) and `metaTags` (HTML,
   every tag `data-wm`, values escaped). Canonical and `og:url` are written only with `site.url`; `image: 'auto'`
   writes no image until §4 lands; an image's width/height are written when given (`{ url, width, height, alt }`);
   `twitter:title/description` only when they differ from og. `renderToString`/`renderToStringAsync` take
   `head: { site, meta, path }`: tags go at the top of the app's `<head>` (after a leading `<meta charset>`), or the
   output is wrapped in a minimal document when the app renders no `<head>`. `@weft-js/core/head` exports `setHead(merged, path)`
   for the router: 0.64 KB br on its own (`size.mjs` row "setHead"), nothing calls it, existing bundle sizes unchanged.
   `weft check` reports H001 (relative or `auto` image, no `site.url`), H003 (no `site.description`) and H004 (default
   title over 60, template's fixed part over 40, description over 160) from `site` alone; H002/H005–H007 are in the
   catalog as reserved. Tests: `packages/weft/test/head.test.ts` (snapshot, escaping, merge order, an HTTP fetch of a
   rendered page read as plain text) and `packages/cli/test/config.test.mjs`. Not covered: hydrating a TSX-rendered
   `<head>` with the inserted tags in it (Phase 3 renders the shell).
2. **With Phase 3 routing:** route `meta`, layout merge, loader data, 404/error metadata, client navigation updates.
   **Built (2026-10-29)** in `@weft-js/start`; see research 25.
3. **OG spike:** Takumi (native and wasm) against Satori + resvg, in all three modes on Node, Vercel and Netlify.
   Measure cold start, function size and render time for the default card and a card with an avatar. Pass: under
   300 ms warm render, inside each platform's function size limit. Pick the renderer from the numbers.
4. **Diagnostics** H001–H007 and `weft routes --meta`. **Built (2026-10-29)**: H001–H008 and `weft routes --meta`
   (research 25 §7–8).

## 8. Open questions

- ~~Takumi or Satori?~~ **Decided: Takumi** (§9): native on servers and Node functions, wasm on Workers and edge.
  What's still open from the spike: whether Cloudflare Free's 10 ms CPU is enough for on-demand cards (otherwise
  prerender or the Paid plan), and whether non-hydratable SSR should stop writing hole comments (§9.5).
- Should `meta` see the request (cookies, locale)? Locale yes (hreflang, `og:locale`); cookies no, so pages stay
  cacheable and crawlers see the public version.
- `og:image` for authenticated pages: generate nothing by default (a crawler can't load them anyway)?

## 9. Spike results (§7.3, 2026-10-29)

**Verdict: Takumi.** It passes the bar everywhere that was measured (warm renders of 2–7 ms native and 10–27 ms wasm,
against 300 ms), and the wasm build fits every platform except Vercel's Hobby edge limit. Satori + resvg passes on Node
and Bun with resvg-js. With resvg-wasm, the build edge hosts need, it misses the bar on the avatar card (360–540 ms),
and satori ≥ 0.33 doesn't run in workerd at all. The code, the PNGs and the raw numbers are in
[`spikes/og/`](../../spikes/og/) (`results/results.json`, `out/*.png`).

### 9.1 Setup

- **Cards** are weft TSX ([`spikes/og/cards/`](../../spikes/og/cards/)), compiled by weft's native compiler with
  `generate: 'ssr'` and `hydratable: false`, and rendered by `renderToString` (`packages/weft/src/ssr.ts`). The same
  HTML goes to every renderer. *Default* is title, description and site name on a gradient. *Avatar* has a
  320×320 JPEG (45 KB), Inter 400/700 and Lora 400 italic, a radial gradient, radius, border and a box shadow.
  *Stress* (quality only) is CSS outside §4.1's subset. Output is a 1200×630 PNG.
- **Fonts** are the latin subsets from `@fontsource` 5.3.0. Each renderer gets the smallest format it reads: WOFF2
  for Takumi (71 KB for three faces; the wasm build rejects WOFF) and WOFF for Satori (90 KB; Satori can't read WOFF2).
  The avatar is passed as bytes, so no timing includes a fetch.
- **Versions:** `@takumi-rs/core`/`wasm`/`helpers` 2.16.2, satori 0.57.2 (0.32.0 in workerd, §9.4), `@resvg/resvg-js`
  and `resvg-wasm` 2.6.2. Runtimes: Node 22.22.1, Bun 1.3.14, workerd through `wrangler dev` 4.150.0 (local only).
  Machine: M4 Max, with a 1-minute load of 6–10 during the runs.
- **Cold** is measured in a fresh process, from the bench module's first line (after the runtime has booted) to the
  first default PNG: importing the renderer, instantiating wasm, registering fonts and the first render. The figure is
  the median of 5 processes.
- **Warm** is 100 sequential renders per card in one process, reported as p50/p95. Each render includes weft's SSR
  render and the HTML → tree step, as a request would.
- **In workerd**, the clocks don't advance during compute, so the client times each request and subtracts the median
  `/ping` round trip (1.7 ms). There, *cold* is the first request after a fresh `wrangler dev`: isolate start, wasm
  instantiation, font registration and the first render (median of 5).

### 9.2 Render time (ms)

| Pipeline | Runtime | Cold (to first PNG) | Default p50 / p95 | Avatar p50 / p95 | < 300 ms warm |
|---|---|---|---|---|---|
| Takumi native | Node | 17 | 2.7 / 3.5 | 5.5 / 6.0 | ✓ |
| Takumi native | Bun | 15 | 2.3 / 2.6 | 5.4 / 7.0 | ✓ |
| Takumi wasm | Node | 73 | 9.9 / 10.2 | 18.1 / 26.4 | ✓ |
| Takumi wasm | Bun | 61 | 10.1 / 10.9 | 16.5 / 17.4 | ✓ |
| Takumi wasm | workerd | 66 (first request) | 11.3 / 12.2 | 19.5 / 20.5 | ✓ |
| Satori + resvg-js | Node | 127 | 15.3 / 16.3 | 95.5 / 100.3 | ✓ |
| Satori + resvg-js | Bun | 89 | 14.5 / 15.5 | 92.0 / 104.4 | ✓ |
| Satori + resvg-wasm | Node | 184 | 43.6 / 45.4 | **394.6 / 406.7** | ✗ |
| Satori + resvg-wasm | Bun | 145 | 40.0 / 41.9 | **362.3 / 377.8** | ✗ |
| Satori 0.32 + resvg-wasm | workerd | 111 (first request) | 45.8 / 47.8 | **511.6 / 541.3** | ✗ |

- **Speed-up.** Takumi is 5.7× (default) and 17× (avatar) faster than Satori + resvg-js on Node. Wasm against wasm, it
  is 4.4× and 22× faster. §4.2's "2–10×" is the right order for simple cards and an undercount for cards with images
  and shadows.
- **Where Satori's time goes** on the avatar card: Satori's layout and SVG take about 4 ms, and rasterizing takes the
  rest. The box shadow becomes an SVG Gaussian blur that costs resvg-wasm about 330 ms of its 392 ms (61 ms without
  it) and resvg-js about 70 ms of 89 ms. Takumi draws the same shadow inside its 5 ms (native) or 18 ms (wasm).
- **Image decoding** doesn't flatter Takumi's warm numbers. Takumi caches decoded images by `src`. With a new `src`
  for every render, as on an on-demand route with a different avatar per user, the avatar card stays at 5.2 ms native
  and 18.0 ms wasm (p50). With the cache off (`cacheMaxBytes: 0`) it is 6.7 ms and 17.4 ms.

### 9.3 Size, and each platform's limit

What a function ships, measured with `wrangler deploy --dry-run` (minified; it includes the fonts and the avatar):

| | Raw | gzip | Of which |
|---|---|---|---|
| Takumi wasm Worker | 4,046 KiB | 1,817 KiB | `takumi_wasm_bg.wasm` 3.98 MB / 1.71 MB gz; JS (Takumi's HTML parser, @weft-js/core/ssr, cards) 45 KB / 17 KB gz; fonts 71 KB; avatar 46 KB |
| Satori 0.32 + resvg-wasm Worker | 3,076 KiB | 1,241 KiB | resvg wasm 2.48 MB / 947 KB gz; yoga 72 KB / 29 KB gz; JS 464 KB / 152 KB gz; fonts 90 KB; avatar 46 KB |
| `@vercel/og` 1.0.3 edge build (not run, for reference) | 2.44 MB | 807 KB | ships a trimmed `resvg.wasm` (1.38 MB / 527 KB gz) and the Geist font |
| Takumi native (Node functions) | 8.2 MB (linux-x64-gnu), 6.9 MB (linux-arm64-gnu) | | `.node` binary, plus `@takumi-rs/core` 0.1 MB and `helpers` 0.2 MB |
| Satori + resvg-js native | satori 0.57.2 25.7 MB unpacked + resvg-js linux-x64 4.4 MB | | |

| Platform | Documented limit | Takumi native | Takumi wasm | Satori + resvg-wasm |
|---|---|---|---|---|
| Vercel Functions, Node/Bun (Fluid) | 250 MB uncompressed | ✓ | — | — |
| Vercel Edge runtime | gzip: 1 MB Hobby, 2 MB Pro, 4 MB Enterprise | — | ✗ Hobby, ✓ Pro (≈ 230 KB to spare), ✓ Ent | ✗ Hobby as built (1.24 MB); ✓ with `@vercel/og`'s trimmed resvg (≈ 0.82 MB) |
| Vercel `ImageResponse` | 500 KB of "your JSX, CSS, fonts, images, and any other assets" | weft's assets here: cards 10 KB + fonts 71–90 KB + avatar 46 KB ≈ 130–150 KB ✓ | ✓ | ✓ |
| Netlify Functions (Lambda) | current docs give no bundle number; the Next.js runtime page says 250 MB unzipped per handler | ✓ | — | — |
| Netlify Edge Functions | 20 MB after compression; 50 ms CPU per request | — | ✓ size; CPU fits on local numbers | ✓ size; ✗ CPU on the avatar card |
| Cloudflare Workers | 64 MiB uncompressed, no compressed limit; 1 s startup; 128 MB memory; CPU 10 ms (Free), 30 s default (Paid) | — | ✓ size; Free CPU borderline (11 ms wall on an M4 Max) | ✓ size; ✗ Free CPU |

The 500 KB `ImageResponse` limit is a `@vercel/og` rule, and `@vercel/og` alone is 807 KB gzipped, so the 500 KB
can't include the library. It doesn't bind Takumi, but it is a sensible budget for a card's own fonts and images.
Vercel now recommends Node over Edge, and Next.js 16.3 dropped `runtime = 'edge'`, so weft's Vercel preset should
deploy the OG route as a Node function with native Takumi. That also sidesteps the 1 MB Hobby limit.

### 9.4 Quality, and the CSS each one got wrong

The default and avatar cards come out practically identical from all of them (`out/default.*.png`, `out/avatar.*.png`).
Takumi native and Takumi wasm write byte-identical PNGs, as do resvg-js and resvg-wasm, so dev on native shows exactly
what the edge will serve. Takumi's PNGs are smaller: 55 KB and 211 KB against Satori's 136 KB and 354 KB.

- **Takumi: `box-sizing` defaults to `border-box`.** An `<img width=240>` with a 6 px border is 240 px wide in Takumi
  and 252 px in a browser and in satori 0.57. Takumi honours an explicit `box-sizing: content-box`. A card that sets
  `width: 100%` and padding needs `box-sizing: border-box` to look the same in both (the spike's cards set it).
- **Satori 0.57: `<li>` throws** ("g.split is not a function in CSS rule `fontFamily: inter`") and fails the whole
  card. Takumi draws the bullets.
- **Both, on the stress card:** block layout without `display: flex`, a 2×2 grid, `rotate`, `filter: blur`,
  `text-shadow`, a dashed border, a conic gradient, `opacity`, a nowrap ellipsis and `-webkit-line-clamp` all render
  the same by eye. §4.2's "Flex only" for Satori is out of date for 0.57; satori 0.32 still throws on a `<div>` with
  several children and no `display: flex`, and on an empty `children: []`.
- **Fonts:** Takumi wasm reads WOFF2 and TTF but not WOFF; Takumi native reads WOFF too. Satori reads TTF, OTF and WOFF
  but not WOFF2. weft should bundle WOFF2 (the smallest) for Takumi.

### 9.5 What weft has to do

1. **Strip comments before rasterizing, or stop emitting them.** `renderToString(…, { hydratable: false })` still
   writes `<!--[-->…<!--]-->` around holes that share a parent and `<!--,-->` between adjacent texts. Takumi's
   `fromHtml` (and satori-html) drop the text before a comment, so `Hello, <!--[-->Ada<!--]-->!` renders as `!`. The
   spike's `renderCard` strips them. The better fix is for non-hydratable SSR not to write markers at all.
2. **§4.1's example uses React-style styles** (`{ fontSize: 72 }`). weft's SSR writes object keys and values as given,
   so that becomes `fontSize:72`, which isn't CSS. weft takes `{ 'font-size': '72px' }`. Fix the example, or have H005
   flag camelCase and unitless numbers in `.og.tsx`.
3. **Takumi takes HTML through `@takumi-rs/helpers/html`'s `fromHtml`** (JS, 17 KB gz in the Worker together with
   weft's code), not through `render()` directly. No adapter is needed beyond that.
4. **Satori would need weft's own HTML → element adapter.** satori-html crashes under Bun 1.3.14 (its `ultrahtml`
   dependency) and drops the spaces around inline elements ("new <b>bold</b> and" → "newboldand"). The spike's
   [`html-to-vnode.mjs`](../../spikes/og/html-to-vnode.mjs) is about 60 lines.
5. **Satori ≥ 0.33 doesn't run in workerd.** From 0.33.0 (2026-08-20) it shapes text with harfbuzzjs. harfbuzzjs's
   Emscripten loader runs when satori's module is evaluated, reads `self.location.href` (workerd has none) and fetches
   `hb.wasm` from there. `satori/standalone` neither ships that file nor accepts it in `init()` (still true in 0.59.2).
   With a `location` shim and a `fetch` that answered `hb.wasm`, the promise still never settled. `@vercel/og` 1.0.3
   bundles satori 0.33.5, so whether it works on Vercel's edge needs a deploy to find out. The workerd row above uses
   0.32.0, the last release without harfbuzz.

Corrections to §4.2: Takumi has `renderSvg` now (the "No SVG output" limit is gone), and its wasm size is 3.98 MB, or
1.71 MB gzipped.

### 9.6 Numbers that need a real deploy

These were local only (no accounts, no deploys):

- Cold start on each platform (Lambda init for Vercel/Netlify Node functions, isolate start on Workers and Netlify Edge).
- CPU time against Cloudflare Free's 10 ms and Netlify Edge's 50 ms, on their hardware rather than an M4 Max.
- Takumi wasm's memory against the 128 MB isolate limit.
- Vercel's accounting of the Edge bundle size, and whether `@vercel/og` 1.0.3 runs on Vercel's edge with harfbuzz.
- The native `.node` binary in a real Vercel and Netlify Node function (linux-x64 glibc).

### 9.7 Recommendation

Use **Takumi** behind `renderCard(html, size, fonts) → PNG`:

- **Native `@takumi-rs/core`** in the dev server, `weft build`, Node, Bun and Deno servers, and Vercel and Netlify
  **Node** functions. This includes Vercel's default preset, so Hobby's 1 MB edge cap never applies.
- **`@takumi-rs/wasm`** where only isolates are available: Cloudflare Workers (the Paid plan for on-demand rendering;
  Free's 10 ms CPU is borderline, so prerender there), Netlify Edge, and Vercel Edge on Pro or Enterprise.
- **Fonts** in any format (WOFF2 is smallest), resolved at build; §9.8's `renderCard` normalizes them and strips SSR
  comments.
- **Don't ship Satori as a fallback.** The `renderCard` seam keeps a swap cheap if Takumi stalls.

### 9.8 renderCard: Takumi, plus what Satori did better

[`spikes/og/card/`](../../spikes/og/card/) is a production-shaped `renderCard` (about 250 lines, 8 tests in
`card.test.mjs`, all passing on Node 22). It keeps Takumi as the engine and adds what Satori, or the
`@vercel/og` wrapper around it, did better, plus §4's rules that neither renderer had:

| From | What | How |
|---|---|---|
| Satori: strict styles (`onStyleError`) | Each style declaration is checked once (cached, about 26 µs) against the renderer itself. Takumi throws on an invalid value, which would fail the whole card, and silently ignores an unknown property. The first becomes an H005 error, the second an H005 warning. Production drops the bad declaration and renders the rest; `strict` (dev, `weft build`) throws; `check(html)` reports without rendering. | Probe the property with the card's value, then with `}{`, a value no CSS grammar accepts. A property the renderer knows rejects it; one it doesn't know takes anything. No allowlist to keep in sync with Takumi. |
| Satori: reads WOFF | Takes TTF, OTF, WOFF and WOFF2 on both builds (Takumi wasm can't read WOFF). | WOFF 1.0 unpacked to SFNT with `DecompressionStream` (Node, Bun and workerd all have it). The result draws byte-for-byte what Takumi native draws from the WOFF itself. |
| Satori: browser box model | A preview page (`previewHtml`) with the same HTML, the same font bytes and the same preflight (`box-sizing: border-box` everywhere) as the PNG. In a 1200×630 browser viewport it matches the PNG by eye, stress card included. | One `PREFLIGHT` string goes into both the renderer's `css` and the page. |
| `@vercel/og`: `ImageResponse` | `cardResponse()` sets the §4.3 headers (`immutable`, or `no-store` in dev). Output is PNG, JPEG, WebP, or SVG via Takumi's `renderSvg`. | |
| §4.1, neither renderer | Remote `<img>`s are fetched with a timeout (1.5 s), a size cap (4 MB), a content-type check, no redirects and an `allow(url)` host check (https only by default: the SSRF guard for on-demand routes), and cached in a byte-capped LRU. A failed image is left out with its box kept, so the layout doesn't move, and reported as H008. | |
| §9.5.1 | SSR hole comments are removed before parsing. | |

Satori's other selling points are already in Takumi: HarfRust shaping, COLR emoji fonts, and grid and transforms.
The one thing that doesn't carry over is Satori's smaller edge bundle. Takumi's wasm is the 1.71 MB gzipped floor;
that is fine everywhere except Vercel Edge on Hobby, where the Node function is the answer anyway.

Cost, measured with `card/bench.mjs` and `worker/client.mjs card`. The p50 and p95 are warm ms; workerd's cold is the
first request after a fresh `wrangler dev`.

| | Node native | Node wasm | Bun native | Bun wasm | workerd (wasm) |
|---|---|---|---|---|---|
| Default card p50 / p95 | 2.7 / 3.1 | 10.1 / 11.6 | 2.7 / 3.2 | 10.5 / 12.5 | 12.0 / 23.5 |
| Avatar card p50 / p95 | 6.5 / 7.2 | 19.4 / 21.0 | 6.2 / 7.9 | 18.0 / 19.6 | 20.5 / 21.6 |
| Setup + first card | 41 ms | 59 ms | 32 ms | 64 ms | 80 ms cold (plain Takumi: 66) |

That is within about 1 ms of plain Takumi warm (§9.2). The workerd default p95 was taken at a load of about 10. The
avatar here is a data URI that the renderer decodes on every render, so it is about 1 ms slower than passing bytes.
The Worker is 4,070 KiB raw and 1,831 KiB gzipped, 14 KiB more than plain Takumi and still inside Vercel Pro's 2 MB.

H008 is new: **warning**, a card image failed to load (timeout, HTTP error, not an image, too large, or host not
allowed), and the card rendered without it.

## 10. Automatic metadata, enforced (2026-11-01)

What §1–§9 left to chance: `image` defaulted to nothing, so no app without `image: 'auto'` got a card; canonical and `og:url` needed `site.url`, which most apps didn't set; a page with no `meta` had the site's title; and H011–H016 didn't exist, so nothing said so.

- **Order:** `site` → what the page rendered → layouts → the route. `derive.mjs` reads the rendered shell for the `h1` and the first paragraph of prose. This doesn't break §1: the shell is rendered and settled before the first byte, so the head still comes first, and it's the same pass that a page, its navigation and its card read, so all three agree. A Boundary's streamed content isn't in the shell, so it can't change a page's tags from one request to the next. A request that doesn't otherwise render (a card, a navigation) only renders when a level left words to the page.
- **`site.image` defaults to `'auto'`.** The hash covers the head and `site.card`, plus `data` only for an `.og.tsx`, so a loader's timestamp can't change a built-in card's URL. A request with a cookie never gets `immutable`.
- **The origin** comes from config, then deploy env (a server reads it at runtime), then the request. The request's is `Host`, which an attacker can set, so production warns once. It's never used for a prerender, which would write `localhost` into a file.
- **`weft check` runs the routes** (`inspect.mjs`). Loaders run once with no boot step, so a page that needs a database answers 500 and reports H016 info. Set `check: { routes: false }` to skip it. Param routes are sampled from `prerender` and links on rendered pages, 50 at most.
- **Open:** a card is drawn with the first file of each face, so a variable font draws at its default instance unless Takumi is told otherwise; `meta.canonical` for a page whose query matters isn't built; `.og.tsx` still has no static check of its source, only a render.

## Sources

- Unhead, "Server-Side Streaming SEO in 2026: A Cross-Framework Study" (2026-03-05): https://unhead.unjs.io/learn/research/streaming-head-performance
- Next.js, metadata and OG images (streaming metadata, `htmlLimitedBots`): https://nextjs.org/docs/app/getting-started/metadata-and-og-images
- Next.js `ImageResponse` and Vercel OG image generation (500 KB bundle limit): https://nextjs.org/docs/app/api-reference/functions/image-response · https://vercel.com/docs/og-image-generation
- TanStack Router, document head management: https://tanstack.com/router/latest/docs/framework/solid/guide/document-head-management
- Nuxt OG Image, Takumi renderer: https://nuxtseo.com/docs/og-image/renderers/takumi
- Takumi: https://github.com/kane50613/takumi
- Vercel Functions limits (250 MB uncompressed): https://vercel.com/docs/functions/limitations
- Vercel Edge runtime (1/2/4 MB gzip code size; Node recommended over Edge): https://vercel.com/docs/functions/runtimes/edge
- Cloudflare Workers limits (64 MiB uncompressed, no compressed limit, 1 s startup, 128 MB, 10 ms CPU on Free): https://developers.cloudflare.com/workers/platform/limits/
- Netlify Edge Functions limits (20 MB compressed, 50 ms CPU): https://docs.netlify.com/build/edge-functions/limits/
- Netlify Functions configuration (60 s, 1–4 GB memory; no bundle limit stated): https://docs.netlify.com/build/functions/configuration/
- Netlify Next.js runtime troubleshooting (250 MB unzipped per handler): https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/legacy-runtime/troubleshooting/
- Social crawlers and JS (secondary; no platform documents it): https://dev.to/eatyou_eatyou_d79d27e5622/debugging-open-graph-tags-why-your-link-previews-look-wrong-7jb
