# 29. `<Form>`, the state payload, `cookie` persist and the media route: `@weft/start` (Phase 3, fourth slice)

Status: **built, 2026-10-30; §8 records what changed and what was measured.** Inputs: PLAN §4, §4.5,
§6.3, §9 row "3. Start"; research 14 §2.7, §2.9, §3.1, §3.4, §4.2; research 15 §4.4, §5.4, §6.1, §7.2, §7.5; research 27
§3 and §10; research 28 §9.

## 1. What this slice has to fit into

Four facts from the code shaped every decision below.

- **`weft/ssr` makes a new app per render pass** and a stream renders several passes. Setups that read a query keep
  working only because each pass re-runs them. So the payload is taken from the last pass, and passes stay separate.
- **`rt.data` already carries the page's data** from `#weft-data` into `hydrate()`, whether or not the app uses state.
  Putting the state payload in it costs a client without scopes one short assignment.
- **`client.tsx` must stay free of the data cache and of `scope.ts`** (research 27 §1: apps that don't use a feature
  don't pay). `<Form>` is its own module, reached only from routes that import it.
- **Client stubs have no `input` schema.** The browser can't validate, so a form is validated on the server in both
  the JS and no-JS paths, and field errors travel back as the `issues` Q002 already sends.

## 2. The `defineState` SSR payload

```
render pass → dehydrate(app) → data.s  (in #weft-data) → hydrate: rt.state → Instance seeds before setup returns
```

- `dehydrate(app)` walks the last pass's instances and writes each **named** box whose value differs from `init`
  (identity, then JSON). Unnamed boxes are private: nothing outside the setup reads them. Resources created in a setup
  own unnamed boxes, so a warning here would be a false positive.
- Non-serializable values are S010 in dev and stay out of the payload.
- Query values are never in it: they travel in `#weft-cache`, so nothing is sent twice.
- A scope seeds from `app.seed`, then from `rt.state`. Each scope takes its entry once, so a later `render()` in the
  same tab can't pick up a page's payload.
- **Hydrating a `local`/`session` box.** Today a persisted box reads storage in setup. During hydration that would put
  the stored value in the first client render, against a server page that shows `init`: a mismatch. So while
  hydrating, the box stays at `init` and the stored value applies once hydration ends (the W054 rule). The write
  skips the box's write hook, because storage already holds that value.

## 3. `cookie` persist

`state(init, { persist: { in: 'cookie', schema, version } })`, or the short form for primitives.

- **Name:** `weft.<app>.<scope>.<box>`, because `:` isn't a cookie-name character. **Value:** the same envelope as
  every backend, URI-encoded.
- **Server:** `RenderOptions.app.cookies` is a read-only jar (`get(name)`); `@weft/start` parses the request's `Cookie`
  header into it. The load path is the shared one: version, migrations, schema. A cookie is user input, so a value the
  schema rejects falls back to `init`; `:corrupt` isn't written on the server or as a cookie.
- **Client:** `document.cookie`, `Path=/; Max-Age=<maxAge or 1 year>; SameSite=Lax`, plus `Secure` on https.
- **The server never sets it.** Headers may already be gone when a render writes, and a render shouldn't have side
  effects. A server function that wants to change one uses `ctx.response.headers`.
- **Budget:** 3 KB for all of an app's cookies, S008 in dev (research 14 §2.7).
- A cookie box that differs from `init` is in the payload as well. It repeats a few bytes, and it guarantees the first
  client render equals the HTML even if another tab changed the cookie mid-load.

## 4. S001, S002, S012, S013

| Code | Where | Rule |
|---|---|---|
| S001 | `weft check` | A server value (object, array, or a map/filter/spread of one) reaches `state(…)`, `box.value =` or `box.set`. Server values: `q()`, `q().value`, `await q.fetch()`, and a `watch`/`then` parameter fed by them, where `q` is imported from a server module and defined with `query`. Not S001: primitives picked from a value, `state.linked`, `optimistic`, `untrack(…)`. |
| S002 | runtime | `@weft/start`'s server module sets `rt.isolated`. A handle that resolves to the tab's root app there throws. It fires in production too, because it stops one user's state reaching another: module scope, `load`, a `run`, a timer. |
| S012 | `weft check` | `state.linked(() => …)` with no `key`, whose source reads a server value. |
| S013 | runtime, dev | On the server, a dev-only accessor on each `local`/`session` box reports the first read during a render. |

`state.linked` grows the `key` option S012's fix names (research 14 §3.4): a new key resets; the same key with no local
edit follows the source; the same key after an edit keeps the edit and sets `conflict` to `{ theirs, base }`.

S001 and S012 live in `packages/cli`, on the TypeScript parser `jsx-scan.mjs` already uses, not in the Rust compiler.
They need to know which imports are queries, which means reading other files; `weft check` already reads the project,
and the compiler sees one file at a time.

## 5. `<Form>`

```tsx
import { Form } from '@weft/start'

<Form of={addTodo} class="add">
  {form => (
    <>
      <input {...form.field('title')} />
      <p>{form.error('title')}</p>
      <button disabled={form.pending.value}>Add</button>
    </>
  )}
</Form>
```

**Markup.** `<form method="post">` with no `action` (the document's URL) and a hidden `$fn` holding the mutation's id.
That is everything the no-JS path needs, and it is the same HTML on both sides, so hydration claims it unchanged.

**Without JS.** A form POST to a page URL:

1. **CSRF:** `Origin` equal to the URL's origin, or `Sec-Fetch-Site: same-origin`; else F002 (403). A form can't send
   `x-weft`, and both headers are ones a page can't forge. A request with neither is refused. No token, because that
   would need a session or a secret in every page.
2. `decodeForm(formData)` builds the input: `a.b` nests, `tags[]` and repeated names are arrays, `$`-prefixed names are
   dropped, as are `__proto__`, `constructor` and `prototype` path segments.
3. The mutation runs.
4. **Success:** 303 to the same URL (Post/Redirect/Get), or to a `redirect()` target, with the mutation's cookies.
5. **Failure:** the page renders with `scope.form` set (status 422 for field errors, else the error's status). `<Form>`
   reads it, so the errors and the values typed are in the HTML. The same state goes out in `#weft-form`, so a page
   that does hydrate renders the same thing.

Echoed values leave out names matching `/pass|secret|token|card|cvv|cvc/i` and all files, so a re-rendered page never
carries a password.

**With JS.** Submit is intercepted, the same `decodeForm` builds the input, and the mutation is called through its
handle, so `optimistic` and single-flight work as in any call. Before hydration finishes a native POST still works:
that's what progressive enhancement means here. A form with a `File` posts `multipart/form-data` to `/_weft/fn/<id>`
with `x-weft: 1`, which keeps it in the page; a custom header forces a preflight, so the CSRF proof is the same.

**Coercion.** A form sends strings, and a schema shared with the database says `number`. Standard Schema has no type
introspection, so `formInput` validates, and for each issue whose value is a string tries the obvious reading
(`''` → absent, numeric → number, `on`/`true`/`false` → boolean), then validates again. If it still fails, the issues
reported are those of the original input. An unchecked checkbox is simply absent: a boolean field needs `.optional()`
or `.default(false)`. The call carries `c: 1`, so plain `m(input)` calls keep strict validation.

**Errors.** `invalid({ email: 'Taken' })` in a `run` gives the same shape as a schema issue. Neither is logged as an
error when it comes from a form: a wrong field is an answer, not a fault. On failure with JS, focus moves to the first
`aria-invalid` field.

**State per form, not per mutation.** `m.pending` is shared by every caller; a page with two forms for one mutation
needs its own. `form.pending` is local, and an `id` prop tells two forms for one mutation apart on the no-JS path.

## 6. `z.media()` and the media route

**The record is `MediaAsset`.** Research 15 sketched `{url, width, height, dominant, lqip, thumbhash, kind}`. `<Media>` was
built since then and takes `{src, width, height, kind, type, sources, dominant, placeholder, name}`. Two shapes for one
thing would need a converter at every use, so `z.media()` validates `MediaAsset` and `<Media src={post.cover}>` just
works. ThumbHash isn't built anywhere yet.

**`z` is a wrapper.** Zod's `z` is an ES namespace, which can't be extended, so `@weft/start/media` exports a `z` with
Zod's API plus `media()`, and `import { z } from 'zod'` keeps working for everything else. `z.media()` is a plain
`z.object`, so C001 stays quiet and the contract shows the record.

**One new slot, `media.server@1`,** side `server`, following research 26's decision to keep one slot per side until a
second encoder exists. The provider lives in `@weft/plugin-media/server` and loads lazily, so `sharp` never reaches an
app that doesn't call it, and Nitro traces it only when bound.

**`ctx.media.ingest(file)`** stores the original under its SHA-256 and returns the record: dimensions after EXIF
orientation, dominant colour, placeholder, and a `srcset` of the route's negotiated URLs. It refuses what isn't an image
and anything over the byte cap (M018) and unsafe SVGs (M012). With no provider it's M017.

**The route:** `GET /_weft/m/<hash>/<width>.<fmt>`.

- `fmt` is `avif`, `webp`, `jpg` or `png`, or `auto`, which negotiates on `Accept`, in the order the config's `formats`
  gives, then the source's fallback. Only an explicit `image/avif` counts: `*/*` gets the fallback, and `q=0` refuses.
  `Vary: Accept` on `auto`.
- Encoded once, on first request, written atomically; concurrent requests for one variant share one encode.
- `Cache-Control: public, max-age=31536000, immutable`, an `ETag`, and 304s.
- Only widths on the ladder (or the source's own) are served, and only formats configured, so a URL can't make the
  server do unbounded work.
- Animated GIFs and SVGs serve their original bytes. SVG gets `Content-Security-Policy: sandbox` so opening one directly
  can't script the origin, and everything gets `X-Content-Type-Options: nosniff`.

**`encoder: 'server'`** (`media({ encoder: 'server' })`) makes `?media` imports records too: the build stores the
original and emits no variants. `'background'` is refused until 3c. Quality is `FIXED` on this path; searching per hash
is research 15's later refinement.

**Storage:** the filesystem, `.weft/media` under the app root, or `WEFT_MEDIA_DIR`. Node, Bun and Deno presets all have a
filesystem. Nitro storage and S3 or R2 are later, behind the same two calls.

## 7. Codes

- **F001** `<Form of>` isn't a mutation. **F002** a form POST without the same-origin proof (403). **F003** a form POST
  naming no known mutation (404).
- **M016** `<Media src>` given a string (no dimensions before render). **M017** no `media.server` provider, or no
  `sharp` the build can trace. **M018** an
  upload refused (not an image, or over the cap).
- **S001, S002, S012, S013** as in §4.

## 8. What was built

Built as designed in §2–§7, with these differences.

**Changes from the design**

- **`invalid()` is Q002 with status 422,** the shape schema issues already had, not a new error type.
- **A form's JS path answers 422 too,** not 400. A 400 put a red line in the console for every wrong field.
- **Coercion reports only what still fails.** The design said to report the original input's issues, which listed a
  numeric field that had coerced fine. Now each path that still fails is reported, with the message from the original
  input (`Quantity must be a number`, not `Expected number, received string`).
- **`ingest` dedupes by hash** and keeps each caller's `name`. `quality` on the record is `'fixed'`, or `'original'` for
  SVGs and animated GIFs.
- **`vitest` runs Start's files serially** (`fileParallelism: false`): they share one fixture server, and the optimistic
  test failed only in a full run, on data another file wrote.

**Found by running the built server, not the dev server**

Dev kept `sharp` and `svgo` in `node_modules`, so the media route worked there and returned 500 in production. Vite
bundled sharp and lost its addon; css-tree (under svgo) reads JSON from its own package at run time. Now `sharp` stays
external and Nitro traces `sharp*` and `css-tree*`, only when `media.server` is bound.

That brought one requirement the design didn't have: **an app using the media route needs `sharp` as a direct
dependency.** Nitro resolves it from the app root. With strict `node_modules` it isn't reachable through the plugin, so
the build warns M017. `@weft/start` has it as a dev dependency for this reason.

**Measured** (brotli, `packages/weft/scripts/size.mjs`, before → after)

| Bundle | Before | After | Budget |
|---|---|---|---|
| hello world | 1.21 | 1.21 | 3.00 |
| counter | 2.07 | 2.16 | |
| runtime, every export | 6.37 | 6.56 | 10.00 |
| v3 shop | 4.34 | 4.43 | 10.00 |
| v3 shop, `defineState` | 5.02 | 5.25 | 10.00 |
| v3 shop, hydrate | 5.03 | 5.12 | 10.00 |
| `Boundary` + resource | 3.64 | 3.72 | |
| `<Media>` | 3.57 | 3.57 | |

Every budget holds. The 0.09 KB on counter and shop is the larger `state.linked`, which hangs off `state` and so can't
be tree-shaken. `defineState`'s 0.23 KB is the payload seed, the cookie store and deferred hydration.

Hydration is 0 misses and 0 writes on `/notes`, `/prefs`, `/cover` and on a 422 page, in Chrome.

The built server passed a no-JS form post, an upload and a negotiated image on Node, Bun and Deno. `runtime-matrix.mjs`
wasn't run for this slice, since it needs a database app; the check was a smoke script against the fixture's builds.

**Not built**

- S002 as a static check (the runtime throw covers every path, including production).
- Header probes, `media.cdn`, Nitro storage or S3/R2, ThumbHash, `'background'` encoding, and
  the `idb` backend on the server.
- A body-size limit before parsing a multipart request. `maxBytes` applies after the body has been read, so a host
  needs its own limit.
- `.weft/media` is on the local disk. A deploy has to keep that folder or set `WEFT_MEDIA_DIR`.
