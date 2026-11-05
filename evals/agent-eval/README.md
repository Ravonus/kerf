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

For the combined S5 checkout, M4 can run the prepared manager script after
checking Node 26, the cached pnpm entry, compiler stamps, available disk and
Chromium. Set `WEFT_T06_PNPM_ENTRY` to the cached pnpm 12.15.0 `bin/pnpm.mjs`:

```bash
WEFT_T06_PNPM_ENTRY="$HOME/.cache/node/corepack/v1/pnpm/12.15.0/bin/pnpm.mjs" \
  bash "$HOME/work/weft-S5-verify/repo/evals/agent-eval/evidence/T06/yuna-calibrate.sh"
```

The script prints its receipt directory and writes progress to `setup.log`.
It packs the combined checkout into an owned staging directory, checks installed
package bytes against those tarballs, then runs the reference before mutants.
Its fixture tests are not evidence of a completed manager run.
