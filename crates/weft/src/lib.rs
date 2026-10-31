//! The Rust side of weft's `remote()` (PLAN §4.3, research 36). A sidecar implements server functions declared in
//! TypeScript: Zod stays the source of truth, `.weft/contract.json` carries it, and `weft::build::generate` turns it into
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
//! TS keeps the public edge, sessions, CSRF, the cache and validation on both sides of the call. A sidecar only sees
//! input that already passed, and claims it can verify, never cookies.

#[cfg(feature = "build")]
pub mod build;

#[cfg(feature = "server")]
mod ctx;
#[cfg(feature = "server")]
mod envelope;
#[cfg(feature = "server")]
mod server;
#[cfg(feature = "otel")]
mod otel;

#[cfg(feature = "server")]
pub use ctx::{Base, Ctx, FromBase, SharedCtx, User, UserCtx};
#[cfg(feature = "server")]
pub use envelope::{Envelope, Refused, sign, verify};
#[cfg(feature = "server")]
pub use server::{Error, Failed, Failure, Functions, router, router_with, serve};

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

/// What generated code names, so a sidecar doesn't have to depend on what its schemas happen to use.
#[cfg(feature = "server")]
#[doc(hidden)]
pub mod __rt {
    pub use chrono;
    pub use regress;
    pub use uuid;
}
