# Ticket 6: sector tabs

Add tabs above the list: buttons named `All`, `tech`, `energy`, `health` and `finance`, with `aria-pressed` on the
selected one (`All` by default). A sector tab shows only that sector's stocks.

- Each tab has its own search text, **Favorites only** and **Sort**. Switching tabs shows that tab's own settings
  and results, and the header count is the current tab's. Favorites themselves are shared by all tabs.
- A tab's search keeps going when you switch away. Its request is not aborted, and when it answers, the results
  belong to that tab and are shown when you come back. Only a newer query in the same tab replaces (and aborts) it.
  `Searching…` and `Search failed` are about the current tab only.
- The selected tab and every tab's settings survive a reload. After a reload, a tab's restored search runs when that
  tab is first shown.

Switching to a tab whose rows were already on screen must not format or render those rows again.
