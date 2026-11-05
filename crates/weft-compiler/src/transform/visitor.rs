//! Walk and apply the planned transforms.

use oxc_allocator::{TakeIn, Vec as ArenaVec};
use oxc_ast::ast::{
    ArrowFunctionBody, ArrowFunctionExpression, Expression, Function, FunctionBody,
    JSXAttributeItem, JSXChild, JSXElementName, JSXOpeningElement, ObjectProperty,
    SimpleAssignmentTarget, Statement,
};
use oxc_ast_visit::{VisitMut, walk_mut};
use oxc_span::SPAN;
use oxc_syntax::scope::ScopeFlags;

use crate::analyze::{Rewrite, key};
use crate::emit::TAG;

use super::Transformer;

impl<'a> VisitMut<'a> for Transformer<'a, '_> {
    /// Aliases go first, so a closure above one already reads it live, defaults included.
    fn visit_statements(&mut self, it: &mut ArenaVec<'a, Statement<'a>>) {
        let aliases = &self.plan.aliases;
        if !aliases.is_empty() {
            for statement in it.iter_mut() {
                let Statement::VariableDeclaration(d) = statement else {
                    continue;
                };
                for declarator in d
                    .declarations
                    .iter_mut()
                    .filter(|x| aliases.contains(&key(x.span)))
                {
                    self.take_defaults(&mut declarator.id);
                }
                d.declarations.retain(|x| !aliases.contains(&key(x.span)));
            }
            it.retain(
                |s| !matches!(s, Statement::VariableDeclaration(d) if d.declarations.is_empty()),
            );
        }
        walk_mut::walk_statements(self, it);
    }

    fn visit_expression(&mut self, it: &mut Expression<'a>) {
        if let Expression::Identifier(id) = it
            && let Some((sym, rewrite)) = self.rewrite_of(id)
        {
            let original = it.take_in(&self.ast);
            *it = self.rewritten(sym, rewrite, original);
            return;
        }
        // `bind(box)` as a component prop: the back end reads this name and gives the prop a setter.
        if let Expression::CallExpression(c) = it
            && self.plan.bound.contains(&key(c.span))
        {
            c.callee = self.ident("_$bound");
        }
        // `rest.x` is `props.x` (or nothing, for a key the pattern took).
        if let Expression::StaticMemberExpression(m) = it
            && let Some(Rewrite::Rest { props, exclude, .. }) = self.rest_of(&m.object)
        {
            let name = m.property.name.as_str();
            *it = if exclude.iter().any(|k| k == name) {
                self.ident("undefined")
            } else {
                self.member(self.ident(props), name)
            };
            return;
        }
        if let Expression::StaticMemberExpression(m) = it
            && let Some((local, component)) = self.plan.children_reads.get(&key(m.span))
        {
            self.children_used.insert(*component);
            *it = self.call(self.ident(local), []);
            return;
        }
        if self.is_list(it) {
            self.lower_list(it);
            return;
        }
        walk_mut::walk_expression(self, it);
    }

    fn visit_jsx_opening_element(&mut self, it: &mut JSXOpeningElement<'a>) {
        // `<div {...rest}>`: the element's spread reads every attribute anyway, so it gets a plain copy, not a view.
        if matches!(
            it.name,
            JSXElementName::Identifier(_) | JSXElementName::NamespacedName(_)
        ) {
            for attr in &mut it.attributes {
                if let JSXAttributeItem::SpreadAttribute(s) = attr
                    && let Some(Rewrite::Rest { props, exclude, .. }) = self.rest_of(&s.argument)
                {
                    s.argument = self.rest_call("_$restOf", props, exclude);
                    self.needs_rest_of = true;
                }
            }
        }
        walk_mut::walk_jsx_opening_element(self, it);
        // A tag can't hold `g()`: the read goes beside it, and the back end calls it instead of the tag's text.
        if let Some(read) = self.tag_read(&it.name) {
            it.attributes.push(self.jsx_attr(TAG, read));
        }
    }

    fn visit_jsx_child(&mut self, it: &mut JSXChild<'a>) {
        if let JSXChild::ExpressionContainer(c) = it
            && let Some(e) = c.expression.as_expression_mut()
            && self.is_list(e)
        {
            self.lower_list(e);
            if let Expression::JSXElement(el) = e.take_in(&self.ast) {
                *it = JSXChild::Element(el);
            }
            return;
        }
        walk_mut::walk_jsx_child(self, it);
    }

    /// `amount = 5` writes the prop, and `localProps` keeps it in the component.
    fn visit_simple_assignment_target(&mut self, it: &mut SimpleAssignmentTarget<'a>) {
        if let SimpleAssignmentTarget::AssignmentTargetIdentifier(id) = it
            && let Some((_, Rewrite::Prop { props, path })) = self.rewrite_of(id)
            && let Expression::StaticMemberExpression(m) = path
                .iter()
                .fold(self.ident(props), |object, p| self.member(object, p))
        {
            *it = SimpleAssignmentTarget::StaticMemberExpression(m);
            return;
        }
        walk_mut::walk_simple_assignment_target(self, it);
    }

    fn visit_object_property(&mut self, it: &mut ObjectProperty<'a>) {
        if it.shorthand
            && let Expression::Identifier(id) = &it.value
            && self.rewrite_of(id).is_some()
        {
            it.shorthand = false;
        }
        walk_mut::walk_object_property(self, it);
    }

    fn visit_function(&mut self, it: &mut Function<'a>, flags: ScopeFlags) {
        let span = key(it.span);
        self.enter_params(&mut it.params, span);
        walk_mut::walk_function(self, it, flags);
        if let Some(body) = it.body.as_mut() {
            self.exit_component(span, body);
        }
    }

    fn visit_arrow_function_expression(&mut self, it: &mut ArrowFunctionExpression<'a>) {
        let span = key(it.span);
        self.enter_params(&mut it.params, span);
        walk_mut::walk_arrow_function_expression(self, it);
        if self.declares(span) {
            // `({ children }) => <div>{children}</div>`: the memo needs a statement, so the body becomes a block.
            if let Some(e) = it.body.as_expression_mut() {
                let e = e.take_in(&self.ast);
                let ret = Statement::new_return_statement(SPAN, Some(e), &self.ast);
                let statements = ArenaVec::from_iter_in([ret], &self.ast);
                it.body = ArrowFunctionBody::FunctionBody(FunctionBody::boxed(
                    SPAN,
                    ArenaVec::new_in(&self.ast),
                    statements,
                    &self.ast,
                ));
            }
            if let ArrowFunctionBody::FunctionBody(body) = &mut it.body {
                self.exit_component(span, body);
            }
        }
    }
}
