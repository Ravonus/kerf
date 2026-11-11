//! Keep numeric evidence by binding and property path; unknown values stay unknown.

use std::collections::{HashMap, HashSet};

use oxc_ast::ast::{
    BindingPattern, CallExpression, ChainElement, Expression, FormalParameter, Program,
    TSSignature, TSType, VariableDeclarator,
};
use oxc_ast_visit::{Visit, walk};
use oxc_semantic::{Scoping, SymbolId};
use oxc_syntax::operator::{BinaryOperator, UnaryOperator};

use super::react::{imported_call, imports};
use super::{binding_symbol, returned, symbol_of};

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum Kind {
    Number,
    Boolean,
    String,
    Array,
    Object,
    Other,
}

#[derive(Clone, PartialEq, Eq, Hash)]
pub(super) struct Place {
    pub(super) root: SymbolId,
    pub(super) path: Vec<String>,
}

impl Place {
    pub(super) fn child(&self, name: &str) -> Self {
        let mut place = self.clone();
        place.path.push(name.to_string());
        place
    }
}

pub(super) struct Facts<'s> {
    scoping: &'s Scoping,
    pub(super) kinds: HashMap<Place, Kind>,
    pub(super) declared: HashMap<Place, Kind>,
    unstable: HashSet<SymbolId>,
    imports: HashMap<SymbolId, (String, String)>,
}

fn type_kind(ty: &TSType<'_>) -> Option<Kind> {
    match ty {
        TSType::TSNumberKeyword(_) => Some(Kind::Number),
        TSType::TSBooleanKeyword(_) => Some(Kind::Boolean),
        TSType::TSStringKeyword(_) => Some(Kind::String),
        TSType::TSArrayType(_) => Some(Kind::Array),
        TSType::TSTypeLiteral(_) => Some(Kind::Object),
        TSType::TSUnionType(union)
            if union
                .types
                .iter()
                .any(|ty| matches!(ty, TSType::TSNumberKeyword(_)))
                && union.types.iter().all(|ty| {
                    matches!(
                        ty,
                        TSType::TSNumberKeyword(_)
                            | TSType::TSUndefinedKeyword(_)
                            | TSType::TSNullKeyword(_)
                    )
                }) =>
        {
            Some(Kind::Number)
        }
        _ => None,
    }
}

impl Facts<'_> {
    pub(super) fn place(&self, expression: &Expression<'_>) -> Option<Place> {
        match expression.get_inner_expression() {
            Expression::Identifier(id) => Some(Place {
                root: symbol_of(self.scoping, id)?,
                path: Vec::new(),
            }),
            Expression::StaticMemberExpression(m) => {
                Some(self.place(&m.object)?.child(m.property.name.as_str()))
            }
            Expression::ComputedMemberExpression(m) => {
                let Expression::StringLiteral(name) = m.expression.get_inner_expression() else {
                    return None;
                };
                Some(self.place(&m.object)?.child(name.value.as_str()))
            }
            Expression::ChainExpression(chain) => match &chain.expression {
                ChainElement::StaticMemberExpression(m) => {
                    Some(self.place(&m.object)?.child(m.property.name.as_str()))
                }
                _ => None,
            },
            _ => None,
        }
    }

    pub(super) fn stable(&self, place: &Place) -> bool {
        place.path.is_empty() || !self.unstable.contains(&place.root)
    }

    pub(super) fn at(&self, place: &Place) -> Option<Kind> {
        if !self.stable(place) {
            return None;
        }
        if let Some(kind) = self.kinds.get(place) {
            return Some(*kind);
        }
        let (last, parents) = place.path.split_last()?;
        if last != "length" {
            return None;
        }
        let parent = Place {
            root: place.root,
            path: parents.to_vec(),
        };
        match self.kinds.get(&parent) {
            Some(Kind::Object | Kind::Boolean | Kind::Number | Kind::Other) => None,
            _ => Some(Kind::Number),
        }
    }

    pub(super) fn core_call<'b>(&'b self, call: &'b CallExpression<'_>) -> Option<&'b str> {
        let (module, name) = imported_call(call, self.scoping, &self.imports)?;
        (module == "@kerf-js/core").then_some(name)
    }

    pub(super) fn kind(&self, expression: &Expression<'_>) -> Option<Kind> {
        match expression.without_parentheses() {
            Expression::TSAsExpression(e) => {
                type_kind(&e.type_annotation).or_else(|| self.kind(&e.expression))
            }
            Expression::NumericLiteral(_) => Some(Kind::Number),
            Expression::BooleanLiteral(_) => Some(Kind::Boolean),
            Expression::StringLiteral(_) | Expression::TemplateLiteral(_) => Some(Kind::String),
            Expression::ArrayExpression(_) => Some(Kind::Array),
            Expression::ObjectExpression(_) => Some(Kind::Object),
            Expression::NullLiteral(_) | Expression::BigIntLiteral(_) => Some(Kind::Other),
            Expression::Identifier(_) => self.place(expression).and_then(|place| self.at(&place)),
            Expression::StaticMemberExpression(m) => {
                self.member(&m.object, m.property.name.as_str())
            }
            Expression::ComputedMemberExpression(m) => {
                let Expression::StringLiteral(name) = m.expression.get_inner_expression() else {
                    return None;
                };
                self.member(&m.object, name.value.as_str())
            }
            Expression::ChainExpression(_) => {
                self.place(expression).and_then(|place| self.at(&place))
            }
            Expression::UnaryExpression(e) => match e.operator {
                UnaryOperator::LogicalNot | UnaryOperator::Delete => Some(Kind::Boolean),
                UnaryOperator::Typeof => Some(Kind::String),
                UnaryOperator::UnaryPlus => Some(Kind::Number),
                UnaryOperator::UnaryNegation | UnaryOperator::BitwiseNot
                    if self.kind(&e.argument) == Some(Kind::Number) =>
                {
                    Some(Kind::Number)
                }
                _ => None,
            },
            Expression::BinaryExpression(e)
                if matches!(
                    e.operator,
                    BinaryOperator::Addition
                        | BinaryOperator::Subtraction
                        | BinaryOperator::Multiplication
                        | BinaryOperator::Division
                        | BinaryOperator::Remainder
                        | BinaryOperator::Exponential
                ) && self.kind(&e.left) == Some(Kind::Number)
                    && self.kind(&e.right) == Some(Kind::Number) =>
            {
                Some(Kind::Number)
            }
            Expression::ConditionalExpression(e) => self
                .kind(&e.consequent)
                .filter(|kind| self.kind(&e.alternate) == Some(*kind)),
            Expression::LogicalExpression(e) => self
                .kind(&e.left)
                .filter(|kind| self.kind(&e.right) == Some(*kind)),
            _ => self.place(expression).and_then(|place| self.at(&place)),
        }
    }

    fn annotate(&mut self, place: &Place, ty: &TSType<'_>) {
        if let Some(kind) = type_kind(ty) {
            self.declared.insert(place.clone(), kind);
            self.kinds.entry(place.clone()).or_insert(kind);
        }
        if let TSType::TSTypeLiteral(object) = ty {
            for member in &object.members {
                if let TSSignature::TSPropertySignature(property) = member
                    && let Some(name) = property.key.static_name()
                    && let Some(annotation) = &property.type_annotation
                {
                    let child = place.child(&name);
                    self.annotate(&child, &annotation.type_annotation);
                }
            }
        }
    }

    fn typed_pattern(&mut self, pattern: &BindingPattern<'_>, ty: &TSType<'_>) {
        match pattern {
            BindingPattern::BindingIdentifier(id) => {
                if let Some(root) = binding_symbol(id) {
                    self.annotate(
                        &Place {
                            root,
                            path: Vec::new(),
                        },
                        ty,
                    );
                }
            }
            BindingPattern::AssignmentPattern(p) => self.typed_pattern(&p.left, ty),
            BindingPattern::ObjectPattern(pattern) => {
                if let TSType::TSTypeLiteral(object) = ty {
                    for binding in &pattern.properties {
                        for member in &object.members {
                            if let TSSignature::TSPropertySignature(property) = member
                                && property.key.static_name().is_some()
                                && property.key.static_name() == binding.key.static_name()
                                && let Some(annotation) = &property.type_annotation
                            {
                                self.typed_pattern(&binding.value, &annotation.type_annotation);
                            }
                        }
                    }
                }
            }
            BindingPattern::ArrayPattern(_) => {}
        }
    }

    pub(super) fn infer(&mut self, destination: &Place, expression: &Expression<'_>) {
        let kind = self.kind(expression);
        if let Some(source) = self.place(expression) {
            self.copy(destination, &source);
        } else {
            self.reset(destination);
        }
        if let Some(kind) = kind
            && !(destination.path.is_empty() && self.declared.contains_key(destination))
        {
            self.kinds.insert(destination.clone(), kind);
        }
        match expression.get_inner_expression() {
            Expression::ObjectExpression(object) => {
                self.infer_object(destination, object);
            }
            Expression::CallExpression(call) if self.core_call(call) == Some("state") => {
                if let Some(value) = call.arguments.first().and_then(|a| a.as_expression()) {
                    self.infer(&destination.child("value"), value);
                }
            }
            Expression::CallExpression(call) if self.core_call(call) == Some("derived") => {
                if let Some(callback) = call.arguments.first().and_then(|a| a.as_expression()) {
                    let (value, early) = returned(callback);
                    if !early && let Some(value) = value {
                        self.infer(&destination.child("value"), value);
                    }
                }
            }
            _ => {}
        }
    }

    fn inferred_pattern(&mut self, pattern: &BindingPattern<'_>, expression: &Expression<'_>) {
        match pattern {
            BindingPattern::BindingIdentifier(id) => {
                if let Some(root) = binding_symbol(id)
                    && !self
                        .scoping
                        .get_resolved_references(root)
                        .any(oxc_semantic::Reference::is_write)
                {
                    self.infer(
                        &Place {
                            root,
                            path: Vec::new(),
                        },
                        expression,
                    );
                }
            }
            BindingPattern::AssignmentPattern(p) => self.inferred_pattern(&p.left, expression),
            BindingPattern::ObjectPattern(object) => {
                if let Some(source) = self.place(expression) {
                    for property in &object.properties {
                        if let (BindingPattern::BindingIdentifier(id), Some(name)) =
                            (&property.value, property.key.static_name())
                            && let Some(root) = binding_symbol(id)
                            && !self
                                .scoping
                                .get_resolved_references(root)
                                .any(oxc_semantic::Reference::is_write)
                        {
                            self.copy(
                                &Place {
                                    root,
                                    path: Vec::new(),
                                },
                                &source.child(&name),
                            );
                        }
                    }
                }
            }
            BindingPattern::ArrayPattern(_) => {}
        }
    }
}

struct Collect<'x, 's> {
    facts: &'x mut Facts<'s>,
}

impl<'a> Visit<'a> for Collect<'_, '_> {
    fn visit_variable_declarator(&mut self, it: &VariableDeclarator<'a>) {
        if let Some(annotation) = &it.type_annotation {
            self.facts
                .typed_pattern(&it.id, &annotation.type_annotation);
        }
        if let Some(init) = &it.init {
            self.facts.inferred_pattern(&it.id, init);
        }
        walk::walk_variable_declarator(self, it);
    }

    fn visit_formal_parameter(&mut self, it: &FormalParameter<'a>) {
        if let Some(annotation) = &it.type_annotation {
            self.facts
                .typed_pattern(&it.pattern, &annotation.type_annotation);
        }
        walk::walk_formal_parameter(self, it);
    }
}

pub(super) fn collect<'s>(program: &Program<'_>, scoping: &'s Scoping) -> Facts<'s> {
    let mut facts = Facts {
        scoping,
        kinds: HashMap::new(),
        declared: HashMap::new(),
        unstable: super::numeric_writes::unstable(program, scoping),
        imports: imports(program),
    };
    for _ in 0..=scoping.symbol_ids().count() {
        let before = facts.kinds.clone();
        Collect { facts: &mut facts }.visit_program(program);
        if facts.kinds == before {
            break;
        }
    }
    facts
        .kinds
        .retain(|place, _| place.path.is_empty() || !facts.unstable.contains(&place.root));
    facts
}
