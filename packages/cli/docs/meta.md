# Page metadata and share cards

Every page has a title, a description, a canonical URL, Open Graph and Twitter tags and a share card, in the first
response, where a crawler can read them. Most of it is automatic. The words are yours.

## Set `meta` as you build the page

Writing a page includes writing what a search result or a shared link says about it. A title, and one plain sentence
on what the reader gets, from what is on the page:

```tsx
import type { Meta } from '@weft-js/start'

export const meta: Meta = {
  title: 'Pricing',
  description: 'Three plans, billed monthly, ' +
    'and what each one includes.',
}
```

On a param route, build it from `data` and `params`, so each page says what it is:

<!-- example: skip needs the app's own getUser query -->
```tsx
// src/routes/users/[id].tsx
import { notFound, type LoadArgs, type Meta } from '@weft-js/start'
import { getUser } from '#/server/users'

export const load = async ({ params }: LoadArgs<'/users/[id]'>) => {
  const user = await getUser.fetch({ id: params.id })
  return user ?? notFound()
}
export const meta: Meta<typeof load> = ({ data }) => ({
  title: data.name,
  description: data.bio,
})
```

`meta` is plain data: it runs once per request after the loaders and before the first byte. It can't read a box (H006)
or a deferred field (H007). Set `title: { absolute: 'Home' }` to skip the template, `og`, `twitter` and `extra` for
what else a page needs, and `jsonLd` for structured data. Layers merge in this order, later winning: `site` in
`weft.config.ts`, what the page rendered, each layout's `meta`, the route's `meta`.

## What weft does for you

With no `meta`, or a `meta` that leaves a field out:

- **Title:** the page's `h1`, or with none its first `h2` or `h3`, through `site.title`.
- **Description:** the first paragraph after the `h1` that reads as prose, inside `<main>`, with lists, code, tables,
  navigation and footers skipped, cleaned, and cut at a sentence by 155 characters. With none, `site.description`.
- **Share card:** `site.image` defaults to `'auto'`: a 1200×630 PNG of the title, description, app name and address,
  in warp's colours and the text plugin's faces. `site.card` sets them (`scheme: 'light'`, `accent: '#rrggbb'`).
  `routes/x.og.tsx` replaces one route's card, `_default.og.tsx` every card; `og: { image: '/x.png' }` or `image: false`
  skips it. The URL holds a hash of what it draws, so it's cached forever and changes when the page does.
- **`twitter:card`** is `summary_large_image` when there is an image. **Canonical and `og:url`** come from the origin.
- **Structured data:** a `WebSite` on `/` when `site.name` is set, and nothing else unless `jsonLd` sets it: weft
  doesn't guess.

Pages with a card are drawn by `weft build` when they have no params or are in `prerender`. Every other param page's
card is drawn on the first request, and only for params the route's own `load` accepts. A static host has no server, so
there a param route needs `prerender` (H002).

## The site's address

Absolute URLs need one: `site.url`, or `WEFT_SITE_URL`, or what the host sets (`VERCEL_PROJECT_PRODUCTION_URL`,
`VERCEL_URL`, Netlify's `URL`, `CF_PAGES_URL`, `RENDER_EXTERNAL_URL`, `RAILWAY_PUBLIC_DOMAIN`, `FLY_APP_NAME`). With none, a
server uses the request's origin, which is only what its `Host` header said, and warns once in production (H001). A
prerendered page has no request, so it stays relative: crawlers don't resolve that, so set `site.url` before you ship.

## See it, and fix it

`weft check` reports metadata for every route, from what the routes really produce. Param routes are sampled from
`prerender` and from the links on rendered pages. Each diagnostic says what to write; H011's fix is a `meta` to start from.

| Code | What it says |
|---|---|
| H001 | no `site.url` |
| H002 | a param route's card, on a static host, with no `prerender` |
| H003, H004 | no description; a title over 60 or a description over 160 |
| H005, H008 | a card's style or image failed |
| H006, H007 | `meta` read a box or a deferred field |
| H011 | no `meta`, or a field left out: says what was derived |
| H012, H013 | two routes share a title or a description |
| H014 | a param route whose pages all look alike |
| H015 | a description that reads like code, markdown or a fragment |
| H016 | a route that couldn't be checked here (`check: { routes: false }` turns the pass off) |

`weft routes --meta` is a table of each page: title, description, image and where each came from (`route`, `layout`,
`config`, `auto`, `card`). `--json` has every tag. It's the `routes_meta` tool of `weft mcp`.

Never slice raw markdown or code into `description`: `body.slice(0, 155)` is how a page's card ends up reading
`- xs.map(x = <Row`. Write the sentence, or leave it out and let the page speak.
