//! Attributes on intrinsic elements.

use super::{
    Build, DELEGATED, Emitter, Expression, GetSpan, JSXAttribute, JSXAttributeItem,
    JSXAttributeName, JSXAttributeValue, JSXElement, PROPERTIES, Piece, Static, attr_expression,
    decode_entities, escape_attr, flag_off, js_string, react, static_value,
};

struct Attributes<'a> {
    b: &'a mut Build,
    path: &'a [usize],
    tag: &'a str,
    has_kids: bool,
    dynamic: Vec<(&'static str, String, String)>,
    content: Option<String>,
}

impl Emitter<'_> {
    pub(super) fn attributes(
        &mut self,
        el: &JSXElement<'_>,
        b: &mut Build,
        path: &[usize],
        tag: &str,
        has_kids: bool,
    ) -> (Vec<(&'static str, String, String)>, Option<String>) {
        let mut state = Attributes {
            b,
            path,
            tag,
            has_kids,
            dynamic: Vec::new(),
            content: None,
        };
        for item in &el.opening_element.attributes {
            let JSXAttributeItem::Attribute(attr) = item else {
                continue;
            };
            self.attribute(attr, &mut state);
        }
        (state.dynamic, state.content)
    }

    fn attribute(&mut self, attr: &JSXAttribute<'_>, state: &mut Attributes<'_>) {
        let name = match &attr.name {
            JSXAttributeName::Identifier(id) => id.name.to_string(),
            // `xlink:href`, `xml:lang`: written with their namespace (`attr` looks the prefix up).
            JSXAttributeName::NamespacedName(ns) => {
                format!("{}:{}", ns.namespace.name, ns.name.name)
            }
        };
        if name == "key" {
            return;
        }
        let raw = name == "dangerouslySetInnerHTML";
        let name = if raw {
            "innerHTML".to_string()
        } else {
            react::attribute(&name)
        };
        if let Some((event, capture)) = react::event(&name) {
            self.event_attribute(attr, state, &event, capture);
            return;
        }
        if name == "ref" {
            self.ref_attribute(attr, state);
            return;
        }
        // React focuses on mount; the attribute alone only works during page load.
        if name == "autofocus" && !self.ssr {
            let v = attr_expression(attr).map_or("true".to_string(), |e| self.expr(e));
            let el_var = self.node(state.b, state.path);
            let focus = self.helper("focus");
            state.b.ops.push(format!("{focus}({el_var}, {v});"));
        }
        // A <textarea> or <select> has no value attribute: the value is its content or its selected option.
        if (state.tag == "textarea" || state.tag == "select")
            && (name == "value" || name == "defaultValue")
        {
            self.form_attribute(attr, state, name);
            return;
        }
        self.ordinary_attribute(attr, state, name, raw);
    }

    fn event_attribute(
        &mut self,
        attr: &JSXAttribute<'_>,
        state: &mut Attributes<'_>,
        event: &str,
        capture: bool,
    ) {
        let Some(expr) = attr_expression(attr) else {
            return;
        };
        if self.ssr {
            return;
        }
        let el_var = self.node(state.b, state.path);
        let h = self.expr(expr);
        if capture {
            state
                .b
                .ops
                .push(format!("{el_var}.addEventListener({event:?}, {h}, true);"));
            return;
        }
        if event == "change" {
            let change = self.helper("change");
            state.b.ops.push(format!("{change}({el_var}, {h});"));
            return;
        }
        let delegated = DELEGATED.contains(&event);
        if delegated {
            self.delegated.insert(event.to_string());
            self.helpers.insert("delegate");
        }
        // A delegated function needs no call: `addEvent` would only store it here. An array might be `[fn, data]`.
        let function = attr_expression(attr).is_some_and(|e| {
            matches!(
                e.get_inner_expression(),
                Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_)
            )
        });
        if delegated && function && !flag_off("EVENT") {
            state.b.ops.push(format!("{el_var}._$${event} = {h};"));
            return;
        }
        let on = self.helper("on");
        state
            .b
            .ops
            .push(format!("{on}({el_var}, {event:?}, {h}, {delegated});"));
    }

    fn ref_attribute(&mut self, attr: &JSXAttribute<'_>, state: &mut Attributes<'_>) {
        // `ref={fn}` or `ref={[a, b]}` calls them with the element; `ref={el}` on a variable assigns it.
        let Some(expr) = attr_expression(attr) else {
            return;
        };
        if self.ssr {
            return;
        }
        let el_var = self.node(state.b, state.path);
        let r = self.expr(expr);
        let call = self.helper("ref");
        state.b.ops.push(if self.assignable(expr) {
            format!("{{ const _r = {r}; typeof _r === \"function\" || Array.isArray(_r) ? {call}(() => _r, {el_var}) : ({r} = {el_var}); }}")
        } else {
            format!("{call}(() => {r}, {el_var});")
        });
    }

    fn form_attribute(
        &mut self,
        attr: &JSXAttribute<'_>,
        state: &mut Attributes<'_>,
        name: String,
    ) {
        let v = match &attr.value {
            Some(JSXAttributeValue::StringLiteral(s)) => {
                js_string(&decode_entities(s.value.as_str()))
            }
            Some(JSXAttributeValue::ExpressionContainer(c)) => match c.expression.as_expression() {
                Some(e) => self.expr(e),
                None => return,
            },
            _ => return,
        };
        if !self.ssr {
            state.dynamic.push((
                "prop",
                if state.tag == "select" {
                    "value".to_string()
                } else {
                    name
                },
                v,
            ));
        } else if state.tag == "select" {
            let select = self.helper("select");
            Self::server(state.b, Piece::Code(format!("{select}({v})")));
        } else {
            state.content = Some(format!("{}(String(({v}) ?? \"\"))", self.helper("escape")));
        }
    }

    fn ordinary_attribute(
        &mut self,
        attr: &JSXAttribute<'_>,
        state: &mut Attributes<'_>,
        name: String,
        raw: bool,
    ) {
        // In HTML the attribute is the default: `.value` and `.checked` start from it.
        let html = match name.as_str() {
            "defaultValue" => "value",
            "defaultChecked" => "checked",
            other => other,
        }
        .to_string();
        match &attr.value {
            None if react::takes_words(&name) => Self::put(state.b, &format!(" {html}=\"true\"")),
            None => Self::put(state.b, &format!(" {html}")),
            Some(JSXAttributeValue::StringLiteral(s)) => {
                let text = &self.text[s.span.start as usize + 1..s.span.end as usize - 1];
                Self::put(
                    state.b,
                    &format!(" {html}=\"{}\"", text.replace('"', "&quot;")),
                );
            }
            Some(JSXAttributeValue::ExpressionContainer(c)) => {
                let Some(expr) = c.expression.as_expression() else {
                    return;
                };
                self.expression_attribute(attr, state, name, &html, raw, expr);
            }
            Some(other) => {
                self.fail(
                    "weft back end: a JSX element as an attribute value needs `{…}`",
                    other.span(),
                );
            }
        }
    }

    fn expression_attribute(
        &mut self,
        attr: &JSXAttribute<'_>,
        state: &mut Attributes<'_>,
        name: String,
        html: &str,
        raw: bool,
        expr: &Expression<'_>,
    ) {
        // Some states are the words `true`/`false` (`aria-pressed={false}` is not a missing attribute).
        let known = match expr.get_inner_expression() {
            Expression::BooleanLiteral(v) if react::takes_words(&name) => {
                Some(Static::Text(v.value.to_string()))
            }
            _ => static_value(expr),
        };
        match known {
            Some(Static::Text(t)) => {
                Self::put(state.b, &format!(" {html}=\"{}\"", escape_attr(&t)));
            }
            Some(Static::True) => Self::put(state.b, &format!(" {html}")),
            Some(Static::Absent) => {}
            None => self.dynamic_attribute(attr, state, name, html, raw, expr),
        }
    }

    fn dynamic_attribute(
        &mut self,
        attr: &JSXAttribute<'_>,
        state: &mut Attributes<'_>,
        name: String,
        html: &str,
        raw: bool,
        expr: &Expression<'_>,
    ) {
        let kind = if name == "class" {
            "class"
        } else if name == "style" {
            "style"
        } else if PROPERTIES.contains(&name.as_str()) {
            "prop"
        } else {
            "attr"
        };
        let e = self.expr(expr);
        let e = if raw {
            format!("({e})?.__html ?? \"\"")
        } else {
            e
        };
        if (name == "textContent" || name == "innerHTML") && state.has_kids {
            self.fail(format!("weft back end: an element with `{name}` can't also have children (it replaces them)"), attr.span);
            return;
        }
        if self.ssr {
            // Content properties aren't attributes: the server writes them as the content.
            if name == "textContent" {
                state.content = Some(format!("{}(String(({e}) ?? \"\"))", self.helper("escape")));
            } else if name == "innerHTML" {
                state.content = Some(format!("String(({e}) ?? \"\")"));
            } else {
                let call = if state.tag == "select" && name == "value" {
                    format!("{}({e})", self.helper("select"))
                } else {
                    format!("{}({html:?}, {e})", self.helper("attr"))
                };
                Self::server(state.b, Piece::Code(call));
            }
        } else if !self.hydratable && self.is_key(&e) {
            // Hydrating, the server wrote it and a write would be a mutation: bind skips it.
            let el_var = self.node(state.b, state.path);
            let w = self.write(&el_var, kind, &name, &e, "undefined");
            state.b.ops.push(format!("{w};"));
        } else {
            state.dynamic.push((kind, name, e));
        }
    }
}
