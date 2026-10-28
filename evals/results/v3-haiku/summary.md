# v3-haiku

## Hidden tests per ticket (cumulative)

| | ticket | baseline | t1 | t2 | t3 | agent tests | tokens | tools | min |
|---|---|---|---|---|---|---|---|---|---|
| react | t1 | 4/4 | 5/5 |  |  | 5/5 | 64688 | 6 | 0.6 |
| react | t2 | 4/4 | 5/5 | 7/7 |  | 6/6 | 73488 | 10 | 1.5 |
| react | t3 | 4/4 | 5/5 | 7/7 | 7/7 | 8/8 | 77534 | 11 | 2.3 |
| solid | t1 | 4/4 | 5/5 |  |  | 6/6 | 69360 | 8 | 0.9 |
| solid | t2 | 4/4 | 5/5 | 7/7 |  | 9/9 | 79691 | 9 | 1.7 |
| solid | t3 | 4/4 | 5/5 | 7/7 | 7/7 | 12/12 | 85050 | 10 | 2.4 |

## Final app

| | bundle gz | src files | lines | effects | memos | add-one | price-push | type-3-chars |
|---|---|---|---|---|---|---|---|---|
| react | 67.9 KB | 9 | 253 | 2 | 0 | 4 DOM · 1 renders · 60.03 ms | 4 DOM · 1 renders · 7.43 ms | 174 DOM · 3 renders · 23.99 ms |
| solid | 10.5 KB | 8 | 276 | 1 | 1 | 1 DOM · – renders · 55.61 ms | 1 DOM · – renders · 0.24 ms | 152 DOM · – renders · 17.79 ms |

## Failures

