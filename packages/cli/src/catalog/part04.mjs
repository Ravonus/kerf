/** Diagnostic entries in their catalog order. */
export const part04 = [
  {
    code: 'H016',
    severity: 'info',
    by: 'cli',
    catches:
      "A route `weft check` couldn't fully check: it failed here, or a param route with no page to sample",
    fix: 'Export `prerender`, or link to a page of it; `check: { routes: false }` turns the route pass off',
  },
  // The rendered page (`weft audit`, and the end of `weft build`): what Lighthouse, a crawler and a screen reader see
  {
    code: 'L000',
    severity: 'warning',
    by: 'cli',
    catches:
      "The built pages weren't audited: no Chrome or Chromium on this machine, or no prerendered pages",
    fix: 'Install Chrome, or set `WEFT_CHROME`; `weft audit --url <deploy>` audits a running site',
  },
  {
    code: 'L001',
    severity: 'error',
    by: 'cli',
    catches:
      "A control (button, link, field, frame) with no accessible name in the rendered page, at a phone's width or a desktop's: often CSS that hid its only text",
    fix: 'Give it a name: `label` on a warp `Button` or `aria-label` on an element. For a button that shows its text on wide screens, `collapse="phone"` (or `"tablet"`) hides the text there and keeps it as the name; `display: none` takes the name with it.',
  },
  {
    code: 'L002',
    severity: 'error',
    by: 'cli',
    catches: 'An image with no text alternative in the rendered page',
    fix: '`alt` on an `<img>` (`alt=""` if it shows nothing a reader needs), `label` on warp\'s `Icon` and `Image`.',
  },
  {
    code: 'L003',
    severity: 'error',
    by: 'cli',
    catches:
      'Text under WCAG contrast (4.5:1, or 3:1 when large) against what is actually behind it in the rendered page',
    fix: "Text needs 4.5:1 against what is behind it (3:1 at 24px, or 18.7px bold). Use warp's text roles (`--warp-color-text`, `--warp-color-text-subtle`) on warp surfaces instead of a raw or faded colour.",
  },
  {
    code: 'L004',
    severity: 'error',
    by: 'cli',
    catches:
      'Another axe-core WCAG A/AA rule the rendered page breaks (the rule Lighthouse runs for Accessibility and Agentic Browsing)',
    fix: "Each finding names the axe rule, its first remedy and the rule's page.",
  },
  {
    code: 'L010',
    severity: 'error',
    by: 'cli',
    catches: 'An uncaught exception or a `console.error` while the page loads',
    fix: 'Fix the error the page throws or logs; `weft browser open <route>` then `weft browser snapshot` shows it with the page.',
  },
  {
    code: 'L011',
    severity: 'error',
    by: 'cli',
    catches: 'The browser logged an error loading the page: usually a missing file (404)',
    fix: 'Usually a file the page asks for that is missing (a 404): fix the URL or ship the file.',
  },
  {
    code: 'L012',
    severity: 'error',
    by: 'cli',
    catches: 'A deprecated browser API in use (Lighthouse Best Practices)',
    fix: "Replace the deprecated API; Chrome's message names what replaces it.",
  },
  {
    code: 'L013',
    severity: 'error',
    by: 'cli',
    catches:
      'An issue Chrome logs and Lighthouse counts: mixed content, a blocked cookie, a CSP or CORS failure',
    fix: 'Open the page in Chrome and read the Issues panel for the request or element it names.',
  },
  {
    code: 'L020',
    severity: 'error',
    by: 'cli',
    catches: 'A built page with no `<title>`',
    fix: '`meta: { title }` on the route, or `site.title` in weft.config.ts.',
  },
  {
    code: 'L021',
    severity: 'warning',
    by: 'cli',
    catches: 'A built page with no meta description',
    fix: '`meta: { description }` on the route, or `site.description` in weft.config.ts.',
  },
  {
    code: 'L022',
    severity: 'error',
    by: 'cli',
    catches: '`<html>` with no `lang`',
    fix: '`site.locale` in weft.config.ts sets it.',
  },
  {
    code: 'L023',
    severity: 'error',
    by: 'cli',
    catches: 'No `width=device-width` viewport meta: phones render at 980px and shrink the page',
    fix: 'weft writes it; a custom `head` or document must keep it.',
  },
  {
    code: 'L024',
    severity: 'warning',
    by: 'cli',
    catches:
      "A page told search engines not to index it (meta robots, or the host's `x-robots-tag` on a preview URL)",
    fix: "Remove the `noindex` if the page should be found. On a host's preview URL, audit the production URL instead: `weft audit --url <it>`.",
  },
  {
    code: 'L025',
    severity: 'error',
    by: 'cli',
    catches: 'A page answered with a 4xx or 5xx status',
    fix: 'The route errors or is missing: run it with `weft dev` and read the server log.',
  },
  {
    code: 'L030',
    severity: 'warning',
    by: 'cli',
    catches: "The page scrolls sideways at a phone's width",
    fix: 'Let the named element shrink: `max-inline-size: 100%`, `min-inline-size: 0` on a flex or grid child, or `overflow-x: auto` on wide content, with `tabindex="0"`, a role and a name so a keyboard can scroll it (warp\'s `Table` does this).',
  },
  {
    code: 'L031',
    severity: 'warning',
    by: 'cli',
    catches: 'The layout moved while the page loaded (CLS over 0.05; an error over 0.1)',
    fix: "Reserve the space before it fills: `width` and `height` on images and video, a fixed `block-size` for what loads late, and fonts through weft's text() plugin (it matches fallback metrics).",
  },
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
  // Server functions and the query cache (research 27 §6; Q for query). `start`: reported by @weft-js/start while serving
  // (the server log, and the error the call rejects with); `runtime`: thrown or warned by the client runtime.
  {
    code: 'Q001',
    severity: 'error',
    by: 'runtime',
    catches:
      '`q()` (a live query, a Resource) called with no owner: in `load`, a handler, a timer or module scope',
    fix: '`await q.fetch(input)` there; `q()` in components and defineState scopes',
  },
  {
    code: 'Q002',
    severity: 'error',
    by: 'start',
    catches:
      "A query's or mutation's input failed its schema (400, with the issues and their paths)",
    fix: 'Pass what the schema accepts',
  },
  {
    code: 'Q003',
    severity: 'error',
    by: 'start',
    catches:
      '`query`/`mutation` defined outside a server module: its `run` and imports would ship to the client (the build fails)',
    fix: 'Move it to `src/server/**` or a `*.server.ts` file',
  },
  {
    code: 'Q004',
    severity: 'error',
    by: 'start',
    catches:
      "A mutation called while the server handles a GET (`load`, a page render, a query's `run`)",
    fix: 'Call it from a handler or another mutation; reads go in queries',
  },
  {
    code: 'Q005',
    severity: 'warning',
    by: 'start',
    catches:
      "A server function's result doesn't survive JSON (`Date`, `Map`, `Set`, a class, `undefined` in an array, a function, `NaN`): the client sees another value",
    fix: 'Send plain data (ISO strings, arrays, objects)',
  },
  {
    code: 'Q006',
    severity: 'error',
    by: 'start',
    catches:
      'A cached (`cache: { life }`) query reads `ctx.request`, `ctx.response` or `ctx.user`: its value is shared by every user',
    fix: 'Drop `cache`, or pass the value as input',
  },
  {
    code: 'Q007',
    severity: 'error',
    by: 'start',
    catches:
      "`redirect()` after the page started streaming (a component's query): the status is already sent",
    fix: "Call the query in the route's `load`, which runs before the first byte",
  },
  {
    code: 'Q008',
    severity: 'warning',
    by: 'start',
    catches: `A mutation \`invalidates\` a tag no query declares (\`todo:*\` covers \`todo:\${id}\`): nothing refreshes`,
    fix: "Fix the tag name, or add it to the query's `tags`",
  },
  {
    code: 'Q009',
    severity: 'error',
    by: 'start',
    catches:
      "`/_weft/fn/<id>` names no function: the page is older than the server, or the module isn't a server module",
    fix: 'Reload; keep `query`/`mutation` exports in server modules',
  },
  {
    code: 'Q010',
    severity: 'error',
    by: 'start',
    catches:
      'A mutation request without the CSRF proof (POST, JSON, `x-weft: 1`, same origin): 403',
    fix: 'Call mutations through their stub, not a hand-made `fetch` or form',
  },
  {
    code: 'S011',
    severity: 'warning',
    by: 'runtime',
    catches:
      "`mutation({ optimistic })` updated a query its invalidated tags didn't cover: the prediction has no fresh value to land on (held until a refetch)",
    fix: "Add one of the query's tags to `invalidates`",
  },
  {
    code: 'S001',
    severity: 'error',
    by: 'cli',
    catches:
      'A server object or array (`q().value`, `await q.fetch()`, or a map, filter or spread of one) copied into `state`: it goes stale and its rows lose their identity',
    fix: 'Reference the query and `derived` from it; store ids; `state.linked` for edits, `untrack` for a deliberate snapshot',
  },
  {
    code: 'S002',
    severity: 'error',
    by: 'runtime',
    catches:
      'A `defineState` scope reached on the server outside a render (module scope, `load`, a server function, a timer): it would be shared by every request',
    fix: 'Read it in a component, a handler or a `derived`; pass values into server code as arguments',
  },
]
