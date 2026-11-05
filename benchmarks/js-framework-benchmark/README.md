# weft keyed benchmark

This entry targets `krausest/js-framework-benchmark` revision
`fa510a76ffe066af1d30f3e75fa51d3fcbc14009` (master observed 2026-11-05).
The entry pins `@weft-js/core` 0.1.1, including its published compiler,
TypeScript 7.0.2 and Vite 8.3.5. The pnpm lock pins transitive inputs.
Node 26 and pnpm are required. The workspace config keeps the three-day
minimum release age; only weft packages are exempt.

From `keyed/weft`:

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

Upstream asks for its root `npm run rebuild-ci keyed/weft` and the
`webdriver-ts` `npm run isKeyed` test, as well as fixed versions, a reference
DOM and its CSS, and no files outside the framework directory. Its discovery
also expects `package-lock.json`. This repo permits pnpm only, including child
installs. Upstream's harness and lockfile generation must be checked for npm
child calls and reconciled with that policy before running; the patch does not
include an npm lockfile. These checks have not passed yet. With an isolated
upstream checkout and a policy-compatible harness, run the equivalent of
`pnpm rebuild-ci keyed/weft` at the root and `pnpm --dir webdriver-ts isKeyed --framework keyed/weft --headless`
after installing/building the harness with pnpm and retaining minimumReleaseAge.
Record the full output and verify the framework is actually discovered.
Do not submit until both checks and the manager's review pass.

This is an upstream workload, not a comparative result. Any speed or size
claim needs the full comparison in `benchmarks/compare` across all stacks.
