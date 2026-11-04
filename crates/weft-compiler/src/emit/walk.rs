//! Walk emission.

use super::{
    Build, Emitter, GetSpan, JSXAttributeItem, JSXElement, JSXElementName, Piece, VOID, children,
};

impl Emitter<'_> {
    pub(super) fn walk(&mut self, el: &JSXElement<'_>, b: &mut Build, path: &[usize]) {
        let tag = match &el.opening_element.name {
            JSXElementName::Identifier(id) => id.name.to_string(),
            JSXElementName::NamespacedName(n) => format!("{}:{}", n.namespace.name, n.name.name),
            other => {
                self.fail(
                    "weft back end: this element name isn't supported",
                    other.span(),
                );
                return;
            }
        };
        Self::put(b, &format!("<{tag}"));
        if path.is_empty() && self.ssr {
            let key = self.helper("key");
            Self::server(b, Piece::Code(format!("{key}(_k)")));
        }
        let has_kids = !children(&el.children, self.text).is_empty();

        // `<div {...rest} a={x}>`: every attribute goes through one `spread` (later wins, as for components), which
        // reads them all as one plain object, `{ a: x, ...rest }`. JSX children stay in the template. Without them,
        // the merged props' `children` is the element's one hole, so the server renders it and hydration adopts it
        // like any other.
        if el
            .opening_element
            .attributes
            .iter()
            .any(|a| matches!(a, JSXAttributeItem::SpreadAttribute(_)))
        {
            self.walk_spread(el, b, path, &tag, has_kids);
            return;
        }

        let (dynamic, content) = self.attributes(el, b, path, &tag, has_kids);
        // A <select>'s value is set after its children, so the matching <option> exists by then.
        let late = tag == "select" && !dynamic.is_empty();
        if !dynamic.is_empty() && !late {
            let el_var = self.node(b, path);
            b.ops.push(self.bind(&el_var, &dynamic));
        }
        Self::put(b, ">");
        if VOID.contains(&tag.as_str()) {
            return;
        }
        if let Some(c) = content {
            Self::server(b, Piece::Code(c));
        }
        self.kids(el, b, path);
        if late {
            let el_var = self.node(b, path);
            b.ops.push(self.bind(&el_var, &dynamic));
        }
        Self::put(b, &format!("</{tag}>"));
    }

    fn walk_spread(
        &mut self,
        el: &JSXElement<'_>,
        b: &mut Build,
        path: &[usize],
        tag: &str,
        has_kids: bool,
    ) {
        let void = VOID.contains(&tag);
        if !self.ssr
            && (has_kids || void)
            && let Some(object) = self.spread_object(&el.opening_element.attributes)
        {
            let el_var = self.node(b, path);
            let spread = self.helper("spread");
            b.ops.push(format!("{spread}({el_var}, () => ({object}));"));
            Self::put(b, ">");
            if !void {
                self.kids(el, b, path);
                Self::put(b, &format!("</{tag}>"));
            }
            return;
        }
        let props = self.props(&el.opening_element.attributes, Vec::new(), true);
        let spread = self.helper("spread");
        // Server: one merged object for the attributes and, with no JSX children, what goes inside.
        let mut shared = None;
        if self.ssr {
            shared = self.spread_server(b, &props, &spread, has_kids, void);
        } else {
            let el_var = self.node(b, path);
            self.n += 1;
            let p = format!("_p{}", self.n);
            b.ops.push(format!(
                "const {p} = {props}; {spread}({el_var}, () => ({{ ...{p} }}));"
            ));
            if !has_kids && !void {
                Self::put(b, ">");
                // Hydrating, content the props wrote stays: the server rendered it into this hole.
                let kids = if self.hydratable {
                    format!("{}({p}, {el_var})", self.helper("kids"))
                } else {
                    format!("{p}.children")
                };
                self.hole_code(b, path, format!("() => {kids}"), false, None);
                Self::put(b, &format!("</{tag}>"));
                return;
            }
        }
        Self::put(b, ">");
        if void {
            return;
        }
        if has_kids {
            self.kids(el, b, path);
        } else {
            let inner = self.helper("inner");
            let p = shared.unwrap_or(props);
            self.hole_code(b, path, format!("() => {inner}({p}, {tag:?})"), false, None);
        }
        Self::put(b, &format!("</{tag}>"));
    }

    fn spread_server(
        &mut self,
        b: &mut Build,
        props: &str,
        spread: &str,
        has_kids: bool,
        void: bool,
    ) -> Option<String> {
        let mut shared = None;
        if has_kids || void {
            // The merged view is only read here, all at once: its sources go straight to the writer.
            let code = match props
                .strip_prefix("_$mergeProps(")
                .and_then(|p| p.strip_suffix(')'))
            {
                Some(sources) => format!("{}({sources})", self.helper("spreads")),
                None => format!("{spread}({props})"),
            };
            Self::server(b, Piece::Code(code));
        } else {
            self.n += 1;
            let p = format!("_p{}", self.n);
            b.decls.push(p.clone());
            let held = match props
                .strip_prefix("_$mergeProps(")
                .and_then(|q| q.strip_suffix(')'))
            {
                Some(sources) => format!("{}({sources})", self.helper("merged")),
                None => props.to_string(),
            };
            Self::server(b, Piece::Code(format!("{spread}({p} = {held})")));
            shared = Some(p);
        }
        shared
    }
}
