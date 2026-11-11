# Keep shared state in ordinary boxes

Named shared state scopes give ordinary state and derived boxes a name and lifetime; they do not introduce another container. Server data belongs in the query cache rather than a copied client store.

[Research](https://github.com/Ravonus/kerf/blob/archive/evals-2026-11/docs/research/14-app-state.md) and [related research](https://github.com/Ravonus/kerf/blob/archive/evals-2026-11/docs/research/29-forms-state-media.md).
