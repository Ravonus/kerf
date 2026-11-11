<p align="center">
  <a href="https://github.com/Ravonus/kerf">
    <img src="https://raw.githubusercontent.com/Ravonus/kerf/main/site/public/logo.svg" width="88" height="88" alt="Kerf">
  </a>
</p>

<h1 align="center">@kerf-js/media-ffmpeg</h1>

<p align="center">
  <strong>Video and audio for Kerf's media pipeline, encoded by an ffmpeg you install.</strong><br>
  AV1, VP9, HEVC and H.264 video, Opus and AAC audio, behind one <code>media.encode@1</code> slot, with an optional SHA-256 pin on the binary.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@kerf-js/media-ffmpeg"><img src="https://img.shields.io/npm/v/@kerf-js/media-ffmpeg?color=145c3c&label=npm" alt="npm version"></a>
  <a href="https://github.com/Ravonus/kerf/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-145c3c" alt="MIT license"></a>
  <a href="https://github.com/Ravonus/kerf/actions"><img src="https://img.shields.io/github/actions/workflow/status/Ravonus/kerf/quality.yml?branch=main&label=checks" alt="checks"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="https://github.com/Ravonus/kerf/tree/main/docs">Docs</a> ·
  <a href="https://github.com/Ravonus/kerf/tree/main/examples">Examples</a> ·
  <a href="https://github.com/Ravonus/kerf/blob/main/CHANGELOG.md">Changelog</a> ·
  <a href="https://github.com/Ravonus/kerf">GitHub</a>
</p>

> [!IMPORTANT]
> **Early release (0.1.x).** APIs can change between minor versions. Pin the version and read the
> [changelog](https://github.com/Ravonus/kerf/blob/main/CHANGELOG.md) before you upgrade.

[`@kerf-js/media`](https://www.npmjs.com/package/@kerf-js/media) <sup>[source](https://github.com/Ravonus/kerf/tree/main/packages/media)</sup> handles images on its own. For
video, audio and animated GIFs it asks the `media.encode@1` slot, and this package fills that slot by running ffmpeg and
ffprobe. It decides nothing about quality or ladders; plugin-media does that. This package knows each codec's encoder
names, CRF range and container, and turns a recipe into an ffmpeg command line.

Kerf ships no ffmpeg. Builds with x264 or x265 are GPL, and H.264, HEVC and AAC fall under patent pools, so which binary
runs is the app's choice. `kerf add` prints that note when it installs this plugin.

## Highlights

- **Six codec keys.** `video/av1`, `video/vp9`, `video/hevc`, `video/h264`, `audio/opus` and `audio/aac`, each a
  separate provider, on both the build and the server side.
- **Your ffmpeg, found or pinned.** `ffmpeg` and `ffprobe` from `PATH` by default; or a path, and optionally its SHA-256,
  which is checked before the first run.
- **Encoder fallbacks.** AV1 uses `libsvtav1` when the binary has it, else `libaom-av1`. A key whose encoder is missing is
  left out of the ladder with a warning, instead of failing the build.
- **Web-ready output.** `yuv420p` at even dimensions, MP4 with `moov` first (`+faststart`), WebM with cues first, and
  `<source type>` codec strings (`avc1.…`, `av01.…`, `hvc1.…`) read back from the encode.
- **Metadata stripped.** `-map_metadata -1` and `-map_chapters -1` on every encode: phones write GPS into videos.
- **GIF timing kept.** Frames pass through with their own timestamps (`-fps_mode passthrough`), so a GIF's variable
  delays survive.
- **A timeout per run.** 10 minutes by default, so a stuck encode doesn't hold a build forever.

## Install

```bash
# npm
npm install @kerf-js/media @kerf-js/media-ffmpeg

# pnpm
pnpm add @kerf-js/media @kerf-js/media-ffmpeg

# bun
bun add @kerf-js/media @kerf-js/media-ffmpeg
```

Or let the `kerf` CLI install it and add it to `kerf.config.ts` in one step:

```bash
npx kerf add media
npx kerf add media-ffmpeg
```

`kerf add` writes `import { mediaFfmpeg } from '@kerf-js/media-ffmpeg'` and adds `mediaFfmpeg()` to `plugins`.

Then install ffmpeg itself, on every machine that builds and on the server if it takes uploads:

```bash
brew install ffmpeg      # macOS
sudo apt install ffmpeg  # Debian, Ubuntu
```

It needs `ffprobe` too (both packages above include it), and the encoders you want: `libx264` for H.264 (always
needed for video), `libsvtav1` or `libaom-av1` for AV1, `libvpx-vp9`, `libx265`, `libopus`, and the built-in `aac`.
`ffmpeg -hide_banner -encoders` lists what a binary has.

## Quick start

```ts
// kerf.config.ts
import { defineConfig } from '@kerf-js/core/config'
import { media } from '@kerf-js/media'
import { mediaFfmpeg } from '@kerf-js/media-ffmpeg'

export default defineConfig({
  plugins: [media(), mediaFfmpeg()],
})
```

```tsx
// src/routes/launch.tsx
import { Media, timeline } from '@kerf-js/core/media'
import clip from '../../assets/launch.mp4?media'

export default function Launch() {
  const t = timeline(clip, { cues: { intro: 0, liftoff: 12 } })
  return (
    <>
      <Media
        src={clip}
        timeline={t}
        alt="The rocket launch, from the countdown to orbit"
      />
      <p>
        {t.cue.value === 'liftoff' ? 'Liftoff!' : 'Counting down…'}
      </p>
    </>
  )
}
```

The build gives `clip` an AV1 ladder (plugin-media's default `video.codecs`), an H.264 ladder for everything else, and
a poster. The AV1 set ships only if it is at least 15% smaller than the H.264 one.

## How it plugs into Kerf

`mediaFfmpeg()` provides one keyed slot, `media.encode@1`, once per key in `KEYS`. Each provider points at
`createMediaEncode` from `src/build.mjs` on the build side and from `@kerf-js/media-ffmpeg/build` on the server
side, with the key added to the options.

| Consumer | When it calls this |
| --- | --- |
| `@kerf-js/media`'s `media.build@1` | A `?media` import of a video, an audio file, or an animated GIF. |
| `@kerf-js/media`'s `media.server@1` | `ctx.media.ingest` of a video or audio upload, or an animated GIF, and the route that serves their rungs. |

The plugin's namespace is `M`. It declares permission to read media files, write temporary directories named
`$TMPDIR/kerf-ffmpeg-*`, and spawn `ffmpeg` and `ffprobe`. It declares no network access and no native addon.

## Options

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `binary` | `string` | `'system'` | `'system'` runs `ffmpeg` and `ffprobe` from `PATH`. Anything else is the path of ffmpeg. |
| `probe` | `string` | `ffprobe` next to `binary` | The path of ffprobe, when `binary` is a path. |
| `sha256` | `string` (64 hex digits) | none | The binary's SHA-256. Before its first run the file is hashed, and every encode is refused unless it matches. Needs `binary`: a `PATH` lookup has no single file to pin. |
| `timeout` | `number` (ms) | `600000` (10 minutes) | How long one ffmpeg run may take. |

Options are validated when the config loads: an unknown key, a `sha256` that isn't 64 hex digits, a `sha256` with
`binary: 'system'`, or a non-positive `timeout` is **P115**.

## What each key encodes

The knob is a CRF: lower is better quality. plugin-media searches between the minimum and maximum when a scorer is
available, and uses the fixed value otherwise.

| Key | Encoder (first found) | CRF min · max · fixed | Container | Audio with it | Extra arguments |
| --- | --- | --- | --- | --- | --- |
| `video/av1` | `libsvtav1`, `libaom-av1` | 20 · 58 · 35 | WebM | Opus 96k | `-preset 6`; aom: `-cpu-used 6 -row-mt 1 -b:v 0` |
| `video/vp9` | `libvpx-vp9` | 20 · 50 · 33 | WebM | Opus 96k | `-b:v 0 -row-mt 1 -cpu-used 2 -deadline good` |
| `video/hevc` | `libx265` | 16 · 36 · 26 | MP4 | AAC 128k | `-preset medium -tag:v hvc1` |
| `video/h264` | `libx264` | 16 · 34 · 23 | MP4 | AAC 128k | `-preset medium -profile:v high` |
| `audio/opus` | `libopus` | (bitrate 96k) | WebM | | |
| `audio/aac` | `aac` | (bitrate 128k) | M4A (MP4) | | |

Video is scaled with Lanczos to the rung's width (height rounded to even) and converted to `yuv420p`. A `copy` recipe
remuxes without re-encoding, which plugin-media uses for an H.264 source already at its top width and for audio already
under its bitrate.

## API reference

| Export | Entry | What it is |
| --- | --- | --- |
| `mediaFfmpeg(options?)` | `@kerf-js/media-ffmpeg` | The plugin for `kerf.config.ts`. Typed by `MediaFfmpegOptions`. |
| `MediaFfmpegOptions` | `@kerf-js/media-ffmpeg` (type) | The options above. |
| `KEYS` | `@kerf-js/media-ffmpeg` | The six `media.encode` keys, in the order above. |
| `createMediaEncode({ key, binary?, probe?, sha256?, timeout? })` | `@kerf-js/media-ffmpeg/build` | One codec's provider. Throws for a key it has no recipe for. |

<details>
<summary>What <code>createMediaEncode()</code> returns</summary>

| Member | What it does |
| --- | --- |
| `key` | The codec key. |
| `knob` | `{ min, max, fixed, higherIsBetter: false }` for the CRF. |
| `ext` | `webm`, `mp4` or `m4a`. |
| `encoderName()` | The encoder this binary would use, or `null` when it was built without one. Asks `ffmpeg -encoders` once per process. |
| `versions()` | `{ ffmpeg, encoder }`: the first line of `ffmpeg -version` and the encoder. plugin-media puts it in its cache key, so a new ffmpeg means new output. |
| `info(file)` | ffprobe's view: `format`, `duration`, `video` (`codec`, `pix`, `width`/`height` after rotation, `fps`, `frames`, `string`, `hdr`) and `audio` (`codec`, `channels`, `bitrate`, `string`). |
| `still(file, { at?, width? })` | One frame as PNG bytes, for posters and the quality search. |
| `encode(file, { knob?, width?, copy?, audio?, loopVideo? })` | Encoded bytes. `audio` is a file to mux in, or `false` to drop the source's own. `loopVideo` loops the input for the length of that audio. |

</details>

## Recipes

**A pinned binary in CI**

```ts
mediaFfmpeg({
  binary: '/opt/ffmpeg/bin/ffmpeg',
  sha256: process.env.FFMPEG_SHA256,
})
```

`sha256` must be 64 lowercase hex digits; `shasum -a 256 /opt/ffmpeg/bin/ffmpeg` gives it. `probe` defaults to
`/opt/ffmpeg/bin/ffprobe`.

**More codecs, and a longer limit for long videos**

```ts
plugins: [
  media({ video: { codecs: ['av1', 'vp9', 'hevc'] } }),
  mediaFfmpeg({ timeout: 30 * 60 * 1000 }),
]
```

**A sound under a looping GIF**

```tsx
import loop from './loop.gif?media&audio=./beat.opus'
```

## Limits

- ffmpeg is not bundled and not downloaded. Every machine that builds media, and the server if it takes video or audio
  uploads, needs its own.
- `video/h264` is required for any video: it is the compatible copy, so a binary without `libx264` can't build video.
  Other missing encoders only drop that codec (an M019 warning).
- HDR and over-8-bit sources come out 8-bit SDR (plugin-media reports M015).
- Inputs are read with `-protocol_whitelist file,pipe`: no network sources.
- Audio bitrates are fixed: Opus 96 kbps, AAC-LC 128 kbps.

## Troubleshooting

| Message | Cause and fix |
| --- | --- |
| `M019 ffmpeg didn't run. Install ffmpeg …` | ffmpeg isn't on `PATH`, or `binary` points at nothing. Install it, or pass its path. |
| `M019 … has no libx264 encoder for video/h264` | The binary was built without that encoder. Use a build that has it. |
| `M019 … is not the pinned binary: sha256 …` | The file at `binary` changed. The message prints the actual hash. |
| `M019 No encoder for video/av1: it is left out of the ladder.` | A warning: the codec is skipped and the rest ships. |
| `video/h264: ffmpeg failed: …` | ffmpeg exited with an error; the last three lines of its stderr follow. |
| `P101 … needs media.encode` | Reported by plugin-media when this plugin isn't in `plugins`. |

## Related packages

| Package | What it is |
| --- | --- |
| [`@kerf-js/media`](https://www.npmjs.com/package/@kerf-js/media) | The media pipeline that uses this: ladders, quality search, uploads, M-codes. |
| [`@kerf-js/core`](https://www.npmjs.com/package/@kerf-js/core) | `<Media>` and `timeline()` from `@kerf-js/core/media`. |
| [`@kerf-js/start`](https://www.npmjs.com/package/@kerf-js/start) | `ctx.media.ingest` for uploads. |
| [`@kerf-js/cli`](https://www.npmjs.com/package/@kerf-js/cli) | `kerf add media-ffmpeg` and `kerf docs M019`. |

## Contributing

See [CONTRIBUTING.md](https://github.com/Ravonus/kerf/blob/main/CONTRIBUTING.md). From the repository root:

```bash
pnpm --filter @kerf-js/media-ffmpeg test
```

The tests that run the binary skip where ffmpeg isn't on `PATH`. plugin-media's `test/video.test.ts` covers real
encodes through this package.

## License

[MIT](https://github.com/Ravonus/kerf/blob/main/LICENSE). ffmpeg itself is not part of this package and carries its own
licence (LGPL or GPL, depending on how it was built).
