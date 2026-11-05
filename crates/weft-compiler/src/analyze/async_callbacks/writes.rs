//! Only proven box targets are state writes; an ordinary `.value` is not evidence.

use oxc_ast::ast::{Expression, SimpleAssignmentTarget};

use crate::diag::{Diagnostic, Severity};

use super::super::key;
use super::reads::Flow;

impl Flow<'_, '_> {
    pub(super) fn state_write(&mut self, target: &SimpleAssignmentTarget<'_>) {
        if !self.derived || !self.state.alive() {
            return;
        }
        let (object, name, span) = match target {
            SimpleAssignmentTarget::StaticMemberExpression(member) => {
                (&member.object, member.property.name.as_str(), member.span)
            }
            SimpleAssignmentTarget::ComputedMemberExpression(member) => {
                let Expression::StringLiteral(name) = member.expression.get_inner_expression()
                else {
                    return;
                };
                (&member.object, name.value.as_str(), member.span)
            }
            _ => return,
        };
        if name != "value"
            || !self.reference(object, false)
            || !self.reported.insert(("W002", key(span)))
        {
            return;
        }
        let text = self.index.a.text(span);
        self.diagnostics.push(Diagnostic::new(
            self.index.a.source,
            "W002",
            Severity::Error,
            (span.start, span.end),
            format!("`{text}` is written inside a `derived` callback; derived computations must be pure."),
            "Move the state write to an event handler or an explicit action. Keep `derived(() => expression)` \
             pure: read state and return the computed value without assigning or updating state.",
        ));
    }
}
