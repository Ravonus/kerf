//! Lower keyed list callbacks.

use oxc_allocator::{CloneIn, TakeIn, Vec as ArenaVec};
use oxc_ast::ast::{
    ChainElement, Expression, JSXChild, JSXClosingElement, JSXElementName, JSXExpression,
    JSXOpeningElement,
};
use oxc_ast_visit::VisitMut;
use oxc_span::SPAN;

use crate::analyze::key;

use super::{Transformer, has_optional_link, row_params, take_keys};

impl<'a> Transformer<'a, '_> {
    pub(super) fn is_list(&self, e: &Expression<'a>) -> bool {
        let call = match e {
            Expression::CallExpression(c) => c,
            Expression::ChainExpression(c) => match &c.expression {
                ChainElement::CallExpression(c) => c,
                _ => return false,
            },
            _ => return false,
        };
        self.plan.lists.contains_key(&key(call.span))
    }

    pub(super) fn lower_list(&mut self, it: &mut Expression<'a>) {
        let call = match it {
            Expression::CallExpression(c) => c,
            Expression::ChainExpression(c) => match &mut c.expression {
                ChainElement::CallExpression(c) => c,
                _ => unreachable!(),
            },
            _ => unreachable!(),
        };
        let plan = &self.plan.lists[&key(call.span)];
        let Expression::StaticMemberExpression(member) = &mut call.callee else {
            unreachable!()
        };
        let mut each = member.object.take_in(&self.ast);
        self.visit_expression(&mut each);
        let each = self.rechained(each);
        let mut row = call.arguments[0].to_expression_mut().take_in(&self.ast);
        // The `by` function reuses the row's item and index patterns, taken before the row's own parameters are
        // rewritten (`key={i}` keys by position).
        let mut params: Vec<_> = row_params(&row)
            .iter()
            .take(2)
            .map(|p| p.pattern.clone_in(self.allocator))
            .collect();
        if params.is_empty() {
            params.push(self.binding("_"));
        }
        let mut by = take_keys(self, &mut row, &plan.key_attrs);
        if let Some(by) = by.as_mut() {
            self.raw.extend(plan.item_syms.iter().copied());
            self.visit_expression(by);
            for s in &plan.item_syms {
                self.raw.remove(s);
            }
        }
        self.visit_expression(&mut row);
        let mut attrs = vec![self.jsx_attr("each", each)];
        if let Some(by) = by {
            attrs.push(self.jsx_attr("by", self.arrow(params, by)));
        }
        let name = || JSXElementName::new_identifier_reference(SPAN, "For", &self.ast);
        let opening = JSXOpeningElement::boxed(
            SPAN,
            name(),
            None,
            ArenaVec::from_iter_in(attrs, &self.ast),
            &self.ast,
        );
        let closing = JSXClosingElement::boxed(SPAN, name(), &self.ast);
        let child = JSXChild::new_expression_container(SPAN, JSXExpression::from(row), &self.ast);
        let children = ArenaVec::from_iter_in([child], &self.ast);
        *it = Expression::new_jsx_element(SPAN, opening, children, Some(closing), &self.ast);
    }

    /// A list's receiver, cut out of `xs?.filter(f).map(…)`, keeps the `?.` links it holds: they need a chain of their own.
    pub(super) fn rechained(&self, e: Expression<'a>) -> Expression<'a> {
        if !has_optional_link(&e) {
            return e;
        }
        let element = match e {
            Expression::CallExpression(c) => ChainElement::CallExpression(c),
            Expression::TSNonNullExpression(n) => ChainElement::TSNonNullExpression(n),
            e if e.is_member_expression() => ChainElement::from(e.into_member_expression()),
            e => return e,
        };
        Expression::new_chain_expression(SPAN, element, &self.ast)
    }
}
