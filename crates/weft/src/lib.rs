//! The Rust side of weft's `remote()` and `native()` (PLAN §4.3, research 36 and 39). A sidecar or an addon implements
//! server functions declared in TypeScript: Zod stays the source of truth, `.weft/contract.json` carries it, and `weft::build::generate` turns it into
//! serde types, a typed error enum per function and one `Service` trait, so a change on the TS side stops `cargo` exactly
//! where the Rust no longer matches.
//!
//! ```ignore
//! // build.rs: fn main() { weft::build::generate("search") }
//! weft::contract!();
//! use contract::*;
//!
//! struct Search;
//! impl Service for Search {
//!     async fn search_docs(&self, ctx: weft::SharedCtx, input: SearchDocsInput) -> Result<SearchDocsOutput, weft::Error> {
//!         ctx.touch("docs");
//!         Ok(vec![])
//!     }
//! }
//!
//! #[tokio::main]
//! async fn main() -> std::io::Result<()> {
//!     weft::serve(weft::router(contract::functions(Search))).await
//! }
//! ```
//!
//! An addon is the same `impl Service` in a `cdylib`, with one line in place of `main`:
//!
//! ```ignore
//! weft::native!(contract::functions(Media));
//! ```
//!
//! TS keeps the public edge, sessions, CSRF, the cache and validation on both sides of the call. Rust only sees input
//! that already passed, and claims, never cookies.

#[cfg(feature = "build")]
pub mod build;

#[cfg(feature = "core")]
#[cfg_attr(
    not(any(feature = "server", feature = "native")),
    allow(
        dead_code,
        reason = "`core` alone is what generated code names; the rest is for `server` and `native`"
    )
)]
mod ctx;
#[cfg(feature = "server")]
mod envelope;
#[cfg(feature = "core")]
#[cfg_attr(
    not(any(feature = "server", feature = "native")),
    allow(
        dead_code,
        reason = "`core` alone is what generated code names; the rest is for `server` and `native`"
    )
)]
mod functions;
#[cfg(feature = "native")]
#[doc(hidden)]
#[cfg_attr(
    test,
    allow(dead_code, reason = "Node-API registers exports outside test builds")
)]
pub mod native;
#[cfg(feature = "otel")]
mod otel;
#[cfg(feature = "server")]
mod server;

#[cfg(feature = "core")]
pub use ctx::{Base, Ctx, Envelope, FromBase, SharedCtx, User, UserCtx};
#[cfg(feature = "server")]
pub use envelope::{Refused, sign, verify};
#[cfg(feature = "core")]
pub use functions::{Error, Failed, Failure, Functions};
#[cfg(feature = "server")]
pub use server::{router, router_with, serve};

/// The generated contract, as `pub mod contract`: the types, the `Service` trait and `functions()`.
#[macro_export]
macro_rules! contract {
    () => {
        #[allow(dead_code, unused, clippy::all)]
        pub mod contract {
            include!(concat!(env!("OUT_DIR"), "/weft_contract.rs"));
        }
    };
}

/// This crate's functions as a Node-API addon, or a `.wasm` on that target: a `native()` crate's one line of glue.
#[cfg(feature = "native")]
#[macro_export]
macro_rules! native {
    ($functions:expr) => {
        #[cfg(not(target_family = "wasm"))]
        ::weft::__rt::napi::ctor::declarative::ctor! {
            #[ctor(unsafe)]
            fn __weft_native() {
                ::weft::native::install(|| $functions)
            }
        }
        #[cfg(target_family = "wasm")]
        #[unsafe(no_mangle)]
        pub extern "C" fn weft_init() {
            ::weft::native::install(|| $functions)
        }
    };
}

/// What generated code names, so an app doesn't have to depend on what its schemas happen to use.
#[cfg(feature = "core")]
#[doc(hidden)]
pub mod __rt {
    pub use chrono;
    #[cfg(all(feature = "native", not(target_family = "wasm")))]
    pub use napi;
    pub use regress;
    pub use uuid;
}
