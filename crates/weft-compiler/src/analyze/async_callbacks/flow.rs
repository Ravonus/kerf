//! A two-bit continuation lattice keeps returned paths out of later reads.

use oxc_ast::ast::{
    BlockStatement, ConditionalExpression, Expression, IfStatement, LogicalExpression,
    SwitchStatement, TryStatement,
};
use oxc_ast_visit::Visit;
use oxc_syntax::operator::{LogicalOperator, UnaryOperator};

use super::reads::Flow;

#[derive(Clone, Copy, Default, PartialEq, Eq)]
pub(super) struct State {
    pub(super) tracked: bool,
    pub(super) untracked: bool,
}

impl State {
    pub(super) fn alive(self) -> bool {
        self.tracked || self.untracked
    }

    pub(super) fn join(self, other: Self) -> Self {
        Self {
            tracked: self.tracked || other.tracked,
            untracked: self.untracked || other.untracked,
        }
    }

    pub(super) fn suspend(&mut self) {
        self.untracked |= self.tracked;
        self.tracked = false;
    }
}

#[derive(Default)]
pub(super) struct Frame {
    pub(super) label: Option<String>,
    pub(super) looped: bool,
    pub(super) breakable: bool,
    pub(super) breaks: State,
    pub(super) continues: State,
}

#[derive(Default)]
pub(super) struct Trap {
    pub(super) exceptions: State,
    pub(super) abrupt: State,
}

pub(super) fn truth(expression: &Expression<'_>) -> Option<bool> {
    match expression.get_inner_expression() {
        Expression::BooleanLiteral(value) => Some(value.value),
        Expression::NullLiteral(_) => Some(false),
        Expression::NumericLiteral(value) => Some(value.value != 0.0 && !value.value.is_nan()),
        Expression::StringLiteral(value) => Some(!value.value.is_empty()),
        Expression::UnaryExpression(value) if value.operator == UnaryOperator::LogicalNot => {
            truth(&value.argument).map(|value| !value)
        }
        _ => None,
    }
}

impl Flow<'_, '_> {
    pub(super) fn branch<'a>(&mut self, it: &IfStatement<'a>) {
        self.visit_expression(&it.test);
        let entry = self.state;
        let test = truth(&it.test);
        if test != Some(false) {
            self.visit_statement(&it.consequent);
        } else {
            self.state = State::default();
        }
        let consequent = self.state;
        self.state = if test == Some(true) {
            State::default()
        } else {
            entry
        };
        if let Some(alternate) = &it.alternate {
            self.visit_statement(alternate);
        }
        self.state = self.state.join(consequent);
    }

    pub(super) fn conditional<'a>(&mut self, it: &ConditionalExpression<'a>) {
        self.visit_expression(&it.test);
        let entry = self.state;
        let test = truth(&it.test);
        self.state = if test == Some(false) {
            State::default()
        } else {
            entry
        };
        if self.state.alive() {
            self.visit_expression(&it.consequent);
        }
        let consequent = self.state;
        self.state = if test == Some(true) {
            State::default()
        } else {
            entry
        };
        if self.state.alive() {
            self.visit_expression(&it.alternate);
        }
        self.state = self.state.join(consequent);
    }

    pub(super) fn logical<'a>(&mut self, it: &LogicalExpression<'a>) {
        self.visit_expression(&it.left);
        let entry = self.state;
        let take_right = match it.operator {
            LogicalOperator::And => truth(&it.left),
            LogicalOperator::Or => truth(&it.left).map(|value| !value),
            LogicalOperator::Coalesce => match it.left.get_inner_expression() {
                Expression::NullLiteral(_) => Some(true),
                Expression::BooleanLiteral(_)
                | Expression::NumericLiteral(_)
                | Expression::StringLiteral(_) => Some(false),
                _ => None,
            },
        };
        if take_right != Some(false) {
            self.visit_expression(&it.right);
        }
        if take_right != Some(true) {
            self.state = self.state.join(entry);
        }
    }

    pub(super) fn switch<'a>(&mut self, it: &SwitchStatement<'a>) {
        self.visit_expression(&it.discriminant);
        let mut entries = vec![State::default(); it.cases.len()];
        let mut default = None;
        for (index, case) in it.cases.iter().enumerate() {
            if let Some(test) = &case.test {
                self.visit_expression(test);
                entries[index] = self.state;
            } else {
                default = Some(index);
            }
        }
        let unmatched = self.state;
        if let Some(index) = default {
            entries[index] = unmatched;
        }
        self.frames.push(Frame {
            breakable: true,
            ..Frame::default()
        });
        self.state = State::default();
        for (case, entry) in it.cases.iter().zip(entries) {
            self.state = self.state.join(entry);
            for statement in &case.consequent {
                self.visit_statement(statement);
            }
        }
        self.state = self.state.join(self.frames.pop().unwrap().breaks);
        if default.is_none() {
            self.state = self.state.join(unmatched);
        }
    }

    pub(super) fn try_statement<'a>(&mut self, it: &TryStatement<'a>) {
        let saved = self.take_exits();
        let entry = self.state;
        self.traps.push(Trap {
            exceptions: entry,
            ..Trap::default()
        });
        self.visit_block_statement(&it.block);
        let trapped = self.traps.pop().unwrap();
        let normal = self.state;
        let mut abrupt = trapped.abrupt;
        if let Some(handler) = &it.handler {
            self.state = trapped.exceptions;
            self.traps.push(Trap::default());
            self.visit_catch_clause(handler);
            abrupt = abrupt.join(self.traps.pop().unwrap().abrupt);
            self.state = self.state.join(normal);
        } else {
            abrupt = abrupt.join(trapped.exceptions);
        }
        if let Some(finalizer) = &it.finalizer {
            self.finalizer(finalizer, abrupt);
        }
        for (frame, (breaks, continues)) in self.frames.iter_mut().zip(saved) {
            frame.breaks = frame.breaks.join(breaks);
            frame.continues = frame.continues.join(continues);
        }
    }

    fn take_exits(&mut self) -> Vec<(State, State)> {
        self.frames
            .iter_mut()
            .map(|frame| {
                (
                    std::mem::take(&mut frame.breaks),
                    std::mem::take(&mut frame.continues),
                )
            })
            .collect()
    }

    fn finalizer<'a>(&mut self, block: &BlockStatement<'a>, abrupt: State) {
        let normal = self.state;
        let pending = self.take_exits();
        // A return/throw runs finally too, but must not revive a continuation.
        self.state = abrupt;
        self.visit_block_statement(block);
        for (index, (breaks, continues)) in pending.into_iter().enumerate() {
            self.state = breaks;
            self.visit_block_statement(block);
            self.frames[index].breaks = self.frames[index].breaks.join(self.state);
            self.state = continues;
            self.visit_block_statement(block);
            self.frames[index].continues = self.frames[index].continues.join(self.state);
        }
        self.state = normal;
        self.visit_block_statement(block);
    }
}
