//! Visible member writes invalidate connected reference groups, not just const declarations.

use std::collections::HashSet;

use oxc_ast::ast::{
    ArrowFunctionExpression, AssignmentExpression, CallExpression, Expression, Function,
    IdentifierReference, NewExpression, Program, SimpleAssignmentTarget, UnaryExpression,
    VariableDeclarator,
};
use oxc_ast_visit::{Visit, walk};
use oxc_semantic::{Scoping, SymbolId};
use oxc_syntax::{operator::UnaryOperator, scope::ScopeFlags};

use super::{binding_symbol, symbol_of};

fn root(scoping: &Scoping, expression: &Expression<'_>) -> Option<SymbolId> {
    match expression.get_inner_expression() {
        Expression::Identifier(id) => symbol_of(scoping, id),
        Expression::StaticMemberExpression(m) => root(scoping, &m.object),
        Expression::ComputedMemberExpression(m) => root(scoping, &m.object),
        _ => None,
    }
}

fn member(scoping: &Scoping, target: &SimpleAssignmentTarget<'_>) -> Option<SymbolId> {
    match target {
        SimpleAssignmentTarget::StaticMemberExpression(m) => root(scoping, &m.object),
        SimpleAssignmentTarget::ComputedMemberExpression(m) => root(scoping, &m.object),
        _ => None,
    }
}

struct Names<'s> {
    scoping: &'s Scoping,
    writes: bool,
    symbols: HashSet<SymbolId>,
}

impl<'a> Visit<'a> for Names<'_> {
    fn visit_call_expression(&mut self, it: &CallExpression<'a>) {
        // A returned object may share its arguments, not the callable's own properties.
        for argument in &it.arguments {
            self.visit_argument(argument);
        }
    }

    fn visit_new_expression(&mut self, it: &NewExpression<'a>) {
        for argument in &it.arguments {
            self.visit_argument(argument);
        }
    }

    fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
        if let Some(reference) = it
            .reference_id
            .get()
            .map(|id| self.scoping.get_reference(id))
            && (if self.writes {
                reference.is_write()
            } else {
                reference.is_read()
            })
            && let Some(sym) = reference.symbol_id()
        {
            self.symbols.insert(sym);
        }
    }

    fn visit_simple_assignment_target(&mut self, it: &SimpleAssignmentTarget<'a>) {
        if self.writes
            && let Some(sym) = member(self.scoping, it)
        {
            self.symbols.insert(sym);
        }
        walk::walk_simple_assignment_target(self, it);
    }

    fn visit_function(&mut self, _: &Function<'a>, _: ScopeFlags) {}
    fn visit_arrow_function_expression(&mut self, _: &ArrowFunctionExpression<'a>) {}
}

struct Writes<'s> {
    scoping: &'s Scoping,
    edges: Vec<(SymbolId, SymbolId)>,
    unstable: HashSet<SymbolId>,
}

impl<'a> Visit<'a> for Writes<'_> {
    fn visit_variable_declarator(&mut self, it: &VariableDeclarator<'a>) {
        if let Some(init) = &it.init {
            let mut names = Names {
                scoping: self.scoping,
                writes: false,
                symbols: HashSet::new(),
            };
            names.visit_expression(init);
            for id in it.id.get_binding_identifiers() {
                if let Some(target) = binding_symbol(id) {
                    self.edges
                        .extend(names.symbols.iter().map(|&source| (target, source)));
                }
            }
        }
        walk::walk_variable_declarator(self, it);
    }

    fn visit_assignment_expression(&mut self, it: &AssignmentExpression<'a>) {
        let mut targets = Names {
            scoping: self.scoping,
            writes: true,
            symbols: HashSet::new(),
        };
        targets.visit_assignment_target(&it.left);
        let mut sources = Names {
            scoping: self.scoping,
            writes: false,
            symbols: HashSet::new(),
        };
        sources.visit_expression(&it.right);
        for target in targets.symbols {
            self.edges
                .extend(sources.symbols.iter().map(|&source| (target, source)));
        }
        walk::walk_assignment_expression(self, it);
    }

    fn visit_simple_assignment_target(&mut self, it: &SimpleAssignmentTarget<'a>) {
        if let Some(sym) = member(self.scoping, it) {
            self.unstable.insert(sym);
        }
        walk::walk_simple_assignment_target(self, it);
    }

    fn visit_unary_expression(&mut self, it: &UnaryExpression<'a>) {
        if it.operator == UnaryOperator::Delete
            && let Some(sym) = root(self.scoping, &it.argument)
        {
            self.unstable.insert(sym);
        }
        walk::walk_unary_expression(self, it);
    }
}

pub(super) fn unstable(program: &Program<'_>, scoping: &Scoping) -> HashSet<SymbolId> {
    let mut scan = Writes {
        scoping,
        edges: Vec::new(),
        unstable: HashSet::new(),
    };
    scan.visit_program(program);
    loop {
        let before = scan.unstable.len();
        for &(left, right) in &scan.edges {
            if scan.unstable.contains(&left) || scan.unstable.contains(&right) {
                scan.unstable.insert(left);
                scan.unstable.insert(right);
            }
        }
        if scan.unstable.len() == before {
            return scan.unstable;
        }
    }
}
