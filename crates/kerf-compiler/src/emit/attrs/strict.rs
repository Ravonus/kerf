//! Strict CSP's half of attribute writing: where a fixed `class` or `style` goes (emit/csp.rs has the rules).

use super::super::csp;
use super::super::static_style::static_style;
use super::{Attributes, Emitter, Static, js_string, react, static_value};
use oxc_ast::ast::{
    JSXAttribute, JSXAttributeItem, JSXAttributeName, JSXAttributeValue, JSXElement,
};

impl Emitter<'_> {
    /// Strict CSP, before the attributes are written: whether the element's `class` is fixed, and if so, the class
    /// its fixed `style` becomes. A spread could set either, so an element with one is left as it is.
    pub(super) fn plan_csp(&mut self, el: &JSXElement<'_>, state: &mut Attributes<'_>) {
        let attrs = &el.opening_element.attributes;
        if attrs
            .iter()
            .any(|a| matches!(a, JSXAttributeItem::SpreadAttribute(_)))
        {
            state.dynamic_class = true;
            return;
        }
        let named = |want: &str| {
            attrs.iter().find_map(|a| match a {
                JSXAttributeItem::Attribute(a)
                    if matches!(&a.name, JSXAttributeName::Identifier(id)
                        if react::attribute(id.name.as_str()) == want) =>
                {
                    Some(a)
                }
                _ => None,
            })
        };
        state.dynamic_class = named("class").is_some_and(|a| fixed_text(a, "class").is_none());
        if state.dynamic_class {
            return;
        }
        if let Some(css) = named("style")
            .and_then(|a| fixed_text(a, "style"))
            .filter(|c| !c.trim().is_empty())
        {
            let (class, rule) = csp::class_for(&css);
            if let Some(rules) = self.csp.as_mut() {
                rules.insert(class.clone(), rule);
            }
            state.moved = Some(class);
        }
    }

    /// A fixed attribute value: `escaped` as it goes in HTML, `text` as it reads. Strict CSP decides where a `class`
    /// or `style` goes.
    pub(super) fn put_text(
        &mut self,
        state: &mut Attributes<'_>,
        html: &str,
        escaped: &str,
        text: &str,
    ) {
        if self.csp.is_some() && html == "style" {
            if state.moved.is_some() {
                return; // it became a class
            }
            if state.dynamic_class && !self.ssr {
                // The class is written at run time: one CSSOM write when the element is made, which CSP allows.
                let el_var = self.node(state.b, state.path);
                state
                    .b
                    .ops
                    .push(format!("{el_var}.style.cssText = {};", js_string(text)));
                return;
            }
        }
        if html == "class" {
            state.class_written = true;
            if let Some(class) = &state.moved {
                let joined = if text.trim().is_empty() {
                    class.clone()
                } else {
                    format!("{escaped} {class}")
                };
                Self::put(state.b, &format!(" class=\"{joined}\""));
                return;
            }
        }
        Self::put(state.b, &format!(" {html}=\"{escaped}\""));
    }
}

/// The text of a `class` or `style` attribute known at compile time (`None`: written at run time).
fn fixed_text(attr: &JSXAttribute<'_>, name: &str) -> Option<String> {
    match &attr.value {
        None => Some(String::new()),
        Some(JSXAttributeValue::StringLiteral(s)) => Some(s.value.to_string()),
        Some(JSXAttributeValue::ExpressionContainer(c)) => {
            let e = c.expression.as_expression()?;
            if name == "style"
                && let Some(css) = static_style(e)
            {
                return Some(css);
            }
            match static_value(e)? {
                Static::Text(t) => Some(t),
                Static::Absent | Static::True => Some(String::new()),
            }
        }
        Some(_) => None,
    }
}
