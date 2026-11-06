//! Unknown evaluation cannot preserve a gate fact if another writer or an escaped box can change it.

use std::collections::{HashMap, HashSet};

use oxc_ast::ast::{
    ArrowFunctionExpression, AssignmentExpression, AssignmentTarget, BindingPattern,
    CallExpression, ComputedMemberExpression, Expression, Function, IdentifierReference,
    JSXAttribute, JSXAttributeValue, JSXElementName, JSXOpeningElement, SimpleAssignmentTarget,
    Statement, StaticMemberExpression, UnaryExpression, UpdateExpression, VariableDeclarator,
};
use oxc_ast_visit::{Visit, walk};
use oxc_semantic::SymbolId;
use oxc_span::{GetSpan, Span};
use oxc_syntax::operator::{AssignmentOperator, UnaryOperator};
use oxc_syntax::scope::ScopeFlags;

use super::super::super::{Analyzer, SpanKey, binding_symbol, key, symbol_of};
use super::super::{Target, event_attribute};
use super::{States, state};

#[derive(Default)]
pub(super) struct Effects {
    writes: HashMap<SymbolId, HashMap<SpanKey, Option<bool>>>,
    escaped: HashSet<SymbolId>,
}

impl Effects {
    pub(super) fn only_writer(&self, gate: SymbolId, writer: SpanKey) -> bool {
        !self.escaped.contains(&gate)
            && self
                .writes
                .get(&gate)
                .is_some_and(|writes| writes.len() == 1 && writes.contains_key(&writer))
    }

    pub(super) fn preserves(&self, gate: SymbolId, before: bool, writer: SpanKey) -> bool {
        !self.escaped.contains(&gate)
            && self.writes.get(&gate).is_some_and(|writes| {
                writes.contains_key(&writer)
                    && writes
                        .iter()
                        .all(|(&span, &value)| span == writer || value == Some(before))
            })
    }
}

struct Scan<'x, 's> {
    a: &'x Analyzer<'s>,
    states: &'x States,
    effects: Effects,
    receivers: HashSet<SpanKey>,
    writing: bool,
}

impl Scan<'_, '_> {
    fn receiver(&mut self, object: &Expression<'_>, value: bool) {
        if let Some(gate) = state(object, self.a, self.states) {
            if value {
                self.receivers
                    .insert(key(object.get_inner_expression().span()));
            } else {
                self.effects.escaped.insert(gate);
            }
        }
    }

    fn write(&mut self, object: &Expression<'_>, span: Span, value: Option<bool>) {
        if let Some(gate) = state(object, self.a, self.states) {
            self.effects
                .writes
                .entry(gate)
                .or_default()
                .entry(key(span))
                .or_insert(value);
        }
    }
}

impl<'a> Visit<'a> for Scan<'_, '_> {
    fn visit_variable_declarator(&mut self, it: &VariableDeclarator<'a>) {
        if let (BindingPattern::BindingIdentifier(id), Some(init)) = (&it.id, &it.init)
            && binding_symbol(id).is_some_and(|sym| self.states.contains_key(&sym))
            && matches!(init.get_inner_expression(), Expression::Identifier(_))
        {
            self.receiver(init, true);
        }
        walk::walk_variable_declarator(self, it);
    }

    fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
        if let Some(gate) = symbol_of(self.a.scoping, it).and_then(|sym| self.states.get(&sym))
            && !self.receivers.contains(&key(it.span))
        {
            self.effects.escaped.insert(*gate);
        }
    }

    fn visit_static_member_expression(&mut self, it: &StaticMemberExpression<'a>) {
        self.receiver(&it.object, it.property.name == "value");
        if self.writing {
            self.write(&it.object, it.span, None);
        }
        walk::walk_static_member_expression(self, it);
    }

    fn visit_computed_member_expression(&mut self, it: &ComputedMemberExpression<'a>) {
        self.receiver(
            &it.object,
            matches!(it.expression.get_inner_expression(),
            Expression::StringLiteral(name) if name.value == "value"),
        );
        if self.writing {
            self.write(&it.object, it.span, None);
        }
        walk::walk_computed_member_expression(self, it);
    }

    fn visit_simple_assignment_target(&mut self, it: &SimpleAssignmentTarget<'a>) {
        // Pattern and cast targets also write; receiver reads here are conservative extra writes.
        let previous = std::mem::replace(&mut self.writing, true);
        walk::walk_simple_assignment_target(self, it);
        self.writing = previous;
    }

    fn visit_assignment_expression(&mut self, it: &AssignmentExpression<'a>) {
        let value = match it.right.get_inner_expression() {
            Expression::BooleanLiteral(value) if it.operator == AssignmentOperator::Assign => {
                Some(value.value)
            }
            _ => None,
        };
        match &it.left {
            AssignmentTarget::StaticMemberExpression(m) if m.property.name == "value" => {
                self.write(&m.object, m.span, value)
            }
            AssignmentTarget::ComputedMemberExpression(m)
                if matches!(m.expression.get_inner_expression(),
                Expression::StringLiteral(name) if name.value == "value") =>
            {
                self.write(&m.object, m.span, value)
            }
            _ => {}
        }
        walk::walk_assignment_expression(self, it);
    }

    fn visit_update_expression(&mut self, it: &UpdateExpression<'a>) {
        match &it.argument {
            SimpleAssignmentTarget::StaticMemberExpression(m) => {
                self.write(&m.object, m.span, None)
            }
            SimpleAssignmentTarget::ComputedMemberExpression(m) => {
                self.write(&m.object, m.span, None)
            }
            _ => {}
        }
        walk::walk_update_expression(self, it);
    }

    fn visit_unary_expression(&mut self, it: &UnaryExpression<'a>) {
        if it.operator == UnaryOperator::Delete {
            match it.argument.get_inner_expression() {
                Expression::StaticMemberExpression(m) => self.receiver(&m.object, false),
                Expression::ComputedMemberExpression(m) => self.receiver(&m.object, false),
                _ => {}
            }
        }
        walk::walk_unary_expression(self, it);
    }
}

pub(super) fn collect(statements: &[Statement<'_>], a: &Analyzer<'_>, states: &States) -> Effects {
    let mut scan = Scan {
        a,
        states,
        effects: Effects::default(),
        receivers: HashSet::new(),
        writing: false,
    };
    // Include nested helpers/getters and late declarations before proving any handler.
    for statement in statements {
        scan.visit_statement(statement);
    }
    scan.effects
}

struct CallbackEscapes<'x, 's> {
    a: &'x Analyzer<'s>,
    bindings: &'x HashMap<SymbolId, Target>,
    allowed: HashSet<SpanKey>,
    found: HashSet<SpanKey>,
    native: bool,
}

impl CallbackEscapes<'_, '_> {
    fn function(&self, mut target: Target) -> Option<SpanKey> {
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

    fn allow(&mut self, value: &Expression<'_>) {
        match value.get_inner_expression() {
            Expression::Identifier(id) => {
                self.allowed.insert(key(id.span));
            }
            Expression::FunctionExpression(f) => {
                self.allowed.insert(key(f.span));
            }
            Expression::ArrowFunctionExpression(f) => {
                self.allowed.insert(key(f.span));
            }
            Expression::TSNonNullExpression(e) => self.allow(&e.expression),
            Expression::TSAsExpression(e) => self.allow(&e.expression),
            Expression::TSSatisfiesExpression(e) => self.allow(&e.expression),
            Expression::TSTypeAssertion(e) => self.allow(&e.expression),
            Expression::ConditionalExpression(c) => {
                self.allow(&c.consequent);
                self.allow(&c.alternate);
            }
            Expression::LogicalExpression(l) => {
                self.allow(&l.left);
                self.allow(&l.right);
            }
            _ => {}
        }
    }
}

impl<'a> Visit<'a> for CallbackEscapes<'_, '_> {
    fn visit_statement(&mut self, it: &Statement<'a>) {
        if let Statement::FunctionDeclaration(f) = it {
            self.allowed.insert(key(f.span));
        }
        walk::walk_statement(self, it);
    }

    fn visit_variable_declarator(&mut self, it: &VariableDeclarator<'a>) {
        if let (BindingPattern::BindingIdentifier(id), Some(init)) = (&it.id, &it.init)
            && binding_symbol(id).is_some_and(|sym| self.bindings.contains_key(&sym))
        {
            self.allow(init);
        }
        walk::walk_variable_declarator(self, it);
    }

    fn visit_call_expression(&mut self, it: &CallExpression<'a>) {
        self.allow(&it.callee);
        walk::walk_call_expression(self, it);
    }

    fn visit_jsx_attribute(&mut self, it: &JSXAttribute<'a>) {
        if self.native
            && event_attribute(&it.name)
            && let Some(JSXAttributeValue::ExpressionContainer(value)) = &it.value
            && let Some(expression) = value.expression.as_expression()
        {
            self.allow(expression);
        }
        walk::walk_jsx_attribute(self, it);
    }

    fn visit_jsx_opening_element(&mut self, it: &JSXOpeningElement<'a>) {
        let native = matches!(&it.name, JSXElementName::Identifier(name)
            if name.name.starts_with(|c: char| c.is_ascii_lowercase()));
        let previous = std::mem::replace(&mut self.native, native);
        walk::walk_jsx_opening_element(self, it);
        self.native = previous;
    }

    fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
        if !self.allowed.contains(&key(it.span))
            && it
                .reference_id
                .get()
                .is_some_and(|id| self.a.scoping.get_reference(id).is_read())
            && let Some(sym) = symbol_of(self.a.scoping, it)
            && let Some(span) = self.function(Target::Binding(sym))
        {
            self.found.insert(span);
        }
    }

    fn visit_function(&mut self, it: &Function<'a>, flags: ScopeFlags) {
        if !self.allowed.contains(&key(it.span)) {
            self.found.insert(key(it.span));
        }
        walk::walk_function(self, it, flags);
    }

    fn visit_arrow_function_expression(&mut self, it: &ArrowFunctionExpression<'a>) {
        if !self.allowed.contains(&key(it.span)) {
            self.found.insert(key(it.span));
        }
        walk::walk_arrow_function_expression(self, it);
    }
}

pub(super) fn escaped_callbacks(
    statements: &[Statement<'_>],
    a: &Analyzer<'_>,
    bindings: &HashMap<SymbolId, Target>,
) -> HashSet<SpanKey> {
    let mut scan = CallbackEscapes {
        a,
        bindings,
        allowed: HashSet::new(),
        found: HashSet::new(),
        native: false,
    };
    // An opaque consumer can invoke a callback immediately, including its original writer site.
    for statement in statements {
        scan.visit_statement(statement);
    }
    scan.found
}
