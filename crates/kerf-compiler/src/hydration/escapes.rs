//! Escapes for hydration.

use super::{
    AssignmentTarget, ComputedMemberExpression, Expression, IdentifierReference,
    JSXSpreadAttribute, Scoping, SimpleAssignmentTarget, SpreadElement, StaticMemberExpression,
    SymbolId, TSType, Visit, walk,
};

/// What a component does with its props objects: anything but reading a member or spreading one could change what's in them.
pub(super) struct Escapes<'s> {
    pub(super) scoping: &'s Scoping,
    pub(super) objects: &'s [SymbolId],
    pub(super) writing: u32,
    pub(super) gone: Vec<SymbolId>,
    pub(super) arguments: bool,
}

impl Escapes<'_> {
    fn read(&self, e: &Expression<'_>) -> bool {
        self.writing == 0
            && matches!(e.get_inner_expression(), Expression::Identifier(id) if id.reference_id.get().and_then(|r| self.scoping.get_reference(r).symbol_id()).is_some_and(|s| self.objects.contains(&s)))
    }
}

impl<'a> Visit<'a> for Escapes<'_> {
    fn visit_ts_type(&mut self, _: &TSType<'a>) {}

    fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
        match it
            .reference_id
            .get()
            .and_then(|r| self.scoping.get_reference(r).symbol_id())
        {
            Some(s) if self.objects.contains(&s) => self.gone.push(s),
            None if it.name == "arguments" => self.arguments = true,
            _ => {}
        }
    }

    fn visit_static_member_expression(&mut self, it: &StaticMemberExpression<'a>) {
        if !self.read(&it.object) {
            walk::walk_static_member_expression(self, it);
        }
    }

    fn visit_computed_member_expression(&mut self, it: &ComputedMemberExpression<'a>) {
        if self.read(&it.object) {
            self.visit_expression(&it.expression);
        } else {
            walk::walk_computed_member_expression(self, it);
        }
    }

    fn visit_jsx_spread_attribute(&mut self, it: &JSXSpreadAttribute<'a>) {
        if !self.read(&it.argument) {
            walk::walk_jsx_spread_attribute(self, it);
        }
    }

    fn visit_spread_element(&mut self, it: &SpreadElement<'a>) {
        if !self.read(&it.argument) {
            walk::walk_spread_element(self, it);
        }
    }

    fn visit_assignment_target(&mut self, it: &AssignmentTarget<'a>) {
        self.writing += 1;
        walk::walk_assignment_target(self, it);
        self.writing -= 1;
    }

    fn visit_simple_assignment_target(&mut self, it: &SimpleAssignmentTarget<'a>) {
        self.writing += 1;
        walk::walk_simple_assignment_target(self, it);
        self.writing -= 1;
    }
}
