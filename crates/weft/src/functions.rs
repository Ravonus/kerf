//! A service's functions by contract id, and what a call comes to on any transport: `weft::router` puts them behind
//! HTTP, `weft::native!` behind Node-API or a WASM export. The body of a reply is the same on all of them:
//!
//! ```text
//! { "ok": true, "value": …, "tags": […], "touched": […] }
//! { "ok": false, "error": { "code": "NotFound", "data": … } }
//! ```

use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};

use crate::ctx::{Base, FromBase};

pub(crate) type Boxed = Pin<Box<dyn Future<Output = Answer> + Send>>;
pub(crate) type Handler = Arc<dyn Fn(Base, Vec<u8>) -> Boxed + Send + Sync>;

/// How a call ended, before the reports are added.
pub(crate) enum Answer {
    /// The value, already JSON: nothing reads it on this side.
    Value(String),
    Failed(Failed),
    /// serde refused what TS sent: the two sides were built from different contracts.
    Drift(String),
}

/// What a function's error becomes on the wire.
pub enum Failed {
    /// A declared error: `{ "code": …, "data": … }`, which TS checks against the declaration.
    Typed(Value),
    /// Anything else. The detail stays in this log: the client gets a request id.
    Internal(String),
}

/// An error type a function can return. Generated for each function that declares `errors`.
pub trait Failure {
    fn failed(self) -> Failed;
}

/// The error of a function that declares none. Any `std::error::Error` converts into it, so `?` works.
#[derive(Debug)]
pub struct Error(pub String);

impl Error {
    pub fn msg(message: impl Into<String>) -> Self {
        Error(message.into())
    }
}

impl<E: std::error::Error> From<E> for Error {
    fn from(e: E) -> Self {
        Error(e.to_string())
    }
}

impl Failure for Error {
    fn failed(self) -> Failed {
        Failed::Internal(self.0)
    }
}

/// A service's functions, by contract id. `contract::functions(service)` builds it; [`crate::router`] serves it.
pub struct Functions {
    service: &'static str,
    hash: &'static str,
    table: HashMap<&'static str, Handler>,
}

impl Functions {
    pub fn new(service: &'static str, hash: &'static str) -> Self {
        Functions {
            service,
            hash,
            table: HashMap::new(),
        }
    }

    /// One function. Called by generated code.
    #[must_use]
    pub fn add<C, I, O, E, F, Fut>(mut self, id: &'static str, f: F) -> Self
    where
        C: FromBase + Send + 'static,
        I: DeserializeOwned + Send + 'static,
        O: Serialize,
        E: Failure,
        F: Fn(C, I) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Result<O, E>> + Send + 'static,
    {
        #[derive(serde::Deserialize)]
        struct Body<I> {
            input: I,
        }
        let f = Arc::new(f);
        let handler: Handler = Arc::new(move |base, body| {
            let f = f.clone();
            Box::pin(async move {
                let input = match serde_json::from_slice::<Body<I>>(&body) {
                    Ok(b) => b.input,
                    Err(e) => return Answer::Drift(e.to_string()),
                };
                drop(body);
                let Some(ctx) = C::from_base(base) else {
                    return Answer::Drift(
                        "the claims don't fit this function's declaration".into(),
                    );
                };
                match f(ctx, input).await {
                    Ok(v) => match serde_json::to_string(&v) {
                        Ok(v) => Answer::Value(v),
                        Err(e) => Answer::Failed(Failed::Internal(format!(
                            "the result didn't serialize: {e}"
                        ))),
                    },
                    Err(e) => Answer::Failed(e.failed()),
                }
            })
        });
        self.table.insert(id, handler);
        self
    }

    pub(crate) fn service(&self) -> &'static str {
        self.service
    }

    pub(crate) fn hash(&self) -> &'static str {
        self.hash
    }

    pub(crate) fn ids(&self) -> Vec<&'static str> {
        let mut ids: Vec<_> = self.table.keys().copied().collect();
        ids.sort_unstable();
        ids
    }

    pub(crate) fn handler(&self, id: &str) -> Option<Handler> {
        self.table.get(id).cloned()
    }
}

pub(crate) fn ok_body(value: &str, base: &Base) -> String {
    let list = |l: Vec<String>| serde_json::to_string(&l).expect("strings serialize");
    format!(
        r#"{{"ok":true,"value":{value},"tags":{},"touched":{}}}"#,
        list(base.tags()),
        list(base.touched())
    )
}

/// `detail` crosses only inside this process: TS logs it, and a client never sees it.
pub(crate) fn internal_body(base: &Base, detail: Option<&str>) -> Value {
    let mut error = json!({ "code": "Internal", "requestId": base.request_id() });
    if let Some(d) = detail {
        error["detail"] = json!(d);
    }
    json!({ "ok": false, "error": error })
}

pub(crate) fn drift_body(detail: &str) -> Value {
    json!({ "ok": false, "error": { "code": "Drift", "message": detail } })
}

pub(crate) fn panic_text(p: &(dyn std::any::Any + Send)) -> String {
    p.downcast_ref::<&str>()
        .map(std::string::ToString::to_string)
        .or_else(|| p.downcast_ref::<String>().cloned())
        .unwrap_or_else(|| "no message".into())
}
