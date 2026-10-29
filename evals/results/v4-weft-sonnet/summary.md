# v4-weft-sonnet

## Hidden tests per ticket (cumulative)

| | ticket | baseline | t1 | t2 | t3 | t4 | t5 | t6 | budgets | agent tests | tokens | tools | min |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| weft | t1 | 4/4 | 6/6 |  |  |  |  |  | 1/1 | 3/3 | 71016 | 6 | 0.8 |
| weft | t2 | 4/4 | 6/6 | 8/8 |  |  |  |  | 2/2 | 4/4 | 74272 | 7 | 1.1 |
| weft | t3 | 4/4 | 6/6 | 8/8 | 8/8 |  |  |  | 3/3 | 5/5 | 80046 | 9 | 1.7 |
| weft | t4 | 4/4 | 6/6 | 8/8 | 8/8 | 8/8 |  |  | 4/4 | 6/6 | 85956 | 10 | 2.3 |
| weft | t5 | 4/4 | 6/6 | 8/8 | 8/8 | 8/8 | 6/6 |  | 6/6 | 7/7 | 89083 | 11 | 2.7 |
| weft | t6 | 4/4 | 6/6 | 8/8 | 8/8 | 8/8 | 6/6 | 7/7 | 7/7 | 8/8 | 98329 | 14 | 3.3 |

## Final app

| | bundle gz | src files | lines | effects | memos | quote | star | search-narrow | type-notes-5 | quote-open |
|---|---|---|---|---|---|---|---|---|---|---|
| weft | 6.9 KB | 10 | 524 | 6 | 10 | 3 DOM · 3 fmt · 3 renders · 0.72 ms | 2 DOM · 0 fmt · 3 renders · 8.22 ms | 182 DOM · 0 fmt · 10 renders · 2.68 ms | 0 DOM · 0 fmt · 5 renders · 13.22 ms | 4 DOM · 4 fmt · 4 renders · 0.32 ms |

## Failures

