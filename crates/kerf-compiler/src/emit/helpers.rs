//! Helpers shared by the emission modules.

use super::{
    Expression, ISLAND, JSXAttribute, JSXAttributeItem, JSXAttributeName, JSXAttributeValue,
    JSXChild, JSXElement, JSXElementName, Kid, Outermost, TAG, Visit, marked,
};

/// `e` holds JSX somewhere.
pub(super) fn has_jsx(e: &Expression<'_>) -> bool {
    let mut v = Outermost::default();
    v.visit_expression(e);
    !v.found.is_empty()
}

/// `c ? a : b` or `c && a` / `c || a` / `c ?? a` where a branch holds JSX.
pub(super) fn has_jsx_branch(e: &Expression<'_>) -> bool {
    let jsx = |e: &Expression<'_>| {
        let mut v = Outermost::default();
        v.visit_expression(e);
        !v.found.is_empty()
    };
    match e {
        Expression::ConditionalExpression(c) => jsx(&c.consequent) || jsx(&c.alternate),
        Expression::LogicalExpression(l) => jsx(&l.right),
        _ => false,
    }
}

// ---- helpers --------------------------------------------------------------------------------------------------

pub(super) fn tag_name(name: &JSXElementName<'_>) -> String {
    match name {
        JSXElementName::Identifier(id) => id.name.to_string(),
        JSXElementName::IdentifierReference(r) => r.name.to_string(),
        JSXElementName::NamespacedName(n) => format!("{}:{}", n.namespace.name, n.name.name),
        JSXElementName::MemberExpression(m) => format!("….{}", m.property.name),
        JSXElementName::ThisExpression(_) => "this".into(),
    }
}

/// `Some(name)` for a component tag (capitalised identifier or member expression), `None` for an element.
pub(super) fn component_name(name: &JSXElementName<'_>, text: &str) -> Option<String> {
    match name {
        JSXElementName::Identifier(id) => {
            let first = id.name.chars().next()?;
            (first.is_ascii_uppercase()).then(|| id.name.to_string())
        }
        JSXElementName::IdentifierReference(r) => Some(r.name.to_string()),
        JSXElementName::MemberExpression(m) => {
            Some(text[m.span.start as usize..m.span.end as usize].to_string())
        }
        _ => None,
    }
}

/// The island mark on a component's tag (`hydration::mark`).
pub(super) fn island_mark(el: &JSXElement<'_>) -> Option<(String, Vec<String>, bool, String)> {
    el.opening_element.attributes.iter().find_map(|a| match a {
        JSXAttributeItem::Attribute(a) if matches!(&a.name, JSXAttributeName::Identifier(id) if id.name == ISLAND) => {
            match &a.value {
                Some(JSXAttributeValue::StringLiteral(s)) => marked(s.value.as_str()),
                _ => None,
            }
        }
        _ => None,
    })
}

/// The live read the pre-pass put beside a component's tag (`TAG`).
pub(super) fn tag_read<'a>(el: &'a JSXElement<'a>) -> Option<&'a Expression<'a>> {
    el.opening_element.attributes.iter().find_map(|a| match a {
        JSXAttributeItem::Attribute(a) if matches!(&a.name, JSXAttributeName::Identifier(id) if id.name == TAG) => {
            attr_expression(a)
        }
        _ => None,
    })
}

pub(super) fn is_component(el: &JSXElement<'_>, text: &str) -> bool {
    component_name(&el.opening_element.name, text).is_some()
}

pub(super) fn attr_expression<'a>(attr: &'a JSXAttribute<'a>) -> Option<&'a Expression<'a>> {
    match &attr.value {
        Some(JSXAttributeValue::ExpressionContainer(c)) => c.expression.as_expression(),
        _ => None,
    }
}

pub(super) enum Static {
    Text(String),
    True,
    Absent,
}

/// Values known at compile time, inlined into the template.
pub(super) fn static_value(e: &Expression<'_>) -> Option<Static> {
    match e.get_inner_expression() {
        Expression::StringLiteral(s) => Some(Static::Text(s.value.to_string())),
        Expression::NumericLiteral(n) => Some(Static::Text(n.value.to_string())),
        Expression::BooleanLiteral(b) => Some(if b.value {
            Static::True
        } else {
            Static::Absent
        }),
        Expression::NullLiteral(_) => Some(Static::Absent),
        Expression::TemplateLiteral(t) if t.expressions.is_empty() => Some(Static::Text(
            t.quasis
                .first()
                .and_then(|q| q.value.cooked.as_ref())
                .map(std::string::ToString::to_string)
                .unwrap_or_default(),
        )),
        _ => None,
    }
}

/// Props passed as plain values rather than getters: literals, names, functions and `new` (evaluated once, W016).
pub(super) fn passes_as_value(e: &Expression<'_>) -> bool {
    matches!(
        e.get_inner_expression(),
        Expression::StringLiteral(_)
            | Expression::NumericLiteral(_)
            | Expression::BooleanLiteral(_)
            | Expression::NullLiteral(_)
            | Expression::Identifier(_)
            | Expression::ArrowFunctionExpression(_)
            | Expression::FunctionExpression(_)
            | Expression::NewExpression(_)
    ) || matches!(e.get_inner_expression(), Expression::TemplateLiteral(t) if t.expressions.is_empty())
}

pub(super) fn prop_key(k: &str) -> String {
    let ident = k.chars().enumerate().all(|(i, c)| {
        c == '_' || c == '$' || c.is_ascii_alphabetic() || (i > 0 && c.is_ascii_digit())
    });
    if ident {
        k.to_string()
    } else {
        format!("{k:?}")
    }
}

/// JSX children after JSX's whitespace rules (React's: lines trimmed, whitespace-only lines with newlines dropped).
pub(super) fn children<'a>(
    kids: &'a oxc_allocator::Vec<'a, JSXChild<'a>>,
    _text: &str,
) -> Vec<Kid<'a>> {
    let mut out = Vec::new();
    for k in kids {
        match k {
            JSXChild::Text(t) => {
                if let Some(s) = clean_text(t.value.as_str()) {
                    out.push(Kid::Text(s));
                }
            }
            JSXChild::Element(e) => out.push(Kid::El(e)),
            JSXChild::Fragment(f) => out.push(Kid::Frag(f)),
            JSXChild::ExpressionContainer(c) => {
                if let Some(e) = c.expression.as_expression() {
                    out.push(Kid::Expr(e));
                }
            }
            JSXChild::Spread(s) => out.push(Kid::Expr(&s.expression)),
        }
    }
    out
}

pub(super) fn clean_text(raw: &str) -> Option<String> {
    let lines: Vec<&str> = raw.split('\n').collect();
    let last = lines.len() - 1;
    let mut out = String::new();
    for (i, line) in lines.iter().enumerate() {
        let mut l = line.replace('\t', " ");
        if i != 0 {
            l = l.trim_start().to_string();
        }
        if i != last {
            l = l.trim_end().to_string();
        }
        if !l.is_empty() {
            if !out.is_empty() && i != 0 {
                out.push(' ');
            }
            out.push_str(&l);
        }
    }
    (!out.is_empty()).then_some(out)
}

/// JSX text is HTML-like: entities stay as written in templates (the parser decodes them) and are decoded for strings.
pub(super) fn decode_entities(s: &str) -> String {
    if !s.contains('&') {
        return s.to_string();
    }
    let mut out = String::new();
    let mut rest = s;
    while let Some(i) = rest.find('&') {
        out.push_str(&rest[..i]);
        let tail = &rest[i..];
        let end = tail.find(';').filter(|&e| e <= 10);
        let decoded = end.and_then(|e| {
            let ent = &tail[1..e];
            let c = match ent {
                "amp" => Some('&'),
                "lt" => Some('<'),
                "gt" => Some('>'),
                "quot" => Some('"'),
                "apos" => Some('\''),
                "nbsp" => Some('\u{a0}'),
                _ if ent.starts_with("#x") => u32::from_str_radix(&ent[2..], 16)
                    .ok()
                    .and_then(char::from_u32),
                _ if ent.starts_with('#') => ent[1..].parse::<u32>().ok().and_then(char::from_u32),
                _ => None,
            }?;
            Some((c, e))
        });
        if let Some((c, e)) = decoded {
            out.push(c);
            rest = &tail[e + 1..];
        } else {
            out.push('&');
            rest = &tail[1..];
        }
    }
    out.push_str(rest);
    out
}

pub(super) fn escape_text(s: &str) -> String {
    s.replace('<', "&lt;")
}

pub(super) fn escape_attr(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
}
