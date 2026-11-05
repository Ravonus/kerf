//! Generate shape variant elements and attributes.

use std::collections::HashSet;
use std::fmt::Write as _;

use oxc_ast::ast::{
    JSXAttribute, JSXAttributeItem, JSXAttributeName, JSXAttributeValue, JSXChild, JSXElement,
    JSXElementName,
};
use oxc_semantic::SymbolId;

use super::{FORWARD_SKIP, Gen, KEEP, MEDIA};

impl Gen<'_> {
    pub(super) fn kids(&mut self, kids: &[JSXChild<'_>], allowed: &HashSet<SymbolId>) -> String {
        let mut out = String::new();
        for k in kids {
            match k {
                JSXChild::Text(t) => {
                    out.push_str(&self.source[t.span.start as usize..t.span.end as usize]);
                }
                JSXChild::Element(el) => out.push_str(&self.element(el, allowed)),
                JSXChild::Fragment(f) => out.push_str(&self.kids(&f.children, allowed)),
                JSXChild::ExpressionContainer(c) => {
                    let Some(e) = c.expression.as_expression() else {
                        continue;
                    };
                    let v = self.value(e, allowed);
                    if v.starts_with('<') {
                        out.push_str(&v);
                    } else {
                        let _ = write!(out, "{{{v}}}");
                    }
                }
                JSXChild::Spread(_) => {}
            }
        }
        out
    }

    pub(super) fn attr_name(a: &JSXAttribute<'_>) -> String {
        match &a.name {
            JSXAttributeName::Identifier(i) => i.name.to_string(),
            JSXAttributeName::NamespacedName(n) => format!("{}:{}", n.namespace.name, n.name.name),
        }
    }

    pub(super) fn attr_text(
        &self,
        name: &str,
        v: &JSXAttributeValue<'_>,
        allowed: &HashSet<SymbolId>,
    ) -> Option<String> {
        match v {
            JSXAttributeValue::StringLiteral(s) => {
                Some(format!("{name}=\"{}\"", s.value.replace('"', "&quot;")))
            }
            JSXAttributeValue::ExpressionContainer(c) => {
                let e = c.expression.as_expression()?;
                self.ok(e, allowed)
                    .then(|| format!("{name}={{{}}}", Self::print(e)))
            }
            _ => None,
        }
    }

    pub(super) fn host_attrs(
        &self,
        el: &JSXElement<'_>,
        allowed: &HashSet<SymbolId>,
        extra: &[&str],
    ) -> String {
        let mut out = String::new();
        for a in &el.opening_element.attributes {
            let JSXAttributeItem::Attribute(a) = a else {
                continue;
            };
            let name = Self::attr_name(a);
            if !(KEEP.contains(&name.as_str())
                || extra.contains(&name.as_str())
                || (name.starts_with("data-") && name != "data-testid"))
            {
                continue;
            }
            match &a.value {
                None => {
                    let _ = write!(out, " {name}");
                }
                Some(v) => {
                    if let Some(t) = self.attr_text(&name, v, allowed) {
                        out.push(' ');
                        out.push_str(&t);
                    }
                }
            }
        }
        out
    }

    pub(super) fn component_attrs(
        &self,
        el: &JSXElement<'_>,
        allowed: &HashSet<SymbolId>,
    ) -> String {
        let mut out = String::new();
        for a in &el.opening_element.attributes {
            let JSXAttributeItem::Attribute(a) = a else {
                continue;
            };
            let name = Self::attr_name(a);
            if FORWARD_SKIP.contains(&name.as_str())
                || (name.starts_with("on")
                    && name[2..].starts_with(|c: char| c.is_ascii_uppercase()))
            {
                continue;
            }
            let t = match &a.value {
                None => Some(name.clone()),
                Some(v) => self.attr_text(&name, v, allowed),
            };
            out.push(' ');
            out.push_str(&t.unwrap_or_else(|| format!("{name}={{$$sa}}"))); // a dropped local: a value that reads as anything
        }
        out
    }

    pub(super) fn element(&mut self, el: &JSXElement<'_>, allowed: &HashSet<SymbolId>) -> String {
        let name = &el.opening_element.name;
        if let JSXElementName::Identifier(i) = name {
            let tag = i.name.as_str();
            if MEDIA.contains(&tag) {
                return format!(
                    "<{tag}{} data-skeleton />",
                    self.host_attrs(el, allowed, &[])
                );
            }
            let attrs = self.host_attrs(el, allowed, &[]);
            if el.closing_element.is_none() {
                return format!("<{tag}{attrs} />");
            }
            let kids = self.kids(&el.children, allowed);
            return format!("<{tag}{attrs}>{kids}</{tag}>");
        }
        let sym = match name {
            JSXElementName::IdentifierReference(r) => r
                .reference_id
                .get()
                .and_then(|id| self.scoping.get_reference(id).symbol_id()),
            _ => None,
        };
        let plain = matches!(name, JSXElementName::IdentifierReference(r) if r.name == "Boundary");
        if sym.is_some() && sym == self.text {
            let JSXElementName::IdentifierReference(r) = name else {
                unreachable!()
            };
            let (tag, attrs, kids) = (
                r.name.to_string(),
                self.host_attrs(el, allowed, &["as", "reserve"]),
                self.kids(&el.children, allowed),
            );
            return format!("<{tag}{attrs}>{kids}</{tag}>");
        }
        if let Some((sym, tag)) = sym.and_then(|s| Some((s, self.variants.get(&s)?.clone()))) {
            if self.imports.contains_key(&sym) {
                self.used.insert(sym);
            }
            let attrs = self.component_attrs(el, allowed);
            if el.closing_element.is_none() {
                return format!("<{tag}{attrs} />");
            }
            let kids = self.kids(&el.children, allowed);
            return format!("<{tag}{attrs}>{kids}</{tag}>");
        }
        // No variant: its code must not run with placeholder data, so only the JSX written here renders.
        let kids = self.kids(&el.children, allowed);
        if plain || !kids.trim().is_empty() {
            format!("<>{kids}</>")
        } else {
            Self::bar(None)
        }
    }
}
