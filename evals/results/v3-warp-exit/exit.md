# v3-warp-exit: Phase 2 exit check

| part | result | |
|---|---|---|
| hidden tests | pass | warp 23/23 (weft 23/23); price-push 1 DOM / 9 re-runs, add-one 1 DOM |
| size | pass | JS 11.17 KB br = weft shop 4.81 KB + kit 6.36 KB; budget 10.00 KB + kit allowance 7.00 KB; CSS 12.44 KB |
| token contrast | pass | 858 pairs over 6 theme × expression stops, 0 failures |
| a11y | FAIL | 108 runs, 1440 axe audits, 45847 pixel-measured contrasts, 1 failures; 0 spec findings reported |

- FAIL flow vivid/dark/full flow: inline signer color-contrast (measured) div[data-scope="system-page"]:nth-child(25) > div[data-part="body"] > div[data-part="actions"] > button[data-scope="button"][type="button"]:nth-child(1) button/button 1.04:1 (needs 4.5:1), text #07150b on #0f0c07
