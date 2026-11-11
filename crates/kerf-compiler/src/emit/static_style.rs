//! `style={{ … }}` with only constant values: CSS text known at compile time. It goes into the template like a literal
//! `style="…"`, so the element costs nothing at run time instead of a binding that never changes. The text matches
//! what the runtime's `style()` would set (`cssName`, `cssValue` in packages/core/src/dom/attributes.ts).

use oxc_ast::ast::{Expression, ObjectPropertyKind, PropertyKey, PropertyKind};

/// The CSS text of a style object whose keys and values are all constant, or `None` when anything isn't.
pub(super) fn static_style(e: &Expression<'_>) -> Option<String> {
    let Expression::ObjectExpression(o) = e.get_inner_expression() else {
        return None;
    };
    let mut out = Vec::with_capacity(o.properties.len());
    for p in &o.properties {
        let ObjectPropertyKind::ObjectProperty(p) = p else {
            return None; // a spread
        };
        if p.computed || p.method || p.kind != PropertyKind::Init {
            return None;
        }
        let key = match &p.key {
            PropertyKey::StaticIdentifier(id) => id.name.to_string(),
            PropertyKey::StringLiteral(s) => s.value.to_string(),
            _ => return None,
        };
        let name = css_name(&key);
        let value = match p.value.get_inner_expression() {
            // `null`, `undefined` and booleans write no declaration.
            Expression::NullLiteral(_) | Expression::BooleanLiteral(_) => continue,
            Expression::Identifier(id) if id.name == "undefined" => continue,
            Expression::StringLiteral(s) => s.value.to_string(),
            Expression::TemplateLiteral(t) if t.expressions.is_empty() => {
                t.quasis.first()?.value.cooked.as_ref()?.to_string()
            }
            Expression::NumericLiteral(n) => number(n.value, &name)?,
            _ => return None,
        };
        // The runtime sets each value with `setProperty`, which takes one value: text that would read as more than
        // that in a style attribute (another declaration, a priority) stays a run-time write.
        if value.contains([';', '!', '{', '}', '<', '>']) {
            return None;
        }
        out.push(format!("{name}:{value}"));
    }
    Some(out.join(";"))
}

/// React's numbers: pixels unless the property is unitless; 0 stays 0.
fn number(v: f64, name: &str) -> Option<String> {
    if !v.is_finite() {
        return None;
    }
    let text = v.to_string();
    if text.contains('e') {
        return None;
    }
    Some(if v != 0.0 && !unitless(name) {
        format!("{text}px")
    } else {
        text
    })
}

/// `fontSize` → `font-size`, `WebkitBoxShadow` → `-webkit-box-shadow`, `msTransform` → `-ms-transform`.
fn css_name(k: &str) -> String {
    if k == "cssFloat" {
        return "float".into();
    }
    if k.as_bytes().get(1) == Some(&b'-') {
        return k.to_string();
    }
    let k = match k.strip_prefix("ms") {
        Some(rest) if rest.starts_with(|c: char| c.is_ascii_uppercase()) => format!("-ms{rest}"),
        _ => k.to_string(),
    };
    let mut out = String::with_capacity(k.len() + 4);
    for c in k.chars() {
        if c.is_ascii_uppercase() {
            out.push('-');
            out.push(c.to_ascii_lowercase());
        } else {
            out.push(c);
        }
    }
    out
}

/// Unitless properties, without a vendor prefix (the runtime's `UNITLESS`).
const EXACT: &[&str] = &[
    "animation-iteration-count",
    "aspect-ratio",
    "border-image-outset",
    "border-image-slice",
    "border-image-width",
    "box-flex",
    "box-flex-group",
    "box-ordinal-group",
    "column-count",
    "columns",
    "flex",
    "flex-grow",
    "flex-shrink",
    "flex-order",
    "flex-positive",
    "flex-negative",
    "fill-opacity",
    "flood-opacity",
    "stop-opacity",
    "stroke-opacity",
    "font-weight",
    "line-clamp",
    "line-height",
    "opacity",
    "order",
    "orphans",
    "scale",
    "stroke-dasharray",
    "stroke-dashoffset",
    "stroke-miterlimit",
    "stroke-width",
    "tab-size",
    "widows",
    "z-index",
    "zoom",
];

/// The runtime's `UNITLESS`: custom properties and the properties a bare number is right for.
fn unitless(name: &str) -> bool {
    if name.starts_with("--") {
        return true;
    }
    // A vendor prefix (`-webkit-`) doesn't change it.
    let bare = name
        .strip_prefix('-')
        .and_then(|r| r.split_once('-'))
        .filter(|(v, _)| !v.is_empty() && v.chars().all(|c| c.is_ascii_alphanumeric() || c == '_'))
        .map_or(name, |(_, rest)| rest);
    if EXACT.contains(&bare) {
        return true;
    }
    ["grid-area", "grid-row", "grid-column"].iter().any(|g| {
        bare.strip_prefix(g)
            .is_some_and(|rest| ["", "-end", "-span", "-start"].contains(&rest))
    })
}

#[cfg(test)]
mod tests {
    use super::{css_name, number, unitless};

    #[test]
    fn names_and_numbers_match_the_runtime() {
        assert_eq!(css_name("fontSize"), "font-size");
        assert_eq!(css_name("WebkitBoxShadow"), "-webkit-box-shadow");
        assert_eq!(css_name("msTransform"), "-ms-transform");
        assert_eq!(css_name("cssFloat"), "float");
        assert_eq!(css_name("--gap"), "--gap");
        assert_eq!(number(12.0, "width").as_deref(), Some("12px"));
        assert_eq!(number(0.0, "width").as_deref(), Some("0"));
        assert_eq!(number(0.5, "opacity").as_deref(), Some("0.5"));
        assert_eq!(number(2.0, "-webkit-line-clamp").as_deref(), Some("2"));
        assert!(unitless("grid-row-end") && unitless("--x") && !unitless("grid-gap"));
    }
}
