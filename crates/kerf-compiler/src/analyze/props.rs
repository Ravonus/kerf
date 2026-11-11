//! Component prop rewrites and nested-destructuring diagnostics.

use oxc_ast::ast::{BindingPattern, Expression, ObjectPattern};
use oxc_semantic::SymbolId;
use oxc_span::Span;

use crate::diag::{Diagnostic, Edit, Fix, Severity};

use super::{Analyzer, ChildrenPlan, CompCtx, Rewrite, binding_symbol, key, static_key, symbol_of};

impl Analyzer<'_> {
    pub(super) fn destructure_props(
        &mut self,
        obj: &ObjectPattern<'_>,
        props: &str,
        path: &[String],
        ctx: &mut CompCtx,
    ) {
        let mut seen = Vec::new();
        for prop in &obj.properties {
            let Some(k) = static_key(&prop.key) else {
                continue;
            };
            seen.push(k.clone());
            let mut sub = path.to_vec();
            sub.push(k.clone());
            match &prop.value {
                BindingPattern::BindingIdentifier(id) => {
                    if let Some(sym) = binding_symbol(id) {
                        self.written_prop(sym, &k, path, props, ctx.span, prop.span);
                        let rewrite = if path.is_empty() && k == "children" {
                            Rewrite::Children {
                                local: self.children_local(ctx, props),
                                component: key(ctx.span),
                            }
                        } else {
                            Rewrite::Prop {
                                props: props.into(),
                                path: sub,
                            }
                        };
                        self.plan.rewrites.insert(sym, rewrite);
                        ctx.prop_syms.insert(sym);
                    }
                }
                BindingPattern::AssignmentPattern(ap) => {
                    if let BindingPattern::BindingIdentifier(id) = &ap.left
                        && let Some(sym) = binding_symbol(id)
                    {
                        self.written_prop(sym, &k, path, props, ctx.span, prop.span);
                        self.plan.rewrites.insert(
                            sym,
                            Rewrite::Prop {
                                props: props.into(),
                                path: sub,
                            },
                        );
                        ctx.prop_syms.insert(sym);
                        self.defaulted.insert(sym);
                    }
                }
                BindingPattern::ObjectPattern(inner) => {
                    if path.is_empty() {
                        self.nested_prop_diagnostic(&k, inner, prop.span);
                    }
                    // Lowered live anyway (`props.user.name`), so the output is right while the error stands.
                    self.destructure_props(inner, props, &sub, ctx);
                }
                BindingPattern::ArrayPattern(_) => {}
            }
        }
        if let Some(rest) = &obj.rest
            && let BindingPattern::BindingIdentifier(id) = &rest.argument
            && let Some(sym) = binding_symbol(id)
        {
            let text = &self.source[ctx.span.start as usize..ctx.span.end as usize];
            let local = if text.contains("_rest") {
                "_rest$"
            } else {
                "_rest"
            };
            let rewrite = Rewrite::Rest {
                props: props.into(),
                exclude: seen,
                local: local.into(),
                component: key(ctx.span),
            };
            self.plan.rewrites.insert(sym, rewrite);
            ctx.prop_syms.insert(sym);
        }
    }

    fn nested_prop_diagnostic(&mut self, k: &str, inner: &ObjectPattern<'_>, span: Span) {
        let names: Vec<(SymbolId, String)> = inner
            .properties
            .iter()
            .filter_map(|p| match (&p.value, static_key(&p.key)) {
                (BindingPattern::BindingIdentifier(id), Some(n)) => {
                    binding_symbol(id).map(|s| (s, format!("{k}.{n}")))
                }
                _ => None,
            })
            .collect();
        let d = Diagnostic::new(
            self.source,
            "W006",
            Severity::Error,
            (span.start, span.end),
            format!("Nested destructuring of the `{k}` prop reads it once and stops updating."),
            format!("Destructure `{k}` and read `{k}.field` where you use it."),
        )
        .with_fix(Fix {
            description: format!("Destructure `{k}` and read its fields at the use site"),
            safe: true,
            edits: vec![Edit {
                start: span.start,
                end: span.end,
                text: k.to_string(),
            }],
        });
        self.w006.push((self.plan.diagnostics.len(), names));
        self.plan.diagnostics.push(d);
    }

    /// Where `e` reads from, if it's a plain path off the component's props: the props object's name and the path.
    /// `None` for anything else, a default or memo in the way included.
    pub(super) fn prop_path(&self, e: &Expression<'_>) -> Option<(SymbolId, Vec<String>)> {
        let mut path = Vec::new();
        let mut e = e.get_inner_expression();
        let id = loop {
            match e {
                Expression::StaticMemberExpression(m) if !m.optional => {
                    path.insert(0, m.property.name.to_string());
                    e = m.object.get_inner_expression();
                }
                Expression::Identifier(id) => break id,
                _ => return None,
            }
        };
        let sym = symbol_of(self.scoping, id)?;
        self.comps
            .last()?
            .prop_syms
            .contains(&sym)
            .then_some((sym, path))
    }

    /// The props parameter can be named at a use only if no inner scope binds that name too.
    pub(super) fn props_nameable(&self, sym: SymbolId, span: Span) -> bool {
        let name = self.scoping.symbol_name(sym);
        !self.written(sym)
            && !self.scoping.symbol_ids().any(|s| {
                s != sym && self.scoping.symbol_name(s) == name && {
                    let at = self.scoping.symbol_span(s);
                    at.start >= span.start && at.end <= span.end
                }
            })
    }

    pub(super) fn written(&self, sym: SymbolId) -> bool {
        self.scoping
            .get_resolved_references(sym)
            .any(oxc_semantic::Reference::is_write)
    }

    /// The memo local for a component's children, planned on first use.
    pub(super) fn children_local(&mut self, ctx: &CompCtx, props: &str) -> String {
        let plan = self.plan.children.entry(key(ctx.span)).or_insert_with(|| {
            let text = &self.source[ctx.span.start as usize..ctx.span.end as usize];
            let local = if text.contains("_children") {
                "_children$"
            } else {
                "_children"
            };
            ChildrenPlan {
                props: props.into(),
                local: local.into(),
            }
        });
        plan.local.clone()
    }
}
