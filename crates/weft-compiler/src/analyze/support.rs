//! Shared visitors for reactive values, boxes, members, and returns.

use std::collections::HashSet;

use oxc_ast::ast::{
    ArrowFunctionExpression, BindingPattern, Expression, Function, IdentifierReference,
    ObjectExpression, ReturnStatement, StaticMemberExpression, VariableDeclaration,
    VariableDeclarator,
};
use oxc_ast_visit::{Visit, walk};
use oxc_semantic::{Scoping, SymbolId};
use oxc_syntax::scope::ScopeFlags;

use super::{Analyzer, binding_symbol, symbol_of};

/// `p => ({ ...p, … })`: the item parameter's name and the object it spreads into.
pub(super) fn spread_of_param<'b, 'a>(
    cb: &'b Expression<'a>,
) -> Option<(&'b str, &'b ObjectExpression<'a>)> {
    let Expression::ArrowFunctionExpression(f) = cb else {
        return None;
    };
    let Some(BindingPattern::BindingIdentifier(param)) = f.params.items.first().map(|p| &p.pattern)
    else {
        return None;
    };
    let body = f.body.as_expression()?.without_parentheses();
    match body {
        Expression::ObjectExpression(obj) => Some((param.name.as_str(), obj)),
        _ => None,
    }
}

/// Whether an expression reads anything reactive the compiler can see: a prop, a list item, a box, or `.value`.
pub(super) struct Reactive<'x, 's> {
    pub(super) a: &'x Analyzer<'s>,
    pub(super) found: bool,
}

impl<'a> Visit<'a> for Reactive<'_, '_> {
    fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
        if let Some(sym) = symbol_of(self.a.scoping, it)
            && (self.a.plan.rewrites.contains_key(&sym)
                || self.a.boxes.contains(&sym)
                || self.a.comps.iter().any(|c| c.prop_syms.contains(&sym)))
        {
            self.found = true;
        }
    }
    fn visit_static_member_expression(&mut self, it: &StaticMemberExpression<'a>) {
        if it.property.name == "value" {
            self.found = true;
        }
        walk::walk_static_member_expression(self, it);
    }
}

/// Symbols initialized with a reactive box: `state(…)`, `state.linked(…)`, `derived(…)`, `resource(…)`, and the
/// @weft-js/core/browser values (`online()`, `media(q)` …).
pub(super) struct Boxes<'s> {
    pub(super) scoping: &'s Scoping,
    pub(super) set: HashSet<SymbolId>,
    /// @weft-js/core/browser value imports.
    pub(super) browser: HashSet<SymbolId>,
    /// `const`s made as arrays here: `[…]`, `Array.from(…)`, `new Array(…)`.
    pub(super) arrays: HashSet<SymbolId>,
}

fn makes_array(e: &Expression<'_>) -> bool {
    match e {
        Expression::ArrayExpression(_) => true,
        Expression::NewExpression(n) => {
            matches!(&n.callee, Expression::Identifier(c) if c.name == "Array")
        }
        Expression::CallExpression(c) => matches!(&c.callee, Expression::StaticMemberExpression(m)
            if m.property.name == "from" && matches!(&m.object, Expression::Identifier(o) if o.name == "Array")),
        _ => false,
    }
}

impl<'a> Visit<'a> for Boxes<'_> {
    fn visit_variable_declaration(&mut self, it: &VariableDeclaration<'a>) {
        if it.kind.is_const() {
            for d in &it.declarations {
                if let (BindingPattern::BindingIdentifier(id), Some(init)) =
                    (&d.id, d.init.as_ref())
                    && makes_array(init.without_parentheses())
                    && let Some(sym) = binding_symbol(id)
                {
                    self.arrays.insert(sym);
                }
            }
        }
        walk::walk_variable_declaration(self, it);
    }

    fn visit_variable_declarator(&mut self, it: &VariableDeclarator<'a>) {
        if let (BindingPattern::BindingIdentifier(id), Some(Expression::CallExpression(call))) = (
            &it.id,
            it.init
                .as_ref()
                .map(oxc_ast::ast::Expression::without_parentheses),
        ) {
            let boxed = match &call.callee {
                Expression::Identifier(c) => {
                    matches!(c.name.as_str(), "state" | "derived" | "resource")
                        || symbol_of(self.scoping, c).is_some_and(|s| self.browser.contains(&s))
                }
                Expression::StaticMemberExpression(m) => {
                    matches!(&m.object, Expression::Identifier(o) if o.name == "state")
                        && m.property.name == "linked"
                }
                _ => false,
            };
            if boxed && let Some(sym) = binding_symbol(id) {
                self.set.insert(sym);
            }
        }
        walk::walk_variable_declarator(self, it);
    }
}

/// Member names read off the list item (`p.id`, `p.name`), to tell object lists from primitive ones.
pub(super) struct MemberUse<'s> {
    pub(super) scoping: &'s Scoping,
    pub(super) sym: Option<SymbolId>,
    pub(super) props: Vec<String>,
}

impl<'a> Visit<'a> for MemberUse<'_> {
    fn visit_static_member_expression(&mut self, it: &StaticMemberExpression<'a>) {
        if let Expression::Identifier(id) = &it.object
            && self.sym.is_some()
            && symbol_of(self.scoping, id) == self.sym
        {
            self.props.push(it.property.name.to_string());
        }
        walk::walk_static_member_expression(self, it);
    }
}

/// A `return` before the last statement (nested functions don't count).
pub(super) struct EarlyReturn {
    pub(super) found: bool,
}

impl<'a> Visit<'a> for EarlyReturn {
    fn visit_return_statement(&mut self, _: &ReturnStatement<'a>) {
        self.found = true;
    }
    fn visit_function(&mut self, _: &Function<'a>, _: ScopeFlags) {}
    fn visit_arrow_function_expression(&mut self, _: &ArrowFunctionExpression<'a>) {}
}
