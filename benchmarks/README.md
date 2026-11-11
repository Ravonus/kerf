# Benchmarks

`compare` measures the same dashboard across kerf with veneer, kerf without veneer, Solid with Kobalte, and React with Radix,
Zustand, or MUI. It builds each stack and measures size, load, DOM changes, CPU, and row scale. The same-CSS stacks compare
frameworks; veneer and MUI bring their own design systems. See [compare/README.md](compare/README.md) for the method and rules.

At the repo root, run `pnpm run setup` and `pnpm --filter @kerf-js/text run build` first.
From `benchmarks/compare`, run `pnpm install` and `node measure.mjs`. The latest results stay in `compare/results.json`;
history and the chart go to `evals/results/compare-history.jsonl` and `evals/results/compare.html`.

`speed` contains the row and reactive benchmarks. `arena` contains the apps built for the site's interactive comparison.
From `benchmarks/speed`, run `node build.mjs` and `node measure.mjs` to compare the row and reactive workloads.
`node lab.mjs` compares kerf speed paths and writes `lab.json` and `lab.html`. See the [keyed benchmark entry](./js-framework-benchmark/README.md) for its pinned upstream workload and validation limits.

Record the machine, OS, browser version, source revision and dirty state,
compiler binary and matching source stamp, Node, pnpm and dependency lockfile
with each run. Compare results only with their conditions and inputs visible.
S5 local candidate measurements are scoped experiments, not the future combined
Yuna measurement or proof of runtime speed.
