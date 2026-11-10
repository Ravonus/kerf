<p align="center">
  <a href="https://github.com/Ravonus/weft">
    <img src="https://raw.githubusercontent.com/Ravonus/weft/main/site/public/logo.svg" width="88" height="88" alt="Weft">
  </a>
</p>

<h1 align="center">weft-layout</h1>

<p align="center">
  <strong>Shared flexbox layout for Weft's native hosts and Node tests: Taffy behind a C ABI.</strong><br>
  Hosts mirror their view tree by node id, set numbers, and read back frames. Text is measured by the host, so wrapping matches what the platform draws.
</p>

<p align="center">
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/license-MIT-145c3c" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/taffy-0.15-145c3c" alt="Taffy 0.15">
  <img src="https://img.shields.io/badge/edition-2021-145c3c" alt="Rust edition 2021">
</p>

<p align="center">
  <a href="#the-c-abi">C ABI</a> ·
  <a href="#style-keys">Style keys</a> ·
  <a href="#build-and-test">Build and test</a> ·
  <a href="../README.md">All crates</a>
</p>

> [!NOTE]
> This crate is internal and not published to crates.io or npm. Nothing else in this repository links it yet: its
> header names `spikes/native/scripts/gen-protocol.mjs` and `protocol/ops.json` as the source of `src/protocol.rs`,
> and neither is in this repository. It is built and tested with the other crates by `pnpm run check`.

`weft-layout` gives a native host (the crate's docs name iOS and Android) and Node tests one layout engine, so a view
tree lays out the same everywhere. It wraps [Taffy](https://github.com/DioxusLabs/taffy) with only the `flexbox`,
`content_size` and `taffy_tree` features. Hosts keep a mirror of their view tree here by app node id, set
token-resolved style values, call `compute`, and read back each node's frame. Everything crosses the boundary as
numbers, so the same exports work from Swift, from Kotlin through a JNI shim, and from wasm.

## Highlights

- **One small C ABI.** Nine `extern "C"` functions: create and free a tree, add, insert, remove and restyle nodes,
  mark text dirty, compute, and read a frame.
- **Host-measured text.** Leaves created as `measured` get their size from one callback the host provides, so text
  wraps the way the platform draws it.
- **Numbers only.** Node ids are `u32`, style values are `f32`, frames come back as six floats. No strings or
  structs cross.
- **Three library kinds.** `crate-type = ["rlib", "staticlib", "cdylib"]`: link it statically into an iOS app, load it
  dynamically, or use it from Rust.
- **Exact explicit sizes.** A `WIDTH` or `HEIGHT` sets the min, max and size together, so a pane neither grows nor
  shrinks to its content. Panes either side of a hinge rely on this.
- **Scroll extents.** A frame reports its content width and height, so a scroll view knows how far it scrolls.

## Model

| Concept | What it is |
|---|---|
| Tree | One Taffy tree plus a map from app node id to Taffy node, the measure callback and a user pointer |
| Node | Every node is `display: flex`, `flex-direction: column` until a key changes it |
| Measured leaf | A node created with `measured != 0`. Its size comes from the measure callback |
| Root | `compute(root, w, h)` lays the root out as the screen: it fills exactly `w` x `h` |
| Frame | `[x, y, w, h, contentW, contentH]`: position relative to the parent, size, and scrollable content extent |

## The C ABI

All functions take the tree pointer from `wl_tree_new`, and a tree must be used from one thread.

| Function | What it does |
|---|---|
| `wl_tree_new(measure, user) -> *mut Tree` | Create a tree. `measure` is the callback below; `user` is passed back to it |
| `wl_tree_free(t)` | Free a tree. Null is ignored |
| `wl_node(t, id, measured)` | Create node `id`, a measured leaf when `measured != 0`. An existing `id` is replaced |
| `wl_insert(t, parent, id, before)` | Move `id` under `parent`, before `before`; `0` (or an id not among the children) appends. Re-inserting an attached node moves it |
| `wl_remove(t, id)` | Remove the node and its whole subtree |
| `wl_set(t, id, key, value)` | Set one style key (see [Style keys](#style-keys)). Unknown keys and ids are ignored |
| `wl_dirty(t, id)` | Mark a measured leaf dirty after its content (text) changed |
| `wl_compute(t, root, w, h)` | Lay out `root` at exactly `w` x `h` |
| `wl_frame(t, id, out) -> u32` | Write `[x, y, w, h, contentW, contentH]` into `out` (6 floats). Returns `0` for an unknown id |

The measure callback:

```c
typedef void (*MeasureFn)(void *user, uint32_t id,
                          float known_w, float known_h,   /* NaN when unknown */
                          float avail_w, float avail_h,   /* -1 = min-content, +inf = max-content */
                          float *out);                    /* write [width, height] */
```

### From wasm

On `wasm32` the crate also exports `wl_tree_new_wasm()`, which creates a tree whose measure callback is the import
`env.weft_measure(id, known_w, known_h, avail_w, avail_h, out)`, and `wl_alloc(bytes)` for the host to get memory for
`out` buffers. The other `wl_*` functions are the same.

## Style keys

`wl_set` takes a key from `protocol::key` and an `f32`. Enumerated values come from `protocol::align`.

| Key | Id | Value | Effect |
|---|---|---|---|
| `DIRECTION` | 1 | `1` row, anything else column | `flex-direction` |
| `GAP` | 2 | points | Row and column gap |
| `PAD` | 3 | points | Padding on all four sides |
| `GROW` | 4 | factor | `flex-grow`. A value above 0 also sets the min size to 0, so a growing item can shrink below its content (a long list can't push its scroll view off screen) |
| `ALIGN` | 5 | `align` value | `align-items`: `START`, `CENTER`, `END`, anything else stretches |
| `JUSTIFY` | 6 | `align` value | `justify-content`: `CENTER`, `END`, `BETWEEN` (space-between), anything else starts |
| `WIDTH` | 7 | points, `NaN` for auto | Exact width: size, min and max together |
| `HEIGHT` | 8 | points, `NaN` for auto | Exact height: size, min and max together |
| `MIN_HEIGHT` | 9 | points, `NaN` for auto | Minimum height |
| `SCROLL` | 10 | `0` off, anything else on | Vertical scroll overflow, with a zero-width scrollbar |

| `align` | Value |
|---|---|
| `START` | 0 |
| `CENTER` | 1 |
| `END` | 2 |
| `STRETCH` | 3 |
| `BETWEEN` | 4 |

`src/protocol.rs` says it is generated and not to be edited by hand.

## Example from Rust

The same calls the C ABI makes, through the `rlib`:

```rust
use std::ffi::c_void;
use weft_layout::{Tree, protocol::key};

extern "C" fn measure(_: *mut c_void, _id: u32, kw: f32, kh: f32, _aw: f32, _ah: f32, out: *mut f32) {
    // A stand-in for text: 100pt wide, 20pt tall, unless the size is already known.
    let w = if kw.is_nan() { 100.0 } else { kw };
    let h = if kh.is_nan() { 20.0 } else { kh };
    // SAFETY: the MeasureFn contract gives room for [width, height].
    unsafe {
        *out = w;
        *out.add(1) = h;
    }
}

fn main() {
    let mut t = Tree::new(measure, std::ptr::null_mut());
    t.node(1, false);
    t.set(1, key::PAD, 16.0);
    t.set(1, key::GAP, 8.0);
    for id in [2, 3] {
        t.node(id, true);
        t.insert(1, id, 0);
    }
    t.compute(1, 390.0, 844.0);
    let second = t.frame(3).expect("node 3 exists");
    assert_eq!(second.y, 16.0 + 20.0 + 8.0);
}
```

## Build and test

There is no `rust-toolchain.toml` here, so the crate builds with your default toolchain.

```bash
cd crates/weft-layout
cargo test                                   # the layout tests in src/lib.rs
cargo clippy --all-targets -- -D warnings
cargo build --release                        # rlib, staticlib and cdylib for the host
cargo build --release --target wasm32-unknown-unknown   # after `rustup target add wasm32-unknown-unknown`
```

The tests in `src/lib.rs` cover a padded column with a gap, a row that grows and justifies, insert-before and moves,
scroll content extent, a growing parent that keeps a scroll view on screen, subtree removal, and exact widths around a
hinge. Their measure stand-in is 10pt per character, where the character count is `id % 100`, and 20pt tall.

The release profile is built for size: `opt-level = "s"`, `lto = true`, `panic = "abort"`, `codegen-units = 1`.

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for the repository workflow.

## License

[MIT](../../LICENSE)
