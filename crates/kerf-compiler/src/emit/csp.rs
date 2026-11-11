//! Strict CSP (`csp: 'strict'`): a fixed `style` becomes a generated class, so the page needs no style attributes
//! and `style-src` needs no `'unsafe-inline'`. The class costs what the attribute did: both are part of the template.
//! Its rule marks each declaration `!important`, which keeps the place an inline style had over stylesheet rules.
//! A module imports one virtual stylesheet per class (`virtual:kerf/csp/<class>-<rule as hex>.css`), which
//! `@kerf/core/vite` turns back into the rule; the same style anywhere is the same class and the same import.

use std::collections::BTreeMap;
use std::fmt::Write as _;

/// The class for `css` (a style attribute's text), and its rule.
pub(super) fn class_for(css: &str) -> (String, String) {
    let decls: Vec<String> = declarations(css)
        .into_iter()
        .map(|d| {
            if d.to_ascii_lowercase()
                .replace(' ', "")
                .ends_with("!important")
            {
                d
            } else {
                format!("{d} !important")
            }
        })
        .collect();
    let body = decls.join(";");
    let class = format!("ws-{:08x}", fnv(body.as_bytes()) as u32);
    let rule = format!(".{class}{{{body}}}");
    (class, rule)
}

/// The import lines for a module's classes.
pub(super) fn imports(rules: Option<&BTreeMap<String, String>>) -> String {
    let mut out = String::new();
    for (class, rule) in rules.into_iter().flatten() {
        let mut hex = String::with_capacity(rule.len() * 2);
        for b in rule.bytes() {
            let _ = write!(hex, "{b:02x}");
        }
        let _ = writeln!(out, "import \"virtual:kerf/csp/{class}-{hex}.css\";");
    }
    out
}

/// `a:b; c:url("x;y")` → `["a:b", "c:url(\"x;y\")"]`: split on semicolons outside quotes and brackets.
fn declarations(css: &str) -> Vec<String> {
    let mut out = Vec::new();
    let (mut cur, mut depth, mut quote) = (String::new(), 0_i32, None::<char>);
    for c in css.chars() {
        match (quote, c) {
            (Some(q), c) if c == q => quote = None,
            (None, '"' | '\'') => quote = Some(c),
            (None, '(' | '[') => depth += 1,
            (None, ')' | ']') => depth -= 1,
            (None, ';') if depth == 0 => {
                push(&mut out, &cur);
                cur.clear();
                continue;
            }
            _ => {}
        }
        cur.push(c);
    }
    push(&mut out, &cur);
    out
}

fn push(out: &mut Vec<String>, d: &str) {
    let d = d.trim();
    if !d.is_empty() {
        out.push(d.to_string());
    }
}

/// FNV-1a: a short, stable name for the same rule in every module and build.
fn fnv(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf2_9ce4_8422_2325, |h, b| {
        (h ^ u64::from(*b)).wrapping_mul(0x0100_0000_01b3)
    })
}

#[cfg(test)]
mod tests {
    use super::{class_for, declarations};

    #[test]
    fn rules_keep_inline_priority_and_split_safely() {
        assert_eq!(
            declarations("color:red; background:url(\"a;b\") ;"),
            ["color:red", "background:url(\"a;b\")"]
        );
        let (class, rule) = class_for("color:red;opacity:0.5 !important");
        assert!(class.starts_with("ws-") && class.len() == 11);
        assert_eq!(
            rule,
            format!(".{class}{{color:red !important;opacity:0.5 !important}}")
        );
        assert_eq!(class_for("color:red").0, class_for(" color:red; ").0);
    }
}
