# Working on Kerf

Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, source and test conventions, checks and sign-off. Keep public paths and Node entrypoints working. Preserve existing UI and interaction behavior unless a change is requested.

## Media defaults for sites

Use `media()` and `mediaFfmpeg()` with `?media` imports or `ctx.media.ingest`, then render
`Media` from `@kerf-js/core/media`. The standard path generates verified, exact-pixel,
responsive frame-zero previews and automatically registers bounded background caching.
Keep controls and original-file Save behavior separate from playback.
For an artist-approved visually lossless display policy, configure
`video.firstFrameQuality: {target: 90}` (SSIMULACRA2) and a suitable `video.widths`
ladder. The default remains pixel-exact. Standard imports and uploads use the same
Kerf quality search; unavailable scoring falls back to exact pixels. Rebuild legacy
records with `createFirstFrameBuild({target: 90})`, retain exact original Save files,
and verify the selected width and payload. Do not lock a measured-display site to
pixel-exact poster delivery or introduce a blurry preview that later sharpens. Do not implement
site-owned blur posters, delayed warm timers or bandwidth-first starting quality.

Core owns the browser policy, re-exported by `@kerf-js/media/browser`. Custom/HLS players
must use that policy, select display quality before loading and reveal only a presented
frame at that resolution. A pause, scroll return or loop must not reset the source.
Save Data, hidden documents, foreground buffering, byte limits and route disposal remain
authoritative. `warm={false}` and `video.firstFrame:false` are explicit opt-outs, never
routine optimization fixes. Native whole files above the cache cap are skipped; HLS and
frame streams cache only their starts. Never request an original merely to warm playback.

A movie may legitimately begin with a black slate. Retain the exact frame-zero record,
then use `createFirstFrameBuild({at: seconds})` to encode a separate lossless visible
preview after measuring the opening. Record its source timestamp and reveal playback
only when a presented frame reaches it. Do not substitute an enlarged thumbnail, skip
content in the original movie, or change a black scene later in the artwork.

Read `kerf docs media` and regenerate an app's installed plugin guidance with
`kerf agents-md`. After upgrading, rebuild imports and re-ingest/migrate persisted legacy
video records; an old deployed bundle or CMS record does not acquire new fields by itself.
Priority images in the rendered shell get responsive preloads before module preloads.
Keep `fetchpriority="high"` for actual first-view media; art-directed pictures keep
complementary media queries. Media heads render current content before emitting hints,
so a remembered route cannot preload an artwork replaced through the CMS.
Verify real first-frame dimensions, scroll return, a loop and a cache hit in a fresh
browser. An audit score or successful fetch alone does not establish clear playback.

## Shared layout motion

For a logo or other shared layout mark, use matching `data-kerf-shared` keys and
`data-kerf-shared-fit="text"` on text. Start captures before its optimistic path swap;
do not wrap `navigate` in an app-owned clone, delayed transition or post-navigation capture.
Respect reduced motion and `data-kerf-motion="off"`. `navigate(href,{shared:false})` opts out.
Verify a delayed response, Back and rapid reversal in a real browser; matching only the
later page commit can report an animation while both ends already show the destination.

## Stack comparisons

Every new eval scenario, benchmark, or size or speed claim is measured across all the stacks in `benchmarks/compare`, not only Kerf:
Kerf + Veneer, Solid, React + Radix, React + Zustand and React + MUI. Changes to Kerf's compiler or runtime, Veneer or veneer-core end
with `node benchmarks/compare/measure.mjs`, committing the new line in `evals/results/compare-history.jsonl` and the regenerated
`evals/results/compare.html`, which charts them. Rules and how to add a stack: `benchmarks/compare/README.md`.
