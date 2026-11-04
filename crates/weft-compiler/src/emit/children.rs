//! Children emission.

use super::{
    Build, Emitter, Expression, JSXElement, Kid, Piece, children, escape_text, is_component,
};

impl Emitter<'_> {
    /// An element's children: static ones into the template, holes as `child` calls (server: `hole`). Each hole
    /// takes the template's next slot, the same on both sides.
    pub(super) fn kids(&mut self, el: &JSXElement<'_>, b: &mut Build, path: &[usize]) {
        let path = path.to_vec();
        let kids = children(&el.children, self.text);
        let only_dynamic = match kids.as_slice() {
            [Kid::Text(_)] => false,
            [Kid::El(e)] => is_component(e, self.text),
            [_] => true,
            _ => false,
        };
        if only_dynamic {
            self.hole(b, &path, &kids[0], None);
            return;
        }
        let mut index = 0usize;
        let mut in_text = false;
        for k in &kids {
            match k {
                Kid::Text(t) => {
                    Self::put(b, &escape_text(t));
                    if !in_text {
                        index += 1;
                        in_text = true;
                    }
                }
                Kid::El(e) if !is_component(e, self.text) => {
                    let mut p = path.clone();
                    p.push(index);
                    self.walk(e, b, &p);
                    index += 1;
                    in_text = false;
                }
                _ => {
                    // Mixed content: the template's `<!>` holds the place (the child goes before it); the server
                    // marks the hole's range with `<!--[-->` … `<!--]-->`.
                    b.html.push_str("<!>");
                    let mut p = path.clone();
                    p.push(index);
                    self.hole(b, &path, k, Some(p));
                    index += 1;
                    in_text = false;
                }
            }
        }
    }

    /// One child hole: the next slot of the template, its value, and (mixed content) the marker at `marker`.
    pub(super) fn hole(
        &mut self,
        b: &mut Build,
        parent: &[usize],
        k: &Kid<'_>,
        marker: Option<Vec<usize>>,
    ) {
        let (v, once) = self.hole_value(k);
        self.hole_code(b, parent, v, once, marker);
    }

    /// A hole whose value is the code `v` (`once`: static structure, built once).
    pub(super) fn hole_code(
        &mut self,
        b: &mut Build,
        parent: &[usize],
        v: String,
        once: bool,
        marker: Option<Vec<usize>>,
    ) {
        let slot = b.slots;
        b.slots += 1;
        if self.ssr {
            // Mixed content needs a range, except static structure that turns out to be one element (`2`): the server
            // knows, and the client's walk and `hchild` read the element as the hole. `hole` writes the markers.
            let hole = self.helper("hole");
            let mixed = match (marker.is_some(), once) {
                (false, _) => "",
                (true, true) => ", 2",
                (true, false) => ", 1",
            };
            Self::server(b, Piece::Code(format!("{hole}(_k, {slot}, {v}{mixed})")));
            return;
        }
        let marker = marker.map(|p| self.node(b, &p));
        let parent = self.node(b, parent);
        let child = self.helper(if self.hydratable { "hchild" } else { "child" });
        let mut args = vec![parent, v];
        if self.hydratable {
            // The hole's scope is named by its template's key (`root.$k`) and its slot.
            args.push(marker.unwrap_or_else(|| "null".into()));
            args.push(b.vars[0].1.clone());
            args.push(slot.to_string());
            if once {
                args.push("1".into());
            }
        } else if let Some(m) = marker {
            args.push(m);
        }
        b.ops.push(format!("{child}({});", args.join(", ")));
    }

    /// A hole's value, and whether it's static structure built once (`once`). Where keys matter (hydratable and
    /// server output) structure is deferred, `() => …`, so it's built inside the hole's scope.
    pub(super) fn hole_value(&mut self, k: &Kid<'_>) -> (String, bool) {
        let v = self.kid_value(k);
        let structure = match k {
            Kid::El(_) | Kid::Frag(_) => true,
            Kid::Expr(e) => matches!(
                e.get_inner_expression(),
                Expression::JSXElement(_) | Expression::JSXFragment(_)
            ),
            Kid::Text(_) => false,
        };
        if structure && (self.hydratable || self.ssr) {
            (format!("() => {v}"), true)
        } else {
            (v, false)
        }
    }
}
