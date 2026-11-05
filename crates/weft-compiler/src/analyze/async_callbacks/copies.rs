//! W004 needs a whole-body copy proof, not one matching write among effects.
//! Only synchronous local getters, stable const aliases and one final assignment
//! qualify. Calls, transforms, branches, defaults, rest parameters and opaque bodies
//! stay outside inference. Replacing state can change initialization and other writers,
//! so the warning gives advice without an autofix.

use std::collections::{HashMap, HashSet};

use oxc_ast::ast::{
    ArrowFunctionBody, ArrowFunctionExpression, AssignmentTarget, BindingPattern, Expression,
    FormalParameters, Function, Program, Statement, VariableDeclaration, VariableDeclarationKind,
    VariableDeclarator,
};
use oxc_ast_visit::{Visit, walk};
use oxc_semantic::SymbolId;
use oxc_span::Span;
use oxc_syntax::operator::AssignmentOperator;
use oxc_syntax::scope::ScopeFlags;

use crate::diag::{Diagnostic, Severity};

use super::super::react::imported_value;
use super::super::{SpanKey, binding_symbol, key, symbol_of};
use super::{Api, Call, Index};

#[derive(Clone, Copy, PartialEq, Eq, Hash)]
enum Value {
    Parameter,
    Box(SymbolId),
}

enum Shape {
    Source(SymbolId),
    Copy { target: SymbolId, values: HashSet<Value> },
}

struct Body<'i, 's> {
    index: &'i Index<'s>,
    locals: HashMap<SymbolId, Value>,
}

impl<'i, 's> Body<'i, 's> {
    fn new(index: &'i Index<'s>, params: &FormalParameters<'_>) -> Option<Self> {
        if params.rest.is_some() {
            return None;
        }
        let mut locals = HashMap::new();
        for (position, param) in params.items.iter().enumerate() {
            let BindingPattern::BindingIdentifier(id) = &param.pattern else {
                return None;
            };
            let sym = binding_symbol(id)?;
            if !index.stable(sym) {
                return None;
            }
            if position == 0 {
                locals.insert(sym, Value::Parameter);
            }
        }
        Some(Self { index, locals })
    }

    fn value(&self, expression: &Expression<'_>) -> Option<Value> {
        let object = match expression.get_inner_expression() {
            Expression::Identifier(id) => {
                return self.locals.get(&symbol_of(self.index.a.scoping, id)?).copied();
            }
            Expression::StaticMemberExpression(member) if member.property.name == "value" => {
                &member.object
            }
            Expression::ComputedMemberExpression(member)
                if matches!(member.expression.get_inner_expression(),
                    Expression::StringLiteral(name) if name.value == "value") =>
            {
                &member.object
            }
            _ => return None,
        };
        self.index.box_symbol(object).map(Value::Box)
    }

    fn declaration(&mut self, declaration: &VariableDeclaration<'_>) -> Option<()> {
        if declaration.kind != VariableDeclarationKind::Const {
            return None;
        }
        for variable in &declaration.declarations {
            let BindingPattern::BindingIdentifier(id) = &variable.id else {
                return None;
            };
            let sym = binding_symbol(id)?;
            let init = variable.init.as_ref()?;
            if !self.index.stable(sym) {
                return None;
            }
            if let Some(value) = self.value(init) {
                self.locals.insert(sym, value);
            } else if self.index.box_symbol(init).is_none() {
                return None;
            }
        }
        Some(())
    }

    fn statements(&mut self, statements: &[Statement<'_>]) -> Option<Shape> {
        let (last, prefix) = statements.split_last()?;
        for statement in prefix {
            let Statement::VariableDeclaration(declaration) = statement else {
                return None;
            };
            self.declaration(declaration)?;
        }
        match last {
            Statement::ReturnStatement(statement) => {
                self.expression(statement.argument.as_ref()?, true)
            }
            Statement::ExpressionStatement(statement) => {
                self.expression(&statement.expression, false)
            }
            _ => None,
        }
    }

    fn expression(&self, expression: &Expression<'_>, returned: bool) -> Option<Shape> {
        if let Expression::AssignmentExpression(assignment) = expression.get_inner_expression() {
            if assignment.operator != AssignmentOperator::Assign {
                return None;
            }
            let object = match &assignment.left {
                AssignmentTarget::StaticMemberExpression(member)
                    if member.property.name == "value" =>
                {
                    &member.object
                }
                AssignmentTarget::ComputedMemberExpression(member)
                    if matches!(member.expression.get_inner_expression(),
                        Expression::StringLiteral(name) if name.value == "value") =>
                {
                    &member.object
                }
                _ => return None,
            };
            let target = self.index.box_symbol(object)?;
            let value = self.value(&assignment.right)?;
            let mut values: HashSet<_> = self.locals.values().copied().collect();
            values.insert(value);
            return Some(Shape::Copy { target, values });
        }
        if returned
            && let Some(Value::Box(source)) = self.value(expression)
            && self.locals.values().all(|&value| value == Value::Box(source))
        {
            return Some(Shape::Source(source));
        }
        None
    }
}

struct Shapes<'i, 's> {
    index: &'i Index<'s>,
    shapes: HashMap<SpanKey, Shape>,
    states: HashSet<SymbolId>,
}

impl<'a> Visit<'a> for Shapes<'_, '_> {
    fn visit_variable_declarator(&mut self, it: &VariableDeclarator<'a>) {
        if let (BindingPattern::BindingIdentifier(id), Some(init)) = (&it.id, &it.init)
            && let Some(sym) = binding_symbol(id)
            && self.index.boxes.contains(&sym)
            && let Expression::CallExpression(call) = init.get_inner_expression()
        {
            // Among proven box calls, only state.linked lacks an imported callee.
            let state = imported_value(&call.callee, self.index.a.scoping, &self.index.imports)
                .map_or_else(
                    || self.index.box_call(call, sym),
                    |(module, name)| module == "@weft-js/core" && name == "state",
                );
            if state {
                self.states.insert(sym);
            }
        }
        walk::walk_variable_declarator(self, it);
    }

    fn visit_function(&mut self, it: &Function<'a>, flags: ScopeFlags) {
        if !it.r#async
            && !it.generator
            && let Some(body) = &it.body
            && let Some(mut proof) = Body::new(self.index, &it.params)
            && let Some(shape) = proof.statements(&body.statements)
        {
            self.shapes.insert(key(it.span), shape);
        }
        walk::walk_function(self, it, flags);
    }

    fn visit_arrow_function_expression(&mut self, it: &ArrowFunctionExpression<'a>) {
        if !it.r#async
            && let Some(mut proof) = Body::new(self.index, &it.params)
        {
            let shape = match &it.body {
                ArrowFunctionBody::FunctionBody(body) => proof.statements(&body.statements),
                body => body
                    .as_expression()
                    .and_then(|expression| proof.expression(expression, true)),
            };
            if let Some(shape) = shape {
                self.shapes.insert(key(it.span), shape);
            }
        }
        walk::walk_arrow_function_expression(self, it);
    }
}

pub(super) fn diagnostics(
    program: &Program<'_>,
    index: &Index<'_>,
    calls: &HashMap<SpanKey, Vec<Call>>,
) -> Vec<Diagnostic> {
    let mut shapes = Shapes {
        index,
        shapes: HashMap::new(),
        states: HashSet::new(),
    };
    shapes.visit_program(program);
    let mut sources = HashMap::new();
    let mut callbacks = Vec::new();
    for (function, calls) in calls {
        let Some(shape) = shapes.shapes.get(function) else {
            continue;
        };
        for call in calls {
            match (call.api, shape) {
                (Api::WatchSource, Shape::Source(source)) => {
                    sources.insert(key(call.span), *source);
                }
                (Api::WatchCallback, Shape::Copy { target, values }) => {
                    callbacks.push((call.span, *target, values));
                }
                _ => {}
            }
        }
    }
    callbacks.sort_by_key(|(span, ..)| span.start);
    callbacks
        .into_iter()
        .filter_map(|(span, target, values)| {
            let source = *sources.get(&key(span))?;
            if source == target
                || !shapes.states.contains(&target)
                || !values.iter().all(|&value| {
                    value == Value::Parameter || value == Value::Box(source)
                })
            {
                return None;
            }
            Some(diagnostic(index, span, target))
        })
        .collect()
}

fn diagnostic(index: &Index<'_>, span: Span, target: SymbolId) -> Diagnostic {
    let target = index.a.scoping.symbol_name(target);
    Diagnostic::new(
        index.a.source,
        "W004",
        Severity::Warning,
        (span.start, span.end),
        format!("This `watch` only copies its source value into `{target}.value`."),
        format!("Replace the mirrored `{target}` state with `derived(sourceGetter)`, using this \
                 watch's first argument as the getter. Remove this watch and read the derived box's \
                 `.value`. Keep state if independent writes are intended."),
    )
}
