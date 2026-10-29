# v4q-sonnet

## Hidden tests per ticket (cumulative)

| | ticket | baseline | t1 | t2 | t3 | t4 | t5 | t6 | budgets | agent tests | tokens | tools | min |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| react | t1 | 4/4 | 6/6 |  |  |  |  |  | 1/1 | 3/3 | 63740 | 3 | 0.7 |
| react | t2 | 4/4 | 6/6 | 8/8 |  |  |  |  | 2/2 | 4/4 | 66887 | 4 | 1.0 |
| react | t3 | 4/4 | 6/6 | 8/8 | 8/8 |  |  |  | 3/3 | 5/5 | 71607 | 5 | 1.4 |
| react | t4 | 4/4 | 6/6 | 8/8 | 8/8 | 8/8 |  |  | 4/4 | 6/6 | 77039 | 6 | 1.9 |
| react | t5 | 4/4 | 6/6 | 8/8 | 8/8 | 8/8 | 6/6 |  | 6/6 | 7/7 | 80564 | 7 | 2.4 |
| react | t6 | 4/4 | 6/6 | 8/8 | 8/8 | 8/8 | 6/6 | 7/7 | 7/7 | 8/8 | 89073 | 9 | 3.0 |
| solid | t1 | 4/4 | 6/6 |  |  |  |  |  | 1/1 | 3/3 | 62990 | 3 | 0.5 |
| solid | t2 | 4/4 | 6/6 | 8/8 |  |  |  |  | 2/2 | 4/4 | 66393 | 4 | 0.9 |
| solid | t3 | 4/4 | 6/6 | 8/8 | 8/8 |  |  |  | 3/3 | 5/5 | 71962 | 9 | 1.4 |
| solid | t4 | 4/4 | 6/6 | 8/8 | 8/8 | 8/8 |  |  | 4/4 | 6/6 | 77938 | 10 | 2.2 |
| solid | t5 | 4/4 | 6/6 | 8/8 | 8/8 | 8/8 | 6/6 |  | 6/6 | 7/7 | 83639 | 19 | 3.0 |
| solid | t6 | 4/4 | 6/6 | 8/8 | 8/8 | 8/8 | 6/6 | 7/7 | 7/7 | 8/8 | 91104 | 21 | 3.5 |
| weft | t1 | 4/4 | 6/6 |  |  |  |  |  | 1/1 | 3/3 | 73091 | 9 | 0.9 |
| weft | t2 | 4/4 | 6/6 | 8/8 |  |  |  |  | 2/2 | 4/4 | 76544 | 10 | 1.2 |
| weft | t3 | 4/4 | 6/6 | 8/8 | 8/8 |  |  |  | 3/3 | 5/5 | 81416 | 11 | 1.7 |
| weft | t4 | 4/4 | 6/6 | 8/8 | 8/8 | 8/8 |  |  | 4/4 | 6/6 | 90174 | 14 | 2.5 |
| weft | t5 | 4/4 | 6/6 | 8/8 | 8/8 | 8/8 | 6/6 |  | 6/6 | 7/7 | 94402 | 16 | 3.0 |
| weft | t6 | 4/4 | 6/6 | 8/8 | 8/8 | 8/8 | 6/6 | 7/7 | 7/7 | 8/8 | 104091 | 20 | 3.7 |

## Final app

| | bundle gz | src files | lines | effects | memos | quote | star | search-narrow | type-notes-5 | quote-open |
|---|---|---|---|---|---|---|---|---|---|---|
| react | 69.8 KB | 9 | 525 | 8 | 13 | 3 DOM · 3 fmt · 1 renders · 2.82 ms | 4 DOM · 1 fmt · 1 renders · 14.95 ms | 184 DOM · 1 fmt · 1 renders · 5.07 ms | 5 DOM · 0 fmt · 5 renders · 16.21 ms | 4 DOM · 4 fmt · 1 renders · 1.02 ms |
| solid | 10.4 KB | 9 | 531 | 1 | 6 | 3 DOM · 3 fmt · – renders · 0.45 ms | 2 DOM · 0 fmt · – renders · 9.72 ms | 182 DOM · 0 fmt · – renders · 5.36 ms | 0 DOM · 0 fmt · – renders · 13.35 ms | 4 DOM · 4 fmt · – renders · 0.29 ms |
| weft | 6.8 KB | 9 | 472 | 8 | 9 | 3 DOM · 3 fmt · 8 renders · 0.64 ms | 2 DOM · 0 fmt · 3 renders · 7.94 ms | 182 DOM · 0 fmt · 6 renders · 2.93 ms | 0 DOM · 0 fmt · 5 renders · 12.69 ms | 4 DOM · 4 fmt · 10 renders · 0.31 ms |

## Failures

