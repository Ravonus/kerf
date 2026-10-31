# 15 — Assets: the media optimizer, layout-driven responsive images, and the background compatibility encoder

Research date: 2026-10-28. Versions come from `npm view` on that date unless a source is cited. Browser support comes
from `@mdn/browser-compat-data` 8.1.7 (published 2026-10-22; current releases: Chrome 156, Firefox 158, Safari 27).
Statements marked **(unverified)** could not be confirmed from a primary source. Numbers marked **(measured)** were run
for this doc on an M4 Max (load average 5–34, other agents running) with ffmpeg 9.0.1, libavif 1.4.2 (aom 3.14.1),
libwebp 1.6.0, libjxl 0.12.0, SVT-AV1 4.2.0, sharp 0.34.4, `ssimulacra2` (libjxl tools), headless Chrome
156.0.8078.48 and Playwright's WebKit 26.0. Numbers marked **(derived)** are my arithmetic on a measured figure.
Numbers marked **(guess)** are starting budgets to replace after the first real measurement. Scripts and outputs are
throwaway and live outside the repo, in the session scratchpad (`assets/tools`, `assets/out`).

**The ask (from the user):**
> "i want an asset optimizer too, but this one instead of just making it webp, or avif whatever is best (even for gifs
> and videos - they can have audio synced with a function if they have audio) but i want a smart encoder like i have
> done with my keel stuff and it still encodes with original type in the background, smart based on client, and view,
> and everything, and then slightly replaces them without user knowing even if they are playing a live video or
> whatever, and so then when they right click save its in formats that work in stuff - this should be toggleable as it
> will increase size of package as well - and or it just optimizes best way without encoder if toggled off. optimizer
> should work with blurs, thumbnails, and everything else, and be smart and auto make them for you for specific items
> based on size and container and everything"

That breaks into four products, and they are designed separately here:
1. **An optimizer** (always on): the best format per asset, picked by measuring, not by a fixed rule (§3).
2. **Layout-driven derivatives** (always on): widths, `sizes`, thumbnails, posters, blur placeholders and dominant
   colours, all generated from what weft knows about each element's box (§4).
3. **A background compatibility encoder** (a toggle, off by default): the page shows the efficient file, and a
   widely compatible copy quietly takes its place, so right-click "Save as" gives a JPEG, PNG, GIF or MP4 (§5).
4. **A media timeline** for animated assets: `currentTime`, `playing` and cue callbacks as weft boxes, so audio and
   code can sync to a GIF that has become a video (§3.4).

**Constraints from PLAN:** §2 rules (one way, every failure is a diagnostic, agent-first, small runtime); §3.7 budgets
(runtime ≤ 6 KB, HMR ≤ 50 ms p95, prod build ≤ 5 s for 1k components); §4.3 (`native()`/`remote()` Rust only for
byte payloads and ≥ 1 ms of CPU, never a required binary); §5 and §5b (Surfaces; `weft-layout` on Taffy); §6.2 and
[11 §7](11-text-and-type.md) (shape skeletons, X030 for undimensioned media); §7c and [13](13-plugins.md) (typed
slots, providers, P-codes, 0 KB when unused); [08](08-builder-and-compiler.md) (Vite 8/Rolldown, filtered hooks,
precompression, brotli budgets).

---

## TL;DR

1. **KEEL's encoder is a verifier, not a chooser** (§1). It takes an explicit recipe, re-encodes, then proves the
   candidate by decoding every frame: per-frame RGBA SHA-256 for lossless, and frame count, timestamps (±0.51 ms),
   dimensions, ICC profile, loop count and PCM audio for everything. Its "capabilities" describe the *encoding host*
   (is sharp present, is the pinned ffmpeg's SHA-256 right, does this browser's WebCodecs encode VP9), and it
   explicitly refuses to claim the *viewer* can decode anything (`browserDecode: "requires-runtime-check"`). It has
   no perceptual metric, no viewer adaptation, no responsive widths and no placeholders. weft keeps its discipline
   (immutable originals, digest-bound plan → apply, hash-pinned codecs, full-decode verification, explicit audio loss)
   and adds the parts it doesn't have.
2. **Pick the format by measuring at equal SSIMULACRA2, never by a fixed q** (measured, §3.2). Across three real
   images at a "high" target (SSIMULACRA2 80), **AVIF was the smallest every time**: 35.6 / 29.3 / 23.6 KB, against
   WebP 51.6 / 40.6 / 38.7 KB, JPEG XL 48.7 / 47.1 / 40.8 KB and mozjpeg 69.5 / 101.3 / 101.4 KB. That is 49–77% under
   JPEG. Lossy WebP could not reach SSIMULACRA2 90 on two of the three images at any `q`. JPEG XL never won a lossy
   row; it wins one niche, **lossless JPEG transcoding** (−11.9%, byte-identical round trip, measured).
3. **Default delivery set: AVIF + one compatible fallback.** AVIF is in Chrome 85, Firefox 93 and Safari 16.4; WebP is
   only worth emitting where AVIF is missing. JPEG XL is in Chrome 155, Firefox 158 and Safari 17 but **not Edge**
   (BCD), so it is an opt-in format, not a default. The fallback is the asset's *original family* (JPEG for photos,
   palette or lossless PNG for UI and alpha, GIF only when asked), which is also the "save as" copy (§5).
4. **GIFs become video, chosen by bytes at equal quality** (measured, §3.3). A 1.30 MB UI spinner GIF became 75 KB
   of VP9 (−94%) or 145 KB of H.264 at SSIMULACRA2 80. VP9 beat AV1 by 42% on that flat content. A high-entropy
   noise GIF got 70–180% *bigger* in every codec, so "keep the GIF" is a real outcome of the search.
   The conversion also gives GIFs things they never had: pause and seek, reduced-motion posters, real audio, and a
   timeline API (§3.4).
5. **Quality metric per content type** (measured, §3.5). SSIMULACRA2 for stills and for sampled frames of animations.
   **VMAF is unusable on flat UI animation**: an H.264 encode at CRF 14 of a spinner GIF scored VMAF 85.1 at SSIM
   0.99993. VMAF is kept only for natural video.
6. **Responsive images come from layout, not guesses** (§4). The compiler knows each `<Media>`'s ancestor chain of
   warp primitives (`Grid min`, `Split width`, `Center max`, `Frame ratio`). `weft-layout` (Taffy, PLAN §5b) solves
   that chain headless at a fixed set of viewport widths, giving a piecewise width function. From it, weft emits
   `sizes` as a media-query list (CSS `sizes` can't name containers) and exactly the widths × DPRs that are used.
   Unknown CSS falls back to `sizes="auto"` (lazy images only; Chrome 126, Firefox 150, Safari 27 partial). The
   measured byte step: 7.4 → 13.0 → 18.6 → 32.0 KB AVIF at 400 / 600 / 800 / 1200 px (graphic.jpg).
7. **Placeholders: a 16 px WebP data URI by default, ThumbHash where there is no CSS** (measured, §4.3). The tiny WebP
   is 70–80 bytes (119–131 characters inline), needs **0 bytes of JS**, and had the best colour-layout fidelity (PSNR
   21.9–22.7 dB at 32×32, vs ThumbHash's 20.4–20.6 and BlurHash's 18.5–19.2). ThumbHash is 28 characters but needs a
   1.1 KB br decoder, so it is kept in the manifest for Surfaces, native hosts and shape records. Tiny AVIF is a
   loser: ~300 bytes of container for 16 px.
8. **The invisible swap works, and the hard part isn't images** (measured, §5.3). In Chrome and WebKit, swapping an
   `<img>`'s `src` showed **0 blank frames and CLS 0** in every run (the old image stays painted until the new one is
   ready), with or without `img.decode()`. weft still decodes first, because it costs nothing and protects the slow
   paths. Video is different: a naive `src` swap mid-playback showed a blank frame in 3 of 6 runs and media-time jumps
   up to 250 ms. A **second muted `<video>` started at a matched frame via `requestVideoFrameCallback`** showed **0
   blank frames in 6 runs**, flipped within one frame (|Δ| ≤ 40 ms at 24 fps), and kept the frame gaps at the
   no-swap baseline. MSE `changeType()` is rejected, because a MediaSource plays from a `blob:` URL and "Save video
   as" can't save it.
9. **The swap runtime is 454 bytes brotli** (measured, the prototype in §5.3). The real cost of the toggle is
   bandwidth, not code. A compatible JPEG at the same SSIMULACRA2 is 2–4× the AVIF, so `swap: 'idle'` roughly triples
   the bytes for that image. The default trigger is therefore **intent** (right-button down, `contextmenu`, long press,
   `dragstart`), with `idle` reserved for assets whose compatible copy is ≤ 1.5× the efficient one.
10. **Where encoding happens:** build time by default (`encoder: 'background'` pre-generates the copies). An on-demand
    Nitro endpoint (`'server'`) handles uploads and CMS images, cached by content hash, with an optional Rust sidecar.
    The client (WebCodecs, canvas) is an escape hatch only: canvas → JPEG took 17.7 ms for 1200 px and 152 ms for
    5120 px, and WebCodecs H.264 encoded 240 frames at 960×540 in 1.3 s, in Chrome (measured).
11. **Live video can't be "swapped" for saving, and doesn't need to be** (§5.5). Every live player is MSE or WebRTC,
    which have nothing to save. The answer is a download action that remuxes the H.264 rung, which every ladder
    already carries, into MP4 with `-c copy` (no re-encode).
12. **Packaging (§6, §8):** `@weft/plugin-media` provides `media.analyze@1`, `media.encode@1` (keyed by codec),
    `media.quality@1` and `media.cdn@1`.
    - **Bundled:** sharp/libvips (Apache-2.0 + LGPL-3.0) for AVIF/WebP/JPEG/PNG, SVGO, and a SSIMULACRA2 crate in
      `crates/weft-media` (napi).
    - **Opt-in:** ffmpeg (LGPL, or GPL with x264/x265; H.264/HEVC carry patent pools), JPEG XL, CDN providers and the
      WASM client codecs.
    - **New diagnostic prefix:** `M001`–`M016`.
    - **Phase placement:** 2 (with warp tier 1) for images; 3 for the server endpoint; 3c for video and the encoder
      toggle.
13. **Verdict:** the build-time optimizer, layout-derived `sizes` and placeholders are clear wins. GIF→video is a big
    win. The background encoder is worth shipping as an **off-by-default toggle with intent-triggered swaps**; as an
    always-on default it would cost more bandwidth than the optimizer saves.

---

## 1. What KEEL's encoder actually does

Sources read (read-only): `keel-sdk/packages/builder/src/media-optimization.ts`, `media-preparation.ts`,
`media-edit-recipe.ts`, `media-pair-verification.ts`, `temporal-webp.ts`, `initial-media-budget.ts`,
`media-slot-plan.ts`, `packages/protocol/src/smart-presentation.ts`, `tools/keel/media-optimize.mjs`,
`docs/KEEL_MEDIA_PREPARATION.md`; `keel-site/docs/BROWSER_MEDIA_CONVERSION.md`,
`apps/studio/src/lib/{local-media-conversion.worker,local-media-conversion-policy,media-capabilities,media-candidate-coordinator}.ts`;
`keel-engine/packages/capture/OFFLINE_MP4.md`. The `keel` MCP tools `media-optimize`/`media-optimize-apply` call
`planMediaOptimization`/`applyMediaOptimization`. `keel-media-candidate`/`-compare`/`-capabilities` call
`prepareMediaCandidate`/`compareMediaFrames`/`getMediaPreparationCapabilities`. Studio uses the same three over HTTP
(`/api/build-lab/media`). `docs/tools/gif-forward-reference/` is an on-chain GIF *publication* verifier. It contains
no encoder.

### 1.1 Two generations

| | `planMediaOptimization` (gen 1, `media-optimize`) | `prepareMediaCandidate` (gen 2, `keel-media-candidate`) |
|---|---|---|
| Input | A file path, plus optional `quality`, `effort`, `videoCrf`, `videoCpuUsed` | Bytes plus an explicit recipe `keel-media-edit@1`: `{mode: original\|lossless\|lossy, format: webp\|avif\|mp4\|mov\|webm, quality 1–100, noSound, width?, height?, crop?, rotate?, layers?}` |
| Codec choice | **None**. One adapter per kind: image → sharp WebP q82 effort 6; video → VP9 CRF 32 cpu-used 4 + Opus 96k; GLB → glTF-Transform `dedup` + `prune` | **The caller's.** The format is in the recipe. CRF = `round((100 − q) × 0.51)`, fed to libaom AV1 (yuv444p, cpu-used 6), libvpx-vp9 or libx264 (`libx264rgb` CRF 0 for lossless). Animated image → `libwebp_anim` |
| Success test | `afterBytes < beforeBytes`, else `candidate-not-smaller` | A complete decode of source and candidate (below) |
| Apply | Dry run returns the output's SHA-256 and byte length. Apply re-encodes and refuses unless both match, writes only to a new path, and re-reads the source to prove it didn't change | No apply. The caller stages `candidatePath` next to the retained original, and the original's hash stays the identity |

The Studio UI adds **automatic recipes** (`automaticMediaRecipes`). They are lossless only:
- video → `webm`, `mp4`, plus `webp` and `avif` only when a digest-bound inspection proves the movie is silent;
- animated image → `webp`;
- still → `webp`, `avif`.

They are filtered by the advertised capabilities and ranked by `mediaCarriageSaving`, the difference in *base64 data-URI*
length, because KEEL ships media inside on-chain metadata. "Base64 ties always keep the original."

### 1.2 How it compares quality

- **There is no perceptual metric anywhere.** Quality is either "lossless, proven" or "lossy, explicitly chosen by a
  person".
- **Lossless proof:**
  - `decodeImage` (sharp, `animated: true`) or `decodeMovie` (ffmpeg `framehash` with SHA-256 over RGBA) hashes every
    decoded frame of both files. The hashes must match one to one.
  - Timing comes from a separate `-c copy` packet pass and must match the decoded PTS exactly.
  - Audio is decoded to `pcm_f64le` and hashed in 1,024-sample blocks. Duration minus AAC priming must match.
- **Lossy:** structure only. These must all hold:
  - frame count, timestamps and durations within 0.51 ms, and dimensions;
  - the ICC profile hash, and the loop count;
  - audio presence.

  Anything outside the verifier's model is refused with the original retained: HDR or high bit depth, orientation
  transforms, non-sRGB, multiple video streams, SAR ≠ 1 and WebM container metadata. Server-side WebM conversion was
  withdrawn on 2026-10-22 because the verifier couldn't qualify its container semantics.
- **Visual comparison is a tool, not a score.** `compareMediaFrames({bytes, recipe, timeMs})` returns the original
  and candidate frame as PNGs *at the same source timestamp*. It never compares two independently playing
  animations. A person or agent looks at the pair.

### 1.3 How it uses "capabilities"

- **The encoding host, not the viewer:**
  - `getMediaPreparationCapabilities()` reports whether sharp imports, and whether ffmpeg-static 5.3.0 is installed
    with a binary whose SHA-256 is on a per-platform allowlist. Machine-local ffmpeg is deliberately ignored.
  - Live result on this Mac (measured, MCP `keel-media-capabilities`): image `webp`/`avif` available; movie
    unavailable, "The pinned ffmpeg-static binary is not installed for this platform."
- **The browser path** (Studio worker) probes the *converting* browser:
  - WebCodecs `VideoEncoder`/`VideoDecoder.isConfigSupported` for `vp09.00.10.08`;
  - `OffscreenCanvas.convertToBlob({type: 'image/webp'})`;
  - a jSquash WASM fallback whose size and SHA-256 are checked before instantiation.

  Limits: 16 MiB in, 720p, 10 s, 60 fps, 600 frames. Each request runs in a disposable worker with an 8 s probe and
  a 30 s deadline. Audio is removed only on an explicit choice; otherwise the server path is used.
- **The viewer is never assumed.** Every candidate says `browserDecode: "requires-runtime-check"`. Viewer-side
  decisions live in the *smart presentation* planner (`planKeelSmartAssetPresentation`). It picks a delivery route
  from **measured byte budgets** (a 500,000-byte inline asset, a 1,750,000-byte image URI, a 2,000,000-byte tokenURI)
  and a **qualified renderer profile** of MIME types. It never uses codec sniffing.

### 1.4 GIF and video with audio

- **GIF is animation, never a still.** `classifyKeelAssetMotion` inspects the bytes, and unknown motion never takes
  the still-image cost exception.
- **GIF → animated WebP** (image path):
  - sharp decodes every page with its delay array, and libwebp encodes.
  - `assignTemporalWebPDelays` then rewrites each `ANMF` frame duration to the exact source delay, because the encoder
    infers the last delay.
  - Delays ≤ 10 ms are refused: "Native WebP readers may clamp this source's short frame delays".
  - Animated AVIF is refused on this path.
- **GIF → movie:**
  - Constant delay: the decoded RGBA goes to ffmpeg as `rawvideo` at `1000/delay` fps.
  - Variable delays: per-frame PNGs plus an `ffconcat` manifest become an APNG timeline first.
  - After encoding, if the muxer guessed the last duration, a `setts` bitstream filter rewrites each packet's
    duration to the source delay without re-encoding. The timeline is then verified again.
- **Video with audio:**
  - `-map 0:a? -c:a copy`, so audio is stream-copied untouched unless `noSound` is explicit.
  - Image formats refuse a source with audio ("Image output cannot retain audio. Enable No sound explicitly").
  - Gen 1 re-encoded audio to Opus 96 kbps.
  - `keel-engine/capture` writes offline MP4 as H.264 High 4.2 at 20 Mbps, 2 s keyframes and AAC-LC 320 kbps, with
    timestamps from frame indices, never from rAF.

### 1.5 What weft takes, and what it adds

| KEEL idea | weft use |
|---|---|
| The original is immutable and its hash is the identity | The cache key is `sha256(source) + recipe + encoder versions`. The original is always kept, as the compatibility copy or the source of one |
| A digest-bound plan → apply | `weft media plan --json` reports what *would* be emitted. The build applies exactly that plan, keyed by hash |
| Hash-pinned codec binaries; refuse anything unpinned | `media.encode` providers declare binary digests in `permissions` (13 §2.9). P109 fires if they widen |
| Full-decode verification of frames, timing, loop and audio | A conformance suite for `media.encode@1` (§6.3). Every GIF→video conversion is verified for frame count, timing and loop |
| Explicit loss: `noSound`, lossy mode | Audio is never dropped silently (M005 covers the reverse case). Lossy is the default *with a stated target* |
| Capabilities reported as data | `weft media capabilities --json`, which lists host encoders, and per-browser support from BCD. They are reported separately and never conflated |
| The frame-at-time compare | `weft media compare <asset> --at 1.2s` writes the PNG pair for an agent |
| **Missing in KEEL** | A perceptual target (§3.5), viewer adaptation (§5.1), widths and `sizes` from layout (§4), placeholders (§4.3), a background compatibility swap (§5), a timeline API (§3.4) |

---

## 2. Prior art (what exists, and what weft does differently)

| Tool | What it does | What weft takes or leaves |
|---|---|---|
| `next/image` + Vercel Image Optimization | On-demand resize at a fixed set of `deviceSizes`/`imageSizes`, one format per `Accept`, `sizes` written by hand. Defaults: 8 device widths and 8 image widths; `quality` 75 **(unverified for the current major)** | Server mode (§5.4) works like this. Hand-written `sizes` is the thing weft removes |
| Astro `<Image>`/`<Picture>` (sharp) | Build-time variants, `widths`/`densities` by hand, `layout: 'constrained' \| 'full-width'` generates `sizes` from the layout keyword | Closest prior art for `sizes` from a layout keyword. weft computes it from the real ancestor chain |
| Nuxt Image / IPX, imgproxy, Cloudflare Images, Cloudinary, Imgix | URL-parameter transformers with `f=auto` and `Accept` negotiation | They become `media.cdn@1` providers (§6) |
| `vite-imagetools` | Import-query directives (`?w=400;800&format=avif`) | weft's `?media` import is the same entry point, with no directives needed |
| Squoosh / jSquash | WASM builds of mozjpeg, libwebp, libavif, oxipng and libjxl | The client-side `media.encode` provider (opt-in), as KEEL already pins them |
| ThumbHash, BlurHash, Plaiceholder, `sharp().stats().dominant` | Tiny placeholders | Measured in §4.3; tiny WebP wins on the web |
| Mux, Cloudflare Stream, YouTube | Per-title ABR ladders, codec per client | The video ladder (§3.4), simplified for short clips |

---

## 3. The build-time optimizer (always on; what you get with the encoder off)

### 3.1 Pipeline

```
source (import './hero.jpg?media', <Media src="./hero.jpg">, public/ refs → M013)
  │
  ├─ media.analyze@1 ─▶ kind (photo | graphic | ui | pixel | vector | animation | video), w×h, alpha, palette size,
  │                     frames + delays, audio, colour space / depth / HDR, orientation, saliency box, dominant colour
  │
  ├─ layout pass (§4) ─▶ rendered-width function per use site → widths × DPR, sizes, crops
  │
  ├─ media.encode@1 × media.quality@1 ─▶ per format: smallest bytes at the target score (§3.2), at one reference width;
  │                                      the found knob is reused for the smaller widths
  ├─ derivatives ─▶ poster, thumbnails, LQIP, ThumbHash, dominant colour, intrinsic w/h
  └─ manifest .weft/media/<hash>.json  +  emitted files in dist/assets/m/<hash>-<w>.<ext>  (immutable, br/gz n/a)
```

- **Cache:** content hash + recipe + provider versions → `.weft/media-cache/` (git-ignored) and an optional shared
  cache, the CI artifact or a bucket. A warm build does no encoding.
- **Dev:** `weft dev` serves the *source* resized with a fast single encode (WebP or AVIF at speed 10). The quality
  search never runs on the HMR path. Media files are never `.tsx`, so the §3.7 50 ms budget is untouched (P108 = 0).
- **Determinism:** fixed encoder versions and fixed `-threads` for bit-exact outputs where the codec allows it (as
  KEEL's `-fflags +bitexact`). Encoders that aren't bit-exact across machines are cached by input hash, not
  re-verified by output hash.

### 3.2 Still images: measured size at equal quality

Method:
- Each source was decoded to PNG as the reference.
- For each codec, I binary-searched its quality knob for the smallest file scoring at least the target SSIMULACRA2
  (90 ≈ "visually lossless", 80 ≈ "high", 70 ≈ "medium").
- Encoder settings:
  - JPEG: sharp/mozjpeg;
  - WebP: `cwebp -m 6 -sharp_yuv`;
  - AVIF: `avifenc -s 6`, defaults otherwise;
  - JPEG XL: `cjxl -e 7`, distance from the knob.
- Sources (copied from KEEL, read-only):
  - **graphic**: a 1200×630 OG JPEG with a photographic render (94.7 KB);
  - **screenshot**: a 1200×735 UI screenshot PNG (194.6 KB);
  - **render**: a 1280×1001 PNG of pixel art plus UI (299.3 KB).

| Image | Target | JPEG (mozjpeg) | WebP | **AVIF** | JPEG XL | Best |
|---|---|---|---|---|---|---|
| graphic | 90 | 94.6 KB | **can't reach** | **70.2 KB** | 83.5 KB | AVIF −26% vs JPEG |
| graphic | 80 | 69.5 KB | 51.6 KB | **35.6 KB** | 48.7 KB | AVIF −49% |
| graphic | 70 | 44.9 KB | 38.2 KB | **23.5 KB** | 32.7 KB | AVIF −48% |
| screenshot | 90 | **can't reach** | 94.0 KB | **55.6 KB** | 86.2 KB | AVIF |
| screenshot | 80 | 101.3 KB | 40.6 KB | **29.3 KB** | 47.1 KB | AVIF −71% |
| screenshot | 70 | 54.1 KB | 32.7 KB | **21.6 KB** | 35.5 KB | AVIF −60% |
| render | 90 | **can't reach** | **can't reach** | **44.3 KB** | 67.4 KB | AVIF |
| render | 80 | 101.4 KB | 38.7 KB | **23.6 KB** | 40.8 KB | AVIF −77% |
| render | 70 | 56.4 KB | 33.8 KB | **15.9 KB** | 30.1 KB | AVIF −72% |

Lossless and palette PNG, same sources (measured):

| Image | PNG lossless (ffmpeg, max) | WebP lossless | JPEG XL lossless | AVIF lossless | Palette PNG (sharp `effort: 10`): bytes / SSIMULACRA2 |
|---|---|---|---|---|---|
| graphic | 489.8 KB | 312.8 KB | 278.8 KB | 434.1 KB | 217.7 KB / 83.9 |
| screenshot | 192.2 KB | **134.8 KB** | 141.2 KB | 235.8 KB | **67.0 KB / 89.8** |
| render | 266.0 KB | **164.4 KB** | 231.0 KB | 363.9 KB | 95.7 KB / 90.7 |

Encode time per candidate at these sizes (measured, threaded):
- mozjpeg: 31–52 ms;
- cwebp `-m 6`: 81–124 ms;
- avifenc `-s 6`: 63–159 ms;
- cjxl `-e 7`: 64–141 ms.

One SSIMULACRA2 evaluation takes 0.13–0.20 s through the CLI (it includes PNG I/O). A full 7-step search is therefore
about 2 s per codec per image **(derived)**.

What this decides:
- **AVIF is the default efficient format.** It won all nine lossy rows. It is the only format that reached 90 on every
  image.
- **WebP is not a default output.** It lost every row to AVIF and couldn't reach 90 on two images. Its 4:2:0 chroma
  hurts sharp UI edges even with `-sharp_yuv`. It stays as the fallback where AVIF isn't decodable (old Edge before
  121) and as the animated-image format (§3.3).
- **JPEG XL is opt-in** (`formats: ['avif', 'jxl']`):
  - Lossy, it sat between WebP and AVIF at 80 and 70. It beat WebP at 90.
  - Support is Chrome 155, Firefox 158 and Safari 17 (stills only); Edge has none (BCD 8.1.7). Measured: Chrome 156
    and WebKit 26 decoded a `.jxl`, and Chrome 156 now sends `image/jxl` first in its image `Accept` header.
  - **Its one clear win is lossless JPEG recompression.** `cjxl graphic.jpg` gave 83.4 KB (−11.9%), and `djxl`
    returned a **byte-identical** JPEG (measured). That is the only efficient format that *contains* the compatible
    copy.
- **The compatible fallback copy follows the source family.** Its quality knob is searched to the same target:
  - photo → mozjpeg (the 90-target JPEG of graphic equals the source size, so a JPEG source at ≤ its own width is
    simply kept);
  - UI, screenshot or alpha → **palette PNG** when it scores ≥ the target (screenshot: 67 KB at 89.8, a third of the
    lossless PNG), else lossless PNG;
  - pixel art → lossless PNG at integer scale (the optimizer never resamples pixel art with a smooth kernel;
    `kind: pixel` uses nearest neighbour, as KEEL's capture does).
- **Lossless sources stay lossless only when asked** (`quality: 'lossless'`). For UI, lossless WebP was the smallest
  true-lossless format (134.8 KB vs PNG 192.2 KB); AVIF lossless was worst.
- **SVG:**
  - SVGO with a safe preset;
  - never rasterised, except for derived thumbnails;
  - KEEL's `classifyKeelAssetExecution` rule is ported: an SVG with `<script>`, `foreignObject`, `on*=` handlers, or
    external `href`/`src` is M012 and is never inlined.
  - Icons below 1 KB are inlined as `<svg>` only when used once per route. Otherwise they are emitted as files.

### 3.3 Animated content: GIF → video or animated image

Method:
- Same idea as §3.2, scored by **SSIMULACRA2 on 8 evenly spaced frames** (mean ≥ 80; the minimum is reported). VMAF
  is reported but not used (§3.5).
- The video codecs are searched over CRF. The animated formats are searched over `gif2webp -lossy -q` and
  `avifenc -q` (from a 4:4:4 y4m).
- Sources:
  - **spinner**: 1200×1200, 241 frames at 50 fps, 1.30 MB. A typical UI loading GIF: flat, mostly white, one moving
    arc.
  - **noise**: 520×400, 61 frames at 33 fps, 1.81 MB. High-entropy texture, the worst case for any codec.

| GIF | Codec | Knob | Bytes | vs GIF | SSIMULACRA2 mean / min | Encode (one step) |
|---|---|---|---|---|---|---|
| spinner (1.30 MB) | **VP9 WebM** | CRF 48 | **75.0 KB** | **−94%** | 80.4 / 79.1 | 3.2 s |
| spinner | AV1 MP4 (SVT, preset 6) | CRF 32 | 130.2 KB | −90% | 80.2 / 75.5 | 1.1 s |
| spinner | HEVC MP4 | CRF 32 | 134.4 KB | −90% | 80.0 / 76.8 | 3.1 s |
| spinner | H.264 MP4 (the compatible copy) | CRF 28 | 145.1 KB | −89% | 81.0 / 78.2 | 0.6 s |
| spinner | animated AVIF | q 60 | 100.4 KB | −92% | not scored (ffmpeg 9 can't decode AVIF sequences for frame sampling) | 4.1 s |
| spinner | animated WebP (`gif2webp -lossy`) | q 70–76 | 0.98–1.13 MB | −13 to −25% | not reached in time (one step took ~2.5 min) | ~150 s |
| noise (1.81 MB) | HEVC MP4 | CRF 19 | 3.07 MB | **+70%** | 82.5 / 80.6 | 1.5 s |
| noise | H.264 MP4 | CRF 16 | 3.26 MB | +80% | 80.3 / 79.4 | 0.6 s |
| noise | VP9 WebM | CRF 26 | 3.29 MB | +82% | 81.1 / 80.1 | 1.2 s |
| noise | AV1 MP4 | CRF 24 | 3.35 MB | +85% | 80.5 / 78.7 | 0.8 s |
| noise | animated WebP | q 73 | 5.07 MB | +180% | 80.5 / 80.1 | 44 s |

Readings (all measured):
- **Typical UI GIFs shrink by an order of magnitude.** The spinner went from 1.30 MB to 75 KB (VP9) and 145 KB for
  the H.264 copy that every browser plays.
- **The winner differs per asset.** VP9 beat AV1 on the flat spinner by 42%. SVT-AV1 at preset 6 is tuned for
  natural video, so "AV1 always wins" is wrong for UI content. That is why the codec is searched, not fixed.
- **High-entropy GIFs must stay GIFs.** Every candidate for the noise GIF was 70–180% *larger* at the target, because
  the 256-colour palette already threw the detail away and a video codec spends bits re-describing dithering. The
  "keep the GIF when nothing is ≥ 15% smaller" rule exists for this case.
- **Animated WebP is never the winner** on either GIF, and `gif2webp -m 6` is 50–250× slower than the video encoders.
  It is kept only for the alpha case.
- **Cost:** one search is 7 steps, so 4–25 s per GIF for the video codecs **(derived)**.

How it decides:
- **The candidate set per GIF is** H.264 MP4 (the universal compatible copy), AV1 MP4, VP9 WebM, HEVC MP4 (only for
  Safari-first targets), animated AVIF and animated WebP.
- **The winner is the smallest at the target.** The served set is `[winner, H.264 MP4]` as `<video>` sources. When the
  winner is an animated *image*, it is served as `<img>` and the GIF itself (or an H.264 MP4) is the compatible copy.
- **Keep the GIF** when it is under 8 KB, or under 4 frames, or when every candidate is less than 15% smaller **(guess
  thresholds)**.
- **The `<video>` replacement is** `<video autoplay muted loop playsinline disablepictureinpicture>` plus the poster
  (§4.4). A GIF's exact delays are preserved with KEEL's method: CFR when the delays are constant, an APNG/concat
  timeline plus `setts` duration rewrite when they vary. The timeline is verified after encoding.
- **Semantics GIF→video must keep or change on purpose:**
  - **Loop count** (GIF `NETSCAPE2.0`) → `loop`, or a counted loop in the timeline runtime when it is finite.
  - **Transparency** → only animated WebP or AVIF, or VP9 with alpha (Chrome and Firefox only). An alpha GIF never
    becomes H.264.
  - **Accessibility:** an `<img alt>` becomes `<video aria-label>` with `role="img"`, and gains a pause control when it
    runs longer than 5 s (WCAG 2.2.2, M011).
  - **Right-click:** an `<img>` GIF saves as a GIF. A `<video>` saves as whatever it plays. That is why the encoder
    toggle has a GIF branch (§5.2).

### 3.4 Video ladders, audio, and the media timeline

**Ladder.** Short clips (UI demos, heroes, product loops) don't need HLS or DASH. weft emits progressive files with
`moov` at the front (`+faststart`) and one rung per needed width (§4). Codecs:

| Codec | Container | Role | Support (BCD / MediaCapabilities, measured in Chrome 156 and WebKit 26) |
|---|---|---|---|
| AV1 | MP4 (or WebM) | Efficient default where it decodes smoothly and power-efficiently | Chrome: supported, smooth, power-efficient. Playwright WebKit 26: **not supported** (Safari proper decodes AV1 only with hardware **(unverified on this build)**) |
| VP9 | WebM | Fallback efficient codec for Firefox and old Chrome | Chrome and WebKit: supported, smooth, power-efficient |
| HEVC | MP4 (`hvc1`) | Opt-in for Apple-first apps, smaller than H.264 at the same score | Chrome and WebKit: supported, smooth, power-efficient (Chrome via the platform decoder) |
| H.264 | MP4 | **The compatible copy, always emitted**: plays everywhere and saves as `.mp4` | Universal |
| Opus | WebM, MP4 | Efficient audio; Chrome plays Opus in MP4, **WebKit 26 does not** (measured) | Opus in WebM: all |
| AAC-LC | MP4 | Compatible audio | Universal |

Measured, same method (sampled SSIMULACRA2 mean ≥ 80, video stream only; audio is added at the bitrates below):

| Clip | Source | H.264 | HEVC | VP9 | AV1 (SVT preset 6) |
|---|---|---|---|---|---|
| tour: 16 s, 960×540, 24 fps, screen recording | 182.9 KB (H.264, already web-encoded) | 124.3 KB, CRF 28 (min frame 72.4) | 122.3 KB, CRF 30 (71.4) | 99.8 KB, CRF 43 (73.9) | **74.4 KB**, CRF 55 (min **55.2**) |
| chase: 4 s, 960×540, 30 fps, game footage | 1.49 MB (H.264) | 2.07 MB, CRF 18 | 3.11 MB, CRF 16 | 3.47 MB, CRF 16 | **did not reach 80** even at CRF 15 |

Encode time per step: H.264 0.6–1.2 s, AV1 0.7 s, HEVC 2.3–4.5 s, VP9 2.5–2.7 s.

Readings:
- **AV1 wins screen recordings on the mean but hides bad frames.** At CRF 55, the tour clip's worst sampled frame
  scored 55. A mean-only target lets the encoder trade a few ugly frames (scene cuts, text appearing) for bytes. This
  is why the target is "mean ≥ T **and** min ≥ T − 5". Under that rule none of these encodes pass, and the search
  continues to a lower CRF.
- **Re-encoding an already web-encoded video can't win at a fixed perceptual target.** chase.mp4 is a lossy H.264
  source. Reaching SSIMULACRA2 80 *against that lossy source* cost more than the source itself in every codec. The
  rule: when the source is already a delivery codec at or below the needed width, keep it as the H.264 rung and only
  add an efficient rung if it is ≥ 15% smaller at the target. The same rule as GIFs.
- **VMAF from this harness is not trustworthy for WebM.** It reported 7–22 for VP9 encodes that SSIMULACRA2 scored
  80 and that looked identical. That is consistent with timestamp misalignment in `setpts=N` pairing, on top of the
  flat-content problem in §3.5. VMAF needs frame-exact alignment (`-fps_mode passthrough` on both inputs) before it
  can gate anything.

- **Order of `<source>`:** `[av1.mp4, vp9.webm, h264.mp4]`. `type` carries an exact codec string from the encode. In
  `encoder: 'background'` mode, the runtime picks the source itself from `MediaCapabilities.decodingInfo`, preferring
  `powerEfficient` (§5.1).
- **Audio:**
  - Opus at 96 kbps with AV1 and VP9; AAC-LC at 128 kbps with H.264. For the 16 s test clip that is 192 KB vs 256 KB
    **(derived from bitrate)**.
  - Audio is never dropped implicitly (KEEL's rule).
  - A source that has audio and is used as a muted background loop is **M005** unless it is marked `audio="drop"`,
    which saves those bytes, or `muted`.

**"Audio synced with a function": the media timeline.**
- **What it is:** every animated `<Media>` (a GIF-turned-video, a video, an animated AVIF or WebP served as video)
  exposes a timeline. It is a set of weft boxes, so code syncs to it with `derived` and `watch`, the same way as
  everything else.
- **Audio:** one way to give an animated asset audio is to mux it at build: `import loop from './dance.gif?media'`
  with `audio: './beat.opus'` in the import options. The GIF and the beat go into one MP4/WebM, so they are in sync by
  construction, because the container's clock drives both.
- **Cues:** cue callbacks give "run this function at 1.2 s". Cues are frame-accurate when `requestVideoFrameCallback`
  exists (Chrome 83, Firefox 132, Safari 15.4), and fall back to rAF on `currentTime`.

```ts
// weft/media — the timeline is a box bundle, like query() results
import { Media, timeline } from 'weft/media'
import dance from './dance.gif?media&audio=./beat.opus'   // build muxes audio into the video rungs

export function Hero() {
  const t = timeline(dance, {
    cues: { drop: 1.2, chorus: 8.0 },            // seconds; cue ids are typed from this object
    loop: true,
  })
  // t.currentTime: State<number>   (write = seek)       t.playing: State<boolean>   (write = play/pause)
  // t.duration: Derived<number>     t.ended: Derived<boolean>   t.cue: Derived<'drop' | 'chorus' | null>
  // t.on('drop', fn) — runs in the frame the cue is presented (rVFC), cleaned up with the owner
  const glow = derived(() => t.cue.value === 'drop')
  t.on('chorus', () => confetti())

  return (
    <Stack>
      <Media src={dance} timeline={t} alt="Dancing mascot" />
      <Button onClick={() => (t.playing.value = !t.playing.value)}>{t.playing.value ? 'Pause' : 'Play'}</Button>
      <Badge tone={glow.value ? 'good' : 'neutral'}>beat</Badge>
    </Stack>
  )
}
```

- **Rules:**
  - `currentTime` updates once per *presented frame*, not per rAF and not per `timeupdate` (which fires every 15–250
    ms). A 30 fps clip writes the box 30 times per second, and that is one DOM leaf update per frame. `toTouchAtMost`
    applies.
  - **Writes are commands:** `t.currentTime.value = 3` seeks; `t.playing.value = false` pauses. A `watch` that writes
    `currentTime` from `currentTime` is W003.
  - **Autoplay policy:** a timeline with audio starts `playing: false` until a user gesture. `t.playing.value = true`
    outside a handler before any gesture is **M005** at build when it is statically visible, and a typed
    `NotAllowedError` in `t.error` at runtime.
  - **Reduced motion:** when `prefers-reduced-motion: reduce` holds, `playing` starts `false` and the poster shows.
    The app can override it per element (`motion="always"`, which a lint flags at a site-wide level).
  - **SSR:** `currentTime: 0`, `playing: false`, and the poster renders. Cues never fire on the server.
  - **Surfaces:** `s.media(dance)` gives the same timeline, plus `s.frame()` access to the current `VideoFrame` for
    WebGL textures (`texImage2D` from the video element, or `importExternalTexture` on WebGPU).

### 3.5 Quality targeting: which metric where

| Content | Metric | Why (measured or cited) |
|---|---|---|
| Stills (photo, UI, pixel) | **SSIMULACRA2** (libjxl's; Rust crate `ssimulacra2` for in-process) | Tracks subjective quality across codecs. One evaluation takes 0.13–0.20 s at ~1 MP through the CLI (measured). Targets: 80 "high" by default; 85 for `priority` (LCP) images; 70 for thumbnails |
| Animation (GIF → *) | **SSIMULACRA2 on 8 sampled frames**: the mean meets the target and the minimum is ≥ target − 5 | VMAF failed here: H.264 CRF 14 of the spinner scored **VMAF 85.1 at SSIM 0.99993** (measured). VMAF's features are trained on natural video and penalise flat synthetic content |
| Natural video | **VMAF** (libvmaf in ffmpeg 9) for the ladder, at target 93; SSIMULACRA2 frames as a cross-check | The industry ladder metric; cheap inside ffmpeg |
| Butteraugli | Not used as a target | Not shipped as a CLI here. libjxl uses it internally (`cjxl -d` *is* a Butteraugli distance), so `jxl` encodes get it for free |

- **Search:** at most 7 encode → decode → score steps per format, at the **largest needed width only**.
  - The knob found there is reused for smaller widths; downscaled images score higher at the same knob, so this errs
    on quality.
  - The search warm-starts from the knob last found for the same `kind` in this project, which usually needs 2–3
    steps **(guess)**.
- **A fixed `q` exists only as a fallback:** when no `media.quality` provider is installed, `quality: 'fast'` maps
  straight to per-codec knobs (AVIF q 55, JPEG q 80, WebP q 80 **(derived from the 80-target rows above)**).

---

## 4. Responsive generation from layout ("smart based on size and container")

### 4.1 Knowing the box

- **The problem:** CSS `sizes` is a list of *media* conditions. It can't say "this image is 1/3 of its container",
  and a container query can change the box without the viewport changing. Every framework makes the author write
  `sizes` by hand, or uses `100vw` (Next's default, which over-fetches).
- **What weft has that nobody else does:** a closed layout vocabulary, plus a headless layout engine.
  - warp primitives carry closed tokens. `Grid(min, cols, gap)`, `Split(width: rail|nav|list|half, at)`,
    `Center(max: measure|narrow|content|wide)`, `Frame(ratio)` and `Stack`/`Row` gaps all resolve to px at a given
    viewport from tokens (warp 02 §3).
  - `crates/weft-layout` (Taffy, PLAN §5b) computes flexbox, grid and block layout headless. Node's layout already
    matched the phone to 0 pt over 769 nodes in the 6a spike.

**The layout pass**, at build. It runs per `<Media>` use site, in the compiler's existing semantic pass, as data only
(13 §2.4):
1. The compiler records the element's **ancestor chain up to the route root**, as primitive + props, when every
   ancestor is a warp primitive, a `Surface`, or a component whose root is one. The chain is a tiny tree:
   siblings are kept only where they share a track (Grid columns, Split panes).
2. `weft-layout` solves the chain at a fixed probe set of viewport widths: 320, 360, 390, 414, 600, 768, 1000, 1280,
   1440 and 1920, plus each warp `Step`. That gives `width(vw)`, which is piecewise linear between the probes.
3. That function becomes:
   - **`sizes`:** one `(max-width: Xpx) Ypx` or `calc(a*100vw + b)` entry per linear segment, merged when the error is
     under 4%. This is how a container query becomes a viewport query: the solver already folded the container into
     the function.
   - **Widths:** the set `{ width(vw) × dpr : vw ∈ probes, dpr ∈ {1, 2, 3} }`, capped at the source width, then
     bucketed so that neighbouring files differ by ≥ 20% in bytes (they are encoded and then deduplicated; the byte
     step measured below).
4. **DPR cap:** 2 for `photo`, 3 for `ui`/`graphic`/`pixel`, where text edges show **(guess; revisit with a
   SSIMULACRA2 run at 3× vs 2× upsampled)**.

When the chain isn't statically known (raw CSS classes, a third-party wrapper, a dynamic `style`):
- **Below the fold:** `loading="lazy" sizes="auto"`. The browser uses the laid-out width. Support: Chrome 126,
  Firefox 150, Safari 27 (partial, BCD). Older engines treat `auto` as invalid and fall back to `100vw`, which is
  wasteful but correct.
- **Above the fold:** this is **M010**. The fix is to wrap the element in a warp primitive, or to pass `width="1/3"`
  or `sizes`. LCP images can't use `sizes="auto"`, because it applies only to lazy images.
- **Dev checks prediction against reality:** in `weft dev`, each `<Media>` samples its real rendered width on mount
  (`ResizeObserver`, once), like X001. A drift over 15% from the predicted function is **M010** with the measured
  numbers.

Measured byte step (graphic.jpg, AVIF q 55 / mozjpeg q 83):

| Width | AVIF | JPEG |
|---|---|---|
| 400 | 7.4 KB | 12.3 KB |
| 600 | 13.0 KB | 23.2 KB |
| 800 | 18.6 KB | 38.1 KB |
| 1200 | 32.0 KB | 69.5 KB |

A card that renders at 380 px on a phone at 3× wants ~1140 w. The same card at 1/3 of a 1280 desktop at 2× wants
~800 w. Shipping the source width (1200) to the desktop costs +72% bytes over what's needed **(derived)**. This is the
whole point of layout-derived widths.

### 4.2 Art direction: crop focus and saliency

- When a `Frame ratio` (or the solved box) differs from the source aspect by more than 10%, the image is cropped
  *visually* with `object-fit: cover` and `object-position` set to the **focus point**. That costs no extra bytes.
- **Where the focus comes from**, in order:
  1. a `focus={[x, y]}` prop or `?media&focus=0.3,0.4`;
  2. a face or object box from `media.analyze` (opt-in providers);
  3. libvips' `attention` strategy (sharp `position: 'attention'`, which uses saturation, skin tone and edges);
  4. the centre.
- **Real crops (new files)** are produced only when the visible region is < 70% of the source pixels at some step.
  Then the bytes saved justify a `<picture><source media>` per step, emitted from the same solved breakpoints. They
  are never produced for `pixel` art; that uses integer-fit letterboxing (Keel's `integerFit`).
- The focus point is also used for thumbnails (§4.4) and for the poster frame choice on video.

### 4.3 Placeholders: LQIP vs ThumbHash vs BlurHash (measured)

Each placeholder was scored by colour-layout fidelity: PSNR at 32×32 against the source downscaled to 32×32. That is
"are the right colours in the right places", which is the placeholder's only job. Bytes are as inlined.

| Image | ThumbHash: b64 chars / PSNR | BlurHash 4×3: chars / PSNR | **WebP 16 px: data-URI chars (bytes) / PSNR** | AVIF 16 px: chars (bytes) / PSNR | AVIF 32 px: chars / PSNR |
|---|---|---|---|---|---|
| graphic | 28 / 20.54 | 28 / 18.48 | **119 (70) / 21.90** | 415 (292) / 21.96 | 479 / 24.75 |
| screenshot | 28 / 20.42 | 28 / 19.20 | **119 (72) / 22.67** | 423 (299) / 23.14 | 479 / 24.45 |
| render | 28 / 20.56 | 28 / 18.77 | **131 (80) / 22.04** | 435 (308) / 22.44 | 535 / 25.22 |
| GIF frame (noise) | 28 / 33.91 | 28 / 32.96 | **87 (46) / 35.80** | 623 (449) / 35.49 | 623 / 35.87 |

Runtime cost (measured, esbuild + brotli):
- ThumbHash decoder (`thumbHashToRGBA` + `rgbaToDataURL`): **1,127 B**;
- BlurHash decoder: 860 B;
- tiny WebP: **0 B** (the browser decodes it).

Encode cost: ThumbHash 1.3–5.3 ms, BlurHash 2.8–4.3 ms.

- **Web default: the 16 px WebP data URI** (~120 characters), as `background-image` on the media box, with `background-size: cover`.
  - Bilinear upscaling of 16 px already reads as a blur. `image-rendering: auto` is enough, so no `filter: blur()`
    (which costs paint) is needed.
  - It needs no JS and works with JS disabled and in SSR HTML. It beats ThumbHash on fidelity at 4× the bytes, and
    those bytes are paid once in HTML that is compressed anyway.
- **ThumbHash** (28 chars) is stored in the manifest for:
  - **native hosts** (UIKit/Views have no CSS data URIs; the Swift/Kotlin host decodes ThumbHash in ~1 ms);
  - **canvas Surfaces**;
  - **`query.shape` records** for dynamic media (11 §7.1), where 28 chars beat 120.

  It supports alpha and encodes the aspect ratio. BlurHash is not used: it has no alpha, and it lost on fidelity in
  every row.
- **The dominant colour** (`sharp().stats().dominant`) is the `background-color` underneath the LQIP. It shows on the
  first paint before the data URI decodes, and it fills skeleton bars in `pending="shape"`. It is 7 bytes.
- **Pixel art** uses a 4–8 px nearest-neighbour PNG LQIP (`image-rendering: pixelated`), never a blur.
- **The LQIP is skipped when the bytes don't pay:**
  - for images whose full file is < 2 KB;
  - for `priority` images whose full file is < 20 KB and preloaded **(guess)**;
  - for decorative images under 64 px.

### 4.4 Thumbnails, posters and intrinsic dimensions

- **Thumbnails are just more widths.** A `<Media>` used inside an `Avatar`, a `List` leading slot or a `Grid min="xs"`
  card gets its widths from the solver like any other use. There is no separate "thumbnail" API.
- **Named presets** exist only for non-DOM consumers: Open Graph (1200×630, JPEG, ≤ 300 KB), favicons and
  app icons (`weft icons` from one SVG), and email (JPEG/PNG only).
- **Posters for video and animated media:**
  - The frame is chosen at the first scene-stable frame after 0.5 s, by lowest temporal difference near the
    focus box. `poster={1.2}` overrides it.
  - It is encoded as AVIF at the rendered widths, plus the LQIP.
  - The poster is what reduced-motion users and SSR see. It is the video's LCP element until the first frame.
  - A video without one is M006, and `<Media>` always generates one.
- **Intrinsic dimensions are always written:** `width`/`height` attributes from the source (or the crop), plus CSS
  `aspect-ratio`. So X030 can't fire on a `<Media>`.
- **Dynamic sources** (uploads, CMS) get their dimensions from:
  1. **the record:** `weft/start`'s upload helper stores `{width, height, lqip, thumbhash, dominant}` at upload, and
     `z.media()` is the Zod codec for that record, so `query.shape` knows the aspect ratio;
  2. **a bounded header probe** on the server before SSR (KEEL's 256 KiB `media-header-guards` approach: PNG, JPEG,
     GIF, WebP and AVIF headers);
  3. otherwise M016.

### 4.5 Tie-in with smart skeletons (11 §7)

- **The shape variant of a component** renders each `<Media>` as its box: the aspect ratio from the manifest (static)
  or from `z.media()` in the output schema (dynamic). The fill is the dominant colour, with the LQIP on top when it is
  known. A known image therefore looks like a blurred version of itself inside the skeleton, not a grey bar.
- **Last-seen shape records** (11 §7.1) store per-image aspect ratio (already planned), plus the ThumbHash for
  repeat views.
- **The no-flash rule holds:** the LQIP is part of the reserved box from the first paint. When the real image decodes,
  it is painted over the same box (decode, then show), so the swap moves nothing. Measured CLS for image swaps in §5.3
  was 0.
- **X030 is owned by plugin-media when it is installed.** It moves from "add width/height" to "use `<Media>`" (the
  autofix), and the raw `<img>` case outside boundaries is M001.

---

## 5. The smart runtime encoder (optional, toggleable)

`media({ encoder: 'off' | 'background' | 'server' })`. **`'off'` is the default.**

### 5.1 Delivery: picking the variant for this client, view and network

| Signal | Source | Available where (BCD) | Used for |
|---|---|---|---|
| Image codecs | `Accept` on the image request (measured, Chrome 156: `image/jxl,image/avif,image/webp,…`) | All engines send `Accept` for images | Server mode negotiates on it (`Vary: Accept`). Static mode uses `<picture><source type>` |
| Video codecs, smooth, power-efficient | `navigator.mediaCapabilities.decodingInfo()` | Chrome 66, Firefox 63, Safari 13 | Picking the `<video>` source. Prefer `powerEfficient`; on battery-limited devices (below) never pick a non-power-efficient codec |
| Viewport, DPR, width | `sizes` + `srcset` (the browser decides); `Sec-CH-Width` / `Sec-CH-DPR` | Client hints: Chrome only | Static: the browser chooses from layout-derived `srcset`. Server: hints only refine an `f=auto&w=auto` URL, never required |
| Visibility | `IntersectionObserver`, `loading="lazy"` | All | Lazy by default except `priority`. Video rungs load `preload="none"` off-screen, and pause when hidden (`visible` from `weft/browser`) |
| Save-Data, effective type | `Save-Data` header, `navigator.connection` | **Chrome only** | Lower the target by 10 points (80 → 70) and cap DPR at 1.5. Never swap in compatible copies under Save-Data |
| Device power | `navigator.deviceMemory`, `hardwareConcurrency`, the `powerEfficient` flag | `deviceMemory`: Chrome only | Under 4 GB, pick the power-efficient decoder and never start client encoding (§5.4c) |
| Reduced data and motion | `prefers-reduced-data` **(unverified support; not in BCD)**, `prefers-reduced-motion` | Motion: all | Posters instead of autoplay |

- **The runtime chooser is small** (part of the 454 B prototype's budget, §5.3). On mount it calls `decodingInfo` for
  each declared `<source>` (cached per codec string per session) and sets `src` on the best one. Without the runtime
  (`encoder: 'off'`), plain `<source type>` order does the same job less precisely, using `canPlayType` instead of
  `smooth`/`powerEfficient`.
- **What "smart" is not:** no device database, no UA sniffing, no per-request encode decisions on the edge in static
  mode. Every decision above is a standard signal with a documented fallback.

### 5.2 The background compatibility copy

**Goal:** right-click "Save image as" / "Save video as", drag-to-desktop and long-press "Save to Photos" produce a
file that opens in old Photoshop, Office, Discord and email. That means JPEG, PNG, GIF or MP4 (H.264/AAC), not AVIF or
WebM.

**What gets produced at build** (`encoder: 'background'`):

| Source | Efficient (displayed first) | Compatible copy (swapped in) |
|---|---|---|
| JPEG photo | AVIF at the target | **The original JPEG** when its width ≤ the largest rendered width × DPR; else a mozjpeg resize at the target. Opt-in: JXL lossless transcode as the efficient file, since it reconstructs the exact JPEG |
| PNG UI / alpha | AVIF | Palette PNG if ≥ target (screenshot: 67 KB at 89.8), else lossless PNG |
| GIF | The §3.3 winner (`<video>` or animated AVIF/WebP) | **The original GIF**, resized only if it is over the rendered size |
| Video | AV1 / VP9 rungs | H.264 + AAC MP4, at the largest rendered rung |
| SVG | Minified SVG | Same file (SVG saves fine) |

The cost is **package size**: the compatible copies add roughly the sum of the originals' sizes to `dist/`. That is
why it is a toggle, and `weft media plan --json` prints the delta before you turn it on.

### 5.3 How the swap works without anyone noticing (prototyped and measured)

Prototype (`assets/page/swap.js`, 1,056 B minified, **454 B brotli**), measured in headless Chrome 156 with a CDP
screencast of every compositor frame, sampling the media box for the magenta page background. Polled screenshots in
WebKit 26.

**Images:**

```js
export async function swapImage(img, url, srcset) {
  const n = new Image()
  if (srcset) { n.sizes = img.sizes; n.srcset = srcset } else n.src = url
  await n.decode()          // fetched + decoded off-DOM; the URL is now in the document's list of available images
  await raf()
  if (srcset) img.srcset = srcset; else { img.removeAttribute('srcset'); img.src = url }   // same box: no shift
}
```

| Scenario (compatible copy delayed 300 ms by the server) | Runs | Blank frames | CLS | `currentSrc` after |
|---|---|---|---|---|
| Chrome, 1200 px: naive `img.src = jpg` | 3 | 0 | 0 | `hero.jpg` |
| Chrome, 1200 px: decode-then-swap | 3 | 0 | 0 | `hero.jpg` |
| Chrome, 5120 px: naive / decode | 3 + 3 | 0 / 0 | 0 / 0 | `big.jpg` |
| WebKit 26, 5120 px: naive / decode (polled screenshots) | 2 + 2 | 0 / 0 | 0 / 0 | `big.jpg` |

- **Why naive also worked:** the HTML spec keeps the *current request* painted until the *pending request* is
  complete, so the old AVIF stays visible during the fetch. Decode-then-swap took one screencast frame fewer (2 vs 3)
  in every Chrome run: the image was already decoded when the `src` changed.
- **weft still decodes first.** It costs nothing extra (the bytes are fetched once and served from the memory cache),
  and it closes the paths this test didn't cover: Firefox (not measured here), images with `decoding="sync"`, and very
  large images on slow devices, where the raster-time decode can drop a frame.
- **Rules that make it invisible:**
  - The compatible copy has **identical intrinsic dimensions** (or the same aspect ratio at a srcset width), so layout
    never changes. `width`/`height` attributes are fixed.
  - `srcset` is swapped *as a set* (the compatible copies at the same widths), so the browser's width choice doesn't
    change.
  - `<picture>`: the `<source type="image/avif">` elements are removed in the same frame. Otherwise the `<source>`
    keeps winning.
  - Colour: the compatible copy is encoded from the *same decoded source*, at a quality ≥ the efficient file's score.
    A swap therefore never visibly *drops* quality.

**When to swap** (the `swap` option):
- **`'intent'` (default):** swap on `contextmenu`, on `pointerdown` with `button === 2`, on long-press (touch
  `contextmenu` on Android; iOS 500 ms touch-hold), on `dragstart`, and on `copy`.
  - Measured: in a CDP right-click, `contextmenu` followed `mousedown` within **0.1 ms**. On macOS the menu opens at
    mousedown. So there is **no time to prefetch** before the menu.
  - The handler sets `src` synchronously. The old image stays painted (shown above), and `currentSrc` is the pending
    URL.
  - **Measured in 3c (headed Chromium and Firefox 157, real X11 right-clicks, `packages/plugin-media/test/save.headful.mjs`):**
    Chromium's "Save image as" uses the URL set inside `contextmenu`. Firefox does not: the menu reads the image's
    current request, so even a swap at `pointerdown` saved the AVIF. `'intent'` therefore starts at a 150 ms hover,
    which costs the fallback's bytes for mouse hovers. A fast right-click with no hover in Firefox still gets the
    efficient file. Setting `video.src` inside `contextmenu` loses the save item in Chromium, and replacing the video
    with an `<img>` there saved nothing; a near-transparent `<img>` over the video saves the GIF in both. Safari is
    unverified.
- **`'idle'`:** after `load` + `requestIdleCallback`, for visible media only, and only when the compatible copy is
  ≤ 1.5× the efficient file and Save-Data is off. This is the only mode where *every* save gets the compatible file
  with no unverified browser behaviour. It costs the extra bytes for every viewer.
- **`'never'`:** the compatible copy is only reachable through `download` links.

**Video:**

```js
export async function swapVideo(a, url, { lead = 0.6 } = {}) {
  const b = document.createElement('video')
  b.muted = true; b.playsInline = true; b.preload = 'auto'; b.src = url
  b.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;opacity:0'
  a.parentElement.append(b)
  await once(b, 'loadeddata')
  const T = a.currentTime + lead
  b.currentTime = T; await once(b, 'seeked')                       // B parked on the frame A will reach in `lead` s
  const waitA = (_, m) => m.mediaTime + fd / 2 >= T - fd           // A's rVFC: about to present T
    ? (b.play(), b.requestVideoFrameCallback(() => {               // B's first presented frame:
        b.style.opacity = '1'; a.style.opacity = '0'               //   flip pixels and audio in the same frame
        b.muted = a.muted; a.muted = true
        requestAnimationFrame(() => { a.pause(); a.remove() })
      }))
    : a.requestVideoFrameCallback(waitA)
  a.requestVideoFrameCallback(waitA)
}
```

Measured, Chrome 156, a 960×540 24 fps clip with audio, AV1/Opus WebM → H.264/AAC MP4 at t ≈ 2.7 s:

| Strategy | Runs | Blank frames | Largest frame gap | Largest media-time jump | Flip offset (B − A) |
|---|---|---|---|---|---|
| No swap (baseline) | 3 | 0 | 100–117 ms | 58–75 ms | — |
| Naive `v.src = mp4; v.currentTime = t; play()` | 6 | **3 of 6 runs had 1** | 100–417 ms | 75–250 ms | — |
| **Dual `<video>` + rVFC** | 6 | **0** | 100–117 ms (= baseline) | 58–75 ms (= baseline) | −40 … +23 ms (≤ 1 frame) |

The baseline gaps come from a headless, loaded machine (screencast at ~23 fps), so the comparison is relative. The
dual swap is indistinguishable from not swapping. The naive swap is visible.

**Per-browser choice:**

| Browser | Video swap strategy | Why |
|---|---|---|
| Chrome, Edge | Dual `<video>` + rVFC | Measured above. rVFC since Chrome 83 |
| Firefox | Dual `<video>` + rVFC | rVFC since Firefox 132. **(Not measured here; Firefox isn't installed.)** Gate on a Firefox lane |
| Safari | **Usually no swap needed.** WebKit's best power-efficient choice is HEVC or H.264 MP4, which is already compatible. When AV1 or VP9 is playing, dual + rVFC (Safari 15.4) | Measured: Playwright WebKit 26 doesn't decode AV1, and does decode VP9/HEVC/H.264 smooth and power-efficient |
| Any, while the user is scrubbing, in PiP, casting or fullscreen | Postpone the swap | Changing elements breaks those sessions. PiP and Remote Playback hold the element |
| **MSE `SourceBuffer.changeType()`** | **Rejected for this goal** | It switches codecs at a keyframe without a second element (Chrome 70, Firefox 63, Safari 12.1). But the element then plays a `blob:` MediaSource URL, which "Save video as" can't save. It fixes playback, which wasn't broken, and breaks saving, which was the point |
| `contextmenu` → point the download at the MP4 | Complement, not a replacement | Native video menus save `currentSrc`. warp's `<Media controls>` overflow menu has "Download" pointing at the compatible file (`<a download>`, universal). `controlsList="nodownload"` hides the native button so there is one download path |

- **Video swaps are `'idle'`-only and capped.** The second element downloads the H.264 copy from the lead point
  onwards, which is extra bandwidth for every viewer who watches on. So: `swapVideo: 'idle'` only for clips whose
  compatible copy is ≤ 2 MB **(guess)**; otherwise the warp menu's Download item. A GIF-turned-video uses the same
  rule: its compatible copy is the GIF, saved through the menu or swapped as an `<img>` when paused.

### 5.4 Where encoding happens

| | (a) Build: every variant pre-generated | (b) Server: on-demand endpoint + cache | (c) Client: WebCodecs / canvas / WASM |
|---|---|---|---|
| For | Every asset known at build (imports, `?media`, `public/` refs) | Uploads, CMS and remote URLs not known at build | Local-first or offline apps; user-generated media before upload |
| How | `media.encode` providers in the build, cached by hash | Nitro route `/_weft/m/<hash>/<w>.<fmt>` (a server-side slot, P118-clean). It encodes once with sharp in-process; `native('media')` (napi) for the hot path; `remote('rust://media')` for video (PLAN §4.3: byte payloads, ≥ 1 ms CPU). Then it caches in Nitro storage (fs, S3, R2) with `Cache-Control: public, max-age=31536000, immutable` and `Vary: Accept` on the negotiated alias | Images: `OffscreenCanvas.convertToBlob({type: 'image/jpeg'})`. Video: WebCodecs + Mediabunny (MPL-2.0, as KEEL) |
| Cost (measured) | Per still ~2 s per searched format, cold (§3.2); warm 0 | First request pays the encode (sharp ~40–160 ms per image at 1.2 MP; video seconds to minutes → queued, the original served meanwhile) | Canvas → JPEG: **17.7 ms** at 1200×735, **152 ms** at 5120×4004 (Chrome). WebCodecs H.264, 240 frames at 960×540: **1.3 s** |
| Quality | Searched to target | Searched once per hash, then cached | **Generation loss:** AVIF → JPEG re-encodes a lossy decode. And `blob:` URLs save as a nameless file **(unverified)** |
| Verdict | **Default** | **Default for dynamic media** | **Escape hatch only**, behind `encoder: { client: true }`, never on devices < 4 GB or under Save-Data |

The CDN alternative is `media.cdn@1` (§6): delegate (b) to Cloudflare Images, imgproxy or Vercel. weft then only
builds URLs and still writes widths, `sizes`, dimensions and placeholders from its own analysis.

### 5.5 Live video: what's actually possible

- **Live is always MSE (HLS.js, dash.js, Shaka), native HLS (Safari) or WebRTC.** In all three, the element's
  `currentSrc` is `blob:`, a playlist or a `MediaStream`. Right-click "Save video as" is disabled or saves nothing
  useful. There is nothing to swap *for saving*.
- **Codec switching mid-live is a playback feature, and players already do it.** ABR switches renditions at segment
  boundaries, and `changeType()` allows a codec change (AV1 → H.264) there. weft doesn't re-implement this. A
  `<Media live>` hands the manifest to a pluggable player (`media.player@1` is a candidate slot for Phase 3c+ **(not
  in the initial table)**).
- **The compatible download for live is a server action.** `media.clip({ from, to })` makes the server remux the
  ladder's H.264 rung segments (every ladder carries one for compatibility) into a faststart MP4 with `-c copy`. That
  is cheap, with no re-encode. The result is offered as a download. For WebRTC, the server recorder (or
  `MediaRecorder` in the client, opt-in) does the same.
- **"Slightly replaces them … even if they are playing a live video":** this is honoured as *the player switching
  quality or codec silently*, which ABR already does. The "save" half is the download action.

### 5.6 Encoder off: what the optimizer does by itself

With `encoder: 'off'`:
- **Emitted:**
  - every efficient variant (AVIF, plus WebP if `formats` asks);
  - the compatible fallback only where a browser in the target list can't decode the efficient format. With today's
    support that is a JPEG/PNG for `<picture>`'s final `<img>`, at the smallest needed width only;
  - all derivatives (widths, `sizes`, LQIP, dominant colour, posters, dimensions).
- **Video:** the full ladder including H.264, because H.264 is a *playback* fallback anyway.
- **GIFs:** converted to video when that wins. "Save as" then gives the efficient format, and that is the accepted
  trade.
- **The runtime is 0 KB.** No swap code and no `decodingInfo` chooser. `<picture>`/`<source>` order does the selection.
- `M014` (info) says how many bytes `encoder: 'background'` would add, so the trade is visible.

---

## 6. Plugin slots (13's model)

### 6.1 Slots

| Slot | Card. | Sides | Default when no provider | First-party providers |
|---|---|---|---|---|
| `media.analyze@1` | one | build, server | **Bundled in plugin-media:** sharp metadata + stats, a bounded header probe, ffprobe when an ffmpeg provider is present | `@weft/plugin-media` (sharp); `@weft/plugin-media-vision` (faces and objects for focus, opt-in) |
| `media.encode@1` | **keyed by codec** (`image/avif`, `image/webp`, `image/jpeg`, `image/png`, `image/jxl`, `image/svg+xml`, `video/av1`, `video/vp9`, `video/hevc`, `video/h264`, `audio/opus`, `audio/aac`) | build, server, worker, client | Bundled: sharp for the four image keys, SVGO for SVG. **Video and audio keys are unbound** → a video asset is P101 at its import, with the autofix "add `mediaFfmpeg()`" | `@weft/plugin-media` (sharp, SVGO), `@weft/plugin-media-ffmpeg` (video, audio, GIF→video), `@weft/plugin-media-jxl` (libjxl), `@weft/plugin-media-rust` (ravif/rav1e/image-rs via `crates/weft-media`, napi; for Deno/edge also WASM), `@weft/plugin-media-wasm` (jSquash codecs, client/worker side) |
| `media.quality@1` | one | build, server | `null` → `quality: 'fast'` fixed knobs, reported as such in `weft plugins` | Bundled: SSIMULACRA2 via `crates/weft-media` (Rust `ssimulacra2` crate, napi). VMAF comes with the ffmpeg provider |
| `media.cdn@1` | one | build, server | `null` → weft serves its own files (static) or its own endpoint (server mode) | `@weft/plugin-media-cloudflare`, `-imgproxy`, `-vercel`, `-cloudinary` |

- **Why keyed `media.encode`:** two real providers per key exist (sharp vs ravif for AVIF; ffmpeg vs WebCodecs for
  H.264), and different keys come from different packages. 13 §2.2's rule (a slot needs two real providers or an
  absent mode) holds for all four slots.
- **No slot for the swap runtime or the timeline.** They are plugin-media's own code, reached through `weft/media`'s
  lazy `load()` (P114): 0 KB when `encoder: 'off'` and no timeline is used.
- **Interfaces (sketch):**

```ts
// weft/slots — media
export interface MediaAnalyzeV1 {
  analyze(input: Bytes, hint?: { path: string; mediaType?: string }): Promise<MediaInfo>   // bounded: limits in options
}
export interface MediaInfo {
  kind: 'photo' | 'graphic' | 'ui' | 'pixel' | 'vector' | 'animation' | 'video' | 'audio'
  width: number; height: number; alpha: boolean; orientation: 1 | 3 | 6 | 8
  colour: { space: 'srgb' | 'p3' | 'rec2020' | 'unknown'; depth: 8 | 10 | 12 | 16; hdr: boolean; icc?: string }
  frames?: { count: number; delaysMs: number[]; loop: number }        // animation
  video?: { codec: string; fps: number; durationMs: number }; audio?: { codec: string; channels: number; durationMs: number }
  dominant: `#${string}`; thumbhash: string; lqip: { webp16: string }; focus?: [number, number]; saliency?: Box
  executable?: boolean                                                 // SVG with script etc. (KEEL classifier)
}
export interface MediaEncodeV1 {
  readonly key: MediaCodecKey
  encode(input: Decoded | Bytes, recipe: { knob: number; width?: number; crop?: Box; effort: 'fast' | 'normal' | 'max'; lossless?: boolean; audio?: AudioRecipe; timeline?: Timeline }): Promise<Bytes>
  decode?(bytes: Bytes): Promise<Decoded>                              // for the quality loop and verification
  readonly knob: { min: number; max: number; higherIsBetter: boolean }
  readonly versions: Record<string, string>                           // goes into the cache key
}
export interface MediaQualityV1 { score(ref: Decoded, dist: Decoded, metric: 'ssimulacra2' | 'vmaf'): Promise<number> }
export interface MediaCdnV1 {
  url(asset: AssetRef, opts: { width: number; format: 'auto' | MediaCodecKey; quality: number; crop?: Box; focus?: [number, number] }): string
  readonly negotiates: boolean                                         // does it honour Accept (f=auto)?
}
```

### 6.2 What is bundled vs opt-in, with licences

| Component | Licence | Patents | Default? |
|---|---|---|---|
| sharp 0.35.5 (npm, 2026-10-28) | Apache-2.0 | — | **Bundled** (image encode/analyze) |
| libvips + prebuilt deps (`@img/sharp-libvips-*`) | LGPL-3.0-or-later (dynamically linked) | AVIF via libheif + aom (BSD-2, royalty-free AOM licence) | **Bundled.** The prebuilt binaries don't encode HEIC/HEVC and don't include libjxl **(unverified for 0.35)** |
| Palette quantisation inside sharp | Sharp's docs name libimagequant; prebuilt binaries are said to use a permissive replacement **(unverified)**. libimagequant itself is GPL-3.0 or commercial | — | Bundled, if confirmed permissive. Otherwise palette PNG becomes opt-in |
| SVGO 4.1.0 | MIT | — | **Bundled** |
| `ssimulacra2` Rust crate (in `crates/weft-media`) | BSD-2-Clause **(unverified version)** | — | **Bundled** (napi prebuilt per platform; WASM fallback) |
| ThumbHash 0.1.1 | MIT | — | **Bundled** (build-side encode only; the 1.1 KB decoder ships only to Surfaces) |
| ffmpeg | LGPL-2.1+ by default; **GPL-2.0+ when built with x264/x265** (ffmpeg-static's binaries are GPL builds, which KEEL pins) | **H.264 and HEVC encoders/decoders fall under the MPEG LA / Via LA and Access Advance pools.** Distributing an encoder can need a licence (x264 has a commercial licence). AV1, VP9 and Opus are royalty-free (AOM, Google, IETF), though third-party pools assert claims **(unverified relevance)**. AAC: Via LA pool; ffmpeg's native `aac` encoder is LGPL; libfdk-aac is non-free | **Opt-in** (`@weft/plugin-media-ffmpeg`). Uses a user-installed ffmpeg or a pinned binary with a SHA-256 allowlist (KEEL's model). weft never redistributes a GPL ffmpeg inside its own packages |
| SVT-AV1, libvpx, libopus, libaom | BSD-family + AOM patent licence | Royalty-free | Through the ffmpeg provider |
| libjxl / `cjxl` | BSD-3-Clause | Royalty-free (Google/Cloudinary grant) | **Opt-in** |
| ravif / rav1e / image-rs / oxipng | BSD-3 / BSD-2 / MIT-Apache / MIT | AV1 royalty-free | **Opt-in** (`-rust`): no native deps, works where sharp's binaries don't (WASI, edge) |
| jSquash codecs (Squoosh builds) | Apache-2.0 (wrappers); codec licences as above | As above | **Opt-in** (client/worker) |
| Mediabunny 1.63.0 | MPL-2.0 (file-level copyleft; fine unmodified, as KEEL ships it) | — | Opt-in (client video muxing) |

- **The rule:** nothing GPL and no patent-pooled *encoder* is in the default install. A default app can optimise
  every image with permissive and LGPL code. Video needs one explicit `mediaFfmpeg()` line, and that line's
  `weft plugins add` output prints the licence and patent notes.
- **Decoding H.264 and HEVC in the browser is the browser vendor's licence**, not the app's. Serving H.264 files
  needs nothing.

### 6.3 Conformance (`weft/test/plugins`)

- **`media.encode@1`:**
  - round-trip decode;
  - dimensions and orientation preserved;
  - ICC kept or converted to sRGB, explicitly;
  - for animation: frame count, delays (±0.51 ms, KEEL), loop count and alpha;
  - for audio: presence, and duration within one codec frame;
  - determinism of the output for a fixed input and version (or declared non-deterministic);
  - a bounded memory test on a hostile header (KEEL's oversized-dimension fixtures).
- **`media.quality@1`:** monotonic on a graded corpus. The SSIMULACRA2 score is within ±0.5 of the libjxl reference
  binary on the weft corpus.
- **`media.analyze@1`:** dimensions, frames and audio exact on the corpus. The SVG executable classifier agrees with
  KEEL's fixtures.
- **`media.cdn@1`:** URL shape, width honoured (the returned image's width checked), `format: 'auto'` negotiation.

---

## 7. API and agent language

### 7.1 The primitive: `<Media>`, one source, everything automatic

`<Media>` lives in `weft/media` (consumer API; it needs no provider for plain behaviour). warp re-exports it as warp's
media component with tokens: radius, the focus ring, and the reduced-motion poster treatment. There is one primitive
for stills, GIFs and video. The asset's `kind` decides the element (`<img>`, `<picture>` or `<video>`).

```tsx
import { Media } from 'weft/media'
import hero from './hero.jpg?media'                 // typed: MediaAsset<'photo'> — w, h, dominant, lqip, variants
import demo from './demo.gif?media'                 // MediaAsset<'animation'>: becomes <video> if that wins
import tour from './tour.mov?media'                 // MediaAsset<'video'>: ladder + H.264 + poster

<Frame ratio="16:9"><Media src={hero} alt="Studio gallery at night" priority /></Frame>   // LCP: fetchpriority, preload, eager
<Grid min="sm">{posts.map(p => <Card key={p.id}><Media src={p.cover} alt={p.coverAlt} /></Card>)}</Grid>  // p.cover: z.media()
<Media src={demo} alt="Dragging a card between columns" />                       // muted loop, poster, pause > 5 s
<Media src={tour} alt="Storage tour" controls />                                 // ladder, H.264 copy in the menu
<Media src={hero} alt="" decorative focus={[0.3, 0.4]} />                         // art-directed crop point
```

- **Props:**
  - `src` (an asset, or a `z.media()` record);
  - `alt` (required; `decorative` makes it `alt=""` explicit, else M007);
  - `priority`, `focus`, `fit` (`cover`/`contain`; the default comes from the parent `Frame`), `poster` (seconds or
    an asset);
  - `controls`, `timeline`, `audio` (`'keep'`/`'drop'`), `motion` (`'auto'`/`'always'`);
  - `sizes`/`width` (only an escape hatch for unknown layout, M010).
- **What it renders, for the screenshot above in a `Grid min="sm"` of 3 columns (illustrative):**

```html
<img src="/assets/m/9f2c-800.avif" srcset="/assets/m/9f2c-400.avif 400w, …-800.avif 800w, …-1200.avif 1200w"
     sizes="(max-width: 599px) calc(100vw - 32px), (max-width: 999px) calc(50vw - 28px), 389px"
     width="1200" height="735" alt="…" loading="lazy" decoding="async"
     style="aspect-ratio:1200/735;background:#080808 url(data:image/webp;base64,UklGRj…) center/cover">
```

  It renders `<picture>` only when a target browser lacks AVIF or an art-directed crop exists.
- **The raw `<img>` and `<video>` stay legal.** They get M001–M006 when they skip what `<Media>` does.

### 7.2 Imports and records

```ts
import hero from './hero.jpg?media'                       // the only directive-free form; options live in config or props
import loop from './dance.gif?media&audio=./beat.opus'    // build-time mux (the one import option: it changes the asset)
import raw from './hero.jpg?url'                          // Vite's own: untouched file, no derivatives (M002 if rendered in <img>)

// Dynamic media (uploads, CMS): the record carries what the build would have computed
const Post = z.object({ id: z.string(), cover: z.media(), coverAlt: z.string() })   // {url, width, height, dominant, lqip, thumbhash, kind}
export const upload = mutation({ input: z.file(), output: z.media(), run: (f, ctx) => ctx.media.ingest(f) })  // analyze + store + variants on demand
```

### 7.3 The timeline box

This is §3.4's `timeline(asset, { cues, loop })`. It returns
`{ currentTime: State<number>, playing: State<boolean>, duration, ended, cue, on, error }`. It is the same box shape as
the rest of weft, so agents need no new idea.

### 7.4 Config

```ts
// weft.config.ts
import { media } from '@weft/plugin-media'
import { mediaFfmpeg } from '@weft/plugin-media-ffmpeg'      // opt-in: video, audio, GIF→video (prints licence notes)

export default defineConfig({
  plugins: [
    media({
      encoder: 'off',                    // 'off' (default) | 'background' | 'server'
      swap: 'intent',                    // background only: 'intent' | 'idle' | 'never'
      formats: ['avif'],                 // efficient set; add 'webp' for old engines, 'jxl' opt-in
      quality: { target: 80, priority: 85, thumbs: 70, metric: 'ssimulacra2' },   // or 'fast' | 'lossless'
      dpr: { photo: 2, ui: 3 },
      placeholder: 'webp16',             // 'webp16' | 'thumbhash' | 'dominant' | 'none'
      gif: { toVideo: 'auto', keepUnder: 8_192 },
      server: { route: '/_weft/m', storage: 'fs' },               // encoder: 'server' or dynamic media
      client: false,                     // WebCodecs/canvas escape hatch
    }),
    mediaFfmpeg({ binary: 'system' }),   // or { pinned: 'ffmpeg-static@5.3.0' } with SHA-256 allowlist
  ],
})
```

The name collides with `media` in `weft/browser` (reactive `matchMedia`). The import path disambiguates. M-diagnostics
and `weft plugins explain` say `@weft/plugin-media`, so an agent never confuses the two. **(Open: rename to
`assets()` if the eval shows confusion.)**

### 7.5 Diagnostics: `M001`–`M016` (new prefix; unused in PLAN and research 01–14)

| Code | Catches | Fix (autofix where mechanical) |
|---|---|---|
| M001 | Raw `<img>`/`<video>` without `width`/`height` or `aspect-ratio`, outside a query boundary (X030 covers inside) | **Autofix:** read the intrinsic size from the imported file and insert it, or convert to `<Media>` |
| M002 | A static asset rendered through `?url` or a string path in `<img>`, bypassing the optimizer | **Autofix:** `import x from './x.jpg?media'` + `<Media src={x}>` |
| M003 | Oversize source: intrinsic width > max solved width × DPR cap × 1.25, on a raw `<img>` | **Autofix:** convert to `<Media>` (it resizes) |
| M004 | GIF over 256 KB (configurable) rendered raw, or `gif.toVideo: 'never'` on one | **Autofix:** `<Media>` (converts). The message has the measured candidate sizes |
| M005 | Autoplaying video with an audio track and not `muted`; `t.playing = true` before a user gesture; a muted background loop that still ships audio | **Autofix:** add `muted` (+ an unmute control in warp), or `audio="drop"` |
| M006 | `<video>` without `poster` | **Autofix:** `<Media>`, or a generated poster at the scene-stable frame |
| M007 | Missing `alt` on `<Media>`/`<img>`; `alt=""` without `decorative`; `alt` equal to the file name | No autofix (needs words). The message links the D-check for labels |
| M008 | The route's LCP candidate (first above-the-fold media by solved layout, confirmed by `weft browser` LCP in dev) without `priority`, or with `loading="lazy"` | **Autofix:** add `priority` (→ `fetchpriority="high"`, `loading="eager"`, preload with `imagesrcset`/`imagesizes`) |
| M009 | `priority` on more than 2 media per route, or on below-the-fold media | **Autofix:** remove |
| M010 | `sizes` unknown above the fold (layout not statically solvable), or a measured width that drifts > 15% from the prediction (dev sampling) | Wrap in a warp primitive or pass `width="1/3"`; the message names the unknown ancestor |
| M011 | Animation > 5 s without a pause control or reduced-motion handling (WCAG 2.2.2), on raw `<video autoplay>` or an `<img>` GIF | **Autofix:** `<Media>` (pause + poster under reduced motion) |
| M012 | SVG with `<script>`, `foreignObject`, `on*=` or external refs used as an image or inlined | No autofix. Sanitise the source, or serve it as `<img>` from its own origin |
| M013 | Media in `public/` referenced by string (untracked, unoptimised, no dimensions) | **Autofix:** move the import into the module graph |
| M014 | Info: bytes `encoder: 'background'` would add (or adds); `swap: 'idle'` on assets with copy/efficient > 1.5× | — |
| M015 | HDR, wide-gamut or > 8-bit source that a bound encoder would flatten (KEEL's colour rule) | Keep the original (`quality: 'lossless'`), or opt into tone-mapping explicitly |
| M016 | `<Media src>` from a dynamic string with no `z.media()` record and no server probe (no dimensions before render) | **Autofix:** type the field `z.media()`. X030 is the runtime echo |

Ownership: `@weft/plugin-media` owns M001–M016. **It takes over X030's fix text when installed** (13 §3.6 rule:
contract codes fire whichever provider is bound).

### 7.6 AGENTS.md block (≤ 8 lines)

```md
## Media (@weft/plugin-media)
- Import media with `?media` and render `<Media src={x} alt="…" />`. Never hand-write srcset, sizes, width/height or blur placeholders.
- Put media inside warp layout (Grid, Split, Center, Frame) so sizes are computed; unknown layout above the fold is M010.
- Mark the one hero image `priority`. Nothing else.
- Dynamic images are `z.media()` fields, never bare URL strings (M016).
- GIFs and videos are `<Media>` too. Sync code to them with `timeline(asset, { cues })` boxes, not `timeupdate` listeners.
- `alt` is required; use `decorative` for purely visual media.
- `weft media plan --json` shows every variant and byte delta before a build.
```

---

## 8. PLAN integration

### 8.1 Packages

```
packages/
  media             weft/media: <Media>, timeline(), z.media() codec, swap + chooser runtime (lazy chunk), no encoders
  plugin-media      @weft/plugin-media: media.analyze/encode (sharp, SVGO)/quality providers, layout pass data,
                    manifest + emit, server route (server slot), M001–M016, `weft media` CLI subcommands
  plugin-media-ffmpeg | -jxl | -rust | -wasm | -cloudflare | -imgproxy | -vercel | -vision     (opt-in providers)
crates/
  weft-media        SSIMULACRA2 (ssimulacra2 crate), ThumbHash encode, header probes, optional ravif/rav1e; napi + WASI
  weft-layout       (exists, §5b) + a `solve_chain(chain, viewports) -> widths` entry used by plugin-media
```

### 8.2 Phases

| Phase | Adds |
|---|---|
| **1** | Reserve `M0xx` in the catalog, plus the `media.*` slot ids. No runtime |
| **2 (warp tier 1)** | `<Media>` for stills, `?media`, plugin-media with sharp + SVGO, AVIF + compatible fallback, SSIMULACRA2 search, LQIP + dominant + dimensions, shape-skeleton tie-in, `sizes` from warp primitives through `weft-layout` (web probes), `sizes="auto"` fallback. M001–M003, M007–M010, M012, M013. **It lands with the font build step:** the same build-provider path, and the second real `build`-side plugin after `font.build` |
| **3 (Start)** | `z.media()`, `ctx.media.ingest`, the server route + storage + `Accept` negotiation (`encoder: 'server'` and all dynamic media), header probes, M016, `media.cdn@1` with one provider (imgproxy) |
| **3c (warp tier 2)** | `@weft/plugin-media-ffmpeg`: GIF → video, ladders, posters, audio mux, `timeline()`, M004–M006, M011. **`encoder: 'background'`** with the swap runtime + `decodingInfo` chooser, M014. Gates: a headful `contextmenu` save test (Chrome, Firefox, Safari) and a Firefox lane for the rVFC video swap |
| **5b (Rust native)** | `-rust` provider (ravif, rav1e) for WASI/edge builds; `native('media')` on the server route's hot path |
| **6b (native)** | ThumbHash placeholders and dimensions in the Swift/Kotlin hosts. Native `Image` uses the same manifest, with HEIC/AVIF per platform |
| **Later** | Live: `media.player@1` + `media.clip`; client encoding (`client: true`); JXL lossless-JPEG as the efficient file |

### 8.3 Budgets

| Metric | Budget | Basis |
|---|---|---|
| Base runtime with plugin-media installed, `encoder: 'off'`, no timeline | **0 KB** | Static HTML only (P114) |
| `<Media>` component in the client graph | ≤ 0.6 KB br **(guess)** | Mostly SSR'd attributes; hydration only for timeline and controls |
| Swap + chooser runtime (`encoder: 'background'`), lazy | ≤ 1 KB br | Prototype 454 B (measured) + `decodingInfo` chooser |
| Timeline runtime, lazy | ≤ 1 KB br **(guess)** | rVFC loop + cues |
| ThumbHash decoder, Surfaces/native only | ≤ 1.2 KB br | 1,127 B (measured) |
| LQIP inline per image | ≤ 140 chars | 87–131 (measured) |
| CLS from any `<Media>` | **0** | Dimensions + reserved box; swap CLS 0 (measured) |
| Image swap | 0 blank frames | 0 / 16 runs (measured) |
| Video swap | 0 blank frames, flip within 1 frame | 0 / 6 runs, ≤ 40 ms at 24 fps (measured) |
| Build, cold, per still image (one target, AVIF + fallback searched) | ≤ 3 s at ≤ 2 MP **(guess from ~2 s per format)** | §3.2 |
| Build, warm (hash hit) | ≤ 5 ms per asset | cache lookup |
| Build, 1k-component bench app | Media excluded from the §3.7 5 s gate. A separate gate: 100 images cold ≤ 60 s on 10 cores, warm ≤ 1 s **(guess)** | — |
| GIF → video, cold | ≤ 15 s per GIF ≤ 5 s long **(guess)** | §3.3 times |
| `.weft/media-cache/` | Content-addressed; `weft media gc` keeps the last 2 builds' keys; warn over 2 GB **(guess)** | — |
| `dist/` growth with `encoder: 'background'` | Reported by M014; no gate | — |
| HMR | 0 ms added on `.tsx` edits; media edits re-encode in fast mode only | §3.1 |

### 8.4 Risks

- **The layout solver must match the browser for warp primitives.** Taffy matched UIKit in 6a, but web CSS has more
  edges: scrollbars, `cqi` type and percentages in grid gaps. **Mitigation:** the dev sampler (M010), probes at real
  breakpoints, and a 15% tolerance. Over-prediction only costs bytes, never correctness, because the browser still
  picks from `srcset`.
- **The `contextmenu` save behaviour is unverified** (§5.3). If browsers capture the image URL before dispatch,
  `'intent'` can't deliver the compatible file on that save. **Mitigation:** the headful gate in 3c, and the warp
  menu's Download item as the guaranteed path.
- **Bandwidth regressions.** `swap: 'idle'` can triple image bytes. **Mitigation:** the 1.5× rule, never under
  Save-Data, and M014 reporting.
- **Encode time at scale.** About 2 s per format per image cold. A 2,000-image marketing site is about an hour cold
  on one core **(derived)**. **Mitigation:** the shared cache, parallelism, warm starts, `quality: 'fast'` in CI
  previews, and server mode for big libraries.
- **Licensing drift.** Users will paste an ffmpeg-static GPL binary into a closed product. **Mitigation:** the plugin
  prints the licence on `add`, `weft plugins audit` lists it, and nothing GPL is in the default install.
- **Metric blind spots.** SSIMULACRA2 isn't trained on pixel art or on 16 px placeholders; VMAF fails on flat UI
  (measured). **Mitigation:** `kind`-specific paths (pixel art is lossless and integer-scaled) and per-kind targets.
- **Browser codec claims vary by hardware.** AV1 in Safari, HEVC in Chrome and Firefox. **Mitigation:** the runtime
  chooser asks `decodingInfo` for `powerEfficient`, and the static order always ends in H.264.
- **Colour.** Wide-gamut and HDR sources flattened silently is KEEL's hard-won lesson. **Mitigation:** M015 and the
  encode conformance's ICC check.
- **Playwright WebKit ≠ Safari** for codecs, and Firefox wasn't measured. **Mitigation:** add Firefox and a real
  Safari to the 3c browser lane before quoting numbers in docs.

### 8.5 Is it worth it?

| Feature | Verdict |
|---|---|
| Build-time AVIF + compatible fallback, searched to SSIMULACRA2 | **Yes.** 49–77% under JPEG at equal quality (measured), with no author decisions |
| Layout-derived widths and `sizes` | **Yes, the differentiator.** Nobody else can compute `sizes` from the real ancestor chain, and weft already has the solver |
| Dimensions everywhere (X030 never fires) | **Yes.** CLS 0, and it closes the last skeleton gap from 11 §7.6 |
| 16 px WebP LQIP + dominant colour | **Yes.** ~120 chars, 0 KB JS, best fidelity (measured) |
| ThumbHash | **Yes, for native, Surfaces and shape records only** |
| BlurHash | **No** (no alpha, lowest fidelity) |
| GIF → video | **Yes, big.** −89 to −94% on a UI GIF (measured); the search keeps GIFs that don't shrink. It also brings pause, reduced motion and audio |
| Media timeline (`timeline()` boxes + cues) | **Yes, small.** It's the "audio synced with a function" ask, in weft's existing box model |
| Art-directed crops via focus/saliency | **Yes for `object-position`** (free). **Real crops only when they save > 30% of pixels** |
| JPEG XL | **Opt-in only.** Never won a lossy row; Edge lacks it. Lossless JPEG transcode is a niche win |
| WebP as an efficient output | **Fallback only.** It lost every row to AVIF |
| Background compatibility encoder, `swap: 'intent'` | **Yes, as a toggle (off by default)**, pending the headful save test |
| Background encoder, `swap: 'idle'` | **Only under the 1.5× rule.** Otherwise it costs more than the optimizer saves |
| Dual-`<video>` swap | **Yes for short clips (≤ 2 MB copy)**; otherwise the Download menu item |
| MSE `changeType` swap | **No.** It makes saving impossible |
| Live "swap" | **No.** A server remux download (`media.clip`) instead |
| Server endpoint for dynamic media | **Yes** (Phase 3). Uploads need it anyway |
| Client-side encoding (WebCodecs/canvas) | **Escape hatch only.** Generation loss, battery, and `blob:` saves |
| CDN providers | **Yes, as `media.cdn@1`.** Cheap adapters that keep weft's analysis |

---

## 9. Measurement notes and reproducibility

- **Samples** (copied read-only from KEEL into the scratchpad):
  - `keel-site/apps/studio/public/guidebook/og-gallery-*.jpg` (graphic);
  - `keel-sdk/keel-token-desktop-v106.png` (screenshot);
  - `keel-sdk/doom-status-face-pass2-browser.png` (render);
  - two GIFs from the desktop app's manual-test workspace (spinner 1200², noise 520×400);
  - `keel-site/apps/studio/public/guidebook/keel-storage-tour.mp4` (16 s, 960×540, 24 fps) and `redline/chase.mp4`.
- **No KEEL video has audio**, apart from tiny synthetic PCM fixtures. The audio track for the video tests was
  synthesised (a chord plus noise, `aevalsrc`) and muxed into the tour clip, so audio *quality* was not scored. Only
  sizes, timing and the swap were.
- **Scripts:**
  - `tools/still.mjs`: the §3.2 search;
  - `tools/anim.mjs`: §3.3/§3.4;
  - `tools/placeholders.mjs`: §4.3;
  - `tools/swaptest.mjs` and `tools/probe.mjs`: §5.3 and §5.1;
  - `tools/client.mjs`: §5.4.
- **Load average** was 5–34 during the runs (other agents), below the 40 threshold in `~/.claude/CLAUDE.md`, so
  nothing was offloaded to `yuna-mbp`. Timings are on a shared machine and are only good for ratios.
- **Not measured:** Firefox (not installed), real Safari (Playwright's WebKit build only), Android, the native context
  menu's save URL, HDR, and audio quality metrics.

## Sources

- KEEL (read-only): `keel-sdk/packages/builder/src/{media-optimization,media-preparation,media-edit-recipe,media-pair-verification,temporal-webp,initial-media-budget,media-slot-plan}.ts`, `keel-sdk/packages/protocol/src/smart-presentation.ts`, `keel-sdk/tools/keel/media-optimize.mjs`, `keel-sdk/docs/KEEL_MEDIA_PREPARATION.md`, `keel-sdk/docs/review/independent-media-conversion-capabilities-20261022/README.md`, `keel-site/docs/BROWSER_MEDIA_CONVERSION.md`, `keel-site/apps/studio/src/lib/{local-media-conversion.worker,local-media-conversion-policy,media-capabilities,media-candidate-coordinator}.ts`, `keel-engine/packages/capture/OFFLINE_MP4.md`, MCP `keel-media-capabilities` (run 2026-10-28)
- Browser support: `@mdn/browser-compat-data` 8.1.7 (`mediatypes.image.{avif,jxl,webp}`, `html.elements.img.sizes.auto`, `api.HTMLVideoElement.requestVideoFrameCallback`, `api.SourceBuffer.changeType`, `api.MediaCapabilities.decodingInfo`, `api.NetworkInformation.saveData`, `http.headers.Sec-CH-*`, `api.VideoEncoder`, `api.AudioEncoder`)
- HTML spec, image loading ("update the image data", current vs pending request; list of available images): https://html.spec.whatwg.org/multipage/images.html · `HTMLImageElement.decode()`: https://html.spec.whatwg.org/multipage/embedded-content.html#dom-img-decode · `requestVideoFrameCallback`: https://wicg.github.io/video-rvfc/ · Media Capabilities: https://w3c.github.io/media-capabilities/ · MSE `changeType`: https://w3c.github.io/media-source/#dom-sourcebuffer-changetype
- SSIMULACRA2: https://github.com/cloudinary/ssimulacra2 · libjxl tools · VMAF: https://github.com/Netflix/vmaf · ThumbHash: https://evanw.github.io/thumbhash/ · BlurHash: https://blurha.sh
- Encoders: libavif 1.4.2, libwebp 1.6.0, libjxl 0.12.0, SVT-AV1 4.2.0, ffmpeg 9.0.1 (local `--version` output), sharp https://sharp.pixelplumbing.com (0.35.5 on npm; 0.34.4 used for measurements), SVGO 4.1.0, Mediabunny 1.63.0, `@jsquash/avif` 2.1.1
- Licences and patents: https://ffmpeg.org/legal.html · https://www.videolan.org/developers/x264.html (dual GPL/commercial) · https://aomedia.org/license/patent-license/ · Via LA (AVC/H.264, AAC) and Access Advance (HEVC) pool pages **(unverified current terms)**
- Prior art: Next.js `next/image` docs, Astro `astro:assets` docs (`layout`), Nuxt Image, `vite-imagetools`, imgproxy, Cloudflare Images (read 2026-10-28; specifics marked **(unverified)** where not checked against source)
- weft: PLAN §2, §3.7, §4.3, §5, §5b, §6.1, §6.2, §7c, §8, §9 · research 08 §5, §9 · 11 §7, §8.4, §8.5 · 13 §2.2–§2.13, §4 · warp 02 §3
