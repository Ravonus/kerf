Extend our stopwatch:

1. **Speed.** Add a `<select>` labelled **Speed** with options `1×`, `2×` and `5×` (values `"1"`, `"2"`, `"5"`). It makes
   the stopwatch count that many times faster. People change it while the stopwatch is running.
2. **Laps.** Add a **Lap** button that records the current time. Show laps as `Lap N: X.X` list items inside
   `<ol aria-label="Laps">`. Reset also clears the laps.
3. **Hidden.** The page now passes an optional `hidden` prop. While `hidden` is true the stopwatch must not count. When
   it becomes false again, a stopwatch that was running carries on by itself.

The tests use fake timers.
