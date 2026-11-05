//! Read-only pass: find components, their props and boxes, JSX lists, and the diagnostics
//! (W001, W005, W006, W010, W011, W013, W014, W015, W016, W017, W018, W019, W020, W040, W041).
//! The @weft-js/core/browser diagnostics live in `browser`. Produces a `Plan` that `transform`
//! applies to the same AST, and the per-file facts `weft check` joins across files (`project`).

mod aliases;
mod body_reads;
mod component_entries;
mod context;
mod early_returns;
mod finish;
mod handler_mutations;
mod handler_values;
mod lists;
mod numeric_facts;
mod numeric_jsx;
mod props;
mod react;
mod row_entries;
mod support;
mod visitor;

use std::collections::{HashMap, HashSet};

use oxc_ast::ast::{
    ArrowFunctionBody, BindingIdentifier, CallExpression, ChainElement, Expression,
    FormalParameters, IdentifierReference, JSXAttributeItem, JSXAttributeName, JSXChild,
    JSXElement, JSXElementName, Program, PropertyKey, Statement,
};
use oxc_ast_visit::Visit;
use oxc_semantic::{Scoping, SymbolId};
use oxc_span::Span;

use crate::diag::Diagnostic;
use crate::project::Facts;

use row_entries::reads_any;
use support::{Boxes, EarlyReturn, MemberUse, Reactive, spread_of_param};

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
    Rest {
        props: String,
        exclude: Vec<String>,
        local: String,
        component: SpanKey,
    },
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
    let mut boxes = Boxes {
        scoping,
        set: HashSet::new(),
        browser: crate::browser::value_imports(program),
        arrays: HashSet::new(),
    };
    boxes.visit_program(program);
    let mut a = Analyzer {
        scoping,
        source,
        plan: Plan::default(),
        boxes: boxes.set,
        arrays: boxes.arrays,
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
        react_imports: react::imports(program),
        react_wrappers: HashSet::new(),
        box_props: Vec::new(),
        defaulted: HashSet::new(),
    };
    a.react_wrappers = react::wrappers(program, scoping, &a.react_imports);
    a.visit_program(program);
    a.plan
        .diagnostics
        .extend(numeric_jsx::diagnostics(program, scoping, source));
    a.finish()
}

fn symbol_of(scoping: &Scoping, id: &IdentifierReference<'_>) -> Option<SymbolId> {
    id.reference_id
        .get()
        .and_then(|r| scoping.get_reference(r).symbol_id())
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
    let Expression::StaticMemberExpression(m) = &call.callee else {
        return None;
    };
    if m.property.name != "map" || call.arguments.is_empty() {
        return None;
    }
    let cb = call.arguments[0].as_expression()?.without_parentheses();
    matches!(
        cb,
        Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_)
    )
    .then_some(cb)
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
        Expression::ConditionalExpression(c) => {
            returns_jsx(&c.consequent) || returns_jsx(&c.alternate)
        }
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
                            row_roots(e, out);
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
fn chain_root_member<'b, 'a>(
    mut e: &'b Expression<'a>,
) -> Option<(&'b IdentifierReference<'a>, Option<&'b str>)> {
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
    /// See `Boxes::arrays`.
    arrays: HashSet<SymbolId>,
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
    /// Hoisted value imports, including namespaces; project facts keep their existing import map.
    react_imports: HashMap<SymbolId, (String, String)>,
    /// Local useX functions with a resolved hook call, excluding reassigned bindings.
    react_wrappers: HashSet<SymbolId>,
    /// Box symbol passed as a component prop: (box, component name, import, prop name).
    box_props: Vec<(SymbolId, String, Option<String>, String)>,
    /// Destructured props with a default: their read isn't a plain path.
    defaulted: HashSet<SymbolId>,
}
