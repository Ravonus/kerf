//! Prop aliases and writes in component bodies.

use oxc_ast::ast::{
    BindingPattern, Expression, ObjectPattern, SimpleAssignmentTarget, VariableDeclarator,
};
use oxc_semantic::SymbolId;
use oxc_span::{GetSpan, Span};

use crate::diag::{Diagnostic, Severity};

use super::{Analyzer, Rewrite, binding_symbol, key, static_key, symbol_of};

impl Analyzer<'_> {
    /// `const x = props.y`: `x` is another name for the prop, so each use reads it live.
    pub(super) fn alias(&mut self, init: &Expression<'_>) -> Option<Rewrite> {
        let (root, path) = self.prop_path(init)?;
        let ctx = self.comps.last()?;
        if ctx.props_param == Some(root) {
            if path.is_empty() || !self.props_nameable(root, ctx.span) {
                return None;
            }
            let props = self.scoping.symbol_name(root).to_string();
            if path.len() == 1 && path[0] == "children" {
                let ctx = self.comps.pop()?;
                let local = self.children_local(&ctx, &props);
                let component = key(ctx.span);
                self.comps.push(ctx);
                return Some(Rewrite::Children { local, component });
            }
            return Some(Rewrite::Prop { props, path });
        }
        match self.plan.rewrites.get(&root)? {
            Rewrite::Rest { props, exclude, .. } => {
                let first = path.first()?;
                (!exclude.contains(first)).then(|| Rewrite::Prop {
                    props: props.clone(),
                    path,
                })
            }
            Rewrite::Prop { props, path: base } if !self.defaulted.contains(&root) => {
                Some(Rewrite::Prop {
                    props: props.clone(),
                    path: base.iter().cloned().chain(path).collect(),
                })
            }
            Rewrite::Prop { .. } | Rewrite::Children { .. } | Rewrite::Via { .. } => {
                Some(Rewrite::Via { of: root, path })
            }
            _ => None,
        }
    }

    /// `const { a, b = 1, ...rest } = props`: the same live reads as the parameter's pattern. The pattern must be one
    /// that can be: known keys, no array patterns, at most one rest in a component and none below the top.
    pub(super) fn alias_pattern(&mut self, obj: &ObjectPattern<'_>, init: &Expression<'_>) -> bool {
        fn plain(obj: &ObjectPattern<'_>) -> bool {
            obj.properties.iter().all(|p| {
                static_key(&p.key).is_some()
                    && match &p.value {
                        BindingPattern::BindingIdentifier(_) => true,
                        BindingPattern::AssignmentPattern(a) => {
                            matches!(a.left, BindingPattern::BindingIdentifier(_))
                        }
                        BindingPattern::ObjectPattern(inner) => {
                            inner.rest.is_none() && plain(inner)
                        }
                        BindingPattern::ArrayPattern(_) => false,
                    }
            }) && obj
                .rest
                .as_ref()
                .is_none_or(|r| matches!(r.argument, BindingPattern::BindingIdentifier(_)))
        }
        let Some((root, path)) = self.prop_path(init) else {
            return false;
        };
        let Some(ctx) = self.comps.last() else {
            return false;
        };
        let span = key(ctx.span);
        if !plain(obj) {
            return false;
        }
        let (props, base) = if ctx.props_param == Some(root) {
            if !self.props_nameable(root, ctx.span) {
                return false;
            }
            (self.scoping.symbol_name(root).to_string(), Vec::new())
        } else {
            match self.plan.rewrites.get(&root) {
                Some(Rewrite::Prop { props, path }) if !self.defaulted.contains(&root) => {
                    (props.clone(), path.clone())
                }
                _ => return false,
            }
        };
        let base: Vec<String> = base.into_iter().chain(path).collect();
        if obj.rest.is_some() {
            let taken = self
                .plan
                .rewrites
                .values()
                .any(|r| matches!(r, Rewrite::Rest { component, .. } if *component == span));
            if taken || !base.is_empty() {
                return false;
            }
        }
        let Some(mut ctx) = self.comps.pop() else {
            return false;
        };
        self.destructure_props(obj, &props, &base, &mut ctx);
        self.comps.push(ctx);
        true
    }

    /// A destructured prop that's assigned to: plans its local override.
    pub(super) fn written_prop(
        &mut self,
        sym: SymbolId,
        k: &str,
        path: &[String],
        props: &str,
        component: Span,
        span: Span,
    ) {
        if !self.written(sym) {
            return;
        }
        if path.is_empty() && k != "children" {
            self.local_prop(component, props, k, sym);
        } else {
            let name = self.scoping.symbol_name(sym).to_string();
            self.reassigned(span, &name, k);
        }
    }

    pub(super) fn local_prop(&mut self, component: Span, props: &str, k: &str, sym: SymbolId) {
        let entry = self
            .plan
            .local_props
            .entry(key(component))
            .or_insert_with(|| (props.to_string(), Vec::new()));
        if !entry.1.iter().any(|(name, _)| name == k) {
            entry.1.push((k.to_string(), sym));
        }
    }

    /// W001 for a local that names no single prop but is written: nothing says where the write should go.
    pub(super) fn reassigned(&mut self, span: Span, name: &str, read: &str) {
        self.plan.diagnostics.push(Diagnostic::new(
            self.source,
            "W001",
            Severity::Error,
            (span.start, span.end),
            format!("`{name}` is reassigned, but it reads `{read}`, which isn't one prop to override."),
            format!(
                "For an editable copy: `const {name} = state.linked(() => {read})`, then read and write `{name}.value`."
            ),
        ));
    }

    /// `const a = props.a; a = 2`: a `const` is read-only, alias or not. Says where a write can go.
    pub(super) fn const_written(&mut self, it: &VariableDeclarator<'_>) -> bool {
        let Some(init) = it.init.as_ref().filter(|i| self.prop_path(i).is_some()) else {
            return false;
        };
        let names = it.id.get_binding_identifiers();
        let Some(id) = names
            .iter()
            .find(|b| binding_symbol(b).is_some_and(|s| self.written(s)))
        else {
            return false;
        };
        let name = id.name.as_str();
        let read = self.text(init.span()).to_string();
        self.plan.diagnostics.push(Diagnostic::new(
            self.source,
            "W001",
            Severity::Error,
            (id.span.start, id.span.end),
            format!("`{name}` is a `const`, so it can't be assigned to."),
            format!("To write the prop, declare it with `let`, or assign to `{read}` directly."),
        ));
        self.plan.aliases_refused.insert(key(it.span));
        true
    }

    /// `props.x = v` anywhere in a component, closures included: the same override a `let` alias makes.
    pub(super) fn props_write(&mut self, target: &SimpleAssignmentTarget<'_>) {
        let SimpleAssignmentTarget::StaticMemberExpression(m) = target else {
            return;
        };
        let Expression::Identifier(id) = m.object.get_inner_expression() else {
            return;
        };
        let Some(sym) = symbol_of(self.scoping, id) else {
            return;
        };
        let Some(span) = self
            .comps
            .iter()
            .rev()
            .find(|c| c.props_param == Some(sym))
            .map(|c| c.span)
        else {
            return;
        };
        self.local_prop(span, id.name.as_str(), m.property.name.as_str(), sym);
    }

    /// A body-level declarator that only names a prop becomes an alias: see `alias` and `alias_pattern`.
    pub(super) fn try_alias(&mut self, it: &VariableDeclarator<'_>) {
        let Some(init) = &it.init else { return };
        if self.prop_path(init).is_none() {
            return;
        }
        let aliased = match &it.id {
            BindingPattern::BindingIdentifier(id) => {
                let Some(sym) = binding_symbol(id) else {
                    return;
                };
                match self.alias(init) {
                    Some(rewrite) => {
                        if self.written(sym) {
                            let Some(span) = self.comps.last().map(|c| c.span) else {
                                return;
                            };
                            match &rewrite {
                                Rewrite::Prop { props, path } if path.len() == 1 => {
                                    let (props, k) = (props.clone(), path[0].clone());
                                    self.local_prop(span, &props, &k, sym);
                                }
                                _ => {
                                    let read = self.text(init.span()).to_string();
                                    self.reassigned(id.span, id.name.as_str(), &read);
                                    self.plan.aliases_refused.insert(key(it.span));
                                    return;
                                }
                            }
                        }
                        self.plan.rewrites.insert(sym, rewrite);
                        if let Some(c) = self.comps.last_mut() {
                            c.prop_syms.insert(sym);
                        }
                        true
                    }
                    None => false,
                }
            }
            BindingPattern::ObjectPattern(obj) => self.alias_pattern(obj, init),
            _ => false,
        };
        if aliased {
            self.plan.aliases.insert(key(it.span));
        }
    }
}
