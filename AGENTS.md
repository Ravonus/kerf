# Working on weft

Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, source and test conventions, checks and sign-off. Keep public paths and Node entrypoints working. Preserve existing UI and interaction behavior unless a change is requested.

## Stack comparisons

Every new eval scenario, benchmark, or size or speed claim is measured across all the stacks in `benchmarks/compare`, not only weft:
weft + warp, Solid, React + Radix, React + Zustand and React + MUI. Changes to weft's compiler or runtime, warp or warp-core end
with `node benchmarks/compare/measure.mjs`, committing the new line in `evals/results/compare-history.jsonl` and the regenerated
`evals/results/compare.html`, which charts them. Rules and how to add a stack: `benchmarks/compare/README.md`.
