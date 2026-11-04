# Benchmarks

`compare` measures the same dashboard across weft with warp, weft without warp, Solid with Kobalte, and React with Radix,
Zustand, or MUI. It builds each stack and measures size, load, DOM changes, CPU, and row scale. The same-CSS stacks compare
frameworks; warp and MUI bring their own design systems. See [compare/README.md](compare/README.md) for the method and rules.

From `benchmarks/compare`, run `pnpm install` and `node measure.mjs`. The latest results stay in `compare/results.json`;
history and the chart go to `evals/results/compare-history.jsonl` and `evals/results/compare.html`.

`speed` contains the row and reactive benchmarks. `arena` contains the apps built for the site's interactive comparison.
From `benchmarks/speed`, run `node build.mjs` and `node measure.mjs` to compare the row and reactive workloads.
`node lab.mjs` compares weft speed paths and writes `lab.json` and `lab.html`. New performance claims are deferred to S5.
