//! Complete deferred fixes and cross-file facts after the walk.

use crate::diag::{Diagnostic, Edit, Severity, line_col};
use crate::project::SpreadProp;

use super::{Analyzer, Plan};

impl<'s> Analyzer<'s> {
    pub(super) fn finish(mut self) -> Plan {
        for (index, names) in std::mem::take(&mut self.w006) {
            let mut edits = Vec::new();
            for (sym, text) in names {
                for span in self.ref_spans.get(&sym).into_iter().flatten() {
                    edits.push(Edit {
                        start: span.start,
                        end: span.end,
                        text: text.clone(),
                    });
                }
            }
            if let Some(fix) = self.plan.diagnostics[index].fix.as_mut() {
                fix.edits.extend(edits);
            }
        }
        for (span, ctx) in std::mem::take(&mut self.spreads) {
            let listed = ctx.and_then(|s| self.list_sources.iter().find(|(sym, _)| *sym == s));
            let help = "Keep items stable and read the changing field live in the row (`prices.get(p.id)`), \
                        or replace only the item that changed (`p.id === id ? { ...p, price } : p`).";
            let d = match (listed, ctx) {
                (Some((sym, list)), _) => {
                    let (line, _) = line_col(self.source, list.start);
                    let name = self.scoping.symbol_name(*sym).to_string();
                    Diagnostic::new(
                        self.source,
                        "W014",
                        Severity::Error,
                        (span.start, span.end),
                        format!(
                            "`.map(p => ({{ ...p, … }}))` gives every item a new identity on each update, and \
                             `{name}` is rendered as a keyed list (line {line}): every row re-runs on every change."
                        ),
                        help,
                    )
                }
                (None, Some(sym)) => {
                    for (_, component, import, prop) in
                        self.box_props.iter().filter(|(b, ..)| *b == sym)
                    {
                        self.plan.facts.spread_props.push(SpreadProp {
                            start: span.start,
                            end: span.end,
                            component: component.clone(),
                            import: import.clone(),
                            prop: prop.clone(),
                        });
                    }
                    Diagnostic::new(
                        self.source,
                        "W014",
                        Severity::Warning,
                        (span.start, span.end),
                        "`.map(p => ({ ...p, … }))` gives every item a new identity on each update; if this list is \
                         rendered by key, every row re-runs on every change.",
                        help,
                    )
                }
                (None, None) => continue,
            };
            self.plan.diagnostics.push(d);
        }
        self.plan.diagnostics.sort_by_key(|d| d.start);
        self.plan
    }
}
