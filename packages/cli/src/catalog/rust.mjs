/** rust diagnostic entries in catalog order. */
export const rust = [
  {
    code: 'R101',
    severity: 'error',
    by: 'cli',
    catches:
      "A function with `impl` has no `output`, a type JSON can't carry (`z.date()`, `z.bigint()`, `z.void()`, `z.custom()`), or a one-way `.transform()` on its input (`kerf build`, `kerf check`, `kerf dev`)",
    fix: 'Use a codec: `z.codec(z.iso.datetime(), z.date(), { decode, encode })`. `z.null()` says a function returns nothing',
  },
  {
    code: 'R102',
    severity: 'error',
    by: 'cli',
    catches:
      "A plain `z.union` of objects in a function with `impl`: it has no tag, so Rust can't tell its arms apart reliably. Scalar unions and `.nullable()` are fine",
    fix: "Use `z.discriminatedUnion`, or set `rust: { unions: 'allow' }`",
  },
  {
    code: 'R103',
    severity: 'error',
    by: 'cli',
    catches:
      "A sidecar doesn't match the contract: cargo stops where a generated type or method no longer fits (with the function's id), a binary built from another contract, an output the `output` schema rejects, or input serde refuses",
    fix: "Fix the Rust to fit the TS declaration, which is the source of truth; `.kerf/rust/<service>.rs` shows what's generated",
  },
  {
    code: 'R104',
    severity: 'error',
    by: 'cli',
    catches:
      "`native()` on a preset that can't run it (no file system for an addon or a `.wasm`), on a preset with no WASM when `wasm: false` is set, or a `.wasm` that won't build (a warning on a preset the addon runs on). At run time, a build with neither for this platform (503)",
    fix: "Use `remote('rust://<name>')`, the same crate behind `kerf::router`. `rustup target add wasm32-unknown-unknown`, or `rust.services.<name>.wasm: false` if nothing needs a fallback",
  },
  {
    code: 'R105',
    severity: 'warning',
    by: 'cli',
    catches:
      "A cached Rust query with `tags` that reports no table (`kerf check` reads the method; `kerf dev` sees the call): Q011 can't see into Rust, so nothing checks that the tags cover what it reads",
    fix: 'Call `ctx.touch("table")` in the Rust, or drop `tags` from a query that reads no table',
  },
  {
    code: 'R106',
    severity: 'error',
    by: 'start',
    catches:
      "A `remote()` call can't be made: no address, no `KERF_RUST_SECRET`, or the sidecar refused the signature (503)",
    fix: 'Set `KERF_RUST_<NAME>_URL` and the same `KERF_RUST_SECRET` on both sides. `kerf dev` and `kerf start` do it for what they supervise',
  },
  {
    code: 'R107',
    severity: 'error',
    by: 'start',
    catches:
      "A sidecar didn't answer, or ran past the deadline (503, 504). Only that function fails",
    fix: "Check that it's running, or raise `timeout` on `remote()`",
  },
  {
    code: 'R108',
    severity: 'error',
    by: 'start',
    catches:
      "A sidecar function panicked or returned an undeclared error (500). The detail stays in the sidecar's log, under the request id",
    fix: "Find the request id in the sidecar's log, or declare the failure in `errors`",
  },
  {
    code: 'R109',
    severity: 'error',
    by: 'cli',
    catches:
      "A sidecar doesn't build for a reason no contract function explains: a compile error, no crate, or no `cargo`",
    fix: 'Fix the crate, point `rust.services.<name>.crate` at it, or set `external: true` for one built elsewhere',
  },
]
