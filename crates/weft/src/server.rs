//! `weft::router()`: an axum `Router`, so a sidecar can be one binary or part of a Loco or axum app. Each call is
//! verified, deserialized, run in its own task with a deadline, and answered as
//!
//! ```text
//! { "ok": true, "value": …, "tags": […], "touched": […] }
//! { "ok": false, "error": { "code": "NotFound", "data": … } }
//! ```

use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use axum::Router;
use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use serde_json::{Value, json};
use tracing::Instrument;

use crate::ctx::Base;
use crate::envelope::{Envelope, verify};
use crate::functions::{Answer, Failed, Functions, drift_body, internal_body, ok_body};

struct Shared {
    functions: Functions,
    secret: Vec<u8>,
}

/// The `Router`: `POST /_weft/fn/:id`, and `GET /_weft/health` for the supervisor. The key comes from `WEFT_RUST_SECRET`.
///
/// # Panics
/// With no `WEFT_RUST_SECRET`: a sidecar that took unsigned calls would trust any process that could reach it.
pub fn router(functions: Functions) -> Router {
    let secret = std::env::var("WEFT_RUST_SECRET").unwrap_or_default();
    assert!(!secret.is_empty(), "R106: WEFT_RUST_SECRET is not set. `weft dev` and `weft start` set it; a sidecar deployed on its own needs the same value as the server");
    router_with(functions, secret.into_bytes())
}

/// [`router`] with the key in hand.
pub fn router_with(functions: Functions, secret: Vec<u8>) -> Router {
    Router::new()
        .route("/_weft/fn/{id}", post(call))
        .route("/_weft/health", get(health))
        .with_state(Arc::new(Shared { functions, secret }))
}

async fn health(State(s): State<Arc<Shared>>) -> Response {
    json_response(StatusCode::OK, &json!({ "ok": true, "service": s.functions.service(), "contract": s.functions.hash(), "functions": s.functions.ids(), "pid": std::process::id() }))
}

fn json_response(status: StatusCode, body: &Value) -> Response {
    text_response(status, body.to_string())
}

fn text_response(status: StatusCode, body: String) -> Response {
    (status, [(header::CONTENT_TYPE, "application/json")], body).into_response()
}

fn refused(status: StatusCode, code: &str, message: impl std::fmt::Display) -> Response {
    json_response(status, &json!({ "ok": false, "error": { "code": code, "message": message.to_string() } }))
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64)
}

/// `00-<trace>-<span>-<flags>` split, or nothing if it isn't one.
fn trace_ids(traceparent: Option<&str>) -> (&str, &str) {
    let mut parts = traceparent.unwrap_or("").split('-');
    match (parts.next(), parts.next(), parts.next()) {
        (Some("00"), Some(trace), Some(span)) if trace.len() == 32 && span.len() == 16 => (trace, span),
        _ => ("", ""),
    }
}

/// Dropping this stops the task: axum drops the handler's future when TS hangs up.
struct AbortOnDrop(tokio::task::AbortHandle);
impl Drop for AbortOnDrop {
    fn drop(&mut self) {
        self.0.abort();
    }
}

async fn call(State(s): State<Arc<Shared>>, Path(id): Path<String>, headers: HeaderMap, body: Bytes) -> Response {
    let text = |name: &str| headers.get(name).and_then(|v| v.to_str().ok());
    let (Some(ctx), Some(sig)) = (text("weft-ctx"), text("weft-sig")) else {
        return refused(StatusCode::UNAUTHORIZED, "Refused", crate::envelope::Refused::Malformed);
    };
    let envelope: Envelope = match verify(&s.secret, &id, ctx, sig, &body, now_ms()) {
        Ok(e) => e,
        Err(e) => return refused(StatusCode::UNAUTHORIZED, "Refused", e),
    };
    let Some(handler) = s.functions.handler(&id) else {
        return refused(StatusCode::NOT_FOUND, "Drift", format!("this sidecar has no function `{id}`: rebuild it from the current contract"));
    };
    let budget = Duration::from_millis(envelope.deadline_ms);
    let base = Base::new(&id, envelope);
    let (trace_id, parent_id) = trace_ids(base.traceparent());
    let span = tracing::info_span!("weft.fn", otel.name = id.as_str(), function = id.as_str(), request_id = base.request_id(), trace_id, parent_id);
    #[cfg(feature = "otel")]
    crate::otel::link(&span, base.traceparent());

    // A task of its own, so a panic is one failed call and not a dropped connection.
    let task = tokio::spawn(handler(base.clone(), Vec::from(body)).instrument(span.clone()));
    let _abort = AbortOnDrop(task.abort_handle());
    let outcome = tokio::time::timeout(budget, task).await;
    let _enter = span.enter();
    let answer = match outcome {
        Ok(Ok(answer)) => answer,
        Ok(Err(e)) if e.is_panic() => Answer::Failed(Failed::Internal(format!("panicked: {}", crate::functions::panic_text(e.into_panic())))),
        Ok(Err(e)) => Answer::Failed(Failed::Internal(e.to_string())),
        Err(_) => {
            tracing::warn!(budget_ms = budget.as_millis() as u64, "deadline passed");
            return refused(StatusCode::GATEWAY_TIMEOUT, "Deadline", format!("`{id}` ran past its deadline"));
        }
    };
    match answer {
        Answer::Value(value) => text_response(StatusCode::OK, ok_body(&value, &base)),
        Answer::Failed(Failed::Typed(error)) => json_response(StatusCode::OK, &json!({ "ok": false, "error": error })),
        Answer::Failed(Failed::Internal(detail)) => {
            tracing::error!(detail, "failed");
            json_response(StatusCode::INTERNAL_SERVER_ERROR, &internal_body(&base, None))
        }
        Answer::Drift(detail) => {
            tracing::error!(detail, "drift");
            json_response(StatusCode::UNPROCESSABLE_ENTITY, &drift_body(&detail))
        }
    }
}

/// Serve on `WEFT_LISTEN` (`127.0.0.1:0` when unset), print `weft-listening <addr>` for the supervisor, and drain on
/// SIGTERM or Ctrl-C. Logs go to stderr, by `RUST_LOG` (`info`), unless the app installed a subscriber first.
pub async fn serve(router: Router) -> std::io::Result<()> {
    use tracing_subscriber::EnvFilter;
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    let _ = tracing_subscriber::fmt().with_env_filter(filter).with_writer(std::io::stderr).try_init();
    let addr = std::env::var("WEFT_LISTEN").unwrap_or_else(|_| "127.0.0.1:0".into());
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    println!("weft-listening {}", listener.local_addr()?);
    axum::serve(listener, router).with_graceful_shutdown(stopped()).await
}

async fn stopped() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{SignalKind, signal};
        let mut term = signal(SignalKind::terminate()).expect("a SIGTERM handler");
        tokio::select! { _ = term.recv() => {}, _ = tokio::signal::ctrl_c() => {} }
    }
    #[cfg(not(unix))]
    let _ = tokio::signal::ctrl_c().await;
}
