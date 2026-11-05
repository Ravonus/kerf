//! Keep numeric evidence by binding and property path; unknown values stay unknown.

use std::collections::HashMap;

use oxc_ast::ast::{
    BindingPattern, CallExpression, ChainElement, Expression, FormalParameter, ObjectPropertyKind,
    Program, TSSignature, TSType, VariableDeclarator,
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
struct Place {
    root: SymbolId,
    path: Vec<String>,
}

impl Place {
    fn child(&self, name: &str) -> Self {
        let mut place = self.clone();
        place.path.push(name.to_string());
        place
    }
}

pub(super) struct Facts<'s> {
    scoping: &'s Scoping,
    kinds: HashMap<Place, Kind>,
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
    fn place(&self, expression: &Expression<'_>) -> Option<Place> {
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

    fn at(&self, place: &Place) -> Option<Kind> {
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

    fn member(&self, object: &Expression<'_>, name: &str) -> Option<Kind> {
        if let Some(place) = self.place(object) {
            return self.at(&place.child(name));
        }
        if let Expression::ObjectExpression(obj) = object.get_inner_expression() {
            return obj.properties.iter().find_map(|property| match property {
                ObjectPropertyKind::ObjectProperty(p)
                    if p.key.static_name().is_some_and(|key| key == name) =>
                {
                    Some(self.kind(&p.value).unwrap_or(Kind::Other))
                }
                _ => None,
            });
        }
        (name == "length"
            && !matches!(
                self.kind(object),
                Some(Kind::Object | Kind::Boolean | Kind::Number | Kind::Other)
            ))
        .then_some(Kind::Number)
    }

    pub(super) fn core_call<'b>(&'b self, call: &'b CallExpression<'_>) -> Option<&'b str> {
        let (module, name) = imported_call(call, self.scoping, &self.imports)?;
        (module == "@weft-js/core").then_some(name)
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
            _ => {}
        }
    }

    fn copy(&mut self, destination: &Place, source: &Place) {
        if let Some(kind) = self.at(source) {
            self.kinds.entry(destination.clone()).or_insert(kind);
        }
        let children: Vec<_> = self
            .kinds
            .iter()
            .filter(|(place, _)| place.root == source.root && place.path.starts_with(&source.path))
            .map(|(place, kind)| {
                let mut target = destination.clone();
                target
                    .path
                    .extend_from_slice(&place.path[source.path.len()..]);
                (target, *kind)
            })
            .collect();
        for (place, kind) in children {
            self.kinds.entry(place).or_insert(kind);
        }
    }

    fn infer(&mut self, destination: &Place, expression: &Expression<'_>) {
        if let Some(kind) = self.kind(expression) {
            self.kinds.entry(destination.clone()).or_insert(kind);
        }
        if let Some(source) = self.place(expression) {
            self.copy(destination, &source);
        }
        match expression.get_inner_expression() {
            Expression::ObjectExpression(object) => {
                for property in &object.properties {
                    if let ObjectPropertyKind::ObjectProperty(p) = property
                        && let Some(name) = p.key.static_name()
                    {
                        let child = destination.child(&name);
                        self.infer(&child, &p.value);
                    }
                }
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
            _ => {}
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
        imports: imports(program),
    };
    for _ in 0..=scoping.symbol_ids().count() {
        let before = facts.kinds.len();
        Collect { facts: &mut facts }.visit_program(program);
        if facts.kinds.len() == before {
            break;
        }
    }
    facts
}
