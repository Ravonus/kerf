# kerf keyed benchmark

This entry targets `krausest/js-framework-benchmark` revision
`fa510a76ffe066af1d30f3e75fa51d3fcbc14009` (master observed 2026-11-05).
The entry pins `@kerf/core` 0.1.1, including its published compiler,
TypeScript 7.0.2 and Vite 8.3.5. The pnpm lock pins transitive inputs.
Node 26 and pnpm are required. The workspace config keeps the three-day
minimum release age; only kerf packages are exempt.

From `keyed/kerf`:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm typecheck
pnpm exec oxlint --deny-warnings src vite.config.ts
pnpm exec oxfmt --check src vite.config.ts
pnpm build-prod
```

The page loads the upstream `/css/currentStyle.css`; serve it under the
upstream server to check the reference appearance. `For` keys rows by ID;
updates replace data without replacing the keyed row. No direct DOM mutation
or animation-frame scheduling is used.

## Upstream validation and submission

Apply `upstream.patch` to a clean checkout of the pinned upstream revision:

```sh
git apply /absolute/path/to/benchmarks/js-framework-benchmark/upstream.patch
```

The committed npm v3 `package-lock.json` is derived from the pinned pnpm
lock with lockgraph 0.8.1, then given the manifest root and registry URLs.
The converter flattens pnpm peer contexts into npm's layout. Check all 105
nodes, integrity values and dependency edges with `node check-lock.mjs` from
this directory. The unmodified upstream npm rebuild remains untested here.

The upstream rebuild command runs npm ci and npm scripts internally. Run the
same focused driver directly with pnpm to respect this repository's policy.
In an isolated checkout of the pinned revision, after applying the patch:

```sh
pnpm --dir frameworks/keyed/kerf install --frozen-lockfile --ignore-scripts
pnpm --dir frameworks/keyed/kerf build-prod
```

Put `minimumReleaseAge: 4320` and the `@kerf/*` exemption in separate
`server/pnpm-workspace.yaml` and `webdriver-ts/pnpm-workspace.yaml` files.
Then install with `pnpm --dir server install --ignore-scripts` and
`pnpm --dir webdriver-ts install --ignore-scripts`. The upstream driver imports
transitive packages directly, so add them explicitly in this temporary checkout:

```sh
pnpm --dir webdriver-ts add -D --ignore-scripts --save-exact playwright-core@1.61.1 chrome-launcher@1.2.2
pnpm --dir webdriver-ts compile
PORT=19387 pnpm --dir server start
```

In another shell, after checking the port and server ownership, run:

```sh
PORT=19387 pnpm --dir webdriver-ts isKeyed --framework keyed/kerf --headless --chromeBinary '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
PORT=19387 pnpm --dir webdriver-ts bench --runner playwright --headless true --smoketest true --chromeBinary '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' keyed/kerf
```

These commands exercised the pinned upstream driver on macOS with local Chrome.
The upstream maintainer can run the unmodified rebuild-ci with npm after review.
It has not been run in this repository.

This is an upstream workload, not a comparative result. Any speed or size
claim needs the full comparison in `benchmarks/compare` across all stacks.
