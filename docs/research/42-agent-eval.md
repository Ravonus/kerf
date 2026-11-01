# 42. Agent cold-start evaluation: pre-registration

Written and committed before any measured run. **No pilot or matrix has run.** Only a harness smoke test has, on a trivial
task on Vite, and it is not a result. After the first measured run this file changes only through the log at the end.

## Question

Does a coding agent with no prior weft knowledge, given only weft's docs and tooling, succeed better and cheaper on weft than
on React? And does weft's tooling let a weaker model match a stronger one on React? A loss is a valid and useful result. This
was built to find out, not to show weft winning.

## Hypotheses

- **H1, same model.** At the same model and effort, weft + warp beats Next.js + shadcn and Vite React on success and tokens.
- **H2, model tiers.** A cheaper model on weft + warp matches a stronger model on Next.js + shadcn.
- The null, or the opposite, is reported as plainly as a win.

## Matrix

`evals/agent-eval/matrix.json`. Each run names its own model, so `model` is a per-run parameter. Five runs per cell per task.

| Group | Stack | Model | Why |
|---|---|---|---|
| primary | weft + warp | sonnet | H1 |
| primary | Next.js + shadcn | sonnet | H1 |
| primary | Vite React | sonnet | H1 |
| tier | weft + warp | haiku | H2, the weaker agent |
| tier | Next.js + shadcn | opus | H2, the stronger comparator |
| tier | Next.js + shadcn | haiku | H2 control: without it, a weft win at haiku can't be told from haiku simply being good enough |

Effort is `medium` in every cell. Six cells × five tasks × five runs is 150 runs, in a seeded random order (`run.mjs plan`), one
at a time. Aliases are resolved to exact model IDs once, and the IDs recorded here, before the first run.

## Tasks

The specs state behaviour, by accessible role, name and text, with no framework's API in them. The same `SPEC.md` goes to every
stack.

| Task | Size | Source |
|---|---|---|
| `small-todo` | small | TodoMVC's application spec |
| `medium-shop` | medium | v3 shop data and tickets 1 and 3, plus a checkout form |
| `large-live` | large | auth, live data, server functions; new |
| `edit-shop` | edit | extends the `medium-shop` reference; v3 ticket 2, v4 favourites |
| `bugfix-shop` | bug fix | the `medium-shop` reference with one planted logical bug, the same on each stack |

Hidden tests run in Chromium against the built app, and are the same file for every stack. Each test gets a fresh context. A
failing test is rerun once; one that then passes counts as passing and is recorded as a flake. Agents never see them.

A task enters the matrix only when its hidden tests pass on a reference solution on all three stacks, and when each planted
mutant fails the test named for it on all three. `matrix` refuses otherwise.

## Stacks

Each stack's normal scaffold, made once and cloned per run. Installed versions and a hash of each tree are in the manifest,
and on every run record.

| Stack | Scaffold |
|---|---|
| weft + warp | `npm create weft -- --ui warp --db none`, from local tarballs through a local registry |
| Next.js + shadcn | `create-next-app@latest`, then `shadcn@latest init -d` |
| Vite React | `npm create vite@latest -- --template react-ts`, then `npm install` |

Every stack installs through that same registry, which proxies npm, so none has a different path. `--db none` and no `--auth`
are deliberate: weft's database scaffold includes a todo app and a sign-in flow, which would hand weft part of two tasks.

The prompt is `Use <framework>.`, a blank line and the spec. Nothing else.

## Isolation

Enforced by the OS, and proved rather than assumed:

- **Environment.** Scrubbed; `claude` sees a short allowlist.
- **HOME.** Fresh for each run. The login keychain is linked in, because `claude` signs in from it. No `~/.claude`, `CLAUDE.md`,
  memory, `.npmrc` or git identity exists there.
- **Seatbelt.** No reading the real home, `/private/tmp` outside the box, system temp or `/Volumes`. No writing outside the box.
  No `ps`, `lsof`, `mdfind` or `ssh`, and no local database ports.
- **Tools.** A fixed list for every run: `Task,Bash,Edit,Read,Write,WebFetch,WebSearch,ToolSearch,Monitor,TaskStop`. Defaults such
  as `RemoteTrigger` and `Cron*` are left out because they can act beyond the box. No MCP servers. Built-in plugins stay.
- **Web.** Allowed and equal. Each run records its URLs and searches.
- **Building agent code.** Done in the same box, on a clone the agent can't reach.
- **No credentials.** No real `.env` is available. No deploys.
- **Between runs.** The agent's process group, and anything else whose cwd is in its box, is killed.

Proof, each re-run before the matrix:

- `probe`: no model. Each blocked line must fail in the box, on every stack. As a control, each read-only line must work outside
  it, since a line that fails on a missing target proves nothing.
- `canary`: a pass-through proxy scans real request bodies for strings from the owner's instructions, memory and machine. Two
  positive controls show the detector works: a file planted in the project, and the owner's real config outside the box. An
  empty scan counts as a failure.
- Every run: the init event and all tool output are checked, and the verdict goes on the run's record.

**Declared exceptions.** Both are identical across stacks and neither carries instructions:

- The account's email, in the one context sentence `claude` sends for an OAuth login. Only that exact sentence is exempt.
- The OS login name, which `ls -l` prints as a file owner.

## Metrics

Per run: input, output, cache-read and cache-write tokens, cost, turns, tool calls, wall time, and machine load before and after;
the hidden result at first stop and at the end; bugs left; bundle HTML, JS and CSS, raw and gzip; Lighthouse; a task's interaction
timing; lines changed against the scaffold; axe violations. For every stack: docs read. For weft: diagnostics met.

- **Primary token measure: total tokens**, being input + output + cache read + cache write. Every token the model was sent or
  wrote counts once, so caching can't flatter a stack. A warm cache depends on run order, so cache tokens are shown separately.
- **Cost** is the CLI's list-price figure, not what the owner pays. It moves with cache warmth, so it is secondary.
- **Wall time** is reported with load and is not used for any claim.
- The document counts toward bytes, so inlining can't hide JS or CSS.

## Run rules

- **First-try pass:** every hidden test passes when the agent first stops.
- **Follow-ups:** a failing run gets up to two automatic messages, listing only the failed test titles, the same words on every
  stack. Tokens for these count.
- **Final pass:** every hidden test passes at the end, and the app builds and starts through the stack's normal commands.
- **No rescue.** Nothing is ever hand-fixed. A run that doesn't build is a failed run.
- **Limits:** a task's budget and wall limit apply equally to each run, and hitting one is a failed run. The dollar budget scales
  by model list price (`budgetScale`), so that a limit buys each model the same tokens.
- **Excluded only:** infrastructure failures (API errors, auth), which are logged and rerun. Everything else stays in.

## Pass criteria

For each task, compare weft against each comparator. A 95% CI is a seeded bootstrap of the ratio of medians, 10,000 resamples.
Tokens are per passing run (all tokens in the cell ÷ runs that passed), so giving up early can't look cheap.

| Claim | Requires |
|---|---|
| H1 "better" | final-pass count at least the comparator's on 4 of 5 tasks, and higher on 2 or more |
| H1 "cheaper" | tokens per passing run under 0.9 × comparator with the CI's upper end below 1, on 3 of 5 tasks, and over 1.1 on none |
| H1 "worse" or "costlier" | the same tests, reversed |
| H2 "matches" | weft at haiku within 1 run of 5 of Next at the stronger model, on 4 of 5 tasks, and hidden tests passed within 5 points |
| H2 "tooling, not the model" | H2 "matches", and weft at haiku beats Next at haiku on final passes on 3 of 5 tasks |

Anything else is reported as no detectable difference. Five runs per cell finds only large effects, and the write-up will say so.
Quality metrics are reported beside these, with no claim attached.

## Open before the matrix

`run.mjs plan` lists these, and `matrix` refuses while any of the first three stand.

1. **Owner decision: weft's scaffold has no `AGENTS.md`.** `npm create weft` writes none. Only an explicit `weft agents-md` does,
   though create-weft's header comment says the first `weft dev` or `weft check` will, and `weft check` was seen not to. Next's
   scaffold does ship one. The harness uses the real scaffold, so right now agents would get no AGENTS.md. Fix it in create-weft,
   and the matrix measures that. Don't add it in the harness: that gives weft something an install doesn't.
2. **Medium, large, edit and bug-fix hidden tests and references aren't built.** Their specs are here. Only `small-todo` and
   `smoke` can be graded.
3. **Tarballs and goldens must come from the merged code.** The harness refuses goldens older than `packages/`.
4. **Exact model IDs and `budgetScale`.** Set from list prices at run time, and logged here. The scales are 1 for now.
5. **Check `cc-plugin-agents-md`.** It is built in for all stacks. Whether it loads a project's `AGENTS.md` by itself isn't known,
   and it decides how much Next's file helps.
6. **Sign-in during a long run.** The keychain is read-only in the box, so a token refresh may fail mid-matrix. It would show as
   an infra failure. Not yet seen.

## Change log

Every change after the first commit of this file, with its reason and whether any result had been seen.
