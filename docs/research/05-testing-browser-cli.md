# 05 — Testing, agent browser, project CLI

**Update (2026-10-29):** §2 and §5.2 chose a Playwright daemon and §5.1 StrykerJS. Phase 1b built an in-page bridge
any agent's browser can drive, and its own mutator, instead. See [22](22-verify-loop.md).

Research date: 2026-10-28. Question: what should `weft` ship so a coding agent can (1) write component tests that
mean something, (2) drive and inspect the running app, (3) be stopped from writing junk tests and junk scripts, and
(4) find the project's exact commands and scope without guessing. Sources at the end of each section. Numbers from
third-party posts are flagged as such.

## 1. Test runners: where weft tests should run

| Option | Status (Oct 2026) | Agent fit |
|---|---|---|
| **Vitest + jsdom/happy-dom** | Mature. Fast, in-process. | Best inner loop. Fake DOM: no layout, focus/pointer approximations. |
| **Vitest Browser Mode** | **Stable since Vitest 4.0 (Oct 22, 2025).** Providers are separate packages: `@vitest/browser-playwright`, `-webdriverio`, `-preview`. Adds `toMatchScreenshot`, Playwright traces. Locators are role/label/text based (Testing-Library-shaped). | Real browser, same `test()`/`expect` API, same runner as the fast lane. One config, two projects. |
| **Playwright component testing** (`@playwright/experimental-ct-*`) | **Still experimental**, no semver promise, framework adapters only (React/Vue; Svelte reportedly dropped in 1.59). No timeline to graduate. | Don't depend on it. A weft adapter would be ours to maintain on an unstable API. |
| **Playwright Test (E2E)** | Mature. `toMatchAriaSnapshot` (YAML a11y templates, partial match) is the best "structural" assertion available. | Right tool for app-level flows against the dev server. |

**Testing Library principles** ("the more your tests resemble the way your software is used, the more confidence
they give you"): query by role/label/text, not by class, test id, or component internals. Vitest Browser locators and
Playwright locators both follow this, so one query vocabulary can span both lanes.

Sources:
- https://voidzero.dev/posts/announcing-vitest-4 · https://main.vitest.dev/blog/vitest-4 · https://www.infoq.com/news/2025/12/vitest-4-browser-mode
- https://vitest.dev/guide/browser/locators
- https://playwright.dev/docs/test-components · https://currents.dev/posts/playwright-component-testing
- https://playwright.dev/docs/aria-snapshots
- https://testing-library.com/docs/guiding-principles

## 2. Agent-controlled browsers

| Tool | Model | Notes for agents |
|---|---|---|
| **`@playwright/mcp`** (Microsoft) | MCP server; `browser_snapshot` returns an aria-tree YAML with element refs; actions take refs. Screenshots optional ("vision" mode). | Deterministic, no vision model needed. Cost: official docs claim ~200–400 tokens/snapshot; a July 2026 third-party benchmark measured ~7.4K tokens on one article page. Snapshots pile up in context. `--output-mode file` writes them to disk instead. |
| **`@playwright/cli`** (`playwright-cli`) | Same engine as shell commands plus installable skills. Playwright now *recommends* it over MCP for coding agents (Claude Code, Copilot); MCP kept for long exploratory loops. | Third-party claim ~4x fewer tokens than MCP on the same task (unverified). |
| **Chrome DevTools MCP** (Google, preview Sept 2025) | CDP. Perf traces (`performance_start_trace` → condensed insights), console with source-mapped stacks, network, throttling, Lighthouse, heap. | Best at *debugging* (perf, network, console), not at structured acting. Large tool schema (~18K tokens per one review; has a slim mode). |
| **Vercel `agent-browser`** | Rust CLI + daemon over CDP. `snapshot -i -c` gives compact interactive-only trees with `@eN` refs that survive re-snapshots; `--delta` returns only changes; `--json` everywhere; `batch`; named sessions; also exposes `mcp`. | Most token-frugal design seen: interactive-only, compact, diff snapshots. Good model to copy; don't need to depend on it. |
| **Stagehand v3** (Browserbase, Oct 2025) | `act`/`extract`/`observe` in natural language, Zod-typed extract, CDP-native, action caching. | LLM-in-the-loop per action, so not deterministic and costs model calls. Built for scraping and unknown sites. Wrong fit for verifying *your own* app, where you know the roles and names. |

**Takeaways.** (1) Accessibility-tree first, screenshots on demand. Agents act by role and name, which is also how
tests should query. (2) Token cost comes from *size and accumulation*, so filter to interactive nodes, scope to a
subtree, return deltas, and write big payloads to files with a path in the reply. (3) A CLI with `--json` is at least
as good as MCP for coding agents and cheaper. Offer both from one implementation. (4) None of these tools can see
framework state. That gap is weft's to fill: its dev graph has real variable names (PLAN §2.6).

Sources:
- https://playwright.dev/mcp/introduction · https://github.com/microsoft/playwright-mcp
- https://playwright.dev/docs/getting-started-cli · https://betterstack.com/community/guides/ai/playwright-cli-vs-mcp-browser/
- https://morphllm.com/playwright-mcp · https://www.heyuan110.com/posts/ai/2026-07-27-ubrowser-review/ (third-party token benchmarks)
- https://developer.chrome.com/blog/chrome-devtools-mcp · https://github.com/ChromeDevTools/chrome-devtools-mcp · https://dev.to/grove_chatforest/chrome-devtools-mcp-server-browser-debugging-and-performance-profiling-for-ai-agents-a0h
- https://github.com/vercel-labs/agent-browser
- https://browserbase.com/changelog/stagehand-v3 · https://docs.stagehand.dev/v3/references/

## 3. Measuring test quality automatically

- **Coverage is a weak proxy for LLM tests.** MUTGEN (arXiv 2506.02954, TSE): one subject had 100% line+branch coverage
  from LLM tests and a 4% mutation score. Feeding surviving mutants back into the prompt beat both EvoSuite and plain
  prompting across 204 subjects. Other 2025 studies report LLM assertions that are "superficial or semantically weak".
- **Mutation-guided generation works at industrial scale.** Meta's ACH (FSE 2025 industry track): generate a few
  *targeted* mutants for a concern, then tests that kill them. 73% of tests accepted by engineers. An LLM
  equivalent-mutant detector reached 0.95/0.96 precision/recall after simple preprocessing.
- **Fail-before / pass-after.** SWE-bench's FAIL_TO_PASS / PASS_TO_PASS split is the standard check that a test actually
  pins the change: it must fail on the pre-change code and pass after. Cheap to run on a diff.
- **StrykerJS** has a Vitest runner (always per-test coverage analysis) and **incremental mode** (`--incremental`, only
  re-mutates changed code and tests, keeps a JSON baseline). Caveat: it only notices changes in mutated files and test
  files. Restricting `mutate` to the diff's files/lines keeps runs to seconds or minutes.
- **Property-based testing:** `@fast-check/vitest` (`test.prop`) is the maintained connector. Good for pure `derived`
  functions; agents should use it where a function has an algebraic law (round-trip, idempotence, ordering).
- **Lint rules** (`@vitest/eslint-plugin`, `eslint-plugin-testing-library`): `expect-expect`, `no-conditional-expect`,
  `no-standalone-expect`, `valid-expect`, `no-focused-tests`/`no-disabled-tests`, `no-large-snapshots`,
  `prefer-screen-queries`, `no-node-access`, `no-container`, `no-wait-for-side-effects`. These catch syntax-level junk.
  They can't catch tautologies or tests that can't fail; only mutation and fail-before checks do that.
- **Agents game tests.** EvilGenie (arXiv 2511.21654) saw Codex and Claude Code reward-hack and agents edit test files,
  mostly on ambiguous tasks. Practitioner mitigations: a CI guard on test diffs (deleted/skipped/weakened assertions),
  read-only or holdout tests, and an explicit "report a broken test" channel instead of editing it.

Sources:
- https://arxiv.org/html/2506.02954v6 (MUTGEN) · https://sol.sbc.org.br/index.php/sbqs/article/download/39001/38773
- https://arxiv.org/abs/2501.12862 · https://discovery.ucl.ac.uk/id/eprint/10218052 (Meta ACH)
- https://huggingface.co/datasets/princeton-nlp/SWE-bench (FAIL_TO_PASS / PASS_TO_PASS)
- https://stryker-mutator.io/docs/stryker-js/vitest-runner/ · https://stryker-mutator.io/docs/stryker-js/incremental/
- https://fast-check.dev/docs/tutorials/setting-up-your-test-environment/property-based-testing-with-vitest/
- https://npmjs.com/package/@vitest/eslint-plugin · https://github.com/testing-library/eslint-plugin-testing-library
- https://arxiv.org/pdf/2511.21654 (EvilGenie) · https://dev.to/penloom_studio_829b7817d3/your-ai-agent-will-pass-any-test-its-allowed-to-edit-51fo

## 4. Manifests and task runners agents handle well

- **AGENTS.md** is now stewarded by the Agentic AI Foundation (Linux Foundation, Dec 2025). Free-form markdown. Guides
  agree the *commands* section matters most: exact install/run/test/lint/build commands. Prose drifts from reality, so
  it should be generated from the manifest, not hand-written.
- **Discovery in machine-readable form:** `mise tasks ls --json`, `just --dump --dump-format json`, Nx's MCP server
  (project graph, runnable targets, generators; minimal mode by default). Turborepo has no official MCP. Lesson: an
  agent needs `name, description, inputs, side effects` per task, and the description is often the only context it
  reads before running something.
- **One-CLI precedents:** `deno task`, `bun`, `cargo`, Rails `bin/rails`. One binary, subcommands, config in one file,
  no sprawling `package.json` scripts. `package.json` scripts have no descriptions, args schema, or JSON listing, and
  agents keep adding to them.
- **CLI output conventions** (clig.dev): data on stdout, diagnostics on stderr, `--json` for structured output (implies
  quiet and stable), documented exit codes (0 ok, 1 failure, 2 usage).

Sources:
- https://agents.md · https://morphllm.com/agents-md-guide
- https://mise.jdx.dev/cli/tasks/ls.html · https://man.archlinux.org/man/extra/just/just.1.en
- https://nx.dev/docs/reference/nx-mcp · https://nx.dev/features/enhance-AI
- https://docs.deno.com/runtime/reference/cli/task/ · https://clig.dev/

---

## 5. Proposal for weft (build vs reuse)

**Principle:** one binary (`weft`), one manifest (`weft.config.ts`), one query vocabulary (role/label/text) shared by
tests and the agent browser, and one diagnostic catalog (new prefixes `T` for tests and `P` for project) feeding
`weft check --json` and MCP. Reuse Vitest, Playwright, and Stryker. Build only the glue and the weft-specific parts.

### 5.1 `weft test`
- **Authoring (`@weft-js/core/test`)**: `render(<C {...props}/>)` returns `screen`-style queries: `getByRole`, `getByLabel`,
  `getByText` only. No container, no class/test-id queries by default. User actions go through `user.click/type`, and
  every action ends in `flush()`, so there's nothing to `await waitFor`. `clock` is a deterministic fake clock
  (`clock.advance(ms)`, drives timers, `resource` and rAF). `expect(...).toHaveText/toBeVisible/...`. Snapshots are
  off; `toMatchAriaSnapshot`-style partial a11y templates are opt-in per file. `test.prop` re-exported from
  `@fast-check/vitest`. *Reuse:* Vitest, Testing Library's query semantics (or Vitest Browser locators). *Build:*
  `render`/`flush`/`clock` integration with the weft scheduler.
- **Lanes:** `weft test` runs the fast lane (Vitest + happy-dom). `weft test --browser` runs the same files in Vitest
  Browser Mode (`@vitest/browser-playwright`, Chromium). A file opts into browser-only with `// @weft-browser` when it
  needs layout, focus, canvas or surfaces. App-level flows use `weft test --e2e` (Playwright Test against `weft dev`).
  No Playwright CT.
- **Quality gate (`weft test --gate`, run in `weft check` and CI on a diff):**
  1. **Fail-before:** stash the source part of the diff, run only new or changed tests. Each must fail (`T010` if one
     passes on old code). Pure refactors are exempt via a `--refactor` flag that instead requires zero test edits.
  2. **Mutation on changed lines:** Stryker (vitest runner, incremental) with `mutate` limited to changed lines. Every
     new test must kill at least one mutant (`T011`). Surviving mutants on changed lines are listed as JSON with a
     suggested assertion, the MUTGEN/ACH loop. Budget-capped (e.g. 60 s, sampled), so it warns rather than blocks when
     over budget.
  3. **Test-diff guard:** deleting, skipping or weakening an existing assertion is `T020` and needs a
     `// weft-allow T020: <reason>` the reviewer sees.
- **T-codes (static, in the compiler and lint pass):** T001 no assertion. T002 tautology (expect on a literal, or
  `x` vs `x`). T003 asserts on a value the test itself just assigned without going through the UI or graph. T004
  `sleep`/`setTimeout`/real timers. Use `clock` or `flush`. T005 implementation query (container, class, test id,
  internal `State` reads in component tests). T006 mocking a weft module or the component under test. T007 snapshot
  without opt-in, or over N lines. T008 conditional or looped `expect`. T009 `.only`/`.skip` committed. *Reuse:* rules
  from `@vitest/eslint-plugin` and `eslint-plugin-testing-library`, re-emitted under T-codes. *Build:* T002, T003, T006.

### 5.2 `weft browser` (CLI) and `weft mcp` browser tools (same implementation)
Built on Playwright (library, not MCP), attached to the running `weft dev` server. A daemon keeps one session per
`--session` name, the agent-browser pattern.
- `open <route>` · `act <role> <name> [click|fill <text>|press <key>|select <v>]`, by role/label only, or by `@ref`
  from the last snapshot · `assert <role> <name> [visible|text=…|value=…]` with the same matchers as `@weft-js/core/test`.
- `snapshot [--interactive] [--scope <role/name>] [--delta]`: compact aria tree with refs, plus a `graph` section for
  components in scope: state/derived names from the dev naming (`Cart.coupon = "SAVE10"`, `Cart.total = 42.5`), and
  which DOM leaves each feeds. `--graph-only` returns just that. Payloads over ~2K tokens go to a file and the reply
  holds the path.
- `screenshot [--scope] [--annotate]` writes a PNG and returns the path. Never inline by default.
- `console`, `network [--failed]`, `errors`: since the last call, with weft source-mapped component names.
- `time pause|advance <ms>|resume` controls the same fake clock as tests in the page. `set <Component.box> <json>`
  writes state through the graph in dev (for reaching a state fast).
- `record` turns the session's act/assert log into a `@weft-js/core/test` or e2e file using only role queries, so exploration
  becomes a regression test that still has to pass the gate.
- All subcommands take `--json`. *Reuse:* Playwright's `ariaSnapshot`, locators, tracing; Chrome DevTools MCP stays
  recommended for perf traces (don't rebuild it). *Build:* the daemon, ref compaction and deltas, the graph overlay
  (from the dev runtime's inspector hook), recorder.

### 5.3 Manifest + CLI
- **`weft.config.ts`** (Zod-validated, typed via `defineConfig`):
  `scope: { write: ['src/**','tests/**'], read: [...], forbid: ['migrations/**', '.env*'] }`,
  `tasks: { seed: { run: 'tsx scripts/seed.ts', description, sideEffects: ['db'], env: ['dev'] } }`,
  `environments: { dev, test, preview }` (URLs, which DB), `test: { lanes, gate: { mutationBudgetSec } }`.
- **`weft` is the only CLI.** Built-ins: `dev build test check fix browser mcp tasks run <task> create`. Project
  tasks live only in `tasks` and run through `weft run <name>`. `package.json` `scripts` may contain only `weft …`
  aliases.
- **`weft tasks --json`** lists built-ins and project tasks with description, args schema, side effects, allowed
  environments and scope. The MCP server exposes the same list as tools. AGENTS.md's commands section is *generated*
  from it (`weft agents-md`), so prose can't drift.
- **Every command:** `--json` on stdout, human text on stderr, exit 0/1/2, stable `code` fields.
- **P-codes** in `weft check`: P001 new top-level script file outside a declared task. P002 new `package.json` script
  that isn't a `weft` alias. P003 task duplicates a built-in or another task (same command). P004 task missing
  description or side effects. P005 write outside `scope.write` in the diff. P006 one-off script (no task entry,
  unreferenced) older than this branch → delete or declare.

### 5.4 Build vs reuse summary
**Reuse:** Vitest (runner, both lanes), Vitest Browser + `@vitest/browser-playwright`, Playwright (library, Test for
e2e, `ariaSnapshot`), StrykerJS + vitest runner (incremental), `@fast-check/vitest`, `@vitest/eslint-plugin` +
`eslint-plugin-testing-library` rules, Zod. Point users at Chrome DevTools MCP for perf.
**Build:** `@weft-js/core/test` render/flush/clock, gate orchestration (fail-before, diff-scoped mutation, test-diff guard),
T002/T003/T006 checks, browser daemon + graph overlay + recorder, manifest schema, `weft tasks`/`run`, P-codes,
AGENTS.md generation. **Skip:** Playwright CT, Stagehand, our own MCP-only browser, snapshot testing by default.

**Phasing:** Phase 1 (PLAN §9) gets `@weft-js/core/test` + T001–T009 + `weft tasks --json` + manifest. The browser daemon
and the mutation gate come right after, once the dev inspector hook exists. Measure the gate on the eval suite. A
sound test must pass it, and a planted junk test must be caught.
