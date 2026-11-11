//! W003 joins each watch's source reads with its callback's writes by box identity.
//! Inference covers stable local aliases, known callbacks, literal `.value` members and
//! `.get` reads, including declaration and assignment value patterns. Helper calls,
//! dynamic keys, object-held boxes and dependencies through other boxes stay opaque.
//! Deferred closures have their own execution and are skipped.

use std::collections::{HashMap, HashSet};

use oxc_ast::ast::Expression;
use oxc_semantic::SymbolId;
use oxc_span::Span;

use crate::diag::{Diagnostic, Severity};

use super::super::{SpanKey, key, symbol_of};
use super::reads::Flow;
use super::{Api, Call, Index, Target};

#[derive(Default)]
pub(super) struct Accesses {
    pub(super) reads: HashSet<SymbolId>,
    pub(super) writes: HashMap<SpanKey, SymbolId>,
}

impl Index<'_> {
    pub(super) fn box_symbol(&self, expression: &Expression<'_>) -> Option<SymbolId> {
        let Expression::Identifier(id) = expression.get_inner_expression() else {
            return None;
        };
        let mut sym = symbol_of(self.a.scoping, id)?;
        let mut seen = HashSet::new();
        while self.boxes.contains(&sym) && seen.insert(sym) {
            match self.bindings.get(&sym) {
                Some(Target::Binding(source)) => sym = *source,
                _ => return Some(sym),
            }
        }
        None
    }
}

impl Flow<'_, '_> {
    pub(super) fn watch_read(&mut self, expression: &Expression<'_>) {
        if self.state.tracked && self.watch.is_some() {
            self.watch_box_read(self.index.box_symbol(expression));
        }
    }

    pub(super) fn watch_box_read(&mut self, symbol: Option<SymbolId>) {
        if self.state.tracked
            && let Some(accesses) = &mut self.watch
            && let Some(sym) = symbol
        {
            accesses.reads.insert(sym);
        }
    }
}

pub(super) fn diagnostics(
    index: &Index<'_>,
    calls: &HashMap<SpanKey, Vec<Call>>,
    accesses: &HashMap<SpanKey, Accesses>,
) -> Vec<Diagnostic> {
    let mut sources = HashMap::new();
    let mut callbacks = Vec::new();
    for (function, calls) in calls {
        let Some(accesses) = accesses.get(function) else {
            continue;
        };
        for call in calls {
            match call.api {
                Api::WatchSource => {
                    sources.insert(key(call.span), &accesses.reads);
                }
                Api::WatchCallback => callbacks.push((key(call.span), &accesses.writes)),
                _ => {}
            }
        }
    }
    let mut writes = HashSet::new();
    for (call, targets) in callbacks {
        if let Some(reads) = sources.get(&call) {
            for (&span, sym) in targets {
                if reads.contains(sym) {
                    writes.insert(span);
                }
            }
        }
    }
    let mut writes: Vec<_> = writes.into_iter().collect();
    writes.sort_unstable();
    writes
        .into_iter()
        .map(|(start, end)| {
            let text = index.a.text(Span::new(start, end));
            Diagnostic::new(
                index.a.source,
                "W003",
                Severity::Error,
                (start, end),
                format!("`{text}` is written by a `watch` callback and read by its own source; this can create a cycle."),
                "Use `derived(() => expression)` for computed state. Keep the watch source pure and \
                 write only state it does not read, or move the write to an explicit action.",
            )
        })
        .collect()
}
