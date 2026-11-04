//! Diagnostics for reactive entry reads inside list rows.

use oxc_ast::ast::{
    ArrowFunctionExpression, ComputedMemberExpression, Expression, Function, IdentifierReference,
    JSXAttributeItem, JSXAttributeName, JSXElementName, JSXOpeningElement,
};
use oxc_ast_visit::{Visit, walk};
use oxc_semantic::{Scoping, SymbolId};
use oxc_span::{GetSpan, Span};
use oxc_syntax::scope::ScopeFlags;

use crate::diag::{Diagnostic, Edit, Fix, Severity};

use super::{Analyzer, jsx_name, symbol_of};

impl<'s> Analyzer<'s> {
    /// W017: `cart[p.id]` or `cart.value[p.id]` in a row reads one entry of a whole object, so every write to it
    /// re-runs every row. `box.get(key)` re-runs only the row whose entry changed (`Object.is`). A box read gets the
    /// safe autofix; a prop needs the parent to pass the box, which the compiler can't do from here.
    pub(super) fn entry_reads(&mut self, cb: &Expression<'_>, items: &[SymbolId]) {
        let mut reads = EntryReads {
            a: self,
            items,
            depth: 0,
            child: None,
            found: Vec::new(),
        };
        reads.visit_expression(cb);
        let found = reads.found;
        let mut seen: Vec<String> = Vec::new();
        for hit in &found {
            let whole = self.text(hit.whole).to_string();
            if seen.contains(&whole) {
                continue;
            }
            seen.push(whole.clone());
            let read = self.text(hit.read);
            let index_text = self.text(hit.index);
            let name = hit.boxed.map_or_else(
                || whole.rsplit('.').next().unwrap_or(&whole),
                |b| self.text(b),
            );
            // Passed straight to a child component (`<Row live={live.value[s.id]} />`): the child's reads of that
            // prop are what re-run, so say where the entry should be read.
            let child = found
                .iter()
                .filter(|h| self.text(h.whole) == whole)
                .find_map(|h| h.child.as_ref());
            let fix = match (hit.boxed, child) {
                (Some(_), Some((comp, prop))) => format!(
                    "Pass the entry with `{prop}={{{name}.get({index_text})}}`, or pass the box (`{name}={{{name}}}`, \
                     typed `State<…>`) and read `{name}.get(…)` in `<{comp}>`: a row then re-runs only when its own \
                     entry changes."
                ),
                (Some(_), None) => format!("Read `{name}.get({index_text})`."),
                (None, Some((comp, _))) => format!(
                    "Pass the box instead of its value (`{name}={{{name}}}`, typed `State<…>`) and read \
                     `{name}.get({index_text})` in `<{comp}>`: a row then re-runs only when its own entry changes."
                ),
                (None, None) => format!(
                    "Pass the box instead of its value (`{name}={{{name}}}`, typed `State<…>`) and read \
                     `{name}.get({index_text})`: a row then re-runs only when its own entry changes."
                ),
            };
            let mut d = Diagnostic::new(
                self.source,
                "W017",
                Severity::Warning,
                (hit.read.start, hit.read.end),
                format!(
                    "`{read}` reads one entry of the whole `{whole}` in every row, so any change to `{whole}` re-runs \
                     every row, not just the row whose entry changed."
                ),
                fix,
            );
            if hit.boxed.is_some() {
                let edits = found
                    .iter()
                    .filter(|h| self.text(h.whole) == whole)
                    .map(|h| Edit {
                        start: h.read.start,
                        end: h.read.end,
                        text: format!("{name}.get({})", self.text(h.index)),
                    })
                    .collect();
                // A box that arrived as a prop is only probably a box (`.value` on a prop), so the edit is a suggestion.
                d = d.with_fix(Fix {
                    description: format!("Read entries with `{name}.get(…)`"),
                    safe: hit.local,
                    edits,
                });
            }
            self.plan.diagnostics.push(d);
        }
    }
}

/// W017 candidates in a row callback (not in its handlers or other nested functions): `whole[…item…]` where `whole`
/// is a prop (`cart`, `props.cart`), `box.value`, or `prop.value` (a box that arrived as a prop).
struct EntryReads<'x, 's> {
    a: &'x Analyzer<'s>,
    items: &'x [SymbolId],
    depth: u32,
    /// The child component and prop whose value is being visited (`<Row live={…} />`).
    child: Option<(String, String)>,
    found: Vec<RowEntry>,
}

struct RowEntry {
    read: Span,
    /// `whole` in `whole[…]`
    whole: Span,
    /// The box identifier, for the `.get` form.
    boxed: Option<Span>,
    /// The box is declared in this file (the autofix is safe).
    local: bool,
    index: Span,
    child: Option<(String, String)>,
}

impl EntryReads<'_, '_> {
    fn is_prop(&self, id: &IdentifierReference<'_>) -> bool {
        symbol_of(self.a.scoping, id)
            .is_some_and(|s| self.a.comps.iter().any(|c| c.prop_syms.contains(&s)))
    }
    fn reads_item(&self, e: &Expression<'_>) -> bool {
        reads_any(self.a.scoping, e, |s| self.items.contains(&s))
    }
}

/// Whether `e` reads an identifier whose symbol passes `hit`.
pub(super) fn reads_any(
    scoping: &Scoping,
    e: &Expression<'_>,
    hit: impl Fn(SymbolId) -> bool,
) -> bool {
    struct Uses<'z, F> {
        scoping: &'z Scoping,
        hit: F,
        found: bool,
    }
    impl<'a, F: Fn(SymbolId) -> bool> Visit<'a> for Uses<'_, F> {
        fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
            self.found |= symbol_of(self.scoping, it).is_some_and(&self.hit);
        }
    }
    let mut u = Uses {
        scoping,
        hit,
        found: false,
    };
    u.visit_expression(e);
    u.found
}

impl<'a> Visit<'a> for EntryReads<'_, '_> {
    fn visit_computed_member_expression(&mut self, it: &ComputedMemberExpression<'a>) {
        if self.depth == 1 && self.reads_item(&it.expression) {
            let whole = match it.object.without_parentheses() {
                Expression::Identifier(id) if self.is_prop(id) => Some((id.span, None, false)),
                Expression::StaticMemberExpression(m) => match &m.object {
                    Expression::Identifier(id)
                        if m.property.name == "value"
                            && symbol_of(self.a.scoping, id)
                                .is_some_and(|s| self.a.boxes.contains(&s)) =>
                    {
                        Some((m.span, Some(id.span), true))
                    }
                    Expression::Identifier(id)
                        if m.property.name == "value" && self.is_prop(id) =>
                    {
                        Some((m.span, Some(id.span), false))
                    }
                    Expression::Identifier(id)
                        if symbol_of(self.a.scoping, id).is_some_and(|s| {
                            self.a.comps.iter().any(|c| c.props_param == Some(s))
                        }) =>
                    {
                        Some((m.span, None, false))
                    }
                    _ => None,
                },
                _ => None,
            };
            if let Some((whole, boxed, local)) = whole {
                let child = self.child.clone();
                self.found.push(RowEntry {
                    read: it.span,
                    whole,
                    boxed,
                    local,
                    index: it.expression.span(),
                    child,
                });
            }
        }
        walk::walk_computed_member_expression(self, it);
    }
    fn visit_jsx_opening_element(&mut self, it: &JSXOpeningElement<'a>) {
        let intrinsic = matches!(&it.name, JSXElementName::Identifier(n) if n.name.starts_with(|c: char| c.is_ascii_lowercase()));
        if intrinsic {
            return walk::walk_jsx_opening_element(self, it);
        }
        self.visit_jsx_element_name(&it.name);
        let component = jsx_name(&it.name);
        for attr in &it.attributes {
            let prev = self.child.take();
            if let JSXAttributeItem::Attribute(a) = attr
                && let JSXAttributeName::Identifier(n) = &a.name
            {
                self.child = Some((component.clone(), n.name.to_string()));
            }
            self.visit_jsx_attribute_item(attr);
            self.child = prev;
        }
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
