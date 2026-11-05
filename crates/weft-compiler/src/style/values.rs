//! Resolve and evaluate static group definitions and values.

use std::collections::BTreeMap;
use std::path::{Component, Path, PathBuf};

use oxc_ast::ast::{Expression, ObjectPropertyKind, PropertyKey, PropertyKind};
use oxc_semantic::{Scoping, SymbolId};
use oxc_span::{GetSpan, Span};
use serde_json::{Map, Value};

use crate::diag::{Diagnostic, Severity};

/// The `JSDoc` block that ends right before `at` (only whitespace between), as plain text.
pub(super) fn doc_before(source: &str, at: u32) -> Option<String> {
    let before = source[..at as usize].trim_end();
    let body = before.strip_suffix("*/")?;
    let open = body.rfind("/**")?;
    let text = body[open + 3..]
        .lines()
        .map(|l| l.trim().trim_start_matches('*').trim())
        .filter(|l| !l.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    (!text.is_empty()).then_some(text)
}

pub(super) fn not_static(source: &str, span: Span, what: &str, help: &str) -> Diagnostic {
    Diagnostic::new(
        source,
        "W060",
        Severity::Error,
        (span.start, span.end),
        format!("group can't be evaluated at build: {what} isn't a literal"),
        help,
    )
}

pub(super) fn resolves(scoping: &Scoping, e: &Expression) -> Option<SymbolId> {
    let Expression::Identifier(id) = e else {
        return None;
    };
    id.reference_id
        .get()
        .and_then(|r| scoping.get_reference(r).symbol_id())
}

/// `./order-card` from `/app/src/x.tsx` → `/app/src/order-card` (extension stripped, as the plugin keys groups).
pub(crate) fn resolve(filename: &str, spec: &str) -> String {
    let base = Path::new(filename)
        .parent()
        .unwrap_or(Path::new(""))
        .join(spec);
    let mut out = PathBuf::new();
    for c in base.components() {
        match c {
            Component::ParentDir => {
                out.pop();
            }
            Component::CurDir => {}
            c => out.push(c),
        }
    }
    let s = out.to_string_lossy().into_owned();
    for ext in [".tsx", ".ts", ".jsx", ".js", ".mts", ".mjs"] {
        if let Some(stem) = s.strip_suffix(ext) {
            return stem.to_string();
        }
    }
    s
}

/// A literal value: strings, numbers, booleans, null, objects with plain keys, arrays. `Err` is the first value that
/// isn't one, with its path in the definition.
pub(super) fn eval(e: &Expression) -> Result<Value, (Span, String)> {
    match e {
        Expression::StringLiteral(s) => Ok(Value::String(s.value.to_string())),
        Expression::NumericLiteral(n) => {
            Ok(serde_json::Number::from_f64(n.value).map_or(Value::Null, Value::Number))
        }
        Expression::BooleanLiteral(b) => Ok(Value::Bool(b.value)),
        Expression::NullLiteral(_) => Ok(Value::Null),
        Expression::TemplateLiteral(t) if t.expressions.is_empty() => Ok(Value::String(
            t.quasis
                .iter()
                .map(|q| q.value.cooked.map_or(q.value.raw.as_str(), |c| c.as_str()))
                .collect(),
        )),
        Expression::ParenthesizedExpression(p) => eval(&p.expression),
        Expression::TSAsExpression(a) => eval(&a.expression),
        Expression::TSSatisfiesExpression(a) => eval(&a.expression),
        Expression::UnaryExpression(u) if u.operator.as_str() == "-" => match eval(&u.argument)? {
            Value::Number(n) => Ok(serde_json::Number::from_f64(-n.as_f64().unwrap_or(0.0))
                .map_or(Value::Null, Value::Number)),
            _ => Err((u.span, String::new())),
        },
        Expression::ArrayExpression(a) => a
            .elements
            .iter()
            .enumerate()
            .map(|(i, el)| match el.as_expression() {
                Some(e) => eval(e).map_err(|(s, p)| (s, join(&i.to_string(), &p))),
                None => Err((a.span, i.to_string())),
            })
            .collect::<Result<Vec<_>, _>>()
            .map(Value::Array),
        Expression::ObjectExpression(o) => {
            let mut map = Map::new();
            for p in &o.properties {
                let ObjectPropertyKind::ObjectProperty(p) = p else {
                    return Err((p.span(), String::new()));
                };
                let key = match &p.key {
                    PropertyKey::StaticIdentifier(id) => id.name.to_string(),
                    PropertyKey::StringLiteral(s) => s.value.to_string(),
                    PropertyKey::NumericLiteral(n) => n.value.to_string(),
                    k => return Err((k.span(), String::new())),
                };
                if p.computed || p.method || p.kind != PropertyKind::Init {
                    return Err((p.span, key));
                }
                let v = eval(&p.value).map_err(|(s, path)| (s, join(&key, &path)))?;
                map.insert(key, v);
            }
            Ok(Value::Object(map))
        }
        e => Err((e.span(), String::new())),
    }
}

pub(super) fn join(head: &str, tail: &str) -> String {
    if tail.is_empty() {
        head.to_string()
    } else {
        format!("{head}.{tail}")
    }
}

/// The values an axis expression can produce, when every leaf is a string literal (`a ? 'x' : 'y'`).
pub(super) fn literals(e: &Expression) -> Option<Vec<String>> {
    match e {
        Expression::StringLiteral(s) => Some(vec![s.value.to_string()]),
        Expression::TemplateLiteral(t) if t.expressions.is_empty() => {
            Some(vec![t.quasis[0].value.raw.to_string()])
        }
        Expression::ParenthesizedExpression(p) => literals(&p.expression),
        Expression::TSAsExpression(a) => literals(&a.expression),
        Expression::ConditionalExpression(c) => {
            let mut v = literals(&c.consequent)?;
            v.extend(literals(&c.alternate)?);
            v.dedup();
            Some(v)
        }
        _ => None,
    }
}

pub(super) fn list(xs: &[String]) -> String {
    if xs.is_empty() {
        "none".into()
    } else {
        xs.join(", ")
    }
}

/// `accent: { radius: 'round' }` → intent → token (sorted by intent); `Err` is the first part that isn't literal.
pub(super) fn accent(e: &Expression) -> Result<BTreeMap<String, String>, Span> {
    let Expression::ObjectExpression(o) = e.without_parentheses() else {
        return Err(e.span());
    };
    let mut out = BTreeMap::new();
    for p in &o.properties {
        let ObjectPropertyKind::ObjectProperty(p) = p else {
            return Err(p.span());
        };
        let Some(key) = p.key.static_name().filter(|_| !p.computed) else {
            return Err(p.key.span());
        };
        match literals(&p.value).as_deref() {
            Some([v]) => out.insert(key.to_string(), v.clone()),
            _ => return Err(p.value.span()),
        };
    }
    Ok(out)
}

/// Edit distance with adjacent swaps counted as one edit (`titel` → `title`), for "did you mean".
pub(super) fn distance(a: &str, b: &str) -> usize {
    let (a, b): (Vec<char>, Vec<char>) = (a.chars().collect(), b.chars().collect());
    let mut d = vec![vec![0usize; b.len() + 1]; a.len() + 1];
    for (i, row) in d.iter_mut().enumerate() {
        row[0] = i;
    }
    for (j, cell) in d[0].iter_mut().enumerate() {
        *cell = j;
    }
    for i in 1..=a.len() {
        for j in 1..=b.len() {
            let cost = usize::from(a[i - 1] != b[j - 1]);
            d[i][j] = (d[i - 1][j] + 1)
                .min(d[i][j - 1] + 1)
                .min(d[i - 1][j - 1] + cost);
            if i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1] {
                d[i][j] = d[i][j].min(d[i - 2][j - 2] + 1);
            }
        }
    }
    d[a.len()][b.len()]
}

/// `Did you mean `late`? ` for the closest names (case-insensitive, within a third of the word), else nothing.
pub(super) fn did_you_mean(word: &str, names: &[String]) -> String {
    let w = word.to_lowercase();
    let limit = (w.chars().count() / 3).max(1);
    let mut close: Vec<(usize, &String)> = names
        .iter()
        .map(|n| (distance(&w, &n.to_lowercase()), n))
        .filter(|(d, n)| {
            *d <= limit || n.to_lowercase().contains(&w) || w.contains(&n.to_lowercase())
        })
        .collect();
    close.sort_by_key(|(d, _)| *d);
    match close.as_slice() {
        [] => String::new(),
        [(_, n)] => format!("Did you mean `{n}`? "),
        many => format!(
            "Did you mean {}? ",
            many.iter()
                .take(3)
                .map(|(_, n)| format!("`{n}`"))
                .collect::<Vec<_>>()
                .join(" or ")
        ),
    }
}
