//! Scan for hydration.

use super::{
    ArrowFunctionExpression, Expression, Function, IdentifierReference, JSXAttribute,
    JSXAttributeName, JSXAttributeValue, JSXChild, JSXElement, JSXElementName, JSXFragment,
    ObjectPropertyKind, Scoping, Span, Visit, walk,
};

pub(super) fn component_tag(name: &JSXElementName<'_>) -> bool {
    matches!(
        name,
        JSXElementName::IdentifierReference(_) | JSXElementName::MemberExpression(_)
    ) || matches!(name, JSXElementName::Identifier(n) if n.name.starts_with(|c: char| c.is_ascii_uppercase()))
}

pub(super) fn is_handler(name: &str) -> bool {
    name == "ref"
        || (name.starts_with("on") && name[2..].starts_with(|c: char| c.is_ascii_uppercase()))
}

pub(super) fn attr_name(a: &JSXAttribute<'_>) -> String {
    match &a.name {
        JSXAttributeName::Identifier(id) => id.name.to_string(),
        JSXAttributeName::NamespacedName(n) => format!("{}:{}", n.namespace.name, n.name.name),
    }
}

/// Whether `span` reads only module-level names and globals, and whether it holds a function or JSX.
struct Closed<'s> {
    scoping: &'s Scoping,
    span: Span,
    reads_only_module: bool,
    code: bool,
}

impl<'a> Visit<'a> for Closed<'_> {
    fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
        let Some(sym) = it
            .reference_id
            .get()
            .and_then(|r| self.scoping.get_reference(r).symbol_id())
        else {
            return;
        };
        let at = self.scoping.symbol_span(sym);
        if self.scoping.symbol_scope_id(sym) != self.scoping.root_scope_id()
            && !(at.start >= self.span.start && at.end <= self.span.end)
        {
            self.reads_only_module = false;
        }
    }
    fn visit_arrow_function_expression(&mut self, it: &ArrowFunctionExpression<'a>) {
        self.code = true;
        walk::walk_arrow_function_expression(self, it);
    }
    fn visit_function(&mut self, it: &Function<'a>, flags: oxc_syntax::scope::ScopeFlags) {
        self.code = true;
        walk::walk_function(self, it, flags);
    }
    fn visit_jsx_element(&mut self, it: &JSXElement<'a>) {
        self.code = true;
        walk::walk_jsx_element(self, it);
    }
    fn visit_jsx_fragment(&mut self, it: &JSXFragment<'a>) {
        self.code = true;
        walk::walk_jsx_fragment(self, it);
    }
}

/// A value that reads the same on both sides: no calls, so `Date.now()` is the server's and travels.
fn plain_shape(e: &Expression<'_>) -> bool {
    match e.get_inner_expression() {
        Expression::Identifier(_)
        | Expression::StringLiteral(_)
        | Expression::NumericLiteral(_)
        | Expression::BooleanLiteral(_)
        | Expression::NullLiteral(_) => true,
        Expression::StaticMemberExpression(m) => plain_shape(&m.object),
        Expression::ArrayExpression(a) => a.elements.iter().all(|x| x.as_expression().is_some_and(plain_shape)),
        Expression::ObjectExpression(o) => o
            .properties
            .iter()
            .all(|p| matches!(p, ObjectPropertyKind::ObjectProperty(p) if !p.computed && plain_shape(&p.value))),
        _ => false,
    }
}

pub(super) fn attr_kind(scoping: &Scoping, a: &JSXAttribute<'_>) -> &'static str {
    let check = |visit: &dyn Fn(&mut Closed)| {
        let mut c = Closed {
            scoping,
            span: a.span,
            reads_only_module: true,
            code: false,
        };
        visit(&mut c);
        (c.reads_only_module, c.code)
    };
    let (closed, code, plain) = match &a.value {
        None | Some(JSXAttributeValue::StringLiteral(_)) => return "lit",
        Some(JSXAttributeValue::Element(el)) => {
            let (c, _) = check(&|v| v.visit_jsx_element(el));
            (c, true, false)
        }
        Some(JSXAttributeValue::Fragment(f)) => {
            let (c, _) = check(&|v| v.visit_jsx_fragment(f));
            (c, true, false)
        }
        Some(JSXAttributeValue::ExpressionContainer(c)) => {
            let Some(e) = c.expression.as_expression() else {
                return "lit";
            };
            if matches!(
                e.get_inner_expression(),
                Expression::StringLiteral(_)
                    | Expression::NumericLiteral(_)
                    | Expression::BooleanLiteral(_)
                    | Expression::NullLiteral(_)
            ) {
                return "lit";
            }
            let (closed, code) = check(&|v| v.visit_expression(e));
            (closed, code, plain_shape(e))
        }
    };
    match (code, closed) {
        (true, true) => "closed",
        (true, false) => "closure",
        // A handler that isn't written here is still a function, so it can't travel.
        (false, _) if is_handler(&attr_name(a)) => {
            if closed && plain {
                "closed"
            } else {
                "closure"
            }
        }
        (false, true) if plain => "closed",
        (false, _) => "value",
    }
}

pub(super) fn kids_closed(scoping: &Scoping, el: &JSXElement<'_>) -> bool {
    let mut c = Closed {
        scoping,
        span: el.span,
        reads_only_module: true,
        code: false,
    };
    for k in &el.children {
        c.visit_jsx_child(k);
    }
    c.reads_only_module
}

pub(super) fn has_kids(el: &JSXElement<'_>) -> bool {
    el.children.iter().any(|k| match k {
        JSXChild::Text(t) => !t.value.trim().is_empty(),
        JSXChild::ExpressionContainer(c) => c.expression.as_expression().is_some(),
        _ => true,
    })
}
