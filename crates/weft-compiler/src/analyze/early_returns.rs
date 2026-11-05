//! Setup branches never recheck their conditions; JSX branches do.

use std::collections::HashMap;

use oxc_ast::ast::{
    ArrowFunctionExpression, BindingPattern, CallExpression, ComputedMemberExpression, Expression,
    ForInStatement, ForOfStatement, ForStatement, Function, IdentifierReference, IfStatement,
    Statement, StaticMemberExpression, SwitchStatement, VariableDeclarator, WhileStatement,
};
use oxc_ast_visit::{Visit, walk};
use oxc_semantic::SymbolId;
use oxc_span::GetSpan;
use oxc_syntax::operator::UnaryOperator;
use oxc_syntax::scope::ScopeFlags;

use crate::diag::{Diagnostic, Severity};

use super::{Analyzer, EarlyReturn, binding_symbol, symbol_of};

#[derive(Clone, Copy, PartialEq, Eq)]
enum Origin {
    Box,
    Props,
    Value,
    /// Constructed object whose contents or chosen identity depend on reactive reads.
    Container,
}

fn origin(a: &Analyzer<'_>, aliases: &HashMap<SymbolId, Origin>, sym: SymbolId) -> Option<Origin> {
    if a.boxes.contains(&sym) {
        Some(Origin::Box)
    } else if a.is_rest(sym) || a.comps.iter().any(|c| c.props_param == Some(sym)) {
        Some(Origin::Props)
    } else if a.plan.rewrites.contains_key(&sym)
        || a.comps.iter().any(|c| c.prop_syms.contains(&sym))
    {
        Some(Origin::Value)
    } else {
        aliases.get(&sym).copied()
    }
}

fn reference(
    a: &Analyzer<'_>,
    aliases: &HashMap<SymbolId, Origin>,
    e: &Expression<'_>,
) -> Option<Origin> {
    let Expression::Identifier(id) = e.get_inner_expression() else {
        return None;
    };
    origin(a, aliases, symbol_of(a.scoping, id)?)
}

struct Reads<'x, 's> {
    a: &'x Analyzer<'s>,
    aliases: &'x HashMap<SymbolId, Origin>,
    found: bool,
}

fn allocated_object(e: &Expression<'_>) -> bool {
    matches!(
        e.get_inner_expression(),
        Expression::ObjectExpression(_)
            | Expression::ArrayExpression(_)
            | Expression::NewExpression(_)
    )
}

fn reactive(a: &Analyzer<'_>, aliases: &HashMap<SymbolId, Origin>, e: &Expression<'_>) -> bool {
    let mut reads = Reads {
        a,
        aliases,
        found: false,
    };
    reads.visit_expression(e);
    reads.found
}

impl<'a> Visit<'a> for Reads<'_, '_> {
    fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
        if matches!(
            symbol_of(self.a.scoping, it).and_then(|sym| origin(self.a, self.aliases, sym)),
            Some(Origin::Value | Origin::Container)
        ) {
            self.found = true;
        }
    }

    fn visit_static_member_expression(&mut self, it: &StaticMemberExpression<'a>) {
        let source = reference(self.a, self.aliases, &it.object);
        if source == Some(Origin::Props)
            || (source == Some(Origin::Box) && it.property.name == "value")
        {
            self.found = true;
        }
        walk::walk_static_member_expression(self, it);
    }

    fn visit_computed_member_expression(&mut self, it: &ComputedMemberExpression<'a>) {
        let source = reference(self.a, self.aliases, &it.object);
        if source == Some(Origin::Props)
            || (source == Some(Origin::Box)
                && matches!(it.expression.get_inner_expression(),
                    Expression::StringLiteral(s) if s.value == "value"))
        {
            self.found = true;
        }
        walk::walk_computed_member_expression(self, it);
    }

    fn visit_call_expression(&mut self, it: &CallExpression<'a>) {
        if let Expression::StaticMemberExpression(m) = it.callee.get_inner_expression()
            && m.property.name == "get"
            && reference(self.a, self.aliases, &m.object) == Some(Origin::Box)
        {
            self.found = true;
        }
        walk::walk_call_expression(self, it);
    }

    fn visit_function(&mut self, _: &Function<'a>, _: ScopeFlags) {}
    fn visit_arrow_function_expression(&mut self, _: &ArrowFunctionExpression<'a>) {}
}

struct Aliases<'x, 's> {
    a: &'x Analyzer<'s>,
    symbols: HashMap<SymbolId, Origin>,
}

impl Aliases<'_, '_> {
    fn bind(&mut self, pattern: &BindingPattern<'_>, source: Origin) {
        for id in pattern.get_binding_identifiers() {
            if let Some(sym) = binding_symbol(id)
                && !self.a.written(sym)
            {
                self.symbols.entry(sym).or_insert(source);
            }
        }
    }
}

impl<'a> Visit<'a> for Aliases<'_, '_> {
    fn visit_variable_declarator(&mut self, it: &VariableDeclarator<'a>) {
        if let Some(init) = &it.init {
            let source = reference(self.a, &self.symbols, init);
            match &it.id {
                BindingPattern::BindingIdentifier(_) => {
                    if let Some(source) = source {
                        self.bind(&it.id, source);
                    } else if reactive(self.a, &self.symbols, init) {
                        let source = if allocated_object(init) {
                            Origin::Container
                        } else {
                            Origin::Value
                        };
                        self.bind(&it.id, source);
                    }
                }
                BindingPattern::ObjectPattern(obj) if source == Some(Origin::Box) => {
                    for property in &obj.properties {
                        if property
                            .key
                            .static_name()
                            .is_some_and(|name| name == "value")
                        {
                            self.bind(&property.value, Origin::Value);
                        }
                    }
                }
                BindingPattern::ObjectPattern(obj) if source == Some(Origin::Props) => {
                    for property in &obj.properties {
                        self.bind(&property.value, Origin::Value);
                    }
                    if let Some(rest) = &obj.rest {
                        self.bind(&rest.argument, Origin::Props);
                    }
                }
                _ if !matches!(
                    init.get_inner_expression(),
                    Expression::ArrayExpression(_) | Expression::ObjectExpression(_)
                ) && reactive(self.a, &self.symbols, init) =>
                {
                    self.bind(&it.id, Origin::Value);
                }
                _ => {}
            }
        }
        walk::walk_variable_declarator(self, it);
    }

    fn visit_function(&mut self, _: &Function<'a>, _: ScopeFlags) {}
    fn visit_arrow_function_expression(&mut self, _: &ArrowFunctionExpression<'a>) {}
}

fn has_return(statement: &Statement<'_>) -> bool {
    let mut returns = EarlyReturn { found: false };
    returns.visit_statement(statement);
    returns.found
}

struct Returns<'x, 's> {
    a: &'x Analyzer<'s>,
    aliases: &'x HashMap<SymbolId, Origin>,
    diagnostics: Vec<Diagnostic>,
}

impl Returns<'_, '_> {
    fn boolean_condition(&mut self, test: &Expression<'_>, returns: bool) {
        // Allocations stay truthy; their inputs can still control iteration or dispatch.
        let mut value = test.get_inner_expression();
        while let Expression::UnaryExpression(unary) = value
            && unary.operator == UnaryOperator::LogicalNot
        {
            value = unary.argument.get_inner_expression();
        }
        if allocated_object(value)
            || reference(self.a, self.aliases, value) == Some(Origin::Container)
        {
            return;
        }
        self.condition(test, returns);
    }

    fn condition(&mut self, test: &Expression<'_>, returns: bool) {
        if !returns || !reactive(self.a, self.aliases, test) {
            return;
        }
        let span = test.span();
        let condition = self.a.text(span);
        self.diagnostics.push(Diagnostic::new(
            self.a.source,
            "W040",
            Severity::Error,
            (span.start, span.end),
            format!("An early return depends on `{condition}`; component setup runs once and never rechecks it."),
            "Branch in JSX so changes are tracked: `return <>{condition ? <Content /> : null}</>`. \
             Keep setup outside the branch and put the reactive condition inside JSX.",
        ));
    }
}

impl<'a> Visit<'a> for Returns<'_, '_> {
    fn visit_if_statement(&mut self, it: &IfStatement<'a>) {
        let returns = has_return(&it.consequent) || it.alternate.as_ref().is_some_and(has_return);
        self.boolean_condition(&it.test, returns);
        walk::walk_if_statement(self, it);
    }

    fn visit_switch_statement(&mut self, it: &SwitchStatement<'a>) {
        let returns = it.cases.iter().any(|c| c.consequent.iter().any(has_return));
        self.condition(&it.discriminant, returns);
        for case in &it.cases {
            if let Some(test) = &case.test {
                self.condition(test, returns);
            }
        }
        walk::walk_switch_statement(self, it);
    }

    fn visit_while_statement(&mut self, it: &WhileStatement<'a>) {
        self.boolean_condition(&it.test, has_return(&it.body));
        walk::walk_while_statement(self, it);
    }

    fn visit_for_statement(&mut self, it: &ForStatement<'a>) {
        if let Some(test) = &it.test {
            self.boolean_condition(test, has_return(&it.body));
        }
        walk::walk_for_statement(self, it);
    }

    fn visit_for_in_statement(&mut self, it: &ForInStatement<'a>) {
        self.condition(&it.right, has_return(&it.body));
        walk::walk_for_in_statement(self, it);
    }

    fn visit_for_of_statement(&mut self, it: &ForOfStatement<'a>) {
        self.condition(&it.right, has_return(&it.body));
        walk::walk_for_of_statement(self, it);
    }

    fn visit_function(&mut self, _: &Function<'a>, _: ScopeFlags) {}
    fn visit_arrow_function_expression(&mut self, _: &ArrowFunctionExpression<'a>) {}
}

impl Analyzer<'_> {
    pub(super) fn early_return_diagnostics(&mut self, statements: &[Statement<'_>]) {
        let mut aliases = Aliases {
            a: self,
            symbols: HashMap::new(),
        };
        loop {
            let before = aliases.symbols.len();
            for statement in statements {
                aliases.visit_statement(statement);
            }
            if aliases.symbols.len() == before {
                break;
            }
        }
        let mut returns = Returns {
            a: self,
            aliases: &aliases.symbols,
            diagnostics: Vec::new(),
        };
        for statement in statements {
            returns.visit_statement(statement);
        }
        self.plan.diagnostics.extend(returns.diagnostics);
    }
}
