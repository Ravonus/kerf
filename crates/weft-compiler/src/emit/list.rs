//! Keyed-list emission helpers.

use super::{
    BindingPattern, Expression, JSXAttributeItem, JSXAttributeName, JSXElement, attr_expression,
    srcmap,
};

/// A keyed list's key as its rows read it: `by={(row) => row.a.b}` → `row().a.b` (rows get their item as an
/// accessor). Other `by` shapes give none.
pub(super) fn list_key(el: &JSXElement<'_>) -> Option<String> {
    let by = el.opening_element.attributes.iter().find_map(|a| match a {
        JSXAttributeItem::Attribute(a) if matches!(&a.name, JSXAttributeName::Identifier(id) if id.name == "by") => {
            attr_expression(a)
        }
        _ => None,
    })?;
    let Expression::ArrowFunctionExpression(f) = by.get_inner_expression() else {
        return None;
    };
    let [param] = f.params.items.as_slice() else {
        return None;
    };
    let BindingPattern::BindingIdentifier(p) = &param.pattern else {
        return None;
    };
    let body = f.get_expression()?;
    let mut path = Vec::new();
    let mut e = body.get_inner_expression();
    while let Expression::StaticMemberExpression(m) = e {
        path.push(m.property.name.as_str());
        e = m.object.get_inner_expression();
    }
    let Expression::Identifier(id) = e else {
        return None;
    };
    if id.name != p.name || path.is_empty() {
        return None;
    }
    path.reverse();
    Some(format!("{}().{}", p.name, path.join(".")))
}

/// A compiled speed path turned off for this run (`WEFT_OFF`, packages/core/src/flags.ts).
pub(super) fn flag_off(name: &str) -> bool {
    let off = OFF
        .with(|off| off.borrow().clone())
        .or_else(|| std::env::var("WEFT_OFF").ok());
    off.is_some_and(|v| v.split(',').any(|f| f == name || f == "all"))
}

thread_local! {
    static OFF: std::cell::RefCell<Option<String>> = const { std::cell::RefCell::new(None) };
}

/// `Options::off`, for this compile.
pub(crate) fn set_off(off: Option<String>) {
    OFF.with(|slot| *slot.borrow_mut() = off);
}

/// Reads of a row's key, moved to one read as the row is made. A row's key never changes (a new key is a new row), so
/// the read needs no link to the item: that's a dependency each row doesn't allocate. `WEFT_OFF=KEYREAD` leaves it.
pub(super) fn hoist_key(row: String, read: &str) -> String {
    let off = flag_off("KEYREAD");
    let item = read.split('(').next().unwrap_or(read);
    // The body has to be the emitted element, and nothing inside may rebind the item.
    let shadowed =
        row.matches(&format!("{item} =>")).count() + row.matches(&format!("({item})")).count() > 1;
    let body = "(() => {";
    let Some(at) = row
        .find(body)
        .map(|at| at + body.len())
        .filter(|at| srcmap::strip(&row[..*at]) == format!("({item}) => {body}"))
    else {
        return row;
    };
    if off || shadowed || row.contains("_key$") || !row[at..].contains(read) {
        return row;
    }
    format!(
        "{} const _key$ = {read};{}",
        &row[..at],
        row[at..].replace(read, "_key$")
    )
}
