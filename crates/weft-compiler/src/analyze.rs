//! Read-only pass: find components, their props and boxes, JSX lists, and the diagnostics (W001, W005, W006,
//! W010, W013, W014). Produces a `Plan` that `transform` applies to the same AST.

use std::collections::{HashMap, HashSet};

use oxc_ast::ast::*;
use oxc_ast_visit::{Visit, walk};
use oxc_semantic::{Scoping, SymbolId};
use oxc_span::{GetSpan, Span};
use oxc_syntax::scope::ScopeFlags;

use crate::diag::{Diagnostic, Edit, Fix, Severity, line_col};

pub type SpanKey = (u32, u32);

pub fn key(span: Span) -> SpanKey {
    (span.start, span.end)
}

#[derive(Clone, Debug)]
pub enum Rewrite {
    /// `a` → `props.a` (with `path` for nested members), default applied on every read.
    Prop { props: String, path: Vec<String>, default: Option<SpanKey> },
    /// `rest` → `omit(props, [...])`, a live view of the other props.
    Rest { props: String, exclude: Vec<String> },
    /// A keyed-list item or index: `p` → `p()`.
    Accessor,
    /// A destructured keyed-list item: `name` → `_item().name`.
    AccessorMember { key: String },
}

#[derive(Debug, Default)]
pub struct ListPlan {
    /// The `key={…}` attribute on the row root; it moves to the list's `by` function.
    pub key_attr: Option<SpanKey>,
    /// Source span of the item parameter pattern, reused as the `by` function's parameter.
    pub item_param: Option<SpanKey>,
    /// Item and index symbols: rewritten to accessor calls in the row, kept raw in the `by` function.
    pub item_syms: Vec<SymbolId>,
}

#[derive(Default)]
pub struct Plan {
    pub rewrites: HashMap<SymbolId, Rewrite>,
    /// Component function span → name of the props parameter that replaces the destructuring pattern.
    pub components: HashMap<SpanKey, String>,
    /// `.map(…)` call span → keyed list.
    pub lists: HashMap<SpanKey, ListPlan>,
    /// Row callbacks whose destructured item parameter becomes `_item`.
    pub destructured_rows: HashSet<SpanKey>,
    pub needs_omit: bool,
    pub diagnostics: Vec<Diagnostic>,
}

pub fn analyze(program: &Program<'_>, scoping: &Scoping, source: &str) -> Plan {
    let mut boxes = Boxes { scoping, set: HashSet::new() };
    boxes.visit_program(program);
    let mut a = Analyzer {
        scoping,
        source,
        plan: Plan::default(),
        boxes: boxes.set,
        comps: Vec::new(),
        jsx_depth: 0,
        pending_name: None,
        assign_target: false,
        ref_spans: HashMap::new(),
        w006: Vec::new(),
        spread_ctx: Vec::new(),
        spreads: Vec::new(),
        list_sources: Vec::new(),
    };
    a.visit_program(program);
    a.finish()
}

fn symbol_of(scoping: &Scoping, id: &IdentifierReference<'_>) -> Option<SymbolId> {
    id.reference_id.get().and_then(|r| scoping.get_reference(r).symbol_id())
}

fn binding_symbol(id: &BindingIdentifier<'_>) -> Option<SymbolId> {
    id.symbol_id.get()
}

fn is_component_name(name: &str) -> bool {
    name.starts_with(|c: char| c.is_ascii_uppercase())
}

fn callee_name<'b>(call: &'b CallExpression<'_>) -> Option<&'b str> {
    match &call.callee {
        Expression::Identifier(id) => Some(id.name.as_str()),
        _ => None,
    }
}

/// `x.map(cb)` → the callback, when it is an inline function.
fn map_callback<'b, 'a>(call: &'b CallExpression<'a>) -> Option<&'b Expression<'a>> {
    let Expression::StaticMemberExpression(m) = &call.callee else { return None };
    if m.property.name != "map" || call.arguments.is_empty() {
        return None;
    }
    let cb = call.arguments[0].as_expression()?.without_parentheses();
    matches!(cb, Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_)).then_some(cb)
}

fn params_of<'b, 'a>(cb: &'b Expression<'a>) -> &'b FormalParameters<'a> {
    match cb {
        Expression::ArrowFunctionExpression(f) => &f.params,
        Expression::FunctionExpression(f) => &f.params,
        _ => unreachable!(),
    }
}

/// What the callback returns: the final returned expression, and whether an earlier `return` exists.
fn returned<'b, 'a>(cb: &'b Expression<'a>) -> (Option<&'b Expression<'a>>, bool) {
    let statements = match cb {
        Expression::ArrowFunctionExpression(f) => match &f.body {
            ArrowFunctionBody::FunctionBody(body) => &body.statements,
            body => return (body.as_expression(), false),
        },
        Expression::FunctionExpression(f) => match &f.body {
            Some(body) => &body.statements,
            None => return (None, false),
        },
        _ => return (None, false),
    };
    let last = match statements.last() {
        Some(Statement::ReturnStatement(r)) => r.argument.as_ref(),
        _ => None,
    };
    let mut early = EarlyReturn { found: false };
    for s in statements.iter().take(statements.len().saturating_sub(1)) {
        early.visit_statement(s);
    }
    (last, early.found)
}

fn returns_jsx(e: &Expression<'_>) -> bool {
    match e.without_parentheses() {
        Expression::JSXElement(_) | Expression::JSXFragment(_) => true,
        Expression::ConditionalExpression(c) => returns_jsx(&c.consequent) || returns_jsx(&c.alternate),
        Expression::LogicalExpression(l) => returns_jsx(&l.right),
        _ => false,
    }
}

fn root_element<'b, 'a>(e: &'b Expression<'a>) -> Option<&'b JSXElement<'a>> {
    match e.without_parentheses() {
        Expression::JSXElement(el) => Some(el),
        _ => None,
    }
}

pub fn is_key_attr(item: &JSXAttributeItem<'_>) -> bool {
    matches!(item, JSXAttributeItem::Attribute(a)
        if matches!(&a.name, JSXAttributeName::Identifier(n) if n.name == "key"))
}

/// Root identifier of a member/call chain: `shown.value.filter(…)` → `shown`.
fn chain_root<'b, 'a>(mut e: &'b Expression<'a>) -> Option<&'b IdentifierReference<'a>> {
    loop {
        e = match e.without_parentheses() {
            Expression::Identifier(id) => return Some(id),
            Expression::StaticMemberExpression(m) => &m.object,
            Expression::ComputedMemberExpression(m) => &m.object,
            Expression::CallExpression(c) => &c.callee,
            Expression::ChainExpression(c) => match &c.expression {
                ChainElement::CallExpression(c) => &c.callee,
                ChainElement::StaticMemberExpression(m) => &m.object,
                ChainElement::ComputedMemberExpression(m) => &m.object,
                _ => return None,
            },
            _ => return None,
        }
    }
}

fn static_key(k: &PropertyKey<'_>) -> Option<String> {
    k.static_name().map(|s| s.to_string())
}

struct CompCtx {
    prop_syms: HashSet<SymbolId>,
    fn_depth: u32,
    jsx_depth: u32,
    /// Inside the argument of a body-level `state(…)` call.
    state_arg: Option<Span>,
    /// The body-level `const x = …` being visited, for W001's suggested fix.
    body_decl: Option<Span>,
    reported_decls: HashSet<SpanKey>,
}

struct Analyzer<'s> {
    scoping: &'s Scoping,
    source: &'s str,
    plan: Plan,
    boxes: HashSet<SymbolId>,
    comps: Vec<CompCtx>,
    jsx_depth: u32,
    pending_name: Option<String>,
    assign_target: bool,
    ref_spans: HashMap<SymbolId, Vec<Span>>,
    /// W006: diagnostic index → (inner symbol, replacement text) to build the autofix after the walk.
    w006: Vec<(usize, Vec<(SymbolId, String)>)>,
    /// Box symbol whose value the code being visited computes (`derived` initializer or `x.value = …`).
    spread_ctx: Vec<Option<SymbolId>>,
    spreads: Vec<(Span, Option<SymbolId>)>,
    list_sources: Vec<(SymbolId, Span)>,
}

impl<'s> Analyzer<'s> {
    fn text(&self, span: Span) -> &'s str {
        &self.source[span.start as usize..span.end as usize]
    }

    fn body_level(&self) -> Option<&CompCtx> {
        self.comps.last().filter(|c| c.fn_depth == 0 && c.jsx_depth == 0)
    }

    fn nested(&mut self, f: impl FnOnce(&mut Self)) {
        if let Some(c) = self.comps.last_mut() {
            c.fn_depth += 1;
        }
        f(self);
        if let Some(c) = self.comps.last_mut() {
            c.fn_depth -= 1;
        }
    }

    fn enter_component(&mut self, span: Span, params: &FormalParameters<'_>, f: impl FnOnce(&mut Self)) {
        let mut ctx = CompCtx {
            prop_syms: HashSet::new(),
            fn_depth: 0,
            jsx_depth: 0,
            state_arg: None,
            body_decl: None,
            reported_decls: HashSet::new(),
        };
        let text = self.text(span);
        let props_name = if text.contains("props") { "$props" } else { "props" }.to_string();
        if let Some(first) = params.items.first() {
            match &first.pattern {
                BindingPattern::BindingIdentifier(id) => ctx.prop_syms.extend(binding_symbol(id)),
                BindingPattern::ObjectPattern(obj) => {
                    self.plan.components.insert(key(span), props_name.clone());
                    self.destructure_props(obj, &props_name, &[], &mut ctx);
                }
                _ => {}
            }
        }
        self.comps.push(ctx);
        f(self);
        self.comps.pop();
    }

    fn destructure_props(&mut self, obj: &ObjectPattern<'_>, props: &str, path: &[String], ctx: &mut CompCtx) {
        let mut seen = Vec::new();
        for prop in &obj.properties {
            let Some(k) = static_key(&prop.key) else { continue };
            seen.push(k.clone());
            let mut sub = path.to_vec();
            sub.push(k.clone());
            match &prop.value {
                BindingPattern::BindingIdentifier(id) => {
                    if let Some(sym) = binding_symbol(id) {
                        self.plan.rewrites.insert(sym, Rewrite::Prop { props: props.into(), path: sub, default: None });
                        ctx.prop_syms.insert(sym);
                    }
                }
                BindingPattern::AssignmentPattern(ap) => {
                    if let BindingPattern::BindingIdentifier(id) = &ap.left
                        && let Some(sym) = binding_symbol(id)
                    {
                        let default = Some(key(ap.right.span()));
                        self.plan.rewrites.insert(sym, Rewrite::Prop { props: props.into(), path: sub, default });
                        ctx.prop_syms.insert(sym);
                    }
                }
                BindingPattern::ObjectPattern(inner) => {
                    if path.is_empty() {
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
                            (prop.span.start, prop.span.end),
                            format!("Nested destructuring of the `{k}` prop reads it once and stops updating."),
                            format!("Destructure `{k}` and read `{k}.field` where you use it."),
                        )
                        .with_fix(Fix {
                            description: format!("Destructure `{k}` and read its fields at the use site"),
                            safe: true,
                            edits: vec![Edit { start: prop.span.start, end: prop.span.end, text: k.clone() }],
                        });
                        self.w006.push((self.plan.diagnostics.len(), names));
                        self.plan.diagnostics.push(d);
                    }
                    // Lowered live anyway (`props.user.name`), so the output is right while the error stands.
                    self.destructure_props(inner, props, &sub, ctx);
                }
                _ => {}
            }
        }
        if let Some(rest) = &obj.rest
            && let BindingPattern::BindingIdentifier(id) = &rest.argument
            && let Some(sym) = binding_symbol(id)
        {
            self.plan.rewrites.insert(sym, Rewrite::Rest { props: props.into(), exclude: seen });
            self.plan.needs_omit = true;
            ctx.prop_syms.insert(sym);
        }
    }

    fn report_body_read(&mut self, span: Span, what: &str) {
        let Some(ctx) = self.body_level() else { return };
        if let Some(call) = ctx.state_arg {
            let arg = self.text(span);
            let d = Diagnostic::new(
                self.source,
                "W005",
                Severity::Error,
                (span.start, span.end),
                format!("`state({arg})` copies `{what}` once; later changes are ignored."),
                "Use `state.linked(() => …)` to reset when it changes, or `untrack()` if a snapshot is intended.",
            );
            let inner = &self.source[call.start as usize..call.end as usize];
            let arg_text = inner.strip_prefix("state(").and_then(|s| s.strip_suffix(')')).unwrap_or(arg);
            let fix = Fix {
                description: "Make it a linked state that resets when the prop changes".into(),
                safe: false,
                edits: vec![Edit { start: call.start, end: call.end, text: format!("state.linked(() => {arg_text})") }],
            };
            self.plan.diagnostics.push(d.with_fix(fix));
            return;
        }
        let decl = ctx.body_decl;
        if let Some(d) = decl {
            if !self.comps.last_mut().unwrap().reported_decls.insert(key(d)) {
                return;
            }
        }
        let mut d = Diagnostic::new(
            self.source,
            "W001",
            Severity::Error,
            (span.start, span.end),
            format!("`{what}` is read once when the component is set up, so this never updates."),
            "Wrap it in `derived(() => …)`, move it into `watch`, or use `untrack()` if a snapshot is intended.",
        );
        if let Some(init) = decl {
            let text = self.text(init);
            d = d.with_fix(Fix {
                description: "Make it a derived value (then read it with `.value`)".into(),
                safe: false,
                edits: vec![Edit { start: init.start, end: init.end, text: format!("derived(() => {text})") }],
            });
        }
        self.plan.diagnostics.push(d);
    }

    /// W015: `{count}` where `count` is a box renders the box, not its value.
    fn bare_box(&mut self, id: &IdentifierReference<'_>) {
        if !symbol_of(self.scoping, id).is_some_and(|s| self.boxes.contains(&s)) {
            return;
        }
        let name = id.name.as_str();
        let d = Diagnostic::new(
            self.source,
            "W015",
            Severity::Error,
            (id.span.start, id.span.end),
            format!("`{name}` is a box; JSX needs its value."),
            format!("Read `{name}.value`."),
        )
        .with_fix(Fix {
            description: format!("Read `{name}.value`"),
            safe: true,
            edits: vec![Edit { start: id.span.end, end: id.span.end, text: ".value".into() }],
        });
        self.plan.diagnostics.push(d);
    }

    fn analyze_list(&mut self, call: &CallExpression<'_>, cb: &Expression<'_>) {
        let (ret, early) = returned(cb);
        let mut plan = ListPlan::default();
        let params = params_of(cb);
        let mut item_name = None;
        let mut item_sym = None;
        let mut destructured = false;
        if let Some(p0) = params.items.first() {
            plan.item_param = Some(key(p0.pattern.span()));
            match &p0.pattern {
                BindingPattern::BindingIdentifier(id) => {
                    item_name = Some(id.name.to_string());
                    if let Some(sym) = binding_symbol(id) {
                        self.plan.rewrites.insert(sym, Rewrite::Accessor);
                        plan.item_syms.push(sym);
                        item_sym = Some(sym);
                    }
                }
                BindingPattern::ObjectPattern(obj) => {
                    destructured = true;
                    self.plan.destructured_rows.insert(key(cb.span()));
                    for p in &obj.properties {
                        if let (BindingPattern::BindingIdentifier(id), Some(k)) = (&p.value, static_key(&p.key))
                            && let Some(sym) = binding_symbol(id)
                        {
                            self.plan.rewrites.insert(sym, Rewrite::AccessorMember { key: k });
                            plan.item_syms.push(sym);
                        }
                    }
                }
                _ => {}
            }
        }
        if let Some(BindingPattern::BindingIdentifier(id)) = params.items.get(1).map(|p| &p.pattern)
            && let Some(sym) = binding_symbol(id)
        {
            self.plan.rewrites.insert(sym, Rewrite::Accessor);
            plan.item_syms.push(sym);
        }
        let root = ret.and_then(root_element);
        if let Some(el) = root {
            plan.key_attr = el.opening_element.attributes.iter().find(|a| is_key_attr(a)).map(|a| key(a.span()));
        }
        if early {
            self.plan.diagnostics.push(Diagnostic::new(
                self.source,
                "W013",
                Severity::Error,
                (cb.span().start, cb.span().end),
                "Early `return` inside a list callback: rows can't appear or disappear from inside the row.",
                "Filter the list first (`xs.filter(…).map(…)`), then render every item.",
            ));
        }
        if plan.key_attr.is_none() {
            let mut uses = MemberUse { scoping: self.scoping, sym: item_sym, props: Vec::new() };
            uses.visit_expression(cb);
            if destructured || !uses.props.is_empty() {
                let span = call.span;
                let mut d = Diagnostic::new(
                    self.source,
                    "W010",
                    Severity::Error,
                    (span.start, span.end),
                    "List over objects without a `key`: rows can't keep their identity when the list changes.",
                    "Add `key={item.id}` (a stable, unique field) to the row's root element.",
                );
                if let (Some(el), Some(name), true) = (root, &item_name, uses.props.iter().any(|p| p == "id")) {
                    let at = el.opening_element.name.span().end;
                    d = d.with_fix(Fix {
                        description: format!("Key rows by `{name}.id`"),
                        safe: true,
                        edits: vec![Edit { start: at, end: at, text: format!(" key={{{name}.id}}") }],
                    });
                }
                self.plan.diagnostics.push(d);
            }
        }
        if let Expression::StaticMemberExpression(m) = &call.callee
            && let Some(root) = chain_root(&m.object)
            && let Some(sym) = symbol_of(self.scoping, root)
        {
            self.list_sources.push((sym, call.span));
        }
        self.plan.lists.insert(key(call.span), plan);
    }

    fn finish(mut self) -> Plan {
        for (index, names) in std::mem::take(&mut self.w006) {
            let mut edits = Vec::new();
            for (sym, text) in names {
                for span in self.ref_spans.get(&sym).into_iter().flatten() {
                    edits.push(Edit { start: span.start, end: span.end, text: text.clone() });
                }
            }
            if let Some(fix) = self.plan.diagnostics[index].fix.as_mut() {
                fix.edits.extend(edits);
            }
        }
        for (span, ctx) in std::mem::take(&mut self.spreads) {
            let listed = ctx.and_then(|s| self.list_sources.iter().find(|(sym, _)| *sym == s));
            let help = "Keep items stable and read the changing field live in the row (`prices.value[p.id]`), \
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
                (None, Some(_)) => Diagnostic::new(
                    self.source,
                    "W014",
                    Severity::Warning,
                    (span.start, span.end),
                    "`.map(p => ({ ...p, … }))` gives every item a new identity on each update; if this list is \
                     rendered by key, every row re-runs on every change.",
                    help,
                ),
                (None, None) => continue,
            };
            self.plan.diagnostics.push(d);
        }
        self.plan.diagnostics.sort_by_key(|d| d.start);
        self.plan
    }
}

impl<'a, 's> Visit<'a> for Analyzer<'s> {
    fn visit_variable_declarator(&mut self, it: &VariableDeclarator<'a>) {
        let name = match &it.id {
            BindingPattern::BindingIdentifier(id) => Some((id.name.to_string(), binding_symbol(id))),
            _ => None,
        };
        let init = it.init.as_ref().map(|e| e.without_parentheses());
        if let (Some((n, _)), Some(Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_))) =
            (&name, init)
        {
            self.pending_name = Some(n.clone());
        }
        let derives = matches!(init, Some(Expression::CallExpression(c)) if callee_name(c) == Some("derived"));
        let body_level = self.body_level().is_some();
        let prev_decl = self.comps.last().and_then(|c| c.body_decl);
        if body_level && let (Some(c), Some(init)) = (self.comps.last_mut(), &it.init) {
            c.body_decl = Some(init.span());
        }
        if derives {
            self.spread_ctx.push(name.and_then(|(_, s)| s));
        }
        walk::walk_variable_declarator(self, it);
        if derives {
            self.spread_ctx.pop();
        }
        if let Some(c) = self.comps.last_mut() {
            c.body_decl = prev_decl;
        }
        self.pending_name = None;
    }

    fn visit_function(&mut self, it: &Function<'a>, flags: ScopeFlags) {
        let name = it.id.as_ref().map(|i| i.name.to_string()).or_else(|| self.pending_name.take());
        self.pending_name = None;
        if name.as_deref().is_some_and(is_component_name) && it.body.is_some() {
            self.enter_component(it.span, &it.params, |s| walk::walk_function(s, it, flags));
        } else {
            self.nested(|s| walk::walk_function(s, it, flags));
        }
    }

    fn visit_arrow_function_expression(&mut self, it: &ArrowFunctionExpression<'a>) {
        let name = self.pending_name.take();
        if name.as_deref().is_some_and(is_component_name) {
            self.enter_component(it.span, &it.params, |s| walk::walk_arrow_function_expression(s, it));
        } else {
            self.nested(|s| walk::walk_arrow_function_expression(s, it));
        }
    }

    fn visit_jsx_element(&mut self, it: &JSXElement<'a>) {
        self.jsx_depth += 1;
        if let Some(c) = self.comps.last_mut() {
            c.jsx_depth += 1;
        }
        walk::walk_jsx_element(self, it);
        if let Some(c) = self.comps.last_mut() {
            c.jsx_depth -= 1;
        }
        self.jsx_depth -= 1;
    }

    fn visit_jsx_fragment(&mut self, it: &JSXFragment<'a>) {
        self.jsx_depth += 1;
        if let Some(c) = self.comps.last_mut() {
            c.jsx_depth += 1;
        }
        walk::walk_jsx_fragment(self, it);
        if let Some(c) = self.comps.last_mut() {
            c.jsx_depth -= 1;
        }
        self.jsx_depth -= 1;
    }

    fn visit_jsx_child(&mut self, it: &JSXChild<'a>) {
        if let JSXChild::ExpressionContainer(c) = it
            && let Some(Expression::Identifier(id)) = c.expression.as_expression()
        {
            self.bare_box(id);
        }
        walk::walk_jsx_child(self, it);
    }

    fn visit_jsx_opening_element(&mut self, it: &JSXOpeningElement<'a>) {
        // On a native element a box can only mean its value; on a component it may be passed for write access.
        let intrinsic = matches!(&it.name, JSXElementName::Identifier(n) if n.name.starts_with(|c: char| c.is_ascii_lowercase()));
        if intrinsic {
            for attr in &it.attributes {
                if let JSXAttributeItem::Attribute(a) = attr
                    && let Some(JSXAttributeValue::ExpressionContainer(c)) = &a.value
                    && let Some(Expression::Identifier(id)) = c.expression.as_expression()
                {
                    self.bare_box(id);
                }
            }
        }
        walk::walk_jsx_opening_element(self, it);
    }

    fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
        let Some(sym) = symbol_of(self.scoping, it) else { return };
        self.ref_spans.entry(sym).or_default().push(it.span);
        if self.body_level().is_some_and(|c| c.prop_syms.contains(&sym)) {
            self.report_body_read(it.span, it.name.as_str());
        }
    }

    fn visit_static_member_expression(&mut self, it: &StaticMemberExpression<'a>) {
        if it.property.name == "value"
            && !self.assign_target
            && let Expression::Identifier(id) = &it.object
            && symbol_of(self.scoping, id).is_some_and(|s| self.boxes.contains(&s))
        {
            self.report_body_read(it.span, self.text(it.span));
        }
        walk::walk_static_member_expression(self, it);
    }

    fn visit_assignment_expression(&mut self, it: &AssignmentExpression<'a>) {
        let prev = self.assign_target;
        self.assign_target = true;
        self.visit_assignment_target(&it.left);
        self.assign_target = prev;
        let ctx = match &it.left {
            AssignmentTarget::StaticMemberExpression(m) if m.property.name == "value" => match &m.object {
                Expression::Identifier(id) => symbol_of(self.scoping, id),
                _ => None,
            },
            _ => None,
        };
        self.spread_ctx.push(ctx);
        self.visit_expression(&it.right);
        self.spread_ctx.pop();
    }

    fn visit_call_expression(&mut self, it: &CallExpression<'a>) {
        if let Some(cb) = map_callback(it) {
            if self.jsx_depth > 0 && returned(cb).0.is_some_and(returns_jsx) {
                self.analyze_list(it, cb);
            }
            if let Some((param, obj)) = spread_of_param(cb)
                && obj.properties.iter().any(|p| {
                    matches!(p, ObjectPropertyKind::SpreadProperty(s)
                        if matches!(&s.argument, Expression::Identifier(id) if id.name == param))
                })
            {
                self.spreads.push((it.span, self.spread_ctx.last().copied().flatten()));
            }
        }
        let state_call = callee_name(it) == Some("state") && self.body_level().is_some();
        if state_call && let Some(c) = self.comps.last_mut() {
            c.state_arg = Some(it.span);
        }
        walk::walk_call_expression(self, it);
        if state_call && let Some(c) = self.comps.last_mut() {
            c.state_arg = None;
        }
    }
}

/// `p => ({ ...p, … })`: the item parameter's name and the object it spreads into.
fn spread_of_param<'b, 'a>(cb: &'b Expression<'a>) -> Option<(&'b str, &'b ObjectExpression<'a>)> {
    let Expression::ArrowFunctionExpression(f) = cb else { return None };
    let Some(BindingPattern::BindingIdentifier(param)) = f.params.items.first().map(|p| &p.pattern) else {
        return None;
    };
    let body = f.body.as_expression()?.without_parentheses();
    match body {
        Expression::ObjectExpression(obj) => Some((param.name.as_str(), obj)),
        _ => None,
    }
}

/// Symbols initialized with a reactive box: `state(…)`, `state.linked(…)`, `derived(…)`, `resource(…)`.
struct Boxes<'s> {
    scoping: &'s Scoping,
    set: HashSet<SymbolId>,
}

impl<'a, 's> Visit<'a> for Boxes<'s> {
    fn visit_variable_declarator(&mut self, it: &VariableDeclarator<'a>) {
        if let (BindingPattern::BindingIdentifier(id), Some(Expression::CallExpression(call))) =
            (&it.id, it.init.as_ref().map(|e| e.without_parentheses()))
        {
            let boxed = match &call.callee {
                Expression::Identifier(c) => matches!(c.name.as_str(), "state" | "derived" | "resource"),
                Expression::StaticMemberExpression(m) => {
                    matches!(&m.object, Expression::Identifier(o) if o.name == "state") && m.property.name == "linked"
                }
                _ => false,
            };
            if boxed && let Some(sym) = binding_symbol(id) {
                self.set.insert(sym);
            }
        }
        let _ = self.scoping;
        walk::walk_variable_declarator(self, it);
    }
}

/// Member names read off the list item (`p.id`, `p.name`), to tell object lists from primitive ones.
struct MemberUse<'s> {
    scoping: &'s Scoping,
    sym: Option<SymbolId>,
    props: Vec<String>,
}

impl<'a, 's> Visit<'a> for MemberUse<'s> {
    fn visit_static_member_expression(&mut self, it: &StaticMemberExpression<'a>) {
        if let Expression::Identifier(id) = &it.object
            && self.sym.is_some()
            && symbol_of(self.scoping, id) == self.sym
        {
            self.props.push(it.property.name.to_string());
        }
        walk::walk_static_member_expression(self, it);
    }
}

/// A `return` before the last statement (nested functions don't count).
struct EarlyReturn {
    found: bool,
}

impl<'a> Visit<'a> for EarlyReturn {
    fn visit_return_statement(&mut self, _: &ReturnStatement<'a>) {
        self.found = true;
    }
    fn visit_function(&mut self, _: &Function<'a>, _: ScopeFlags) {}
    fn visit_arrow_function_expression(&mut self, _: &ArrowFunctionExpression<'a>) {}
}
