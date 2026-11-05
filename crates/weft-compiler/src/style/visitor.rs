//! Walk group uses and calls in the program.

use oxc_allocator::Vec as ArenaVec;
use oxc_ast::ast::{CallExpression, Expression, JSXAttributeItem, JSXOpeningElement};
use oxc_ast_visit::{VisitMut, walk_mut};
use oxc_span::Span;

use crate::diag::{Diagnostic, Severity, line_col};

use super::Lower;
use super::values::{not_static, resolves};

impl<'a> VisitMut<'a> for Lower<'a, '_> {
    fn visit_jsx_opening_element(&mut self, it: &mut JSXOpeningElement<'a>) {
        let is_group = |a: &JSXAttributeItem, me: &Self| match a {
            JSXAttributeItem::SpreadAttribute(s) => match &s.argument {
                Expression::StaticMemberExpression(m) => me.meta_of(&m.object).is_some(),
                Expression::CallExpression(c) => me.meta_of(&c.callee).is_some(),
                _ => false,
            },
            JSXAttributeItem::Attribute(_) => false,
        };
        let roots: Vec<(Span, String)> = it
            .attributes
            .iter()
            .filter_map(|a| match a {
                JSXAttributeItem::SpreadAttribute(s) => match &s.argument {
                    Expression::CallExpression(c) => {
                        self.meta_of(&c.callee).map(|m| (s.span, m.name.clone()))
                    }
                    _ => None,
                },
                JSXAttributeItem::Attribute(_) => None,
            })
            .collect();
        if let [(_, first), .., (span, last)] = roots.as_slice() {
            let message = format!(
                "two group roots on one element: {first} and {last} (the last `data-g` would win)"
            );
            let help = "One group per element: nest an element for the second group, or make the variation an axis of one group.";
            self.diagnostics.push(Diagnostic::new(
                self.source,
                "D024",
                Severity::Error,
                (span.start, span.end),
                message,
                help,
            ));
        }
        if it.attributes.iter().any(|a| is_group(a, self)) {
            let old = std::mem::replace(&mut it.attributes, ArenaVec::new_in(&self.ast));
            for mut item in old {
                if is_group(&item, self)
                    && let JSXAttributeItem::SpreadAttribute(s) = &mut item
                {
                    let line = line_col(self.source, s.span.start).0;
                    if let Some(attrs) = self.lower(&mut s.argument, line) {
                        it.attributes.extend(attrs);
                        continue;
                    }
                }
                it.attributes.push(item);
            }
        }
        walk_mut::walk_jsx_opening_element(self, it);
    }

    fn visit_call_expression(&mut self, it: &mut CallExpression<'a>) {
        if self.group_fn.is_some()
            && resolves(self.scoping, &it.callee) == self.group_fn
            && !self.handled.contains(&it.span.start)
        {
            self.diagnostics.push(not_static(
                self.source,
                it.span,
                "a group() call outside a top-level `const`",
                "Define groups as `export const name = group('name', { … })` at the top of a module.",
            ));
        }
        walk_mut::walk_call_expression(self, it);
    }
}
