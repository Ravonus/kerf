//! A plain local can refresh through a changing predicate, but only in that predicate's JSX.

mod effects;

use std::collections::{HashMap, HashSet};

use oxc_ast::ast::{
    ArrowFunctionBody, ArrowFunctionExpression, AssignmentTarget, BindingPattern,
    ConditionalExpression, Expression, Function, IdentifierReference, SimpleAssignmentTarget,
    Statement, VariableDeclarator,
};
use oxc_ast_visit::{Visit, walk};
use oxc_semantic::SymbolId;
use oxc_span::GetSpan;
use oxc_syntax::{operator::LogicalOperator, operator::UnaryOperator, scope::ScopeFlags};

use super::super::react::imported_value;
use super::super::{Analyzer, SpanKey, binding_symbol, key, symbol_of};
use super::{Scan, Uses};

type Gates = HashSet<SymbolId>;
type States = HashMap<SymbolId, SymbolId>;

fn state(object: &Expression<'_>, a: &Analyzer<'_>, states: &States) -> Option<SymbolId> {
    let Expression::Identifier(id) = object.get_inner_expression() else {
        return None;
    };
    states.get(&symbol_of(a.scoping, id)?).copied()
}

fn predicate(
    expression: &Expression<'_>,
    a: &Analyzer<'_>,
    states: &States,
) -> Option<(SymbolId, bool)> {
    match expression.get_inner_expression() {
        Expression::StaticMemberExpression(m) if m.property.name == "value" => {
            state(&m.object, a, states).map(|sym| (sym, true))
        }
        Expression::ComputedMemberExpression(m)
            if matches!(m.expression.get_inner_expression(),
            Expression::StringLiteral(name) if name.value == "value") =>
        {
            state(&m.object, a, states).map(|sym| (sym, true))
        }
        Expression::UnaryExpression(u) if u.operator == UnaryOperator::LogicalNot => {
            predicate(&u.argument, a, states).map(|(sym, positive)| (sym, !positive))
        }
        _ => None,
    }
}

impl Scan<'_, '_> {
    pub(super) fn refreshes(&mut self, statements: &[Statement<'_>]) {
        let effects = effects::collect(statements, self.a, &self.states);
        let escaped = effects::escaped_callbacks(statements, self.a, &self.bindings);
        let roots: Vec<_> = escaped
            .iter()
            .copied()
            .map(super::Target::Function)
            .collect();
        let invoked = self.reachable(&roots, false);
        let blocked = self
            .functions
            .iter()
            .filter(|(span, uses)| {
                escaped.contains(*span)
                    || invoked.iter().any(|callee| std::ptr::eq(*callee, *uses))
                    || self
                        .reachable(&uses.calls, false)
                        .iter()
                        .any(|callee| std::ptr::eq(*callee, *uses))
            })
            .map(|(&span, _)| span)
            .collect();
        let mut rescan = Rescan {
            a: self.a,
            states: &self.states,
            effects: &effects,
            blocked: &blocked,
            functions: &mut self.functions,
        };
        for statement in statements {
            rescan.visit_statement(statement);
        }
    }

    pub(super) fn define_state(&mut self, it: &VariableDeclarator<'_>) {
        let (BindingPattern::BindingIdentifier(id), Some(init)) = (&it.id, &it.init) else {
            return;
        };
        let Some(sym) = binding_symbol(id).filter(|&sym| !self.a.written(sym)) else {
            return;
        };
        let root = match init.get_inner_expression() {
            Expression::CallExpression(call)
                if imported_value(&call.callee, self.a.scoping, &self.a.react_imports)
                    .is_some_and(|(module, name)| module == "@weft-js/core" && name == "state") =>
            {
                Some(sym)
            }
            Expression::Identifier(id) => {
                symbol_of(self.a.scoping, id).and_then(|s| self.states.get(&s).copied())
            }
            _ => None,
        };
        if let Some(root) = root {
            self.states.insert(sym, root);
        }
    }

    pub(super) fn guard_read(&mut self, sym: SymbolId, read: bool) {
        if !read {
            return;
        }
        // Include non-rendered reads too: an unclassified helper/alias read prevents the exception.
        let gates = if self.reading && !self.event {
            self.gates.iter().copied().collect()
        } else {
            Gates::new()
        };
        self.read_gates
            .entry(sym)
            .and_modify(|seen| seen.retain(|g| gates.contains(g)))
            .or_insert(gates);
    }

    pub(super) fn conditional(&mut self, it: &ConditionalExpression<'_>) {
        self.visit_expression(&it.test);
        let gate = predicate(&it.test, self.a, &self.states).map(|(sym, _)| sym);
        if let Some(sym) = gate {
            self.gates.push(sym);
        }
        self.visit_expression(&it.consequent);
        self.visit_expression(&it.alternate);
        if gate.is_some() {
            self.gates.pop();
        }
    }

    pub(super) fn refreshed(&self, uses: &Uses, sym: SymbolId) -> bool {
        self.read_gates.get(&sym).is_some_and(|guards| {
            uses.refreshes
                .get(&sym)
                .is_some_and(|writes| !guards.is_disjoint(writes))
        })
    }
}

struct Facts<'x, 's> {
    a: &'x Analyzer<'s>,
    states: &'x States,
    writes: HashMap<SymbolId, HashSet<SpanKey>>,
    state_writes: HashMap<SymbolId, usize>,
}

impl<'a> Visit<'a> for Facts<'_, '_> {
    fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
        if let Some(reference) = it
            .reference_id
            .get()
            .map(|id| self.a.scoping.get_reference(id))
            && reference.is_write()
            && let Some(sym) = reference.symbol_id()
        {
            self.writes.entry(sym).or_default().insert(key(it.span));
        }
    }

    fn visit_simple_assignment_target(&mut self, it: &SimpleAssignmentTarget<'a>) {
        let object = match it {
            SimpleAssignmentTarget::StaticMemberExpression(m) => Some(&m.object),
            SimpleAssignmentTarget::ComputedMemberExpression(m) => Some(&m.object),
            _ => None,
        };
        if let Some(sym) = object.and_then(|object| state(object, self.a, self.states)) {
            *self.state_writes.entry(sym).or_default() += 1;
        }
        walk::walk_simple_assignment_target(self, it);
    }

    fn visit_function(&mut self, _: &Function<'a>, _: ScopeFlags) {}
    fn visit_arrow_function_expression(&mut self, _: &ArrowFunctionExpression<'a>) {}
}

struct Proof<'x, 's> {
    facts: Facts<'x, 's>,
    effects: &'x effects::Effects,
    covered: HashSet<SpanKey>,
    gates: HashMap<SymbolId, Gates>,
}

impl Proof<'_, '_> {
    fn condition(
        &self,
        expression: &Expression<'_>,
        truth: bool,
        facts: &mut HashMap<SymbolId, bool>,
    ) {
        if let Some((sym, positive)) = predicate(expression, self.facts.a, self.facts.states) {
            facts.insert(sym, truth == positive);
        } else if let Expression::LogicalExpression(l) = expression.get_inner_expression()
            && l.operator == LogicalOperator::And
            && truth
        {
            self.condition(&l.left, true, facts);
            self.condition(&l.right, true, facts);
        }
    }

    fn record(&mut self, id: &IdentifierReference<'_>, after: &Gates) {
        if let Some(sym) = symbol_of(self.facts.a.scoping, id) {
            self.covered.insert(key(id.span));
            self.gates
                .entry(sym)
                .and_modify(|g| g.retain(|s| after.contains(s)))
                .or_insert_with(|| after.clone());
        }
    }

    fn block(
        &mut self,
        statements: &[Statement<'_>],
        facts: &HashMap<SymbolId, bool>,
        mut after: Option<Gates>,
    ) -> Option<Gates> {
        for statement in statements.iter().rev() {
            after = self.statement(statement, facts, after);
        }
        after
    }

    fn statement(
        &mut self,
        statement: &Statement<'_>,
        facts: &HashMap<SymbolId, bool>,
        after: Option<Gates>,
    ) -> Option<Gates> {
        match statement {
            Statement::BlockStatement(block) => self.block(&block.body, facts, after),
            Statement::IfStatement(branch) => {
                let continuation = after.as_ref().map(|_| Gates::new());
                let mut yes = facts.clone();
                self.condition(&branch.test, true, &mut yes);
                let _ = self.statement(&branch.consequent, &yes, continuation.clone());
                if let Some(alternate) = &branch.alternate {
                    let mut no = facts.clone();
                    self.condition(&branch.test, false, &mut no);
                    let _ = self.statement(alternate, &no, continuation);
                }
                None
            }
            Statement::ExpressionStatement(expression) => {
                self.expression(&expression.expression, facts, after)
            }
            _ => None,
        }
    }

    fn expression(
        &mut self,
        expression: &Expression<'_>,
        facts: &HashMap<SymbolId, bool>,
        after: Option<Gates>,
    ) -> Option<Gates> {
        match expression.get_inner_expression() {
            Expression::AssignmentExpression(assign) => {
                if let AssignmentTarget::AssignmentTargetIdentifier(id) = &assign.left {
                    self.record(id, after.as_ref().unwrap_or(&Gates::new()));
                    return None;
                }
                let mut after = after?;
                let gate = match &assign.left {
                    AssignmentTarget::StaticMemberExpression(m) if m.property.name == "value" => {
                        state(&m.object, self.facts.a, self.facts.states)
                    }
                    _ => None,
                };
                let gate = gate?;
                let toggles = predicate(&assign.right, self.facts.a, self.facts.states)
                    == Some((gate, false));
                let changes = matches!(assign.right.get_inner_expression(), Expression::BooleanLiteral(v)
                    if facts.get(&gate).is_some_and(|&before| before != v.value
                        && self.effects.preserves(gate, before, key(assign.left.span()))));
                if self.facts.state_writes.get(&gate) == Some(&1)
                    && ((toggles && self.effects.only_writer(gate, key(assign.left.span())))
                        || changes)
                    && assign.operator == oxc_syntax::operator::AssignmentOperator::Assign
                {
                    after.insert(gate);
                }
                if toggles
                    || matches!(
                        assign.right.get_inner_expression(),
                        Expression::BooleanLiteral(_)
                            | Expression::StringLiteral(_)
                            | Expression::NumericLiteral(_)
                            | Expression::NullLiteral(_)
                    )
                {
                    Some(after)
                } else {
                    None
                }
            }
            Expression::UpdateExpression(update) => {
                if let SimpleAssignmentTarget::AssignmentTargetIdentifier(id) = &update.argument {
                    self.record(id, after.as_ref().unwrap_or(&Gates::new()));
                }
                None
            }
            _ => None,
        }
    }
}

fn writes(
    statements: &[Statement<'_>],
    a: &Analyzer<'_>,
    states: &States,
    effects: &effects::Effects,
) -> HashMap<SymbolId, Gates> {
    let mut facts = Facts {
        a,
        states,
        writes: HashMap::new(),
        state_writes: HashMap::new(),
    };
    for statement in statements {
        facts.visit_statement(statement);
    }
    let mut proof = Proof {
        facts,
        effects,
        covered: HashSet::new(),
        gates: HashMap::new(),
    };
    let _ = proof.block(statements, &HashMap::new(), Some(Gates::new()));
    proof.gates.retain(|sym, gates| {
        !gates.is_empty()
            && proof
                .facts
                .writes
                .get(sym)
                .is_some_and(|writes| writes.is_subset(&proof.covered))
    });
    proof.gates
}

struct Rescan<'x, 's> {
    a: &'x Analyzer<'s>,
    states: &'x States,
    effects: &'x effects::Effects,
    blocked: &'x HashSet<SpanKey>,
    functions: &'x mut HashMap<SpanKey, Uses>,
}

impl Rescan<'_, '_> {
    fn body(&mut self, span: SpanKey, statements: &[Statement<'_>]) {
        if !self.blocked.contains(&span) {
            self.functions.entry(span).or_default().refreshes =
                writes(statements, self.a, self.states, self.effects);
        }
    }
}

impl<'a> Visit<'a> for Rescan<'_, '_> {
    fn visit_function(&mut self, it: &Function<'a>, flags: ScopeFlags) {
        if let Some(body) = &it.body {
            self.body(key(it.span), &body.statements);
        }
        walk::walk_function(self, it, flags);
    }

    fn visit_arrow_function_expression(&mut self, it: &ArrowFunctionExpression<'a>) {
        if let ArrowFunctionBody::FunctionBody(body) = &it.body {
            self.body(key(it.span), &body.statements);
        }
        walk::walk_arrow_function_expression(self, it);
    }
}
