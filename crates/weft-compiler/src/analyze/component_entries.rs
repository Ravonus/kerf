//! Diagnostics for reactive entry reads and snapshots in components.

use oxc_ast::ast::{
    ArrowFunctionExpression, ComputedMemberExpression, Expression, Function, IdentifierReference,
};
use oxc_ast_visit::{Visit, walk};
use oxc_span::GetSpan;
use oxc_syntax::scope::ScopeFlags;

use crate::diag::{Diagnostic, Edit, Fix, Severity};

use super::{Analyzer, CompCtx, EntryHit, reads_any, symbol_of};

impl Analyzer<'_> {
    /// W017 outside a list: a component's JSX or `derived` reads `box.value[k]` where `k` comes from its props
    /// (`live.value[stock.id]` in a row component). Each instance depends on the whole box, so one write re-runs
    /// every instance. One diagnostic per box per component; the autofix rewrites every such read to `box.get(k)`.
    pub(super) fn scan_component_entries(&mut self, e: &Expression<'_>, depth: i32) {
        let Some(ctx) = self.comps.last() else { return };
        let mut scan = ComponentEntryReads {
            a: self,
            ctx,
            depth,
            found: Vec::new(),
        };
        scan.visit_expression(e);
        let found = scan.found;
        let Some(ctx) = self.comps.last_mut() else {
            return;
        };
        for hit in found {
            if !ctx.entries.iter().any(|h| h.read == hit.read) {
                ctx.entries.push(hit);
            }
        }
    }

    pub(super) fn component_entry_diagnostics(&mut self, ctx: &CompCtx) {
        let comp = ctx.name.clone().unwrap_or_else(|| "this component".into());
        let mut seen: Vec<&str> = Vec::new();
        for hit in &ctx.entries {
            let whole = self.text(hit.whole);
            if seen.contains(&whole) {
                continue;
            }
            seen.push(whole);
            let (read, name, index) = (
                self.text(hit.read),
                self.text(hit.boxed),
                self.text(hit.index),
            );
            let help = if hit.local {
                format!(
                    "Read `{name}.get({index})`: it re-runs only when this entry changes (`Object.is`)."
                )
            } else {
                format!(
                    "Read `{name}.get({index})` (the `{name}` prop is the box, typed `State<…>`): it re-runs only when \
                     this entry changes (`Object.is`)."
                )
            };
            let edits = ctx
                .entries
                .iter()
                .filter(|h| self.text(h.whole) == whole)
                .map(|h| Edit {
                    start: h.read.start,
                    end: h.read.end,
                    text: format!("{}.get({})", self.text(h.boxed), self.text(h.index)),
                })
                .collect();
            let d = Diagnostic::new(
                self.source,
                "W017",
                Severity::Warning,
                (hit.read.start, hit.read.end),
                format!(
                    "`{read}` reads one entry of the whole `{whole}`, so any change to `{name}` re-runs it in every \
                     `{comp}` (every row, in a list), not just the one whose entry changed."
                ),
                help,
            )
            .with_fix(Fix {
                description: format!("Read the entry with `{name}.get(…)`"),
                safe: hit.local,
                edits,
            });
            self.plan.diagnostics.push(d);
        }
    }

    /// W018: `const quote = untrack(() => live.get(id))` in a component body, read only by its JSX: the page shows
    /// the setup-time value and never updates. Reads anywhere else (a handler, a `watch`) suggest a deliberate
    /// snapshot and keep it quiet.
    pub(super) fn snapshot_diagnostics(&mut self, ctx: &CompCtx) {
        for s in ctx
            .snapshots
            .iter()
            .filter(|s| !s.jsx.is_empty() && !s.other)
        {
            let name = &s.name;
            let call = self.text(s.call);
            let mut edits = vec![Edit {
                start: s.callee.start,
                end: s.callee.end,
                text: "derived".into(),
            }];
            edits.extend(s.jsx.iter().map(|r| Edit {
                start: r.end,
                end: r.end,
                text: ".value".into(),
            }));
            let d = Diagnostic::new(
                self.source,
                "W018",
                Severity::Warning,
                (s.call.start, s.call.end),
                format!(
                    "`{name}` is an untracked snapshot (`{call}`) that only the JSX reads: it shows the value from \
                     setup and never updates."
                ),
                format!(
                    "To follow changes, make it `derived(() => …)` and render `{name}.value`. Keep `untrack` only \
                     for a value that must stay fixed."
                ),
            )
            .with_fix(Fix {
                description: format!("Make `{name}` derived (then read it with `.value`)"),
                safe: false,
                edits,
            });
            self.plan.diagnostics.push(d);
        }
    }
}

/// W017 in a component's own reactive positions (a JSX hole or attribute, a `derived` body), outside nested
/// functions: `box.value[k]` or `prop.value[k]` (also `props.box.value[k]`) where `k` reads another of its props.
/// Box-keyed reads (`views.value[tab.value]`) and reads in callbacks (`.map`, `.filter`, handlers) are left alone:
/// they run once per component, not once per instance.
struct ComponentEntryReads<'x, 's> {
    a: &'x Analyzer<'s>,
    ctx: &'x CompCtx,
    depth: i32,
    found: Vec<EntryHit>,
}

impl<'a> Visit<'a> for ComponentEntryReads<'_, '_> {
    fn visit_computed_member_expression(&mut self, it: &ComputedMemberExpression<'a>) {
        if self.depth == 0
            && let Expression::StaticMemberExpression(m) = it.object.without_parentheses()
            && m.property.name == "value"
        {
            let scoping = self.a.scoping;
            let is_prop = |id: &IdentifierReference<'_>| {
                symbol_of(scoping, id).is_some_and(|s| self.ctx.prop_syms.contains(&s))
            };
            // (box span, box symbol, declared in this file)
            let boxed = match &m.object {
                Expression::Identifier(id) => {
                    let sym = symbol_of(scoping, id);
                    if sym.is_some_and(|s| self.a.boxes.contains(&s)) {
                        Some((id.span, sym, true))
                    } else if is_prop(id) && sym != self.ctx.props_param {
                        Some((id.span, sym, false))
                    } else {
                        None
                    }
                }
                Expression::StaticMemberExpression(inner) => match &inner.object {
                    Expression::Identifier(p)
                        if symbol_of(scoping, p).is_some()
                            && symbol_of(scoping, p) == self.ctx.props_param =>
                    {
                        Some((inner.span, None, false))
                    }
                    _ => None,
                },
                _ => None,
            };
            if let Some((span, sym, local)) = boxed
                && reads_any(scoping, &it.expression, |s| {
                    self.ctx.prop_syms.contains(&s) && Some(s) != sym
                })
            {
                self.found.push(EntryHit {
                    read: it.span,
                    whole: m.span,
                    boxed: span,
                    local,
                    index: it.expression.span(),
                });
            }
        }
        walk::walk_computed_member_expression(self, it);
    }
    fn visit_function(&mut self, it: &Function<'a>, flags: ScopeFlags) {
        self.depth += 1;
        walk::walk_function(self, it, flags);
        self.depth -= 1;
    }
    fn visit_arrow_function_expression(&mut self, it: &ArrowFunctionExpression<'a>) {
        self.depth += 1;
        walk::walk_arrow_function_expression(self, it);
        self.depth -= 1;
    }
}
