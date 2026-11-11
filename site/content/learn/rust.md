# Rust, in depth

:::learn
- Why you never need Rust to use Kerf, and where Rust is working for you anyway
- What Kerf's compiler does to a component, from parse to DOM code
- How the compiler reaches your machine: a native addon or WebAssembly, with the same output
- When a server function is worth writing in Rust, and how `native()` and `remote()` run it
- How the Zod schema stays the one contract between TypeScript and Rust
:::

You never need Rust to create, run, build or check a Kerf app, on any platform. Rust is recommended for two things, and
required for neither: it's the language Kerf's compiler is written in, which reaches you prebuilt; and it's a language
you can choose for a server function that does heavy CPU work. This page covers both, so you know what's happening
underneath and when it's worth writing Rust yourself.

## The compiler, from the outside

Every `.tsx` file in a Kerf app goes through one compiler, `crates/kerf-compiler` in the Kerf repository. It's written in
Rust on top of [Oxc](https://oxc.rs), a fast JavaScript and TypeScript toolchain. You meet it in three places:

- **`kerf dev` and `kerf build`**, through the Vite plugin, which compiles each component as it's served or bundled.
- **`kerf check`**, which compiles every component in check mode and reports what it finds.
- **Your editor**, through the language server, which shows the same diagnostics as you type.

All three call the same code, so a diagnostic you see in the editor is the one `kerf check` and the build report.

### Native addon or WebAssembly

The compiler is built two ways from one crate: a Node addon for each common platform, and a WebAssembly module that runs
anywhere. When Kerf starts, it takes the fastest one that's there:

1. a native addon built in a checkout of the Kerf repository, if there is one;
2. the prebuilt addon for this platform, an optional dependency a normal install adds by itself;
3. the WebAssembly build that ships inside `@kerf/core`.

The output is the same byte for byte, whichever runs. Kerf's own test suite holds the two to that, so the addon only
changes how long a build takes, never what it produces. `kerf doctor` tells you which you have:

```bash
kerf doctor
```

It prints the Kerf version and runtime, a line such as `compiler: native addon (@kerf/compiler-…)` or
`compiler: WASM, same output as the addon`, and whether `cargo` is on your `PATH`, adding that Kerf doesn't need it.
`kerf check --verbose` prints the same compiler line after its report.

:::note When you'd see the WASM line
On a platform with no prebuilt addon, or an install that skipped optional dependencies, Kerf runs the WebAssembly build.
Everything works; builds of a large app are slower. Nothing to fix, and `kerf doctor` doesn't fail over it.
:::

## The compiler, from the inside

You don't need this section to write Kerf. Read it when you want to know why a diagnostic fires, or why some patterns
cost nothing at run time.

Each file is parsed once. Then four passes run over that one tree:

1. **Analyze** reads the program with its scopes and symbols. It finds components, their props and their boxes, the
   `.map` calls in JSX, and what each read and write touches. This is where most W-codes come from: a box rendered
   without `.value` (W015), a prop copied into `state` (W005), a list item rebuilt with a new identity (W014), a row that
   reads the whole of a shared object (W017). It produces a plan and the diagnostics, and writes nothing.
2. **Transform** applies the plan to the same tree. Destructured props become live reads of `props`, so
   `({ name }) => <p>{name}</p>` keeps following the parent. A keyed `.map` in JSX becomes a `For` that keeps each row by
   its key. Style groups lower to plain attributes.
3. **Emit** lowers JSX to code against Kerf's runtime. For the browser, each element tree becomes a template that's
   parsed once and cloned for each use, with one small binding for each dynamic part and delegated events. For the
   server, it becomes code that writes HTML.
4. **Facts** for the rest of the project: what each top-level binding needs from the browser (so partial hydration can
   decide which components are islands), style groups, and where boxes travel through props.

The fourth pass is why some checks see across files. One file's compile can tell that a box built with spread items
leaves through a prop; another's can tell that a prop is rendered as a keyed list. `kerf check` joins those facts and
reports W014 where they meet, even though no single file had both halves.

:::deepdive Why Rust, and why Oxc?
A compiler for an agent-first framework runs constantly: on every save, on every `kerf check` an agent runs to see if its
change is done, and in the editor on every keystroke. Speed there is the difference between a check you run and one you
skip. Oxc parses TypeScript and JSX with full scope and symbol information in a fraction of the time a JavaScript parser
takes, and Rust compiles to both a native addon and WebAssembly from the same source, which is what makes the "same output
either way" promise cheap to keep.

The cost is that the compiler isn't JavaScript you can patch in `node_modules`. The diagnostics make up for that: each
says what it found, why it matters and how to fix it, and many come with an autofix that `kerf fix` applies.
:::

### Building the compiler yourself

This is for working on Kerf itself, in a checkout of the repository, not for building an app. `pnpm run setup` at the
repository root builds everything once, the compiler included. After you change the crate, rebuild the addon and the
WebAssembly module from `packages/core`:

```bash
cd packages/core
pnpm run build:native
```

The crate pins its Rust version in `rust-toolchain.toml`, and rustup picks it up by itself. In a checkout, Kerf refuses to
load an addon that's older than the crate's source, with a message asking you to rebuild, so you can't
test a stale compiler by accident.

## Server functions in Rust

That's the Rust you don't write. The rest of this page is about the Rust you might.

A [server function](/learn/server-functions) can have a Rust body. The client doesn't change. It keeps the same import,
the same call, the same cache, tags and typed errors, and Zod stays the only schema. Only the body moves.

### When it's worth it

Reach for Rust at about a millisecond of CPU per call, or on byte payloads such as search, parsing or images. For
database reads and writes, TypeScript is the better fit: the time goes to the database, and a crossing to Rust only adds
to it. If you're not sure, measure the TypeScript version first. Many functions that look heavy aren't.

### `native()` or `remote()`

There are two ways to run the Rust:

| | `native('media')` | `remote('rust://search')` |
|---|---|---|
| Runs | in the server's process: an addon, or WASM where one can't load | in a sidecar process |
| Good for | one hot CPU function | many functions, IO, or its own state |
| Each call costs about | 10–30 µs | 50–80 µs |
| A hang costs | a worker thread until it returns | nothing here: the sidecar can be killed |

The Rust code is the same either way. Moving between them is a line in `src/server/rust.ts` and the glue at the bottom of
the crate.

### `kerf add rust`

`kerf add rust` writes a working example: a crate, its module and one function. The name is up to you; it defaults to
`media`:

```bash
kerf add rust media            # native(): an in-process addon
kerf add rust search --remote  # remote(): a sidecar
```

This is the one part of Kerf that needs a Rust toolchain (`cargo`, from [rustup.rs](https://rustup.rs)), and only for this
crate. Here's what it writes for `media`. First, the one place Rust targets are named:

```ts
// src/server/rust.ts
import { native } from '@kerf/start/rust'

export const media = native('media')
```

Then the function, declared in TypeScript as any other, with `impl` where a `run` would be:

```ts
// src/server/digest.ts
import { query } from '@kerf/start'
import { z } from 'zod'
import { media } from './rust'

export const digest = query({
  input: z.object({ text: z.string().max(1_000_000) }),
  output: z.object({ bytes: z.int(), hash: z.string() }),
  impl: media,
})
```

`output` is required on an `impl`: it's the whole contract for what comes back, and TypeScript checks every answer
against it.

And the body, in `crates/media/src/lib.rs`:

```rust
// Types and a `Service` trait, generated from your Zod.
kerf::contract!();
use contract::*;

struct Media;

impl Service for Media {
    async fn digest(
        &self,
        _ctx: kerf::Ctx,
        input: DigestInput,
    ) -> Result<DigestOutput, kerf::Error> {
        let hash = input.text.bytes().fold(0x811c9dc5u32, |h, b| {
            (h ^ b as u32).wrapping_mul(0x01000193)
        });
        Ok(DigestOutput {
            bytes: input.text.len() as i64,
            hash: format!("{hash:08x}"),
        })
    }
}

kerf::native!(contract::functions(Media));
```

A component calls it like any query, `digest({ text })`, and never learns it's Rust.

### One contract, checked on both sides

You never write the Rust types. `kerf check`, `kerf dev` and `kerf build` write the server functions' schemas to
`.kerf/contract.json`, and the crate's `build.rs` turns that into Rust: a struct for each input and output, an error enum
for each function with typed errors, and one `Service` trait with a method per function. A method is the function's name
in snake case; a type is its name plus `Input` or `Output`.

So when you change the Zod, the Rust stops compiling exactly where it no longer matches. `kerf check` runs `cargo check`
and reports that as R103, with the function's id. It's the same safety a TypeScript `run` gets from its types, across the
language boundary.

Not every Zod type can cross, because the wire is JSON:

- `z.date()` is R101. Use `z.iso.datetime()`, or a codec to a `Date` on the TypeScript side.
- `z.void()` is R101. Use `z.null()`.
- A one-way `.transform()` on an input is R101, since it can't be encoded back. `.trim()`, `.default()` and codecs are fine.
- A plain `z.union` of objects is R102. Tag it with `z.discriminatedUnion`.

### What happens where

TypeScript keeps the public edge: sessions, CSRF, input validation, the cache, `auth`, `tags` and `invalidates`. The Rust
gets one crossing per call with the parsed input, the user's claims (never their cookies), a trace id and a deadline.
TypeScript then validates the output, in production too.

Inside, `ctx` depends on the function. With `auth: 'user'` it's a `kerf::UserCtx`, where `ctx.user()` is always there. A
query cached for everyone gets a `kerf::SharedCtx`, which has no `user()` at all, so a user's data can't leak into a shared
cache. Every kind has `ctx.touch(table)` to report a table it read or wrote, `ctx.tag(tag)` to add a cache tag,
`ctx.remaining()` and `ctx.cancelled()` for the deadline, and `ctx.request_id()`.

A typed error crosses as it does from TypeScript: declare `errors` on the function, return the variant in Rust, and the
client catches `e.code` and `e.data`. A panic or a `kerf::Error` is R108: the client gets a request id, and the detail
stays in the server's log.

:::pitfall Waiting on IO inside `native()`
A `native()` call runs on Node's worker pool, so a slow one doesn't block the event loop, but there's no async runtime
inside it. A method that waits on a network call or a file belongs in `remote()`, where the sidecar has its own runtime.
On the WebAssembly fallback, a method that waits is R108. And `timeout` only stops TypeScript waiting: check
`ctx.cancelled()` in a long loop, because nothing can stop the call from outside.
:::

### Dev, build, deploy and tests

- `kerf dev` builds each crate and rebuilds on an edit. A sidecar's new binary takes over once it's healthy, so no request
  fails; a `native()` crate's next call loads the new build. A failed build keeps the old one running.
- `kerf build` runs `cargo build --release`. A `native()` crate's addon and `.wasm` go into `.output/server/rust/`, so
  whatever moves the server moves them. Sidecars go in `.output/rust/`, and `kerf start` runs and supervises them.
- `native()` needs a file system, so on an edge preset it's R104: use `remote()` there, with the same crate.
- In a test, `net.handle(fn, run)` replaces a Rust body as it does a `run`, and nothing crosses. You don't need `cargo`
  to test the code that calls it. See [Testing](/learn/testing).

The [Rust reference](/reference/rust) has the rest: every option, the deployment settings, and R101 to R109.

## Recap

- Rust is optional everywhere. The compiler is written in it and reaches you as a prebuilt addon or WebAssembly, with the
  same output. `kerf doctor` says which.
- The compiler parses each file once with Oxc, analyzes it (the W-codes), transforms props and lists, emits templates and
  bindings, and records facts that `kerf check` joins across files.
- `pnpm run build:native` in `packages/core` is for working on Kerf itself.
- Write a server function in Rust at about a millisecond of CPU per call. `native()` runs it in process; `remote()` runs a
  sidecar. `kerf add rust` sets either up.
- The Zod schema is the contract. The Rust types are generated from it, so a schema change stops `cargo` where the Rust no
  longer matches (R103).

## Try it

:::challenge Rust or not?
For each function, would you write it in TypeScript, `native()` or `remote()`? (a) `listOrders`, a database read with a
join. (b) `resizeImage`, decoding and resizing a 4 MB photo. (c) `searchDocs`, ranking over an index the process keeps in
memory and reloads every hour.
:::solution
(a) TypeScript: the time goes to the database, and a crossing would only add to it. (b) `native()`: one hot CPU function
on bytes, and an in-process call costs microseconds. (c) `remote()`: it has its own long-lived state and a reload loop,
which is what a sidecar is for, and a sidecar can be restarted without the server.
:::

:::challenge Make it cross
`kerf check` reports R101 on this function. Fix the schema so it can have a Rust body.

<!-- example: skip deliberately reports R101, which the challenge asks you to fix -->
```ts
// src/server/events.ts
import { query } from '@kerf/start'
import { z } from 'zod'
import { media } from './rust'

export const nextEvent = query({
  input: z.object({ after: z.string() }),
  output: z.object({ title: z.string(), starts: z.date() }),
  impl: media,
})
```
:::solution
```ts
// src/server/events.ts
import { query } from '@kerf/start'
import { z } from 'zod'
import { media } from './rust'

export const nextEvent = query({
  input: z.object({ after: z.iso.datetime() }),
  output: z.object({ title: z.string(), starts: z.iso.datetime() }),
  impl: media,
})
```

JSON has no date type, so a `Date` can't cross. An ISO string can, and Rust parses it with whatever date crate you use.
If the TypeScript side wants a `Date`, a `z.codec` from `z.iso.datetime()` to `z.date()` gives it one after the output
is validated.
:::

:::challenge Write the Rust
You add this function next to `digest`. Write its method in `impl Service for Media`.

```ts
// src/server/words.ts
import { query } from '@kerf/start'
import { z } from 'zod'
import { media } from './rust'

export const countWords = query({
  input: z.object({ text: z.string() }),
  output: z.object({ words: z.int() }),
  impl: media,
})
```
:::solution
```rust
async fn count_words(
    &self,
    _ctx: kerf::Ctx,
    input: CountWordsInput,
) -> Result<CountWordsOutput, kerf::Error> {
    Ok(CountWordsOutput {
        words: input.text.split_whitespace().count() as i64,
    })
}
```

The method is the function's name in snake case, and the types are its name plus `Input` and `Output`, all generated
from the Zod. Until you add the method, `cargo check` (and so `kerf check`) fails with R103, naming `countWords`.
:::
