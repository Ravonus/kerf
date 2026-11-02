// The router as TS meets it: a signed POST, and each way a call can end.
#![cfg(feature = "server")]

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use axum::Router;
use axum::body::{Body, to_bytes};
use axum::http::{Request, StatusCode};
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tower::ServiceExt;
use weft::{Ctx, Failed, Failure, Functions, SharedCtx, UserCtx, router_with, sign};

const SECRET: &[u8] = b"test-secret";

#[derive(Deserialize)]
struct Q {
    q: String,
}

#[derive(Serialize)]
struct Hit {
    id: String,
}

#[derive(Serialize, Debug)]
#[serde(tag = "code", content = "data")]
enum E {
    NotFound { id: String },
}
impl Failure for E {
    fn failed(self) -> Failed {
        Failed::Typed(serde_json::to_value(self).unwrap())
    }
}

fn app() -> Router {
    let functions = Functions::new("search", "hash1")
        .add("find.a", |ctx: SharedCtx, q: Q| async move {
            ctx.touch("docs");
            ctx.tag(format!("doc:{}", q.q));
            Ok::<_, weft::Error>(vec![Hit { id: q.q }])
        })
        .add("who.a", |ctx: Ctx, _: ()| async move { Ok::<_, weft::Error>(ctx.user().map(|u| u.id.clone())) })
        .add("mine.a", |ctx: UserCtx, _: ()| async move { Ok::<_, weft::Error>(ctx.user().roles.clone()) })
        .add("missing.a", |_: Ctx, q: Q| async move { Err::<(), E>(E::NotFound { id: q.q }) })
        .add("boom.a", |_: Ctx, _: ()| async move {
            if true {
                panic!("the secret detail");
            }
            Ok::<(), weft::Error>(())
        })
        .add("fails.a", |_: Ctx, _: ()| async move { Err::<(), _>(weft::Error::msg("the secret detail")) })
        .add("slow.a", |_: Ctx, _: ()| async move {
            tokio::time::sleep(Duration::from_secs(5)).await;
            Ok::<(), weft::Error>(())
        })
        .add("late.a", |ctx: Ctx, _: ()| async move {
            let before = ctx.remaining();
            tokio::time::sleep(Duration::from_millis(30)).await;
            Ok::<_, weft::Error>(before > ctx.remaining() && !ctx.cancelled())
        });
    router_with(functions, SECRET.to_vec())
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as u64
}

fn envelope(user: Value, deadline: u64, iat: u64) -> String {
    URL_SAFE_NO_PAD.encode(json!({ "user": user, "requestId": "r-1", "deadlineMs": deadline, "traceparent": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01", "iat": iat }).to_string())
}

async fn send(id: &str, ctx: &str, sig: &str, body: &str) -> (StatusCode, Value) {
    let req = Request::post(format!("/_weft/fn/{id}"))
        .header("weft-ctx", ctx)
        .header("weft-sig", sig)
        .body(Body::from(body.to_string()))
        .unwrap();
    let res = app().oneshot(req).await.unwrap();
    let status = res.status();
    let bytes = to_bytes(res.into_body(), 1 << 20).await.unwrap();
    (status, serde_json::from_slice(&bytes).unwrap())
}

async fn call_as(id: &str, input: Value, user: Value, deadline: u64) -> (StatusCode, Value) {
    let ctx = envelope(user, deadline, now());
    let body = json!({ "input": input }).to_string();
    let sig = sign(SECRET, id, &ctx, body.as_bytes());
    send(id, &ctx, &sig, &body).await
}

async fn call(id: &str, input: Value) -> (StatusCode, Value) {
    call_as(id, input, Value::Null, 2000).await
}

#[tokio::test]
async fn an_answer_carries_the_value_and_both_reports() {
    let (status, body) = call("find.a", json!({ "q": "rust" })).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, json!({ "ok": true, "value": [{ "id": "rust" }], "tags": ["doc:rust"], "touched": ["docs"] }));
}

#[tokio::test]
async fn claims_reach_the_context_each_function_declared() {
    let user = json!({ "id": "u1", "roles": ["admin"], "tenant": "t1", "plan": "pro" });
    assert_eq!(call_as("who.a", Value::Null, user.clone(), 2000).await.1["value"], "u1");
    assert_eq!(call("who.a", Value::Null).await.1["value"], Value::Null);
    assert_eq!(call_as("mine.a", Value::Null, user.clone(), 2000).await.1["value"], json!(["admin"]));
}

#[tokio::test]
async fn the_declared_context_is_enforced_at_run_time_too() {
    // `auth: 'user'` with no user, and a shared function given one: TS never does either, so it's drift.
    let (status, body) = call("mine.a", Value::Null).await;
    assert_eq!((status, &body["error"]["code"]), (StatusCode::UNPROCESSABLE_ENTITY, &json!("Drift")));
    let (status, body) = call_as("find.a", json!({ "q": "x" }), json!({ "id": "u1" }), 2000).await;
    assert_eq!((status, &body["error"]["code"]), (StatusCode::UNPROCESSABLE_ENTITY, &json!("Drift")));
}

#[tokio::test]
async fn a_typed_error_keeps_its_code_and_data() {
    let (status, body) = call("missing.a", json!({ "q": "gone" })).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, json!({ "ok": false, "error": { "code": "NotFound", "data": { "id": "gone" } } }));
}

#[tokio::test]
async fn a_panic_is_one_failed_call_and_the_detail_stays_here() {
    for id in ["boom.a", "fails.a"] {
        let (status, body) = call(id, Value::Null).await;
        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(body, json!({ "ok": false, "error": { "code": "Internal", "requestId": "r-1" } }), "{id}");
    }
}

#[tokio::test]
async fn the_deadline_ends_the_wait() {
    let start = std::time::Instant::now();
    let (status, body) = call_as("slow.a", Value::Null, Value::Null, 50).await;
    assert_eq!((status, &body["error"]["code"]), (StatusCode::GATEWAY_TIMEOUT, &json!("Deadline")));
    assert!(start.elapsed() < Duration::from_secs(2));
    assert_eq!(call("late.a", Value::Null).await.1["value"], true);
}

#[tokio::test]
async fn what_serde_refuses_is_drift() {
    let (status, body) = call("find.a", json!({ "query": "x" })).await;
    assert_eq!((status, &body["error"]["code"]), (StatusCode::UNPROCESSABLE_ENTITY, &json!("Drift")));
    assert!(body["error"]["message"].as_str().unwrap().contains("q"), "{body}");
}

#[tokio::test]
async fn an_unknown_function_is_drift_with_its_id() {
    let (status, body) = call("gone.a", Value::Null).await;
    assert_eq!((status, &body["error"]["code"]), (StatusCode::NOT_FOUND, &json!("Drift")));
    assert!(body["error"]["message"].as_str().unwrap().contains("gone.a"));
}

#[tokio::test]
async fn nothing_runs_without_a_good_signature() {
    let ctx = envelope(json!({ "id": "root" }), 2000, now());
    let body = json!({ "input": { "q": "x" } }).to_string();
    // A forged user, another function's signature, another body, an old call, and no headers.
    let forged = sign(b"guessed", "who.a", &ctx, body.as_bytes());
    assert_eq!(send("who.a", &ctx, &forged, &body).await.0, StatusCode::UNAUTHORIZED);
    let other = sign(SECRET, "find.a", &ctx, body.as_bytes());
    assert_eq!(send("who.a", &ctx, &other, &body).await.0, StatusCode::UNAUTHORIZED);
    let good = sign(SECRET, "who.a", &ctx, b"{\"input\":null}");
    assert_eq!(send("who.a", &ctx, &good, &body).await.0, StatusCode::UNAUTHORIZED);
    let old = envelope(json!({ "id": "root" }), 2000, now() - 120_000);
    let sig = sign(SECRET, "who.a", &old, body.as_bytes());
    assert_eq!(send("who.a", &old, &sig, &body).await.0, StatusCode::UNAUTHORIZED);
    let req = Request::post("/_weft/fn/who.a").body(Body::from(body)).unwrap();
    assert_eq!(app().oneshot(req).await.unwrap().status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn health_reports_the_contract_it_was_built_from() {
    let res = app().oneshot(Request::get("/_weft/health").body(Body::empty()).unwrap()).await.unwrap();
    let bytes = to_bytes(res.into_body(), 1 << 20).await.unwrap();
    let body: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(body["contract"], "hash1");
    assert_eq!(body["service"], "search");
    assert!(body["functions"].as_array().unwrap().contains(&json!("find.a")));
}
