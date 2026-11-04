//! WebAssembly binding: node.rs over linear memory. Text in, JSON text out, no imports, so Node, Bun and Deno load the
//! same file with plain `WebAssembly`. The host fills buffers from `alloc`; `transform` takes them and returns its own,
//! `pointer << 32 | length`, for the host to read and hand back to `free`.

use std::mem::ManuallyDrop;

#[unsafe(no_mangle)]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    ManuallyDrop::new(Vec::<u8>::with_capacity(len)).as_mut_ptr()
}

/// # Safety
/// `ptr` and `len` come from `alloc`, or from `transform`'s result.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn free(ptr: *mut u8, len: usize) {
    // SAFETY: `ptr` is an allocation of capacity `len`; length 0 means no element is dropped.
    drop(unsafe { Vec::from_raw_parts(ptr, 0, len) });
}

/// # Safety
/// Both buffers come from `alloc` and hold `*_len` bytes of UTF-8 (the host's `TextEncoder`). `transform` frees them.
#[unsafe(no_mangle)]
#[allow(
    clippy::same_length_and_capacity,
    reason = "`alloc` made each buffer exactly this big"
)]
pub unsafe extern "C" fn transform(
    source: *mut u8,
    source_len: usize,
    options: *mut u8,
    options_len: usize,
) -> u64 {
    // SAFETY: each buffer is a whole `alloc` of its stated length, filled with UTF-8, and is ours to free from here.
    let source = unsafe { String::from_raw_parts(source, source_len, source_len) };
    // SAFETY: as for `source`.
    let options = unsafe { String::from_raw_parts(options, options_len, options_len) };
    let mut out = ManuallyDrop::new(crate::transform_json(&source, &options).into_bytes());
    out.shrink_to_fit();
    (out.as_mut_ptr() as u64) << 32 | out.len() as u64
}
