# agent-eval

The original comparative study and hypotheses are in the archived
[pre-registration](https://github.com/Ravonus/weft/blob/archive/evals-2026-11/docs/research/42-agent-eval.md).

## S5 amendment 1

The current owner instruction replaces the proposed comparison with one sample on
weft + warp for each of six tasks, using `gpt-6-luna`. Smoke is a calibration
check; report it separately from the five substantive tasks. Five Learn pages
are planned for the friction pass. This smaller run cannot test the archived
comparative hypotheses or their five-sample thresholds. Keep the archived
hypotheses unchanged and do not claim a comparison from these results.

The S5 run waits for S4 PASS and merge. It also waits for a Codex runner,
verified isolation with AGENTS.md, weft docs and MCP, and an explicit way to
record framework-source reads. The current runner invokes Claude and is not a
Codex runner. Four substantive tasks have no hidden grader or reference.
Scaffolding and grading still use npm and have not been migrated to the pnpm
minimumReleaseAge policy. Commands that could install or run agents are disabled
until those gaps are closed.

After those gaps are resolved, build artifacts from the merged candidate, run
sandbox and request-leak controls, and prove reference and mutant coverage for
each task before any evaluation. Then run the six-job plan and separately run
five Learn pages without reading framework source. The current code has no
friction command. Do not report a dry-run or matrix result until it actually
runs and sanitized receipts are checked.

```bash
node --test evals/agent-eval/test/*.test.mjs
```

The archived raw transcripts and boxes live under `/private/tmp`; they are not
safe to publish without review and sanitization.
