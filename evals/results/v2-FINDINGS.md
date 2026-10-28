# v2 smoke run findings (2026-10-28)

**Setup:**
- 5 tasks: 3 edits of existing code and 2 written from scratch. Prompts state only goals; the traps are implicit.
- Each task holds two traps.
- React 19 and Solid 1.9, one sample each with Haiku and with Sonnet: 20 runs.
- Agents were subagents confined to isolated temp workspaces.

**Validation:** all 10 references pass. All 10 classic-bug variants fail on the intended trap: copied props, stale
speed closure, a sync effect clobbering edits, the input doubling as the query, uncontrolled notes, per-row Solid
signals, and hidden-as-stop.

**Result: 40/40 runs pass across v1 and v2. 20/20 here, including Haiku.**

| | React | Solid |
|---|---|---|
| Haiku | 5/5 | 5/5 |
| Sonnet | 5/5 | 5/5 |

How the agents got there:

- Each agent finished in 2–4 tool calls, with no visible self-correction loops.
- They reached for the idiomatic fixes unprompted:
  - quantities keyed by id
  - lifted notes
  - a ref or a live read for speed
  - a separate query state so picking doesn't search
  - Haiku's ProfileForm even used React's "adjust state during render" pattern instead of a sync effect
- Effects were used only where they belong: intervals and debounced fetches.

## What this says about the thesis

On **isolated, single-file components**, current models (Haiku/Sonnet 5.5) no longer fall into the classic React
traps. These include stale props, effect-sync, stale closures, index keys, async races and focus timing. This holds
even when the traps are implicit and the task is an edit. We could not produce a difference between React and Solid
at this scale, so **"agents can't write correct React" is not supported for small components** at this sample size.

Caveats:

- n=1 per cell.
- The agents are subagents with a strong general system prompt.
- The tasks have specs precise enough to test.
- jsdom tests can't see re-render cost.

Where the thesis can still hold, and what the next eval has to measure:

1. **Scale and drift.** Multi-file features in a 15–30 file app, where state crosses components, context and
   server data. Several sequential edits by the same agent, where earlier choices constrain later ones.
2. **Cost, not just pass/fail.** The original claim is 40k-token self-correction loops. Measure tokens, turns,
   typecheck and test retries, and time-to-green. Give agents visible tests so loops can happen.
3. **Efficiency of the output.** Re-render counts, effects per component, bundle size, and work per interaction. React
   code can be *correct* and still re-render whole subtrees per keystroke. Agents rarely optimise that unprompted.
4. **Verification.** Agents here never ran the component. They typechecked and stopped. Correctness came from
   reasoning alone. At app scale, the ability to *check* behaviour matters more. This is the testing, browser and
   inspect layer in PLAN §7b.

## Implication for the plan

The value of weft probably isn't "agents finally get small components right". They already do. It is more likely:

- less code and fewer concepts per feature
- no re-render cost by construction
- an inspectable graph and verification loop for app-scale work

Phase 0 should add an **app-scale eval** with cost and performance metrics before Phase 1 commits to the core. If
that also shows no gap, weft's pitch should lead with performance, size and the verify loop rather than
correctness.
