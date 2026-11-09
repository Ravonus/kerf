# Metadata and share images

:::learn
- How to give every page a title and a description with `meta`, and build it from `data` on a param route
- What Weft writes for you when you leave something out, and why you still shouldn't
- How the site's defaults in `site` work, and why `site.url` matters before you ship
- How share cards are drawn, and how to design your own with an `.og.tsx` file
- How `weft check` and `weft routes --meta` show what every page says about itself
:::

A page has two audiences. People read what's on it; search engines, chat apps and social sites read what's *about* it:
the `<title>`, the description, the canonical URL, the Open Graph and Twitter tags, the picture that appears when someone
pastes the link. Crawlers that build link previews don't run JavaScript, so all of that has to be in the server's first
response.

In React you'd add a head manager, remember to set the tags on every route, and then find a separate service to draw
preview images. In Weft a route exports `meta`, plain data, and the server writes the tags into the first byte. Every page
also gets a share card drawn from its own title and description, unless you design a better one.

:::demo server-meta-preview

## Set `meta` as you build the page

Writing a page includes writing what a search result says about it: a title, and one plain sentence about what the
reader gets there. Export it from the route:

```tsx
// src/routes/pricing-plans.tsx
import type { Meta } from '@weft-js/start'

export const meta: Meta = {
  title: 'Pricing',
  description: 'Three plans, billed monthly, and what each ' +
    'one includes.',
}

export default function PricingPlans() {
  return <h1>Pricing</h1>
}
```

`meta` never ships to the client: like `load`, it runs on the server. It runs once per request, after the loaders and
before the first byte, and it's plain data, not a component. That's why it can't read a box (**H006**): nothing on the
server would ever re-run it.

### On a param route, build it from `data`

A route like `/posts/[slug]` is many pages, and each should say what it is. Make `meta` a function of the loader's
`data` and the route's `params`:

```tsx
// src/routes/posts/[slug].tsx
import { notFound } from '@weft-js/start'
import type {
  LoadArgs,
  Meta,
  Prerender,
  RouteProps,
} from '@weft-js/start'

const POSTS = [
  {
    slug: 'run-once',
    title: 'Components run once',
    summary: 'Why a weft component body never runs twice, ' +
      'and what that changes.',
  },
  {
    slug: 'boxes',
    title: 'State is a box',
    summary: 'How .value lets the compiler wire each read ' +
      'straight to the page.',
  },
]

export const load = ({ params }: LoadArgs<'/posts/[slug]'>) =>
  POSTS.find(p => p.slug === params.slug) ?? notFound()

export const meta: Meta<typeof load, '/posts/[slug]'> =
  ({ data }) => ({
    title: data.title,
    description: data.summary,
    og: { type: 'article' },
  })

export const prerender: Prerender<'/posts/[slug]'> = () =>
  POSTS.map(p => ({ slug: p.slug }))

export default function Post(
  props: RouteProps<typeof load, '/posts/[slug]'>,
) {
  const { data } = props
  return (
    <article>
      <h1>{data.title}</h1>
      <p>{data.summary}</p>
    </article>
  )
}
```

`Meta<typeof load, '/posts/[slug]'>` types `data` from the loader, without the `notFound()` case: when `load` returns
`notFound()`, the 404 page renders and `meta` isn't called. `meta` can be `async` too. `prerender` lists the params
`weft build` should write as static pages; it comes back later on this page and in [SSR, islands and
hydration](/learn/ssr-and-hydration#prerendering).

:::pitfall `meta` can't wait for streamed data
A loader can return a promise in a field to stream that part of the page later ([Loading data](/learn/loading-data)).
Those fields are left out of what `meta` sees, because the tags are written before they arrive. Reading one anyway is
**H007**, and the request fails with a 500 rather than serve a page with missing tags. If the title needs it, `await` it
in `load`.
:::

### Titles, templates and more tags

- `title` fills the site's template, `site.title` (like `'%s · Acme'`). `title: { absolute: 'Acme' }` skips it, which
  suits a home page.
- `og` and `twitter` set those tags directly when they should differ from the title and description: `og.type`,
  `og.image`, `twitter.card` and so on.
- `extra` adds tags Weft doesn't model, such as `theme-color` or a verification tag:
  `extra: [{ name: 'theme-color', content: '#0b120d' }]`.
- `jsonLd` writes structured data as `application/ld+json`. Weft writes a `WebSite` on `/` when `site.name` is set, and
  nothing else unless you say: it doesn't guess what your page is.

```ts
import type { Meta } from '@weft-js/start'

export const meta: Meta = {
  title: 'Components run once',
  description: 'Why a weft component body never runs twice, ' +
    'and what that changes.',
  og: { type: 'article' },
  twitter: { creator: '@acme' },
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: 'Components run once',
  },
}
```

### Layers

A page's metadata is merged from four layers, later ones winning: `site` in `weft.config.ts`, what the page rendered,
each layout's `meta` from the outside in, and the route's own `meta`. `og` and `twitter` merge key by key, so a layout
can set `og.siteName` and a route its `og.type` without either losing the other.

A layout's `meta` is the place for what a whole section shares, such as `twitter.site` for a blog, or an `extra` tag.
Its title would be overridden by every page under it, so leave titles to routes.

## What Weft does when you leave something out

A page with no `meta`, or a `meta` that leaves out a field, still gets tags. Weft reads them from what the page
rendered:

- **Title:** the page's `<h1>`, or with none its first `<h2>` or `<h3>`, through `site.title`.
- **Description:** the first paragraph after the `<h1>` that reads as prose, inside `<main>`, skipping lists, code,
  tables, navigation and footers, cleaned and cut at a sentence by 155 characters. With none, `site.description`.
- **Canonical URL and `og:url`:** from the site's address and the page's path.
- **`twitter:card`:** `summary_large_image` whenever there's an image.

That's a safety net, not a plan. A derived description is whatever paragraph came first, which is rarely the sentence
you'd choose, and two pages with the same layout tend to end up with the same words. `weft check` reports a page with no
`meta`, or one that leaves out its title or description, as **H011**, with what it derived as a starting point for you to
rewrite.

:::pitfall Never slice raw content into a description
`description: post.body.slice(0, 155)` looks harmless until the body starts with a list or a code block, and the card
under every shared link reads `- xs.map(x = <Row`. A description that reads like code, markdown or a cut-off sentence is
**H015**. Write the sentence, or store a summary next to the content, or leave the field out and let Weft find a
paragraph.
:::

## The site's defaults

`site` in `weft.config.ts` is the bottom layer, and it holds what only the site knows:

```ts
// weft.config.ts
import { defineConfig } from '@weft-js/core/config'
import { warp } from '@weft-js/warp/plugin'

export default defineConfig({
  site: {
    name: 'Acme',
    url: 'https://acme.dev',
    title: '%s · Acme',
    description: 'Tools for builders.',
    locale: 'en_US',
    twitter: { card: 'summary_large_image', site: '@acme' },
    card: { scheme: 'light', accent: '#1f7a50' },
  },
  plugins: [warp()],
})
```

`weft check` validates these (**P007**): `url` must be an absolute `http(s)` address, `title` must contain `%s`, and
`locale` must look like `en_US`. The full list of keys is in the [config reference](/reference/config).

### `site.url`: the address everything absolute needs

Canonical URLs, `og:url` and `og:image` must be absolute, so Weft needs to know where the site lives. It looks, in
order, at `site.url`, the `WEFT_SITE_URL` environment variable, and what common hosts set (`VERCEL_PROJECT_PRODUCTION_URL`,
`VERCEL_URL`, Netlify's `URL`, `CF_PAGES_URL`, `RENDER_EXTERNAL_URL`, `RAILWAY_PUBLIC_DOMAIN`, `FLY_APP_NAME`).

With none of those, a running server uses the request's origin, which is only what its `Host` header claimed, and warns
once in production (**H001**). A prerendered page has no request at all, so its URLs stay relative, and crawlers don't
resolve relative URLs. Set `site.url` before you ship.

## Share cards

When someone pastes a link into a chat, the preview's picture is `og:image`. By default (`site.image: 'auto'`) every
page gets one: a 1200×630 PNG of its title, description, the app's name and its address, in Warp's colours and the text
plugin's fonts when the app has them. You don't draw anything to get it.

`site.card` adjusts the built-in card: `scheme: 'light'` or `'dark'` (one image goes to every feed, so a card picks
one), `accent`, the colours of each scheme, and `fonts` for its title and body. To use one fixed picture for every page,
set `site.image` to its path, like `{ url: '/og.png', width: 1200, height: 630 }`. `site.image: false` turns cards off.

Per page, `og: { image: '/launch.png' }` uses a picture of your own, and `og: { image: false }` drops the card.

### Your own card: `.og.tsx`

A file next to a route, named like the route plus `.og.tsx`, replaces that route's card. `src/routes/_default.og.tsx`
replaces every card in the app. A card is a component that gets the route's params and settled data, the merged
metadata, the site, and the title and description the built-in card would show:

```tsx
// src/routes/posts/[slug].og.tsx
import type { OgProps } from '@weft-js/start'
import type { load } from './[slug]'

export default function PostCard(
  props: OgProps<typeof load, '/posts/[slug]'>,
) {
  const { data, site } = props
  return (
    <div
      style={
        'display:flex;' +
        'flex-direction:column;' +
        'justify-content:space-between;' +
        'width:100%;' +
        'height:100%;' +
        'padding:72px;' +
        'background-color:#0b120d;' +
        'color:#f2f0e8'
      }
    >
      <p style="margin:0;font-size:28px;color:#6ee7a0">
        {site.name ?? 'Blog'}
      </p>
      <h1 style="margin:0;font-size:76px;line-height:1.05">
        {data.title}
      </h1>
      <p style="margin:0;font-size:30px;color:#b9bfb4">
        {data.summary}
      </p>
    </div>
  )
}
```

It renders once, to a string, and then to a PNG. That means no state, no effects, no event handlers: it's a picture. The
renderer supports a subset of CSS, the part that makes sense for a picture: flexbox layout, text, images, borders, radius,
gradients and shadows. A style it doesn't support is **H005**, an error in dev; in production the one bad declaration is
dropped and the rest still renders. An `<img>` that fails to load (a timeout, an HTTP error, too large) is **H008**, and the
card renders without it.

:::deepdive How cards are cached
A card's URL is `/_weft/og/…png?v=<hash>`, and the hash covers everything it draws. So a card is cached forever, and the
moment the page's title or description changes, it has a new URL and crawlers fetch the new one.

Cards of pages with no params, and of param pages listed in `prerender`, are drawn by `weft build` and served as static
files. Every other param page's card is drawn on its first request, and only for params the route's own `load` accepts,
so nobody can make the server draw cards for pages that don't exist.

That's why a static host needs `prerender`: with no server, a card that isn't drawn at build time is never drawn. A param
route with a generated card and no `prerender` on a static preset is **H002**.
:::

## Navigating between pages

The first page load gets its tags from the server. After that, client navigation fetches the next route's merged
metadata and the router replaces the tags it wrote, and the tab title, with `setHead` from `@weft-js/core/head`. You
don't call it yourself. That update is for the tab and the browser history; crawlers only ever read the server's HTML.

## See it, and fix it

`weft check` runs every route's loaders once and reports metadata for each page, from what the page really produces.
Param routes are sampled from `prerender` and from links on rendered pages. Each diagnostic says what to write:

| Code | What it says |
|---|---|
| **H001** | no `site.url` |
| **H002** | a param route's card, on a static host, with no `prerender` |
| **H003**, **H004** | no description; a title over 60 characters or a description over 160 |
| **H011** | no `meta`, or a field left out: says what was derived |
| **H012**, **H013** | two routes share a title, or a description |
| **H014** | a param route whose pages all look alike, usually a `meta` that ignores `data` |
| **H015** | a description that reads like code, markdown or a fragment |
| **H016** | a route that couldn't be checked here |

`weft routes --meta` prints a table of every page's title, description and image, and where each came from: `route`,
`layout`, `config`, `auto` or `card`. `--json` has every tag. It's the quickest way to read what your whole site says
about itself, and the `routes_meta` tool of `weft mcp` gives an agent the same table.

The route pass runs your loaders, so in a project where that's slow or needs services, `check: { routes: false }` in
`weft.config.ts` turns it off. The [meta reference](/reference/meta) has every field.

## Recap

- Export `meta` from every route as you build it: a title and one plain sentence. On a param route, compute it from
  `data` and `params`.
- `meta` is plain data, run once on the server before the first byte. It can't read a box (**H006**) or a streamed
  field (**H007**).
- Layers merge as `site`, the rendered page, layouts, then the route. Missing fields are derived from the page, and
  **H011** says so.
- Set `site.url` (or `WEFT_SITE_URL`) before you ship, so canonical URLs and card URLs are absolute.
- Every page gets a share card. `site.card` styles it; a `<route>.og.tsx` file or `_default.og.tsx` replaces it. Cards
  are cached forever under a hash of what they draw.
- `weft check` and `weft routes --meta` show what every page says about itself.

## Try it

:::challenge A product page that says what it is
This route's every page has the title "Product" and no description. Fix `meta` so each page names its product, with a
description from its tagline.

```tsx
// src/routes/products/[id].tsx
import { notFound } from '@weft-js/start'
import type { LoadArgs, Meta, RouteProps } from '@weft-js/start'

const PRODUCTS = [{
  id: 'kettle',
  name: 'Pour-over kettle',
  tagline: 'A gooseneck kettle that holds its heat for an hour.',
}]

export const load = ({ params }: LoadArgs<'/products/[id]'>) =>
  PRODUCTS.find(p => p.id === params.id) ?? notFound()

export const meta: Meta = { title: 'Product' }

export default function ProductPage(
  props: RouteProps<typeof load, '/products/[id]'>,
) {
  const { data } = props
  return <h1>{data.name}</h1>
}
```
:::solution
```tsx
import { notFound } from '@weft-js/start'
import type { LoadArgs, Meta, RouteProps } from '@weft-js/start'

const PRODUCTS = [{
  id: 'kettle',
  name: 'Pour-over kettle',
  tagline: 'A gooseneck kettle that holds its heat for an hour.',
}]

export const load = ({ params }: LoadArgs<'/products/[id]'>) =>
  PRODUCTS.find(p => p.id === params.id) ?? notFound()

export const meta: Meta<typeof load, '/products/[id]'> =
  ({ data }) => ({
    title: data.name,
    description: data.tagline,
  })

export default function ProductPage(
  props: RouteProps<typeof load, '/products/[id]'>,
) {
  const { data } = props
  return <h1>{data.name}</h1>
}
```

A fixed `meta` on a param route gives every page the same words, which `weft check` reports as **H014**, and as
**H012** for the shared title. Making `meta` a function of `data` gives each page its own.
:::

:::challenge Why is the title wrong?
A layout reads the signed-in user's name from a `defineState` box and puts it in `meta`, so the title says "Sam's
dashboard". The build fails on that line. Why, and what's the fix?
:::solution
`meta` is plain data computed once on the server, before the first byte. A box belongs to the page's reactive world, and
nothing would re-run `meta` when it changed, so reading one is **H006**. Read the user in the layout's `load` instead,
and build `meta` from `data`:

```tsx
import type { LoadArgs, Meta } from '@weft-js/start'

export const load = ({ ctx }: LoadArgs) => ({
  name: ctx.user?.name ?? 'Your',
})
export const meta: Meta<typeof load> = ({ data }) => ({
  title: `${data.name}'s dashboard`,
})
```

Better still, consider whether the name belongs in the title at all: a title is what a bookmark or a shared link shows,
and other people may see it.
:::

:::challenge A card for the whole app
Replace every page's share card with one that shows the page's title large, its description below, and the site's name
in a corner. Which file, and which props?
:::solution
```tsx
// src/routes/_default.og.tsx
import type { OgProps } from '@weft-js/start'

export default function Card(props: OgProps) {
  const { title, description, site } = props
  return (
    <div
      style={
        'display:flex;' +
        'flex-direction:column;' +
        'justify-content:space-between;' +
        'width:100%;' +
        'height:100%;' +
        'padding:64px;' +
        'background-color:#f7f4ec;' +
        'color:#1f1d18'
      }
    >
      <h1 style="margin:0;font-size:72px;line-height:1.05">
        {title}
      </h1>
      <p style="margin:0;font-size:30px;color:#615e56">
        {description}
      </p>
      <p style="margin:0;font-size:26px;font-weight:700">
        {site.name}
      </p>
    </div>
  )
}
```

`_default.og.tsx` in `src/routes` replaces the built-in card for every route without its own `.og.tsx`. `props.title`
and `props.description` are what the built-in card would show, already merged from every layer, so the card works on
pages that never set `meta`. Note that `props.title` includes the site's template: strip it if the name is already in
the corner.
:::
