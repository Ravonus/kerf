//! Lower keyed list callbacks.

use oxc_allocator::{CloneIn, TakeIn, Vec as ArenaVec};
use oxc_ast::ast::{
    ArrayExpressionElement, ArrowFunctionBody, ChainElement, Expression, JSXChild,
    JSXClosingElement, JSXElementName, JSXExpression, JSXOpeningElement,
};
use oxc_ast_visit::VisitMut;
use oxc_span::SPAN;

use crate::analyze::key;

use super::{Transformer, has_optional_link, last_return, row_params, take_keys};

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
        let row = row.without_parentheses_mut();
        let by = take_keys(self, row, &plan.key_attrs);
        let mut attrs = vec![self.jsx_attr("each", each)];
        let children = match (by, plan.scoped_key) {
            (Some(by), true) => {
                self.prepare_row(row, by);
                self.visit_expression(row);
                attrs.push(self.jsx_attr("prepare", row.take_in(&self.ast)));
                ArenaVec::new_in(&self.ast)
            }
            (by, _) => {
                if let Some(by) = by {
                    let by = self.list_by(row, by, &plan.item_syms);
                    attrs.push(self.jsx_attr("by", by));
                }
                self.visit_expression(row);
                let child = JSXChild::new_expression_container(
                    SPAN,
                    JSXExpression::from(row.take_in(&self.ast)),
                    &self.ast,
                );
                ArenaVec::from_iter_in([child], &self.ast)
            }
        };
        let name = || JSXElementName::new_identifier_reference(SPAN, "For", &self.ast);
        let opening = JSXOpeningElement::boxed(
            SPAN,
            name(),
            None,
            ArenaVec::from_iter_in(attrs, &self.ast),
            &self.ast,
        );
        let closing = JSXClosingElement::boxed(SPAN, name(), &self.ast);
        *it = Expression::new_jsx_element(SPAN, opening, children, Some(closing), &self.ast);
    }

    fn list_by(
        &mut self,
        row: &Expression<'a>,
        mut by: Expression<'a>,
        item_syms: &[oxc_semantic::SymbolId],
    ) -> Expression<'a> {
        // The `by` function reuses the row's item and index patterns, taken before the row's own parameters are
        // rewritten (`key={i}` keys by position).
        let mut params: Vec<_> = row_params(row)
            .iter()
            .take(2)
            .map(|p| p.pattern.clone_in(self.allocator))
            .collect();
        if params.is_empty() {
            params.push(self.binding("_"));
        }
        self.raw.extend(item_syms.iter().copied());
        self.visit_expression(&mut by);
        for s in item_syms {
            self.raw.remove(s);
        }
        self.arrow(params, by)
    }

    fn prepare_row(&self, row: &mut Expression<'a>, by: Expression<'a>) {
        // Leave setup and the key in the original scope. JSX must wait for the runtime to select the row's
        // owner and hydration path, and is only needed if a matching row doesn't already exist.
        let statements = match row {
            Expression::ArrowFunctionExpression(f) => {
                f.return_type = None;
                let ArrowFunctionBody::FunctionBody(body) = &mut f.body else {
                    unreachable!()
                };
                &mut body.statements
            }
            Expression::FunctionExpression(f) => {
                f.return_type = None;
                &mut f.body.as_mut().expect("a scoped row has a body").statements
            }
            _ => unreachable!(),
        };
        let ret = last_return(statements).expect("a scoped row has a final return value");
        let render = self.arrow([], ret.take_in(&self.ast));
        *ret = Expression::new_array_expression(
            SPAN,
            ArenaVec::from_iter_in(
                [by, render].into_iter().map(ArrayExpressionElement::from),
                &self.ast,
            ),
            &self.ast,
        );
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
