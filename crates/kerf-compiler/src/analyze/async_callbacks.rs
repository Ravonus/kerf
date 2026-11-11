//! Resolve reactive callbacks before checking their tracking and purity.
//! Only stable bindings and statically named core members have local provenance.
//! Nested functions are checked separately only when passed to a known core API.

mod copies;
mod flow;
mod loops;
mod patterns;
mod reads;
mod watch;
mod writes;

use std::collections::{HashMap, HashSet};

use oxc_ast::ast::{
    ArrowFunctionBody, ArrowFunctionExpression, BindingPattern, CallExpression, Expression,
    FormalParameters, Function, Program, VariableDeclarator,
};
use oxc_ast_visit::{Visit, walk};
use oxc_semantic::SymbolId;
use oxc_span::Span;
use oxc_syntax::scope::ScopeFlags;

use crate::diag::{Diagnostic, Severity};

use super::react::imported_value;
use super::{Analyzer, Rewrite, SpanKey, binding_symbol, is_component_name, key, symbol_of};

#[derive(Clone, Copy)]
enum Target {
    Function(SpanKey),
    Binding(SymbolId),
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Api {
    Derived,
    Resource,
    WatchSource,
    WatchCallback,
}

struct Call {
    api: Api,
    span: Span,
}

struct Index<'s> {
    a: &'s Analyzer<'s>,
    imports: HashMap<SymbolId, (String, String)>,
    bindings: HashMap<SymbolId, Target>,
    requests: HashMap<(SpanKey, usize), (Target, Call)>,
    boxes: HashSet<SymbolId>,
    props: HashSet<SymbolId>,
    pending_component: bool,
}

impl Index<'_> {
    fn stable(&self, sym: SymbolId) -> bool {
        !self.a.written(sym)
    }

    fn target(&self, expression: &Expression<'_>) -> Option<Target> {
        match expression.get_inner_expression() {
            Expression::Identifier(id) => symbol_of(self.a.scoping, id).map(Target::Binding),
            Expression::FunctionExpression(f) => Some(Target::Function(key(f.span))),
            Expression::ArrowFunctionExpression(f) => Some(Target::Function(key(f.span))),
            _ => None,
        }
    }

    fn box_call(&self, call: &CallExpression<'_>, sym: SymbolId) -> bool {
        if let Some((module, name)) = imported_value(&call.callee, self.a.scoping, &self.imports) {
            return (module == "@kerf-js/core" && matches!(name, "state" | "derived" | "resource"))
                || (module == "@kerf-js/core/browser" && self.a.boxes.contains(&sym));
        }
        matches!(call.callee.get_inner_expression(), Expression::StaticMemberExpression(m)
            if m.property.name == "linked" && imported_value(&m.object, self.a.scoping, &self.imports)
                .is_some_and(|(module, name)| module == "@kerf-js/core" && name == "state"))
    }

    fn component(&mut self, params: &FormalParameters<'_>) {
        if let Some(first) = params.items.first()
            && let BindingPattern::BindingIdentifier(id) = &first.pattern
            && let Some(sym) = binding_symbol(id)
        {
            self.props.insert(sym);
        }
    }

    fn resolve(&self, mut target: Target) -> Option<SpanKey> {
        let mut seen = HashSet::new();
        loop {
            match target {
                Target::Function(span) => return Some(span),
                Target::Binding(sym) => {
                    if !seen.insert(sym) {
                        return None;
                    }
                    target = *self.bindings.get(&sym)?;
                }
            }
        }
    }
}

impl<'a> Visit<'a> for Index<'_> {
    fn visit_variable_declarator(&mut self, it: &VariableDeclarator<'a>) {
        let previous = self.pending_component;
        self.pending_component = false;
        if let (BindingPattern::BindingIdentifier(id), Some(init)) = (&it.id, &it.init)
            && let Some(sym) = binding_symbol(id)
        {
            self.pending_component = is_component_name(id.name.as_str())
                && matches!(
                    init.get_inner_expression(),
                    Expression::FunctionExpression(_) | Expression::ArrowFunctionExpression(_)
                );
            if self.stable(sym) {
                if let Some(target) = self.target(init) {
                    self.bindings.insert(sym, target);
                }
                if let Some((module, name)) = imported_value(init, self.a.scoping, &self.imports) {
                    let value = (module.to_string(), name.to_string());
                    self.imports.insert(sym, value);
                }
                match init.get_inner_expression() {
                    Expression::CallExpression(call) if self.box_call(call, sym) => {
                        self.boxes.insert(sym);
                    }
                    Expression::Identifier(source) => {
                        if let Some(source) = symbol_of(self.a.scoping, source) {
                            if self.boxes.contains(&source) {
                                self.boxes.insert(sym);
                            }
                            if self.props.contains(&source) {
                                self.props.insert(sym);
                            }
                        }
                    }
                    _ => {}
                }
            }
        }
        walk::walk_variable_declarator(self, it);
        self.pending_component = previous;
    }

    fn visit_function(&mut self, it: &Function<'a>, flags: ScopeFlags) {
        let pending = std::mem::take(&mut self.pending_component);
        if it
            .id
            .as_ref()
            .map_or(pending, |id| is_component_name(id.name.as_str()))
        {
            self.component(&it.params);
        }
        if it.body.is_some()
            && let Some(sym) = it.id.as_ref().and_then(binding_symbol)
            && self.stable(sym)
        {
            self.bindings.insert(sym, Target::Function(key(it.span)));
        }
        walk::walk_function(self, it, flags);
    }

    fn visit_arrow_function_expression(&mut self, it: &ArrowFunctionExpression<'a>) {
        if std::mem::take(&mut self.pending_component) {
            self.component(&it.params);
        }
        walk::walk_arrow_function_expression(self, it);
    }

    fn visit_call_expression(&mut self, it: &CallExpression<'a>) {
        if let Some((module, name)) = imported_value(&it.callee, self.a.scoping, &self.imports)
            && module == "@kerf-js/core"
        {
            let apis: &[Api] = match name {
                "derived" => &[Api::Derived],
                "resource" => &[Api::Resource],
                "watch" => &[Api::WatchSource, Api::WatchCallback],
                _ => &[],
            };
            for (argument, &api) in apis.iter().enumerate() {
                if let Some(target) = it
                    .arguments
                    .get(argument)
                    .and_then(|arg| arg.as_expression())
                    .and_then(|expression| self.target(expression))
                {
                    self.requests.insert(
                        (key(it.span), argument),
                        (target, Call { api, span: it.span }),
                    );
                }
            }
        }
        walk::walk_call_expression(self, it);
    }
}

struct Check<'s> {
    index: Index<'s>,
    calls: HashMap<SpanKey, Vec<Call>>,
    accesses: HashMap<SpanKey, watch::Accesses>,
    diagnostics: Vec<Diagnostic>,
}

impl Check<'_> {
    fn callback(
        &mut self,
        span: Span,
        asynchronous: bool,
        inspect: impl FnOnce(&mut reads::Flow<'_, '_>),
    ) {
        let Some(calls) = self.calls.get(&key(span)) else {
            return;
        };
        if asynchronous {
            for call in calls.iter().filter(|call| call.api == Api::Derived) {
                self.diagnostics.push(Diagnostic::new(
                    self.index.a.source, "W012", Severity::Error, (call.span.start, call.span.end),
                    "An async `derived` callback returns a promise; derived tracking is synchronous.",
                    "Use `resource(async () => …)` for async work and read its `.value`. Capture reactive \
                     props/state before the first `await`, then use those locals afterwards.",
                ));
            }
        }
        let derived = calls.iter().any(|call| call.api == Api::Derived);
        let resource = calls.iter().any(|call| call.api == Api::Resource);
        let mut flow = reads::Flow::new(&self.index, derived, resource);
        if calls
            .iter()
            .any(|call| matches!(call.api, Api::WatchSource | Api::WatchCallback))
        {
            flow.watch = Some(watch::Accesses::default());
        }
        inspect(&mut flow);
        if let Some(accesses) = flow.watch {
            self.accesses.insert(key(span), accesses);
        }
        self.diagnostics.extend(flow.diagnostics);
    }
}

impl<'a> Visit<'a> for Check<'_> {
    fn visit_function(&mut self, it: &Function<'a>, flags: ScopeFlags) {
        if let Some(body) = &it.body {
            self.callback(it.span, it.r#async, |flow| flow.visit_function_body(body));
        }
        walk::walk_function(self, it, flags);
    }

    fn visit_arrow_function_expression(&mut self, it: &ArrowFunctionExpression<'a>) {
        self.callback(it.span, it.r#async, |flow| match &it.body {
            ArrowFunctionBody::FunctionBody(body) => flow.visit_function_body(body),
            body => {
                if let Some(expression) = body.as_expression() {
                    flow.visit_expression(expression);
                }
            }
        });
        walk::walk_arrow_function_expression(self, it);
    }
}

pub(super) fn diagnostics<'s>(program: &Program<'_>, a: &'s Analyzer<'s>) -> Vec<Diagnostic> {
    let mut index = Index {
        a,
        imports: a.react_imports.clone(),
        bindings: HashMap::new(),
        requests: HashMap::new(),
        boxes: HashSet::new(),
        props: a
            .plan
            .rewrites
            .iter()
            .filter(|(_, rewrite)| matches!(rewrite, Rewrite::Rest { .. }))
            .map(|(&sym, _)| sym)
            .collect(),
        pending_component: false,
    };
    for _ in 0..=a.scoping.symbol_ids().count() {
        let before = (
            index.imports.len(),
            index.bindings.len(),
            index.requests.len(),
            index.boxes.len(),
            index.props.len(),
        );
        index.visit_program(program);
        if before
            == (
                index.imports.len(),
                index.bindings.len(),
                index.requests.len(),
                index.boxes.len(),
                index.props.len(),
            )
        {
            break;
        }
    }
    let mut calls: HashMap<SpanKey, Vec<Call>> = HashMap::new();
    for (target, call) in index.requests.values() {
        if let Some(span) = index.resolve(*target) {
            calls.entry(span).or_default().push(Call {
                api: call.api,
                span: call.span,
            });
        }
    }
    for list in calls.values_mut() {
        list.sort_by_key(|call| call.span.start);
    }
    let mut check = Check {
        index,
        calls,
        accesses: HashMap::new(),
        diagnostics: Vec::new(),
    };
    check.visit_program(program);
    check.diagnostics.extend(watch::diagnostics(
        &check.index,
        &check.calls,
        &check.accesses,
    ));
    let copies = copies::diagnostics(program, &check.index, &check.calls);
    check.diagnostics.extend(copies);
    check.diagnostics
}
