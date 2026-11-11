//! Assignment properties read their source after forming a simple target reference.
//! Keep that read before defaults and nested patterns, and after computed keys.

use oxc_ast::ast::{AssignmentTargetProperty, ObjectAssignmentTarget};
use oxc_ast_visit::Visit;

use super::reads::Flow;

impl Flow<'_, '_> {
    pub(super) fn object_pattern(&mut self, it: &ObjectAssignmentTarget<'_>) {
        let read = self.pattern_read.take();
        self.watch_box_read(read);
        let source = self.pattern_box.take();
        for property in &it.properties {
            match property {
                AssignmentTargetProperty::AssignmentTargetPropertyIdentifier(property) => {
                    self.visit_identifier_reference(&property.binding);
                    if property.binding.name == "value" {
                        self.watch_box_read(source);
                    }
                    if let Some(init) = &property.init {
                        self.visit_expression(init);
                    }
                }
                AssignmentTargetProperty::AssignmentTargetPropertyProperty(property) => {
                    self.visit_property_key(&property.name);
                    self.pattern_read = if property
                        .name
                        .static_name()
                        .is_some_and(|name| name == "value")
                    {
                        source
                    } else {
                        None
                    };
                    self.visit_assignment_target_maybe_default(&property.binding);
                }
            }
        }
        if let Some(rest) = &it.rest {
            self.visit_assignment_target_rest(rest);
        }
    }
}
