# v3-sonnet

## Hidden tests per ticket (cumulative)

| | ticket | baseline | t1 | t2 | t3 | agent tests | tokens | tools | min |
|---|---|---|---|---|---|---|---|---|---|
| react | t1 | 4/4 | 5/5 |  |  | 2/2 | 58863 | 3 | 0.3 |
| react | t2 | 4/4 | 5/5 | 7/7 |  | 2/2 | 61502 | 4 | 0.7 |
| react | t3 | 4/4 | 5/5 | 7/7 | 7/7 | 2/2 | 63242 | 5 | 1.0 |
| solid | t1 | 4/4 | 5/5 |  |  | 3/3 | 60020 | 3 | 0.4 |
| solid | t2 | 4/4 | 5/5 | 7/7 |  | 4/4 | 63024 | 4 | 0.8 |
| solid | t3 | 4/4 | 5/5 | 7/7 | 7/7 | 5/5 | 65256 | 5 | 1.2 |

## Final app

| | bundle gz | src files | lines | effects | memos | add-one | price-push | type-3-chars |
|---|---|---|---|---|---|---|---|---|
| react | 67.8 KB | 8 | 224 | 2 | 1 | 4 DOM · 1 renders · 63.86 ms | 4 DOM · 1 renders · 6.61 ms | 173 DOM · 3 renders · 24.04 ms |
| solid | 8.8 KB | 8 | 223 | 0 | 2 | 1 DOM · – renders · 48.25 ms | 300 DOM · – renders · 11.08 ms | 152 DOM · – renders · 15.06 ms |

## Failures

