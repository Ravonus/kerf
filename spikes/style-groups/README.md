# Style groups spike (research 23 §6)

The v3 shop styled two ways, for [research 23](../../docs/research/23-style-groups.md) §6:

- `shop-css/`: BEM classes plus one hand-written stylesheet (`src/shop.css`) on warp's tokens.
- `shop-groups/`: the same design as `@weft-js/core/style` groups.

`node spikes/style-groups/run.mjs` grades both against the hidden v3 tests plus `spike.test.tsx` (in
`evals/frameworks/weft`), builds both with Vite, and writes `results.json`: CSS bytes, styling tokens per element,
and DOM work per interaction. It also writes sample output to `out/` (`groups.dev.css`, `groups.flat.css`,
`atomic.css`). `--css` prints only the emitter's size matrix. Needs the native compiler (`npm run build:native` in
`packages/weft`).

`node spikes/style-groups/scale.mjs` is §6.5: synthetic apps of 10 to 300 groups, groups CSS against the same rules
as BEM classes. It reads `out/` for the shop's calibration row, so run `run.mjs` first.
