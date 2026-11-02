//! One crossing per server function (PLAN §4.3). The request is `POST /_weft/fn/:id` with the JSON body `{ "input": … }`:
//!
//! ```text
//! weft-ctx: base64url(JSON of the Envelope)
//! weft-sig: hex(HMAC-SHA256(secret, "weft1\n" + id + "\n" + weft-ctx + "\n" + body))
//! ```
//!
//! The signature covers the function and the body as well as the claims, so a signed call can't be replayed against
//! another function or with another input, and `iat` bounds how long it can be replayed at all.

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use hmac::{Hmac, KeyInit, Mac};
use sha2::Sha256;

pub use crate::ctx::Envelope;

/// How far `iat` may be from this machine's clock.
pub const MAX_SKEW_MS: u64 = 60_000;

/// Why a call was refused before any handler ran.
#[derive(Debug, PartialEq, Eq)]
pub enum Refused {
    /// No `weft-ctx`/`weft-sig`, or they don't decode.
    Malformed,
    /// The signature doesn't match: a wrong secret, or a changed call.
    BadSignature,
    /// `iat` is too far from now.
    Stale,
}

impl std::fmt::Display for Refused {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Refused::Malformed => "no readable weft-ctx and weft-sig headers",
            Refused::BadSignature => "the signature doesn't match: is WEFT_RUST_SECRET the same on both sides?",
            Refused::Stale => "the call was signed too long ago (or a clock is off)",
        })
    }
}

fn keyed(secret: &[u8], id: &str, ctx: &str, body: &[u8]) -> Hmac<Sha256> {
    let mut mac = Hmac::<Sha256>::new_from_slice(secret).expect("HMAC takes a key of any length");
    mac.update(b"weft1\n");
    mac.update(id.as_bytes());
    mac.update(b"\n");
    mac.update(ctx.as_bytes());
    mac.update(b"\n");
    mac.update(body);
    mac
}

fn hex_decode(s: &str) -> Option<Vec<u8>> {
    if !s.len().is_multiple_of(2) {
        return None;
    }
    (0..s.len()).step_by(2).map(|i| u8::from_str_radix(s.get(i..i + 2)?, 16).ok()).collect()
}

/// The `weft-sig` for a call. TS is the signer; this is here for tests and hand-written callers.
pub fn sign(secret: &[u8], id: &str, ctx: &str, body: &[u8]) -> String {
    keyed(secret, id, ctx, body).finalize().into_bytes().iter().map(|b| format!("{b:02x}")).collect()
}

/// Check the signature (in constant time), then decode the envelope and check its age against `now_ms`.
pub fn verify(secret: &[u8], id: &str, ctx: &str, sig: &str, body: &[u8], now_ms: u64) -> Result<Envelope, Refused> {
    let sig = hex_decode(sig).ok_or(Refused::Malformed)?;
    keyed(secret, id, ctx, body).verify_slice(&sig).map_err(|_| Refused::BadSignature)?;
    let json = URL_SAFE_NO_PAD.decode(ctx).map_err(|_| Refused::Malformed)?;
    let envelope: Envelope = serde_json::from_slice(&json).map_err(|_| Refused::Malformed)?;
    if envelope.iat.abs_diff(now_ms) > MAX_SKEW_MS {
        return Err(Refused::Stale);
    }
    Ok(envelope)
}

#[cfg(test)]
mod tests {
    use super::*;

    const CTX: &str = "eyJ1c2VyIjp7ImlkIjoidTEiLCJyb2xlcyI6WyJhZG1pbiJdfSwicmVxdWVzdElkIjoicjEiLCJkZWFkbGluZU1zIjoxMDAwLCJ0cmFjZXBhcmVudCI6bnVsbCwiaWF0IjoxMDAwMDAwfQ";

    #[test]
    fn the_signature_covers_the_function_the_claims_and_the_body() {
        let sig = sign(b"s3cret", "f.abc", CTX, b"{}");
        let ok = verify(b"s3cret", "f.abc", CTX, &sig, b"{}", 1_000_000).unwrap();
        assert_eq!(ok.user.unwrap().id, "u1");
        assert_eq!(ok.deadline_ms, 1000);
        assert_eq!(verify(b"other", "f.abc", CTX, &sig, b"{}", 1_000_000).unwrap_err(), Refused::BadSignature);
        assert_eq!(verify(b"s3cret", "g.abc", CTX, &sig, b"{}", 1_000_000).unwrap_err(), Refused::BadSignature);
        assert_eq!(verify(b"s3cret", "f.abc", CTX, &sig, b"[]", 1_000_000).unwrap_err(), Refused::BadSignature);
        assert_eq!(verify(b"s3cret", "f.abc", "e30", &sig, b"{}", 1_000_000).unwrap_err(), Refused::BadSignature);
    }

    #[test]
    fn an_old_call_is_refused_even_with_a_good_signature() {
        let sig = sign(b"k", "f", CTX, b"{}");
        assert!(verify(b"k", "f", CTX, &sig, b"{}", 1_000_000 + MAX_SKEW_MS).is_ok());
        assert_eq!(verify(b"k", "f", CTX, &sig, b"{}", 1_000_000 + MAX_SKEW_MS + 1).unwrap_err(), Refused::Stale);
    }

    #[test]
    fn junk_headers_are_malformed_not_a_panic() {
        assert_eq!(verify(b"k", "f", CTX, "zz", b"{}", 0).unwrap_err(), Refused::Malformed);
        assert_eq!(verify(b"k", "f", CTX, "abc", b"{}", 0).unwrap_err(), Refused::Malformed);
        assert_eq!(verify(b"k", "f", CTX, "é", b"{}", 0).unwrap_err(), Refused::Malformed);
    }

    /// The same vector `packages/start/test/rust.test.mjs` signs in JS: the two sides agree byte for byte.
    #[test]
    fn matches_the_typescript_signer() {
        assert_eq!(
            sign(b"s3cret", "f.abc", CTX, b"{\"input\":{\"q\":\"x\"}}"),
            "1a4c89d125bdeda4db5f2dd02045bc1044ff4ecfacff00c7f42f602ceef3ad08"
        );
    }
}
