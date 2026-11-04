# Length checks

`pnpm run check --only=lint,lengths` checks JavaScript, TypeScript and Rust files. It
includes tracked files and new, non-ignored files, including fixtures and generated
code that the main lint excludes. Source files have a 400 line limit. Tests,
fixtures, generated files and vendored files have an 800 line limit. Every function
has an 80 line limit. Oxlint and Clippy remain enabled; their length
findings pass only when the collector matches the finding and the baseline check
passes. Other diagnostics still fail the check.

A baseline entry records lines and the total length of syntax tokens. The
token count ignores whitespace and comments, so it exposes code growth even when
formatting changes. Literal contents count. The check reports the number of file and
function offenders and their syntax-token size. Named functions use their name and
containing function or class; repeated names use an occurrence number, never a line
number. A rename or a new repeated function may need a refactor to meet the limit.
Rust tokenization tracks strings, comments and nested braces; Clippy still checks
Rust's parsed functions when `pnpm run check --only=clippy` runs.

The working-tree baseline is compared with every committed baseline on the branch's
first-parent history. Entries and their limits may only shrink, including after
`origin/main` advances to the current commit. A removed entry cannot be restored.
Current findings are compared with the working-tree baseline. A missing or invalid
Git baseline fails closed. The initial S0 baseline is generated and committed after
formatting, so its line counts describe the formatted sources.

To regenerate after an offender shrinks, run:

```sh
node scripts/quality/lengths.mjs --write
node --test scripts/quality/length-baseline.test.mjs
pnpm run check --only=lint,lengths
```

The generator replaces the file with the actual current offenders in a stable order.
It does not grant permission to enlarge the baseline. After the final S0 formatter,
run the same generator and inspect the baseline diff: physical line counts can
change even when token counts do not. If formatting creates new or larger entries,
the manager must review the formatting-only changes and establish the regenerated
baseline in the initial baseline commit before it lands on `origin/main`. A later
`--write` cannot reset the trusted base.
