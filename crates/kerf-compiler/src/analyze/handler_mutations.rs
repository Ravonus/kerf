//! Join rendered reads with writes reachable from event handlers, using binding identities.

mod refresh;

use std::collections::{HashMap, HashSet};

use oxc_ast::ast::{
    ArrowFunctionBody, ArrowFunctionExpression, BindingPattern, CallExpression,
    ConditionalExpression, Expression, FormalParameters, Function, IdentifierReference,
    JSXAttribute, JSXAttributeName, JSXAttributeValue, JSXElementName, JSXExpressionContainer,
    JSXOpeningElement, ReturnStatement, Statement, VariableDeclaration, VariableDeclarationKind,
    VariableDeclarator,
};
use oxc_ast_visit::{Visit, walk};
use oxc_semantic::SymbolId;
use oxc_span::Span;
use oxc_syntax::scope::ScopeFlags;

use crate::diag::{Diagnostic, Severity};

use super::{Analyzer, SpanKey, binding_symbol, key, symbol_of};

#[derive(Clone, Copy, PartialEq, Eq, Hash)]
enum Target {
    Function(SpanKey),
    Binding(SymbolId),
}

#[derive(Default)]
struct Uses {
    writes: HashMap<SymbolId, Span>,
    reads: HashSet<SymbolId>,
    calls: Vec<Target>,
    renders: Vec<Target>,
    handlers: Vec<Target>,
    refreshes: HashMap<SymbolId, HashSet<SymbolId>>,
}

struct Scan<'x, 's> {
    a: &'x Analyzer<'s>,
    root: Uses,
    functions: HashMap<SpanKey, Uses>,
    bindings: HashMap<SymbolId, Target>,
    render_calls: HashMap<SpanKey, Vec<Target>>,
    locals: Vec<SymbolId>,
    current: Option<SpanKey>,
    reading: bool,
    event: bool,
    states: HashMap<SymbolId, SymbolId>,
    gates: Vec<SymbolId>,
    read_gates: HashMap<SymbolId, HashSet<SymbolId>>,
}

impl Scan<'_, '_> {
    fn uses(&mut self) -> &mut Uses {
        match self.current {
            Some(span) => self.functions.entry(span).or_default(),
            None => &mut self.root,
        }
    }

    fn targets(&self, expression: &Expression<'_>) -> Vec<Target> {
        match expression.get_inner_expression() {
            Expression::ArrowFunctionExpression(f) => vec![Target::Function(key(f.span))],
            Expression::FunctionExpression(f) => vec![Target::Function(key(f.span))],
            Expression::Identifier(id) => symbol_of(self.a.scoping, id)
                .map(|sym| vec![Target::Binding(sym)])
                .unwrap_or_default(),
            Expression::ConditionalExpression(c) => {
                let mut out = self.targets(&c.consequent);
                out.extend(self.targets(&c.alternate));
                out
            }
            Expression::LogicalExpression(l) => {
                let mut out = self.targets(&l.left);
                out.extend(self.targets(&l.right));
                out
            }
            _ => Vec::new(),
        }
    }

    fn bind(&mut self, sym: SymbolId, target: Target) {
        if !self.a.written(sym) {
            self.bindings.insert(sym, target);
        }
    }

    fn function(&mut self, span: Span, reading: bool, visit: impl FnOnce(&mut Self)) {
        let previous = (self.current, self.reading);
        let gates = std::mem::take(&mut self.gates);
        self.current = Some(key(span));
        self.reading = reading;
        self.uses();
        visit(self);
        (self.current, self.reading) = previous;
        self.gates = gates;
    }

    fn output_dependencies(&mut self, statements: &[Statement<'_>]) {
        if self.event {
            return;
        }
        let seeds = self.uses().reads.clone();
        let dependencies =
            super::handler_values::output_dependencies(statements, self.a.scoping, seeds);
        let mut renders = Vec::new();
        for call in dependencies.calls {
            if let Some(targets) = self.render_calls.get(&call) {
                renders.extend(targets.iter().copied());
            }
        }
        self.uses().reads.extend(dependencies.reads);
        self.uses().renders.extend(renders);
    }

    fn reachable(&self, roots: &[Target], render: bool) -> Vec<&Uses> {
        let mut pending = roots.to_vec();
        let mut seen = HashSet::new();
        let mut out = Vec::new();
        while let Some(target) = pending.pop() {
            if !seen.insert(target) {
                continue;
            }
            match target {
                Target::Binding(sym) => {
                    if let Some(target) = self.bindings.get(&sym) {
                        pending.push(*target);
                    }
                }
                Target::Function(span) => {
                    if let Some(uses) = self.functions.get(&span) {
                        pending.extend(if render { &uses.renders } else { &uses.calls });
                        out.push(uses);
                    }
                }
            }
        }
        out
    }
}

pub(super) fn event_attribute(name: &JSXAttributeName<'_>) -> bool {
    match name {
        JSXAttributeName::Identifier(n) => n
            .name
            .strip_prefix("on")
            .and_then(|name| name.chars().next())
            .is_some_and(|c| c.is_ascii_uppercase()),
        JSXAttributeName::NamespacedName(n) => n.namespace.name == "on",
    }
}

impl<'a> Visit<'a> for Scan<'_, '_> {
    fn visit_variable_declaration(&mut self, it: &VariableDeclaration<'a>) {
        if self.current.is_none() && it.kind == VariableDeclarationKind::Let {
            for declaration in &it.declarations {
                // W001 already explains a prop alias the compiler cannot keep live.
                if self.a.plan.aliases_refused.contains(&key(declaration.span)) {
                    continue;
                }
                for id in declaration.id.get_binding_identifiers() {
                    if let Some(sym) = binding_symbol(id)
                        && !self.a.boxes.contains(&sym)
                        && !self.a.plan.rewrites.contains_key(&sym)
                    {
                        self.locals.push(sym);
                    }
                }
            }
        }
        walk::walk_variable_declaration(self, it);
    }

    fn visit_variable_declarator(&mut self, it: &VariableDeclarator<'a>) {
        self.define_state(it);
        if let (BindingPattern::BindingIdentifier(id), Some(init)) = (&it.id, &it.init)
            && let Some(sym) = binding_symbol(id)
            && let [target] = self.targets(init).as_slice()
        {
            self.bind(sym, *target);
        }
        walk::walk_variable_declarator(self, it);
    }

    fn visit_function(&mut self, it: &Function<'a>, flags: ScopeFlags) {
        if let Some(sym) = it.id.as_ref().and_then(binding_symbol) {
            self.bind(sym, Target::Function(key(it.span)));
        }
        self.function(it.span, false, |scan| {
            walk::walk_function(scan, it, flags);
            if let Some(body) = &it.body {
                scan.output_dependencies(&body.statements);
            }
        });
    }

    fn visit_arrow_function_expression(&mut self, it: &ArrowFunctionExpression<'a>) {
        let expression = !matches!(&it.body, ArrowFunctionBody::FunctionBody(_));
        self.function(it.span, expression, |scan| {
            walk::walk_arrow_function_expression(scan, it);
            if let ArrowFunctionBody::FunctionBody(body) = &it.body {
                scan.output_dependencies(&body.statements);
            }
        });
    }

    fn visit_formal_parameters(&mut self, it: &FormalParameters<'a>) {
        let previous = self.reading;
        self.reading = false;
        walk::walk_formal_parameters(self, it);
        self.reading = previous;
    }

    fn visit_return_statement(&mut self, it: &ReturnStatement<'a>) {
        let previous = self.reading;
        self.reading = !self.event;
        walk::walk_return_statement(self, it);
        self.reading = previous;
    }

    fn visit_jsx_attribute(&mut self, it: &JSXAttribute<'a>) {
        // A ref binds an element; it does not render the local's current value.
        if matches!(&it.name, JSXAttributeName::Identifier(name) if name.name == "ref") {
            return;
        }
        let previous = (self.reading, self.event);
        if event_attribute(&it.name) {
            self.reading = false;
            self.event = true;
            if let Some(JSXAttributeValue::ExpressionContainer(value)) = &it.value
                && let Some(expression) = value.expression.as_expression()
            {
                let targets = self.targets(expression);
                self.uses().handlers.extend(targets);
            }
        }
        walk::walk_jsx_attribute(self, it);
        (self.reading, self.event) = previous;
    }

    fn visit_jsx_expression_container(&mut self, it: &JSXExpressionContainer<'a>) {
        let previous = self.reading;
        self.reading = !self.event;
        walk::walk_jsx_expression_container(self, it);
        self.reading = previous;
    }

    fn visit_jsx_opening_element(&mut self, it: &JSXOpeningElement<'a>) {
        if !self.event
            && let JSXElementName::IdentifierReference(id) = &it.name
            && let Some(sym) = symbol_of(self.a.scoping, id)
        {
            self.uses().renders.push(Target::Binding(sym));
        }
        walk::walk_jsx_opening_element(self, it);
    }

    fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
        let Some(reference) = it
            .reference_id
            .get()
            .map(|id| self.a.scoping.get_reference(id))
        else {
            return;
        };
        let Some(sym) = reference.symbol_id() else {
            return;
        };
        let (read, write) = (reference.is_read(), reference.is_write());
        self.guard_read(sym, read);
        if write {
            self.uses().writes.entry(sym).or_insert(it.span);
        }
        if read && self.reading && !self.event {
            self.uses().reads.insert(sym);
        }
    }

    fn visit_conditional_expression(&mut self, it: &ConditionalExpression<'a>) {
        self.conditional(it);
    }

    fn visit_call_expression(&mut self, it: &CallExpression<'a>) {
        let mut calls = self.targets(&it.callee);
        let mut renders = calls.clone();
        if let Expression::StaticMemberExpression(member) = it.callee.get_inner_expression()
            && matches!(member.property.name.as_str(), "map" | "flatMap" | "forEach")
            && (matches!(
                member.object.get_inner_expression(),
                Expression::ArrayExpression(_)
            ) || self.a.plan.lists.contains_key(&key(it.span))
                || matches!(member.object.get_inner_expression(), Expression::Identifier(id)
                    if symbol_of(self.a.scoping, id).is_some_and(|sym| self.a.arrays.contains(&sym))))
            && let Some(callback) = it.arguments.first().and_then(|arg| arg.as_expression())
        {
            let targets = self.targets(callback);
            calls.extend(&targets);
            if member.property.name != "forEach" {
                renders.extend(targets);
            }
        }
        let reading = self.reading && !self.event;
        self.render_calls.insert(key(it.span), renders.clone());
        self.uses().calls.extend(calls);
        if reading {
            self.uses().renders.extend(renders);
        }
        walk::walk_call_expression(self, it);
    }
}

impl Analyzer<'_> {
    pub(super) fn handler_mutation_diagnostics(&mut self, statements: &[Statement<'_>]) {
        let mut scan = Scan {
            a: self,
            root: Uses::default(),
            functions: HashMap::new(),
            bindings: HashMap::new(),
            render_calls: HashMap::new(),
            locals: Vec::new(),
            current: None,
            reading: false,
            event: false,
            states: HashMap::new(),
            gates: Vec::new(),
            read_gates: HashMap::new(),
        };
        for statement in statements {
            scan.visit_statement(statement);
        }
        scan.output_dependencies(statements);
        scan.refreshes(statements);
        let mut reads = scan.root.reads.clone();
        let mut handlers = scan.root.handlers.clone();
        for uses in scan.reachable(&scan.root.renders, true) {
            reads.extend(&uses.reads);
            handlers.extend(&uses.handlers);
        }
        let mut writes: HashMap<SymbolId, Span> = HashMap::new();
        for uses in scan.reachable(&handlers, false) {
            for (&sym, &span) in &uses.writes {
                if scan.refreshed(uses, sym) {
                    continue;
                }
                let first = writes.entry(sym).or_insert(span);
                if span.start < first.start {
                    *first = span;
                }
            }
        }
        let mut diagnostics = Vec::new();
        for sym in &scan.locals {
            if reads.contains(sym)
                && let Some(span) = writes.get(sym)
            {
                let name = self.scoping.symbol_name(*sym);
                diagnostics.push(Diagnostic::new(
                    self.source,
                    "W041",
                    Severity::Error,
                    (span.start, span.end),
                    format!("`{name}` is a local `let` changed by an event handler and read in JSX; the rendered value never updates."),
                    format!("Use `const {name} = state(initial)` from `@kerf/core`. Render `{name}.value` and update `{name}.value` in the handler instead of assigning the local."),
                ));
            }
        }
        self.plan.diagnostics.extend(diagnostics);
    }
}
