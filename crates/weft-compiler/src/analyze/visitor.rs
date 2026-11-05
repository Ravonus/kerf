//! Walk the syntax tree to build the analysis plan and diagnostics.

use oxc_ast::ast::{
    ArrowFunctionExpression, AssignmentExpression, AssignmentTarget,
    AssignmentTargetPropertyIdentifier, BindingPattern, CallExpression, Expression,
    FormalParameters, Function, IdentifierReference, ImportDeclaration, ImportDeclarationSpecifier,
    JSXAttributeItem, JSXAttributeName, JSXAttributeValue, JSXChild, JSXElement, JSXElementName,
    JSXExpressionContainer, JSXFragment, JSXOpeningElement, ObjectPropertyKind,
    SimpleAssignmentTarget, Statement, StaticMemberExpression, VariableDeclarationKind,
    VariableDeclarator,
};
use oxc_ast_visit::{Visit, walk};
use oxc_span::GetSpan;
use oxc_syntax::scope::ScopeFlags;

use super::{
    Analyzer, Reactive, Snapshot, binding_symbol, callee_name, chain_root_member,
    is_component_name, jsx_name, key, map_callback, returned, returns_jsx, spread_of_param,
    symbol_of,
};

impl<'a> Visit<'a> for Analyzer<'_> {
    fn visit_statement(&mut self, it: &Statement<'a>) {
        if let Statement::VariableDeclaration(d) = it
            && self.body_level().is_some()
        {
            for declarator in &d.declarations {
                if d.kind == VariableDeclarationKind::Const && self.const_written(declarator) {
                    continue;
                }
                self.try_alias(declarator);
            }
        }
        walk::walk_statement(self, it);
    }

    fn visit_variable_declarator(&mut self, it: &VariableDeclarator<'a>) {
        if self.plan.aliases.contains(&key(it.span)) {
            // Applied at each read (`transform`), as a parameter's are, so reads in a default are live too.
            self.nested(|s| s.visit_binding_pattern(&it.id));
            return;
        }
        if self.plan.aliases_refused.contains(&key(it.span)) {
            return;
        }
        let name = match &it.id {
            BindingPattern::BindingIdentifier(id) => {
                Some((id.name.to_string(), binding_symbol(id)))
            }
            _ => None,
        };
        let init = it
            .init
            .as_ref()
            .map(oxc_ast::ast::Expression::without_parentheses);
        if let (
            Some((n, _)),
            Some(Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_)),
        ) = (&name, init)
        {
            self.pending_name = Some(n.clone());
        }
        let derives = matches!(init, Some(Expression::CallExpression(c)) if callee_name(c) == Some("derived"));
        let body_level = self.body_level().is_some();
        if body_level
            && let (Some((n, Some(sym))), Some(Expression::CallExpression(call))) = (&name, init)
            && callee_name(call) == Some("untrack")
            && let Some(arg) = call.arguments.first().and_then(|a| a.as_expression())
        {
            let mut reactive = Reactive {
                a: self,
                found: false,
            };
            reactive.visit_expression(arg);
            if reactive.found {
                let snap = Snapshot {
                    sym: *sym,
                    name: n.clone(),
                    callee: call.callee.span(),
                    call: call.span,
                    jsx: Vec::new(),
                    other: false,
                };
                if let Some(c) = self.comps.last_mut() {
                    c.snapshots.push(snap);
                }
            }
        }
        let prev_decl = self.comps.last().and_then(|c| c.body_decl);
        if body_level && let (Some(c), Some(init)) = (self.comps.last_mut(), &it.init) {
            c.body_decl = Some(init.span());
        }
        if derives {
            self.spread_ctx.push(name.and_then(|(_, s)| s));
        }
        walk::walk_variable_declarator(self, it);
        if derives {
            self.spread_ctx.pop();
        }
        if let Some(c) = self.comps.last_mut() {
            c.body_decl = prev_decl;
        }
        self.pending_name = None;
    }

    fn visit_function(&mut self, it: &Function<'a>, flags: ScopeFlags) {
        let name = it
            .id
            .as_ref()
            .map(|i| i.name.to_string())
            .or_else(|| self.pending_name.take());
        self.pending_name = None;
        if let Some(name) = name.filter(|n| is_component_name(n))
            && it.body.is_some()
        {
            self.enter_component(name, it.span, &it.params, |s| {
                walk::walk_function(s, it, flags);
            });
        } else {
            self.nested(|s| walk::walk_function(s, it, flags));
        }
    }

    fn visit_arrow_function_expression(&mut self, it: &ArrowFunctionExpression<'a>) {
        let name = self.pending_name.take();
        if let Some(name) = name.filter(|n| is_component_name(n)) {
            self.enter_component(name, it.span, &it.params, |s| {
                walk::walk_arrow_function_expression(s, it);
            });
        } else {
            self.nested(|s| walk::walk_arrow_function_expression(s, it));
        }
    }

    /// Parameter defaults are applied on every read (`transform`), so reads in them are live, not setup reads.
    fn visit_formal_parameters(&mut self, it: &FormalParameters<'a>) {
        self.nested(|s| walk::walk_formal_parameters(s, it));
    }

    fn visit_jsx_element(&mut self, it: &JSXElement<'a>) {
        self.jsx_depth += 1;
        if let Some(c) = self.comps.last_mut() {
            c.jsx_depth += 1;
        }
        walk::walk_jsx_element(self, it);
        if let Some(c) = self.comps.last_mut() {
            c.jsx_depth -= 1;
        }
        self.jsx_depth -= 1;
    }

    fn visit_jsx_fragment(&mut self, it: &JSXFragment<'a>) {
        self.jsx_depth += 1;
        if let Some(c) = self.comps.last_mut() {
            c.jsx_depth += 1;
        }
        walk::walk_jsx_fragment(self, it);
        if let Some(c) = self.comps.last_mut() {
            c.jsx_depth -= 1;
        }
        self.jsx_depth -= 1;
    }

    fn visit_jsx_expression_container(&mut self, it: &JSXExpressionContainer<'a>) {
        if self.comps.last().is_some_and(|c| c.fn_depth == 0)
            && let Some(e) = it.expression.as_expression()
        {
            self.scan_component_entries(e, 0);
        }
        walk::walk_jsx_expression_container(self, it);
    }

    fn visit_jsx_child(&mut self, it: &JSXChild<'a>) {
        if let JSXChild::ExpressionContainer(c) = it
            && let Some(Expression::Identifier(id)) = c.expression.as_expression()
        {
            self.bare_box(id);
        }
        walk::walk_jsx_child(self, it);
    }

    fn visit_jsx_opening_element(&mut self, it: &JSXOpeningElement<'a>) {
        // On a native element a box can only mean its value; on a component it may be passed for write access.
        let intrinsic = matches!(&it.name, JSXElementName::Identifier(n) if n.name.starts_with(|c: char| c.is_ascii_lowercase()));
        for attr in &it.attributes {
            self.bound_attribute(attr, intrinsic);
        }
        if intrinsic {
            for attr in &it.attributes {
                if let JSXAttributeItem::Attribute(a) = attr
                    && let Some(JSXAttributeValue::ExpressionContainer(c)) = &a.value
                    && let Some(Expression::Identifier(id)) = c.expression.as_expression()
                {
                    self.bare_box(id);
                }
            }
        } else {
            let component = jsx_name(&it.name);
            let import = match &it.name {
                JSXElementName::IdentifierReference(r) => {
                    symbol_of(self.scoping, r).and_then(|s| self.imports.get(&s))
                }
                _ => None,
            };
            let (component, import) = match import {
                Some((spec, imported)) => (imported.clone(), Some(spec.clone())),
                None => (component, None),
            };
            for attr in &it.attributes {
                let JSXAttributeItem::Attribute(a) = attr else {
                    continue;
                };
                self.call_prop(a, &component);
                self.bound_prop(a);
                if let (
                    JSXAttributeName::Identifier(n),
                    Some(JSXAttributeValue::ExpressionContainer(c)),
                ) = (&a.name, &a.value)
                    && let Some((root, _)) =
                        c.expression.as_expression().and_then(chain_root_member)
                    && let Some(sym) =
                        symbol_of(self.scoping, root).filter(|s| self.boxes.contains(s))
                {
                    self.box_props.push((
                        sym,
                        component.clone(),
                        import.clone(),
                        n.name.to_string(),
                    ));
                }
            }
        }
        walk::walk_jsx_opening_element(self, it);
    }

    fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
        let Some(sym) = symbol_of(self.scoping, it) else {
            return;
        };
        self.ref_spans.entry(sym).or_default().push(it.span);
        if let Some(c) = self.comps.last_mut()
            && let Some(snap) = c.snapshots.iter_mut().find(|s| s.sym == sym)
        {
            if c.jsx_depth > 0 && c.fn_depth == 0 {
                snap.jsx.push(it.span);
            } else {
                snap.other = true;
            }
        }
        // A rest parameter is a live view: holding it reads nothing (`rest.x` is reported as a member read).
        if self
            .body_level()
            .is_some_and(|c| c.prop_syms.contains(&sym))
            && !self.is_rest(sym)
        {
            self.report_body_read(it.span, it.name.as_str());
        }
    }

    fn visit_import_declaration(&mut self, it: &ImportDeclaration<'a>) {
        for spec in it.specifiers.iter().flatten() {
            let (local, imported) = match spec {
                ImportDeclarationSpecifier::ImportSpecifier(s) => {
                    (&s.local, s.imported.name().to_string())
                }
                ImportDeclarationSpecifier::ImportDefaultSpecifier(s) => {
                    (&s.local, "default".to_string())
                }
                ImportDeclarationSpecifier::ImportNamespaceSpecifier(_) => continue,
            };
            if let Some(sym) = binding_symbol(local) {
                self.imports
                    .insert(sym, (it.source.value.to_string(), imported));
            }
        }
    }

    fn visit_static_member_expression(&mut self, it: &StaticMemberExpression<'a>) {
        if !self.assign_target
            && let Expression::Identifier(id) = &it.object
            && let Some(sym) = symbol_of(self.scoping, id)
            && self.is_rest(sym)
            && self
                .body_level()
                .is_some_and(|c| c.prop_syms.contains(&sym))
        {
            self.report_body_read(it.span, self.text(it.span));
        }
        if it.property.name == "children"
            && !self.assign_target
            && let Expression::Identifier(id) = &it.object
            && let Some(sym) = symbol_of(self.scoping, id)
            && let Some(i) = self.comps.iter().rposition(|c| c.props_param == Some(sym))
        {
            let props = id.name.to_string();
            let ctx = self.comps.remove(i);
            let ctx_span = ctx.span;
            let local = self.children_local(&ctx, &props);
            self.comps.insert(i, ctx);
            self.plan
                .children_reads
                .insert(key(it.span), (local, key(ctx_span)));
        }
        if it.property.name == "value"
            && !self.assign_target
            && let Expression::Identifier(id) = &it.object
            && symbol_of(self.scoping, id).is_some_and(|s| self.boxes.contains(&s))
        {
            self.report_body_read(it.span, self.text(it.span));
        }
        walk::walk_static_member_expression(self, it);
    }

    fn visit_assignment_expression(&mut self, it: &AssignmentExpression<'a>) {
        let prev = self.assign_target;
        self.assign_target = true;
        self.visit_assignment_target(&it.left);
        self.assign_target = prev;
        let ctx = match &it.left {
            AssignmentTarget::StaticMemberExpression(m) if m.property.name == "value" => {
                match &m.object {
                    Expression::Identifier(id) => symbol_of(self.scoping, id),
                    _ => None,
                }
            }
            _ => None,
        };
        self.spread_ctx.push(ctx);
        self.visit_expression(&it.right);
        self.spread_ctx.pop();
    }

    fn visit_simple_assignment_target(&mut self, it: &SimpleAssignmentTarget<'a>) {
        self.props_write(it);
        walk::walk_simple_assignment_target(self, it);
    }

    fn visit_assignment_target_property_identifier(
        &mut self,
        it: &AssignmentTargetPropertyIdentifier<'a>,
    ) {
        if symbol_of(self.scoping, &it.binding).is_some_and(|s| self.plan.rewrites.contains_key(&s))
        {
            let name = it.binding.name.to_string();
            self.reassigned(it.span, &name, "a destructuring assignment");
        }
        walk::walk_assignment_target_property_identifier(self, it);
    }

    fn visit_call_expression(&mut self, it: &CallExpression<'a>) {
        self.react_call(it);
        self.bind_call_diagnostic(it);
        if let Some(cb) = map_callback(it) {
            if self.jsx_depth > 0 && returned(cb).0.is_some_and(returns_jsx) {
                self.analyze_list(it, cb);
            }
            if let Some((param, obj)) = spread_of_param(cb)
                && obj.properties.iter().any(|p| {
                    matches!(p, ObjectPropertyKind::SpreadProperty(s)
                        if matches!(&s.argument, Expression::Identifier(id) if id.name == param))
                })
            {
                self.spreads
                    .push((it.span, self.spread_ctx.last().copied().flatten()));
            }
        }
        if callee_name(it) == Some("derived")
            && self.body_level().is_some()
            && let Some(arg) = it.arguments.first().and_then(|a| a.as_expression())
        {
            // The callback's own body is the reactive position: depth -1 so entering it lands on 0.
            self.scan_component_entries(arg, -1);
        }
        let state_call = callee_name(it) == Some("state") && self.body_level().is_some();
        if state_call && let Some(c) = self.comps.last_mut() {
            c.state_arg = Some(it.span);
        }
        walk::walk_call_expression(self, it);
        if state_call && let Some(c) = self.comps.last_mut() {
            c.state_arg = None;
        }
    }
}
