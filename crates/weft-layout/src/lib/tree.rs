use std::collections::HashMap;

use taffy::prelude::*;
use taffy::{compute_leaf_layout, LayoutOutput, Overflow, Point};

use super::{align_items, bound, dim, justify, key, space, Frame, MeasureFn, Tree};

impl Tree {
    pub fn new(measure: MeasureFn, user: *mut c_void) -> Self {
        Tree {
            taffy: TaffyTree::new(),
            nodes: HashMap::new(),
            measure,
            user,
        }
    }

    /// `measured` leaves get their size from the host callback (text, buttons, inputs).
    pub fn node(&mut self, id: u32, measured: bool) {
        let style = Style {
            display: Display::Flex,
            flex_direction: FlexDirection::Column,
            ..Style::default()
        };
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
        let Some(node) = self.nodes.remove(&id) else {
            return;
        };
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
        let (Some(&p), Some(&c)) = (self.nodes.get(&parent), self.nodes.get(&id)) else {
            return;
        };
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
        let Some(&node) = self.nodes.get(&id) else {
            return;
        };
        let mut s = self.taffy.style(node).expect("style").clone();
        match k {
            key::DIRECTION => {
                s.flex_direction = if v as u32 == 1 {
                    FlexDirection::Row
                } else {
                    FlexDirection::Column
                }
            }
            key::GAP => {
                s.gap = Size {
                    width: LengthPercentage::length(v),
                    height: LengthPercentage::length(v),
                }
            }
            key::PAD => s.padding = Rect::length(v),
            // A growing item fills the space it is given, so it may also shrink below its content (CSS's
            // automatic min size would let a long list push its scroll view off screen).
            key::GROW => {
                s.flex_grow = v;
                let min = if v > 0.0 {
                    LengthPercentageAuto::length(0.0)
                } else {
                    LengthPercentageAuto::auto()
                };
                s.min_size = Size {
                    width: min,
                    height: min,
                };
            }
            key::ALIGN => s.align_items = align_items(v as u32),
            key::JUSTIFY => s.justify_content = justify(v as u32),
            // An explicit size is exact: it neither shrinks nor grows to fit content. Panes either side of a hinge rely
            // on this to stay out from under it.
            key::WIDTH => {
                s.size.width = dim(v);
                s.min_size.width = bound(v);
                s.max_size.width = bound(v);
            }
            key::HEIGHT => {
                s.size.height = dim(v);
                s.min_size.height = bound(v);
                s.max_size.height = bound(v);
            }
            key::MIN_HEIGHT => {
                s.min_size.height = if v.is_nan() {
                    LengthPercentageAuto::auto()
                } else {
                    LengthPercentageAuto::length(v)
                }
            }
            key::SCROLL => {
                s.overflow = if v == 0.0 {
                    Point {
                        x: Overflow::Visible,
                        y: Overflow::Visible,
                    }
                } else {
                    Point {
                        x: Overflow::Visible,
                        y: Overflow::Scroll,
                    }
                };
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
        let Some(&node) = self.nodes.get(&root) else {
            return;
        };
        let mut s = self.taffy.style(node).expect("style").clone();
        if s.size.width != Dimension::length(w) || s.size.height != Dimension::length(h) {
            s.size = Size {
                width: Dimension::length(w),
                height: Dimension::length(h),
            };
            self.taffy.set_style(node, s).expect("set style");
        }
        let (measure, user) = (self.measure, self.user);
        self.taffy
            .compute_layout_with_measure(
                node,
                Size {
                    width: AvailableSpace::Definite(w),
                    height: AvailableSpace::Definite(h),
                },
                |inputs, _, ctx, style| -> LayoutOutput {
                    let id = ctx.map(|c| *c);
                    compute_leaf_layout(
                        inputs,
                        style,
                        |_, _| 0.0,
                        |known, avail| {
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
                            Size {
                                width: out[0],
                                height: out[1],
                            }
                        },
                    )
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
