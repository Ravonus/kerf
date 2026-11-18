//! Keyed-list analysis and diagnostics.

use oxc_ast::ast::{
    BindingPattern, CallExpression, Expression, IdentifierReference, JSXAttributeItem,
    JSXAttributeValue, JSXElement,
};
use oxc_ast_visit::Visit;
use oxc_semantic::{Scoping, SymbolId};
use oxc_span::{GetSpan, Span};

use crate::diag::{Diagnostic, Edit, Fix, Severity, line_col};
use crate::project::KeyedProp;

use super::{
    Analyzer, ListPlan, MemberUse, Rewrite, RowStep, binding_symbol, chain_root_member,
    is_key_attr, key, params_of, returned, row_roots, static_key, symbol_of,
};

impl Analyzer<'_> {
    /// Every name `pattern` binds in a keyed-list row, as a live path from `_item()`. W019 for what a path can't say.
    pub(super) fn bind_row(
        &mut self,
        pattern: &BindingPattern<'_>,
        path: &mut Vec<RowStep>,
        plan: &mut ListPlan,
    ) {
        match pattern {
            BindingPattern::BindingIdentifier(id) => {
                if let Some(sym) = binding_symbol(id) {
                    self.plan
                        .rewrites
                        .insert(sym, Rewrite::AccessorPath { path: path.clone() });
                    plan.item_syms.push(sym);
                }
            }
            BindingPattern::ObjectPattern(obj) => {
                for p in &obj.properties {
                    let Some(k) = static_key(&p.key) else {
                        self.row_pattern_error(p.span);
                        continue;
                    };
                    path.push(RowStep::Key(k));
                    self.bind_row(&p.value, path, plan);
                    path.pop();
                }
                if let Some(rest) = &obj.rest {
                    self.row_pattern_error(rest.span);
                }
            }
            BindingPattern::ArrayPattern(arr) => {
                for (index, el) in arr.elements.iter().enumerate() {
                    if let Some(el) = el {
                        path.push(RowStep::Index(index as u32));
                        self.bind_row(el, path, plan);
                        path.pop();
                    }
                }
                if let Some(rest) = &arr.rest {
                    path.push(RowStep::From(arr.elements.len() as u32));
                    self.bind_row(&rest.argument, path, plan);
                    path.pop();
                }
            }
            BindingPattern::AssignmentPattern(p) => self.row_pattern_error(p.span),
        }
    }

    pub(super) fn row_pattern_error(&mut self, span: Span) {
        self.plan.diagnostics.push(Diagnostic::new(
            self.source,
            "W019",
            Severity::Error,
            (span.start, span.end),
            "A keyed-list row can't destructure a default, an object rest or a computed key: the name would have no value.".to_string(),
            "Take the item as one parameter and read from it: `row => <li>{row.a ?? 1}</li>`.".to_string(),
        ));
    }

    pub(super) fn analyze_list(&mut self, call: &CallExpression<'_>, cb: &Expression<'_>) {
        let (ret, early, early_jsx) = returned(cb);
        if !early_jsx && !ret.is_some_and(returns_jsx) {
            return;
        }
        if early {
            self.plan.diagnostics.push(Diagnostic::new(
                self.source,
                "W013",
                Severity::Error,
                (cb.span().start, cb.span().end),
                "Early `return` inside a list callback: rows can't appear or disappear from inside the row.",
                "Filter the list first (`xs.filter(…).map(…)`), then render every item.",
            ));
            return;
        }
        if self.fixed_list(call, cb) {
            return;
        }
        let mut plan = ListPlan::default();
        let params = params_of(cb);
        let mut item_name = None;
        let mut item_sym = None;
        let mut destructured = false;
        if let Some(p0) = params.items.first() {
            match &p0.pattern {
                BindingPattern::BindingIdentifier(id) => {
                    item_name = Some(id.name.to_string());
                    if let Some(sym) = binding_symbol(id) {
                        self.plan.rewrites.insert(sym, Rewrite::Accessor);
                        plan.item_syms.push(sym);
                        item_sym = Some(sym);
                    }
                }
                pattern @ (BindingPattern::ObjectPattern(_) | BindingPattern::ArrayPattern(_)) => {
                    destructured = true;
                    self.plan.destructured_rows.insert(key(cb.span()));
                    self.bind_row(pattern, &mut Vec::new(), &mut plan);
                }
                _ => {}
            }
        }
        if let Some(BindingPattern::BindingIdentifier(id)) = params.items.get(1).map(|p| &p.pattern)
            && let Some(sym) = binding_symbol(id)
        {
            self.plan.rewrites.insert(sym, Rewrite::Accessor);
            plan.item_syms.push(sym);
        }
        let root = ret.and_then(root_element);
        if !self.list_keys(ret, cb, call.arguments.len() == 1, &mut plan) {
            for sym in plan.item_syms {
                self.plan.rewrites.remove(&sym);
            }
            self.plan.destructured_rows.remove(&key(cb.span()));
            return;
        }
        if plan.key_attrs.is_empty() {
            self.missing_key_diagnostic(
                call,
                cb,
                root,
                item_sym,
                item_name.as_deref(),
                destructured,
            );
        }
        self.entry_reads(cb, &plan.item_syms);
        if let Expression::StaticMemberExpression(m) = &call.callee
            && let Some((root, member)) = chain_root_member(&m.object)
            && let Some(sym) = symbol_of(self.scoping, root)
        {
            self.list_sources.push((sym, call.span));
            self.keyed_prop(sym, member, call.span);
        }
        self.plan.lists.insert(key(call.span), plan);
    }

    fn list_keys(
        &mut self,
        ret: Option<&Expression<'_>>,
        cb: &Expression<'_>,
        one_arg: bool,
        plan: &mut ListPlan,
    ) -> bool {
        let mut roots = Vec::new();
        if let Some(ret) = ret {
            row_roots(ret, &mut roots);
        }
        let mut keys = Vec::new();
        for el in &roots {
            for a in el
                .opening_element
                .attributes
                .iter()
                .filter(|a| is_key_attr(a))
            {
                let JSXAttributeItem::Attribute(attr) = a else {
                    continue;
                };
                keys.push(attr);
            }
        }
        plan.key_attrs = keys.iter().map(|attr| key(attr.span)).collect();
        let Some(first) = keys.first() else {
            return true;
        };
        let text = |v: Option<&JSXAttributeValue<'_>>| v.map_or("", |v| self.text(v.span()));
        let first_text = text(first.value.as_ref());
        if let Some(other) = keys
            .iter()
            .find(|attr| text(attr.value.as_ref()) != first_text)
        {
            let other_text = text(other.value.as_ref());
            self.plan.diagnostics.push(Diagnostic::new(
                self.source,
                "W010",
                Severity::Error,
                (other.span.start, other.span.end),
                format!("The row's roots are keyed differently (`{first_text}` and `{other_text}`): a row has one key."),
                format!("Key every branch by the same field (`key={first_text}`)."),
            ));
            return false;
        }
        if let Some(JSXAttributeValue::ExpressionContainer(value)) = &first.value
            && let Some(expr) = value.expression.as_expression()
            && key_uses_row_local(self.scoping, cb, expr, &plan.item_syms)
        {
            if !one_arg
                || ret.is_none_or(|ret| root_element(ret).is_none())
                || !scoped_row_signature(cb)
            {
                self.plan.diagnostics.push(Diagnostic::new(
                    self.source,
                    "W009",
                    Severity::Error,
                    (first.span.start, first.span.end),
                    "A list key that uses a callback local needs one returned JSX element and a synchronous item/index callback with no `thisArg`.",
                    "Use a keyed wrapper element and capture context in a closure, or take the key directly from the item or index.",
                ));
                return false;
            }
            plan.scoped_key = true;
        }
        true
    }

    fn missing_key_diagnostic(
        &mut self,
        call: &CallExpression<'_>,
        cb: &Expression<'_>,
        root: Option<&JSXElement<'_>>,
        item_sym: Option<SymbolId>,
        item_name: Option<&str>,
        destructured: bool,
    ) {
        let mut uses = MemberUse {
            scoping: self.scoping,
            sym: item_sym,
            props: Vec::new(),
        };
        uses.visit_expression(cb);
        if destructured || !uses.props.is_empty() {
            let span = call.span;
            let mut d = Diagnostic::new(
                self.source,
                "W010",
                Severity::Error,
                (span.start, span.end),
                "List over objects without a `key`: rows can't keep their identity when the list changes.",
                "Add `key={item.id}` (a stable, unique field) to the row's root element.",
            );
            if let (Some(el), Some(name), true) =
                (root, item_name, uses.props.iter().any(|p| p == "id"))
            {
                let at = el.opening_element.name.span().end;
                d = d.with_fix(Fix {
                    description: format!("Key rows by `{name}.id`"),
                    safe: true,
                    edits: vec![Edit {
                        start: at,
                        end: at,
                        text: format!(" key={{{name}.id}}"),
                    }],
                });
            }
            self.plan.diagnostics.push(d);
        }
    }

    /// A list over a top-level `const` made here as an array (`[…]`, `Array.from(…)`, `new Array(…)`) with no keys:
    /// nothing re-reads it, so `For` could never run twice and the plain `.map` is the same page.
    pub(super) fn fixed_list(&self, call: &CallExpression<'_>, cb: &Expression<'_>) -> bool {
        let Expression::StaticMemberExpression(m) = &call.callee else {
            return false;
        };
        let Expression::Identifier(id) = m.object.without_parentheses() else {
            return false;
        };
        let Some(sym) = symbol_of(self.scoping, id) else {
            return false;
        };
        let (ret, _, _) = returned(cb);
        let mut roots = Vec::new();
        if let Some(ret) = ret {
            row_roots(ret, &mut roots);
        }
        self.scoping.symbol_scope_id(sym) == self.scoping.root_scope_id()
            && !self
                .scoping
                .get_resolved_references(sym)
                .any(oxc_semantic::Reference::is_write)
            && self.arrays.contains(&sym)
            && !roots
                .iter()
                .any(|el| el.opening_element.attributes.iter().any(is_key_attr))
    }

    /// Facts for the project view: a list keyed over a prop of an enclosing component (`items.map` or
    /// `props.items.map`).
    pub(super) fn keyed_prop(&mut self, sym: SymbolId, member: Option<&str>, span: Span) {
        let prop = match self.plan.rewrites.get(&sym) {
            Some(Rewrite::Prop { path, .. }) if path.len() == 1 => Some(path[0].clone()),
            _ => None,
        };
        let Some(comp) = self.comps.iter().rev().find(|c| c.prop_syms.contains(&sym)) else {
            return;
        };
        let prop = prop.or_else(|| {
            (comp.props_param == Some(sym))
                .then(|| member.map(String::from))
                .flatten()
        });
        if let (Some(component), Some(prop)) = (comp.name.clone(), prop) {
            let (line, _) = line_col(self.source, span.start);
            self.plan.facts.keyed_props.push(KeyedProp {
                component,
                prop,
                line,
            });
        }
    }
}

fn scoped_row_signature(cb: &Expression<'_>) -> bool {
    let sync = match cb {
        Expression::ArrowFunctionExpression(f) => !f.r#async,
        Expression::FunctionExpression(f) => !f.r#async && !f.generator,
        _ => false,
    };
    let params = params_of(cb);
    sync && params.rest.is_none()
        && match params.items.as_slice() {
            [] => true,
            [item] => !matches!(item.pattern, BindingPattern::AssignmentPattern(_)),
            [item, index] => {
                !matches!(item.pattern, BindingPattern::AssignmentPattern(_))
                    && matches!(index.pattern, BindingPattern::BindingIdentifier(_))
            }
            _ => false,
        }
}

fn key_uses_row_local(
    scoping: &Scoping,
    cb: &Expression<'_>,
    expr: &Expression<'_>,
    items: &[SymbolId],
) -> bool {
    if matches!(cb, Expression::ArrowFunctionExpression(f) if f.body.as_expression().is_some()) {
        return false;
    }
    let mut reads = KeyReads {
        scoping,
        callback: cb.span(),
        expr: expr.span(),
        items,
        local: false,
    };
    reads.visit_expression(expr);
    reads.local
}

struct KeyReads<'a> {
    scoping: &'a Scoping,
    callback: Span,
    expr: Span,
    items: &'a [SymbolId],
    local: bool,
}

impl<'a> Visit<'a> for KeyReads<'_> {
    fn visit_identifier_reference(&mut self, id: &IdentifierReference<'a>) {
        if let Some(sym) = symbol_of(self.scoping, id) {
            let binding = self.scoping.symbol_span(sym);
            self.local |= self.callback.contains_inclusive(binding)
                && !self.expr.contains_inclusive(binding)
                && !self.items.contains(&sym);
        }
    }
}

pub(super) fn returns_jsx(e: &Expression<'_>) -> bool {
    match e.without_parentheses() {
        Expression::JSXElement(_) | Expression::JSXFragment(_) => true,
        Expression::ConditionalExpression(c) => {
            returns_jsx(&c.consequent) || returns_jsx(&c.alternate)
        }
        Expression::LogicalExpression(l) => returns_jsx(&l.right),
        _ => false,
    }
}

fn root_element<'b, 'a>(e: &'b Expression<'a>) -> Option<&'b JSXElement<'a>> {
    match e.without_parentheses() {
        Expression::JSXElement(el) => Some(el),
        _ => None,
    }
}
