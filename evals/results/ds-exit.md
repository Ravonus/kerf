# Phase 4 exit check: weft/ds vs raw Tailwind

Run 2026-10-31. 36 fresh-agent sessions, one brief. **Not met.** a11y: yes (0.0 vs 5.3 axe nodes), consistency: no (79 vs 62 distinct values, 17 vs 13 role looks), brief: yes (10.8 vs 10.8).

Means per stack over its sessions, lower is better except Brief and dark screens. Axe counts every screen in light and dark, at 1280 and 390, plus the invalid form and the open dialog.

| Stack | Runs | Brief | axe nodes | contrast | serious | focus lost | overflow | dark screens | distinct values | role drift | agreement between sessions | raw values /100 lines | JS + CSS KB br |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| weft/ds (weft + warp) | 6 | 10.8/11 | 0 | 0 | 0 | 0 | 0.0 | 3.0/3 | 79 | 17 | 48% | 0.3 | 41.7 |
| Raw Tailwind (weft + Tailwind) | 6 | 10.8/11 | 5 | 5 | 5 | 0 | 1.0 | 2.5/3 | 62 | 13 | 9% | 0.9 | 12.1 |
| Solid + Kobalte + Tailwind | 6 | 11.0/11 | 8 | 3 | 8 | 1 | 1.7 | 3.0/3 | 66 | 14 | 14% | 3.1 | 42.2 |
| React + Radix + Tailwind | 6 | 11.0/11 | 9 | 6 | 6 | 0 | 3.0 | 3.0/3 | 63 | 15 | 8% | 3.5 | 93.0 |
| React + Zustand + Tailwind | 6 | 11.0/11 | 12 | 4 | 7 | 0 | 2.3 | 3.0/3 | 63 | 15 | 4% | 3.0 | 93.2 |
| React + MUI | 6 | 11.0/11 | 46 | 18 | 18 | 26 | 0.3 | 3.0/3 | 80 | 15 | 21% | 2.8 | 125.0 |

