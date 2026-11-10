<p align="center">
  <a href="https://github.com/Ravonus/weft">
    <img src="https://raw.githubusercontent.com/Ravonus/weft/main/site/public/logo.svg" width="88" height="88" alt="Weft">
  </a>
</p>

<h1 align="center">@weft-js/plugin-media</h1>

<p align="center">
  <strong>Images that arrive at their size: AVIF plus a fallback, a width ladder, a placeholder, and quality measured per image.</strong><br>
  One plugin encodes <code>?media</code> imports at build time, serves uploads at run time, and checks every <code>&lt;img&gt;</code> and <code>&lt;video&gt;</code> you write.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@weft-js/plugin-media"><img src="https://img.shields.io/npm/v/@weft-js/plugin-media?color=145c3c&label=npm" alt="npm version"></a>
  <a href="https://github.com/Ravonus/weft/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-145c3c" alt="MIT license"></a>
  <a href="https://github.com/Ravonus/weft/actions"><img src="https://img.shields.io/github/actions/workflow/status/Ravonus/weft/quality.yml?branch=main&label=checks" alt="checks"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="https://github.com/Ravonus/weft/tree/main/docs">Docs</a> ·
  <a href="https://github.com/Ravonus/weft/tree/main/examples">Examples</a> ·
  <a href="https://github.com/Ravonus/weft/blob/main/CHANGELOG.md">Changelog</a> ·
  <a href="https://github.com/Ravonus/weft">GitHub</a>
</p>

> [!IMPORTANT]
> **Early release (0.1.x).** APIs can change between minor versions. Pin the version and read the
> [changelog](https://github.com/Ravonus/weft/blob/main/CHANGELOG.md) before you upgrade.

Weft's `<Media>` component (from `@weft-js/core/media`) renders a record: intrinsic width and height, the files to pick
from, a placeholder. This plugin is what makes those records. Without it, a `?media` import reads the size from the
file header and serves the original. With it, the build resizes and re-encodes every image with
[sharp](https://sharp.pixelplumbing.com/), cleans SVGs with [SVGO](https://svgo.dev/), and the server does the same for
files your users upload. It also adds the `M` diagnostics to `weft check`, so a raw `<img>` without a size or an
`alt` is caught before it ships.

## Highlights

- **AVIF first, a compatible fallback last.** Efficient formats (`avif` by default, `webp` on request) go in front of a
  fallback that follows the source: JPEG for photos, lossless PNG for graphics and anything with alpha.
- **Quality measured, not guessed.** With the `ssimulacra2` tool on `PATH`, each format is binary-searched (at most 5
  encodes) to the lowest quality that scores at or above the target, 80 by default. Without it, fixed qualities are
  used and the record says `quality: 'fixed'`.
- **A width ladder.** 320, 640, 960, 1280, 1920 and 2560 px by default, capped at the source's own width, so the browser
  picks the smallest file that is sharp enough.
- **Placeholders.** A dominant colour and a 16 px WebP data URL, so the box is filled before the image paints.
- **Uploads on the same path.** `ctx.media.ingest(file)` stores the original under a hash of its bytes and returns the
  same record shape; each size is encoded once, on first request, and cached for a year.
- **Unsafe SVGs refused.** An SVG with `<script>`, `<foreignObject>`, `on*=` handlers, an external `href`, `url()` or
  `@import` is neither optimised nor stored (M012).
- **Video, audio and GIFs** when [`@weft-js/plugin-media-ffmpeg`](https://www.npmjs.com/package/@weft-js/plugin-media-ffmpeg) <sup>[source](https://github.com/Ravonus/weft/tree/main/packages/plugin-media-ffmpeg)</sup>
  is also installed: an AV1/H.264 ladder with a poster, Opus and AAC, and GIFs turned into video when that saves 15%.
- **Cached by content.** Build output is keyed by the bytes, the options, the encoder versions and a format version
  under `.weft/cache/media`, so restarts and rebuilds don't re-encode.

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [How it plugs into Weft](#how-it-plugs-into-weft)
- [Options](#options)
- [Images at build time](#images-at-build-time)
- [Uploads and the media route](#uploads-and-the-media-route)
- [Video, audio and animated GIFs](#video-audio-and-animated-gifs)
- [The `encoder` modes](#the-encoder-modes)
- [Diagnostics](#diagnostics)
- [API reference](#api-reference)
- [Recipes](#recipes)
- [Limits](#limits)
- [Troubleshooting](#troubleshooting)
- [Related packages](#related-packages)

## Install

```bash
# npm
npm install @weft-js/plugin-media

# pnpm
pnpm add @weft-js/plugin-media

# bun
bun add @weft-js/plugin-media
```

Or let the `weft` CLI install it and add it to `weft.config.ts` in one step:

```bash
npx weft add media
```

The `landing` template (`--template landing`) already has it in its dependencies and its `weft.config.ts`; the other templates and a
plain new app don't.

`weft add media` installs the package and writes this into `weft.config.ts` (the package has no `/plugin` entry, so
the import is from the main entry, by its named export):

```ts
import { media } from '@weft-js/plugin-media'
```

**What it needs**

| Need | Why |
| --- | --- |
| Node 24 or later | `engines` in package.json |
| `sharp` (a dependency of this package) | Every raster encode. For the media route, the **app** needs `sharp` in its own dependencies so the built server can load it; a build without it warns with M017. |
| `ssimulacra2` on `PATH` (optional) | The quality search. It's the SSIMULACRA2 tool from libjxl. Without it, fixed qualities are used. |
| A disk that outlives deploys (for uploads) | The media route stores files in `.weft/media`, or `WEFT_MEDIA_DIR`. |
| `@weft-js/plugin-media-ffmpeg` and ffmpeg (optional) | Video, audio, and GIF-to-video. |

## Quick start

```ts
// weft.config.ts
import { defineConfig } from '@weft-js/core/config'
import { media } from '@weft-js/plugin-media'

export default defineConfig({
  plugins: [media()],
})
```

```tsx
// src/routes/index.tsx
import { Media } from '@weft-js/core/media'
import hero from '../../assets/hero.jpg?media'

export default function Home() {
  return (
    <Media
      src={hero}
      alt="A lighthouse at dusk, its beam crossing low cloud"
      priority
      width="1/2"
    />
  )
}
```

`hero` is a record, not a URL: `width`, `height`, `sources` (an AVIF `srcset` and a JPEG one), `dominant` and
`placeholder`. `<Media>` renders it with its final box size, the placeholder behind it, and `srcset`/`sizes` from
`width`. `priority` loads the one hero image eagerly; everything else is lazy.

## How it plugs into Weft

`media()` is a plugin (namespace `M`) that provides two slots and a check hook:

| Slot / hook | Side | Module | What it does |
| --- | --- | --- | --- |
| `media.build@1` | build | `src/build.mjs` → `createMediaBuild` | `@weft-js/core/vite` calls it for each `?media` import (and `?media&audio=…`). |
| `media.server@1` | server | `@weft-js/plugin-media/server` → `createMediaServer` | `@weft-js/start` uses it for `ctx.media.ingest` and the `/_weft/m/…` route. |
| `check` | `weft check` | `src/check.mjs` → `checkMedia` | Runs over `**/*.{tsx,jsx}` and reports M001–M013 and M016. |
| `media.encode@1` (consumer) | build, server | provided by `@weft-js/plugin-media-ffmpeg` | Video, audio and animated GIFs. Without a provider, a video import is P101. |

It declares these permissions: read media files (`png`, `jpg`, `gif`, `webp`, `avif`, `svg` and common video/audio
extensions), the `WEFT_MEDIA_DIR` environment variable, spawning `ssimulacra2`, and a native addon (sharp). It also
contributes agent notes and a catalog entry for `<Media>`.

Options are validated when the config loads. An unknown key or a bad value is **P115**, with the option's path (for
example `formats.0` or `quality.target`).

## Options

All options are optional. `media()` with none is the configuration the defaults below describe.

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `formats` | `('avif' \| 'webp')[]` | `['avif']` | Efficient formats placed before the fallback. The fallback follows the source and isn't listed here. |
| `widths` | `number[]` | `[320, 640, 960, 1280, 1920, 2560]` | The width ladder, sorted for you. The largest also caps the output width. |
| `quality.target` | `number` (1–100) | `80` | The SSIMULACRA2 score each format is searched to. 80 is about visually lossless at normal viewing. |
| `quality.scorer` | `string` | `'ssimulacra2'` | The scorer command, or `'none'` to use fixed qualities. |
| `placeholder` | `boolean` · `'inline'` · `'file'` | `true` | Adds `dominant` (a `#rrggbb` colour) and `placeholder`, a 16 px WebP. `true` or `'inline'`: a `data:` URL. `'file'`: its own hashed file, for a CSP without `data:` in `img-src`. `false`: neither. |
| `gifLimit` | `number` (bytes) | `262144` (256 KB) | A GIF over this is M004, at build and in `weft check`. |
| `encoder` | `'off' \| 'compatible' \| 'server'` | `'off'` | See [The `encoder` modes](#the-encoder-modes). |
| `swap` | `'intent' \| 'idle' \| 'never'` | `'intent'` | When the compatible copy swaps in. Only valid with `encoder: 'compatible'`. |
| `video.codecs` | `('av1' \| 'vp9' \| 'hevc')[]` | `['av1']` | Efficient video codecs next to H.264, which is always there. |
| `video.widths` | `number[]` | `[640, 960, 1280, 1920]` | The video ladder. |
| `gif.toVideo` | `'auto' \| 'never'` | `'auto'` | `'never'` keeps animated GIFs as GIFs. |
| `gif.keepUnder` | `number` (bytes) | `8192` | A GIF under this stays a GIF. |
| `server.dir` | `string` | `'.weft/media'` | The upload store, relative to the app. `WEFT_MEDIA_DIR` overrides it. |
| `server.maxBytes` | `number` | `20971520` (20 MB) | The largest upload `ingest` accepts (M018 above it). |

Fixed qualities, used when no scorer runs: AVIF 50, WebP 75, JPEG 78. PNG is lossless at compression level 9.

## Images at build time

For each `?media` import the build provider:

1. Reads the image with sharp and applies EXIF orientation, so a portrait shot stored sideways comes out upright with
   its width and height swapped.
2. Builds the ladder: every configured width below the source's width, plus the source width capped at the largest
   rung. A 1000 px image with the default ladder gets 320, 640, 960 and 1000.
3. Picks formats: the configured efficient formats, then the fallback. JPEG, AVIF, HEIF, TIFF and opaque WebP sources
   count as photos (JPEG fallback); everything else, and WebP with alpha, is a graphic (PNG fallback).
4. Searches quality once per format at the largest rung, between AVIF 20–90 or WebP/JPEG 40–95.
5. Encodes every format at every width and names each file `<stem>-<width>-<hash>.<ext>`.
6. Adds the placeholder and dominant colour.

The record looks like this:

```ts
{
  // 'graphic' for PNG-like sources, 'vector' for SVG
  kind: 'photo',
  src: 'hero-1280-3f9c0a1b.jpg', // the largest fallback file
  width: 1280, height: 853,
  type: 'image/jpeg',
  sources: [
    { type: 'image/avif', srcset: 'hero-320-….avif 320w, …' },
    { type: 'image/jpeg', srcset: 'hero-320-….jpg 320w, …' },
  ],
  name: 'hero.jpg',
  quality: 'ssimulacra2',     // or 'fixed'
  qualities: { avif: 52, jpeg: 81 },
  dominant: '#6b7f5a',
  placeholder: 'data:image/webp;base64,…',
}
```

**SVG** is checked for unsafe content (M012), must have `width`/`height` or a `viewBox` (M001 otherwise), and goes
through SVGO with `multipass`. It ships as one file with `kind: 'vector'`.

**Animated GIFs** ship as they are unless a `media.encode` provider can turn them into something smaller (see below).
A GIF over `gifLimit` that stays a GIF is M004.

## Uploads and the media route

`createMediaServer(options).at(root, encode)` is the store `@weft-js/start` gives your server functions as `ctx.media`:

```ts
// src/server/photos.ts
import { mutation } from '@weft-js/start'
import { z } from '@weft-js/start/media'

export const uploadPhoto = mutation({
  input: z.object({
    photo: z
      .file()
      .max(8 * 1024 * 1024)
      .mime(['image/jpeg', 'image/png', 'image/webp']),
    alt: z.string().trim().min(1).max(200),
  }),
  auth: 'user',
  run: async ({ input, ctx }) => {
    const image = await ctx.media.ingest(input.photo)
    // store `image` (a MediaAsset) in a JSON column, render it with
    // <Media src={image} alt={…} />
    return image
  },
})
```

What `ingest(bytes, { name })` does:

- Refuses files over `server.maxBytes` with **M018**.
- Hashes the bytes (SHA-256, first 32 hex digits). The same bytes are stored once; a second upload returns the stored
  record with its own `name`.
- Sniffs video and audio from the first bytes, not the file name. Those need `@weft-js/plugin-media-ffmpeg`, or they are
  M018 naming the fix.
- Refuses an unsafe SVG with **M012**, and anything sharp can't read with **M018**.
- Writes `source` and `meta.json` into `<dir>/<hash>/` (`meta.json` last, through a rename, so it only exists when the
  original is whole) and returns a record whose URLs are `/_weft/m/<hash>/<width>.auto`.

Nothing is resized at upload. The route `/_weft/m/<hash>/<width>.<format>` encodes a size on its first request, writes
it next to the original, and reads it from disk afterwards. Concurrent requests for the same size share one encode.

| Rule | Detail |
| --- | --- |
| Formats | `auto` picks the first of `formats` the `Accept` header names with `q > 0`, in the config's order; a wildcard promises nothing, so it falls back to JPEG or PNG. `avif`, `webp`, `jpg` and `png` can be asked for directly when configured or the fallback. |
| Widths | Only widths on the record's ladder. Anything else, or a malformed hash, is a 404. |
| Headers | `cache-control: public, max-age=31536000, immutable`, an `ETag`, `x-content-type-options: nosniff`, `vary: Accept` when negotiated, and a `sandbox` content security policy for SVG. |
| Quality | Fixed qualities: no SSIMULACRA2 search at run time. |

## Video, audio and animated GIFs

These need a `media.encode@1` provider. Add [`@weft-js/plugin-media-ffmpeg`](https://www.npmjs.com/package/@weft-js/plugin-media-ffmpeg) <sup>[source](https://github.com/Ravonus/weft/tree/main/packages/plugin-media-ffmpeg)</sup>
next to `media()`:

```ts
import { defineConfig } from '@weft-js/core/config'
import { media } from '@weft-js/plugin-media'
import { mediaFfmpeg } from '@weft-js/plugin-media-ffmpeg'

export default defineConfig({
  plugins: [
    media({ video: { codecs: ['av1', 'vp9'] } }),
    mediaFfmpeg(),
  ],
})
```

**Video** (`.mp4`, `.m4v`, `.mov`, `.webm`, `.mkv`, `.ogv`):

- An H.264 ladder is always built, plus each configured efficient codec. An efficient set ships only if it is at least
  15% smaller than the H.264 one; winners go first, H.264 last.
- With a scorer, a CRF search (at most 4 encodes) at the top width samples five frames: the mean SSIMULACRA2 score must
  reach the target and the worst frame must reach the target minus 5.
- An H.264 `yuv420p` source already at the top width, with AAC or no audio, is remuxed at that rung instead of
  re-encoded.
- A WebP poster frame is taken at `min(1 s, duration / 10)`, with the placeholder from the same frame.
- HDR or over-8-bit sources come out 8-bit SDR, with **M015**.

**Audio** (`.mp3`, `.wav`, `.flac`, `.ogg`, `.oga`, `.opus`, `.m4a`, `.aac`): Opus and AAC. A source already in that
codec and under its bitrate (96 kbps Opus, 128 kbps AAC) is remuxed, not re-encoded.

**Animated GIFs** become video when that is a real saving. A GIF stays a GIF when it is under `gif.keepUnder`, has
fewer than 4 frames, when nothing comes out at least 15% smaller, or with `gif.toVideo: 'never'`. A GIF with
transparency becomes an animated WebP instead (H.264 has no alpha), when that is 15% smaller.

**Muxing a sound into a loop:** `import loop from './loop.gif?media&audio=./beat.opus'` loops the GIF for the length of
the sound.

Uploaded video and audio use fixed CRFs and a queue: `ingest` returns the record at once, and the sizes encode one at a
time. Until a size exists, its URL serves the original with `cache-control: no-store` if browsers can play it, and
otherwise waits for that encode. A restart loses nothing: the first request for a missing size encodes it.

## The `encoder` modes

| Mode | What happens |
| --- | --- |
| `'off'` (default) | Everything is encoded at build time; the files ship with the build. |
| `'compatible'` | The page shows the efficient file, and a compatible copy swaps in so a saved file opens anywhere. For images the copy is the fallback ladder that already exists, so it adds 0 KB. For video it is the H.264 top rung; for a GIF turned video, the original GIF. **M014** (info) says what each asset adds. `swap` picks when: `'intent'` (right-click, long-press or drag), `'idle'`, or `'never'`. |
| `'server'` | Image `?media` imports are not encoded at build time. The build stores each original in the media store and the record points at `/_weft/m/…`, so the server encodes sizes on first request. Video and audio are still built. Needs a running server and a store that reaches it. |

## Diagnostics

`weft docs M001` (or any code) prints the full entry. The `by` column says who reports it.

| Code | Severity | Reported by | Catches |
| --- | --- | --- | --- |
| M001 | error | `weft check`, build | A raw `<img>`/`<video>` with no `width`/`height` or `aspect-ratio` outside a `<Boundary>`; an SVG with no size. The check inserts the file's size for an imported file. |
| M002 | error | `weft check` | An image rendered through `?url` or a string path to a project file. The fix rewrites the import to `?media`. |
| M003 | warning | `weft check` | A raw `<img>` whose file is wider than its `width` × 2 × 1.25. |
| M004 | warning | `weft check`, build | A GIF over `gifLimit` rendered raw, or shipped as a GIF. |
| M005 | error | `weft check` | `<video autoplay>` without `muted` (autofix). |
| M006 | warning | `weft check` | `<video>` without `poster`. |
| M007 | error | `weft check` | Missing `alt`, `<Media alt="">` without `decorative`, or `alt` equal to the file name. |
| M008 | warning | `weft check` | A route's first media is `loading="lazy"`, or `priority` media is lazy (autofix for the second). |
| M009 | warning | `weft check` | More than 2 `priority` media in one route (autofix). |
| M010 | warning | `weft check` | A `priority` `<Media>` with no `width` or `sizes`. |
| M011 | warning | `weft check` | `<video autoplay loop>` without `controls`, or a GIF in a raw `<img>` (WCAG 2.2.2). |
| M012 | error | `weft check`, build, `ingest` | An SVG with active content or external references. |
| M013 | warning | `weft check` | A `public/` file referenced by string. |
| M014 | info | build | What `encoder: 'compatible'` adds. |
| M015 | warning | build | An HDR or over-8-bit video that comes out 8-bit SDR. |
| M016 | warning | `weft check` | `<Media src>` given a string. |
| M017 | error | `@weft-js/start` | `ctx.media` or a `/_weft/m/` URL with no `media.server` provider, or `sharp` missing from the app's dependencies. |
| M018 | error | `ingest`, build | An upload that isn't a readable image or is over `maxBytes` (422); a video with no video track; a video upload with no encoder. |
| M019 | error/warning | `@weft-js/plugin-media-ffmpeg` | ffmpeg missing, not the pinned binary, or without an encoder. |

## API reference

| Export | Entry | What it is |
| --- | --- | --- |
| `media(options?)` | `@weft-js/plugin-media` | The plugin for `weft.config.ts`. Typed by `MediaOptions`. |
| `MediaOptions` | `@weft-js/plugin-media` (type) | The options in the table above. |
| `createMediaBuild(options?)` | `@weft-js/plugin-media/build` | The `media.build@1` provider: `{ build(source, ctx) }` returns `{ asset, files, diagnostics? }`. |
| `findScorer(name)` | `@weft-js/plugin-media/build` | The scorer command if it runs, else `null`. Cached per process. |
| `DEFAULTS`, `FIXED`, `MIME`, `encoders`, `hex`, `isPhoto` | `@weft-js/plugin-media/build` | Shared defaults, fixed qualities, content types, the sharp encoder calls and helpers. |
| `createMediaServer(options?)` | `@weft-js/plugin-media/server` | The `media.server@1` provider: `.at(root, encode)` returns `{ ingest, serve, settled }`. |
| `negotiate(accept, formats, fallback)` | `@weft-js/plugin-media/server` | Picks the format for `auto` from an `Accept` header. |

<details>
<summary><code>createMediaBuild().build(source, ctx)</code></summary>

`source` is `{ file, bytes, audio? }`: the absolute path, the bytes, and an optional audio file to mux in. `ctx` is
`{ cacheDir, root, encode }`, where `encode` maps `media.encode` keys (`video/h264`, `audio/opus`, …) to providers.
Core's Vite plugin passes `.weft/cache/media` as `cacheDir`. The result's `files` are `{ name, bytes }` for the build to
emit; a diagnostic with `severity: 'error'` fails that import.

</details>

<details>
<summary><code>createMediaServer().at(root, encode)</code></summary>

- `ingest(bytes, { name? })`: stores an original and returns a `MediaAsset`. Throws an `Error` with `code` set to
  `M012` or `M018` when it refuses.
- `serve({ hash, width, format, accept })`: returns `{ bytes, type, width, format, negotiated, temporary? }`, or `null`
  for a 404.
- `settled()`: resolves when queued video and audio encodes are done (used by tests).

The store is `WEFT_MEDIA_DIR` when set, else `server.dir` resolved against `root`.

</details>

## Recipes

**WebP as well as AVIF, and a smaller ladder**

```ts
media({ formats: ['avif', 'webp'], widths: [480, 960, 1440] })
```

**Fixed qualities on a CI machine without the scorer, on purpose**

```ts
media({ quality: { scorer: 'none' } })
```

**A strict CSP: the placeholder as a file**

```ts
media({ placeholder: 'file' })
```

The default placeholder is a `data:` URL, which `img-src 'self'` blocks.
With `'file'` each image and video poster gets a `name-placeholder-<hash>.webp`
of a few hundred bytes next to its ladder, and the record points at it.
Uploads through the media route still inline theirs.

**Uploads on a mounted volume**

```bash
WEFT_MEDIA_DIR=/data/media node .output/server/index.mjs
```

On `weft deploy` targets with a volume, uploads go to `.data/media` through `WEFT_MEDIA_DIR`.

**A raw `<img>` that the check flags, and the fix**

```tsx
// M001, M002: no size, and the file bypasses the optimiser
import logo from './logo.png?url'
export const Logo = () => <img src={logo} alt="Acme" />
```

```tsx
import { Media } from '@weft-js/core/media'
import logo from './logo.png?media'
export const Logo = () => (
  <Media
    src={logo}
    alt="Acme"
    width="120px"
  />
)
```

## Limits

- Image input is PNG, JPEG, GIF, WebP, AVIF and SVG (what `ingest` names when it refuses a file). Efficient output
  formats are AVIF and WebP only.
- The quality search runs at build time only. Uploaded images use fixed qualities.
- The upload store is a directory on the server's disk. Function hosts without a persistent disk can't keep uploads
  (`weft check` reports E003 for a deploy target). `cdn.images` (Cloudinary) is checked but not wired yet (E014).
- Video, audio and GIF-to-video need ffmpeg through `@weft-js/plugin-media-ffmpeg`. Without it a video `?media` import
  fails with P101 and a video upload with M018.
- The build cache under `.weft/cache/media` grows with every distinct input; delete it to reclaim space.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `quality: 'fixed'` on every record | `ssimulacra2` isn't on `PATH`. Install libjxl's tool, or set `quality.scorer` to its path. |
| `P115` when the config loads | A bad option. The message names the path, such as `formats.0` (`jxl` isn't supported) or `quality.target` (must be 1–100). `swap` without `encoder: 'compatible'` is also P115. |
| `M017` in the server log | No `media()` in `plugins`, or the app doesn't list `sharp` in its own dependencies. |
| `M018` on upload | Over `server.maxBytes` (20 MB by default), not an image sharp can read, or a video with no encoder installed. |
| `P101 … needs media.encode` | A video or audio `?media` import with no `mediaFfmpeg()` in `plugins`. |
| CSP reports a blocked `data:image/webp` | The inline placeholder. Set `placeholder: 'file'`, or add `data:` to `img-src`. |
| Uploaded images vanish after a deploy | The store isn't on persistent storage. Point `WEFT_MEDIA_DIR` at a volume. |

## Related packages

| Package | What it is |
| --- | --- |
| [`@weft-js/core`](https://www.npmjs.com/package/@weft-js/core) | `<Media>`, `timeline()` and the `?media` import (`@weft-js/core/media`). |
| [`@weft-js/start`](https://www.npmjs.com/package/@weft-js/start) | `ctx.media`, `z.media()` and the `/_weft/m/` route. |
| [`@weft-js/plugin-media-ffmpeg`](https://www.npmjs.com/package/@weft-js/plugin-media-ffmpeg) | The `media.encode@1` provider: video and audio through ffmpeg. |
| [`@weft-js/cli`](https://www.npmjs.com/package/@weft-js/cli) | `weft add media`, `weft check` and `weft docs M001`. |
| [`@weft-js/text`](https://www.npmjs.com/package/@weft-js/text) | The other asset plugin: fonts and text measurement. |

## Contributing

See [CONTRIBUTING.md](https://github.com/Ravonus/weft/blob/main/CONTRIBUTING.md). From the repository root:

```bash
pnpm --filter @weft-js/plugin-media test
```

The video tests skip where ffmpeg isn't on `PATH`. `test/save.headful.mjs` is the `encoder: 'compatible'` save-as gate in headed
browsers; it needs Linux, Xvfb and `xdotool`, and its header says how to run it.

## License

[MIT](https://github.com/Ravonus/weft/blob/main/LICENSE)
