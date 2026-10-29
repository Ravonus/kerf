# 20 — Page metadata and OG images (design)

Research date: 2026-10-29. Status: **design, nothing built**. Depends on Phase 3 routing (PLAN §4, §9); §2's
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
can return deferred parts (Phase 3 streaming), and `meta` only sees the awaited part, as in Remix. M007 (§6) flags
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

TSX → HTML string (weft/ssr) → rasterizer → PNG.

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
  are measured in the spike (§7.3).
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

| Code | Severity | Rule |
|---|---|---|
| M001 | error | Relative `og:image`/canonical and no `site.url` |
| M002 | error | Param route with an `auto` image on a static-only preset and no `prerender` |
| M003 | warning | No description after merging |
| M004 | warning | Title over 60 characters or description over 160 |
| M005 | error | `.og.tsx` uses a style or element the card renderer doesn't support |
| M006 | error | `meta` reads a box or calls a hook (metadata is plain data) |
| M007 | error | `meta` reads a deferred (streamed) field of the loader's data |

## 7. Order of work

1. **Now (no router needed):** `site` config, the merge and tag writer as a pure function
   (`metaTags(merged) → string`), and `renderToString` options to put it in `<head>`. Tests: snapshot of the tags,
   and an HTML-only fetch (no JS) of a rendered page that sees every tag.
2. **With Phase 3 routing:** route `meta`, layout merge, loader data, 404/error metadata, client navigation updates.
3. **OG spike:** Takumi (native and wasm) against Satori + resvg, in all three modes on Node, Vercel and Netlify.
   Measure cold start, function size and render time for the default card and a card with an avatar. Pass: under
   300 ms warm render, inside each platform's function size limit. Pick the renderer from the numbers.
4. **Diagnostics** M001–M007 and `weft routes --meta`.

## 8. Open questions

- Takumi or Satori? Decided by the §7.3 spike; Takumi is the first candidate (§4.2).
- Should `meta` see the request (cookies, locale)? Locale yes (hreflang, `og:locale`); cookies no, so pages stay
  cacheable and crawlers see the public version.
- `og:image` for authenticated pages: generate nothing by default (a crawler can't load them anyway)?

## Sources

- Unhead, "Server-Side Streaming SEO in 2026: A Cross-Framework Study" (2026-03-05): https://unhead.unjs.io/learn/research/streaming-head-performance
- Next.js, metadata and OG images (streaming metadata, `htmlLimitedBots`): https://nextjs.org/docs/app/getting-started/metadata-and-og-images
- Next.js `ImageResponse` and Vercel OG image generation (500 KB bundle limit): https://nextjs.org/docs/app/api-reference/functions/image-response · https://vercel.com/docs/og-image-generation
- TanStack Router, document head management: https://tanstack.com/router/latest/docs/framework/solid/guide/document-head-management
- Nuxt OG Image, Takumi renderer: https://nuxtseo.com/docs/og-image/renderers/takumi
- Takumi: https://github.com/kane50613/takumi
- Social crawlers and JS (secondary; no platform documents it): https://dev.to/eatyou_eatyou_d79d27e5622/debugging-open-graph-tags-why-your-link-previews-look-wrong-7jb
