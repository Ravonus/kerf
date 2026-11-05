//! Reads are untracked only on paths that have resumed after suspension.

use std::collections::HashSet;

use oxc_ast::ast::{
    ArrowFunctionExpression, AssignmentExpression, AwaitExpression, BindingPattern, BreakStatement,
    CallExpression, ComputedMemberExpression, ConditionalExpression, ContinueStatement,
    DoWhileStatement, Expression, ForInStatement, ForOfStatement, ForStatement, Function,
    IdentifierReference, IfStatement, LabeledStatement, LogicalExpression, ReturnStatement,
    SimpleAssignmentTarget, Statement, StaticMemberExpression, SwitchStatement, ThrowStatement,
    TryStatement, UnaryExpression, UpdateExpression, VariableDeclarator, WhileStatement,
};
use oxc_ast_visit::{Visit, walk};
use oxc_span::{GetSpan, Span};
use oxc_syntax::operator::{AssignmentOperator, UnaryOperator};
use oxc_syntax::scope::ScopeFlags;

use crate::diag::{Diagnostic, Severity};

use super::super::{SpanKey, key, symbol_of};
use super::Index;
use super::flow::{Frame, State, Trap};

pub(super) struct Flow<'x, 's> {
    pub(super) index: &'x Index<'s>,
    pub(super) state: State,
    pub(super) frames: Vec<Frame>,
    pub(super) traps: Vec<Trap>,
    pub(super) label: Option<String>,
    pub(super) diagnostics: Vec<Diagnostic>,
    reported: HashSet<SpanKey>,
    write_only: bool,
}

impl<'x, 's> Flow<'x, 's> {
    pub(super) fn new(index: &'x Index<'s>) -> Self {
        Self {
            index,
            state: State {
                tracked: true,
                untracked: false,
            },
            frames: Vec::new(),
            traps: Vec::new(),
            label: None,
            diagnostics: Vec::new(),
            reported: HashSet::new(),
            write_only: false,
        }
    }

    fn reference(&self, expression: &Expression<'_>, props: bool) -> bool {
        matches!(expression.get_inner_expression(), Expression::Identifier(id)
            if symbol_of(self.index.a.scoping, id).is_some_and(|sym|
                if props { self.index.props.contains(&sym) } else { self.index.boxes.contains(&sym) }))
    }

    fn report(&mut self, span: Span) {
        if !self.state.untracked || !self.reported.insert(key(span)) {
            return;
        }
        let text = self.index.a.text(span);
        self.diagnostics.push(Diagnostic::new(
            self.index.a.source, "W012", Severity::Error, (span.start, span.end),
            format!("`{text}` is read after `await` in a resource callback; that read is no longer tracked."),
            "Read reactive props/state into local values before the first `await`, then use those values \
             afterwards. Keep async work in `resource`; `derived` callbacks must stay synchronous.",
        ));
    }

    pub(super) fn suspend(&mut self) {
        self.state.suspend();
        for trap in &mut self.traps {
            trap.exceptions = trap.exceptions.join(self.state);
        }
    }

    fn abrupt(&mut self) {
        for trap in &mut self.traps {
            trap.abrupt = trap.abrupt.join(self.state);
        }
        self.state = State::default();
    }
}

impl<'a> Visit<'a> for Flow<'_, '_> {
    fn visit_assignment_expression(&mut self, it: &AssignmentExpression<'a>) {
        let previous = std::mem::replace(
            &mut self.write_only,
            it.operator == AssignmentOperator::Assign,
        );
        self.visit_assignment_target(&it.left);
        self.write_only = previous;
        self.visit_expression(&it.right);
    }

    fn visit_simple_assignment_target(&mut self, it: &SimpleAssignmentTarget<'a>) {
        if self.write_only {
            match it {
                SimpleAssignmentTarget::StaticMemberExpression(member) => {
                    self.visit_expression(&member.object);
                    return;
                }
                SimpleAssignmentTarget::ComputedMemberExpression(member) => {
                    self.visit_expression(&member.object);
                    self.visit_expression(&member.expression);
                    return;
                }
                _ => {}
            }
        }
        walk::walk_simple_assignment_target(self, it);
    }

    fn visit_update_expression(&mut self, it: &UpdateExpression<'a>) {
        let previous = std::mem::replace(&mut self.write_only, false);
        walk::walk_update_expression(self, it);
        self.write_only = previous;
    }

    fn visit_unary_expression(&mut self, it: &UnaryExpression<'a>) {
        if it.operator == UnaryOperator::Delete {
            match it.argument.get_inner_expression() {
                Expression::StaticMemberExpression(member) => {
                    self.visit_expression(&member.object);
                    return;
                }
                Expression::ComputedMemberExpression(member) => {
                    self.visit_expression(&member.object);
                    self.visit_expression(&member.expression);
                    return;
                }
                _ => {}
            }
        }
        walk::walk_unary_expression(self, it);
    }

    fn visit_statement(&mut self, it: &Statement<'a>) {
        if self.state.alive() {
            walk::walk_statement(self, it);
        }
    }

    fn visit_await_expression(&mut self, it: &AwaitExpression<'a>) {
        self.visit_expression(&it.argument);
        self.suspend();
    }

    fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
        if let Some(reference) = it
            .reference_id
            .get()
            .map(|id| self.index.a.scoping.get_reference(id))
            && reference.is_read()
            && let Some(sym) = reference.symbol_id()
            && !self.index.props.contains(&sym)
            && !self.index.boxes.contains(&sym)
            && self.index.a.plan.rewrites.contains_key(&sym)
        {
            self.report(it.span);
        }
    }

    fn visit_static_member_expression(&mut self, it: &StaticMemberExpression<'a>) {
        self.visit_expression(&it.object);
        if self.reference(&it.object, true)
            || (it.property.name == "value" && self.reference(&it.object, false))
        {
            self.report(it.span);
        }
    }

    fn visit_computed_member_expression(&mut self, it: &ComputedMemberExpression<'a>) {
        self.visit_expression(&it.object);
        self.visit_expression(&it.expression);
        if self.reference(&it.object, true)
            || (self.reference(&it.object, false)
                && matches!(it.expression.get_inner_expression(),
                Expression::StringLiteral(name) if name.value == "value"))
        {
            self.report(it.span);
        }
    }

    fn visit_call_expression(&mut self, it: &CallExpression<'a>) {
        self.visit_expression(&it.callee);
        for argument in &it.arguments {
            self.visit_argument(argument);
        }
        if let Expression::StaticMemberExpression(m) = it.callee.get_inner_expression()
            && m.property.name == "get"
            && self.reference(&m.object, false)
        {
            self.report(it.span);
        }
    }

    fn visit_variable_declarator(&mut self, it: &VariableDeclarator<'a>) {
        if let Some(init) = &it.init {
            self.visit_expression(init);
            if let BindingPattern::ObjectPattern(object) = &it.id {
                for property in &object.properties {
                    if self.reference(init, true)
                        || (self.reference(init, false)
                            && property
                                .key
                                .static_name()
                                .is_some_and(|name| name == "value"))
                    {
                        self.report(property.key.span());
                    }
                }
            }
        }
        self.visit_binding_pattern(&it.id);
    }

    fn visit_return_statement(&mut self, it: &ReturnStatement<'a>) {
        if let Some(value) = &it.argument {
            self.visit_expression(value);
        }
        self.abrupt();
    }

    fn visit_throw_statement(&mut self, it: &ThrowStatement<'a>) {
        self.visit_expression(&it.argument);
        for trap in &mut self.traps {
            trap.exceptions = trap.exceptions.join(self.state);
        }
        self.abrupt();
    }

    fn visit_break_statement(&mut self, it: &BreakStatement<'a>) {
        if let Some(frame) = self.frames.iter_mut().rev().find(|frame| {
            it.label.as_ref().map_or(frame.breakable, |label| {
                frame.label.as_deref() == Some(label.name.as_str())
            })
        }) {
            frame.breaks = frame.breaks.join(self.state);
        }
        self.abrupt();
    }

    fn visit_continue_statement(&mut self, it: &ContinueStatement<'a>) {
        if let Some(frame) = self.frames.iter_mut().rev().find(|frame| {
            frame.looped
                && it
                    .label
                    .as_ref()
                    .is_none_or(|label| frame.label.as_deref() == Some(label.name.as_str()))
        }) {
            frame.continues = frame.continues.join(self.state);
        }
        self.abrupt();
    }

    fn visit_if_statement(&mut self, it: &IfStatement<'a>) {
        self.branch(it);
    }
    fn visit_conditional_expression(&mut self, it: &ConditionalExpression<'a>) {
        self.conditional(it);
    }
    fn visit_logical_expression(&mut self, it: &LogicalExpression<'a>) {
        self.logical(it);
    }
    fn visit_while_statement(&mut self, it: &WhileStatement<'a>) {
        self.while_loop(it);
    }
    fn visit_do_while_statement(&mut self, it: &DoWhileStatement<'a>) {
        self.do_loop(it);
    }
    fn visit_for_statement(&mut self, it: &ForStatement<'a>) {
        self.for_loop(it);
    }
    fn visit_for_in_statement(&mut self, it: &ForInStatement<'a>) {
        self.for_in(it);
    }
    fn visit_for_of_statement(&mut self, it: &ForOfStatement<'a>) {
        self.for_of(it);
    }
    fn visit_switch_statement(&mut self, it: &SwitchStatement<'a>) {
        self.switch(it);
    }
    fn visit_try_statement(&mut self, it: &TryStatement<'a>) {
        self.try_statement(it);
    }
    fn visit_labeled_statement(&mut self, it: &LabeledStatement<'a>) {
        self.labeled(it);
    }
    fn visit_function(&mut self, _: &Function<'a>, _: ScopeFlags) {}
    fn visit_arrow_function_expression(&mut self, _: &ArrowFunctionExpression<'a>) {}
}
