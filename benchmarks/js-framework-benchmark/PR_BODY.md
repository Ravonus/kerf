Add a keyed weft implementation using the published weft runtime and compiler.
The entry implements the reference operations with keyed rows and the reference
markup. Dependencies are pinned.

The upstream keyed detector and smoke benchmarks pass using the pnpm-based
local harness. The npm v3 lock is derived from the pinned pnpm graph and checked for closure
and integrity. The unmodified upstream rebuild-ci remains pending.
