# v3 app-scale run findings (2026-10-28)

**Setup.** One shop app (`tasks-v3/shop`): 8 source files, a fake API, and 2 visible tests. Each agent took three
tickets in sequence, in one continuing session:

1. stock limits in the cart,
2. live price pushes with a "price up/down" indicator,
3. search, category and sort filters that survive tab switches.

Hidden tests are cumulative: 4 baseline + 5 + 7 + 7 = 23. A probe renders 150 products and counts DOM mutations, React
commits and time for three interactions. Runs: React 19 and Solid 1.9, Haiku and Sonnet, n=1 each.

**Validation.**
- Both references pass 23/23.
- The starter passes baseline only.
- Each planted bug fails its ticket:

  | Planted bug | Result |
  |---|---|
  | filters kept in `ProductList` (lost on tab switch) | t3 5/7 |
  | subscription opened in `CartView` | t2 4/7 |
  | no stock cap in the cart | t1 4/5 |

## Correctness: 12/12 ticket checkpoints green

| | React | Solid |
|---|---|---|
| Haiku | t1 ✓ t2 ✓ t3 ✓ (23/23) | t1 ✓ t2 ✓ t3 ✓ (23/23) |
| Sonnet | t1 ✓ t2 ✓ t3 ✓ (23/23) | t1 ✓ t2 ✓ t3 ✓ (23/23) |

- No regressions between tickets.
- All four sessions put the subscription and filter state in `App`, avoiding both drift traps (state lost on unmount,
  subscription tied to a tab) without being told about them.
- Haiku wrote more of its own tests: 8 (React) and 12 (Solid). Sonnet wrote 2 and 5.
- Every session kept its own visible tests green.

## Cost: no framework gap

Reported per session, cumulative through t3:

| | React | Solid |
|---|---|---|
| Haiku | 11 tools · 2.3 min | 10 tools · 2.4 min |
| Sonnet | 5 tools · 1.0 min | 5 tools · 1.2 min |

There were no self-correction loops. The harness's token figure is session context size (~63–85k), not spend, so it
is not comparable across sessions.

## Output efficiency: where the frameworks do differ

| | bundle gz | price-push (1 of 150 prices changes) | type-3-chars |
|---|---|---|---|
| React ref | 67.7 KB | 3 DOM · 1 commit | 167 DOM · 3 commits |
| React Haiku | 67.9 KB | 4 DOM · 1 commit · 7.4 ms | 174 DOM · 3 commits |
| React Sonnet | 67.8 KB | 4 DOM · 1 commit · 6.6 ms | 173 DOM · 3 commits |
| Solid ref | 9.9 KB | 1 DOM | 152 DOM |
| Solid Haiku | 10.5 KB | 1 DOM · 0.2 ms | 152 DOM |
| **Solid Sonnet** | 8.8 KB | **300 DOM · 11.1 ms** | 152 DOM |

1. **Bundle size is a constant ~7× gap** (68 KB vs 9–10 KB gz). It comes from the framework, not the agent.
2. **React re-renders the whole list on every price tick.**
   - It costs ~5 ms of render work per push, for a 4-node DOM change. That is correct output.
   - No agent added `memo` or anything like it unprompted: 0–1 memos in React, all for derived lists.
3. **Sonnet's Solid code rebuilt all 150 rows on every price push.** This is the most interesting result.
   - It merged live prices with `products().map(p => ({ ...p, price }))`, the immutable-update habit from React.
   - In Solid, new object identities make `<For>` tear down and recreate every row: 300 DOM mutations and 11 ms for a
     single price change. That is worse than React.
   - Haiku, in the same framework, kept products stable and read price live: 1 mutation, 0.2 ms.
   - The tests can't see this; only the probe caught it.
4. Typing in search does about the same DOM work in all variants (~150–175 mutations), because filtering really does
   remove rows. It doesn't separate anything.

## What this says about the thesis

- **Correctness doesn't separate the frameworks at app scale either.** Across 52 agent runs (v1 + v2 + v3), every
  run ended green. "Agents can't write correct React" is not supported at these sizes and with these models.
- **Efficiency does.** It comes from two places:
  - the framework's floor (bundle size, React's whole-list re-render),
  - **identity mistakes that are silent**. Here an agent's React habit cost a 300× DOM regression in Solid. No test
    failed, and the agent had no way to see it.
- That makes the case for weft concrete:
  - **Fine-grained by default**, so the floor is Solid's.
  - **Make identity mistakes visible.** Candidates:
    - a compile-time diagnostic for map-spread over a list rendered with `For` (a W0xx code),
    - per-interaction work budgets in `weft test`,
    - the reactive-graph overlay in `weft browser` showing "150 rows recreated".

  The probe that caught this is a prototype of the §7b verify loop. It should ship as a first-class assertion
  (`expect(interaction).toTouchAtMost(n)`), not stay an eval-only tool.

**Caveats:**
- n=1 per cell, with subagents rather than headless `claude -p`.
- One app, and 150 rows is a small list.
- Wall times in jsdom are only indicative.
- Tool and time figures are reported cumulatively by the harness.
