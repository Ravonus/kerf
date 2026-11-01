# weft

## Stack comparisons

Every new eval scenario, benchmark, or size or speed claim is measured across all the stacks in `evals/compare`, not only weft:
weft + warp, Solid, React + Radix, React + Zustand and React + MUI. Changes to weft's compiler or runtime, warp or warp-core end
with `node evals/compare/measure.mjs`, committing the new line in `evals/results/compare-history.jsonl` and the regenerated
`evals/results/compare.html`, which charts them. Rules and how to add a stack: `evals/compare/README.md`.
