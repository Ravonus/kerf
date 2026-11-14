# Choose media by measured quality

Build media variants against a quality target and supply dimensions and placeholders. Keep the compatibility encoder optional; its extra cost and save behavior need their own evidence.

[Research](https://github.com/Ravonus/kerf/blob/archive/evals-2026-11/docs/research/15-assets.md) and [related research](https://github.com/Ravonus/kerf/blob/archive/evals-2026-11/docs/research/26-phase-2-completion.md).

The original request also calls for original-format saving and synchronized motion. Dense galleries prepare saving only on intent through `prepareMediaSave`; they do not encode every visible artwork. Exact-pixel frame streams use independent chunks and measured byte budgets. An unchanged source remains the save identity. Frame output is never described as smaller, or as a faithful original file, without the corresponding byte/pixel/timing evidence. The implemented contract and the historical design are distinguished in [the media reference](../../packages/cli/docs/media.md).
