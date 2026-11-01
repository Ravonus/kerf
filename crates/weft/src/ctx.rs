//! What a handler knows about its call. There are three, and the generated trait picks one per function from its
//! declaration, so what TS guarantees is a compile error in Rust rather than a convention:
//!
//! - [`Ctx`]: `ctx.user()` is an `Option`, as `ctx.user` is nullable in TS.
//! - [`UserCtx`] (`auth: 'user'`): `ctx.user()` is the user; TS refused the call otherwise.
//! - [`SharedCtx`] (`cache: { life }`): there is no `user()` at all, because the value is shared by every user.
//!
//! ```compile_fail
//! fn leaks(ctx: weft::SharedCtx) { let _ = ctx.user(); }
//! ```

use std::ops::Deref;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Deserialize;

/// The claims TS sends: never the session, and only what `remote({ claims })` chose to send.
#[derive(Debug, Clone, Deserialize)]
pub struct User {
    pub id: String,
    #[serde(default)]
    pub roles: Vec<String>,
    #[serde(default)]
    pub tenant: Option<String>,
    /// Anything else a `claims` function returned.
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

impl User {
    pub fn has_role(&self, role: &str) -> bool {
        self.roles.iter().any(|r| r == role)
    }
}

/// What TS tells a sidecar or an addon about the call. Claims only: never a cookie or a session token.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Envelope {
    pub user: Option<User>,
    pub request_id: String,
    pub deadline_ms: u64,
    pub traceparent: Option<String>,
    /// Milliseconds since the epoch when TS signed it. Nothing signs an in-process call.
    #[serde(default)]
    pub iat: u64,
}

/// A monotonic clock. `Instant::now()` panics on wasm32-unknown-unknown, so there the host tells the time.
#[cfg(not(target_family = "wasm"))]
fn clock() -> Duration {
    static START: std::sync::OnceLock<std::time::Instant> = std::sync::OnceLock::new();
    START.get_or_init(std::time::Instant::now).elapsed()
}

#[cfg(target_family = "wasm")]
fn clock() -> Duration {
    Duration::from_secs_f64(crate::native::now_ms() / 1000.0)
}

#[derive(Debug)]
struct Inner {
    function: String,
    user: Option<User>,
    request_id: String,
    traceparent: Option<String>,
    deadline: Duration,
    tags: Mutex<Vec<String>>,
    touched: Mutex<Vec<String>>,
}

/// What every context has: the deadline, the ids and the two reports back to TS.
#[derive(Debug, Clone)]
pub struct Base(Arc<Inner>);

impl Base {
    pub(crate) fn new(function: &str, envelope: Envelope) -> Self {
        Base(Arc::new(Inner {
            function: function.to_string(),
            user: envelope.user,
            request_id: envelope.request_id,
            traceparent: envelope.traceparent,
            deadline: clock() + Duration::from_millis(envelope.deadline_ms),
            tags: Mutex::default(),
            touched: Mutex::default(),
        }))
    }

    /// Report a table this call read (a query) or wrote (a mutation). `weft dev` checks it against the function's tags
    /// (Q011), as it does for a TS `run`; it can't see into Rust any other way.
    pub fn touch(&self, table: impl Into<String>) {
        self.0.touched.lock().expect("touched").push(table.into());
    }

    /// Add a cache tag to this call's result, or, in a mutation, a tag to invalidate. Declared tags stay in TS: Rust can
    /// add to them and never remove one.
    pub fn tag(&self, tag: impl Into<String>) {
        self.0.tags.lock().expect("tags").push(tag.into());
    }

    /// The function's id, as the contract spells it.
    pub fn function(&self) -> &str {
        &self.0.function
    }

    /// The id TS gave this request. Log it: the client sees it on an `Internal` failure.
    pub fn request_id(&self) -> &str {
        &self.0.request_id
    }

    pub fn traceparent(&self) -> Option<&str> {
        self.0.traceparent.as_deref()
    }

    /// What's left of the deadline. weft stops waiting at zero; long CPU loops should check [`Base::cancelled`].
    pub fn remaining(&self) -> Duration {
        self.0.deadline.saturating_sub(clock())
    }

    /// The deadline passed, so no one is waiting for this answer.
    pub fn cancelled(&self) -> bool {
        self.remaining().is_zero()
    }

    pub(crate) fn tags(&self) -> Vec<String> {
        self.0.tags.lock().expect("tags").clone()
    }

    pub(crate) fn touched(&self) -> Vec<String> {
        self.0.touched.lock().expect("touched").clone()
    }

    pub(crate) fn user(&self) -> Option<&User> {
        self.0.user.as_ref()
    }
}

/// How the generated code turns the common [`Base`] into the context a function's declaration calls for. `None` means
/// the claims don't fit, which only a wrong signer can cause.
pub trait FromBase: Sized {
    fn from_base(base: Base) -> Option<Self>;
}

/// A public function: `user()` is an `Option`.
#[derive(Debug, Clone)]
pub struct Ctx(Base);

impl Ctx {
    pub fn user(&self) -> Option<&User> {
        self.0.user()
    }
}

/// `auth: 'user'`: TS refused the call unless someone is signed in.
#[derive(Debug, Clone)]
pub struct UserCtx(Base);

impl UserCtx {
    pub fn user(&self) -> &User {
        self.0.user().expect("from_base checked it")
    }
}

/// `cache: { life }`: one value for every user, so no user. Take what the value depends on as input.
#[derive(Debug, Clone)]
pub struct SharedCtx(Base);

macro_rules! context {
    ($($name:ident: $check:expr),*) => {$(
        impl Deref for $name {
            type Target = Base;
            fn deref(&self) -> &Base {
                &self.0
            }
        }
        impl FromBase for $name {
            fn from_base(base: Base) -> Option<Self> {
                let fits: fn(&Base) -> bool = $check;
                fits(&base).then_some(Self(base))
            }
        }
    )*};
}

context!(Ctx: |_| true, UserCtx: |b| b.user().is_some(), SharedCtx: |b| b.user().is_none());
