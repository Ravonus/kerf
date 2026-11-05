# Large live calibration status

This task stays disabled. The three prepared browser checks are not connected to
`hidden.mjs`. The remaining requirements, canonical reference and semantic
mutants are listed in `coverage.json`; those checks do not prove the behavior.

A reference needs a server runtime, a database with Better Auth's tables and
server session context, and the weft realtime service. The existing weft-warp
golden uses `--db none`, so a clean calibration golden must add a supported
database and auth setup and apply its schema before grading. Use a fresh owned
database and disposable generated session secret; do not copy an owner's data
or credentials. The server must authorize writes and refuse cross-origin writes.
The app may use an ephemeral database because the specification allows data to
be lost at restart.

After the reference, controls and task-specific runner setup exist, M4 can use
the command below on the combined checkout. The current script rejects this
task: it still needs an explicit allowlist, exact check and mutant counts, and
an owned database setup and cleanup. Do not run it as evidence before that work.

```sh
WEFT_T06_TASK=large-live \
WEFT_T06_PNPM_ENTRY="$HOME/.cache/node/corepack/v1/pnpm/12.15.0/bin/pnpm.mjs" \
  bash "$HOME/work/weft-S5-verify/repo/evals/agent-eval/evidence/T06/yuna-calibrate.sh"
```
