/** metadataHead diagnostic entries in catalog order. */
export const metadataHead = [
  {
    code: 'H001',
    severity: 'warning',
    by: 'cli',
    catches:
      "No `site.url`: a build has no absolute canonical, og:url or og:image, and a server takes them from the request's Host header",
    fix: 'Set `site.url`, or `WEFT_SITE_URL` in the deploy environment',
  },
  {
    code: 'H002',
    severity: 'error',
    by: 'cli',
    catches:
      'Param route with an `auto` image on a static-only preset and no `prerender` (`weft routes --meta --preset static`)',
    fix: 'Export `prerender`, or set `og.image`',
  },
  {
    code: 'H003',
    severity: 'warning',
    by: 'cli',
    catches:
      'No description after merging the config, layouts and route (`weft check`, per route and on `site`)',
    fix: "Set `site.description` (or the route's `meta.description`)",
  },
  {
    code: 'H004',
    severity: 'warning',
    by: 'cli',
    catches: 'Title over 60 characters or description over 160 (search results and cards cut them)',
    fix: 'Shorten it',
  },
  {
    code: 'H011',
    severity: 'warning',
    by: 'cli',
    catches:
      'A page sets no `meta`, or leaves out its title or description: they come from what it renders (its `h1`, its first paragraph) or the site default',
    fix: 'Add `meta` when you build the page, in words written for it; the diagnostic carries a starting point',
  },
  {
    code: 'H012',
    severity: 'warning',
    by: 'cli',
    catches: 'Two routes have the same title',
    fix: 'Give each page a title from what is on it',
  },
  {
    code: 'H013',
    severity: 'warning',
    by: 'cli',
    catches: 'Two routes have the same description, usually the site default',
    fix: 'Give each page a description from what is on it',
  },
  {
    code: 'H014',
    severity: 'warning',
    by: 'cli',
    catches:
      'A param route whose `meta` ignores `data` and `params`, or whose real pages all have the same title or description',
    fix: 'Build `meta` from `data` and `params`: `({ data }) => ({ title: data.name, description: data.summary })`',
  },
  {
    code: 'H015',
    severity: 'warning',
    by: 'cli',
    catches:
      'A written description that reads like code, a markdown fragment or a cut-off sentence',
    fix: 'Write one plain sentence. Never slice raw markdown or code into `description`',
  },
  {
    code: 'H016',
    severity: 'info',
    by: 'cli',
    catches:
      "A route `weft check` couldn't fully check: it failed here, or a param route with no page to sample",
    fix: 'Export `prerender`, or link to a page of it; `check: { routes: false }` turns the route pass off',
  },
]

/** metadataCards diagnostic entries in catalog order. */
export const metadataCards = [
  {
    code: 'H005',
    severity: 'error',
    by: 'start',
    catches:
      '`.og.tsx` uses a style or element the card renderer does not support (an error in dev; production drops the declaration)',
    fix: 'Use flexbox, text, images, borders, radius, gradients, shadows',
  },
  {
    code: 'H006',
    severity: 'error',
    by: 'cli',
    catches:
      '`meta` reads a box or calls a hook (metadata is plain data); found statically by `weft check`',
    fix: 'Compute it from `params` and `data`',
  },
  {
    code: 'H007',
    severity: 'error',
    by: 'start',
    catches:
      "`meta` (or a card) reads a deferred (streamed) field of the loader's data: the request fails with 500 instead of a page with missing tags",
    fix: 'Await the field in `load`, or leave it out of `meta`',
  },
  {
    code: 'H008',
    severity: 'warning',
    by: 'start',
    catches:
      "A card's `<img>` didn't load (timeout, HTTP error, not an image, too large, host not allowed); the card renders without it",
    fix: 'Fix the URL, or embed the image with an import',
  },
]
