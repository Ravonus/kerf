//! Template emission.

use super::*;

impl Emitter<'_> {
    // ---- intrinsic elements: templates ---------------------------------------------------------------------

    pub(super) fn template(&mut self, el: &JSXElement<'_>) -> String {
        let mut b = Build {
            html: String::new(),
            ssr: Vec::new(),
            vars: vec![(vec![], self.var())],
            decls: Vec::new(),
            ops: Vec::new(),
            slots: 0,
        };
        self.walk(el, &mut b, &[]);
        if self.ssr {
            // `ssr(_k => "<li" + key(_k) + … )`: static parts and holes, in document order.
            let mut parts: Vec<String> = Vec::new();
            for p in &b.ssr {
                parts.push(match p {
                    Piece::Static(s) => js_string(s),
                    Piece::Code(c) => c.clone(),
                });
            }
            let ssr = self.helper("ssr");
            let note = match self.place(el.span, &tag_name(&el.opening_element.name)) {
                Some(p) if self.dev => format!("/* {p} */ "),
                _ => String::new(),
            };
            if !b.decls.is_empty() {
                return format!(
                    "{note}{ssr}((_k) => {{ let {}; return {}; }})",
                    b.decls.join(", "),
                    parts.join(" + ")
                );
            }
            return format!("{note}{ssr}((_k) => {})", parts.join(" + "));
        }
        let t = format!("_t{}", self.templates.len() + 1);
        // Hydratable output claims the server's elements (`htpl`, @weft-js/core/dom's claim.ts); client-only output doesn't ship that.
        let tpl = self.helper(if self.hydratable { "htpl" } else { "tpl" });
        let html = js_string(&b.html);
        // An SVG element outside an <svg> (a component returning <path/>) is parsed inside one, then lifted out.
        let svg = matches!(&el.opening_element.name, JSXElementName::Identifier(id) if SVG.contains(&id.name.as_str()));
        let place = if self.dev {
            self.place(el.span, &tag_name(&el.opening_element.name))
        } else {
            None
        };
        // Dev: `// App.tsx:12 <li>` above the template; hydratable output also passes it to `htpl` for its warnings.
        let args = match (place.as_ref().filter(|_| self.hydratable), svg) {
            (Some(p), _) => format!(", {}, {p:?}", if svg { "true" } else { "false" }),
            (None, true) => ", true".into(),
            (None, false) => String::new(),
        };
        let note = place.map(|p| format!("// {p}\n")).unwrap_or_default();
        self.templates.push(format!(
            "{note}const {t} = /* @__PURE__ */ {tpl}({html}{args});"
        ));
        let root = b.vars[0].1.clone();
        if b.decls.is_empty() && b.ops.is_empty() {
            return format!("{t}()");
        }
        let mut out = format!("(() => {{ const {root} = {t}();");
        for d in &b.decls {
            out.push(' ');
            out.push_str(d);
        }
        for o in &b.ops {
            out.push(' ');
            out.push_str(o);
        }
        let _ = write!(out, " return {root}; }})()");
        out
    }

    /// HTML both the template and the server output contain.
    pub(super) fn put(b: &mut Build, s: &str) {
        b.html.push_str(s);
        match b.ssr.last_mut() {
            Some(Piece::Static(t)) => t.push_str(s),
            _ => b.ssr.push(Piece::Static(s.to_string())),
        }
    }

    /// Server-only output: static (`Piece::Static`) or code.
    pub(super) fn server(b: &mut Build, p: Piece) {
        match (b.ssr.last_mut(), p) {
            (Some(Piece::Static(t)), Piece::Static(s)) => t.push_str(&s),
            (_, p) => b.ssr.push(p),
        }
    }

    /// The variable for the node at `path`. It's reached from the nearest earlier sibling that has one (or its
    /// parent's first child) by sibling steps; only nodes something uses get a variable. Hydratable output steps
    /// with `first`/`next`, which pass over the server's hole ranges.
    pub(super) fn node(&mut self, b: &mut Build, path: &[usize]) -> String {
        if let Some((_, v)) = b.vars.iter().find(|(p, _)| p == path) {
            return v.clone();
        }
        let (&last, parent) = path
            .split_last()
            .expect("`vars` starts with the root, the one empty path");
        let sibling = b
            .vars
            .iter()
            .filter(|(p, _)| {
                p.len() == path.len() && &p[..p.len() - 1] == parent && p[p.len() - 1] < last
            })
            .max_by_key(|(p, _)| p[p.len() - 1])
            .map(|(p, v)| (p[p.len() - 1], v.clone()));
        let (mut from, steps) = if let Some((at, v)) = sibling {
            (v, last - at)
        } else {
            let p = self.node(b, parent);
            (
                if self.hydratable {
                    format!("{}({p})", self.helper("first"))
                } else {
                    format!("{p}.firstChild")
                },
                last,
            )
        };
        for _ in 0..steps {
            from = if self.hydratable {
                format!("{}({from})", self.helper("next"))
            } else {
                format!("{from}.nextSibling")
            };
        }
        let v = self.var();
        b.decls.push(format!("const {v} = {from};"));
        b.vars.push((path.to_vec(), v.clone()));
        v
    }
}
