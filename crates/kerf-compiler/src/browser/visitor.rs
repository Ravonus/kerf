//! Walk the program for browser diagnostics.

use oxc_ast::ast::{
    ArrowFunctionExpression, AwaitExpression, BindingPattern, CallExpression, Expression, Function,
    JSXAttribute, JSXAttributeName, JSXAttributeValue, NewExpression, VariableDeclarator,
};
use oxc_ast_visit::{Visit, walk};
use oxc_syntax::scope::ScopeFlags;

use super::{Checker, Role, VALUES, is_fn};

impl<'a> Visit<'a> for Checker<'_> {
    fn visit_variable_declarator(&mut self, it: &VariableDeclarator<'a>) {
        if let BindingPattern::BindingIdentifier(id) = &it.id
            && let Some(init) = it
                .init
                .as_ref()
                .map(oxc_ast::ast::Expression::without_parentheses)
        {
            if is_fn(init) {
                self.pending_name = Some(id.name.to_string());
            }
            if let Expression::CallExpression(c) = init {
                let live = self
                    .browser_fn(&c.callee)
                    .is_some_and(|n| VALUES.contains(&n))
                    || matches!(&c.callee, Expression::StaticMemberExpression(m) if m.property.name == "live")
                    || matches!(&c.callee, Expression::Identifier(f) if self.symbol(f).is_some_and(|s| self.server_imports.contains(&s)));
                if live && let Some(sym) = id.symbol_id.get() {
                    self.live.insert(sym);
                }
            }
        }
        walk::walk_variable_declarator(self, it);
        self.pending_name = None;
    }

    fn visit_function(&mut self, it: &Function<'a>, flags: ScopeFlags) {
        let name = it
            .id
            .as_ref()
            .map(|i| i.name.to_string())
            .or_else(|| self.pending_name.take());
        let (role, component) = self.role_for(name);
        self.enter_fn(role, component && it.body.is_some(), |s| {
            walk::walk_function(s, it, flags);
        });
    }

    fn visit_arrow_function_expression(&mut self, it: &ArrowFunctionExpression<'a>) {
        let name = self.pending_name.take();
        let (role, component) = self.role_for(name);
        self.enter_fn(role, component, |s| {
            walk::walk_arrow_function_expression(s, it);
        });
    }

    fn visit_await_expression(&mut self, it: &AwaitExpression<'a>) {
        walk::walk_await_expression(self, it);
        if let Some(f) = self.fns.last_mut() {
            f.awaited = true;
        }
    }

    fn visit_jsx_attribute(&mut self, it: &JSXAttribute<'a>) {
        let handler = matches!(&it.name, JSXAttributeName::Identifier(n)
            if n.name.len() > 2 && n.name.starts_with("on") && n.name.as_bytes()[2].is_ascii_uppercase());
        if handler
            && let Some(JSXAttributeValue::ExpressionContainer(c)) = &it.value
            && c.expression.as_expression().is_some_and(is_fn)
        {
            self.next_role = Some(Role::Unowned("in an event handler"));
        }
        walk::walk_jsx_attribute(self, it);
        self.next_role = None;
    }

    fn visit_new_expression(&mut self, it: &NewExpression<'a>) {
        if let Expression::Identifier(id) = &it.callee
            && matches!(id.name.as_str(), "WebSocket" | "EventSource")
            && let Some(c) = self.comps.last_mut()
        {
            c.sockets.push((it.span, id.name.to_string()));
        }
        walk::walk_new_expression(self, it);
    }

    fn visit_call_expression(&mut self, it: &CallExpression<'a>) {
        self.raw(it);
        if let Some(name) = self.browser_fn(&it.callee).map(String::from) {
            self.browser_call(it, &name);
        }
        if matches!(&it.callee, Expression::Identifier(id) if id.name == "watch") {
            self.watch_copy(it);
        }
        let role = self.callback_role(it);
        self.visit_expression(&it.callee);
        for arg in &it.arguments {
            if arg.as_expression().is_some_and(is_fn) {
                self.next_role = Some(role);
            }
            self.visit_argument(arg);
            self.next_role = None;
        }
    }
}
