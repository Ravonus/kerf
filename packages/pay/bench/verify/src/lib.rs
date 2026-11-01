//! Webhook verification as a wasm export: HMAC-SHA256 of the input, compared in constant time. The input is
//! `key_len` bytes of key, then the message, then 32 bytes of expected tag, all written at `input(len)`.
use hmac::{Hmac, Mac};
use sha2::Sha256;
use subtle::ConstantTimeEq;

static mut BUF: Vec<u8> = Vec::new();

#[no_mangle]
pub extern "C" fn input(len: usize) -> *mut u8 {
    #[allow(static_mut_refs)]
    unsafe {
        BUF.resize(len, 0);
        BUF.as_mut_ptr()
    }
}

#[no_mangle]
pub extern "C" fn verify(key_len: usize) -> i32 {
    #[allow(static_mut_refs)]
    let buf = unsafe { &BUF };
    let (key, rest) = buf.split_at(key_len);
    let (msg, tag) = rest.split_at(rest.len() - 32);
    let mut mac = Hmac::<Sha256>::new_from_slice(key).unwrap();
    mac.update(msg);
    mac.finalize().into_bytes().ct_eq(tag).unwrap_u8() as i32
}
