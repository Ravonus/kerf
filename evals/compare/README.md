# Same dashboard, four stacks

One screen built in weft + warp, Solid + Kobalte + TanStack Table + Tailwind, React + Radix + TanStack Table + Tailwind,
and React + MUI + X DataGrid: a shell (sidebar, account menu, phone drawer) and a 200-row table (sort, filter, selection
with a bulk action, paging, column picker, inline details, a live cell). One data set, latest stable versions, plain
`vite build`.

    node measure.mjs     # size, load under 4x CPU throttle, parity script with DOM mutations, screen sweep

`results.json` holds the numbers. Run `npm install --legacy-peer-deps` in each stack first.

The React and Solid tables are hand-written on headless parts, so they carry less design than warp: no dials, dark theme or
phone card layout. MUI's community DataGrid has no detail panel, so details open under the grid.
