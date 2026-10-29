# v3-weft-sonnet

## Hidden tests per ticket (cumulative)

| | ticket | baseline | t1 | t2 | t3 | agent tests | tokens | tools | min |
|---|---|---|---|---|---|---|---|---|---|
| weft | t1 | 4/4 | 5/5 |  |  | 2/2 | 62504 | 3 | 0.2 |
| weft | t2 | 4/4 | 5/5 | 7/7 |  | 2/2 | 65594 | 6 | 0.7 |
| weft | t3 | 4/4 | 5/5 | 7/7 | 7/7 | 2/2 | 67597 | 7 | 1.0 |

## Final app

| | bundle gz | src files | lines | effects | memos | add-one | price-push | type-3-chars |
|---|---|---|---|---|---|---|---|---|
| weft | 5.0 KB | 8 | 235 | 2 | 4 | 1 DOM · 452 renders · 45.19 ms | 1 DOM · 9 renders · 0.31 ms | 152 DOM · 15 renders · 14.63 ms |

## Failures

