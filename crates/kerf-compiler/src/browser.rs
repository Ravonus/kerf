//! Browser events and subscriptions (PLAN §4.2, research 07 §9.3): W050–W052, W054, W056. Its own read-only pass
//! over the program, after `analyze`.
//!
//! - W050: a raw `addEventListener`, `setInterval`, `new WebSocket` or `new EventSource` in a component with no
//!   matching cleanup. Listeners and intervals in an owned place get an edit to `on`/`interval` (@kerf/core/browser).
//! - W051: a @kerf/core/browser value, listener or interval created where there is no owner: module scope, a timer, a
//!   promise callback, an event handler, or after `await`.
//! - W052: `watch(() => tick.value, m => { list.value = [...list.value, m] })`: a stream folded by hand into a
//!   component's `state`, which is lost when the component unmounts (the v3 bug). A stream is a call of something
//!   imported from a server module.
//! - W054: `media(q)` without `ssr` in a file that is server-rendered. `online`, `visible` and `lifecycle` have
//!   server values that match a first paint (`true`, `true`, `'active'`); a media query has none.
//! - W056: `watch(() => live.value, v => { s.value = v })`: a live value copied into state.

mod context;
mod diagnostics;
mod visitor;

use std::collections::{HashMap, HashSet};

use oxc_ast::ast::{
    ArrowFunctionBody, BindingIdentifier, Expression, ImportDeclarationSpecifier, Program,
    Statement,
};
use oxc_ast_visit::Visit;
use oxc_semantic::{Scoping, SymbolId};
use oxc_span::{GetSpan, Span};

use crate::diag::{Diagnostic, Fix};

pub const MODULE: &str = "@kerf/core/browser";
const VALUES: [&str; 4] = ["online", "visible", "lifecycle", "media"];

/// Whether the file is server-rendered, for W054: `Some(true)` for SSR and hydratable output, `None` when only
/// checking (it may be), `Some(false)` for a client-only build.
pub type Ssr = Option<bool>;

/// Local bindings of @kerf/core/browser's values (`online`, `visible`, `lifecycle`, `media`): their results are boxes.
pub fn value_imports(program: &Program<'_>) -> HashSet<SymbolId> {
    imports(program)
        .into_iter()
        .filter(|(_, (name, _))| VALUES.contains(&name.as_str()))
        .map(|(s, _)| s)
        .collect()
}

/// @kerf/core/browser import bindings: symbol → (imported name, local name).
fn imports(program: &Program<'_>) -> HashMap<SymbolId, (String, String)> {
    let mut out = HashMap::new();
    for stmt in &program.body {
        let Statement::ImportDeclaration(d) = stmt else {
            continue;
        };
        if d.source.value != MODULE {
            continue;
        }
        for spec in d.specifiers.iter().flatten() {
            if let ImportDeclarationSpecifier::ImportSpecifier(s) = spec
                && let Some(sym) = s.local.symbol_id.get()
            {
                out.insert(
                    sym,
                    (s.imported.name().to_string(), s.local.name.to_string()),
                );
            }
        }
    }
    out
}

pub fn check(program: &Program<'_>, scoping: &Scoping, source: &str, ssr: Ssr) -> Vec<Diagnostic> {
    let imports = imports(program);
    let mut bound = Bound(HashMap::new());
    bound.visit_program(program);
    let mut last_import = None;
    let mut browser_import = None;
    let mut server_imports = HashSet::new();
    for stmt in &program.body {
        if let Statement::ImportDeclaration(d) = stmt {
            last_import = Some(d.span.end);
            let from = d.source.value.as_str();
            if d.import_kind.is_value() && (from.contains("/server/") || from.contains(".server")) {
                for s in d.specifiers.iter().flatten() {
                    let local = match s {
                        ImportDeclarationSpecifier::ImportSpecifier(s) => &s.local,
                        ImportDeclarationSpecifier::ImportDefaultSpecifier(s) => &s.local,
                        ImportDeclarationSpecifier::ImportNamespaceSpecifier(s) => &s.local,
                    };
                    if let Some(sym) = local.symbol_id.get() {
                        server_imports.insert(sym);
                    }
                }
            }
            if d.source.value == MODULE && d.import_kind.is_value() {
                let last = d
                    .specifiers
                    .iter()
                    .flatten()
                    .rfind(|s| matches!(s, ImportDeclarationSpecifier::ImportSpecifier(_)));
                if let Some(s) = last {
                    browser_import = Some(s.span().end);
                }
            }
        }
    }
    let mut c = Checker {
        scoping,
        source,
        ssr,
        imports,
        bound: bound.0,
        last_import,
        browser_import,
        live: HashSet::new(),
        server_imports,
        fns: Vec::new(),
        next_role: None,
        pending_name: None,
        comps: Vec::new(),
        out: Vec::new(),
    };
    c.visit_program(program);
    c.out
}

/// Every binding name in the file and how often it is bound, to tell whether `on`/`interval` is free for a fix.
struct Bound(HashMap<String, u32>);

impl<'a> Visit<'a> for Bound {
    fn visit_binding_identifier(&mut self, it: &BindingIdentifier<'a>) {
        *self.0.entry(it.name.to_string()).or_default() += 1;
    }
}

/// Whether code in a function runs with an owner.
#[derive(Clone, Copy, PartialEq)]
enum Role {
    /// A component body, or a callback kerf runs under an owner (`createRoot`, `watch`, `onMount`, `derived` …).
    Owned,
    /// Runs later with no owner: the reason is in the message.
    Unowned(&'static str),
    /// A plain function: who calls it decides.
    Unknown,
    /// An inline callback to some other call (`xs.forEach(…)`): runs where its caller does.
    Inherit,
}

struct FnCtx {
    role: Role,
    /// An `await` has run in this function, so what follows has lost its owner.
    awaited: bool,
}

#[derive(Default)]
struct Comp {
    fn_depth: usize,
    /// `addEventListener` calls: (call span, target text, type text, the fix).
    listens: Vec<(Span, String, String, Option<Fix>)>,
    removes: HashSet<(String, String)>,
    intervals: Vec<(Span, Option<Fix>)>,
    clears: bool,
    sockets: Vec<(Span, String)>,
    closes: bool,
}

struct Checker<'s> {
    scoping: &'s Scoping,
    source: &'s str,
    ssr: Ssr,
    imports: HashMap<SymbolId, (String, String)>,
    bound: HashMap<String, u32>,
    last_import: Option<u32>,
    /// The end of the last specifier of a @kerf/core/browser import, where a fix adds a name.
    browser_import: Option<u32>,
    /// Symbols holding a live value: a @kerf/core/browser value, or `query.live(…)`.
    live: HashSet<SymbolId>,
    /// Bindings imported from a server module: calling one in a component reads a query or a stream.
    server_imports: HashSet<SymbolId>,
    fns: Vec<FnCtx>,
    next_role: Option<Role>,
    pending_name: Option<String>,
    comps: Vec<Comp>,
    out: Vec<Diagnostic>,
}

fn is_component_name(name: &str) -> bool {
    name.starts_with(|c: char| c.is_ascii_uppercase())
}

fn is_fn(e: &Expression<'_>) -> bool {
    matches!(
        e.without_parentheses(),
        Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_)
    )
}

/// `setTimeout` and `window.setTimeout` → `setTimeout`; `x.then` → `then`.
fn call_name<'b, 'a>(callee: &'b Expression<'a>) -> Option<(&'b str, Option<&'b Expression<'a>>)> {
    match callee.without_parentheses() {
        Expression::Identifier(id) => Some((id.name.as_str(), None)),
        Expression::StaticMemberExpression(m) => Some((m.property.name.as_str(), Some(&m.object))),
        _ => None,
    }
}

const GLOBALS: [&str; 4] = ["window", "globalThis", "self", "document"];

/// The one expression a function returns: `() => x`, `() => { return x }` or `() => { x }`.
fn single_expression<'b, 'a>(f: &'b Expression<'a>) -> Option<&'b Expression<'a>> {
    let statements = match f.without_parentheses() {
        Expression::ArrowFunctionExpression(f) => match &f.body {
            ArrowFunctionBody::FunctionBody(body) => &body.statements,
            body => {
                return body
                    .as_expression()
                    .map(oxc_ast::ast::Expression::without_parentheses);
            }
        },
        Expression::FunctionExpression(f) => &f.body.as_ref()?.statements,
        _ => return None,
    };
    match statements.as_slice() {
        [Statement::ExpressionStatement(s)] => Some(s.expression.without_parentheses()),
        [Statement::ReturnStatement(r)] => r
            .argument
            .as_ref()
            .map(oxc_ast::ast::Expression::without_parentheses),
        _ => None,
    }
}
