# v4-sonnet

## Hidden tests per ticket (cumulative)

| | ticket | baseline | t1 | t2 | t3 | t4 | t5 | t6 | budgets | agent tests | tokens | tools | min |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| react | t1 | 4/4 | 6/6 |  |  |  |  |  | 1/1 | 3/3 | 64038 | 4 | 0.7 |
| react | t2 | 4/4 | 6/6 | 8/8 |  |  |  |  | 2/2 | 4/4 | 67519 | 5 | 1.1 |
| react | t3 | 4/4 | 6/6 | 8/8 | 8/8 |  |  |  | 3/3 | 5/5 | 74509 | 6 | 1.8 |
| react | t4 | 4/4 | 6/6 | 8/8 | 8/8 | 8/8 |  |  | 4/4 | 6/6 | 82339 | 9 | 2.8 |
| react | t5 | 4/4 | 6/6 | 8/8 | 8/8 | 8/8 | 6/6 |  | 6/6 | 7/7 | 85981 | 10 | 3.2 |
| react | t6 | 4/4 | 6/6 | 8/8 | 8/8 | 8/8 | 6/6 | 7/7 | 7/7 | 8/8 | 92281 | 12 | 3.9 |

## Final app

| | bundle gz | src files | lines | effects | memos | quote | star | search-narrow | type-notes-5 | quote-open |
|---|---|---|---|---|---|---|---|---|---|---|
| react | 70.0 KB | 9 | 593 | 4 | 13 | 3 DOM · 3 fmt · 1 renders · 1.84 ms | 2 DOM · 0 fmt · 1 renders · 12.8 ms | 184 DOM · 1 fmt · 1 renders · 5.51 ms | 5 DOM · 0 fmt · 5 renders · 16.2 ms | 4 DOM · 4 fmt · 1 renders · 0.88 ms |

## Failures

