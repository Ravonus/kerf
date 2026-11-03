# Uploads and media

:::learn
- How a file gets from a form to your server, with or without JavaScript
- How `ctx.media.ingest` turns an upload into a record `<Media>` can show
- Where the limits are, and what weft refuses for you
- How uploaded images, video and audio are stored, resized and served
:::

Images you ship with the app are files in your project: you import them with `?media` and render them with `<Media>`,
and the build makes every size and format ahead of time. [Text, media and shapes](/learn/text-media-and-shapes) covers
that. This page is about the other kind: files your users give you, such as an avatar, a photo for a listing or a video
for a post. Nobody saw those at build time, so the server has to do the same work when they arrive.

In React you'd pick an upload library, a storage service and an image CDN, and glue the three together. weft has one
path for it: a `<Form>` sends the file to a mutation, `ctx.media.ingest` stores it and answers with a record, you save
the record in a column, and `<Media src={record}>` renders it with the right sizes, formats and placeholder.

:::demo server-upload-check

## Turning on the media server

The work happens in a plugin, `@weft-js/plugin-media`, which provides the `media.server` slot. Add it once:

```bash
weft add media
```

That puts `media()` in `plugins` in `weft.config.ts`. Its options are the same ones that shape build-time images, plus
`server` for uploads:

<!-- example: skip the scratch app doesn't install @weft-js/plugin-media -->
```ts
// weft.config.ts
import { defineConfig } from '@weft-js/core/config'
import { media } from '@weft-js/plugin-media'
import { warp } from '@weft-js/warp/plugin'

export default defineConfig({
  plugins: [warp(), media({ server: { maxBytes: 10 * 1024 * 1024 } })],
})
```

The encoder is `sharp`, so the app needs `sharp` in its dependencies for the built server to load it. A build that can't
find it warns with **M017**, and so does any request that reaches the media code with no `media.server` provider:
`ctx.media.ingest` throws M017 rather than lose the file quietly.

## Uploading a file with a form

A file goes through `<Form>`. A mutation called from code sends its input as JSON, which can't carry a file; a form sends
a `FormData` with the file in it, and the server decodes the fields into the mutation's input as it would any form.
[Forms and validation](/learn/forms-and-validation) covers `<Form>` itself.

Start with where the record will live. It's JSON, so a JSON text column holds it. Here's a table in a file of its own,
the way `weft add pay` writes its tables:

```ts
// src/db/photos.schema.ts
import type { MediaAsset } from '@weft-js/start/media'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const photos = sqliteTable('photos', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  alt: text('alt').notNull(),
  image: text('image', { mode: 'json' }).$type<MediaAsset>().notNull(),
  createdAt: integer('created_at').notNull(),
})
```

Add `export * from './photos.schema'` to `src/db/schema.ts` and run `weft db generate`, as in
[Database](/learn/database).

Now the server functions. The input has a `z.file()` field with the limits you want, and `run` hands the file to
`ctx.media.ingest`:

```ts
// src/server/photos.ts
import { mutation, query } from '@weft-js/start'
import { z } from '@weft-js/start/media'
import { desc, eq } from 'drizzle-orm'
import { photos } from '#/db/photos.schema'

export const listPhotos = query({
  tags: ['photos'],
  auth: 'user',
  run: ({ ctx }) => ctx.db.select().from(photos).where(eq(photos.userId, ctx.user.id)).orderBy(desc(photos.createdAt)),
})

export const uploadPhoto = mutation({
  input: z.object({
    photo: z.file().max(8 * 1024 * 1024).mime(['image/jpeg', 'image/png', 'image/webp']),
    alt: z.string().trim().min(1).max(200),
  }),
  auth: 'user',
  invalidates: ['photos'],
  run: async ({ input, ctx }) => {
    const image = await ctx.media.ingest(input.photo)
    const [row] = await ctx.db
      .insert(photos)
      .values({ id: crypto.randomUUID(), userId: ctx.user.id, alt: input.alt, image, createdAt: Date.now() })
      .returning()
    return row
  },
})
```

`z` here comes from `@weft-js/start/media`. It's Zod's API with one addition, `z.media()`, which you'll meet below;
`import { z } from 'zod'` works just as well for everything else.

The page is an ordinary `<Form>` with a file input. Give the form `enctype="multipart/form-data"`, so the file is sent
even before JavaScript has loaded:

```tsx
import { Media } from '@weft-js/core/media'
import { Form, type FormApi } from '@weft-js/start'
import { listPhotos, uploadPhoto } from '#/server/photos'

export function Photos() {
  const photos = listPhotos()
  return (
    <section>
      <Form of={uploadPhoto} enctype="multipart/form-data">
        {(form: FormApi) => (
          <>
            <label>
              Photo <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" required />
            </label>
            <form.Error name="photo" />
            <label>
              Describe it <input {...form.field('alt')} />
            </label>
            <form.Error name="alt" />
            <p>{form.message.value}</p>
            <button type="submit" disabled={form.pending.value}>
              {form.pending.value ? 'Uploading…' : 'Upload'}
            </button>
          </>
        )}
      </Form>
      <ul>
        {(photos.value ?? []).map(p => (
          <li key={p.id}>
            <Media src={p.image} alt={p.alt} width="240px" />
          </li>
        ))}
      </ul>
    </section>
  )
}
```

When the upload succeeds, `invalidates: ['photos']` brings the list back in the same response, and the new photo
appears. When it fails, the error lands next to the field it belongs to, or in `form.message` when it names no field.

:::pitfall Ask for a description, and store it
`<Media>` requires `alt` (**M007**), and the file's name isn't one: `IMG_2041.jpg` tells a screen reader user nothing.
Ask the uploader what the picture shows and keep it next to the record, as `alt` above. For a picture that's purely
decoration, `alt=""` with `decorative` says so.
:::

:::deepdive Why the file only travels through a form
A mutation call from code is `fetch` with a JSON body, so its input has to be JSON. A `<Form>` is a real
`<form method="post">`: before hydration the browser posts it, and after hydration weft sends the same `FormData` with
`fetch`. Either way the server gets multipart fields, decodes them into the input (`a.b` nests, `x[]` makes an array, an
empty file input is left out), and validates them with your schema. So one mutation serves both the no-JavaScript post
and the in-page submit, and a file is just another field.
:::

## What `ingest` gives you

`ctx.media.ingest(file)` takes a `File`, a `Blob` or a `Uint8Array`, stores the original under a hash of its bytes, and
returns a `MediaAsset` record:

```ts
{
  kind: 'photo',                     // or 'graphic', 'vector', 'video', 'audio'
  src: '/_weft/m/3f9c…/1280.auto',   // the largest size
  width: 1280, height: 853,          // after EXIF rotation
  type: 'image/jpeg',
  sources: [{ type: 'image/jpeg', srcset: '/_weft/m/3f9c…/320.auto 320w, …' }],
  dominant: '#6b7f5a',               // a colour to fill the box with until it loads
  placeholder: 'data:image/webp;base64,…',
  name: 'IMG_2041.jpg',
  quality: 'fixed',
}
```

That's the same shape a `?media` import gives you, so `<Media>` doesn't care where a record came from. It knows the
width and height before anything loads, so the page doesn't shift, and it writes `srcset` and `sizes` so a phone fetches
a phone-sized file.

The same bytes always get the same hash, so uploading a file twice stores it once. For bytes you already have, such as an
image fetched from another service, pass a `Uint8Array` and a name: `ctx.media.ingest(bytes, { name: 'cover.png' })`.

### Typing a record with `z.media()`

A record that comes from somewhere else (a CMS, an import, an old table) should be checked before `<Media>` trusts it.
`z.media()` is the schema for it. Use it in an `output`, or anywhere you parse data you didn't write:

```ts
// src/server/cms.ts
import { query } from '@weft-js/start'
import { z } from '@weft-js/start/media'

const Post = z.object({ slug: z.string(), title: z.string(), cover: z.media(), coverAlt: z.string() })

export const featured = query({
  tags: ['posts'],
  output: z.array(Post),
  run: async () => {
    const res = await fetch('https://cms.example.com/featured.json')
    return z.array(Post).parse(await res.json())
  },
})
```

:::pitfall Don't hand `<Media>` a URL string
`<Media src="/uploads/a.jpg">` is **M016**. A string has no width or height, so nothing can reserve its space before it
loads, and there are no smaller sizes to choose from. Store what `ingest` returned and pass that, or import the file with
`?media`.
:::

## Limits and refusals

Some files never get stored. `ingest` refuses them with a code, and the mutation fails with status 422, so `<Form>` shows
the message:

- **M018**: the file isn't an image weft can read (PNG, JPEG, GIF, WebP, AVIF, SVG), or it's over the size limit. The
  limit is `media({ server: { maxBytes } })`, 20 MB by default.
- **M012**: an SVG with active content or external references, such as a script or an outside image. An SVG can carry
  code, so one that does isn't stored at all.

Your own schema comes first, though. `z.file().max(…).mime([...])` refuses a file with a field error before `ingest`
spends any time on it, and the error is attached to the right input. Keep the two numbers in step: the schema's limit
for your users, the plugin's as the ceiling.

Checking on the client too is kind, not safe. The demo at the top of this page refuses a big file before it's sent, which
saves a slow upload that would fail anyway. A client check can always be skipped, so the server's check is the one that
counts.

:::note Copying the rule to the client
The `accept` attribute on a file input is a hint to the file picker, nothing more. To check a file in the browser, read
`input.files[0].size` and `.type` in an `onChange`, as the demo does. Never rely on it.
:::

## Serving: sizes, formats and caching

The record's URLs point at one route, `/_weft/m/<hash>/<width>.<format>`. Nothing is resized when you upload. The first
request for a size encodes it, writes it next to the original, and serves it; every later request reads the file. Two
requests for the same size at once share one encode.

- `auto` as the format picks the best one the browser says it accepts (AVIF when it asks for it), and falls back to the
  original's kind: JPEG for photos, PNG for graphics.
- Only widths on the ladder (320, 640, 960, 1280, 1920 and 2560 by default, up to the original's own width) and formats
  in the config are served, so nobody can make the server encode a thousand sizes by editing a URL.
- Responses are `immutable` for a year with an `ETag`. A new upload is a new hash, so a cached file is never wrong.
- SVGs are cleaned with SVGO and served with a `sandbox` content security policy, and every file gets `nosniff`.

The `media()` options `formats`, `widths`, `quality` and `placeholder` shape uploads and build-time images alike.

### Where the files live

On disk: `.weft/media` under the app, or the directory in `WEFT_MEDIA_DIR`. Each upload is a folder named by its hash,
with the original, its sizes and a small `meta.json`. That works on every server runtime, and it means the folder has to
outlive a deploy. On a container or a VPS, point `WEFT_MEDIA_DIR` at a volume. [Runtimes and deploying](/learn/deploying)
has more on what a host keeps between deploys.

## Video, audio and animated GIFs

Images need nothing else. Video and audio need an encoder, which weft doesn't ship: `@weft-js/plugin-media-ffmpeg` runs
an ffmpeg you install on the server.

```bash
weft add media-ffmpeg
```

With `mediaFfmpeg()` in `plugins` and ffmpeg on the server's `PATH` (or a `binary` path, optionally pinned with
`sha256`), `ingest` takes video and audio too. It answers at once with the record, and a queue encodes the sizes one at a
time in the background, so a burst of uploads doesn't swamp the server. Until a size exists, its URL serves the original
when browsers can play it, marked so nothing caches it, and otherwise waits for that encode. A restart loses nothing: the
first request for a missing size encodes it.

Video gets AV1 (or the codecs in `media({ video: { codecs } })`) with an H.264 copy for everything else, and a poster
frame; audio gets Opus and AAC. An animated GIF becomes a video when that's clearly smaller, and stays a GIF when it
isn't.

Without the plugin, a video upload is refused with **M018**, which names what to add. An ffmpeg that's missing, isn't the
pinned binary, or lacks an encoder is **M019**.

:::pitfall ffmpeg's licence travels with it
Builds of ffmpeg that include x264 or x265 are GPL. Running one on your own server is one thing; distributing it with
what you ship can bind your code. weft never bundles ffmpeg for that reason, and the plugin's docs say so too.
:::

## Recap

- `weft add media` turns on the media server. Without it, `ctx.media.ingest` fails with **M017**.
- A file reaches a mutation through `<Form enctype="multipart/form-data">`, with a `z.file()` field in the input.
- `ctx.media.ingest(file)` stores the original under its hash and returns a `MediaAsset`. Store that record in a JSON
  column and render it with `<Media src={record} alt={…} />`.
- `z.media()` from `@weft-js/start/media` checks a record you didn't make.
- Refusals come back as 422 with a code: **M018** for not an image or too big, **M012** for an unsafe SVG. Check size and
  type in your schema first; a client check only saves time.
- Sizes are encoded on first request, cached forever, and limited to the ladder. Files live in `.weft/media` or
  `WEFT_MEDIA_DIR`, which must outlive a deploy.
- Video and audio need `@weft-js/plugin-media-ffmpeg` and an ffmpeg you install.

## Try it

:::challenge Avatars, one per user
Write a `setAvatar` mutation that takes one image of at most 2 MB, stores the record, and refreshes every query tagged
`profiles`. Assume a `profiles` table with `userId` and a JSON `avatar` column (write it as its own schema file).
:::solution
```ts
// src/db/profiles.schema.ts
import type { MediaAsset } from '@weft-js/start/media'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const profiles = sqliteTable('profiles', {
  userId: text('user_id').primaryKey(),
  avatar: text('avatar', { mode: 'json' }).$type<MediaAsset>(),
})
```

```ts
// src/server/profile.ts
import { mutation } from '@weft-js/start'
import { z } from '@weft-js/start/media'
import { profiles } from '#/db/profiles.schema'

export const setAvatar = mutation({
  input: z.object({ avatar: z.file().max(2 * 1024 * 1024).mime(['image/jpeg', 'image/png', 'image/webp']) }),
  auth: 'user',
  invalidates: ['profiles'],
  run: async ({ input, ctx }) => {
    const avatar = await ctx.media.ingest(input.avatar)
    await ctx.db
      .insert(profiles)
      .values({ userId: ctx.user.id, avatar })
      .onConflictDoUpdate({ target: profiles.userId, set: { avatar } })
    return avatar
  },
})
```

The schema refuses a big or non-image file with a field error before anything is stored. `onConflictDoUpdate` keeps one
row per user, and the old file stays on disk under its own hash, which matters if anything still points at it.
:::

:::challenge Why does the photo jump?
A teammate renders uploads like this, and the page shifts every time an image loads. What's wrong, and what does
`weft check` say?

```tsx
<img src={p.image.src} alt={p.alt} />
```
:::solution
A bare `<img>` has no width or height until the file arrives, so the browser can't reserve its space (**M001**), and it
always fetches the largest size. The record already knows the dimensions and every size, so let `<Media>` use them:

```tsx
<Media src={p.image} alt={p.alt} width="1/3" />
```

`width` says how wide it's drawn (here a third of the viewport, the full width on a phone), which becomes `sizes`, so
the browser picks the smallest file that's sharp enough.
:::

:::challenge Import from a URL
Users paste a link to an image instead of picking a file. Write a mutation that fetches it on the server and stores it
like an upload. What should it refuse?
:::solution
```ts
// src/server/import.ts
import { FnError, mutation } from '@weft-js/start'
import { z } from '@weft-js/start/media'

export const importImage = mutation({
  input: z.object({ url: z.url().max(2000) }),
  auth: 'user',
  run: async ({ input, ctx }) => {
    const res = await fetch(input.url)
    if (!res.ok) throw new FnError({ message: `That link answered ${res.status}` }, 422)
    const bytes = new Uint8Array(await res.arrayBuffer())
    return ctx.media.ingest(bytes, { name: new URL(input.url).pathname.split('/').pop() || 'image' })
  },
})
```

`ingest` still refuses anything that isn't an image or is over the limit (**M018**), and an unsafe SVG (**M012**). A
real version should also refuse addresses inside your own network, since the server, not the user, makes the request,
and cap how long it waits.
:::
