//! Iterate loop continuations to a fixed point, including a resumed back edge.

use oxc_ast::ast::{
    DoWhileStatement, ForInStatement, ForOfStatement, ForStatement, LabeledStatement, Statement,
    WhileStatement,
};
use oxc_ast_visit::Visit;

use super::flow::{Frame, State, truth};
use super::reads::Flow;

impl Flow<'_, '_> {
    fn repeat(&mut self, mut step: impl FnMut(&mut Self) -> State) {
        self.frames.push(Frame {
            label: self.label.take(),
            looped: true,
            breakable: true,
            ..Frame::default()
        });
        let entry = self.state;
        let mut header = entry;
        let mut exits = State::default();
        loop {
            self.state = header;
            exits = exits.join(step(self));
            self.next_iteration();
            let next = entry.join(self.state);
            if next == header {
                break;
            }
            header = next;
        }
        let frame = self
            .frames
            .pop()
            .expect("repeat keeps its frame until all iterations finish");
        self.state = exits.join(frame.breaks);
    }

    fn next_iteration(&mut self) {
        let frame = self
            .frames
            .last_mut()
            .expect("loop steps run inside the frame pushed by repeat");
        self.state = self.state.join(std::mem::take(&mut frame.continues));
    }

    pub(super) fn while_loop(&mut self, it: &WhileStatement<'_>) {
        self.repeat(|flow| {
            flow.visit_expression(&it.test);
            let tested = flow.state;
            let test = truth(&it.test);
            flow.state = if test == Some(false) {
                State::default()
            } else {
                tested
            };
            flow.visit_statement(&it.body);
            if test == Some(true) {
                State::default()
            } else {
                tested
            }
        });
    }

    pub(super) fn do_loop(&mut self, it: &DoWhileStatement<'_>) {
        self.repeat(|flow| {
            flow.visit_statement(&it.body);
            flow.next_iteration();
            if flow.state.alive() {
                flow.visit_expression(&it.test);
            }
            let tested = flow.state;
            let test = truth(&it.test);
            if test == Some(false) {
                flow.state = State::default();
            }
            if test == Some(true) {
                State::default()
            } else {
                tested
            }
        });
    }

    pub(super) fn for_loop(&mut self, it: &ForStatement<'_>) {
        if let Some(init) = &it.init {
            self.visit_for_statement_init(init);
        }
        self.repeat(|flow| {
            if let Some(test) = &it.test {
                flow.visit_expression(test);
            }
            let tested = flow.state;
            let test = it.test.as_ref().map_or(Some(true), truth);
            flow.state = if test == Some(false) {
                State::default()
            } else {
                tested
            };
            flow.visit_statement(&it.body);
            flow.next_iteration();
            if flow.state.alive()
                && let Some(update) = &it.update
            {
                flow.visit_expression(update);
            }
            if test == Some(true) {
                State::default()
            } else {
                tested
            }
        });
    }

    pub(super) fn for_in(&mut self, it: &ForInStatement<'_>) {
        self.visit_expression(&it.right);
        self.repeat(|flow| {
            let exit = flow.state;
            flow.visit_for_statement_left(&it.left);
            flow.visit_statement(&it.body);
            exit
        });
    }

    pub(super) fn for_of(&mut self, it: &ForOfStatement<'_>) {
        self.visit_expression(&it.right);
        self.repeat(|flow| {
            if it.r#await {
                flow.suspend();
            }
            let exit = flow.state;
            flow.visit_for_statement_left(&it.left);
            flow.visit_statement(&it.body);
            exit
        });
    }

    pub(super) fn labeled(&mut self, it: &LabeledStatement<'_>) {
        let label = Some(it.label.name.to_string());
        if matches!(
            &it.body,
            Statement::WhileStatement(_)
                | Statement::DoWhileStatement(_)
                | Statement::ForStatement(_)
                | Statement::ForInStatement(_)
                | Statement::ForOfStatement(_)
        ) {
            let previous = std::mem::replace(&mut self.label, label);
            self.visit_statement(&it.body);
            self.label = previous;
        } else {
            self.frames.push(Frame {
                label,
                ..Frame::default()
            });
            self.visit_statement(&it.body);
            let frame = self
                .frames
                .pop()
                .expect("a labeled block pushes a frame before visiting its body");
            self.state = self.state.join(frame.breaks);
        }
    }
}
