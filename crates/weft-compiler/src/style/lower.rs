//! Lower static group spreads and record their uses.

use std::collections::BTreeMap;

use oxc_allocator::TakeIn;
use oxc_ast::ast::{
    Argument, Expression, JSXAttributeItem, JSXAttributeName, JSXAttributeValue, JSXExpression,
    ObjectProperty, ObjectPropertyKind, StaticMemberExpression,
};
use oxc_span::{GetSpan, SPAN, Span};

use crate::diag::{Diagnostic, Severity};

use super::values::{accent, did_you_mean, list, literals, not_static, resolves};
use super::{ARIA, Axes, GroupUse, Lower, Meta, PSEUDO, state_attr};

impl<'a> Lower<'a, '_> {
    pub(super) fn attr(&self, name: &str, value: JSXAttributeValue<'a>) -> JSXAttributeItem<'a> {
        let name =
            JSXAttributeName::new_identifier(SPAN, self.allocator.alloc_str(name), &self.ast);
        JSXAttributeItem::new_attribute(SPAN, name, Some(value), &self.ast)
    }

    pub(super) fn text(&self, name: &str, value: &str) -> JSXAttributeItem<'a> {
        self.attr(
            name,
            JSXAttributeValue::new_string_literal(
                SPAN,
                self.allocator.alloc_str(value),
                None,
                &self.ast,
            ),
        )
    }

    pub(super) fn expr(&self, name: &str, e: Expression<'a>) -> JSXAttributeItem<'a> {
        self.attr(
            name,
            JSXAttributeValue::new_expression_container(SPAN, JSXExpression::from(e), &self.ast),
        )
    }

    pub(super) fn string(&self, value: &str) -> Expression<'a> {
        Expression::new_string_literal(SPAN, self.allocator.alloc_str(value), None, &self.ast)
    }

    pub(super) fn error(&mut self, span: Span, message: String, help: String) {
        self.diagnostics.push(Diagnostic::new(
            self.source,
            "D025",
            Severity::Error,
            (span.start, span.end),
            message,
            help,
        ));
    }

    pub(super) fn meta_of(&self, e: &Expression) -> Option<&Meta> {
        resolves(self.scoping, e).and_then(|s| self.metas.get(&s))
    }

    /// The attributes a group spread lowers to, or `None` to leave it a runtime spread.
    pub(super) fn lower(
        &mut self,
        arg: &mut Expression<'a>,
        line: u32,
    ) -> Option<Vec<JSXAttributeItem<'a>>> {
        if let Expression::StaticMemberExpression(m) = arg {
            return self.lower_part(m, line);
        }
        let Expression::CallExpression(call) = arg else {
            return None;
        };
        let meta = self.meta_of(&call.callee)?;
        let name = meta.name.clone();
        let axes = meta.axes.clone();
        let (inherit, states, defaults) = (
            meta.inherit.clone(),
            meta.states.clone(),
            meta.defaults.clone(),
        );
        let mut use_ = GroupUse {
            group: name.clone(),
            axes: BTreeMap::new(),
            states: Vec::new(),
            part: None,
            dynamic: false,
            accent: None,
            line,
        };
        let props = match call.arguments.first_mut() {
            None => None,
            Some(Argument::ObjectExpression(o))
                if o.properties
                    .iter()
                    .all(|p| matches!(p, ObjectPropertyKind::ObjectProperty(p) if !p.computed)) =>
            {
                Some(o)
            }
            Some(_) => {
                use_.dynamic = true;
                self.uses.push(use_);
                return None;
            }
        };
        let mut out = vec![self.text("data-g", &name)];
        for p in props.into_iter().flat_map(|o| o.properties.iter_mut()) {
            let ObjectPropertyKind::ObjectProperty(p) = p else {
                continue;
            };
            self.lower_property(p, &name, (&axes, &inherit, &states), &mut use_, &mut out);
        }
        for (axis, value) in defaults {
            if !use_.axes.contains_key(&axis) && axes.iter().any(|(a, _)| *a == axis) {
                out.push(self.text(&format!("data-{axis}"), &value));
                use_.axes.insert(axis, Some(vec![value]));
            }
        }
        self.uses.push(use_);
        Some(out)
    }

    fn lower_part(
        &mut self,
        m: &StaticMemberExpression<'a>,
        line: u32,
    ) -> Option<Vec<JSXAttributeItem<'a>>> {
        let meta = self.meta_of(&m.object)?;
        let (name, part) = (meta.name.clone(), m.property.name.to_string());
        if !meta.parts.contains(&part) {
            let help = format!(
                "{}Parts of {name}: {}.",
                did_you_mean(&part, &meta.parts),
                list(&meta.parts)
            );
            self.error(
                m.property.span,
                format!("group {name} has no part `{part}`"),
                help,
            );
            return None;
        }
        self.uses.push(GroupUse {
            group: name.clone(),
            axes: BTreeMap::new(),
            states: Vec::new(),
            part: Some(part.clone()),
            dynamic: false,
            accent: None,
            line,
        });
        let part_attr = self.text("data-part", &part);
        Some(if self.tagged_parts {
            vec![self.text("data-g", &name), part_attr]
        } else {
            vec![part_attr]
        })
    }

    fn lower_property(
        &mut self,
        p: &mut ObjectProperty<'a>,
        name: &str,
        inputs: (&Axes, &[String], &[String]),
        use_: &mut GroupUse,
        out: &mut Vec<JSXAttributeItem<'a>>,
    ) {
        let (axes, inherit, states) = inputs;
        let Some(key) = p.key.static_name().map(|k| k.to_string()) else {
            return;
        };
        if key == "accent" && !axes.iter().any(|(a, _)| a == "accent") && !states.contains(&key) {
            self.lower_accent(p, name, use_, out);
            return;
        }
        if let Some((_, values)) = axes.iter().find(|(a, _)| *a == key) {
            self.lower_axis(p, name, key, values, use_, out);
        } else if states.contains(&key) && !PSEUDO.contains(&key.as_str()) {
            self.lower_state(p, key, use_, out);
        } else {
            self.invalid_property(p, name, &key, axes, inherit, states);
        }
    }

    fn lower_accent(
        &mut self,
        p: &ObjectProperty<'a>,
        name: &str,
        use_: &mut GroupUse,
        out: &mut Vec<JSXAttributeItem<'a>>,
    ) {
        match accent(&p.value) {
            Ok(set) if set.is_empty() => {}
            Ok(set) => {
                let words: Vec<String> = set.iter().map(|(k, v)| format!("{k}:{v}")).collect();
                out.push(self.text("data-accent", &words.join(" ")));
                use_.accent = Some(set);
            }
            Err(span) => {
                let what = format!(
                    "`{}` in {name}'s accent",
                    &self.source[span.start as usize..span.end as usize]
                );
                self.diagnostics.push(not_static(
                    self.source,
                    span,
                    &what,
                    "An accent is `{ intent: 'token' }` with literal tokens: accent: { radius: 'round' }.",
                ));
            }
        }
    }

    fn lower_axis(
        &mut self,
        p: &mut ObjectProperty<'a>,
        name: &str,
        key: String,
        values: &[String],
        use_: &mut GroupUse,
        out: &mut Vec<JSXAttributeItem<'a>>,
    ) {
        let produced = literals(&p.value);
        for v in produced.iter().flatten() {
            if !values.contains(v) {
                let help = format!(
                    "{}Values of {name}.{key}: {}.",
                    did_you_mean(v, values),
                    list(values)
                );
                self.error(
                    p.value.span(),
                    format!("`{v}` isn't a value of {name}'s `{key}` axis"),
                    help,
                );
            }
        }
        let attr = format!("data-{key}");
        out.push(match &p.value {
            Expression::StringLiteral(s) => self.text(&attr, &s.value),
            _ => self.expr(&attr, p.value.take_in(&self.ast)),
        });
        use_.axes.insert(key, produced);
    }

    fn lower_state(
        &mut self,
        p: &mut ObjectProperty<'a>,
        key: String,
        use_: &mut GroupUse,
        out: &mut Vec<JSXAttributeItem<'a>>,
    ) {
        // ARIA states are the words "true"/"false" for any truthy value, written as text when static; other states are
        // present or not.
        let aria = ARIA.contains(&key.as_str());
        let attr = state_attr(&key);
        match &p.value {
            Expression::BooleanLiteral(b) if aria => {
                out.push(self.text(&attr, if b.value { "true" } else { "false" }));
            }
            Expression::BooleanLiteral(b) if b.value => out.push(self.text(&attr, "")),
            Expression::BooleanLiteral(_) => {}
            _ => {
                let test = p.value.take_in(&self.ast);
                let (yes, no) = if aria {
                    (self.string("true"), self.string("false"))
                } else {
                    (
                        self.string(""),
                        Expression::new_null_literal(SPAN, &self.ast),
                    )
                };
                out.push(self.expr(
                    &attr,
                    Expression::new_conditional_expression(SPAN, test, yes, no, &self.ast),
                ));
            }
        }
        use_.states.push(key);
    }

    fn invalid_property(
        &mut self,
        p: &ObjectProperty<'a>,
        name: &str,
        key: &str,
        axes: &[(String, Vec<String>)],
        inherit: &[String],
        states: &[String],
    ) {
        let (message, help) = if PSEUDO.contains(&key) && states.iter().any(|s| s == key) {
            (
                format!("`{key}` is read from the element (:{key}), not passed"),
                "Drop it from the call; the group's `states` style it.".to_string(),
            )
        } else if inherit.iter().any(|s| s == key) {
            (
                format!("{name}'s `{key}` axis is inherited from the nearest surface"),
                "Set it on an ancestor, not here.".to_string(),
            )
        } else {
            let ax: Vec<String> = axes.iter().map(|(a, _)| a.clone()).collect();
            let all: Vec<String> = ax.iter().chain(states.iter()).cloned().collect();
            (
                format!("group {name} has no axis or state `{key}`"),
                format!(
                    "{}Axes: {}. States: {}.",
                    did_you_mean(key, &all),
                    list(&ax),
                    list(states)
                ),
            )
        };
        self.error(p.key.span(), message, help);
    }
}
