// The sidecar shape without the crate: POST /f parses JSON, checks an HMAC, answers the value. TCP and a Unix socket.
use axum::{Router, body::Bytes, http::HeaderMap, routing::post};
use hmac::{Hmac, KeyInit, Mac};
use sha2::Sha256;

async fn f(headers: HeaderMap, body: Bytes) -> Vec<u8> {
    let mut mac = Hmac::<Sha256>::new_from_slice(b"secret").unwrap();
    mac.update(&body);
    if let Some(sig) = headers.get("weft-sig") {
        let want = mac.finalize().into_bytes();
        let hex: String = want.iter().map(|b| format!("{b:02x}")).collect();
        assert_eq!(sig.as_bytes(), hex.as_bytes());
    }
    let v: serde_json::Value = serde_json::from_slice(&body).unwrap();
    serde_json::to_vec(&serde_json::json!({ "ok": true, "value": v["input"] })).unwrap()
}

#[tokio::main]
async fn main() {
    let app = Router::new().route("/f", post(f));
    let tcp = tokio::net::TcpListener::bind("127.0.0.1:7911")
        .await
        .unwrap();
    let _ = std::fs::remove_file("/tmp/weft-spike.sock");
    let uds = tokio::net::UnixListener::bind("/tmp/weft-spike.sock").unwrap();
    let a = app.clone();
    tokio::spawn(async move { axum::serve(uds, a).await.unwrap() });
    println!("ready");
    axum::serve(tcp, app).await.unwrap();
}
