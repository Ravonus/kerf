# Smoke run findings (2026-10-28)

**Setup:** 6 tasks × React 19 / Solid 1.9 × 1 sample. Agents were Sonnet subagents, each confined to an isolated temp
workspace. The headless `claude -p` CLI could not be used because its login had expired.

**Result:** 12/12 pass, 48/48 tests in each framework.

## What it means

The tests work: every reference solution passes and every classic-bug variant fails. But this version of the eval
**can't tell frameworks apart**, because the prompts give away the traps. Each spec states the exact invariant that
the bug would break ("the field being typed in is never reformatted", "abort the previous signal", "a note always
stays with its task", "reset when `productId` changes"). A strong model reads the invariant and codes for it.

That matches research 01: WebApp1K found agent failures are mostly *mistakes*, not missing knowledge. Mistakes happen
when the invariant is implicit, or when the agent is *changing* code instead of writing it fresh.

## v2 changes (before the 5-sample baseline)

1. **State the goal, not the trap.** Describe user-facing behaviour in plain product language and leave the invariants
   to the hidden tests (e.g. "editing a temperature converts it to the other unit", not "never reformat the field").
2. **Edit tasks.** Give the agent an existing, working component and ask for a feature that crosses the trap, e.g.:
   - add a speed control to a stopwatch that already uses `setInterval` with a closure;
   - make a price tag react to a new `productId` prop;
   - add reordering to a list that renders with `.map`.
   Stale closures and effect-sync mostly come from incremental edits.
3. **Multi-part tasks.** Combine two traps per task, so passing needs both handled at once.
4. **Model spread.** Run Haiku and Sonnet. The weaker model shows the framework's error surface sooner.
5. **Keep the v1 tasks** as a regression floor, since weft must also pass them.

Agents wrote `useEffect` in 3 of 6 React solutions and `createEffect`/`createComputed` in 2 of 6 Solid solutions;
all were used correctly here.
