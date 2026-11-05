//! Rewrite reactive prop and tag reads.

use oxc_allocator::{CloneIn, Vec as ArenaVec};
use oxc_ast::ast::{
    ArrayExpressionElement, Expression, IdentifierReference, JSXElementName, JSXMemberExpression,
    JSXMemberExpressionObject,
};
use oxc_semantic::SymbolId;
use oxc_span::SPAN;
use oxc_syntax::operator::BinaryOperator;

use crate::analyze::{Rewrite, RowStep};

use super::Transformer;

impl<'a, 'p> Transformer<'a, 'p> {
    pub(super) fn rewrite_of(
        &self,
        id: &IdentifierReference<'a>,
    ) -> Option<(SymbolId, &'p Rewrite)> {
        let sym = id
            .reference_id
            .get()
            .and_then(|r| self.scoping.get_reference(r).symbol_id())?;
        if self.raw.contains(&sym) {
            return None;
        }
        self.plan.rewrites.get(&sym).map(|r| (sym, r))
    }

    /// The live read that replaces `original` (an identifier bound to `sym`).
    pub(super) fn rewritten(
        &mut self,
        sym: SymbolId,
        rewrite: &Rewrite,
        original: Expression<'a>,
    ) -> Expression<'a> {
        match rewrite {
            Rewrite::Prop { props, path } => {
                let read = || {
                    path.iter()
                        .fold(self.ident(props), |object, p| self.member(object, p))
                };
                match self
                    .defaults
                    .get(&sym)
                    .filter(|_| !self.local.contains(&sym))
                {
                    Some(fallback) => {
                        let fallback = fallback.clone_in(self.allocator);
                        let undefined = self.ident("undefined");
                        let test = Expression::new_binary_expression(
                            SPAN,
                            read(),
                            BinaryOperator::StrictEquality,
                            undefined,
                            &self.ast,
                        );
                        let pick = Expression::new_conditional_expression(
                            SPAN,
                            test,
                            fallback,
                            read(),
                            &self.ast,
                        );
                        Expression::new_parenthesized_expression(SPAN, pick, &self.ast)
                    }
                    None => read(),
                }
            }
            Rewrite::Via { of, path } => {
                let plan = self.plan;
                let (undefined, target) = (self.ident("undefined"), &plan.rewrites[of]);
                let base = self.rewritten(*of, target, undefined);
                path.iter().fold(base, |object, p| self.member(object, p))
            }
            Rewrite::Children { local, component } => {
                self.children_used.insert(*component);
                self.call(self.ident(local), [])
            }
            Rewrite::Rest {
                local, component, ..
            } => {
                self.rest_used.insert(*component);
                self.ident(local)
            }
            // The identifier itself becomes the callee, so it keeps its span and reference.
            Rewrite::Accessor => self.call(original, []),
            Rewrite::AccessorPath { path } => {
                path.iter()
                    .fold(self.call(self.ident("_item"), []), |at, step| match step {
                        RowStep::Key(key) => self.member(at, key),
                        RowStep::Index(index) => Expression::new_computed_member_expression(
                            SPAN,
                            at,
                            self.number(*index),
                            false,
                            &self.ast,
                        ),
                        RowStep::From(index) => {
                            self.call(self.member(at, "slice"), [self.number(*index)])
                        }
                    })
            }
        }
    }

    /// `<helper>(props, ["a", "b"])` for a rest parameter.
    pub(super) fn rest_call(
        &self,
        helper: &str,
        props: &str,
        exclude: &[String],
    ) -> Expression<'a> {
        let keys = exclude
            .iter()
            .map(|k| ArrayExpressionElement::from(self.string(k)));
        let keys = Expression::new_array_expression(
            SPAN,
            ArenaVec::from_iter_in(keys, &self.ast),
            &self.ast,
        );
        self.call(self.ident(helper), [self.ident(props), keys])
    }

    /// The rest parameter `e` names, if it is one.
    pub(super) fn rest_of(&self, e: &Expression<'a>) -> Option<&'p Rewrite> {
        let Expression::Identifier(id) = e else {
            return None;
        };
        self.rewrite_of(id)
            .map(|(_, r)| r)
            .filter(|r| matches!(r, Rewrite::Rest { .. }))
    }

    /// The live read of a component tag whose root name is rewritten: `<g.meta.icon />` → `g().meta.icon`.
    pub(super) fn tag_read(&mut self, name: &JSXElementName<'a>) -> Option<Expression<'a>> {
        match name {
            JSXElementName::IdentifierReference(id) => self.tag_root(id),
            JSXElementName::MemberExpression(m) => self.tag_member(m),
            _ => None,
        }
    }

    pub(super) fn tag_member(&mut self, m: &JSXMemberExpression<'a>) -> Option<Expression<'a>> {
        let object = match &m.object {
            JSXMemberExpressionObject::IdentifierReference(id) => self.tag_root(id),
            JSXMemberExpressionObject::MemberExpression(m) => self.tag_member(m),
            JSXMemberExpressionObject::ThisExpression(_) => None,
        }?;
        Some(self.member(object, m.property.name.as_str()))
    }

    pub(super) fn tag_root(&mut self, id: &IdentifierReference<'a>) -> Option<Expression<'a>> {
        let (sym, rewrite) = self.rewrite_of(id)?;
        let original = self.ident(id.name.as_str());
        Some(self.rewritten(sym, rewrite, original))
    }
}
