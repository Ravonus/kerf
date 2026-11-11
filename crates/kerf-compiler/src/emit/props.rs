//! Props emission.

use super::{
    Emitter, Expression, GetSpan, ISLAND, JSXAttribute, JSXAttributeItem, JSXAttributeName,
    JSXAttributeValue, ObjectExpression, ObjectPropertyKind, PropertyKind, TAG, attr_expression,
    decode_entities, has_jsx, js_string, passes_as_value, prop_key, srcmap,
};

impl Emitter<'_> {
    /// An element's attributes as one object literal, read in order on every run of its `spread` (later wins):
    /// `{ a: x, ...rest, b: y }`. `ref={el}` on a variable is a function that assigns it. `None` when an attribute's
    /// value is JSX, which must not be rebuilt on every run.
    pub(super) fn spread_object(
        &mut self,
        attrs: &oxc_allocator::Vec<'_, JSXAttributeItem<'_>>,
    ) -> Option<String> {
        let mut fields: Vec<String> = Vec::new();
        for item in attrs {
            match item {
                JSXAttributeItem::SpreadAttribute(s) => {
                    // a spread element takes any assignment expression, so `...a ?? b` needs no parentheses
                    fields.push(format!("...{}", self.expr(&s.argument)));
                }
                JSXAttributeItem::Attribute(a) => {
                    let key = match &a.name {
                        JSXAttributeName::Identifier(id) => id.name.to_string(),
                        JSXAttributeName::NamespacedName(ns) => {
                            format!("{}:{}", ns.namespace.name, ns.name.name)
                        }
                    };
                    if key == "key" {
                        continue;
                    }
                    let k = prop_key(&key);
                    fields.push(match &a.value {
                        None => format!("{k}: true"),
                        Some(JSXAttributeValue::StringLiteral(s)) => {
                            format!("{k}: {}", js_string(&decode_entities(s.value.as_str())))
                        }
                        Some(JSXAttributeValue::ExpressionContainer(c)) => {
                            match c.expression.as_expression() {
                                None => continue,
                                Some(e) if key == "ref" && self.assignable(e) => {
                                    format!("{k}: {}", self.assigner(e))
                                }
                                Some(e) => format!("{k}: {}", self.expr(e)),
                            }
                        }
                        Some(JSXAttributeValue::Element(_) | JSXAttributeValue::Fragment(_)) => {
                            return None;
                        }
                    });
                }
            }
        }
        Some(format!("{{ {} }}", fields.join(", ")))
    }

    /// `ref={el}` beside a spread: a function that calls `el` with the element, or assigns it to `el`.
    pub(super) fn assigner(&mut self, e: &Expression<'_>) -> String {
        let (r, call) = (self.expr(e), self.helper("ref"));
        format!(
            "(_e) => {{ const _r = {r}; typeof _r === \"function\" || Array.isArray(_r) ? {call}(() => _r, _e) : ({r} = _e); }}"
        )
    }

    /// Props from JSX attributes, in order: literals and plain values as fields, the rest as getters, spreads as
    /// `mergeProps` sources (later wins). `extra` fields go last. An `element`'s `ref={el}` may assign `el`.
    /// `{ name, mark: <Logo /> }` as a prop: its JSX fields become getters too, so reading `name` builds no `<Logo>`.
    /// A built element takes a hydration key, and one built where it isn't rendered takes the key of what is.
    pub(super) fn lazy_fields(&mut self, o: &ObjectExpression<'_>) -> Option<String> {
        let jsx = |e: &Expression<'_>| {
            matches!(
                e.get_inner_expression(),
                Expression::JSXElement(_) | Expression::JSXFragment(_)
            )
        };
        let mut any = false;
        for p in &o.properties {
            match p {
                ObjectPropertyKind::ObjectProperty(p)
                    if p.kind == PropertyKind::Init && !p.method =>
                {
                    any |= jsx(&p.value);
                }
                ObjectPropertyKind::ObjectProperty(_) => return None,
                ObjectPropertyKind::SpreadProperty(_) => {}
            }
        }
        if !any {
            return None;
        }
        let mut fields = Vec::new();
        for p in &o.properties {
            fields.push(match p {
                ObjectPropertyKind::SpreadProperty(s) => format!("...{}", self.expr(&s.argument)),
                ObjectPropertyKind::ObjectProperty(p) => {
                    let key = srcmap::copy(
                        self.text,
                        p.key.span().start as usize,
                        p.key.span().end as usize,
                    );
                    let key = if p.computed { format!("[{key}]") } else { key };
                    let v = self.expr(&p.value);
                    if jsx(&p.value) {
                        format!("get {key}() {{ return {v}; }}")
                    } else {
                        format!("{key}: {v}")
                    }
                }
            });
        }
        Some(format!("{{ {} }}", fields.join(", ")))
    }

    pub(super) fn props(
        &mut self,
        attrs: &oxc_allocator::Vec<'_, JSXAttributeItem<'_>>,
        extra: Vec<String>,
        element: bool,
    ) -> String {
        let mut sources: Vec<String> = Vec::new();
        let mut fields: Vec<String> = Vec::new();
        for item in attrs {
            match item {
                JSXAttributeItem::SpreadAttribute(s) => {
                    if !fields.is_empty() {
                        sources.push(format!("{{ {} }}", fields.join(", ")));
                        fields.clear();
                    }
                    // `{...props.rest}` is read live: anything but a plain name is passed as a function.
                    let e = self.expr(&s.argument);
                    sources.push(
                        if matches!(s.argument.get_inner_expression(), Expression::Identifier(_)) {
                            e
                        } else {
                            format!("() => ({e})")
                        },
                    );
                }
                JSXAttributeItem::Attribute(attr) => {
                    if let Some(field) = self.prop_field(attr, element) {
                        fields.push(field);
                    }
                }
            }
        }
        fields.extend(extra);
        if sources.is_empty() {
            if fields.is_empty() {
                "{}".to_string()
            } else {
                format!("{{ {} }}", fields.join(", "))
            }
        } else {
            if !fields.is_empty() {
                sources.push(format!("{{ {} }}", fields.join(", ")));
            }
            format!("{}({})", self.helper("mergeProps"), sources.join(", "))
        }
    }

    fn prop_field(&mut self, attr: &JSXAttribute<'_>, element: bool) -> Option<String> {
        let key = match &attr.name {
            JSXAttributeName::Identifier(id) => id.name.to_string(),
            JSXAttributeName::NamespacedName(ns) => {
                format!("{}:{}", ns.namespace.name, ns.name.name)
            }
        };
        // `bind:count={box}`: the child reads the box, and its writes reach it.
        if let (false, JSXAttributeName::NamespacedName(ns), Some(e)) =
            (element, &attr.name, attr_expression(attr))
            && ns.namespace.name == "bind"
        {
            let (k, target) = (prop_key(ns.name.name.as_str()), self.expr(e));
            return Some(format!(
                "get {k}() {{ return {target}.value; }}, set {k}(_v) {{ {target}.value = _v; }}"
            ));
        }
        if key == "key" || key == TAG || key == ISLAND {
            return None;
        }
        let k = prop_key(&key);
        let field = match &attr.value {
            None => format!("{k}: true"),
            Some(JSXAttributeValue::StringLiteral(s)) => {
                format!("{k}: {}", js_string(&decode_entities(s.value.as_str())))
            }
            Some(JSXAttributeValue::ExpressionContainer(c)) => match c.expression.as_expression() {
                None => return None,
                Some(e) if element && key == "ref" && self.assignable(e) => {
                    format!("{k}: {}", self.assigner(e))
                }
                Some(Expression::CallExpression(b)) if matches!(&b.callee, Expression::Identifier(id) if id.name == "_$bound") =>
                {
                    let target = b.arguments[0]
                        .as_expression()
                        .map(|e| self.expr(e))
                        .unwrap_or_default();
                    format!(
                        "get {k}() {{ return {target}.value; }}, set {k}(_v) {{ {target}.value = _v; }}"
                    )
                }
                Some(e) if passes_as_value(e) => format!("{k}: {}", self.expr(e)),
                // A server element reads each attribute once, right away: a value costs less than a getter.
                // What renders (children, JSX) stays a getter, so it renders in its place.
                Some(e) if element && self.ssr && key != "children" && !has_jsx(e) => {
                    format!("{k}: {}", self.expr(e))
                }
                Some(e) => {
                    let v = match e.get_inner_expression() {
                        Expression::ObjectExpression(obj) => {
                            self.lazy_fields(obj).unwrap_or_else(|| self.expr(e))
                        }
                        _ => self.expr(e),
                    };
                    format!("get {k}() {{ return {v}; }}")
                }
            },
            Some(JSXAttributeValue::Element(e)) => {
                format!("get {k}() {{ return {}; }}", self.element(e))
            }
            Some(JSXAttributeValue::Fragment(f)) => {
                format!("get {k}() {{ return {}; }}", self.fragment(f))
            }
        };
        Some(field)
    }
}
