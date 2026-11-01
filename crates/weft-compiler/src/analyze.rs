//! Read-only pass: find components, their props and boxes, JSX lists, and the diagnostics (W001, W005, W006,
//! W010, W013, W014, W015, W016, W017, W018, W019; the weft/browser ones are in `browser`). Produces a `Plan` that `transform` applies to the same AST, and the per-file
//! facts `weft check`'s project view joins across files (`project`).

use std::collections::{HashMap, HashSet};

use oxc_ast::ast::*;
use oxc_ast_visit::{Visit, walk};
use oxc_semantic::{Scoping, SymbolId};
use oxc_span::{GetSpan, Span};
use oxc_syntax::scope::ScopeFlags;

use crate::diag::{Diagnostic, Edit, Fix, Severity, line_col};
use crate::project::{Facts, KeyedProp, SpreadProp};

pub type SpanKey = (u32, u32);

pub fn key(span: Span) -> SpanKey {
    (span.start, span.end)
}

#[derive(Clone, Debug)]
pub enum Rewrite {
    /// `a` → `props.a` (with `path` for nested members). A default, if any, is applied on every read; `transform`
    /// takes it from the pattern, so references inside it (`b = a`) are rewritten too.
    Prop { props: String, path: Vec<String> },
    /// Destructured `children` → `_children()`, the component's memoised children (§3.3).
    Children { local: String, component: SpanKey },
    /// `rest` → `<local>`, one live view of the other props (`const <local> = omit(props, [...])`, declared at the top
    /// of the component when something holds it); `rest.x` → `props.x`; `<el {...rest}>` → a copy, `restOf(props, [...])`.
    Rest { props: String, exclude: Vec<String>, local: String, component: SpanKey },
    /// `const b = a.x` where `a` is itself rewritten and its read isn't a plain path (a default, memoised children):
    /// `b` → `a`'s live read, then `path`.
    Via { of: SymbolId, path: Vec<String> },
    /// A keyed-list item or index: `p` → `p()`.
    Accessor,
    /// A destructured keyed-list item, any depth: `name` → `_item().name`, `v` → `_item()[1]`, `...more` →
    /// `_item().slice(2)`.
    AccessorPath { path: Vec<RowStep> },
}

/// One step from a keyed-list item to a name bound in its destructuring pattern.
#[derive(Clone, Debug)]
pub enum RowStep {
    Key(String),
    Index(u32),
    From(u32),
}

#[derive(Debug, Default)]
pub struct ListPlan {
    /// The `key={…}` attributes on the row's root elements (one for an element, one per branch or top-level child
    /// for a conditional or fragment). The first one's expression moves to the list's `by` function; all are
    /// removed from the row.
    pub key_attrs: Vec<SpanKey>,
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
    /// Component span → memoised children: `const <local> = memo(() => <props>.children)` at the top of its body.
    pub children: HashMap<SpanKey, ChildrenPlan>,
    /// `props.children` reads (span) → the memo's local name and its component.
    pub children_reads: HashMap<SpanKey, (String, SpanKey)>,
    /// Body declarators that only name a prop (`const x = props.y`): gone from the output, their locals rewritten.
    pub aliases: HashSet<SpanKey>,
    /// Component span → the props it writes: a write stays in the component until the parent's value next changes.
    pub local_props: HashMap<SpanKey, (String, Vec<(String, SymbolId)>)>,
    /// `bind(box)` calls that are a component prop's whole value: the back end gives that prop a setter.
    pub bound: HashSet<SpanKey>,
    /// Body declarators already reported as reassigned: their initialisers aren't reported again.
    pub aliases_refused: HashSet<SpanKey>,
    pub diagnostics: Vec<Diagnostic>,
    pub facts: Facts,
}

#[derive(Debug, Clone)]
pub struct ChildrenPlan {
    pub props: String,
    pub local: String,
}

pub fn analyze(program: &Program<'_>, scoping: &Scoping, source: &str) -> Plan {
    let mut boxes = Boxes { scoping, set: HashSet::new(), browser: crate::browser::value_imports(program) };
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
        imports: HashMap::new(),
        box_props: Vec::new(),
        defaulted: HashSet::new(),
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

/// The elements a row can start with: the element itself, each branch of a conditional (`a ? <A/> : <B/>`,
/// `on && <A/>`), and the top-level child elements of a fragment. Their `key` attributes key the row.
pub fn row_roots<'b, 'a>(e: &'b Expression<'a>, out: &mut Vec<&'b JSXElement<'a>>) {
    match e.without_parentheses() {
        Expression::JSXElement(el) => out.push(el),
        Expression::JSXFragment(f) => {
            for child in &f.children {
                match child {
                    JSXChild::Element(el) => out.push(el),
                    JSXChild::ExpressionContainer(c) => {
                        if let Some(e) = c.expression.as_expression() {
                            row_roots(e, out)
                        }
                    }
                    _ => {}
                }
            }
        }
        Expression::ConditionalExpression(c) => {
            row_roots(&c.consequent, out);
            row_roots(&c.alternate, out);
        }
        Expression::LogicalExpression(l) => row_roots(&l.right, out),
        _ => {}
    }
}

pub fn is_key_attr(item: &JSXAttributeItem<'_>) -> bool {
    matches!(item, JSXAttributeItem::Attribute(a)
        if matches!(&a.name, JSXAttributeName::Identifier(n) if n.name == "key"))
}

/// `props.items.filter(…)` → (`props`, `items`): the root identifier and the member read right off it.
fn chain_root_member<'b, 'a>(mut e: &'b Expression<'a>) -> Option<(&'b IdentifierReference<'a>, Option<&'b str>)> {
    let mut member = None;
    loop {
        e = match e.without_parentheses() {
            Expression::Identifier(id) => return Some((id, member)),
            Expression::StaticMemberExpression(m) => {
                member = Some(m.property.name.as_str());
                &m.object
            }
            Expression::ComputedMemberExpression(m) => {
                member = None;
                &m.object
            }
            Expression::CallExpression(c) => &c.callee,
            Expression::ChainExpression(c) => match &c.expression {
                ChainElement::CallExpression(c) => &c.callee,
                ChainElement::StaticMemberExpression(m) => {
                    member = Some(m.property.name.as_str());
                    &m.object
                }
                ChainElement::ComputedMemberExpression(m) => &m.object,
                _ => return None,
            },
            _ => return None,
        }
    }
}

fn jsx_name(name: &JSXElementName<'_>) -> String {
    match name {
        JSXElementName::Identifier(n) => n.name.to_string(),
        JSXElementName::IdentifierReference(n) => n.name.to_string(),
        JSXElementName::MemberExpression(m) => format!("{}", m.property.name),
        JSXElementName::NamespacedName(n) => format!("{}:{}", n.namespace.name, n.name.name),
        JSXElementName::ThisExpression(_) => "this".into(),
    }
}

fn static_key(k: &PropertyKey<'_>) -> Option<String> {
    k.static_name().map(|s| s.to_string())
}

struct CompCtx {
    name: Option<String>,
    span: Span,
    /// The `props` parameter of the `(props) =>` form.
    props_param: Option<SymbolId>,
    prop_syms: HashSet<SymbolId>,
    fn_depth: u32,
    jsx_depth: u32,
    /// Inside the argument of a body-level `state(…)` call.
    state_arg: Option<Span>,
    /// The body-level `const x = …` being visited, for W001's suggested fix.
    body_decl: Option<Span>,
    reported_decls: HashSet<SpanKey>,
    /// W017 in the component's own reactive positions (JSX holes and attributes, `derived`), by read span.
    entries: Vec<EntryHit>,
    /// W018: body-level `const x = untrack(() => …)` snapshots of reactive values.
    snapshots: Vec<Snapshot>,
}

/// `box.value[k]` read in a component's reactive position, `k` reading one of its props.
struct EntryHit {
    read: Span,
    /// `box.value`
    whole: Span,
    /// `box` (an identifier, or `props.box`)
    boxed: Span,
    /// A box declared in this file (the `.get` autofix is safe), not one that arrived as a prop.
    local: bool,
    index: Span,
}

/// `const name = untrack(() => …)` in a component body, and where `name` is read afterwards.
struct Snapshot {
    sym: SymbolId,
    name: String,
    /// The `untrack` callee, for the suggested fix.
    callee: Span,
    call: Span,
    /// Reads in the component's JSX (outside handlers).
    jsx: Vec<Span>,
    /// Read anywhere else (a handler, `watch`, another declaration): then it may be a deliberate snapshot.
    other: bool,
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
    /// Local import binding → (module specifier, imported name).
    imports: HashMap<SymbolId, (String, String)>,
    /// Box symbol passed as a component prop: (box, component name, import, prop name).
    box_props: Vec<(SymbolId, String, Option<String>, String)>,
    /// Destructured props with a default: their read isn't a plain path.
    defaulted: HashSet<SymbolId>,
}

impl<'s> Analyzer<'s> {
    fn text(&self, span: Span) -> &'s str {
        &self.source[span.start as usize..span.end as usize]
    }

    fn is_rest(&self, sym: SymbolId) -> bool {
        matches!(self.plan.rewrites.get(&sym), Some(Rewrite::Rest { .. }))
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

    fn enter_component(&mut self, name: String, span: Span, params: &FormalParameters<'_>, f: impl FnOnce(&mut Self)) {
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
        let props_name = if text.contains("props") { "$props" } else { "props" }.to_string();
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
        let ctx = self.comps.pop().unwrap();
        self.component_entry_diagnostics(&ctx);
        self.snapshot_diagnostics(&ctx);
    }

    /// W017 outside a list: a component's JSX or `derived` reads `box.value[k]` where `k` comes from its props
    /// (`live.value[stock.id]` in a row component). Each instance depends on the whole box, so one write re-runs
    /// every instance. One diagnostic per box per component; the autofix rewrites every such read to `box.get(k)`.
    fn scan_component_entries(&mut self, e: &Expression<'_>, depth: i32) {
        let Some(ctx) = self.comps.last() else { return };
        let mut scan = ComponentEntryReads { a: self, ctx, depth, found: Vec::new() };
        scan.visit_expression(e);
        let found = scan.found;
        let ctx = self.comps.last_mut().unwrap();
        for hit in found {
            if !ctx.entries.iter().any(|h| h.read == hit.read) {
                ctx.entries.push(hit);
            }
        }
    }

    fn component_entry_diagnostics(&mut self, ctx: &CompCtx) {
        let comp = ctx.name.clone().unwrap_or_else(|| "this component".into());
        let mut seen: Vec<&str> = Vec::new();
        for hit in &ctx.entries {
            let whole = self.text(hit.whole);
            if seen.contains(&whole) {
                continue;
            }
            seen.push(whole);
            let (read, name, index) = (self.text(hit.read), self.text(hit.boxed), self.text(hit.index));
            let help = if hit.local {
                format!("Read `{name}.get({index})`: it re-runs only when this entry changes (`Object.is`).")
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
                .map(|h| Edit { start: h.read.start, end: h.read.end, text: format!("{}.get({})", self.text(h.boxed), self.text(h.index)) })
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
            .with_fix(Fix { description: format!("Read the entry with `{name}.get(…)`"), safe: hit.local, edits });
            self.plan.diagnostics.push(d);
        }
    }

    /// W018: `const quote = untrack(() => live.get(id))` in a component body, read only by its JSX: the page shows
    /// the setup-time value and never updates. Reads anywhere else (a handler, a `watch`) suggest a deliberate
    /// snapshot and keep it quiet.
    fn snapshot_diagnostics(&mut self, ctx: &CompCtx) {
        for s in ctx.snapshots.iter().filter(|s| !s.jsx.is_empty() && !s.other) {
            let name = &s.name;
            let call = self.text(s.call);
            let mut edits = vec![Edit { start: s.callee.start, end: s.callee.end, text: "derived".into() }];
            edits.extend(s.jsx.iter().map(|r| Edit { start: r.end, end: r.end, text: ".value".into() }));
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
            .with_fix(Fix { description: format!("Make `{name}` derived (then read it with `.value`)"), safe: false, edits });
            self.plan.diagnostics.push(d);
        }
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
                        self.written_prop(sym, &k, path, props, ctx.span, prop.span);
                        let rewrite = if path.is_empty() && k == "children" {
                            Rewrite::Children { local: self.children_local(ctx, props), component: key(ctx.span) }
                        } else {
                            Rewrite::Prop { props: props.into(), path: sub }
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
                        self.plan.rewrites.insert(sym, Rewrite::Prop { props: props.into(), path: sub });
                        ctx.prop_syms.insert(sym);
                        self.defaulted.insert(sym);
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
            let text = &self.source[ctx.span.start as usize..ctx.span.end as usize];
            let local = if text.contains("_rest") { "_rest$" } else { "_rest" };
            let rewrite = Rewrite::Rest { props: props.into(), exclude: seen, local: local.into(), component: key(ctx.span) };
            self.plan.rewrites.insert(sym, rewrite);
            ctx.prop_syms.insert(sym);
        }
    }

    /// Where `e` reads from, if it's a plain path off the component's props: the props object's name and the path.
    /// `None` for anything else, a default or memo in the way included.
    fn prop_path(&self, e: &Expression<'_>) -> Option<(SymbolId, Vec<String>)> {
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
        self.comps.last()?.prop_syms.contains(&sym).then_some((sym, path))
    }

    /// The props parameter can be named at a use only if no inner scope binds that name too.
    fn props_nameable(&self, sym: SymbolId, span: Span) -> bool {
        let name = self.scoping.symbol_name(sym);
        !self.written(sym)
            && !self.scoping.symbol_ids().any(|s| {
                s != sym && self.scoping.symbol_name(s) == name && {
                    let at = self.scoping.symbol_span(s);
                    at.start >= span.start && at.end <= span.end
                }
            })
    }

    fn written(&self, sym: SymbolId) -> bool {
        self.scoping.get_resolved_references(sym).any(|r| r.is_write())
    }

    /// `const x = props.y`: `x` is another name for the prop, so each use reads it live.
    fn alias(&mut self, init: &Expression<'_>) -> Option<Rewrite> {
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
                (!exclude.contains(first)).then(|| Rewrite::Prop { props: props.clone(), path })
            }
            Rewrite::Prop { props, path: base } if !self.defaulted.contains(&root) => {
                Some(Rewrite::Prop { props: props.clone(), path: base.iter().cloned().chain(path).collect() })
            }
            Rewrite::Prop { .. } | Rewrite::Children { .. } | Rewrite::Via { .. } => Some(Rewrite::Via { of: root, path }),
            _ => None,
        }
    }

    /// `const { a, b = 1, ...rest } = props`: the same live reads as the parameter's pattern. The pattern must be one
    /// that can be: known keys, no array patterns, at most one rest in a component and none below the top.
    fn alias_pattern(&mut self, obj: &ObjectPattern<'_>, init: &Expression<'_>) -> bool {
        let Some((root, path)) = self.prop_path(init) else { return false };
        fn plain(obj: &ObjectPattern<'_>) -> bool {
            obj.properties.iter().all(|p| {
                static_key(&p.key).is_some()
                    && match &p.value {
                        BindingPattern::BindingIdentifier(_) => true,
                        BindingPattern::AssignmentPattern(a) => matches!(a.left, BindingPattern::BindingIdentifier(_)),
                        BindingPattern::ObjectPattern(inner) => inner.rest.is_none() && plain(inner),
                        _ => false,
                    }
            }) && obj.rest.as_ref().is_none_or(|r| matches!(r.argument, BindingPattern::BindingIdentifier(_)))
        }
        let Some(ctx) = self.comps.last() else { return false };
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
                Some(Rewrite::Prop { props, path }) if !self.defaulted.contains(&root) => (props.clone(), path.clone()),
                _ => return false,
            }
        };
        let base: Vec<String> = base.into_iter().chain(path).collect();
        if obj.rest.is_some() {
            let taken = self.plan.rewrites.values().any(|r| matches!(r, Rewrite::Rest { component, .. } if *component == span));
            if taken || !base.is_empty() {
                return false;
            }
        }
        let mut ctx = self.comps.pop().unwrap();
        self.destructure_props(obj, &props, &base, &mut ctx);
        self.comps.push(ctx);
        true
    }

    /// A destructured prop that's assigned to: plans its local override.
    fn written_prop(&mut self, sym: SymbolId, k: &str, path: &[String], props: &str, component: Span, span: Span) {
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

    fn local_prop(&mut self, component: Span, props: &str, k: &str, sym: SymbolId) {
        let entry = self.plan.local_props.entry(key(component)).or_insert_with(|| (props.to_string(), Vec::new()));
        if !entry.1.iter().any(|(name, _)| name == k) {
            entry.1.push((k.to_string(), sym));
        }
    }

    /// W001 for a local that names no single prop but is written: nothing says where the write should go.
    fn reassigned(&mut self, span: Span, name: &str, read: &str) {
        self.plan.diagnostics.push(Diagnostic::new(
            self.source,
            "W001",
            Severity::Error,
            (span.start, span.end),
            format!("`{name}` is reassigned, but it reads `{read}`, which isn't one prop to override."),
            format!("For an editable copy: `const {name} = state.linked(() => {read})`, then read and write `{name}.value`."),
        ));
    }

    /// `const a = props.a; a = 2`: a `const` is read-only, alias or not. Says where a write can go.
    fn const_written(&mut self, it: &VariableDeclarator<'_>) -> bool {
        let Some(init) = it.init.as_ref().filter(|i| self.prop_path(i).is_some()) else { return false };
        let names = it.id.get_binding_identifiers();
        let Some(id) = names.iter().find(|b| binding_symbol(b).is_some_and(|s| self.written(s))) else { return false };
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
    fn props_write(&mut self, target: &SimpleAssignmentTarget<'_>) {
        let SimpleAssignmentTarget::StaticMemberExpression(m) = target else { return };
        let Expression::Identifier(id) = m.object.get_inner_expression() else { return };
        let Some(sym) = symbol_of(self.scoping, id) else { return };
        let Some(span) = self.comps.iter().rev().find(|c| c.props_param == Some(sym)).map(|c| c.span) else { return };
        self.local_prop(span, id.name.as_str(), m.property.name.as_str(), sym);
    }

    /// A body-level declarator that only names a prop becomes an alias: see `alias` and `alias_pattern`.
    fn try_alias(&mut self, it: &VariableDeclarator<'_>) {
        let Some(init) = &it.init else { return };
        if self.prop_path(init).is_none() {
            return;
        }
        let aliased = match &it.id {
            BindingPattern::BindingIdentifier(id) => {
                let Some(sym) = binding_symbol(id) else { return };
                match self.alias(init) {
                    Some(rewrite) => {
                        if self.written(sym) {
                            let span = self.comps.last().unwrap().span;
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
                        self.comps.last_mut().unwrap().prop_syms.insert(sym);
                        true
                    }
                    None => false,
                }
            }
            BindingPattern::ObjectPattern(obj) => {
                self.alias_pattern(obj, init)
            }
            _ => false,
        };
        if aliased {
            self.plan.aliases.insert(key(it.span));
        }
    }

    /// The memo local for a component's children, planned on first use.
    fn children_local(&mut self, ctx: &CompCtx, props: &str) -> String {
        let plan = self.plan.children.entry(key(ctx.span)).or_insert_with(|| {
            let text = &self.source[ctx.span.start as usize..ctx.span.end as usize];
            let local = if text.contains("_children") { "_children$" } else { "_children" };
            ChildrenPlan { props: props.into(), local: local.into() }
        });
        plan.local.clone()
    }

    fn report_body_read(&mut self, span: Span, what: &str) {
        let Some(ctx) = self.body_level() else { return };
        if let Some(call) = ctx.state_arg {
            let arg = self.text(span);
            let inner = &self.source[call.start as usize..call.end as usize];
            let arg_text = inner.strip_prefix("state(").and_then(|s| s.strip_suffix(')')).unwrap_or(arg);
            let d = Diagnostic::new(
                self.source,
                "W005",
                Severity::Error,
                (span.start, span.end),
                format!("`state({arg_text})` copies `{arg_text}` once; later changes are ignored."),
                "Use `state.linked(() => …)` to reset when it changes, or `untrack()` if a snapshot is intended.",
            );
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
            "`const x = props.y` stays live on its own, but this does more than name a prop: wrap it in `derived(() => …)`, move it into `watch`, or use `untrack()` if a snapshot is intended.",
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

    /// `<Card person={bind(name)} />`: the one way a child's write reaches the parent.
    fn bound_prop(&mut self, attr: &JSXAttribute<'_>) {
        let Some(JSXAttributeValue::ExpressionContainer(c)) = &attr.value else { return };
        let Some(Expression::CallExpression(call)) = c.expression.as_expression().map(|e| e.get_inner_expression()) else { return };
        if self.is_bind(call)
            && let [arg] = call.arguments.as_slice()
            && arg.as_expression().is_some_and(|e| chain_root_member(e).is_some() || matches!(e.get_inner_expression(), Expression::Identifier(_)))
        {
            self.plan.bound.insert(key(call.span));
        }
    }

    /// `bind:count={box}`: only on a component, and only with something that can be a box.
    fn bound_attribute(&mut self, attr: &JSXAttributeItem<'_>, intrinsic: bool) {
        let JSXAttributeItem::Attribute(a) = attr else { return };
        let JSXAttributeName::NamespacedName(ns) = &a.name else { return };
        if ns.namespace.name != "bind" {
            return;
        }
        let value = match &a.value {
            Some(JSXAttributeValue::ExpressionContainer(c)) => c.expression.as_expression(),
            _ => None,
        };
        let path = value.is_some_and(|e| chain_root_member(e).is_some() || matches!(e.get_inner_expression(), Expression::Identifier(_)));
        if intrinsic || !path {
            self.plan.diagnostics.push(Diagnostic::new(
                self.source,
                "W061",
                Severity::Error,
                (a.span.start, a.span.end),
                "`bind:` takes a box, on a component.",
                "Write `<Card bind:person={name} />`, with `name` a box. A form element takes `value` and `onChange`.",
            ));
        }
    }

    fn is_bind(&self, call: &CallExpression<'_>) -> bool {
        let Expression::Identifier(id) = &call.callee else { return false };
        symbol_of(self.scoping, id).and_then(|s| self.imports.get(&s)).is_some_and(|(from, name)| from == "weft" && name == "bind")
    }

    /// W016: `<App api={createFakeApi()} />`. A component prop compiles to a getter, so a call in it runs again on
    /// every read and each read gets a new value. Calls that read props, list items or boxes are meant to stay
    /// live and are left alone; the compiler can't see inside the callee, so it reports instead of hoisting.
    fn call_prop(&mut self, attr: &JSXAttribute<'_>, component: &str) {
        let Some(JSXAttributeValue::ExpressionContainer(c)) = &attr.value else { return };
        let Some(value) = c.expression.as_expression() else { return };
        // Only calls: the back end treats `new X()` as static and passes its value once.
        let Expression::CallExpression(call) = value.without_parentheses() else { return };
        let (callee, span) = (&call.callee, call.span);
        let mut reactive = Reactive { a: self, found: false };
        reactive.visit_expression(value);
        if reactive.found {
            return;
        }
        let JSXAttributeName::Identifier(name) = &attr.name else { return };
        let (name, call, callee) = (name.name.as_str(), self.text(span), self.text(callee.span()));
        self.plan.diagnostics.push(Diagnostic::new(
            self.source,
            "W016",
            Severity::Warning,
            (span.start, span.end),
            format!(
                "`<{component} {name}={{{call}}}>`: props are live getters, so `{callee}` runs again on every read of \
                 `{name}` and each read gets a new value."
            ),
            format!(
                "Create it once outside the JSX (`const {name} = {call}`) and pass `{name}={{{name}}}`. If `{callee}` \
                 reads state and should re-run, keep it."
            ),
        ));
    }

    /// Every name `pattern` binds in a keyed-list row, as a live path from `_item()`. W019 for what a path can't say.
    fn bind_row(&mut self, pattern: &BindingPattern<'_>, path: &mut Vec<RowStep>, plan: &mut ListPlan) {
        match pattern {
            BindingPattern::BindingIdentifier(id) => {
                if let Some(sym) = binding_symbol(id) {
                    self.plan.rewrites.insert(sym, Rewrite::AccessorPath { path: path.clone() });
                    plan.item_syms.push(sym);
                }
            }
            BindingPattern::ObjectPattern(obj) => {
                for p in &obj.properties {
                    let Some(k) = static_key(&p.key) else {
                        self.row_pattern_error(p.span);
                        continue;
                    };
                    path.push(RowStep::Key(k));
                    self.bind_row(&p.value, path, plan);
                    path.pop();
                }
                if let Some(rest) = &obj.rest {
                    self.row_pattern_error(rest.span);
                }
            }
            BindingPattern::ArrayPattern(arr) => {
                for (index, el) in arr.elements.iter().enumerate() {
                    if let Some(el) = el {
                        path.push(RowStep::Index(index as u32));
                        self.bind_row(el, path, plan);
                        path.pop();
                    }
                }
                if let Some(rest) = &arr.rest {
                    path.push(RowStep::From(arr.elements.len() as u32));
                    self.bind_row(&rest.argument, path, plan);
                    path.pop();
                }
            }
            BindingPattern::AssignmentPattern(p) => self.row_pattern_error(p.span),
        }
    }

    fn row_pattern_error(&mut self, span: Span) {
        self.plan.diagnostics.push(Diagnostic::new(
            self.source,
            "W019",
            Severity::Error,
            (span.start, span.end),
            "A keyed-list row can't destructure a default, an object rest or a computed key: the name would have no value.".to_string(),
            "Take the item as one parameter and read from it: `row => <li>{row.a ?? 1}</li>`.".to_string(),
        ));
    }

    fn analyze_list(&mut self, call: &CallExpression<'_>, cb: &Expression<'_>) {
        let (ret, early) = returned(cb);
        let mut plan = ListPlan::default();
        let params = params_of(cb);
        let mut item_name = None;
        let mut item_sym = None;
        let mut destructured = false;
        if let Some(p0) = params.items.first() {
            match &p0.pattern {
                BindingPattern::BindingIdentifier(id) => {
                    item_name = Some(id.name.to_string());
                    if let Some(sym) = binding_symbol(id) {
                        self.plan.rewrites.insert(sym, Rewrite::Accessor);
                        plan.item_syms.push(sym);
                        item_sym = Some(sym);
                    }
                }
                pattern @ (BindingPattern::ObjectPattern(_) | BindingPattern::ArrayPattern(_)) => {
                    destructured = true;
                    self.plan.destructured_rows.insert(key(cb.span()));
                    self.bind_row(pattern, &mut Vec::new(), &mut plan);
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
        let mut roots = Vec::new();
        if let Some(ret) = ret {
            row_roots(ret, &mut roots);
        }
        let mut keys: Vec<(Span, &str)> = Vec::new();
        for el in &roots {
            for a in el.opening_element.attributes.iter().filter(|a| is_key_attr(a)) {
                let JSXAttributeItem::Attribute(attr) = a else { continue };
                keys.push((attr.span, attr.value.as_ref().map_or("", |v| self.text(v.span()))));
            }
        }
        plan.key_attrs = keys.iter().map(|(s, _)| key(*s)).collect();
        if let Some((_, first)) = keys.first()
            && let Some((other, text)) = keys.iter().find(|(_, t)| t != first)
        {
            self.plan.diagnostics.push(Diagnostic::new(
                self.source,
                "W010",
                Severity::Error,
                (other.start, other.end),
                format!("The row's roots are keyed differently (`{first}` and `{text}`): a row has one key."),
                format!("Key every branch by the same field (`key={first}`)."),
            ));
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
        if plan.key_attrs.is_empty() {
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
        self.entry_reads(cb, &plan.item_syms);
        if let Expression::StaticMemberExpression(m) = &call.callee
            && let Some((root, member)) = chain_root_member(&m.object)
            && let Some(sym) = symbol_of(self.scoping, root)
        {
            self.list_sources.push((sym, call.span));
            self.keyed_prop(sym, member, call.span);
        }
        self.plan.lists.insert(key(call.span), plan);
    }

    /// W017: `cart[p.id]` or `cart.value[p.id]` in a row reads one entry of a whole object, so every write to it
    /// re-runs every row. `box.get(key)` re-runs only the row whose entry changed (`Object.is`). A box read gets the
    /// safe autofix; a prop needs the parent to pass the box, which the compiler can't do from here.
    fn entry_reads(&mut self, cb: &Expression<'_>, items: &[SymbolId]) {
        let mut reads = EntryReads { a: self, items, depth: 0, child: None, found: Vec::new() };
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
            let name = hit.boxed.map(|b| self.text(b)).unwrap_or_else(|| whole.rsplit('.').next().unwrap_or(&whole));
            // Passed straight to a child component (`<Row live={live.value[s.id]} />`): the child's reads of that
            // prop are what re-run, so say where the entry should be read.
            let child = found.iter().filter(|h| self.text(h.whole) == whole).find_map(|h| h.child.as_ref());
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
                    .map(|h| Edit { start: h.read.start, end: h.read.end, text: format!("{name}.get({})", self.text(h.index)) })
                    .collect();
                // A box that arrived as a prop is only probably a box (`.value` on a prop), so the edit is a suggestion.
                d = d.with_fix(Fix { description: format!("Read entries with `{name}.get(…)`"), safe: hit.local, edits });
            }
            self.plan.diagnostics.push(d);
        }
    }

    /// Facts for the project view: a list keyed over a prop of an enclosing component (`items.map` or
    /// `props.items.map`).
    fn keyed_prop(&mut self, sym: SymbolId, member: Option<&str>, span: Span) {
        let prop = match self.plan.rewrites.get(&sym) {
            Some(Rewrite::Prop { path, .. }) if path.len() == 1 => Some(path[0].clone()),
            _ => None,
        };
        let Some(comp) = self.comps.iter().rev().find(|c| c.prop_syms.contains(&sym)) else { return };
        let prop = prop.or_else(|| (comp.props_param == Some(sym)).then(|| member.map(String::from)).flatten());
        if let (Some(component), Some(prop)) = (comp.name.clone(), prop) {
            let (line, _) = line_col(self.source, span.start);
            self.plan.facts.keyed_props.push(KeyedProp { component, prop, line });
        }
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
                    for (_, component, import, prop) in self.box_props.iter().filter(|(b, ..)| *b == sym) {
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

impl<'a, 's> Visit<'a> for Analyzer<'s> {
    fn visit_statement(&mut self, it: &Statement<'a>) {
        if let Statement::VariableDeclaration(d) = it
            && self.body_level().is_some()
        {
            for declarator in &d.declarations {
                if d.kind == VariableDeclarationKind::Const && self.const_written(declarator) {
                    continue;
                }
                self.try_alias(declarator);
            }
        }
        walk::walk_statement(self, it);
    }

    fn visit_variable_declarator(&mut self, it: &VariableDeclarator<'a>) {
        if self.plan.aliases.contains(&key(it.span)) {
            // Applied at each read (`transform`), as a parameter's are, so reads in a default are live too.
            self.nested(|s| s.visit_binding_pattern(&it.id));
            return;
        }
        if self.plan.aliases_refused.contains(&key(it.span)) {
            return;
        }
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
        if body_level
            && let (Some((n, Some(sym))), Some(Expression::CallExpression(call))) = (&name, init)
            && callee_name(call) == Some("untrack")
            && let Some(arg) = call.arguments.first().and_then(|a| a.as_expression())
        {
            let mut reactive = Reactive { a: self, found: false };
            reactive.visit_expression(arg);
            if reactive.found {
                let snap = Snapshot { sym: *sym, name: n.clone(), callee: call.callee.span(), call: call.span, jsx: Vec::new(), other: false };
                self.comps.last_mut().unwrap().snapshots.push(snap);
            }
        }
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
        if let Some(name) = name.filter(|n| is_component_name(n))
            && it.body.is_some()
        {
            self.enter_component(name, it.span, &it.params, |s| walk::walk_function(s, it, flags));
        } else {
            self.nested(|s| walk::walk_function(s, it, flags));
        }
    }

    fn visit_arrow_function_expression(&mut self, it: &ArrowFunctionExpression<'a>) {
        let name = self.pending_name.take();
        if let Some(name) = name.filter(|n| is_component_name(n)) {
            self.enter_component(name, it.span, &it.params, |s| walk::walk_arrow_function_expression(s, it));
        } else {
            self.nested(|s| walk::walk_arrow_function_expression(s, it));
        }
    }

    /// Parameter defaults are applied on every read (`transform`), so reads in them are live, not setup reads.
    fn visit_formal_parameters(&mut self, it: &FormalParameters<'a>) {
        self.nested(|s| walk::walk_formal_parameters(s, it));
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

    fn visit_jsx_expression_container(&mut self, it: &JSXExpressionContainer<'a>) {
        if self.comps.last().is_some_and(|c| c.fn_depth == 0)
            && let Some(e) = it.expression.as_expression()
        {
            self.scan_component_entries(e, 0);
        }
        walk::walk_jsx_expression_container(self, it);
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
        for attr in &it.attributes {
            self.bound_attribute(attr, intrinsic);
        }
        if intrinsic {
            for attr in &it.attributes {
                if let JSXAttributeItem::Attribute(a) = attr
                    && let Some(JSXAttributeValue::ExpressionContainer(c)) = &a.value
                    && let Some(Expression::Identifier(id)) = c.expression.as_expression()
                {
                    self.bare_box(id);
                }
            }
        } else {
            let component = jsx_name(&it.name);
            let import = match &it.name {
                JSXElementName::IdentifierReference(r) => symbol_of(self.scoping, r).and_then(|s| self.imports.get(&s)),
                _ => None,
            };
            let (component, import) = match import {
                Some((spec, imported)) => (imported.clone(), Some(spec.clone())),
                None => (component, None),
            };
            for attr in &it.attributes {
                let JSXAttributeItem::Attribute(a) = attr else { continue };
                self.call_prop(a, &component);
                self.bound_prop(a);
                if let (JSXAttributeName::Identifier(n), Some(JSXAttributeValue::ExpressionContainer(c))) = (&a.name, &a.value)
                    && let Some((root, _)) = c.expression.as_expression().and_then(chain_root_member)
                    && let Some(sym) = symbol_of(self.scoping, root).filter(|s| self.boxes.contains(s))
                {
                    self.box_props.push((sym, component.clone(), import.clone(), n.name.to_string()));
                }
            }
        }
        walk::walk_jsx_opening_element(self, it);
    }

    fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
        let Some(sym) = symbol_of(self.scoping, it) else { return };
        self.ref_spans.entry(sym).or_default().push(it.span);
        if let Some(c) = self.comps.last_mut()
            && let Some(snap) = c.snapshots.iter_mut().find(|s| s.sym == sym)
        {
            if c.jsx_depth > 0 && c.fn_depth == 0 {
                snap.jsx.push(it.span);
            } else {
                snap.other = true;
            }
        }
        // A rest parameter is a live view: holding it reads nothing (`rest.x` is reported as a member read).
        if self.body_level().is_some_and(|c| c.prop_syms.contains(&sym)) && !self.is_rest(sym) {
            self.report_body_read(it.span, it.name.as_str());
        }
    }

    fn visit_import_declaration(&mut self, it: &ImportDeclaration<'a>) {
        for spec in it.specifiers.iter().flatten() {
            let (local, imported) = match spec {
                ImportDeclarationSpecifier::ImportSpecifier(s) => (&s.local, s.imported.name().to_string()),
                ImportDeclarationSpecifier::ImportDefaultSpecifier(s) => (&s.local, "default".to_string()),
                ImportDeclarationSpecifier::ImportNamespaceSpecifier(_) => continue,
            };
            if let Some(sym) = binding_symbol(local) {
                self.imports.insert(sym, (it.source.value.to_string(), imported));
            }
        }
    }

    fn visit_static_member_expression(&mut self, it: &StaticMemberExpression<'a>) {
        if !self.assign_target
            && let Expression::Identifier(id) = &it.object
            && let Some(sym) = symbol_of(self.scoping, id)
            && self.is_rest(sym)
            && self.body_level().is_some_and(|c| c.prop_syms.contains(&sym))
        {
            self.report_body_read(it.span, self.text(it.span));
        }
        if it.property.name == "children"
            && !self.assign_target
            && let Expression::Identifier(id) = &it.object
            && let Some(sym) = symbol_of(self.scoping, id)
            && let Some(i) = self.comps.iter().rposition(|c| c.props_param == Some(sym))
        {
            let props = id.name.to_string();
            let ctx = self.comps.remove(i);
            let ctx_span = ctx.span;
            let local = self.children_local(&ctx, &props);
            self.comps.insert(i, ctx);
            self.plan.children_reads.insert(key(it.span), (local, key(ctx_span)));
        }
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

    fn visit_simple_assignment_target(&mut self, it: &SimpleAssignmentTarget<'a>) {
        self.props_write(it);
        walk::walk_simple_assignment_target(self, it);
    }

    fn visit_assignment_target_property_identifier(&mut self, it: &AssignmentTargetPropertyIdentifier<'a>) {
        if symbol_of(self.scoping, &it.binding).is_some_and(|s| self.plan.rewrites.contains_key(&s)) {
            let name = it.binding.name.to_string();
            self.reassigned(it.span, &name, "a destructuring assignment");
        }
        walk::walk_assignment_target_property_identifier(self, it);
    }

    fn visit_call_expression(&mut self, it: &CallExpression<'a>) {
        if self.is_bind(it) && !self.plan.bound.contains(&key(it.span)) {
            self.plan.diagnostics.push(Diagnostic::new(
                self.source,
                "W061",
                Severity::Error,
                (it.span.start, it.span.end),
                "`bind(box)` only means something as a component prop's whole value.",
                "Write `<Card person={bind(name)} />`, with `name` a box. A form element takes `value` and `onChange`.",
            ));
        }
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
        if callee_name(it) == Some("derived")
            && self.body_level().is_some()
            && let Some(arg) = it.arguments.first().and_then(|a| a.as_expression())
        {
            // The callback's own body is the reactive position: depth -1 so entering it lands on 0.
            self.scan_component_entries(arg, -1);
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

/// Whether an expression reads anything reactive the compiler can see: a prop, a list item, a box, or `.value`.
struct Reactive<'x, 's> {
    a: &'x Analyzer<'s>,
    found: bool,
}

impl<'a, 'x, 's> Visit<'a> for Reactive<'x, 's> {
    fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
        if let Some(sym) = symbol_of(self.a.scoping, it)
            && (self.a.plan.rewrites.contains_key(&sym)
                || self.a.boxes.contains(&sym)
                || self.a.comps.iter().any(|c| c.prop_syms.contains(&sym)))
        {
            self.found = true;
        }
    }
    fn visit_static_member_expression(&mut self, it: &StaticMemberExpression<'a>) {
        if it.property.name == "value" {
            self.found = true;
        }
        walk::walk_static_member_expression(self, it);
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

impl<'x, 's> EntryReads<'x, 's> {
    fn is_prop(&self, id: &IdentifierReference<'_>) -> bool {
        symbol_of(self.a.scoping, id).is_some_and(|s| self.a.comps.iter().any(|c| c.prop_syms.contains(&s)))
    }
    fn reads_item(&self, e: &Expression<'_>) -> bool {
        reads_any(self.a.scoping, e, |s| self.items.contains(&s))
    }
}

/// Whether `e` reads an identifier whose symbol passes `hit`.
fn reads_any(scoping: &Scoping, e: &Expression<'_>, hit: impl Fn(SymbolId) -> bool) -> bool {
    struct Uses<'z, F> {
        scoping: &'z Scoping,
        hit: F,
        found: bool,
    }
    impl<'a, 'z, F: Fn(SymbolId) -> bool> Visit<'a> for Uses<'z, F> {
        fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
            self.found |= symbol_of(self.scoping, it).is_some_and(&self.hit);
        }
    }
    let mut u = Uses { scoping, hit, found: false };
    u.visit_expression(e);
    u.found
}

impl<'a, 'x, 's> Visit<'a> for EntryReads<'x, 's> {
    fn visit_computed_member_expression(&mut self, it: &ComputedMemberExpression<'a>) {
        if self.depth == 1 && self.reads_item(&it.expression) {
            let whole = match it.object.without_parentheses() {
                Expression::Identifier(id) if self.is_prop(id) => Some((id.span, None, false)),
                Expression::StaticMemberExpression(m) => match &m.object {
                    Expression::Identifier(id)
                        if m.property.name == "value"
                            && symbol_of(self.a.scoping, id).is_some_and(|s| self.a.boxes.contains(&s)) =>
                    {
                        Some((m.span, Some(id.span), true))
                    }
                    Expression::Identifier(id) if m.property.name == "value" && self.is_prop(id) => {
                        Some((m.span, Some(id.span), false))
                    }
                    Expression::Identifier(id)
                        if symbol_of(self.a.scoping, id).is_some_and(|s| self.a.comps.iter().any(|c| c.props_param == Some(s))) =>
                    {
                        Some((m.span, None, false))
                    }
                    _ => None,
                },
                _ => None,
            };
            if let Some((whole, boxed, local)) = whole {
                let child = self.child.clone();
                self.found.push(RowEntry { read: it.span, whole, boxed, local, index: it.expression.span(), child });
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

impl<'a, 'x, 's> Visit<'a> for ComponentEntryReads<'x, 's> {
    fn visit_computed_member_expression(&mut self, it: &ComputedMemberExpression<'a>) {
        if self.depth == 0
            && let Expression::StaticMemberExpression(m) = it.object.without_parentheses()
            && m.property.name == "value"
        {
            let scoping = self.a.scoping;
            let is_prop = |id: &IdentifierReference<'_>| symbol_of(scoping, id).is_some_and(|s| self.ctx.prop_syms.contains(&s));
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
                    Expression::Identifier(p) if symbol_of(scoping, p).is_some() && symbol_of(scoping, p) == self.ctx.props_param => {
                        Some((inner.span, None, false))
                    }
                    _ => None,
                },
                _ => None,
            };
            if let Some((span, sym, local)) = boxed
                && reads_any(scoping, &it.expression, |s| self.ctx.prop_syms.contains(&s) && Some(s) != sym)
            {
                self.found.push(EntryHit { read: it.span, whole: m.span, boxed: span, local, index: it.expression.span() });
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

/// Symbols initialized with a reactive box: `state(…)`, `state.linked(…)`, `derived(…)`, `resource(…)`, and the
/// weft/browser values (`online()`, `media(q)` …).
struct Boxes<'s> {
    scoping: &'s Scoping,
    set: HashSet<SymbolId>,
    /// weft/browser value imports.
    browser: HashSet<SymbolId>,
}

impl<'a, 's> Visit<'a> for Boxes<'s> {
    fn visit_variable_declarator(&mut self, it: &VariableDeclarator<'a>) {
        if let (BindingPattern::BindingIdentifier(id), Some(Expression::CallExpression(call))) =
            (&it.id, it.init.as_ref().map(|e| e.without_parentheses()))
        {
            let boxed = match &call.callee {
                Expression::Identifier(c) => {
                    matches!(c.name.as_str(), "state" | "derived" | "resource")
                        || symbol_of(self.scoping, c).is_some_and(|s| self.browser.contains(&s))
                }
                Expression::StaticMemberExpression(m) => {
                    matches!(&m.object, Expression::Identifier(o) if o.name == "state") && m.property.name == "linked"
                }
                _ => false,
            };
            if boxed && let Some(sym) = binding_symbol(id) {
                self.set.insert(sym);
            }
        }
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
