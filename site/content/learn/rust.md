# Rust, when you want it

:::learn
- Why you never need Rust to use weft
- When a server function is worth writing in Rust
- The two ways to run it: `native()` and `remote()`
:::

You never need Rust to create, run, build or check a weft app. The compiler ships as WebAssembly, and a native addon for
your platform installs by itself where one fits. It makes builds faster and changes no output. `weft doctor` says which one
is running.

Rust is for code you choose to write in it: a server function with a Rust body. The client doesn't change. It keeps the
same import, call, cache, tags and errors, and Zod stays the only schema.

## When it's worth it

Reach for Rust at about a millisecond of CPU per call, or on byte payloads such as search, parsing or images. For
database reads and writes, TypeScript is the better fit.

## `native()` or `remote()`

| | `native('media')` | `remote('rust://search')` |
|---|---|---|
| Runs | in the server's process: an addon, or WASM where one can't load | in a sidecar process |
| Good for | one hot CPU function | many functions, IO, or its own state |
| A hang costs | a worker thread until it returns | nothing here: the sidecar can be killed |

`weft add rust` writes a working crate, its module and one function, using `native()`. `weft add rust --remote` writes a
sidecar instead. The crate's code is the same either way, so moving between them is a line in `src/server/rust.ts`.

The [Rust reference](/reference/rust) covers the contract, errors, types, `weft dev` and deployment.

## Recap

- Rust is optional, everywhere. The compiler runs as WASM, or a prebuilt addon.
- Use it for CPU-heavy server functions. The client code stays the same.
- `native()` runs in process; `remote()` runs a sidecar. `weft add rust` sets either up.
