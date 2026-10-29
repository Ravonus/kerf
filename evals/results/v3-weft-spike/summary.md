# v3-weft-spike

## Hidden tests per ticket (cumulative)

| | ticket | baseline | t1 | t2 | t3 | agent tests | tokens | tools | min |
|---|---|---|---|---|---|---|---|---|---|
| react | t3 | 4/4 | 5/5 | 7/7 | 7/7 | 0/0 |  |  |  |
| solid | t3 | 4/4 | 5/5 | 7/7 | 7/7 | 0/0 |  |  |  |
| weft | t3 | 4/4 | 5/5 | 7/7 | 7/7 | 0/0 |  |  |  |

## Final app

| | bundle gz | src files | lines | effects | memos | add-one | price-push | type-3-chars |
|---|---|---|---|---|---|---|---|---|
| react | 67.7 KB | 8 | 183 | 1 | 0 | 3 DOM · 1 renders · 54.27 ms | 3 DOM · 1 renders · 6.1 ms | 167 DOM · 3 renders · 22.76 ms |
| solid | 9.9 KB | 8 | 196 | 0 | 0 | 1 DOM · – renders · 47.32 ms | 1 DOM · – renders · 0.17 ms | 152 DOM · – renders · 15.27 ms |
| weft | 4.2 KB | 8 | 189 | 0 | 0 | 1 DOM · – renders · 47.23 ms | 1 DOM · – renders · 0.35 ms | 152 DOM · – renders · 14.71 ms |

## Failures

