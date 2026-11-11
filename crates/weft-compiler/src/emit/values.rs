//! Values emission.

use super::*;

impl Emitter<'_> {
    /// Code that writes one attribute of `el` (`kind`: class, style, prop or attr): value `v`, previous `p`.
    pub(super) fn write(&mut self, el: &str, kind: &str, name: &str, v: &str, p: &str) -> String {
        match kind {
            "class" => format!("{}({el}, {v}, {p})", self.helper("cls")),
            "style" => format!("{}({el}, {v}, {p})", self.helper("css")),
            "prop" if name == "value" || name == "defaultValue" => {
                format!("({el}.{name} = {v} ?? \"\")")
            }
            "prop" => format!("({el}.{name} = {v})"),
            _ => format!("{}({el}, {name:?}, {v})", self.helper("attr")),
        }
    }

    /// `code` (an expression's text) is exactly the key of a keyed list it's inside.
    pub(super) fn is_key(&self, code: &str) -> bool {
        if self.keys.is_empty() {
            return false;
        }
        let code: String = srcmap::strip(code)
            .chars()
            .filter(|c| !c.is_whitespace())
            .collect();
        let code = code.trim_start_matches('(').trim_end_matches(')');
        self.keys.iter().any(|k| k == code)
    }

    pub(super) fn bind(&mut self, el: &str, dynamic: &[(&'static str, String, String)]) -> String {
        let bind = self.helper("bind");
        // Hydratable: what each value writes, so the first run can check the claimed element instead of trusting it
        // (`p:` a property, `a:` an attribute, empty for class and style, which the server's stand for).
        let spec = |kind: &str, name: &str| match kind {
            "class" | "style" => String::new(),
            "prop" => format!("p:{name}"),
            _ => format!("a:{name}"),
        };
        if let [(kind, name, e)] = dynamic {
            let a = self.write(el, kind, name, "v", "p");
            let check = if self.hydratable { format!(", {el}, {}", js_string(&spec(kind, name))) } else { String::new() };
            return format!("{bind}(() => ({e}), (v, p) => {{ v !== p && {a}; }}{check});");
        }
        let values: Vec<&str> = dynamic.iter().map(|(_, _, e)| e.as_str()).collect();
        let mut body = String::new();
        for (i, (kind, name, _)) in dynamic.iter().enumerate() {
            let a = self.write(el, kind, name, &format!("v[{i}]"), &format!("p[{i}]"));
            let _ = write!(body, " v[{i}] !== p[{i}] && {a};");
        }
        let check = if self.hydratable {
            let specs: Vec<String> = dynamic.iter().map(|(k, n, _)| js_string(&spec(k, n))).collect();
            format!(", {el}, [{}]", specs.join(", "))
        } else {
            String::new()
        };
        format!(
            "{bind}(() => [{}], (v, p = []) => {{{body} }}{check});",
            values.join(", ")
        )
    }

    // ---- values: children, components, fragments ------------------------------------------------------------

    /// A child as a value for `_$child` or a children array: text as a string, JSX lowered, expressions deferred.
    pub(super) fn kid_value(&mut self, k: &Kid<'_>) -> String {
        match k {
            Kid::Text(t) => js_string(&decode_entities(t)),
            Kid::El(e) => self.element(e),
            Kid::Frag(f) => self.fragment(f),
            Kid::Expr(e) => match e.get_inner_expression() {
                Expression::JSXElement(el) => self.element(el),
                Expression::JSXFragment(f) => self.fragment(f),
                inner if static_value(inner).is_some() => self.expr(inner),
                inner if has_jsx_branch(inner) => {
                    // `c ? <A/> : <B/>`, `c && <A/>`: the hole tracks the condition through a memo, so a change
                    // that leaves it the same doesn't rebuild the branch (research 19 §3).
                    let (test, rest) = self.condition(inner);
                    let memo = self.helper("memo");
                    format!(
                        "(() => {{ const _c = {memo}(() => {test}); return () => {}; }})()",
                        rest("_c()")
                    )
                }
                _ => {
                    let code = self.expr(e);
                    if self.is_key(&code) {
                        code
                    } else {
                        format!("() => ({code})")
                    }
                }
            },
        }
    }

    /// A conditional's test and a function from the test's reader to the whole expression. Nested conditionals with
    /// JSX branches read their tests through memos of their own.
    pub(super) fn condition(&mut self, e: &Expression<'_>) -> (String, Rest) {
        match e {
            Expression::ConditionalExpression(c) => {
                let test = self.expr(&c.test);
                let yes = self.branch(&c.consequent);
                let no = self.branch(&c.alternate);
                (test, Box::new(move |t| format!("{t} ? {yes} : {no}")))
            }
            Expression::LogicalExpression(l) => {
                let test = self.expr(&l.left);
                let right = self.branch(&l.right);
                let op = l.operator.as_str();
                (test, Box::new(move |t| format!("{t} {op} {right}")))
            }
            _ => unreachable!("has_jsx_branch only accepts conditionals"),
        }
    }

    pub(super) fn branch(&mut self, e: &Expression<'_>) -> String {
        let inner = e.get_inner_expression();
        if has_jsx_branch(inner) {
            let (test, rest) = self.condition(inner);
            let memo = self.helper("memo");
            return format!("({})", rest(&format!("{memo}(() => {test})()")));
        }
        // A fragment around one expression lowers to an arrow, which can't be the right side of `&&` bare.
        let code = self.expr(e);
        if matches!(inner, Expression::JSXFragment(_)) {
            format!("({code})")
        } else {
            code
        }
    }

    pub(super) fn fragment(&mut self, f: &JSXFragment<'_>) -> String {
        let code = self.fragment_value(f);
        self.explain(f.span, "<>".into(), &code);
        code
    }

    pub(super) fn fragment_value(&mut self, f: &JSXFragment<'_>) -> String {
        let kids = children(&f.children, self.text);
        match kids.len() {
            0 => "null".into(),
            1 => self.kid_value(&kids[0]),
            _ => {
                let vs: Vec<String> = kids.iter().map(|k| self.kid_value(k)).collect();
                format!("[{}]", vs.join(", "))
            }
        }
    }
}
