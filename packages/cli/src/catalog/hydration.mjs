/** hydration diagnostic entries in catalog order. */
export const hydration = [
  // Metadata and share cards (research 20 §6; H for head, M is media). `start`: reported by @kerf/start at request or
  // render time, and by `kerf routes --meta` for every route.
  {
    code: 'H009',
    severity: 'error',
    by: 'runtime',
    catches:
      "A prop of an island is something JSON can't carry (a function, a Date, a class instance), found as the server renders",
    fix: 'Pass plain data, or put `/* @kerf client */` on the component that renders it',
  },
  {
    code: 'H010',
    severity: 'info',
    by: 'cli',
    catches:
      "An island has to load with the page for a reason its code could avoid: work that reaches past it, a module that runs as it loads, a box at module level, code the compiler can't see into. `.kerf/hydration.json` says why for every island",
    fix: '`/* @kerf visible */` above the component when its work only matters on screen, `/* @kerf interaction */` when it only matters to someone using it; otherwise the fix the diagnostic names',
  },
  {
    code: 'H017',
    severity: 'info',
    by: 'cli',
    catches:
      "A prop on a component holds a function over local names, which can't cross to an island, so the component around it hydrates whole",
    fix: 'Nothing, when that component is mostly controls; otherwise move each control and what its function reads into a small component of its own, which becomes the island and leaves the rest static',
  },
]
