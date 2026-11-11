//! Component context for the analysis walk.

use std::collections::HashSet;

use oxc_ast::ast::{BindingPattern, FormalParameters};
use oxc_semantic::SymbolId;
use oxc_span::Span;

use super::{Analyzer, CompCtx, Rewrite, binding_symbol, key};

impl<'s> Analyzer<'s> {
    pub(super) fn text(&self, span: Span) -> &'s str {
        &self.source[span.start as usize..span.end as usize]
    }

    pub(super) fn is_rest(&self, sym: SymbolId) -> bool {
        matches!(self.plan.rewrites.get(&sym), Some(Rewrite::Rest { .. }))
    }

    pub(super) fn body_level(&self) -> Option<&CompCtx> {
        self.comps
            .last()
            .filter(|c| c.fn_depth == 0 && c.jsx_depth == 0)
    }

    pub(super) fn nested(&mut self, f: impl FnOnce(&mut Self)) {
        if let Some(c) = self.comps.last_mut() {
            c.fn_depth += 1;
        }
        f(self);
        if let Some(c) = self.comps.last_mut() {
            c.fn_depth -= 1;
        }
    }

    pub(super) fn enter_component(
        &mut self,
        name: String,
        span: Span,
        params: &FormalParameters<'_>,
        f: impl FnOnce(&mut Self),
    ) {
        let mut ctx = CompCtx {
            name: Some(name),
            span,
            props_param: None,
            prop_syms: HashSet::new(),
            fn_depth: 0,
            jsx_depth: 0,
            state_arg: None,
            body_decl: None,
            reported_decls: HashSet::new(),
            entries: Vec::new(),
            snapshots: Vec::new(),
        };
        let text = self.text(span);
        let props_name = if text.contains("props") {
            "$props"
        } else {
            "props"
        }
        .to_string();
        if let Some(first) = params.items.first() {
            match &first.pattern {
                BindingPattern::BindingIdentifier(id) => {
                    ctx.prop_syms.extend(binding_symbol(id));
                    ctx.props_param = binding_symbol(id);
                }
                BindingPattern::ObjectPattern(obj) => {
                    self.plan.components.insert(key(span), props_name.clone());
                    self.destructure_props(obj, &props_name, &[], &mut ctx);
                }
                _ => {}
            }
        }
        self.comps.push(ctx);
        f(self);
        let ctx = self
            .comps
            .pop()
            .expect("pushed above, and `f` leaves the stack as it found it");
        self.component_entry_diagnostics(&ctx);
        self.snapshot_diagnostics(&ctx);
    }
}
