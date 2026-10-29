# v4-haiku

## Hidden tests per ticket (cumulative)

| | ticket | baseline | t1 | t2 | t3 | t4 | t5 | t6 | budgets | agent tests | tokens | tools | min |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| react | t1 | 4/4 | 6/6 |  |  |  |  |  | 1/1 | 6/6 | 73963 | 7 | 1.1 |
| react | t2 | 4/4 | 6/6 | 8/8 |  |  |  |  | 2/2 | 10/10 | 85441 | 10 | 1.9 |
| react | t3 | 4/4 | 6/6 | 8/8 | 8/8 |  |  |  | 3/3 | 15/15 | 105567 | 14 | 3.4 |
| react | t4 | 4/4 | 6/6 | 8/8 | 8/8 | 8/8 |  |  | 4/4 | 22/22 | 125988 | 20 | 5.3 |
| react | t5 | 4/4 | 6/6 | 8/8 | 8/8 | 8/8 | 6/6 |  | 6/6 | 27/27 | 140648 | 22 | 6.5 |
| react | t6 | 4/4 | 6/6 | 8/8 | 8/8 | 8/8 | 6/6 | 7/7 | 7/7 | 33/33 | 164328 | 27 | 8.6 |

## Final app

| | bundle gz | src files | lines | effects | memos | quote | star | search-narrow | type-notes-5 | quote-open |
|---|---|---|---|---|---|---|---|---|---|---|
| react | 70.1 KB | 15 | 765 | 5 | 14 | 3 DOM · 3 fmt · 1 renders · 2.29 ms | 4 DOM · 0 fmt · 1 renders · 13.4 ms | 184 DOM · 0 fmt · 1 renders · 4.43 ms | 5 DOM · 0 fmt · 5 renders · 15.77 ms | 4 DOM · 4 fmt · 1 renders · 1.04 ms |

## Failures

