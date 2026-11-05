//! Preserve component defaults and local prop state.

use oxc_allocator::{CloneIn, TakeIn, Vec as ArenaVec};
use oxc_ast::ast::{
    ArrayExpressionElement, AssignmentOperator, AssignmentTarget, BindingPattern, Expression,
    FormalParameters, FunctionBody, Statement,
};
use oxc_ast_visit::VisitMut;
use oxc_span::SPAN;

use crate::analyze::{Rewrite, SpanKey};

use super::{Transformer, Unspan};

impl<'a> Transformer<'a, '_> {
    /// Before walking a component: move its prop defaults out of the pattern (rewritten, in declaration order so
    /// `b = a` sees `a`'s live read), then replace the pattern with the props parameter.
    pub(super) fn enter_params(&mut self, params: &mut FormalParameters<'a>, span: SpanKey) {
        let name = if let Some(props) = self.plan.components.get(&span) {
            props.as_str()
        } else if self.plan.destructured_rows.contains(&span) {
            "_item"
        } else {
            return;
        };
        let Some(first) = params.items.first_mut() else {
            return;
        };
        if self.plan.components.contains_key(&span) {
            self.take_defaults(&mut first.pattern);
        }
        first.pattern = self.binding(name);
    }

    pub(super) fn take_defaults(&mut self, pattern: &mut BindingPattern<'a>) {
        let BindingPattern::ObjectPattern(obj) = pattern else {
            return;
        };
        for prop in &mut obj.properties {
            match &mut prop.value {
                BindingPattern::AssignmentPattern(ap) => {
                    let BindingPattern::BindingIdentifier(id) = &ap.left else {
                        continue;
                    };
                    let Some(sym) = id.symbol_id.get() else {
                        continue;
                    };
                    let mut fallback = ap.right.take_in(&self.ast);
                    self.visit_expression(&mut fallback);
                    Unspan.visit_expression(&mut fallback);
                    self.defaults.insert(sym, fallback);
                }
                inner @ BindingPattern::ObjectPattern(_) => self.take_defaults(inner),
                _ => {}
            }
        }
    }

    /// Whether the component declares anything at the top of its body.
    pub(super) fn declares(&self, span: SpanKey) -> bool {
        self.children_used.contains(&span)
            || self.rest_used.contains(&span)
            || self.plan.local_props.contains_key(&span)
    }

    /// After walking a component: declare its memoised children and its rest view at the top of the body, if used.
    pub(super) fn exit_component(&mut self, span: SpanKey, body: &mut FunctionBody<'a>) {
        if self.rest_used.contains(&span) {
            let rest = self.plan.rewrites.values().find_map(|r| match r {
                Rewrite::Rest {
                    props,
                    exclude,
                    local,
                    component,
                } if *component == span => Some((props, exclude, local)),
                _ => None,
            });
            if let Some((props, exclude, local)) = rest {
                let view = self.rest_call("_$omit", props, exclude);
                body.statements.insert(0, self.const_decl(local, view));
            }
        }
        if let Some(children) = self.plan.children.get(&span)
            && self.children_used.contains(&span)
        {
            let read = self.arrow([], self.member(self.ident(&children.props), "children"));
            let memo = self.call(self.ident("_$weftMemo"), [read]);
            body.statements
                .insert(0, self.const_decl(&children.local, memo));
            self.needs_memo = true;
        }
        // First: everything above reads the props through it.
        if let Some((props, keys)) = self.plan.local_props.get(&span) {
            let mut fields = Vec::new();
            for (k, sym) in keys {
                fields.push(self.string(k));
                fields.push(match self.defaults.get(sym) {
                    Some(f) => self.arrow([], f.clone_in(self.allocator)),
                    None => self.number(0),
                });
            }
            let items = ArenaVec::from_iter_in(
                fields.into_iter().map(ArrayExpressionElement::from),
                &self.ast,
            );
            let fallbacks = Expression::new_array_expression(SPAN, items, &self.ast);
            let view = self.call(self.ident("_$localProps"), [self.ident(props), fallbacks]);
            let target = AssignmentTarget::new_assignment_target_identifier(
                SPAN,
                self.str(props),
                &self.ast,
            );
            let assign = Expression::new_assignment_expression(
                SPAN,
                AssignmentOperator::Assign,
                target,
                view,
                &self.ast,
            );
            body.statements.insert(
                0,
                Statement::new_expression_statement(SPAN, assign, &self.ast),
            );
            self.needs_local = true;
        }
    }
}
