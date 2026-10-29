# v4q-haiku

## Hidden tests per ticket (cumulative)

| | ticket | baseline | t1 | t2 | t3 | t4 | t5 | t6 | budgets | agent tests | tokens | tools | min |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| react | t1 | 4/4 | 6/6 |  |  |  |  |  | 1/1 | 6/6 | 77010 | 10 | 1.3 |
| react | t2 | 4/4 | 6/6 | 8/8 |  |  |  |  | 2/2 | 10/10 | 84709 | 13 | 1.8 |
| react | t3 | 4/4 | 6/6 | 8/8 | 8/8 |  |  |  | 3/3 | 15/15 | 102301 | 17 | 3.1 |
| react | t4 | 4/4 | 6/6 | 8/8 | 8/8 | 8/8 |  |  | 4/4 | 20/20 | 119353 | 21 | 4.3 |
| react | t5 | 4/4 | 6/6 | 8/8 | 8/8 | 8/8 | 6/6 |  | 6/6 | 23/23 | 131391 | 25 | 5.2 |
| react | t6 | 4/4 | 6/6 | 8/8 | 8/8 | 8/8 | 6/6 | 7/7 | 7/7 | 27/27 | 148208 | 28 | 6.8 |
| solid | t1 | 4/4 | 6/6 |  |  |  |  |  | 1/1 | 6/6 | 74749 | 7 | 1.1 |
| solid | t2 | 4/4 | 6/6 | 8/8 |  |  |  |  | 2/2 | 11/11 | 86967 | 13 | 2.0 |
| solid | t3 | 4/4 | 6/6 | 8/8 | 8/8 |  |  |  | 3/3 | 17/17 | 98886 | 15 | 2.9 |
| solid | t4 | 4/4 | 6/6 | 8/8 | 8/8 | 8/8 |  |  | 4/4 | 22/22 | 112937 | 17 | 3.8 |
| solid | t5 | 4/4 | 6/6 | 8/8 | 8/8 | 8/8 | 5/6 |  | 5/6 | 25/25 | 120055 | 18 | 4.4 |
| solid | t6 | 4/4 | 6/6 | 8/8 | 8/8 | 8/8 | 5/6 | 7/7 | 6/7 | 30/30 | 139844 | 22 | 6.0 |
| weft | t1 | 4/4 | 6/6 |  |  |  |  |  | 1/1 | 7/7 | 98893 | 22 | 2.0 |
| weft | t2 | 4/4 | 6/6 | 8/8 |  |  |  |  | 2/2 | 13/13 | 115488 | 28 | 3.2 |
| weft | t3 | 4/4 | 6/6 | 8/8 | 8/8 |  |  |  | 3/3 | 19/19 | 129856 | 32 | 4.3 |
| weft | t4 | 4/4 | 6/6 | 8/8 | 8/8 | 8/8 |  |  | 4/4 | 24/24 | 148297 | 37 | 5.6 |
| weft | t5 | 4/4 | 6/6 | 8/8 | 8/8 | 8/8 | 6/6 |  | 6/6 | 28/28 | 158522 | 42 | 6.6 |
| weft | t6 | 4/4 | 6/6 | 8/8 | 8/8 | 8/8 | 6/6 | 7/7 | 7/7 | 34/34 | 177834 | 45 | 8.0 |

## Final app

| | bundle gz | src files | lines | effects | memos | quote | star | search-narrow | type-notes-5 | quote-open |
|---|---|---|---|---|---|---|---|---|---|---|
| react | 70.0 KB | 9 | 690 | 8 | 8 | 3 DOM · 3 fmt · 1 renders · 1.34 ms | 4 DOM · 3 fmt · 1 renders · 15.39 ms | 184 DOM · 1 fmt · 1 renders · 4.68 ms | 5 DOM · 5 fmt · 5 renders · 16.13 ms | 4 DOM · 4 fmt · 1 renders · 0.91 ms |
| solid | 11.8 KB | 8 | 612 | 1 | 8 | 3 DOM · 3 fmt · – renders · 0.5 ms | 2 DOM · 0 fmt · – renders · 8.67 ms | 182 DOM · 0 fmt · – renders · 2.87 ms | 0 DOM · 0 fmt · – renders · 13.26 ms | 4 DOM · 4 fmt · – renders · 0.27 ms |
| weft | 6.8 KB | 9 | 556 | 3 | 8 | 3 DOM · 3 fmt · 4 renders · 0.49 ms | 2 DOM · 0 fmt · 3 renders · 8.6 ms | 182 DOM · 0 fmt · 8 renders · 2.72 ms | 0 DOM · 0 fmt · 5 renders · 13.08 ms | 4 DOM · 4 fmt · 6 renders · 0.26 ms |

## Failures

- **solid/t5** t5.test.tsx › budget: a burst formats each changed row once and the portfolio at most once: `AssertionError: expected 122 to be less than or equal to 121`
- **solid/t6** t5.test.tsx › budget: a burst formats each changed row once and the portfolio at most once: `AssertionError: expected 122 to be less than or equal to 121`
