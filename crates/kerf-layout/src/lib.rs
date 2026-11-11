//! Shared layout for kerf's native hosts (iOS, Android) and for Node tests.
//!
//! Hosts mirror their view tree here by app node id, set token-resolved style values, and read back frames.
//! Leaves that hold text are measured by the host through one callback, so wrapping matches what the platform
//! draws. Everything crosses as numbers: the same exports work from Swift, from Kotlin (JNI) and from wasm.

use std::collections::HashMap;
use std::ffi::c_void;

use taffy::prelude::*;

pub mod protocol;
use protocol::{align, key};

/// `out` receives `[width, height]`. Unknown dimensions are NaN; available space is a number,
/// `-1` for min-content or `+inf` for max-content.
pub type MeasureFn = extern "C" fn(
    user: *mut c_void,
    id: u32,
    known_w: f32,
    known_h: f32,
    avail_w: f32,
    avail_h: f32,
    out: *mut f32,
);

pub struct Tree {
    taffy: TaffyTree<u32>,
    nodes: HashMap<u32, NodeId>,
    measure: MeasureFn,
    user: *mut c_void,
}

/// One node's result: position relative to its parent, size, and scrollable content extent.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Frame {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    pub content_w: f32,
    pub content_h: f32,
}

fn space(a: AvailableSpace) -> f32 {
    match a {
        AvailableSpace::Definite(v) => v,
        AvailableSpace::MinContent => -1.0,
        AvailableSpace::MaxContent => f32::INFINITY,
    }
}

fn bound(v: f32) -> LengthPercentageAuto {
    if v.is_nan() {
        LengthPercentageAuto::auto()
    } else {
        LengthPercentageAuto::length(v)
    }
}

fn dim(v: f32) -> Dimension {
    if v.is_nan() {
        Dimension::auto()
    } else {
        Dimension::length(v)
    }
}

fn align_items(v: u32) -> AlignItems {
    match v {
        align::START => AlignItems::FLEX_START,
        align::CENTER => AlignItems::CENTER,
        align::END => AlignItems::FLEX_END,
        _ => AlignItems::STRETCH,
    }
}

fn justify(v: u32) -> JustifyContent {
    match v {
        align::CENTER => JustifyContent::CENTER,
        align::END => JustifyContent::FLEX_END,
        align::BETWEEN => JustifyContent::SPACE_BETWEEN,
        _ => JustifyContent::FLEX_START,
    }
}

#[path = "lib/tree.rs"]
mod tree;

// ---- C ABI (Swift, Kotlin via JNI shim, wasm) ----

#[no_mangle]
pub extern "C" fn wl_tree_new(measure: MeasureFn, user: *mut c_void) -> *mut Tree {
    Box::into_raw(Box::new(Tree::new(measure, user)))
}

/// # Safety
/// `t` must come from `wl_tree_new` and not be used afterwards.
#[no_mangle]
pub unsafe extern "C" fn wl_tree_free(t: *mut Tree) {
    if !t.is_null() {
        // SAFETY: the caller hands back a pointer from `wl_tree_new`, whose `Box` this reclaims once.
        drop(unsafe { Box::from_raw(t) });
    }
}

macro_rules! tree {
    ($t:expr) => {
        // SAFETY: hosts pass the pointer returned by `wl_tree_new` and call from one thread.
        unsafe { &mut *$t }
    };
}

/// # Safety
/// `t` must be a live tree from `wl_tree_new`, used from one thread.
#[no_mangle]
pub unsafe extern "C" fn wl_node(t: *mut Tree, id: u32, measured: u32) {
    tree!(t).node(id, measured != 0);
}
/// # Safety
/// `t` must be a live tree from `wl_tree_new`, used from one thread.
#[no_mangle]
pub unsafe extern "C" fn wl_remove(t: *mut Tree, id: u32) {
    tree!(t).remove(id);
}
/// # Safety
/// `t` must be a live tree from `wl_tree_new`, used from one thread.
#[no_mangle]
pub unsafe extern "C" fn wl_insert(t: *mut Tree, parent: u32, id: u32, before: u32) {
    tree!(t).insert(parent, id, before);
}
/// # Safety
/// `t` must be a live tree from `wl_tree_new`, used from one thread.
#[no_mangle]
pub unsafe extern "C" fn wl_set(t: *mut Tree, id: u32, k: u32, v: f32) {
    tree!(t).set(id, k, v);
}
/// # Safety
/// `t` must be a live tree from `wl_tree_new`, used from one thread.
#[no_mangle]
pub unsafe extern "C" fn wl_dirty(t: *mut Tree, id: u32) {
    tree!(t).dirty(id);
}
/// # Safety
/// `t` must be a live tree from `wl_tree_new`, used from one thread.
#[no_mangle]
pub unsafe extern "C" fn wl_compute(t: *mut Tree, root: u32, w: f32, h: f32) {
    tree!(t).compute(root, w, h);
}

/// Writes `[x, y, w, h, contentW, contentH]` into `out`. Returns 0 for an unknown id.
///
/// # Safety
/// `t` must be a live tree from `wl_tree_new`, used from one thread. `out` must point to 6 writable floats.
#[no_mangle]
pub unsafe extern "C" fn wl_frame(t: *mut Tree, id: u32, out: *mut f32) -> u32 {
    match tree!(t).frame(id) {
        Some(f) => {
            // SAFETY: the source is this 6-float array, and the caller guarantees `out` has room for 6.
            unsafe {
                std::ptr::copy_nonoverlapping(
                    [f.x, f.y, f.w, f.h, f.content_w, f.content_h].as_ptr(),
                    out,
                    6,
                );
            };
            1
        }
        None => 0,
    }
}

// ---- wasm: Node tests import the measure function as `env.kerf_measure` ----

#[cfg(target_arch = "wasm32")]
mod wasm {
    use super::{c_void, wl_tree_new, Tree};

    #[link(wasm_import_module = "env")]
    extern "C" {
        fn kerf_measure(
            id: u32,
            known_w: f32,
            known_h: f32,
            avail_w: f32,
            avail_h: f32,
            out: *mut f32,
        );
    }

    extern "C" fn trampoline(
        _: *mut c_void,
        id: u32,
        kw: f32,
        kh: f32,
        aw: f32,
        ah: f32,
        out: *mut f32,
    ) {
        // SAFETY: the import writes two floats into `out`, which points into this module's memory.
        unsafe { kerf_measure(id, kw, kh, aw, ah, out) }
    }

    #[no_mangle]
    pub extern "C" fn wl_tree_new_wasm() -> *mut Tree {
        wl_tree_new(trampoline, std::ptr::null_mut())
    }

    #[no_mangle]
    pub extern "C" fn wl_alloc(bytes: usize) -> *mut u8 {
        let mut v = Vec::<u8>::with_capacity(bytes);
        let p = v.as_mut_ptr();
        std::mem::forget(v);
        p
    }
}

#[cfg(test)]
#[allow(
    clippy::float_cmp,
    reason = "layout is whole points here: an inexact result is the failure"
)]
mod tests {
    use super::*;

    /// Text stand-in: 10pt per character on one line, 20pt tall.
    extern "C" fn fixed(
        _: *mut c_void,
        id: u32,
        kw: f32,
        kh: f32,
        _aw: f32,
        _ah: f32,
        out: *mut f32,
    ) {
        let w = if kw.is_nan() {
            (id % 100) as f32 * 10.0
        } else {
            kw
        };
        let h = if kh.is_nan() { 20.0 } else { kh };
        // SAFETY: the `MeasureFn` contract: `out` has room for `[width, height]`.
        unsafe {
            *out = w;
            *out.add(1) = h;
        }
    }

    fn tree() -> Tree {
        Tree::new(fixed, std::ptr::null_mut())
    }

    #[test]
    fn column_with_gap_and_padding() {
        let mut t = tree();
        t.node(1, false);
        t.set(1, key::PAD, 16.0);
        t.set(1, key::GAP, 8.0);
        for id in [104, 105] {
            t.node(id, true);
            t.insert(1, id, 0);
        }
        t.compute(1, 390.0, 844.0);
        let a = t.frame(104).unwrap();
        let b = t.frame(105).unwrap();
        assert_eq!(
            (a.x, a.y, a.w, a.h),
            (16.0, 16.0, 358.0, 20.0),
            "stretched to the padded width"
        );
        assert_eq!(b.y, 16.0 + 20.0 + 8.0);
    }

    #[test]
    fn row_grows_and_justifies() {
        let mut t = tree();
        t.node(1, false);
        t.set(1, key::DIRECTION, 1.0);
        t.set(1, key::ALIGN, align::CENTER as f32);
        t.node(103, true);
        t.node(2, false);
        t.set(2, key::GROW, 1.0);
        t.node(104, true);
        for id in [103, 2, 104] {
            t.insert(1, id, 0);
        }
        t.compute(1, 300.0, 100.0);
        assert_eq!(t.frame(103).unwrap().w, 30.0);
        assert_eq!(t.frame(2).unwrap().w, 300.0 - 30.0 - 40.0);
        assert_eq!(t.frame(104).unwrap().x, 260.0);
        assert_eq!(t.frame(104).unwrap().y, 40.0, "centered on the cross axis");
    }

    #[test]
    fn insert_before_and_move() {
        let mut t = tree();
        t.node(1, false);
        for id in [101, 102, 103] {
            t.node(id, true);
        }
        t.insert(1, 101, 0);
        t.insert(1, 103, 0);
        t.insert(1, 102, 103);
        t.compute(1, 100.0, 100.0);
        let ys: Vec<f32> = [101, 102, 103]
            .iter()
            .map(|id| t.frame(*id).unwrap().y)
            .collect();
        assert_eq!(ys, vec![0.0, 20.0, 40.0]);
        t.insert(1, 101, 0); // move to the end
        t.compute(1, 100.0, 100.0);
        assert_eq!(t.frame(101).unwrap().y, 40.0);
    }

    #[test]
    fn scroll_reports_content_extent() {
        let mut t = tree();
        t.node(1, false);
        t.set(1, key::HEIGHT, 100.0);
        t.set(1, key::SCROLL, 1.0);
        for i in 0..10 {
            let id = 110 + i;
            t.node(id, true);
            t.insert(1, id, 0);
        }
        t.compute(1, 200.0, 100.0);
        let f = t.frame(1).unwrap();
        assert_eq!(f.h, 100.0);
        assert_eq!(f.content_h, 200.0, "ten 20pt rows, unshrunk");
        assert_eq!(t.frame(119).unwrap().y, 180.0);
    }

    #[test]
    fn growing_parent_keeps_a_scroll_view_on_screen() {
        let mut t = tree();
        t.node(1, false);
        t.node(2, false);
        t.set(2, key::GROW, 1.0);
        t.node(3, false);
        t.set(3, key::SCROLL, 1.0);
        t.set(3, key::GROW, 1.0);
        t.insert(1, 2, 0);
        t.insert(2, 3, 0);
        for i in 0..50 {
            t.node(110 + i, true);
            t.insert(3, 110 + i, 0);
        }
        t.compute(1, 200.0, 300.0);
        let f = t.frame(3).unwrap();
        assert_eq!((f.h, f.content_h), (300.0, 1000.0));
    }

    #[test]
    fn remove_drops_the_subtree() {
        let mut t = tree();
        t.node(1, false);
        t.node(2, false);
        t.node(103, true);
        t.insert(1, 2, 0);
        t.insert(2, 103, 0);
        t.remove(2);
        assert!(t.frame(2).is_none());
        assert!(t.frame(103).is_none());
        t.compute(1, 100.0, 100.0);
        assert_eq!(t.frame(1).unwrap().content_h, 100.0);
    }

    #[test]
    fn explicit_widths_are_exact_so_panes_stay_clear_of_a_hinge() {
        let mut t = tree();
        t.node(1, false);
        t.set(1, key::DIRECTION, 1.0);
        for (id, w) in [(2, 150.0), (3, 20.0), (4, 230.0)] {
            t.node(id, false);
            t.set(id, key::WIDTH, w);
            t.insert(1, id, 0);
        }
        t.node(150, true); // wants 500 wide: must not widen pane 2 or push the hinge
        t.insert(2, 150, 0);
        t.compute(1, 400.0, 300.0);
        let xw = |id| {
            let f = t.frame(id).unwrap();
            (f.x, f.w)
        };
        assert_eq!(
            [xw(2), xw(3), xw(4)],
            [(0.0, 150.0), (150.0, 20.0), (170.0, 230.0)]
        );
    }
}
