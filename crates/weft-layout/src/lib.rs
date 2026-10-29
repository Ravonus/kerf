//! Shared layout for weft's native hosts (iOS, Android) and for Node tests.
//!
//! Hosts mirror their view tree here by app node id, set token-resolved style values, and read back frames.
//! Leaves that hold text are measured by the host through one callback, so wrapping matches what the platform
//! draws. Everything crosses as numbers: the same exports work from Swift, from Kotlin (JNI) and from wasm.

use std::collections::HashMap;
use std::ffi::c_void;

use taffy::prelude::*;
use taffy::{compute_leaf_layout, LayoutOutput, Overflow, Point};

pub mod protocol;
use protocol::{align, key};

/// `out` receives `[width, height]`. Unknown dimensions are NaN; available space is a number,
/// `-1` for min-content or `+inf` for max-content.
pub type MeasureFn = extern "C" fn(user: *mut c_void, id: u32, known_w: f32, known_h: f32, avail_w: f32, avail_h: f32, out: *mut f32);

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

fn dim(v: f32) -> Dimension {
    if v.is_nan() { Dimension::auto() } else { Dimension::length(v) }
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

impl Tree {
    pub fn new(measure: MeasureFn, user: *mut c_void) -> Self {
        Tree { taffy: TaffyTree::new(), nodes: HashMap::new(), measure, user }
    }

    /// `measured` leaves get their size from the host callback (text, buttons, inputs).
    pub fn node(&mut self, id: u32, measured: bool) {
        let style = Style { display: Display::Flex, flex_direction: FlexDirection::Column, ..Style::default() };
        let node = if measured {
            self.taffy.new_leaf_with_context(style, id)
        } else {
            self.taffy.new_leaf(style)
        }
        .expect("taffy node");
        if let Some(old) = self.nodes.insert(id, node) {
            let _ = self.taffy.remove(old);
        }
    }

    /// Removes the node and its whole subtree.
    pub fn remove(&mut self, id: u32) {
        let Some(node) = self.nodes.remove(&id) else { return };
        let mut stack = self.taffy.children(node).unwrap_or_default();
        let _ = self.taffy.remove(node);
        while let Some(child) = stack.pop() {
            stack.extend(self.taffy.children(child).unwrap_or_default());
            self.nodes.retain(|_, n| *n != child);
            let _ = self.taffy.remove(child);
        }
    }

    /// Moves `id` under `parent`, before `before` (0 appends). Re-inserting an attached node moves it.
    pub fn insert(&mut self, parent: u32, id: u32, before: u32) {
        let (Some(&p), Some(&c)) = (self.nodes.get(&parent), self.nodes.get(&id)) else { return };
        if let Some(old) = self.taffy.parent(c) {
            let _ = self.taffy.remove_child(old, c);
        }
        let index = self
            .nodes
            .get(&before)
            .and_then(|b| self.taffy.children(p).ok()?.iter().position(|n| n == b));
        match index {
            Some(i) => self.taffy.insert_child_at_index(p, i, c),
            None => self.taffy.add_child(p, c),
        }
        .expect("taffy insert");
    }

    pub fn set(&mut self, id: u32, k: u32, v: f32) {
        let Some(&node) = self.nodes.get(&id) else { return };
        let mut s = self.taffy.style(node).expect("style").clone();
        match k {
            key::DIRECTION => s.flex_direction = if v as u32 == 1 { FlexDirection::Row } else { FlexDirection::Column },
            key::GAP => s.gap = Size { width: LengthPercentage::length(v), height: LengthPercentage::length(v) },
            key::PAD => s.padding = Rect::length(v),
            // A growing item fills the space it is given, so it may also shrink below its content (CSS's
            // automatic min size would let a long list push its scroll view off screen).
            key::GROW => {
                s.flex_grow = v;
                let min = if v > 0.0 { LengthPercentageAuto::length(0.0) } else { LengthPercentageAuto::auto() };
                s.min_size = Size { width: min, height: min };
            }
            key::ALIGN => s.align_items = align_items(v as u32),
            key::JUSTIFY => s.justify_content = justify(v as u32),
            key::WIDTH => s.size.width = dim(v),
            key::HEIGHT => s.size.height = dim(v),
            key::MIN_HEIGHT => s.min_size.height = if v.is_nan() { LengthPercentageAuto::auto() } else { LengthPercentageAuto::length(v) },
            key::SCROLL => {
                s.overflow = if v != 0.0 { Point { x: Overflow::Visible, y: Overflow::Scroll } } else { Point { x: Overflow::Visible, y: Overflow::Visible } };
                s.scrollbar_width = 0.0;
            }
            _ => return,
        }
        self.taffy.set_style(node, s).expect("set style");
    }

    /// Call when a measured leaf's content (text) changed.
    pub fn dirty(&mut self, id: u32) {
        if let Some(&node) = self.nodes.get(&id) {
            let _ = self.taffy.mark_dirty(node);
        }
    }

    /// Lays out `root` as the screen: it fills exactly `w` × `h` (a flex root with an auto size would shrink
    /// to fit its content instead).
    pub fn compute(&mut self, root: u32, w: f32, h: f32) {
        let Some(&node) = self.nodes.get(&root) else { return };
        let mut s = self.taffy.style(node).expect("style").clone();
        if s.size.width != Dimension::length(w) || s.size.height != Dimension::length(h) {
            s.size = Size { width: Dimension::length(w), height: Dimension::length(h) };
            self.taffy.set_style(node, s).expect("set style");
        }
        let (measure, user) = (self.measure, self.user);
        self.taffy
            .compute_layout_with_measure(
                node,
                Size { width: AvailableSpace::Definite(w), height: AvailableSpace::Definite(h) },
                |inputs, _, ctx, style| -> LayoutOutput {
                    let id = ctx.map(|c| *c);
                    compute_leaf_layout(inputs, style, |_, _| 0.0, |known, avail| {
                        let Some(id) = id else { return Size::ZERO };
                        let mut out = [0f32; 2];
                        measure(
                            user,
                            id,
                            known.width.unwrap_or(f32::NAN),
                            known.height.unwrap_or(f32::NAN),
                            space(avail.width),
                            space(avail.height),
                            out.as_mut_ptr(),
                        );
                        Size { width: out[0], height: out[1] }
                    })
                },
            )
            .expect("compute");
    }

    pub fn frame(&self, id: u32) -> Option<Frame> {
        let l = self.taffy.layout(*self.nodes.get(&id)?).ok()?;
        Some(Frame {
            x: l.location.x,
            y: l.location.y,
            w: l.size.width,
            h: l.size.height,
            content_w: l.scrollable_overflow_rect.right.max(l.size.width),
            content_h: l.scrollable_overflow_rect.bottom.max(l.size.height),
        })
    }
}

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
        drop(Box::from_raw(t));
    }
}

macro_rules! tree {
    ($t:expr) => {
        // SAFETY: hosts pass the pointer returned by `wl_tree_new` and call from one thread.
        unsafe { &mut *$t }
    };
}

#[no_mangle]
pub extern "C" fn wl_node(t: *mut Tree, id: u32, measured: u32) {
    tree!(t).node(id, measured != 0)
}
#[no_mangle]
pub extern "C" fn wl_remove(t: *mut Tree, id: u32) {
    tree!(t).remove(id)
}
#[no_mangle]
pub extern "C" fn wl_insert(t: *mut Tree, parent: u32, id: u32, before: u32) {
    tree!(t).insert(parent, id, before)
}
#[no_mangle]
pub extern "C" fn wl_set(t: *mut Tree, id: u32, k: u32, v: f32) {
    tree!(t).set(id, k, v)
}
#[no_mangle]
pub extern "C" fn wl_dirty(t: *mut Tree, id: u32) {
    tree!(t).dirty(id)
}
#[no_mangle]
pub extern "C" fn wl_compute(t: *mut Tree, root: u32, w: f32, h: f32) {
    tree!(t).compute(root, w, h)
}

/// Writes `[x, y, w, h, contentW, contentH]` into `out`. Returns 0 for an unknown id.
///
/// # Safety
/// `out` must point to 6 writable floats.
#[no_mangle]
pub unsafe extern "C" fn wl_frame(t: *mut Tree, id: u32, out: *mut f32) -> u32 {
    match tree!(t).frame(id) {
        Some(f) => {
            std::ptr::copy_nonoverlapping([f.x, f.y, f.w, f.h, f.content_w, f.content_h].as_ptr(), out, 6);
            1
        }
        None => 0,
    }
}

// ---- wasm: Node tests import the measure function as `env.weft_measure` ----

#[cfg(target_arch = "wasm32")]
mod wasm {
    use super::*;

    #[link(wasm_import_module = "env")]
    extern "C" {
        fn weft_measure(id: u32, known_w: f32, known_h: f32, avail_w: f32, avail_h: f32, out: *mut f32);
    }

    extern "C" fn trampoline(_: *mut c_void, id: u32, kw: f32, kh: f32, aw: f32, ah: f32, out: *mut f32) {
        // SAFETY: the import writes two floats into `out`, which points into this module's memory.
        unsafe { weft_measure(id, kw, kh, aw, ah, out) }
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
mod tests {
    use super::*;

    /// Text stand-in: 10pt per character on one line, 20pt tall.
    extern "C" fn fixed(_: *mut c_void, id: u32, kw: f32, kh: f32, _aw: f32, _ah: f32, out: *mut f32) {
        let w = if kw.is_nan() { (id % 100) as f32 * 10.0 } else { kw };
        let h = if kh.is_nan() { 20.0 } else { kh };
        unsafe { *out = w; *out.add(1) = h; }
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
        assert_eq!((a.x, a.y, a.w, a.h), (16.0, 16.0, 358.0, 20.0), "stretched to the padded width");
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
        let ys: Vec<f32> = [101, 102, 103].iter().map(|id| t.frame(*id).unwrap().y).collect();
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
}
