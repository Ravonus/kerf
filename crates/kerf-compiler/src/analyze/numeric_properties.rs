//! Resolve object properties in write order, including spreads and unknown overwrites.

use std::collections::HashSet;

use oxc_ast::ast::{Expression, ObjectExpression, ObjectPropertyKind};

use super::numeric_facts::{Facts, Kind, Place};

enum Selected<'b, 'a> {
    Value(&'b Expression<'a>),
    Spread(&'b Expression<'a>),
    Absent,
    Unknown,
}

fn select<'b, 'a>(
    object: &'b ObjectExpression<'a>,
    name: &str,
    empty: &impl Fn(&Expression<'a>, &str) -> bool,
) -> Selected<'b, 'a> {
    for property in object.properties.iter().rev() {
        match property {
            ObjectPropertyKind::ObjectProperty(p) => match p.key.static_name() {
                Some(key) if key == name => return Selected::Value(&p.value),
                None => return Selected::Unknown,
                _ => {}
            },
            ObjectPropertyKind::SpreadProperty(spread) => {
                if let Expression::ObjectExpression(nested) = spread.argument.get_inner_expression()
                {
                    match select(nested, name, empty) {
                        Selected::Absent => {}
                        found => return found,
                    }
                } else if !empty(&spread.argument, name) {
                    return Selected::Spread(&spread.argument);
                }
            }
        }
    }
    Selected::Absent
}

impl Facts<'_> {
    fn spread_member(&self, source: &Expression<'_>, name: &str) -> Option<Kind> {
        let place = self.place(source)?.child(name);
        if !self.stable(&place) {
            return None;
        }
        self.kinds.get(&place).copied()
    }

    fn empty_spread(&self, expression: &Expression<'_>, name: &str) -> bool {
        match self.kind(expression) {
            Some(Kind::Number | Kind::Boolean | Kind::Other) => true,
            Some(Kind::Array | Kind::String) => name == "length",
            _ => false,
        }
    }

    pub(super) fn member(&self, object: &Expression<'_>, name: &str) -> Option<Kind> {
        if let Some(place) = self.place(object) {
            return self.at(&place.child(name));
        }
        if let Expression::ObjectExpression(object) = object.get_inner_expression() {
            return match select(object, name, &|value, name| self.empty_spread(value, name)) {
                Selected::Value(value) => self.kind(value),
                Selected::Spread(source) => self.spread_member(source, name),
                Selected::Absent | Selected::Unknown => None,
            };
        }
        (name == "length"
            && !matches!(
                self.kind(object),
                Some(Kind::Object | Kind::Boolean | Kind::Number | Kind::Other)
            ))
        .then_some(Kind::Number)
    }

    fn object_keys(&self, object: &ObjectExpression<'_>) -> HashSet<String> {
        let mut names = HashSet::new();
        for property in &object.properties {
            match property {
                ObjectPropertyKind::ObjectProperty(p) => {
                    if let Some(name) = p.key.static_name() {
                        names.insert(name.to_string());
                    }
                }
                ObjectPropertyKind::SpreadProperty(spread) => {
                    if let Expression::ObjectExpression(nested) =
                        spread.argument.get_inner_expression()
                    {
                        names.extend(self.object_keys(nested));
                    } else if let Some(source) = self.place(&spread.argument) {
                        for place in self.kinds.keys() {
                            if self.stable(place)
                                && place.root == source.root
                                && place.path.len() == source.path.len() + 1
                                && place.path.starts_with(&source.path)
                                && let Some(name) = place.path.last()
                            {
                                names.insert(name.clone());
                            }
                        }
                    }
                }
            }
        }
        names
    }

    pub(super) fn infer_object(&mut self, destination: &Place, object: &ObjectExpression<'_>) {
        // Rebuilding also removes facts hidden by a later unknown spread or computed key.
        self.kinds.retain(|place, _| {
            place.root != destination.root
                || !place.path.starts_with(&destination.path)
                || place.path == destination.path
        });
        for name in self.object_keys(object) {
            let child = destination.child(&name);
            match select(object, &name, &|value, name| self.empty_spread(value, name)) {
                Selected::Value(value) => self.infer(&child, value),
                Selected::Spread(source) => {
                    if self.spread_member(source, &name).is_some()
                        && let Some(place) = self.place(source)
                    {
                        self.copy(&child, &place.child(&name));
                    }
                }
                Selected::Absent | Selected::Unknown => {}
            }
        }
    }

    pub(super) fn reset(&mut self, destination: &Place) {
        let declared = destination.path.is_empty() && self.declared.contains_key(destination);
        self.kinds.retain(|place, _| {
            place.root != destination.root
                || !place.path.starts_with(&destination.path)
                || (declared && place == destination)
        });
    }

    pub(super) fn copy(&mut self, destination: &Place, source: &Place) {
        let source_kind = self.at(source);
        let children: Vec<_> = self
            .kinds
            .iter()
            .filter(|(place, _)| {
                self.stable(place)
                    && place.root == source.root
                    && place.path.starts_with(&source.path)
            })
            .map(|(place, kind)| {
                let mut target = destination.clone();
                target
                    .path
                    .extend_from_slice(&place.path[source.path.len()..]);
                (target, *kind)
            })
            .collect();
        let declared = destination.path.is_empty() && self.declared.contains_key(destination);
        self.reset(destination);
        if !declared && let Some(kind) = source_kind {
            self.kinds.insert(destination.clone(), kind);
        }
        for (place, kind) in children {
            if !declared || place != *destination {
                self.kinds.insert(place, kind);
            }
        }
    }
}
