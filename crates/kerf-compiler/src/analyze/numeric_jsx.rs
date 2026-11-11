//! Check only value positions that can pass a numeric conjunction's zero to JSX.

use std::collections::{HashMap, HashSet};

use oxc_ast::ast::{
    ArrowFunctionBody, ArrowFunctionExpression, BindingPattern, CallExpression, Expression,
    Function, JSXAttribute, JSXAttributeName, JSXAttributeValue, JSXChild, Program,
    ReturnStatement, VariableDeclarator,
};
use oxc_ast_visit::{Visit, walk};
use oxc_semantic::{Scoping, SymbolId};
use oxc_span::GetSpan;
use oxc_syntax::{operator::LogicalOperator, scope::ScopeFlags};

use crate::diag::{Diagnostic, Edit, Fix, Severity};

use super::handler_mutations::event_attribute;
use super::numeric_facts::{Facts, Kind, collect};
use super::{SpanKey, binding_symbol, is_component_name, key, symbol_of};

struct Callbacks<'x, 's> {
    facts: &'x Facts<'s>,
    scoping: &'s Scoping,
    callback: bool,
    functions: HashMap<SymbolId, SpanKey>,
    references: HashMap<SymbolId, (usize, usize)>,
}

impl<'a> Visit<'a> for Callbacks<'_, '_> {
    fn visit_jsx_attribute(&mut self, it: &JSXAttribute<'a>) {
        let previous = self.callback;
        self.callback |= event_attribute(&it.name)
            || matches!(&it.name, JSXAttributeName::Identifier(name) if name.name == "ref");
        walk::walk_jsx_attribute(self, it);
        self.callback = previous;
    }

    fn visit_call_expression(&mut self, it: &CallExpression<'a>) {
        let previous = self.callback;
        self.callback |= matches!(self.facts.core_call(it), Some("watch" | "onCleanup"));
        walk::walk_call_expression(self, it);
        self.callback = previous;
    }

    fn visit_identifier_reference(&mut self, it: &oxc_ast::ast::IdentifierReference<'a>) {
        if let Some(sym) = symbol_of(self.scoping, it) {
            let (all, callbacks) = self.references.entry(sym).or_default();
            *all += 1;
            *callbacks += usize::from(self.callback);
        }
    }

    fn visit_function(&mut self, it: &Function<'a>, flags: ScopeFlags) {
        if let Some(sym) = it.id.as_ref().and_then(binding_symbol) {
            self.functions.insert(sym, key(it.span));
        }
        walk::walk_function(self, it, flags);
    }

    fn visit_variable_declarator(&mut self, it: &VariableDeclarator<'a>) {
        if let (BindingPattern::BindingIdentifier(id), Some(init)) = (&it.id, &it.init)
            && let Some(sym) = binding_symbol(id)
            && matches!(
                init.get_inner_expression(),
                Expression::FunctionExpression(_) | Expression::ArrowFunctionExpression(_)
            )
        {
            self.functions
                .insert(sym, key(init.get_inner_expression().span()));
        }
        walk::walk_variable_declarator(self, it);
    }
}

fn callback_functions(
    program: &Program<'_>,
    scoping: &Scoping,
    facts: &Facts<'_>,
) -> HashSet<SpanKey> {
    let mut scan = Callbacks {
        facts,
        scoping,
        callback: false,
        functions: HashMap::new(),
        references: HashMap::new(),
    };
    scan.visit_program(program);
    scan.functions
        .into_iter()
        .filter(|(sym, _)| {
            scan.references
                .get(sym)
                .is_some_and(|&(all, callbacks)| all > 0 && all == callbacks)
        })
        .map(|(_, span)| span)
        .collect()
}

struct Check<'s> {
    source: &'s str,
    facts: Facts<'s>,
    diagnostics: Vec<Diagnostic>,
    reported: HashSet<SpanKey>,
    suppressed: bool,
    component: bool,
    pending_component: bool,
    callbacks: HashSet<SpanKey>,
}

impl Check<'_> {
    fn conjunction(&mut self, left: &Expression<'_>) {
        let span = left.span();
        if self.facts.kind(left) != Some(Kind::Number) || !self.reported.insert(key(span)) {
            return;
        }
        let text = &self.source[span.start as usize..span.end as usize];
        self.diagnostics.push(
            Diagnostic::new(
                self.source,
                "W011",
                Severity::Error,
                (span.start, span.end),
                format!("`{text}` is numeric: when it is 0, this JSX conjunction renders 0."),
                format!(
                    "Use `!!({text})` to keep the same truthiness, including negative numbers. \
                For a nonnegative length, a comparison such as `items.length > 0` also hides zero."
                ),
            )
            .with_fix(Fix {
                description: "Make the guard boolean without repeating its evaluation".into(),
                safe: true,
                edits: vec![Edit {
                    start: span.start,
                    end: span.end,
                    text: format!("!!({text})"),
                }],
            }),
        );
    }

    fn rendered(&mut self, expression: &Expression<'_>) {
        if self.suppressed {
            return;
        }
        match expression.get_inner_expression() {
            Expression::LogicalExpression(logical) => {
                if logical.operator == LogicalOperator::And {
                    self.conjunction(&logical.left);
                }
                // OR replaces a falsy left value, so its left-hand zero cannot leak to the result.
                if logical.operator != LogicalOperator::Or {
                    self.rendered(&logical.left);
                }
                self.rendered(&logical.right);
            }
            Expression::ConditionalExpression(c) => {
                self.rendered(&c.consequent);
                self.rendered(&c.alternate);
            }
            Expression::SequenceExpression(sequence) => {
                if let Some(last) = sequence.expressions.last() {
                    self.rendered(last);
                }
            }
            Expression::ArrayExpression(array) => {
                for element in &array.elements {
                    if let Some(value) = element.as_expression() {
                        self.rendered(value);
                    }
                }
            }
            Expression::CallExpression(call) => {
                if let Expression::StaticMemberExpression(member) =
                    call.callee.get_inner_expression()
                    && matches!(member.property.name.as_str(), "map" | "flatMap")
                    && let Some(callback) =
                        call.arguments.first().and_then(|arg| arg.as_expression())
                {
                    self.callback(callback);
                }
            }
            _ => {}
        }
    }

    fn callback(&mut self, expression: &Expression<'_>) {
        match expression.get_inner_expression() {
            Expression::ArrowFunctionExpression(f) => match &f.body {
                ArrowFunctionBody::FunctionBody(body) => {
                    Output { check: self }.visit_function_body(body);
                }
                body => {
                    if let Some(value) = body.as_expression() {
                        self.rendered(value);
                    }
                }
            },
            Expression::FunctionExpression(f) => {
                if let Some(body) = &f.body {
                    Output { check: self }.visit_function_body(body);
                }
            }
            _ => {}
        }
    }
}

struct Output<'x, 's> {
    check: &'x mut Check<'s>,
}

impl<'a> Visit<'a> for Output<'_, '_> {
    fn visit_return_statement(&mut self, it: &ReturnStatement<'a>) {
        if let Some(value) = &it.argument {
            self.check.rendered(value);
        }
    }
    fn visit_function(&mut self, _: &Function<'a>, _: ScopeFlags) {}
    fn visit_arrow_function_expression(&mut self, _: &ArrowFunctionExpression<'a>) {}
}

impl<'a> Visit<'a> for Check<'_> {
    fn visit_jsx_child(&mut self, it: &JSXChild<'a>) {
        if let JSXChild::ExpressionContainer(container) = it
            && let Some(value) = container.expression.as_expression()
        {
            self.rendered(value);
        }
        walk::walk_jsx_child(self, it);
    }

    fn visit_jsx_attribute(&mut self, it: &JSXAttribute<'a>) {
        let previous = self.suppressed;
        self.suppressed |= event_attribute(&it.name)
            || matches!(&it.name, JSXAttributeName::Identifier(name) if name.name == "ref");
        if matches!(&it.name, JSXAttributeName::Identifier(name) if name.name == "children")
            && let Some(JSXAttributeValue::ExpressionContainer(container)) = &it.value
            && let Some(value) = container.expression.as_expression()
        {
            self.rendered(value);
        }
        walk::walk_jsx_attribute(self, it);
        self.suppressed = previous;
    }

    fn visit_call_expression(&mut self, it: &CallExpression<'a>) {
        let previous = self.suppressed;
        self.suppressed |= matches!(self.facts.core_call(it), Some("watch" | "onCleanup"));
        walk::walk_call_expression(self, it);
        self.suppressed = previous;
    }

    fn visit_variable_declarator(&mut self, it: &VariableDeclarator<'a>) {
        let previous = self.pending_component;
        self.pending_component = matches!((&it.id, it.init.as_ref().map(Expression::get_inner_expression)),
            (BindingPattern::BindingIdentifier(id), Some(Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_)))
                if is_component_name(id.name.as_str()));
        walk::walk_variable_declarator(self, it);
        self.pending_component = previous;
    }

    fn visit_function(&mut self, it: &Function<'a>, flags: ScopeFlags) {
        let previous = (self.component, self.suppressed);
        self.suppressed |= self.callbacks.contains(&key(it.span));
        self.component = self.pending_component
            || it
                .id
                .as_ref()
                .is_some_and(|id| is_component_name(id.name.as_str()));
        self.pending_component = false;
        walk::walk_function(self, it, flags);
        (self.component, self.suppressed) = previous;
    }

    fn visit_arrow_function_expression(&mut self, it: &ArrowFunctionExpression<'a>) {
        let previous = (self.component, self.suppressed);
        self.suppressed |= self.callbacks.contains(&key(it.span));
        self.component = self.pending_component;
        self.pending_component = false;
        if self.component
            && let Some(value) = it.body.as_expression()
        {
            self.rendered(value);
        }
        walk::walk_arrow_function_expression(self, it);
        (self.component, self.suppressed) = previous;
    }

    fn visit_return_statement(&mut self, it: &ReturnStatement<'a>) {
        if self.component
            && let Some(value) = &it.argument
        {
            self.rendered(value);
        }
        walk::walk_return_statement(self, it);
    }
}

pub(super) fn diagnostics(
    program: &Program<'_>,
    scoping: &Scoping,
    source: &str,
) -> Vec<Diagnostic> {
    let facts = collect(program, scoping);
    let callbacks = callback_functions(program, scoping, &facts);
    let mut check = Check {
        source,
        facts,
        diagnostics: Vec::new(),
        reported: HashSet::new(),
        suppressed: false,
        component: false,
        pending_component: false,
        callbacks,
    };
    check.visit_program(program);
    check.diagnostics
}
