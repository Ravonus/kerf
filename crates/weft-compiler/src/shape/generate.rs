//! Generate placeholders and preserved expressions for shape variants.

use std::collections::HashSet;

use oxc_ast::ast::{
    Argument, BindingPattern, CallExpression, ChainElement, Expression, LogicalOperator, Statement,
};
use oxc_ast_visit::Visit;
use oxc_semantic::SymbolId;
use oxc_span::GetSpan;

use super::{BAR, Bindings, Gen, Reads, arrow_body, has_jsx, returned, strip};

impl Gen<'_> {
    pub(super) fn reads(&self, e: &Expression<'_>) -> Vec<SymbolId> {
        let mut v = Reads {
            scoping: self.scoping,
            within: e.span(),
            syms: Vec::new(),
        };
        v.visit_expression(e);
        v.syms
    }

    /// Everything `e` reads is kept: placeholders, module scope, or a global.
    pub(super) fn ok(&self, e: &Expression<'_>, allowed: &HashSet<SymbolId>) -> bool {
        let root = self.scoping.root_scope_id();
        self.reads(e)
            .iter()
            .all(|s| allowed.contains(s) || self.scoping.symbol_scope_id(*s) == root)
    }

    pub(super) fn print(e: &Expression<'_>) -> String {
        let mut c = oxc_codegen::Codegen::new();
        c.print_expression(e);
        c.into_source_text()
    }

    pub(super) fn pattern(&self, p: &BindingPattern<'_>) -> String {
        let s = p.span();
        self.source[s.start as usize..s.end as usize].to_string()
    }

    pub(super) fn bar(read: Option<String>) -> String {
        match read {
            Some(e) => format!("{BAR}{{$$st(() => ({e}))}}</span>"),
            None => format!("{BAR}{{$$st()}}</span>"),
        }
    }

    /// A value in a child position, as a JS expression.
    pub(super) fn value(&mut self, e: &Expression<'_>, allowed: &HashSet<SymbolId>) -> String {
        let e = strip(e);
        match e {
            Expression::JSXElement(el) => self.element(el, allowed),
            Expression::JSXFragment(f) => format!("<>{}</>", self.kids(&f.children, allowed)),
            Expression::NullLiteral(_) | Expression::BooleanLiteral(_) => "null".into(),
            Expression::StringLiteral(_)
            | Expression::NumericLiteral(_)
            | Expression::TemplateLiteral(_)
                if self.ok(e, allowed) =>
            {
                Self::print(e)
            }
            Expression::Identifier(i) if i.name == "undefined" => "null".into(),
            Expression::ConditionalExpression(c)
                if has_jsx(&c.consequent) || has_jsx(&c.alternate) =>
            {
                if self.ok(&c.test, allowed) {
                    format!(
                        "({} ? {} : {})",
                        Self::print(&c.test),
                        self.value(&c.consequent, allowed),
                        self.value(&c.alternate, allowed)
                    )
                } else if matches!(strip(&c.consequent), Expression::NullLiteral(_)) {
                    self.value(&c.alternate, allowed)
                } else {
                    self.value(&c.consequent, allowed)
                }
            }
            Expression::LogicalExpression(l)
                if has_jsx(&l.right) && l.operator == LogicalOperator::And =>
            {
                if self.ok(&l.left, allowed) {
                    format!(
                        "({} && {})",
                        Self::print(&l.left),
                        self.value(&l.right, allowed)
                    )
                } else {
                    self.value(&l.right, allowed)
                }
            }
            Expression::ChainExpression(c) => match &c.expression {
                ChainElement::CallExpression(call) => self.call(call, e, allowed),
                _ => self.text(e, allowed),
            },
            Expression::CallExpression(call) => self.call(call, e, allowed),
            _ => self.text(e, allowed),
        }
    }

    pub(super) fn text(&self, e: &Expression<'_>, allowed: &HashSet<SymbolId>) -> String {
        let ok = self.ok(e, allowed);
        let children = match e {
            Expression::Identifier(i) => i.name == "children",
            Expression::StaticMemberExpression(m) => m.property.name == "children",
            _ => false,
        };
        match (children, ok) {
            (true, true) => Self::print(e), // a layout's children are variants already
            (true, false) => "null".into(),
            (false, ok) => Self::bar(ok.then(|| Self::print(e))),
        }
    }

    /// `xs.map(x => <li />)`: the same `.map`, with the variant of its body.
    pub(super) fn call(
        &mut self,
        call: &CallExpression<'_>,
        whole: &Expression<'_>,
        allowed: &HashSet<SymbolId>,
    ) -> String {
        let list = match &call.callee {
            Expression::StaticMemberExpression(m) if m.property.name == "map" => Some(&m.object),
            _ => None,
        };
        let cb = call
            .arguments
            .first()
            .and_then(Argument::as_expression)
            .map(strip);
        let (Some(list), Some(cb)) = (list, cb) else {
            return self.text(whole, allowed);
        };
        let (params, statements, expression) = match cb {
            Expression::ArrowFunctionExpression(f) => {
                let (s, x) = arrow_body(f);
                (&f.params, s, x)
            }
            Expression::FunctionExpression(f) => match &f.body {
                Some(b) => (&f.params, &b.statements[..], None),
                None => return self.text(whole, allowed),
            },
            _ => return self.text(whole, allowed),
        };
        if !self.ok(list, allowed) {
            return self.text(whole, allowed);
        }
        let mut inner = allowed.clone();
        let names: Vec<_> = params
            .items
            .iter()
            .map(|p| self.pattern(&p.pattern))
            .collect();
        let mut b = Bindings::default();
        b.visit_formal_parameters(params);
        inner.extend(b.0);
        let Some(body) = self.body(statements, expression, &mut inner) else {
            return self.text(whole, allowed);
        };
        format!(
            "({})?.map(({}) => {{ {body} }})",
            Self::print(list),
            names.join(", ")
        )
    }

    /// The statements a variant keeps and its `return`.
    pub(super) fn body(
        &mut self,
        statements: &[Statement<'_>],
        expression: Option<&Expression<'_>>,
        allowed: &mut HashSet<SymbolId>,
    ) -> Option<String> {
        let ret = returned(statements, expression)?;
        // Which locals the result needs, back to front.
        let mut needed: HashSet<SymbolId> = self.reads(ret).into_iter().collect();
        let mut keep = vec![false; statements.len()];
        for (i, s) in statements.iter().enumerate().rev() {
            let Some((sym, init)) = Self::local(s) else {
                continue;
            };
            if needed.contains(&sym) {
                keep[i] = true;
                needed.extend(self.reads(init));
            }
        }
        let mut out = String::new();
        for (i, s) in statements.iter().enumerate() {
            let Some((sym, init)) = Self::local(s).filter(|_| keep[i]) else {
                continue;
            };
            let Statement::VariableDeclaration(d) = s else {
                continue;
            };
            let name = self.pattern(&d.declarations[0].id);
            if let Some(line) = self.keep(&name, init, allowed) {
                out.push_str(&line);
                allowed.insert(sym);
            }
        }
        let v = self.value(ret, allowed);
        Some(format!("{out}return {v};"))
    }

    pub(super) fn local<'b, 'a>(s: &'b Statement<'a>) -> Option<(SymbolId, &'b Expression<'a>)> {
        let Statement::VariableDeclaration(d) = s else {
            return None;
        };
        let [one] = d.declarations.as_slice() else {
            return None;
        };
        let BindingPattern::BindingIdentifier(id) = &one.id else {
            return None;
        };
        Some((id.symbol_id.get()?, one.init.as_ref()?))
    }

    /// One setup line in a variant, or None to drop it.
    pub(super) fn keep(
        &self,
        name: &str,
        init: &Expression<'_>,
        allowed: &HashSet<SymbolId>,
    ) -> Option<String> {
        let root = self.scoping.root_scope_id();
        if let Expression::CallExpression(c) = strip(init) {
            if let Expression::Identifier(id) = &c.callee {
                let sym = id
                    .reference_id
                    .get()
                    .and_then(|r| self.scoping.get_reference(r).symbol_id());
                match sym.and_then(|s| self.weft.get(&s)).map(String::as_str) {
                    Some("derived") => {
                        return self
                            .ok(init, allowed)
                            .then(|| format!("const {name} = {};", Self::print(init)));
                    }
                    Some("resource") => {
                        let by = match c.arguments.first().and_then(Argument::as_expression) {
                            Some(e @ Expression::Identifier(id)) if self.ok(e, allowed) => {
                                id.name.to_string()
                            }
                            _ => String::new(),
                        };
                        return Some(format!("const {name} = $$sr({by});"));
                    }
                    Some(_) => return None,
                    None => {}
                }
                if sym.is_none_or(|s| self.scoping.symbol_scope_id(s) == root) {
                    return Some(format!("const {name} = $$sr({});", id.name));
                }
            }
            return None;
        }
        self.ok(init, allowed)
            .then(|| format!("const {name} = {};", Self::print(init)))
    }
}
