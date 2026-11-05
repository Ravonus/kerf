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

The S5 run waits for S4 PASS and merge, verified isolation with AGENTS.md,
weft docs and MCP, and a reliable way to record framework-source reads. The
entrypoint dispatches to Codex and the weft scaffold path uses pnpm with a
standalone age policy. Both paths have mock integration tests; neither has
been proven against a real scaffold or model. The execution guard remains in
place. Four substantive tasks have partial hidden checks but no complete grader or
reference. The Codex sandbox and authentication path still need isolation
verification.

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

## Medium-shop calibration

`node evals/agent-eval/run.mjs calibrate reference` grades only the checked-in
medium-shop reference. `node evals/agent-eval/run.mjs calibrate mutant 'wrong
stock'` applies that named checked-in mutant and exits 1 only when its named
check fails; exit 2 means it was not caught or calibration could not run. No agent is launched. The
command requires a policy-safe, owned golden at
`/private/tmp/aeval/golden/weft-warp/app` and local harness dependencies.
The golden setup is not yet verified: Corepack may fetch its own pnpm version
before pnpm applies `minimumReleaseAge`. Do not infer calibration success from
fixture tests or use the current unverified setup for an evaluation.
