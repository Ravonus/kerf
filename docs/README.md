# weft docs

## For people using weft

| Where | What |
|---|---|
| [site/content/learn](../site/content/learn) | Learn: the tutorial, from installation to Rust, in order. The site serves it at `/learn`. |
| [packages/cli/docs](../packages/cli/docs) | Reference: every API, command, config key and diagnostic. `npx weft docs <topic>` prints the same pages, and the site serves them at `/reference`. |
| [packages/pay/docs/pay.md](../packages/pay/docs/pay.md) | Reference for payments. |
| [react-props.md](react-props.md) | Coming from React: prop names, values and events. |
| Each `packages/*/README.md` | What one package is for, how to install it and where its docs are. |

## For people working on weft

| Where | What |
|---|---|
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Setup, `pnpm run check`, the rules and what a good pull request looks like. |
| [ROADMAP-1.0.md](ROADMAP-1.0.md) | The road to the 1.0 open-source release: the audit, the rules and the sprints. |
| [getting-started.md](getting-started.md) | Using a checkout of this repo in your own apps before weft is on npm. |
| [SECURITY.md](../SECURITY.md) | Reporting a security problem. |
| [evals/compare/README.md](../evals/compare/README.md) | How speed and size are measured against other stacks. |

## Internal notes

These record what was decided and why, at the time. They aren't kept up to date, so where one disagrees with the code or
the reference, the code and the reference are right.

| Where | What |
|---|---|
| [PLAN.md](PLAN.md) | The plan: design rules, the phases and a decision log. Status notes are dated. |
| [REVIEW.md](REVIEW.md) | An outside review of the first plan (2026-10-28). Everything in it was folded into the plan. |
| [research/](research/) | Numbered research and design notes, 01 to 45, in the order they were written. `research/agorix/` studies the earlier toolkit warp was rebuilt from. |
| [design/warp/](design/warp/) | warp's design: direction, foundations, components, tokens and specimens. |
| [spikes/](../spikes/) | Throwaway experiments behind some of the research: native targets, share cards, Rust sidecars and addons, style groups. |
