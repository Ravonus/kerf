# Working on Kerf

Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, source and test conventions, checks and sign-off. Keep public paths and Node entrypoints working. Preserve existing UI and interaction behavior unless a change is requested.

## Media defaults for sites

Use `media()` and `mediaFfmpeg()` with `?media` imports or `ctx.media.ingest`, then render
`Media` from `@kerf-js/core/media`. The standard path generates verified, exact-pixel,
responsive frame-zero previews and automatically registers bounded background caching.
Keep controls and original-file Save behavior separate from playback. Do not implement
site-owned blur posters, delayed warm timers or bandwidth-first starting quality.

Core owns the browser policy, re-exported by `@kerf-js/media/browser`. Custom/HLS players
must use that policy, select display quality before loading and reveal only a presented
frame at that resolution. A pause, scroll return or loop must not reset the source.
Save Data, hidden documents, foreground buffering, byte limits and route disposal remain
authoritative. `warm={false}` and `video.firstFrame:false` are explicit opt-outs, never
routine optimization fixes. Native whole files above the cache cap are skipped; HLS and
frame streams cache only their starts. Never request an original merely to warm playback.

Read `kerf docs media` and regenerate an app's installed plugin guidance with
`kerf agents-md`. After upgrading, rebuild imports and re-ingest/migrate persisted legacy
video records; an old deployed bundle or CMS record does not acquire new fields by itself.
Verify real first-frame dimensions, scroll return, a loop and a cache hit in a fresh
browser. An audit score or successful fetch alone does not establish clear playback.

## Stack comparisons

Every new eval scenario, benchmark, or size or speed claim is measured across all the stacks in `benchmarks/compare`, not only Kerf:
Kerf + Veneer, Solid, React + Radix, React + Zustand and React + MUI. Changes to Kerf's compiler or runtime, Veneer or veneer-core end
with `node benchmarks/compare/measure.mjs`, committing the new line in `evals/results/compare-history.jsonl` and the regenerated
`evals/results/compare.html`, which charts them. Rules and how to add a stack: `benchmarks/compare/README.md`.
