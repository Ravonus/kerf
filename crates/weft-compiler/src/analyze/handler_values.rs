//! Expand returned values through stable locals without promoting unrelated effect reads.

use std::collections::{HashMap, HashSet};

use oxc_ast::ast::{
    ArrowFunctionExpression, BindingPattern, CallExpression, Expression, ForInStatement,
    ForOfStatement, ForStatement, Function, IdentifierReference, IfStatement, JSXAttribute,
    JSXAttributeName, Statement, SwitchStatement, VariableDeclarator, WhileStatement,
};
use oxc_ast_visit::{Visit, walk};
use oxc_semantic::{Scoping, SymbolId};
use oxc_syntax::scope::ScopeFlags;

use super::early_returns::{allocated_object, has_return};
use super::handler_mutations::event_attribute;
use super::{SpanKey, binding_symbol, key};

#[derive(Default)]
pub(super) struct Dependencies {
    pub(super) reads: HashSet<SymbolId>,
    pub(super) calls: HashSet<SpanKey>,
}

impl Dependencies {
    fn extend(&mut self, other: &Self) {
        self.reads.extend(&other.reads);
        self.calls.extend(&other.calls);
    }
}

struct Reads<'s> {
    scoping: &'s Scoping,
    found: Dependencies,
}

fn reads(scoping: &Scoping, expression: &Expression<'_>) -> Dependencies {
    let mut reads = Reads {
        scoping,
        found: Dependencies::default(),
    };
    reads.visit_expression(expression);
    reads.found
}

impl<'a> Visit<'a> for Reads<'_> {
    fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
        if let Some(reference) = it
            .reference_id
            .get()
            .map(|id| self.scoping.get_reference(id))
            && reference.is_read()
            && let Some(sym) = reference.symbol_id()
        {
            self.found.reads.insert(sym);
        }
    }

    fn visit_call_expression(&mut self, it: &CallExpression<'a>) {
        self.found.calls.insert(key(it.span));
        walk::walk_call_expression(self, it);
    }

    fn visit_jsx_attribute(&mut self, it: &JSXAttribute<'a>) {
        if !event_attribute(&it.name)
            && !matches!(&it.name, JSXAttributeName::Identifier(name) if name.name == "ref")
        {
            walk::walk_jsx_attribute(self, it);
        }
    }

    fn visit_function(&mut self, _: &Function<'a>, _: ScopeFlags) {}
    fn visit_arrow_function_expression(&mut self, _: &ArrowFunctionExpression<'a>) {}
}

struct Flow<'s> {
    scoping: &'s Scoping,
    values: HashMap<SymbolId, Dependencies>,
    output: Dependencies,
}

impl Flow<'_> {
    fn condition(&mut self, test: &Expression<'_>, returns: bool) {
        if returns {
            self.output.extend(&reads(self.scoping, test));
        }
    }

    fn boolean_condition(&mut self, test: &Expression<'_>, returns: bool) {
        if !allocated_object(test) {
            self.condition(test, returns);
        }
    }
}

impl<'a> Visit<'a> for Flow<'_> {
    fn visit_variable_declarator(&mut self, it: &VariableDeclarator<'a>) {
        if let (BindingPattern::BindingIdentifier(id), Some(init)) = (&it.id, &it.init)
            && let Some(sym) = binding_symbol(id)
            && !self
                .scoping
                .get_resolved_references(sym)
                .any(oxc_semantic::Reference::is_write)
        {
            self.values.insert(sym, reads(self.scoping, init));
        }
        walk::walk_variable_declarator(self, it);
    }

    fn visit_if_statement(&mut self, it: &IfStatement<'a>) {
        self.boolean_condition(
            &it.test,
            has_return(&it.consequent) || it.alternate.as_ref().is_some_and(has_return),
        );
        walk::walk_if_statement(self, it);
    }

    fn visit_switch_statement(&mut self, it: &SwitchStatement<'a>) {
        let returns = it.cases.iter().any(|c| c.consequent.iter().any(has_return));
        self.condition(&it.discriminant, returns);
        for case in &it.cases {
            if let Some(test) = &case.test {
                self.condition(test, returns);
            }
        }
        walk::walk_switch_statement(self, it);
    }

    fn visit_while_statement(&mut self, it: &WhileStatement<'a>) {
        self.boolean_condition(&it.test, has_return(&it.body));
        walk::walk_while_statement(self, it);
    }

    fn visit_for_statement(&mut self, it: &ForStatement<'a>) {
        if let Some(test) = &it.test {
            self.boolean_condition(test, has_return(&it.body));
        }
        walk::walk_for_statement(self, it);
    }

    fn visit_for_in_statement(&mut self, it: &ForInStatement<'a>) {
        self.condition(&it.right, has_return(&it.body));
        walk::walk_for_in_statement(self, it);
    }

    fn visit_for_of_statement(&mut self, it: &ForOfStatement<'a>) {
        self.condition(&it.right, has_return(&it.body));
        walk::walk_for_of_statement(self, it);
    }

    fn visit_function(&mut self, _: &Function<'a>, _: ScopeFlags) {}
    fn visit_arrow_function_expression(&mut self, _: &ArrowFunctionExpression<'a>) {}
}

/// Trace only stable initializers used by the output or by a condition governing a return.
pub(super) fn output_dependencies(
    statements: &[Statement<'_>],
    scoping: &Scoping,
    seeds: HashSet<SymbolId>,
) -> Dependencies {
    let mut flow = Flow {
        scoping,
        values: HashMap::new(),
        output: Dependencies {
            reads: seeds,
            calls: HashSet::new(),
        },
    };
    for statement in statements {
        flow.visit_statement(statement);
    }
    let mut pending: Vec<_> = flow.output.reads.iter().copied().collect();
    let mut seen = HashSet::new();
    while let Some(sym) = pending.pop() {
        if !seen.insert(sym) {
            continue;
        }
        if let Some(value) = flow.values.get(&sym) {
            pending.extend(&value.reads);
            flow.output.extend(value);
        }
    }
    flow.output
}
