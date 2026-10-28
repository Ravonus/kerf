Build a `Stopwatch` component (no props).

Behaviour:

- An element with `data-testid="elapsed"` shows elapsed seconds with one decimal (`0.0` at start).
- While running, every 100 ms of time the elapsed value increases by `0.1 × speed`. Use timers
  (`setInterval`/`setTimeout`) and/or `Date.now()`. Tests use fake timers.
- A `<select>` labelled **Speed** with options `1`, `2` and `5` (values `"1"`, `"2"`, `"5"`), default `1`. Changing it
  while running takes effect from the next 100 ms step; time already counted is not changed.
- One toggle button labelled **Start** when stopped and **Stop** when running.
- A **Lap** button records the current elapsed value. Laps render as `<li>` items `Lap N: X.X` (N from 1) inside an
  `<ol aria-label="Laps">`.
- A **Reset** button stops the stopwatch, sets elapsed to `0.0` and clears all laps.
- When stopped, and after the component is unmounted, no timers may be left running.
