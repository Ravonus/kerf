# Media delivery and original-file saving

Install `@kerf-js/media`; add `@kerf-js/media-ffmpeg` when the source includes movies or audio. Import local sources with `?media` and render `<Media>` from `@kerf-js/core/media`. The plugin supplies dimensions, responsive widths, a tiny first-paint placeholder, posters and efficient formats. Source files remain immutable.

```ts
import {defineConfig} from '@kerf-js/core/config'
import {media} from '@kerf-js/media'
import {mediaFfmpeg} from '@kerf-js/media-ffmpeg'

export default defineConfig({
  plugins: [
    media({
      formats: ['avif', 'webp'],
      quality: {lossless: true, target: 90},
      encoder: 'compatible',
      swap: 'manual',
      video: {
        delivery: 'auto',
        lossless: false,
        chunkSeconds: 2,
        maxFrameBytes: 268435456,
      },
    }),
    mediaFfmpeg(),
  ],
})
```

`quality.lossless: true` verifies every emitted efficient raster by a complete RGBA decode, including invisible RGB. Each resized rung is checked against its canonical resized reference. Resizing changes resolution; it is not a claim that a smaller rendition contains the source's original pixel count. A format that changes pixels is discarded. Each offered format has a complete responsive width ladder. If the largest replacement would be bigger than the original, delivery keeps the original. The original file is retained for saving, with its real MIME type and name.

For movies, `video.delivery` selects:

- `video`: the existing native video codec ladder.
- `frames`: independent image chunks, with a full keyframe at each chunk boundary and exact replacement patches thereafter. Frames carry source presentation times and durations. Unchanged images reuse the same content-addressed file. Optional audio is stream-copied into a separate track. HDR, unsupported timing, nonzero audio/video start offsets and output-budget exhaustion are explicit M020 failures. Auto mode retains native playback for them.
- `auto`: compare the unchanged source, packet-preserving native container changes, qualified native codec encodes and image chunks. Native wins ties. Image chunks must have both fewer encoded bytes and a lower delivery byte cost than the actual native winner. Losing artifacts are discarded before publication. Frame preparation stops early when it exceeds the winning native payload budget.

The automatic delivery cost includes actual encoded files, image compatibility fallbacks, chunk manifests, the asset manifest and a conservative 64 KiB image-player allowance. Retained originals and posters are common to every path; they are excluded from added variant storage. The receipt reports encoded bytes, added storage, manifest bytes and the player allowance separately. This is a conservative byte comparison, not a measurement of device CPU, GPU, energy or cloud billing: decode CPU remains explicitly `unmeasured`.

Native automatic candidates retain the source dimensions, every frame timestamp and duration, and unchanged encoded audio with its start time. Extra tracks, HDR and unsupported audio containers retain their source. Container changes also require identical encoded video packets. Codec search uses a bounded initial trial, then the final full movie must pass five source-frame-aligned SSIMULACRA2 checks, each at or above the target. This is sampled perceptual qualification, not a claim that every native video frame was scored. An unsuccessful search or missing scorer never becomes a fixed-quality automatic winner.

`video.lossless` overrides the image setting for playback. `true` verifies exact decoded pixels; `false` requires the configured SSIMULACRA2 tool and scores every complete reconstructed frame against `quality.target`. A missing scorer keeps the original in auto mode and fails forced frame delivery. Scores, target and mode are recorded. AVIF fallbacks decode to the same pixels as the selected image, preventing patch drift across browsers. Originals always keep their exact bytes for Save.

A frame record is rendered automatically by `<Media>`. Its player fetches only the current and next chunk records, prefetches at most three compressed images concurrently with an 8 MiB cache, releases decoded bitmaps immediately, skips obsolete full frames, seeks directly to an independent chunk, and uses standard image decoding rather than requiring `ImageDecoder`. `timeline(asset)` and the `playback` callback expose the same play, pause and current-time contract for native movies and image frames. `controls={false}` keeps an application's existing controls.

Exact pixels are different from a perceptual quality target. The existing `quality.target` mode searches measured quality when a scorer is installed and labels fixed settings when one is not. Re-encoding already compressed movie pixels as lossless still images can be larger than the original movie. Do not promise a compression ratio before measuring real sources.

## Background versus intent preparation

`encoder: 'compatible'` enables the compatibility-copy record. `swap: 'intent'` quietly prepares/swaps a compatible copy around hover, right-click, long-press or drag; `idle` permits background work; `never` disables swaps. Existing native-save restrictions on large movies still apply. A canvas frame player requires an explicit original-file download action to save the entire movie; its native image context menu can only save the displayed frame.

For a gallery with many animations, use **`swap: 'manual'`** and open the application's small progress dialog only on right-click. Call the shared API then, not once per artwork on mount:

```ts
import {
  prepareMediaSave,
  type MediaAsset,
  type PreparedMediaSave,
} from '@kerf-js/core/media'

export function saveController(
  asset: MediaAsset,
  link: HTMLAnchorElement,
  status: HTMLElement,
) {
  let controller: AbortController | undefined
  let result: PreparedMediaSave | undefined
  return {
    async prepare() {
      controller?.abort()
      result?.release()
      controller = new AbortController()
      result = await prepareMediaSave(asset, {
        signal: controller.signal,
        onProgress(phase) { status.textContent = phase },
      })
      link.href = result.url
      link.download = result.name
      link.hidden = false
    },
    close() {
      controller?.abort()
      result?.release()
      link.hidden = true
    },
  }
}
```

`prepareMediaSave` checks the retained original before exposing its URL; the actual file is fetched by the browser when Save is clicked. This preserves original bytes, metadata, type and name without wasting CPU reconstructing a file that already exists. A missing original fails explicitly. It never substitutes an optimized image or flattens a movie/GIF to one frame.

Generated stills without a retained source can be encoded to PNG or explicitly requested JPEG in a disposable browser worker. The worker is terminated on completion, cancel or failure. Browsers without worker canvas support use their native canvas encoder. A result owns its object URL until `release()`; no encode starts until this API is called. PNG preserves the browser-decoded raster. JPEG is a compatible re-encode, not a promise of original bytes. Keep the original whenever exact-file recovery matters.

## Provenance

The pre-rename WEFT request and research are preserved in [the original asset design](https://github.com/Ravonus/kerf/blob/archive/evals-2026-11/docs/research/15-assets.md). That historical document describes intent and measured experiments; this reference describes implemented API behavior. The original implementation supplied native video ladders and prebuilt compatibility copies. Frame chunks, exact-pixel raster mode, manual save preparation and the disposable browser encode worker are subsequent additions and must be tested as such.

## Sharp first frames

`createFirstFrameBuild()` from `@kerf-js/media/build` prepares a movie's first decoded frame as a responsive AVIF/WebP still. Call `build({file}, {cacheDir, encode})` with the same FFmpeg provider bindings. The default widths are 384, 640, 960 and 1600, capped by the source. Every perceptual rung meets the requested SSIMULACRA2 target; a missing scorer uses verified exact pixels. AVIF is offered only when its complete ladder is smaller at every rung than the compatible fallback. No enlarged blur placeholder is emitted. Cache identity includes the actual source bytes, encoder and image library versions. These generated stills are previews; Save continues to use the movie's retained original.

Show this still before starting the movie, and replace it only after the first live frame is presented. Keep preview loading separate from intent-only original preparation. Automatic movie comparisons use an initial quarter-second trial and can reject a costly candidate from that bounded trial's projected byte rate; that is recorded as a projection. A selected replacement still requires actual full-output byte savings and quality/timing/audio qualification.

## Browser startup and background warming

`@kerf-js/media/browser` is framework-independent. `mediaConnection()`, `mediaBandwidth()` and `initialMediaLevel(levels, width, height, connection, pixelRatio)` choose a rendition that fits the display and connection. The lowest rung is reserved for data saver, 2G or a measured downlink below 0.75 Mbps; missing network hints use an ordinary-quality estimate. Keep the exact first-frame picture visible until playback paints, without a crossfade. A tiny still is an optional fallback for very slow networks.

`warmMediaStarts([{url: '/streams/work/master.m3u8', width: 640, height: 360}])` starts a cancellable background queue. It waits six seconds, fetches one same-origin start at a time with low priority, and warms only the chosen playlist, initialization fragment and first complete HLS fragment into the ordinary HTTP cache. It never warms the complete movie. The default response-body allowance is 512 KiB per minute (128 KiB on slow connections), with a 256 KiB limit per response and four seconds between artworks (15 on slow links). Oversized, encrypted and byte-range playlists are skipped. Save-data mode disables speculation. Hidden tabs pause and abort in-flight work; buffering foreground videos defer the next start. Cancel the returned handle when the route unmounts. Unavailable media keeps its normal playback error path; warming never substitutes another artwork.

### Predict media before it enters the viewport

Import `observeMediaViewport` from `@kerf-js/media/browser`. It reports
`{ visible, intersecting, preparing, anticipating }` and returns a disposer.
`preparing` is the point to attach a source and load its sharp first frame;
`anticipating` permits a muted player to start shortly before entry. Keep manual
pause, reduced motion, menu state and document visibility in the player's lifecycle.
At most two offscreen works prepare at once, one on slow connections, none with
Save Data. The lead follows real scroll speed, reversals and known scrollbar
intent. A scrollbar may dispatch `kerf:scroll-target` on window with `{ top }` in
its detail before moving; Veneer's `scrollPage` emits this automatically.
