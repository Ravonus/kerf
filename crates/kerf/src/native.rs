//! `native()` (PLAN §4.3, research 39): a service's functions in-process. One crossing per function, as with a sidecar,
//! with no HTTP and no signature: nothing outside the process can reach it.
//!
//! A real addon runs each call on the host's worker pool, so a long one doesn't hold the event loop. A `.wasm` is the
//! same code behind a small ABI of its own, on whatever thread calls it. Neither brings an async runtime: this is for
//! CPU, and a function that waits on IO belongs in `remote()`.

use std::future::Future;
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::pin::pin;
use std::sync::OnceLock;
use std::task::{Context, Poll, Waker};

use serde_json::json;

use crate::ctx::{Base, Envelope};
use crate::functions::{Answer, Failed, Functions, drift_body, internal_body, ok_body, panic_text};

static MAKE: OnceLock<fn() -> Functions> = OnceLock::new();
static FUNCTIONS: OnceLock<Functions> = OnceLock::new();

/// Called once by `kerf::native!`. The service is built on the first call, not while the library loads.
pub fn install(make: fn() -> Functions) {
    let _ = MAKE.set(make);
}

fn functions() -> &'static Functions {
    FUNCTIONS.get_or_init(|| MAKE.get().expect("kerf::native! ran")())
}

/// `{ service, hash, functions }`: TS refuses a library built from another contract (R103).
fn contract() -> String {
    let f = functions();
    json!({ "service": f.service(), "hash": f.hash(), "functions": f.ids() }).to_string()
}

#[cfg(not(target_family = "wasm"))]
fn wait<F: Future>(mut future: std::pin::Pin<&mut F>) -> F::Output {
    struct Unpark(std::thread::Thread);
    impl std::task::Wake for Unpark {
        fn wake(self: std::sync::Arc<Self>) {
            self.0.unpark();
        }
    }
    let waker = Waker::from(std::sync::Arc::new(Unpark(std::thread::current())));
    let mut cx = Context::from_waker(&waker);
    loop {
        match future.as_mut().poll(&mut cx) {
            Poll::Ready(v) => return v,
            Poll::Pending => std::thread::park(),
        }
    }
}

#[cfg(target_family = "wasm")]
fn wait<F: Future>(future: std::pin::Pin<&mut F>) -> F::Output {
    match future.poll(&mut Context::from_waker(Waker::noop())) {
        Poll::Ready(v) => v,
        Poll::Pending => {
            panic!(
                "a `native()` function can't wait on WASM: nothing would wake it. Use `remote()` for IO"
            )
        }
    }
}

/// One call, start to finish, on this thread.
fn dispatch(id: &str, ctx: &str, body: Vec<u8>) -> String {
    let envelope: Envelope = match serde_json::from_str(ctx) {
        Ok(e) => e,
        Err(e) => return drift_body(&format!("the call's context didn't parse: {e}")).to_string(),
    };
    let Some(handler) = functions().handler(id) else {
        return drift_body(&format!(
            "this library has no function `{id}`: rebuild it from the current contract"
        ))
        .to_string();
    };
    let base = Base::new(id, envelope);
    let call = handler(base.clone(), body);
    let answer = catch_unwind(AssertUnwindSafe(|| wait(pin!(call)))).unwrap_or_else(|p| {
        Answer::Failed(Failed::Internal(format!("panicked: {}", panic_text(&*p))))
    });
    match answer {
        Answer::Value(value) => ok_body(&value, &base),
        Answer::Failed(Failed::Typed(error)) => json!({ "ok": false, "error": error }).to_string(),
        Answer::Failed(Failed::Internal(detail)) => internal_body(&base, Some(&detail)).to_string(),
        Answer::Drift(detail) => drift_body(&detail).to_string(),
    }
}

#[cfg(not(target_family = "wasm"))]
mod addon {
    use napi::bindgen_prelude::{AsyncTask, Env, Result, Task};
    use napi_derive::napi;

    pub struct Call {
        id: String,
        ctx: String,
        body: Option<String>,
    }

    impl Task for Call {
        type Output = String;
        type JsValue = String;

        fn compute(&mut self) -> Result<String> {
            Ok(super::dispatch(
                &self.id,
                &self.ctx,
                self.body.take().unwrap_or_default().into_bytes(),
            ))
        }

        fn resolve(&mut self, _: Env, reply: String) -> Result<String> {
            Ok(reply)
        }
    }

    #[napi]
    pub fn call(id: String, ctx: String, body: String) -> AsyncTask<Call> {
        AsyncTask::new(Call {
            id,
            ctx,
            body: Some(body),
        })
    }

    #[napi]
    pub fn contract() -> String {
        super::contract()
    }
}

/// A pointer and a length in one number: the only return value this ABI needs, and it fits a JS `BigInt`.
#[cfg(target_family = "wasm")]
mod wasm {
    #[link(wasm_import_module = "kerf")]
    unsafe extern "C" {
        fn now() -> f64;
        fn panicked(ptr: *const u8, len: usize);
    }

    fn give(text: String) -> u64 {
        let bytes = text.into_bytes().into_boxed_slice();
        let len = bytes.len() as u64;
        ((Box::into_raw(bytes).cast::<u8>() as u64) << 32) | len
    }

    /// # Safety
    /// `ptr` and `len` are valid UTF-8 that outlives `'a`.
    unsafe fn text<'a>(ptr: *const u8, len: usize) -> &'a str {
        // SAFETY: the caller's contract above.
        unsafe { std::str::from_utf8_unchecked(std::slice::from_raw_parts(ptr, len)) }
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn kerf_alloc(len: usize) -> *mut u8 {
        Box::into_raw(vec![0u8; len].into_boxed_slice()).cast::<u8>()
    }

    /// # Safety
    /// `ptr` and `len` are what `kerf_alloc`, `kerf_call` or `kerf_contract` handed out.
    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn kerf_free(ptr: *mut u8, len: usize) {
        // SAFETY: the caller hands back a boxed slice of exactly `len` bytes.
        drop(unsafe { Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, len)) });
    }

    /// `body` is the caller's, and is taken over, as `kerf_alloc` gave it.
    ///
    /// # Safety
    /// Each pair is valid UTF-8 from `kerf_alloc`.
    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn kerf_call(
        id: *const u8,
        id_len: usize,
        ctx: *const u8,
        ctx_len: usize,
        body: *mut u8,
        body_len: usize,
    ) -> u64 {
        // A panic aborts here: the instance traps, and TS starts a new one. This is how the message gets out first.
        static HOOK: std::sync::Once = std::sync::Once::new();
        HOOK.call_once(|| {
            std::panic::set_hook(Box::new(|info| {
                let message = info.to_string();
                // SAFETY: the host copies the bytes out during the call; `message` is live and UTF-8.
                unsafe { panicked(message.as_ptr(), message.len()) }
            }));
        });
        // SAFETY: `body` is a `kerf_alloc` box of `body_len` bytes, and it's ours now.
        let body =
            unsafe { Box::from_raw(std::ptr::slice_from_raw_parts_mut(body, body_len)) }.into_vec();
        // SAFETY: the caller keeps both strings, valid UTF-8, for the whole call.
        let (id, ctx) = unsafe { (text(id, id_len), text(ctx, ctx_len)) };
        give(super::dispatch(id, ctx, body))
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn kerf_contract() -> u64 {
        give(super::contract())
    }

    pub(crate) fn time() -> f64 {
        // SAFETY: a plain import: no arguments, no memory.
        unsafe { now() }
    }
}

#[cfg(target_family = "wasm")]
pub(crate) use wasm::time as now_ms;
